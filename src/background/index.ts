import {
  addPageVisit,
  createBrowserSession,
  endExpiredSessions
} from '../shared/session';
import {
  deleteAllSearchSessions,
  deleteSearchSession,
  deleteSearchSessions,
  importLinkSpaceData,
  loadData,
  saveData
} from '../shared/storage';
import type { LinkSpaceData, RuntimeMessage, SearchSession } from '../shared/types';

type RuntimeResponse =
  | { ok: true; data: LinkSpaceData }
  | { ok: false; error: string };

const INVALID_DATA_MESSAGE = 'Invalid Link Space data';
const RECORDABLE_TRANSITION_TYPES = new Set(['link', 'form_submit', 'reload']);
const REDIRECT_QUALIFIERS = new Set(['server_redirect', 'client_redirect']);
const HISTORY_QUALIFIERS = new Set(['forward_back']);
const DIRECT_TRANSITION_TYPES = new Set([
  'typed',
  'auto_bookmark',
  'generated',
  'keyword',
  'keyword_generated'
]);
const sessionByTab = new Map<number, string>();
const currentNodeByTab = new Map<number, string>();
const navigationQueueByTab = new Map<number, Promise<void>>();

chrome.webNavigation.onCommitted.addListener((details) => {
  enqueueNavigation(details);
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  enqueueNavigation(details);
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  void handleRuntimeMessage(message).then(sendResponse);
  return true;
});

chrome.tabs.onCreated.addListener((tab) => {
  inheritNavigationStateFromOpener(tab);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void handleTabRemoved(tabId);
});

function enqueueNavigation(details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) {
  if (details.frameId !== 0 || details.tabId < 0) {
    return;
  }

  const previous = navigationQueueByTab.get(details.tabId) ?? Promise.resolve();
  const next = previous
    .catch((error) => {
      console.error('Previous navigation task failed', error);
    })
    .then(() => handleNavigation(details));

  navigationQueueByTab.set(details.tabId, next);
  void next.finally(() => {
    if (navigationQueueByTab.get(details.tabId) === next) {
      navigationQueueByTab.delete(details.tabId);
    }
  }).catch((error) => {
    console.error('Navigation task failed', error);
  });
}

async function handleNavigation(details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) {
  if (details.frameId !== 0 || details.tabId < 0) {
    return;
  }

  const now = new Date().toISOString();
  const loadedData = await loadData();
  let data = endExpiredSessions(loadedData, now);
  const expirationChanged = hasExpirationChanges(loadedData, data);

  if (data.settings.recordingPaused) {
    data = endActiveSessionsForTab(data, details.tabId, now);
    sessionByTab.delete(details.tabId);
    currentNodeByTab.delete(details.tabId);
    if (expirationChanged || hasSessionEndChanges(loadedData, data)) {
      await saveData(data);
    }
    return;
  }

  if (isHistoryNavigation(details)) {
    const restoredData = restoreCurrentNodeFromHistory(data, details.tabId, details.url);
    if (restoredData) {
      await saveNavigationData(restoredData, details.tabId);
    } else if (expirationChanged) {
      await saveNavigationData(data, details.tabId);
    }
    return;
  }

  if (!isRecordableTransition(details)) {
    data = endActiveSessionsForTab(data, details.tabId, now);
    sessionByTab.delete(details.tabId);
    currentNodeByTab.delete(details.tabId);
    if (expirationChanged || hasSessionEndChanges(loadedData, data)) {
      await saveNavigationData(data, details.tabId);
    }
    return;
  }

  const source = resolveNavigationSource(data, details.tabId);

  if (!source) {
    const tab = await chrome.tabs.get(details.tabId);
    const result = createBrowserSession(data, {
      url: details.url,
      title: tab.title || details.url,
      tabId: details.tabId,
      now
    });
    data = result.data;
    sessionByTab.set(details.tabId, result.sessionId);
    currentNodeByTab.set(details.tabId, data.sessions[result.sessionId].rootNodeId);
    await saveNavigationData(data, details.tabId);
    return;
  }

  const restoredData = restoreExistingSessionNodeForNavigation(data, source.sessionId, details.tabId, details.url);
  if (restoredData) {
    await saveNavigationData(restoredData, details.tabId);
    return;
  }

  const tab = await chrome.tabs.get(details.tabId);
  const result = await savePageVisit(details.tabId, {
    sessionId: source.sessionId,
    fromNodeId: source.fromNodeId,
    url: details.url,
    title: tab.title || details.url,
    now,
    isSearchResultClick: source.fromNode.depth === 0
  });

  if (result) {
    currentNodeByTab.set(details.tabId, result.nodeId);
  }
}

async function handleRuntimeMessage(message: RuntimeMessage): Promise<RuntimeResponse> {
  if (message.type === 'GET_DATA') {
    const now = new Date().toISOString();
    const loadedData = await loadData();
    const data = endExpiredSessions(loadedData, now);
    if (hasExpirationChanges(loadedData, data)) {
      await saveData(data);
    }
    return { ok: true, data };
  }

  if (message.type === 'SET_RECORDING_PAUSED') {
    const now = new Date().toISOString();
    const data = await loadData();
    let updatedData: LinkSpaceData = {
      ...data,
      settings: {
        ...data.settings,
        recordingPaused: message.paused
      }
    };

    if (message.paused) {
      updatedData = endAllActiveSessions(updatedData, now);
      sessionByTab.clear();
      currentNodeByTab.clear();
    }

    await saveData(updatedData);
    return { ok: true, data: updatedData };
  }

  if (message.type === 'IMPORT_DATA') {
    try {
      const importedData = importLinkSpaceData(JSON.stringify(message.payload));
      await saveData(importedData);
      sessionByTab.clear();
      currentNodeByTab.clear();
      return { ok: true, data: importedData };
    } catch {
      return {
        ok: false,
        error: INVALID_DATA_MESSAGE
      };
    }
  }

  if (message.type === 'DELETE_SESSION') {
    const data = await loadData();
    const updatedData = deleteSearchSession(data, message.sessionId);
    await saveData(updatedData);
    sessionByTab.clear();
    currentNodeByTab.clear();
    return { ok: true, data: updatedData };
  }

  if (message.type === 'DELETE_SESSIONS') {
    const data = await loadData();
    const updatedData = deleteSearchSessions(data, message.sessionIds);
    await saveData(updatedData);
    sessionByTab.clear();
    currentNodeByTab.clear();
    return { ok: true, data: updatedData };
  }

  if (message.type === 'DELETE_ALL_SESSIONS') {
    const data = await loadData();
    const updatedData = deleteAllSearchSessions(data);
    await saveData(updatedData);
    sessionByTab.clear();
    currentNodeByTab.clear();
    return { ok: true, data: updatedData };
  }

  return { ok: false, error: 'Unsupported message' };
}

async function handleTabRemoved(tabId: number) {
  const now = new Date().toISOString();
  const data = endActiveSessionsForTab(await loadData(), tabId, now);

  sessionByTab.delete(tabId);
  currentNodeByTab.delete(tabId);
  await saveData(data);
}

async function saveNavigationData(data: LinkSpaceData, tabId: number): Promise<boolean> {
  const latestData = await loadData();
  if (latestData.settings.recordingPaused) {
    sessionByTab.delete(tabId);
    currentNodeByTab.delete(tabId);
    return false;
  }

  await saveData(data);
  return true;
}

async function savePageVisit(
  tabId: number,
  input: {
    sessionId: string;
    fromNodeId: string;
    url: string;
    title: string;
    now: string;
    isSearchResultClick: boolean;
  }
): Promise<{ nodeId: string } | undefined> {
  const latestData = await loadData();
  const latestSession = latestData.sessions[input.sessionId];
  const latestSourceNode = latestData.nodes[input.fromNodeId];

  if (
    latestData.settings.recordingPaused ||
    latestSession?.status !== 'active' ||
    (latestSession.tabId !== tabId && sessionByTab.get(tabId) !== input.sessionId) ||
    !latestSession.nodeIds.includes(input.fromNodeId) ||
    latestSourceNode?.sessionId !== input.sessionId
  ) {
    sessionByTab.delete(tabId);
    currentNodeByTab.delete(tabId);
    return undefined;
  }

  const result = addPageVisit(latestData, {
    ...input,
    isSearchResultClick: latestSourceNode.depth === 0
  });
  await saveData(result.data);
  return { nodeId: result.nodeId };
}

function inheritNavigationStateFromOpener(tab: chrome.tabs.Tab) {
  if (typeof tab.id !== 'number' || typeof tab.openerTabId !== 'number') {
    return;
  }

  const openerSessionId = sessionByTab.get(tab.openerTabId);
  const openerNodeId = currentNodeByTab.get(tab.openerTabId);
  if (!openerSessionId || !openerNodeId) {
    return;
  }

  sessionByTab.set(tab.id, openerSessionId);
  currentNodeByTab.set(tab.id, openerNodeId);
}

function isHistoryNavigation(
  details: chrome.webNavigation.WebNavigationTransitionCallbackDetails
): boolean {
  return details.transitionQualifiers.some((qualifier) => HISTORY_QUALIFIERS.has(qualifier));
}

function isRecordableTransition(
  details: chrome.webNavigation.WebNavigationTransitionCallbackDetails
): boolean {
  if (DIRECT_TRANSITION_TYPES.has(details.transitionType)) {
    return false;
  }

  return (
    RECORDABLE_TRANSITION_TYPES.has(details.transitionType) ||
    details.transitionQualifiers.some((qualifier) => REDIRECT_QUALIFIERS.has(qualifier))
  );
}

function resolveNavigationSource(
  data: LinkSpaceData,
  tabId: number
):
  | {
      sessionId: string;
      fromNodeId: string;
      fromNode: LinkSpaceData['nodes'][string];
    }
  | undefined {
  const trackedSessionId = sessionByTab.get(tabId);
  const trackedNodeId = currentNodeByTab.get(tabId);
  const trackedSession = trackedSessionId ? data.sessions[trackedSessionId] : undefined;
  const trackedNode = trackedNodeId ? data.nodes[trackedNodeId] : undefined;

  if (
    trackedSessionId &&
    trackedNodeId &&
    trackedSession?.status === 'active' &&
    (trackedSession.tabId === tabId || sessionByTab.get(tabId) === trackedSessionId) &&
    trackedNode
  ) {
    return {
      sessionId: trackedSessionId,
      fromNodeId: trackedNodeId,
      fromNode: trackedNode
    };
  }

  const fallbackSession = findActiveSessionByTab(data, tabId);
  if (!fallbackSession) {
    return undefined;
  }

  const fallbackNodeId = fallbackSession.currentNodeId ?? fallbackSession.nodeIds.at(-1) ?? fallbackSession.rootNodeId;
  const fallbackNode = data.nodes[fallbackNodeId] ?? data.nodes[fallbackSession.rootNodeId];
  if (!fallbackNode) {
    return undefined;
  }

  sessionByTab.set(tabId, fallbackSession.id);
  currentNodeByTab.set(tabId, fallbackNode.id);

  return {
    sessionId: fallbackSession.id,
    fromNodeId: fallbackNode.id,
    fromNode: fallbackNode
  };
}

function restoreCurrentNodeFromHistory(data: LinkSpaceData, tabId: number, url: string): LinkSpaceData | undefined {
  const session = findActiveSessionByTab(data, tabId);
  if (!session) {
    sessionByTab.delete(tabId);
    currentNodeByTab.delete(tabId);
    return undefined;
  }

  const node = findLatestSessionNodeByUrl(data, session, url);
  if (!node) {
    return undefined;
  }

  sessionByTab.set(tabId, session.id);
  currentNodeByTab.set(tabId, node.id);
  return setSessionCurrentNode(data, session.id, node.id);
}

function restoreExistingSessionNodeForNavigation(
  data: LinkSpaceData,
  sessionId: string,
  tabId: number,
  url: string
): LinkSpaceData | undefined {
  const session = data.sessions[sessionId];
  if (!session || session.status !== 'active' || session.tabId !== tabId) {
    return undefined;
  }

  const node = findLatestSessionNodeByUrl(data, session, url);
  if (!node) {
    return undefined;
  }

  sessionByTab.set(tabId, session.id);
  currentNodeByTab.set(tabId, node.id);
  return setSessionCurrentNode(data, session.id, node.id);
}

function setSessionCurrentNode(data: LinkSpaceData, sessionId: string, nodeId: string): LinkSpaceData {
  return {
    ...data,
    sessions: {
      ...data.sessions,
      [sessionId]: {
        ...data.sessions[sessionId],
        currentNodeId: nodeId
      }
    }
  };
}

function findLatestSessionNodeByUrl(
  data: LinkSpaceData,
  session: SearchSession,
  url: string
): LinkSpaceData['nodes'][string] | undefined {
  for (const nodeId of [...session.nodeIds].reverse()) {
    const node = data.nodes[nodeId];
    if (node && urlsReferToSamePage(node.url, url)) {
      return node;
    }
  }

  return undefined;
}

function urlsReferToSamePage(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return (
      leftUrl.origin === rightUrl.origin &&
      leftUrl.pathname === rightUrl.pathname &&
      leftUrl.search === rightUrl.search
    );
  } catch {
    return left === right;
  }
}

function findActiveSessionByTab(data: LinkSpaceData, tabId: number): SearchSession | undefined {
  return findLatestActiveSession(
    Object.values(data.sessions).filter((session) => session.tabId === tabId)
  );
}

function findLatestActiveSession(sessions: SearchSession[]): SearchSession | undefined {
  return sessions
    .filter((session) => session.status === 'active')
    .sort((a, b) => sessionTime(b) - sessionTime(a))[0];
}

function sessionTime(session: SearchSession): number {
  return new Date(session.lastActivityAt || session.startedAt).getTime();
}

function endActiveSessionsForTab(data: LinkSpaceData, tabId: number, now: string): LinkSpaceData {
  const sessions = Object.fromEntries(
    Object.entries(data.sessions).map(([sessionId, session]) => [
      sessionId,
      session.status === 'active' && session.tabId === tabId
        ? {
            ...session,
            status: 'ended' as const,
            endedAt: now
          }
        : session
    ])
  );

  return {
    ...data,
    sessions
  };
}

function endAllActiveSessions(data: LinkSpaceData, now: string): LinkSpaceData {
  const sessions = Object.fromEntries(
    Object.entries(data.sessions).map(([sessionId, session]) => [
      sessionId,
      session.status === 'active'
        ? {
            ...session,
            status: 'ended' as const,
            endedAt: now
          }
        : session
    ])
  );

  return {
    ...data,
    sessions
  };
}

function hasExpirationChanges(previous: LinkSpaceData, next: LinkSpaceData): boolean {
  return hasSessionEndChanges(previous, next);
}

function hasSessionEndChanges(previous: LinkSpaceData, next: LinkSpaceData): boolean {
  return Object.keys(previous.sessions).some((sessionId) => {
    const previousSession = previous.sessions[sessionId];
    const nextSession = next.sessions[sessionId];

    return (
      previousSession.status !== nextSession?.status || previousSession.endedAt !== nextSession.endedAt
    );
  });
}

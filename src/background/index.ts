import { parseGoogleSearch } from '../shared/google';
import {
  addPageVisit,
  createSearchSession,
  endExpiredSessions
} from '../shared/session';
import { importLinkSpaceData, loadData, saveData } from '../shared/storage';
import type { LinkSpaceData, RuntimeMessage, SearchSession } from '../shared/types';

type RuntimeResponse =
  | { ok: true; data: LinkSpaceData }
  | { ok: false; error: string };

const INVALID_DATA_MESSAGE = 'Invalid Link Space data';
const RECORDABLE_TRANSITION_TYPES = new Set(['link', 'form_submit', 'reload']);
const REDIRECT_QUALIFIERS = new Set(['server_redirect', 'client_redirect']);
const DIRECT_TRANSITION_TYPES = new Set([
  'typed',
  'auto_bookmark',
  'generated',
  'keyword',
  'keyword_generated'
]);
const sessionByTab = new Map<number, string>();
const lastNodeByTab = new Map<number, string>();
const navigationQueueByTab = new Map<number, Promise<void>>();

chrome.webNavigation.onCommitted.addListener((details) => {
  enqueueNavigation(details);
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  void handleRuntimeMessage(message).then(sendResponse);
  return true;
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
    await saveData(data);
    return;
  }

  const parsedSearch = parseGoogleSearch(details.url);
  if (parsedSearch) {
    const activeSession = findActiveSessionByTab(data, details.tabId);

    if (!activeSession || activeSession.query !== parsedSearch.query) {
      data = endActiveSessionsForTab(data, details.tabId, now);
      const result = createSearchSession(data, {
        query: parsedSearch.query,
        tabId: details.tabId,
        now
      });
      data = result.data;
      sessionByTab.set(details.tabId, result.sessionId);
      lastNodeByTab.set(details.tabId, data.sessions[result.sessionId].rootNodeId);
    } else {
      sessionByTab.set(details.tabId, activeSession.id);
      lastNodeByTab.set(details.tabId, activeSession.rootNodeId);
    }

    await saveData(data);
    return;
  }

  if (!isRecordableTransition(details)) {
    data = endActiveSessionsForTab(data, details.tabId, now);
    sessionByTab.delete(details.tabId);
    lastNodeByTab.delete(details.tabId);
    if (expirationChanged || hasSessionEndChanges(loadedData, data)) {
      await saveData(data);
    }
    return;
  }

  const source = resolveNavigationSource(data, details.tabId);

  if (!source) {
    if (expirationChanged) {
      await saveData(data);
    }
    return;
  }

  const tab = await chrome.tabs.get(details.tabId);
  const result = addPageVisit(data, {
    sessionId: source.sessionId,
    fromNodeId: source.fromNodeId,
    url: details.url,
    title: tab.title || details.url,
    now,
    isSearchResultClick: source.fromNode.depth === 0
  });

  lastNodeByTab.set(details.tabId, result.nodeId);
  await saveData(result.data);
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
    const data = await loadData();
    const updatedData: LinkSpaceData = {
      ...data,
      settings: {
        ...data.settings,
        recordingPaused: message.paused
      }
    };

    await saveData(updatedData);
    return { ok: true, data: updatedData };
  }

  if (message.type === 'IMPORT_DATA') {
    try {
      const importedData = importLinkSpaceData(JSON.stringify(message.payload));
      await saveData(importedData);
      sessionByTab.clear();
      lastNodeByTab.clear();
      return { ok: true, data: importedData };
    } catch {
      return {
        ok: false,
        error: INVALID_DATA_MESSAGE
      };
    }
  }

  return { ok: false, error: 'Unsupported message' };
}

async function handleTabRemoved(tabId: number) {
  const now = new Date().toISOString();
  const data = endActiveSessionsForTab(await loadData(), tabId, now);

  sessionByTab.delete(tabId);
  lastNodeByTab.delete(tabId);
  await saveData(data);
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
  const trackedNodeId = lastNodeByTab.get(tabId);
  const trackedSession = trackedSessionId ? data.sessions[trackedSessionId] : undefined;
  const trackedNode = trackedNodeId ? data.nodes[trackedNodeId] : undefined;

  if (
    trackedSessionId &&
    trackedNodeId &&
    trackedSession?.status === 'active' &&
    trackedSession.tabId === tabId &&
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

  const fallbackNodeId = fallbackSession.nodeIds.at(-1) ?? fallbackSession.rootNodeId;
  const fallbackNode = data.nodes[fallbackNodeId] ?? data.nodes[fallbackSession.rootNodeId];
  if (!fallbackNode) {
    return undefined;
  }

  sessionByTab.set(tabId, fallbackSession.id);
  lastNodeByTab.set(tabId, fallbackNode.id);

  return {
    sessionId: fallbackSession.id,
    fromNodeId: fallbackNode.id,
    fromNode: fallbackNode
  };
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

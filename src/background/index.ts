import { parseGoogleSearch } from '../shared/google';
import {
  addPageVisit,
  createSearchSession,
  endExpiredSessions,
  shouldStartNewSession
} from '../shared/session';
import { importLinkSpaceData, loadData, saveData } from '../shared/storage';
import type { LinkSpaceData, RuntimeMessage, SearchSession } from '../shared/types';

type RuntimeResponse =
  | { ok: true; data: LinkSpaceData }
  | { ok: false; error: string };

const INVALID_DATA_MESSAGE = 'Invalid Link Space data';
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

function enqueueNavigation(details: chrome.webNavigation.WebNavigationFramedCallbackDetails) {
  if (details.frameId !== 0 || details.tabId < 0) {
    return;
  }

  const previous = navigationQueueByTab.get(details.tabId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => handleNavigation(details));

  navigationQueueByTab.set(details.tabId, next);
  void next.finally(() => {
    if (navigationQueueByTab.get(details.tabId) === next) {
      navigationQueueByTab.delete(details.tabId);
    }
  }).catch(() => undefined);
}

async function handleNavigation(details: chrome.webNavigation.WebNavigationFramedCallbackDetails) {
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
    if (shouldStartNewSession(data, details.tabId, parsedSearch.query)) {
      const result = createSearchSession(data, {
        query: parsedSearch.query,
        tabId: details.tabId,
        now
      });
      data = result.data;
      sessionByTab.set(details.tabId, result.sessionId);
      lastNodeByTab.set(details.tabId, data.sessions[result.sessionId].rootNodeId);
    } else {
      const session = findActiveSessionForTab(data, details.tabId, parsedSearch.query);
      if (session) {
        sessionByTab.set(details.tabId, session.id);
        lastNodeByTab.set(details.tabId, session.rootNodeId);
      }
    }

    await saveData(data);
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
    return { ok: true, data: await loadData() };
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

function findActiveSessionForTab(
  data: LinkSpaceData,
  tabId: number,
  query: string
): SearchSession | undefined {
  return Object.values(data.sessions).find(
    (session) => session.status === 'active' && session.tabId === tabId && session.query === query
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

  if (trackedSessionId && trackedNodeId && trackedSession?.status === 'active' && trackedNode) {
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
  return Object.values(data.sessions).find(
    (session) => session.status === 'active' && session.tabId === tabId
  );
}

function hasExpirationChanges(previous: LinkSpaceData, next: LinkSpaceData): boolean {
  return Object.keys(previous.sessions).some((sessionId) => {
    const previousSession = previous.sessions[sessionId];
    const nextSession = next.sessions[sessionId];

    return (
      previousSession.status !== nextSession?.status || previousSession.endedAt !== nextSession.endedAt
    );
  });
}

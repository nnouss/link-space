import { parseGoogleSearch } from '../shared/google';
import {
  addPageVisit,
  createSearchSession,
  endExpiredSessions,
  shouldStartNewSession
} from '../shared/session';
import { loadData, saveData } from '../shared/storage';
import type { LinkSpaceData, RuntimeMessage, SearchSession } from '../shared/types';

type RuntimeResponse =
  | { ok: true; data: LinkSpaceData }
  | { ok: false; error: string };

const sessionByTab = new Map<number, string>();
const lastNodeByTab = new Map<number, string>();

chrome.webNavigation.onCommitted.addListener((details) => {
  void handleNavigation(details);
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  void handleRuntimeMessage(message).then(sendResponse);
  return true;
});

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

  const sessionId = sessionByTab.get(details.tabId);
  const fromNodeId = lastNodeByTab.get(details.tabId);
  const session = sessionId ? data.sessions[sessionId] : undefined;
  const fromNode = fromNodeId ? data.nodes[fromNodeId] : undefined;

  if (!sessionId || !fromNodeId || !session || !fromNode || session.status !== 'active') {
    if (expirationChanged) {
      await saveData(data);
    }
    return;
  }

  const tab = await chrome.tabs.get(details.tabId);
  const result = addPageVisit(data, {
    sessionId,
    fromNodeId,
    url: details.url,
    title: tab.title || details.url,
    now,
    isSearchResultClick: fromNode.depth === 0
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
    await saveData(message.payload);
    return { ok: true, data: message.payload };
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

function hasExpirationChanges(previous: LinkSpaceData, next: LinkSpaceData): boolean {
  return Object.keys(previous.sessions).some((sessionId) => {
    const previousSession = previous.sessions[sessionId];
    const nextSession = next.sessions[sessionId];

    return (
      previousSession.status !== nextSession?.status || previousSession.endedAt !== nextSession.endedAt
    );
  });
}

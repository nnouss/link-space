import type { LinkSpaceData, NavigationEdge, PageNode, SearchSession } from './types';

const STORAGE_KEY = 'linkSpaceData';
const INVALID_DATA_MESSAGE = 'Invalid Link Space data';

export function createEmptyData(): LinkSpaceData {
  return {
    sessions: {},
    nodes: {},
    edges: {},
    settings: {
      recordingPaused: false,
      sessionTimeoutMinutes: 30
    }
  };
}

export async function loadData(): Promise<LinkSpaceData> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const data = stored[STORAGE_KEY];

  return isLinkSpaceData(data) ? data : createEmptyData();
}

export async function saveData(data: LinkSpaceData): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

export function exportLinkSpaceData(data: LinkSpaceData): string {
  return JSON.stringify(data, null, 2);
}

export function importLinkSpaceData(text: string): LinkSpaceData {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(INVALID_DATA_MESSAGE);
  }

  if (!isLinkSpaceData(parsed)) {
    throw new Error(INVALID_DATA_MESSAGE);
  }

  return parsed;
}

export function deleteSearchSession(data: LinkSpaceData, sessionId: string): LinkSpaceData {
  const session = data.sessions[sessionId];
  if (!session) {
    return data;
  }

  const nodeIds = new Set(session.nodeIds);
  const edgeIds = new Set(session.edgeIds);
  const { [sessionId]: _deletedSession, ...sessions } = data.sessions;
  const nodes = Object.fromEntries(
    Object.entries(data.nodes).filter(([nodeId]) => !nodeIds.has(nodeId))
  );
  const edges = Object.fromEntries(
    Object.entries(data.edges).filter(([edgeId]) => !edgeIds.has(edgeId))
  );

  return {
    ...data,
    sessions,
    nodes,
    edges
  };
}

export function deleteAllSearchSessions(data: LinkSpaceData): LinkSpaceData {
  return {
    ...data,
    sessions: {},
    nodes: {},
    edges: {}
  };
}

function isLinkSpaceData(value: unknown): value is LinkSpaceData {
  if (!isPlainRecord(value)) {
    return false;
  }

  if (!isPlainRecord(value.sessions) || !isPlainRecord(value.nodes) || !isPlainRecord(value.edges)) {
    return false;
  }

  if (!isPlainRecord(value.settings)) {
    return false;
  }

  return (
    isSettings(value.settings) &&
    Object.values(value.sessions).every(isSearchSession) &&
    Object.values(value.nodes).every(isPageNode) &&
    Object.values(value.edges).every(isNavigationEdge) &&
    hasValidGraphReferences(value as unknown as LinkSpaceData)
  );
}

function hasValidGraphReferences(data: LinkSpaceData): boolean {
  if (!recordsHaveMatchingIds(data.sessions) || !recordsHaveMatchingIds(data.nodes)) {
    return false;
  }

  if (!recordsHaveMatchingIds(data.edges)) {
    return false;
  }

  if (!allNodesAreOwnedByExactlyOneSession(data) || !allEdgesAreOwnedByExactlyOneSession(data)) {
    return false;
  }

  return Object.values(data.sessions).every((session) => {
    const rootNode = data.nodes[session.rootNodeId];
    if (!rootNode || rootNode.sessionId !== session.id) {
      return false;
    }

    const nodesAreValid = session.nodeIds.every((nodeId) => {
      const node = data.nodes[nodeId];
      return Boolean(node && node.sessionId === session.id);
    });

    const edgesAreValid = session.edgeIds.every((edgeId) => {
      const edge = data.edges[edgeId];
      if (!edge || edge.sessionId !== session.id) {
        return false;
      }

      const fromNode = data.nodes[edge.fromNodeId];
      const toNode = data.nodes[edge.toNodeId];
      return Boolean(
        fromNode &&
          toNode &&
          fromNode.sessionId === session.id &&
          toNode.sessionId === session.id
      );
    });

    return nodesAreValid && edgesAreValid;
  });
}

function allNodesAreOwnedByExactlyOneSession(data: LinkSpaceData): boolean {
  const ownershipCount = new Map<string, number>();

  for (const session of Object.values(data.sessions)) {
    for (const nodeId of session.nodeIds) {
      ownershipCount.set(nodeId, (ownershipCount.get(nodeId) ?? 0) + 1);
    }
  }

  return Object.values(data.nodes).every((node) => {
    const ownerSession = data.sessions[node.sessionId];
    return Boolean(
      ownerSession && ownerSession.nodeIds.includes(node.id) && ownershipCount.get(node.id) === 1
    );
  });
}

function allEdgesAreOwnedByExactlyOneSession(data: LinkSpaceData): boolean {
  const ownershipCount = new Map<string, number>();

  for (const session of Object.values(data.sessions)) {
    for (const edgeId of session.edgeIds) {
      ownershipCount.set(edgeId, (ownershipCount.get(edgeId) ?? 0) + 1);
    }
  }

  return Object.values(data.edges).every((edge) => {
    const ownerSession = data.sessions[edge.sessionId];
    return Boolean(
      ownerSession && ownerSession.edgeIds.includes(edge.id) && ownershipCount.get(edge.id) === 1
    );
  });
}

function recordsHaveMatchingIds<T extends { id: string }>(records: Record<string, T>): boolean {
  return Object.entries(records).every(([recordId, record]) => record.id === recordId);
}

function isSettings(value: Record<string, unknown>): boolean {
  return (
    typeof value.recordingPaused === 'boolean' &&
    isPositiveFiniteNumber(value.sessionTimeoutMinutes)
  );
}

function isSearchSession(value: unknown): value is SearchSession {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.query) &&
    value.searchEngine === 'google' &&
    isString(value.startedAt) &&
    isString(value.lastActivityAt) &&
    (value.status === 'active' || value.status === 'ended') &&
    isString(value.rootNodeId) &&
    isStringArray(value.nodeIds) &&
    isStringArray(value.edgeIds) &&
    isOptionalString(value.endedAt) &&
    isOptionalNumber(value.tabId)
  );
}

function isPageNode(value: unknown): value is PageNode {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.sessionId) &&
    isString(value.url) &&
    isString(value.title) &&
    isString(value.domain) &&
    isString(value.visitedAt) &&
    isOptionalString(value.fromUrl) &&
    isNonNegativeFiniteNumber(value.dwellTime) &&
    isNonNegativeFiniteNumber(value.visitCount) &&
    isNonNegativeFiniteNumber(value.depth) &&
    typeof value.isSearchResultClick === 'boolean'
  );
}

function isNavigationEdge(value: unknown): value is NavigationEdge {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.sessionId) &&
    isString(value.fromNodeId) &&
    isString(value.toNodeId) &&
    isString(value.createdAt) &&
    value.type === 'navigation'
  );
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || isFiniteNumber(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

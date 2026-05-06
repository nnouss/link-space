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
    Object.values(value.edges).every(isNavigationEdge)
  );
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

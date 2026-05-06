import type { LinkSpaceData } from './types';

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
    typeof value.settings.recordingPaused === 'boolean' &&
    typeof value.settings.sessionTimeoutMinutes === 'number'
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

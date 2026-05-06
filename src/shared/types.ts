export type SearchEngine = 'google';
export type SessionStatus = 'active' | 'ended';

export interface SearchSession {
  id: string;
  query: string;
  searchEngine: SearchEngine;
  startedAt: string;
  endedAt?: string;
  lastActivityAt: string;
  status: SessionStatus;
  rootNodeId: string;
  nodeIds: string[];
  edgeIds: string[];
  tabId?: number;
}

export interface PageNode {
  id: string;
  sessionId: string;
  url: string;
  title: string;
  domain: string;
  visitedAt: string;
  fromUrl?: string;
  visitCount: number;
  depth: number;
  isSearchResultClick: boolean;
}

export interface NavigationEdge {
  id: string;
  sessionId: string;
  fromNodeId: string;
  toNodeId: string;
  createdAt: string;
  type: 'navigation';
}

export interface Settings {
  recordingPaused: boolean;
  sessionTimeoutMinutes: number;
}

export interface LinkSpaceData {
  sessions: Record<string, SearchSession>;
  nodes: Record<string, PageNode>;
  edges: Record<string, NavigationEdge>;
  settings: Settings;
}

export type RuntimeMessage =
  | { type: 'GET_DATA' }
  | { type: 'SET_RECORDING_PAUSED'; paused: boolean }
  | { type: 'IMPORT_DATA'; payload: LinkSpaceData }
  | { type: 'DELETE_SESSION'; sessionId: string }
  | { type: 'DELETE_SESSIONS'; sessionIds: string[] }
  | { type: 'DELETE_ALL_SESSIONS' };

import type { LinkSpaceData, NavigationEdge, PageNode, SearchSession } from './types';

interface CreateSearchSessionInput {
  query: string;
  tabId: number;
  now: string;
}

interface CreateBrowserSessionInput {
  url: string;
  title: string;
  tabId: number;
  now: string;
}

interface AddPageVisitInput {
  sessionId: string;
  fromNodeId: string;
  url: string;
  title: string;
  now: string;
  isSearchResultClick: boolean;
}

export function createSearchSession(
  data: LinkSpaceData,
  input: CreateSearchSessionInput
): { data: LinkSpaceData; sessionId: string } {
  const sessionId = createId('session', data.sessions);
  const rootNodeId = createId('node', data.nodes);
  const rootNode: PageNode = {
    id: rootNodeId,
    sessionId,
    url: `google://search?q=${encodeURIComponent(input.query)}`,
    title: input.query,
    domain: 'google.search',
    visitedAt: input.now,
    visitCount: 1,
    depth: 0,
    isSearchResultClick: false
  };
  const session: SearchSession = {
    id: sessionId,
    query: input.query,
    searchEngine: 'google',
    startedAt: input.now,
    lastActivityAt: input.now,
    status: 'active',
    rootNodeId,
    currentNodeId: rootNodeId,
    nodeIds: [rootNodeId],
    edgeIds: [],
    tabId: input.tabId
  };

  return {
    data: {
      ...data,
      sessions: {
        ...data.sessions,
        [sessionId]: session
      },
      nodes: {
        ...data.nodes,
        [rootNodeId]: rootNode
      }
    },
    sessionId
  };
}

export function createBrowserSession(
  data: LinkSpaceData,
  input: CreateBrowserSessionInput
): { data: LinkSpaceData; sessionId: string } {
  const sessionId = createId('session', data.sessions);
  const rootNodeId = createId('node', data.nodes);
  const title = input.title || input.url;
  const rootNode: PageNode = {
    id: rootNodeId,
    sessionId,
    url: input.url,
    title,
    domain: parseDomain(input.url),
    visitedAt: input.now,
    visitCount: 1,
    depth: 0,
    isSearchResultClick: false
  };
  const session: SearchSession = {
    id: sessionId,
    query: title,
    searchEngine: 'google',
    startedAt: input.now,
    lastActivityAt: input.now,
    status: 'active',
    rootNodeId,
    currentNodeId: rootNodeId,
    nodeIds: [rootNodeId],
    edgeIds: [],
    tabId: input.tabId
  };

  return {
    data: {
      ...data,
      sessions: {
        ...data.sessions,
        [sessionId]: session
      },
      nodes: {
        ...data.nodes,
        [rootNodeId]: rootNode
      }
    },
    sessionId
  };
}

export function shouldStartNewSession(data: LinkSpaceData, tabId: number, query: string): boolean {
  const activeSession = Object.values(data.sessions).find(
    (session) => session.status === 'active' && session.tabId === tabId
  );

  return activeSession ? activeSession.query !== query : true;
}

export function addPageVisit(
  data: LinkSpaceData,
  input: AddPageVisitInput
): { data: LinkSpaceData; nodeId: string } {
  const session = data.sessions[input.sessionId];
  const fromNode = data.nodes[input.fromNodeId];

  if (!session) {
    throw new Error('Unknown session');
  }

  if (!fromNode) {
    throw new Error('Unknown source node');
  }

  if (fromNode.sessionId !== input.sessionId || !session.nodeIds.includes(input.fromNodeId)) {
    throw new Error('Source node does not belong to session');
  }

  const existingNodeId = findExistingChildNodeId(data, session, input.fromNodeId, input.url);
  if (existingNodeId) {
    const existingNode = data.nodes[existingNodeId];

    return {
      data: {
        ...data,
        sessions: {
          ...data.sessions,
          [input.sessionId]: {
            ...session,
            lastActivityAt: input.now,
            currentNodeId: existingNodeId
          }
        },
        nodes: {
          ...data.nodes,
          [existingNodeId]: {
            ...existingNode,
            visitCount: existingNode.visitCount + 1
          }
        }
      },
      nodeId: existingNodeId
    };
  }

  const nodeId = createId('node', data.nodes);
  const edgeId = createId('edge', data.edges);
  const node: PageNode = {
    id: nodeId,
    sessionId: input.sessionId,
    url: input.url,
    title: input.title,
    domain: parseDomain(input.url),
    visitedAt: input.now,
    fromUrl: fromNode.url,
    visitCount: 1,
    depth: fromNode.depth + 1,
    isSearchResultClick: input.isSearchResultClick
  };
  const edge: NavigationEdge = {
    id: edgeId,
    sessionId: input.sessionId,
    fromNodeId: input.fromNodeId,
    toNodeId: nodeId,
    createdAt: input.now,
    type: 'navigation'
  };

  return {
    data: {
      ...data,
      sessions: {
        ...data.sessions,
        [input.sessionId]: {
          ...session,
          lastActivityAt: input.now,
          currentNodeId: nodeId,
          nodeIds: [...session.nodeIds, nodeId],
          edgeIds: [...session.edgeIds, edgeId]
        }
      },
      nodes: {
        ...data.nodes,
        [nodeId]: node
      },
      edges: {
        ...data.edges,
        [edgeId]: edge
      }
    },
    nodeId
  };
}

function findExistingChildNodeId(
  data: LinkSpaceData,
  session: SearchSession,
  fromNodeId: string,
  url: string
): string | undefined {
  return session.edgeIds
    .map((edgeId) => data.edges[edgeId])
    .find((edge) => {
      const targetNode = edge ? data.nodes[edge.toNodeId] : undefined;

      return edge?.fromNodeId === fromNodeId && targetNode?.url === url;
    })?.toNodeId;
}

export function endExpiredSessions(data: LinkSpaceData, now: string): LinkSpaceData {
  const nowTime = new Date(now).getTime();
  const timeoutMs = data.settings.sessionTimeoutMinutes * 60 * 1000;
  const sessions = Object.fromEntries(
    Object.entries(data.sessions).map(([sessionId, session]) => {
      if (session.status !== 'active') {
        return [sessionId, session];
      }

      const inactiveMs = nowTime - new Date(session.lastActivityAt).getTime();

      if (inactiveMs <= timeoutMs) {
        return [sessionId, session];
      }

      return [
        sessionId,
        {
          ...session,
          status: 'ended',
          endedAt: now
        } satisfies SearchSession
      ];
    })
  );

  return {
    ...data,
    sessions
  };
}

function createId(prefix: string, records: Record<string, unknown>): string {
  let next = Object.keys(records).length + 1;
  let id = `${prefix}-${next}`;

  while (id in records) {
    next += 1;
    id = `${prefix}-${next}`;
  }

  return id;
}

function parseDomain(url: string): string {
  try {
    return new URL(url).hostname || 'unknown';
  } catch {
    return 'unknown';
  }
}

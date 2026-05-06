import { describe, expect, it } from 'vitest';
import type { NavigationEdge, PageNode, SearchSession } from '../shared/types';
import { toGraphData } from './GraphView';

describe('GraphView graph data', () => {
  it('filters missing node references', () => {
    const session = createSession({
      nodeIds: ['root', 'missing-node'],
      edgeIds: []
    });

    const graphData = toGraphData(session, { root: createNode({ id: 'root' }) }, {});

    expect(graphData.nodes.map((node) => node.id)).toEqual(['root']);
  });

  it('filters missing edge and missing endpoint references', () => {
    const session = createSession({
      nodeIds: ['root', 'child'],
      edgeIds: ['valid-edge', 'missing-edge', 'missing-endpoint-edge']
    });
    const nodes = {
      root: createNode({ id: 'root' }),
      child: createNode({ id: 'child' })
    };
    const edges = {
      'valid-edge': createEdge({
        id: 'valid-edge',
        fromNodeId: 'root',
        toNodeId: 'child'
      }),
      'missing-endpoint-edge': createEdge({
        id: 'missing-endpoint-edge',
        fromNodeId: 'root',
        toNodeId: 'missing-node'
      })
    };

    const graphData = toGraphData(session, nodes, edges);

    expect(graphData.links).toEqual([
      {
        id: 'valid-edge',
        source: 'root',
        target: 'child'
      }
    ]);
  });

  it('derives node value and color from depth, visit count, and dwell time', () => {
    const session = createSession({
      nodeIds: ['deep-node'],
      edgeIds: []
    });
    const node = createNode({
      id: 'deep-node',
      depth: 2,
      visitCount: 3,
      dwellTime: 60_000
    });

    const graphData = toGraphData(session, { 'deep-node': node }, {});

    expect(graphData.nodes[0]).toMatchObject({
      id: 'deep-node',
      page: node,
      title: 'Page deep-node',
      color: 'oklch(72% 0.11 252)'
    });
    expect(graphData.nodes[0].value).toBeCloseTo(5.8);
  });
});

function createSession(
  overrides: Pick<SearchSession, 'nodeIds' | 'edgeIds'>
): SearchSession {
  return {
    id: 'session-1',
    query: 'graph',
    searchEngine: 'google',
    startedAt: '2026-05-06T00:00:00.000Z',
    lastActivityAt: '2026-05-06T00:00:00.000Z',
    status: 'active',
    rootNodeId: 'root',
    nodeIds: overrides.nodeIds,
    edgeIds: overrides.edgeIds
  };
}

function createNode(overrides: Partial<PageNode>): PageNode {
  const id = overrides.id ?? 'node';

  return {
    id,
    sessionId: 'session-1',
    url: `https://example.com/${id}`,
    title: `Page ${id}`,
    domain: 'example.com',
    visitedAt: '2026-05-06T00:00:00.000Z',
    dwellTime: 0,
    visitCount: 1,
    depth: 0,
    isSearchResultClick: false,
    ...overrides
  };
}

function createEdge(overrides: Partial<NavigationEdge>): NavigationEdge {
  return {
    id: overrides.id ?? 'edge',
    sessionId: 'session-1',
    fromNodeId: overrides.fromNodeId ?? 'root',
    toNodeId: overrides.toNodeId ?? 'child',
    createdAt: '2026-05-06T00:00:00.000Z',
    type: 'navigation'
  };
}

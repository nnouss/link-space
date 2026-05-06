import { describe, expect, it, vi } from 'vitest';
import { Color } from 'three';
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

  it('derives node value, color, and root marker without dwell time', () => {
    const session = createSession({
      nodeIds: ['root', 'deep-node'],
      edgeIds: []
    });
    const rootNode = createNode({
      id: 'root',
      domain: 'google.search',
      title: 'graph',
      visitCount: 1
    });
    const deepNode = createNode({
      id: 'deep-node',
      depth: 2,
      visitCount: 3
    });

    const graphData = toGraphData(session, { root: rootNode, 'deep-node': deepNode }, {});

    expect(graphData.nodes[0]).toMatchObject({
      id: 'root',
      page: rootNode,
      title: 'graph',
      color: '#7de6bd',
      isRoot: true,
      label: 'google.search / graph'
    });
    expect(graphData.nodes[0].value).toBeCloseTo(4.2);
    expect(graphData.nodes[1]).toMatchObject({
      id: 'deep-node',
      page: deepNode,
      title: 'Page deep-node',
      color: '#9da9e8',
      isRoot: false,
      label: 'example.com/deep-node'
    });
    expect(graphData.nodes[1].value).toBeCloseTo(3.5);
  });

  it('uses node colors that Three.js can parse without falling back', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const session = createSession({
      nodeIds: ['root', 'child', 'deep-node'],
      edgeIds: []
    });
    const graphData = toGraphData(
      session,
      {
        root: createNode({ id: 'root', depth: 0 }),
        child: createNode({ id: 'child', depth: 1 }),
        'deep-node': createNode({ id: 'deep-node', depth: 2 })
      },
      {}
    );

    const parsedColors = graphData.nodes.map((node) => new Color(node.color).getHexString());

    expect(warnSpy).not.toHaveBeenCalled();
    expect(parsedColors).toEqual(['7de6bd', '6fb8da', '9da9e8']);

    warnSpy.mockRestore();
  });

  it('keeps graph labels stable when a stored node url is not parseable', () => {
    const session = createSession({
      nodeIds: ['node-with-odd-url'],
      edgeIds: []
    });
    const node = createNode({
      id: 'node-with-odd-url',
      url: 'not a browser url',
      domain: 'unknown'
    });

    const graphData = toGraphData(session, { 'node-with-odd-url': node }, {});

    expect(graphData.nodes[0].label).toBe('unknown / Page node-with-odd-url');
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

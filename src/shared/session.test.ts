import { describe, expect, it } from 'vitest';
import { addPageVisit, createSearchSession, endExpiredSessions, shouldStartNewSession } from './session';
import { createEmptyData } from './storage';

describe('session logic', () => {
  it('creates an active session with a root search node', () => {
    const result = createSearchSession(createEmptyData(), {
      query: 'three graph',
      tabId: 7,
      now: '2026-05-06T00:00:00.000Z'
    });
    const session = result.data.sessions[result.sessionId];
    const root = result.data.nodes[session.rootNodeId];

    expect(session.status).toBe('active');
    expect(session.query).toBe('three graph');
    expect(session.tabId).toBe(7);
    expect(session.startedAt).toBe('2026-05-06T00:00:00.000Z');
    expect(session.lastActivityAt).toBe('2026-05-06T00:00:00.000Z');
    expect(root.title).toBe('three graph');
    expect(root.url).toBe('google://search?q=three%20graph');
    expect(root.domain).toBe('google.search');
    expect(root.depth).toBe(0);
    expect(root.visitCount).toBe(1);
    expect(root.isSearchResultClick).toBe(false);
  });

  it('adds a page visit as a node and edge', () => {
    const first = createSearchSession(createEmptyData(), {
      query: 'first',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    const rootNodeId = first.data.sessions[first.sessionId].rootNodeId;
    const added = addPageVisit(first.data, {
      sessionId: first.sessionId,
      fromNodeId: rootNodeId,
      url: 'https://example.com/a',
      title: 'A',
      now: '2026-05-06T00:01:00.000Z',
      isSearchResultClick: true
    });
    const session = added.data.sessions[first.sessionId];
    const node = added.data.nodes[added.nodeId];
    const edge = added.data.edges[session.edgeIds[0]];

    expect(session.nodeIds).toHaveLength(2);
    expect(session.edgeIds).toHaveLength(1);
    expect(session.lastActivityAt).toBe('2026-05-06T00:01:00.000Z');
    expect(node.url).toBe('https://example.com/a');
    expect(node.title).toBe('A');
    expect(node.domain).toBe('example.com');
    expect(node.depth).toBe(1);
    expect(node.isSearchResultClick).toBe(true);
    expect(edge.fromNodeId).toBe(rootNodeId);
    expect(edge.toNodeId).toBe(added.nodeId);
    expect(edge.type).toBe('navigation');
  });

  it('throws when adding a page visit to an unknown session', () => {
    expect(() =>
      addPageVisit(createEmptyData(), {
        sessionId: 'missing-session',
        fromNodeId: 'missing-node',
        url: 'https://example.com/a',
        title: 'A',
        now: '2026-05-06T00:01:00.000Z',
        isSearchResultClick: true
      })
    ).toThrow('Unknown session');
  });

  it('throws when adding a page visit from an unknown source node', () => {
    const first = createSearchSession(createEmptyData(), {
      query: 'first',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });

    expect(() =>
      addPageVisit(first.data, {
        sessionId: first.sessionId,
        fromNodeId: 'missing-node',
        url: 'https://example.com/a',
        title: 'A',
        now: '2026-05-06T00:01:00.000Z',
        isSearchResultClick: true
      })
    ).toThrow('Unknown source node');
  });

  it('throws when the source node belongs to another session', () => {
    const first = createSearchSession(createEmptyData(), {
      query: 'first',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    const second = createSearchSession(first.data, {
      query: 'second',
      tabId: 2,
      now: '2026-05-06T00:02:00.000Z'
    });
    const firstRootNodeId = second.data.sessions[first.sessionId].rootNodeId;

    expect(() =>
      addPageVisit(second.data, {
        sessionId: second.sessionId,
        fromNodeId: firstRootNodeId,
        url: 'https://example.com/a',
        title: 'A',
        now: '2026-05-06T00:03:00.000Z',
        isSearchResultClick: true
      })
    ).toThrow('Source node does not belong to session');
  });

  it('ends inactive sessions after the configured timeout', () => {
    const first = createSearchSession(createEmptyData(), {
      query: 'first',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    const expired = endExpiredSessions(first.data, '2026-05-06T00:31:00.000Z');

    expect(expired.sessions[first.sessionId].status).toBe('ended');
    expect(expired.sessions[first.sessionId].endedAt).toBe('2026-05-06T00:31:00.000Z');
  });

  it('starts a new session when the search query changes', () => {
    const first = createSearchSession(createEmptyData(), {
      query: 'first',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });

    expect(shouldStartNewSession(first.data, 1, 'second')).toBe(true);
    expect(shouldStartNewSession(first.data, 1, 'first')).toBe(false);
  });
});

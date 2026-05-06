import { describe, expect, it } from 'vitest';
import { addPageVisit, createSearchSession, endExpiredSessions, shouldStartNewSession } from './session';
import { createEmptyData } from './storage';

describe('session logic', () => {
  it('검색어 root node와 active session을 생성한다', () => {
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
    expect(root.dwellTime).toBe(0);
    expect(root.isSearchResultClick).toBe(false);
  });

  it('페이지 방문을 node와 edge로 추가한다', () => {
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

  it('30분보다 오래 비활성인 세션을 종료한다', () => {
    const first = createSearchSession(createEmptyData(), {
      query: 'first',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    const expired = endExpiredSessions(first.data, '2026-05-06T00:31:00.000Z');

    expect(expired.sessions[first.sessionId].status).toBe('ended');
    expect(expired.sessions[first.sessionId].endedAt).toBe('2026-05-06T00:31:00.000Z');
  });

  it('새 검색어가 기존 active session과 다르면 새 세션을 시작해야 한다', () => {
    const first = createSearchSession(createEmptyData(), {
      query: 'first',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });

    expect(shouldStartNewSession(first.data, 1, 'second')).toBe(true);
    expect(shouldStartNewSession(first.data, 1, 'first')).toBe(false);
  });
});

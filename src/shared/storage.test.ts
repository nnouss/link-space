import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addPageVisit, createSearchSession } from './session';
import type { LinkSpaceData } from './types';
import {
  createEmptyData,
  deleteAllSearchSessions,
  deleteSearchSession,
  exportLinkSpaceData,
  importLinkSpaceData,
  loadData,
  saveData
} from './storage';

const localStorageMock = chrome.storage.local as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

describe('storage logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('저장 데이터가 없으면 빈 데이터를 반환한다', async () => {
    localStorageMock.get.mockResolvedValue({});

    await expect(loadData()).resolves.toEqual(createEmptyData());
  });

  it('저장 데이터가 유효하지 않으면 빈 데이터를 반환한다', async () => {
    localStorageMock.get.mockResolvedValue({ linkSpaceData: { sessions: [] } });

    await expect(loadData()).resolves.toEqual(createEmptyData());
  });

  it('saveData는 chrome.storage.local.set에 linkSpaceData를 저장한다', async () => {
    const data = createEmptyData();
    localStorageMock.set.mockResolvedValue(undefined);

    await saveData(data);

    expect(localStorageMock.set).toHaveBeenCalledWith({ linkSpaceData: data });
  });

  it('유효한 JSON 문자열을 LinkSpaceData로 가져온다', () => {
    const validData: LinkSpaceData = createEmptyData();

    expect(importLinkSpaceData(JSON.stringify(validData))).toEqual(validData);
  });

  it('유효하지 않은 Link Space data는 거부한다', () => {
    expect(() => importLinkSpaceData('{"sessions":[]}')).toThrow('Invalid Link Space data');
  });

  it('잘못된 session 데이터는 거부한다', () => {
    expect(() =>
      importLinkSpaceData(
        JSON.stringify({
          ...createEmptyData(),
          sessions: {
            bad: {
              nodeIds: 'not-array'
            }
          }
        })
      )
    ).toThrow('Invalid Link Space data');
  });

  it('잘못된 sessionTimeoutMinutes는 거부한다', () => {
    expect(() =>
      importLinkSpaceData(
        JSON.stringify({
          ...createEmptyData(),
          settings: {
            recordingPaused: false,
            sessionTimeoutMinutes: -1
          }
        })
      )
    ).toThrow('Invalid Link Space data');
  });

  it('잘못된 JSON 문자열은 거부한다', () => {
    expect(() => importLinkSpaceData('{bad json')).toThrow('Invalid Link Space data');
  });

  it('exportLinkSpaceData는 들여쓰기된 JSON 문자열을 반환한다', () => {
    expect(exportLinkSpaceData(createEmptyData())).toBe(JSON.stringify(createEmptyData(), null, 2));
  });

  it('rootNodeId가 존재하지 않는 가져오기 데이터는 거부한다', () => {
    const created = createSearchSession(createEmptyData(), {
      query: 'broken root',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    const data: LinkSpaceData = {
      ...created.data,
      sessions: {
        [created.sessionId]: {
          ...created.data.sessions[created.sessionId],
          rootNodeId: 'missing-node'
        }
      }
    };

    expect(() => importLinkSpaceData(JSON.stringify(data))).toThrow('Invalid Link Space data');
  });

  it('edge endpoint가 존재하지 않는 가져오기 데이터는 거부한다', () => {
    const created = createSearchSession(createEmptyData(), {
      query: 'broken edge',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    const added = addPageVisit(created.data, {
      sessionId: created.sessionId,
      fromNodeId: created.data.sessions[created.sessionId].rootNodeId,
      url: 'https://example.com',
      title: 'Example',
      now: '2026-05-06T00:01:00.000Z',
      isSearchResultClick: true
    });
    const edgeId = added.data.sessions[created.sessionId].edgeIds[0];
    const data: LinkSpaceData = {
      ...added.data,
      edges: {
        ...added.data.edges,
        [edgeId]: {
          ...added.data.edges[edgeId],
          toNodeId: 'missing-node'
        }
      }
    };

    expect(() => importLinkSpaceData(JSON.stringify(data))).toThrow('Invalid Link Space data');
  });

  it('session.nodeIds에 없는 orphan node는 거부한다', () => {
    const created = createSearchSession(createEmptyData(), {
      query: 'orphan node',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    const data: LinkSpaceData = {
      ...created.data,
      nodes: {
        ...created.data.nodes,
        'node-2': {
          ...created.data.nodes[created.data.sessions[created.sessionId].rootNodeId],
          id: 'node-2',
          url: 'https://example.com/orphan',
          title: 'Orphan',
          domain: 'example.com',
          depth: 1
        }
      }
    };

    expect(() => importLinkSpaceData(JSON.stringify(data))).toThrow('Invalid Link Space data');
  });

  it('session.edgeIds에 없는 orphan edge는 거부한다', () => {
    const created = createSearchSession(createEmptyData(), {
      query: 'orphan edge',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    const added = addPageVisit(created.data, {
      sessionId: created.sessionId,
      fromNodeId: created.data.sessions[created.sessionId].rootNodeId,
      url: 'https://example.com',
      title: 'Example',
      now: '2026-05-06T00:01:00.000Z',
      isSearchResultClick: true
    });
    const edgeId = added.data.sessions[created.sessionId].edgeIds[0];
    const data: LinkSpaceData = {
      ...added.data,
      sessions: {
        [created.sessionId]: {
          ...added.data.sessions[created.sessionId],
          edgeIds: []
        }
      },
      edges: {
        [edgeId]: {
          ...added.data.edges[edgeId],
          toNodeId: 'missing-node'
        }
      }
    };

    expect(() => importLinkSpaceData(JSON.stringify(data))).toThrow('Invalid Link Space data');
  });
  it('deleteSearchSession removes the selected session and its graph records', () => {
    const first = createSearchSession(createEmptyData(), {
      query: 'delete me',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    const withVisit = addPageVisit(first.data, {
      sessionId: first.sessionId,
      fromNodeId: first.data.sessions[first.sessionId].rootNodeId,
      url: 'https://example.com/a',
      title: 'A',
      now: '2026-05-06T00:01:00.000Z',
      isSearchResultClick: true
    });
    const second = createSearchSession(withVisit.data, {
      query: 'keep me',
      tabId: 2,
      now: '2026-05-06T00:02:00.000Z'
    });

    const deleted = deleteSearchSession(second.data, first.sessionId);

    expect(deleted.sessions).not.toHaveProperty(first.sessionId);
    expect(deleted.sessions).toHaveProperty(second.sessionId);
    expect(deleted.nodes).not.toHaveProperty(first.data.sessions[first.sessionId].rootNodeId);
    expect(deleted.nodes).not.toHaveProperty(withVisit.nodeId);
    expect(deleted.edges).not.toHaveProperty(withVisit.data.sessions[first.sessionId].edgeIds[0]);
    expect(deleted.settings).toEqual(second.data.settings);
  });

  it('deleteAllSearchSessions clears graph records and preserves settings', () => {
    const created = createSearchSession(createEmptyData(), {
      query: 'clear all',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    const data = {
      ...created.data,
      settings: {
        ...created.data.settings,
        recordingPaused: true
      }
    };

    expect(deleteAllSearchSessions(data)).toEqual({
      sessions: {},
      nodes: {},
      edges: {},
      settings: data.settings
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearchSession } from '../shared/session';
import { createEmptyData } from '../shared/storage';
import type { LinkSpaceData } from '../shared/types';

const localStorageMock = chrome.storage.local as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

const webNavigationMock = chrome.webNavigation.onCommitted as unknown as {
  addListener: ReturnType<typeof vi.fn>;
};

const runtimeMessageMock = chrome.runtime.onMessage as unknown as {
  addListener: ReturnType<typeof vi.fn>;
};

const tabsMock = chrome.tabs as unknown as {
  get: ReturnType<typeof vi.fn>;
  onRemoved: { addListener: ReturnType<typeof vi.fn> };
};

describe('background navigation collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
  });

  it('persists expired sessions even when no page visit is added', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:31:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'old query',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    localStorageMock.get.mockResolvedValue({ linkSpaceData: created.data });
    localStorageMock.set.mockResolvedValue(undefined);

    await import('./index');
    const listener = webNavigationMock.addListener.mock.calls[0][0] as (
      details: chrome.webNavigation.WebNavigationFramedCallbackDetails
    ) => void;

    listener(createNavigationDetails({ tabId: 9, url: 'https://example.com/page' }));
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.objectContaining({
          [created.sessionId]: expect.objectContaining({
            status: 'ended',
            endedAt: '2026-05-06T00:31:00.000Z'
          })
        })
      })
    });
  });

  it('recovers active session from storage when worker maps are empty', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:05:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'worker restart',
      tabId: 3,
      now: '2026-05-06T00:00:00.000Z'
    });
    localStorageMock.get.mockResolvedValue({ linkSpaceData: created.data });
    localStorageMock.set.mockResolvedValue(undefined);
    tabsMock.get.mockResolvedValue({ title: 'Example Page' });

    await import('./index');
    const listener = webNavigationMock.addListener.mock.calls[0][0] as (
      details: chrome.webNavigation.WebNavigationFramedCallbackDetails
    ) => void;

    listener(createNavigationDetails({ tabId: 3, url: 'https://example.com/page' }));
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.objectContaining({
          [created.sessionId]: expect.objectContaining({
            nodeIds: ['node-1', 'node-2']
          })
        }),
        nodes: expect.objectContaining({
          'node-2': expect.objectContaining({
            sessionId: created.sessionId,
            url: 'https://example.com/page',
            title: 'Example Page',
            fromUrl: 'google://search?q=worker%20restart',
            isSearchResultClick: true
          })
        })
      })
    });
  });

  it('does not record typed non-Google navigation after a search session and ends the session', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:06:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'private typed',
      tabId: 11,
      now: '2026-05-06T00:00:00.000Z'
    });
    localStorageMock.get.mockResolvedValue({ linkSpaceData: created.data });
    localStorageMock.set.mockResolvedValue(undefined);
    tabsMock.get.mockResolvedValue({ title: 'Typed Page' });

    await import('./index');
    const listener = getNavigationListener();

    listener(
      createNavigationDetails({
        tabId: 11,
        url: 'https://sensitive.example/page',
        transitionType: 'typed',
        transitionQualifiers: ['server_redirect']
      })
    );
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.objectContaining({
          [created.sessionId]: expect.objectContaining({
            status: 'ended',
            endedAt: '2026-05-06T00:06:00.000Z',
            nodeIds: ['node-1']
          })
        }),
        nodes: expect.not.objectContaining({
          'node-2': expect.anything()
        })
      })
    });
  });

  it('does not attach a later link navigation after typed navigation ended the session', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:06:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'typed then link',
      tabId: 15,
      now: '2026-05-06T00:00:00.000Z'
    });
    const endedData = {
      ...created.data,
      sessions: {
        [created.sessionId]: {
          ...created.data.sessions[created.sessionId],
          status: 'ended' as const,
          endedAt: '2026-05-06T00:06:00.000Z'
        }
      }
    };

    localStorageMock.get.mockResolvedValueOnce({ linkSpaceData: created.data });
    localStorageMock.set.mockResolvedValue(undefined);
    tabsMock.get.mockResolvedValue({ title: 'Later Link' });

    await import('./index');
    const listener = getNavigationListener();

    listener(
      createNavigationDetails({
        tabId: 15,
        url: 'https://sensitive.example/page',
        transitionType: 'typed',
        transitionQualifiers: ['server_redirect']
      })
    );
    await vi.runAllTimersAsync();
    localStorageMock.set.mockClear();
    localStorageMock.get.mockResolvedValue({ linkSpaceData: endedData });

    listener(
      createNavigationDetails({
        tabId: 15,
        url: 'https://example.com/later',
        transitionType: 'link'
      })
    );
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).not.toHaveBeenCalled();
  });

  it('records link non-Google navigation after a search session', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:06:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'link click',
      tabId: 12,
      now: '2026-05-06T00:00:00.000Z'
    });
    localStorageMock.get.mockResolvedValue({ linkSpaceData: created.data });
    localStorageMock.set.mockResolvedValue(undefined);
    tabsMock.get.mockResolvedValue({ title: 'Linked Page' });

    await import('./index');
    const listener = getNavigationListener();

    listener(
      createNavigationDetails({
        tabId: 12,
        url: 'https://example.com/link',
        transitionType: 'link'
      })
    );
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.objectContaining({
          [created.sessionId]: expect.objectContaining({
            nodeIds: ['node-1', 'node-2']
          })
        })
      })
    });
  });

  it('branches from the restored page after browser back navigation', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:07:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'branch depth',
      tabId: 21,
      now: '2026-05-06T00:00:00.000Z'
    });
    let currentData: LinkSpaceData = created.data;

    localStorageMock.get.mockImplementation(() => Promise.resolve({ linkSpaceData: currentData }));
    localStorageMock.set.mockImplementation(({ linkSpaceData }: { linkSpaceData: LinkSpaceData }) => {
      currentData = linkSpaceData;
      return Promise.resolve();
    });
    tabsMock.get.mockImplementation(() => Promise.resolve({ title: 'Visited Page' }));

    await import('./index');
    const listener = getNavigationListener();

    listener(createNavigationDetails({ tabId: 21, url: 'https://example.com/a' }));
    await vi.runAllTimersAsync();

    listener(createNavigationDetails({ tabId: 21, url: 'https://example.com/b' }));
    await vi.runAllTimersAsync();

    listener(
      createNavigationDetails({
        tabId: 21,
        url: 'https://example.com/a',
        transitionQualifiers: ['forward_back']
      })
    );
    await vi.runAllTimersAsync();

    listener(createNavigationDetails({ tabId: 21, url: 'https://example.com/c' }));
    await vi.runAllTimersAsync();

    expect(currentData.sessions[created.sessionId].nodeIds).toEqual([
      'node-1',
      'node-2',
      'node-3',
      'node-4'
    ]);
    expect(currentData.nodes['node-2']).toMatchObject({
      url: 'https://example.com/a',
      depth: 1
    });
    expect(currentData.nodes['node-3']).toMatchObject({
      url: 'https://example.com/b',
      depth: 2,
      fromUrl: 'https://example.com/a'
    });
    expect(currentData.nodes['node-4']).toMatchObject({
      url: 'https://example.com/c',
      depth: 2,
      fromUrl: 'https://example.com/a'
    });
    expect(currentData.sessions[created.sessionId].edgeIds).toEqual(['edge-1', 'edge-2', 'edge-3']);
  });

  it('does not let an in-flight navigation overwrite a pause save', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:14:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'pause race',
      tabId: 18,
      now: '2026-05-06T00:00:00.000Z'
    });
    let currentData: LinkSpaceData = created.data;
    let resolveTab: (tab: { title: string }) => void = () => undefined;
    const pendingTab = new Promise<{ title: string }>((resolve) => {
      resolveTab = resolve;
    });

    localStorageMock.get.mockImplementation(() => Promise.resolve({ linkSpaceData: currentData }));
    localStorageMock.set.mockImplementation(({ linkSpaceData }: { linkSpaceData: LinkSpaceData }) => {
      currentData = linkSpaceData;
      return Promise.resolve();
    });
    tabsMock.get.mockReturnValue(pendingTab);

    await import('./index');
    const navigationListener = getNavigationListener();
    const messageListener = getRuntimeMessageListener();
    const sendResponse = vi.fn();

    navigationListener(
      createNavigationDetails({
        tabId: 18,
        url: 'https://example.com/race',
        transitionType: 'link'
      })
    );
    await vi.waitFor(() => {
      expect(tabsMock.get).toHaveBeenCalledWith(18);
    });

    messageListener(
      { type: 'SET_RECORDING_PAUSED', paused: true },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );
    await vi.runAllTimersAsync();
    expect(currentData.settings.recordingPaused).toBe(true);

    resolveTab({ title: 'Race Page' });
    await vi.runAllTimersAsync();

    expect(currentData.settings.recordingPaused).toBe(true);
    expect(currentData.sessions[created.sessionId]).toEqual(
      expect.objectContaining({
        status: 'ended',
        endedAt: expect.any(String),
        nodeIds: ['node-1']
      })
    );
    expect(currentData.nodes).not.toHaveProperty('node-2');
  });

  it('does not let an in-flight navigation attach after pause and quick resume ended the session', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:15:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'pause resume race',
      tabId: 19,
      now: '2026-05-06T00:00:00.000Z'
    });
    let currentData: LinkSpaceData = created.data;
    let resolveTab: (tab: { title: string }) => void = () => undefined;
    const pendingTab = new Promise<{ title: string }>((resolve) => {
      resolveTab = resolve;
    });

    localStorageMock.get.mockImplementation(() => Promise.resolve({ linkSpaceData: currentData }));
    localStorageMock.set.mockImplementation(({ linkSpaceData }: { linkSpaceData: LinkSpaceData }) => {
      currentData = linkSpaceData;
      return Promise.resolve();
    });
    tabsMock.get.mockReturnValue(pendingTab);

    await import('./index');
    const navigationListener = getNavigationListener();
    const messageListener = getRuntimeMessageListener();
    const sendResponse = vi.fn();

    navigationListener(
      createNavigationDetails({
        tabId: 19,
        url: 'https://example.com/resume-race',
        transitionType: 'link'
      })
    );
    await vi.waitFor(() => {
      expect(tabsMock.get).toHaveBeenCalledWith(19);
    });

    messageListener(
      { type: 'SET_RECORDING_PAUSED', paused: true },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );
    await vi.runAllTimersAsync();
    sendResponse.mockClear();

    messageListener(
      { type: 'SET_RECORDING_PAUSED', paused: false },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );
    await vi.runAllTimersAsync();

    expect(currentData.settings.recordingPaused).toBe(false);
    expect(currentData.sessions[created.sessionId]).toEqual(
      expect.objectContaining({
        status: 'ended',
        nodeIds: ['node-1']
      })
    );

    resolveTab({ title: 'Resume Race Page' });
    await vi.runAllTimersAsync();

    expect(currentData.settings.recordingPaused).toBe(false);
    expect(currentData.sessions[created.sessionId]).toEqual(
      expect.objectContaining({
        status: 'ended',
        nodeIds: ['node-1']
      })
    );
    expect(currentData.nodes).not.toHaveProperty('node-2');
  });

  it('rejects invalid imported data without saving', async () => {
    localStorageMock.set.mockResolvedValue(undefined);

    await import('./index');
    const listener = runtimeMessageMock.addListener.mock.calls[0][0] as (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void
    ) => true;
    const sendResponse = vi.fn();

    listener(
      { type: 'IMPORT_DATA', payload: { sessions: [] } },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      error: 'Invalid Link Space data'
    });
  });

  it('deletes one session through runtime message', async () => {
    const first = createSearchSession(createEmptyData(), {
      query: 'delete one',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    const second = createSearchSession(first.data, {
      query: 'keep one',
      tabId: 2,
      now: '2026-05-06T00:01:00.000Z'
    });
    localStorageMock.get.mockResolvedValue({ linkSpaceData: second.data });
    localStorageMock.set.mockResolvedValue(undefined);

    await import('./index');
    const listener = getRuntimeMessageListener();
    const sendResponse = vi.fn();

    listener(
      { type: 'DELETE_SESSION', sessionId: first.sessionId },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.not.objectContaining({
          [first.sessionId]: expect.anything()
        })
      })
    });
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      data: expect.objectContaining({
        sessions: expect.objectContaining({
          [second.sessionId]: expect.anything()
        })
      })
    });
  });

  it('deletes all sessions through runtime message', async () => {
    const created = createSearchSession(createEmptyData(), {
      query: 'delete all',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    localStorageMock.get.mockResolvedValue({ linkSpaceData: created.data });
    localStorageMock.set.mockResolvedValue(undefined);

    await import('./index');
    const listener = getRuntimeMessageListener();
    const sendResponse = vi.fn();

    listener({ type: 'DELETE_ALL_SESSIONS' }, {} as chrome.runtime.MessageSender, sendResponse);
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: {
        sessions: {},
        nodes: {},
        edges: {},
        settings: created.data.settings
      }
    });
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      data: {
        sessions: {},
        nodes: {},
        edges: {},
        settings: created.data.settings
      }
    });
  });

  it('deletes selected sessions through runtime message', async () => {
    const first = createSearchSession(createEmptyData(), {
      query: 'delete one',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    const second = createSearchSession(first.data, {
      query: 'delete two',
      tabId: 2,
      now: '2026-05-06T00:01:00.000Z'
    });
    const third = createSearchSession(second.data, {
      query: 'keep three',
      tabId: 3,
      now: '2026-05-06T00:02:00.000Z'
    });
    localStorageMock.get.mockResolvedValue({ linkSpaceData: third.data });
    localStorageMock.set.mockResolvedValue(undefined);

    await import('./index');
    const listener = getRuntimeMessageListener();
    const sendResponse = vi.fn();

    listener(
      { type: 'DELETE_SESSIONS', sessionIds: [first.sessionId, second.sessionId] },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );
    await vi.runAllTimersAsync();

    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      data: expect.objectContaining({
        sessions: {
          [third.sessionId]: third.data.sessions[third.sessionId]
        }
      })
    });
  });

  it('returns expired sessions as ended on GET_DATA', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:31:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'expired get data',
      tabId: 13,
      now: '2026-05-06T00:00:00.000Z'
    });
    localStorageMock.get.mockResolvedValue({ linkSpaceData: created.data });
    localStorageMock.set.mockResolvedValue(undefined);

    await import('./index');
    const listener = getRuntimeMessageListener();
    const sendResponse = vi.fn();

    listener({ type: 'GET_DATA' }, {} as chrome.runtime.MessageSender, sendResponse);
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.objectContaining({
          [created.sessionId]: expect.objectContaining({
            status: 'ended',
            endedAt: '2026-05-06T00:31:00.000Z'
          })
        })
      })
    });
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      data: expect.objectContaining({
        sessions: expect.objectContaining({
          [created.sessionId]: expect.objectContaining({
            status: 'ended'
          })
        })
      })
    });
  });

  it('ends active sessions when recording is paused and does not attach later links after resume', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:12:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'pause privacy',
      tabId: 16,
      now: '2026-05-06T00:00:00.000Z'
    });
    localStorageMock.get.mockResolvedValue({ linkSpaceData: created.data });
    localStorageMock.set.mockResolvedValue(undefined);
    tabsMock.get.mockResolvedValue({ title: 'Later Link' });

    await import('./index');
    const messageListener = getRuntimeMessageListener();
    const navigationListener = getNavigationListener();
    const sendResponse = vi.fn();

    messageListener(
      { type: 'SET_RECORDING_PAUSED', paused: true },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );
    await vi.runAllTimersAsync();

    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      data: expect.objectContaining({
        settings: expect.objectContaining({
          recordingPaused: true
        }),
        sessions: expect.objectContaining({
          [created.sessionId]: expect.objectContaining({
            status: 'ended',
            endedAt: '2026-05-06T00:12:00.000Z'
          })
        })
      })
    });

    const pausedResponse = sendResponse.mock.calls[0][0] as { ok: true; data: ReturnType<typeof createEmptyData> };
    localStorageMock.set.mockClear();
    sendResponse.mockClear();
    localStorageMock.get.mockResolvedValue({ linkSpaceData: pausedResponse.data });

    messageListener(
      { type: 'SET_RECORDING_PAUSED', paused: false },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );
    await vi.runAllTimersAsync();

    const resumedResponse = sendResponse.mock.calls[0][0] as { ok: true; data: ReturnType<typeof createEmptyData> };
    localStorageMock.set.mockClear();
    localStorageMock.get.mockResolvedValue({ linkSpaceData: resumedResponse.data });

    navigationListener(
      createNavigationDetails({
        tabId: 16,
        url: 'https://example.com/later',
        transitionType: 'link'
      })
    );
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).not.toHaveBeenCalled();
  });

  it('ends active tab session without creating visits when navigation happens while paused', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:13:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'paused navigation',
      tabId: 17,
      now: '2026-05-06T00:00:00.000Z'
    });
    const pausedData = {
      ...created.data,
      settings: {
        ...created.data.settings,
        recordingPaused: true
      }
    };

    localStorageMock.get.mockResolvedValue({ linkSpaceData: pausedData });
    localStorageMock.set.mockResolvedValue(undefined);
    tabsMock.get.mockResolvedValue({ title: 'Paused Link' });

    await import('./index');
    const listener = getNavigationListener();

    listener(
      createNavigationDetails({
        tabId: 17,
        url: 'https://example.com/paused',
        transitionType: 'link'
      })
    );
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        settings: expect.objectContaining({
          recordingPaused: true
        }),
        sessions: expect.objectContaining({
          [created.sessionId]: expect.objectContaining({
            status: 'ended',
            endedAt: '2026-05-06T00:13:00.000Z',
            nodeIds: ['node-1']
          })
        }),
        nodes: expect.not.objectContaining({
          'node-2': expect.anything()
        })
      })
    });
  });

  it('ends active sessions for a tab when the tab is closed', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:09:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'tab close',
      tabId: 14,
      now: '2026-05-06T00:00:00.000Z'
    });
    localStorageMock.get.mockResolvedValue({ linkSpaceData: created.data });
    localStorageMock.set.mockResolvedValue(undefined);

    await import('./index');
    const listener = tabsMock.onRemoved.addListener.mock.calls[0][0] as (tabId: number) => void;

    listener(14);
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.objectContaining({
          [created.sessionId]: expect.objectContaining({
            status: 'ended',
            endedAt: '2026-05-06T00:09:00.000Z'
          })
        })
      })
    });
  });

  it('ends previous active session in the same tab when a new Google search starts', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:10:00.000Z'));

    const first = createSearchSession(createEmptyData(), {
      query: 'first query',
      tabId: 4,
      now: '2026-05-06T00:00:00.000Z'
    });
    localStorageMock.get.mockResolvedValue({ linkSpaceData: first.data });
    localStorageMock.set.mockResolvedValue(undefined);

    await import('./index');
    const listener = getNavigationListener();

    listener(createNavigationDetails({ tabId: 4, url: 'https://www.google.com/search?q=second' }));
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.objectContaining({
          [first.sessionId]: expect.objectContaining({
            status: 'ended',
            endedAt: '2026-05-06T00:10:00.000Z'
          }),
          'session-2': expect.objectContaining({
            query: 'second',
            status: 'active',
            tabId: 4
          })
        })
      })
    });
  });

  it('starts a new Google session when query matches an older active session but not the latest', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:25:00.000Z'));

    const older = createSearchSession(createEmptyData(), {
      query: 'A',
      tabId: 6,
      now: '2026-05-06T00:00:00.000Z'
    });
    const newer = createSearchSession(older.data, {
      query: 'B',
      tabId: 6,
      now: '2026-05-06T00:10:00.000Z'
    });
    localStorageMock.get.mockResolvedValue({ linkSpaceData: newer.data });
    localStorageMock.set.mockResolvedValue(undefined);

    await import('./index');
    const listener = getNavigationListener();

    listener(createNavigationDetails({ tabId: 6, url: 'https://www.google.com/search?q=A' }));
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.objectContaining({
          [older.sessionId]: expect.objectContaining({
            status: 'ended',
            endedAt: '2026-05-06T00:25:00.000Z'
          }),
          [newer.sessionId]: expect.objectContaining({
            status: 'ended',
            endedAt: '2026-05-06T00:25:00.000Z'
          }),
          'session-3': expect.objectContaining({
            query: 'A',
            status: 'active',
            tabId: 6
          })
        })
      })
    });
  });

  it('recovers the latest active session when multiple sessions exist for one tab', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:20:00.000Z'));

    const first = createSearchSession(createEmptyData(), {
      query: 'older',
      tabId: 5,
      now: '2026-05-06T00:00:00.000Z'
    });
    const second = createSearchSession(first.data, {
      query: 'newer',
      tabId: 5,
      now: '2026-05-06T00:10:00.000Z'
    });
    localStorageMock.get.mockResolvedValue({ linkSpaceData: second.data });
    localStorageMock.set.mockResolvedValue(undefined);
    tabsMock.get.mockResolvedValue({ title: 'Latest Page' });

    await import('./index');
    const listener = getNavigationListener();

    listener(createNavigationDetails({ tabId: 5, url: 'https://example.com/latest' }));
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.objectContaining({
          [second.sessionId]: expect.objectContaining({
            nodeIds: ['node-2', 'node-3']
          })
        }),
        nodes: expect.objectContaining({
          'node-3': expect.objectContaining({
            sessionId: second.sessionId,
            fromUrl: 'google://search?q=newer',
            title: 'Latest Page'
          })
        })
      })
    });
  });

  it('clears tracked navigation state after successful import', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:30:00.000Z'));

    const initial = createEmptyData();
    const imported = createSearchSession(createEmptyData(), {
      query: 'imported',
      tabId: 99,
      now: '2026-05-06T00:00:00.000Z'
    }).data;

    localStorageMock.get.mockResolvedValueOnce({ linkSpaceData: initial });
    localStorageMock.set.mockResolvedValue(undefined);

    await import('./index');
    const navigationListener = getNavigationListener();

    navigationListener(createNavigationDetails({ tabId: 7, url: 'https://www.google.com/search?q=stale' }));
    await vi.runAllTimersAsync();
    localStorageMock.set.mockClear();

    const messageListener = getRuntimeMessageListener();
    const sendResponse = vi.fn();
    messageListener(
      { type: 'IMPORT_DATA', payload: imported },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );
    await vi.runAllTimersAsync();
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, data: imported });
    localStorageMock.set.mockClear();
    localStorageMock.get.mockResolvedValue({ linkSpaceData: imported });
    tabsMock.get.mockResolvedValue({ title: 'Should Not Attach' });

    navigationListener(createNavigationDetails({ tabId: 7, url: 'https://example.com/stale' }));
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).not.toHaveBeenCalled();
  });
});

function getNavigationListener(): (
  details: chrome.webNavigation.WebNavigationTransitionCallbackDetails
) => void {
  return webNavigationMock.addListener.mock.calls[0][0] as (
    details: chrome.webNavigation.WebNavigationTransitionCallbackDetails
  ) => void;
}

function getRuntimeMessageListener(): (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => true {
  return runtimeMessageMock.addListener.mock.calls[0][0] as (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => true;
}

function createNavigationDetails({
  tabId,
  url,
  transitionType = 'link',
  transitionQualifiers = []
}: {
  tabId: number;
  url: string;
  transitionType?: chrome.webNavigation.WebNavigationTransitionCallbackDetails['transitionType'];
  transitionQualifiers?: chrome.webNavigation.WebNavigationTransitionCallbackDetails['transitionQualifiers'];
}): chrome.webNavigation.WebNavigationTransitionCallbackDetails {
  return {
    frameId: 0,
    tabId,
    url,
    timeStamp: 0,
    documentId: 'document-1',
    documentLifecycle: 'active',
    frameType: 'outermost_frame',
    processId: 1,
    parentFrameId: -1,
    transitionType,
    transitionQualifiers
  };
}

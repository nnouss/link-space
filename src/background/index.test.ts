import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearchSession } from '../shared/session';
import { createEmptyData } from '../shared/storage';

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

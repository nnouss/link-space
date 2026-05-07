import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserSession, createSearchSession } from '../shared/session';
import { createEmptyData } from '../shared/storage';
import type { LinkSpaceData } from '../shared/types';

const localStorageMock = chrome.storage.local as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

const webNavigationMock = chrome.webNavigation.onCommitted as unknown as {
  addListener: ReturnType<typeof vi.fn>;
};

const historyStateNavigationMock = chrome.webNavigation.onHistoryStateUpdated as unknown as {
  addListener: ReturnType<typeof vi.fn>;
};

const runtimeMessageMock = chrome.runtime.onMessage as unknown as {
  addListener: ReturnType<typeof vi.fn>;
};

const tabsMock = chrome.tabs as unknown as {
  get: ReturnType<typeof vi.fn>;
  onCreated: { addListener: ReturnType<typeof vi.fn> };
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
    tabsMock.get.mockResolvedValue({ title: 'Example Page' });

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

  it('starts a browser session from the first page visit in an untracked tab', async () => {
    vi.setSystemTime(new Date('2026-05-07T00:01:00.000Z'));

    localStorageMock.get.mockResolvedValue({ linkSpaceData: createEmptyData() });
    localStorageMock.set.mockResolvedValue(undefined);
    tabsMock.get.mockResolvedValue({ title: 'Example Root' });

    await import('./index');
    const listener = getNavigationListener();

    listener(createNavigationDetails({ tabId: 31, url: 'https://example.com/root' }));
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.objectContaining({
          'session-1': expect.objectContaining({
            query: 'Example Root',
            status: 'active',
            rootNodeId: 'node-1',
            currentNodeId: 'node-1',
            nodeIds: ['node-1'],
            edgeIds: [],
            tabId: 31
          })
        }),
        nodes: expect.objectContaining({
          'node-1': expect.objectContaining({
            url: 'https://example.com/root',
            title: 'Example Root',
            domain: 'example.com',
            depth: 0,
            isSearchResultClick: false
          })
        })
      })
    });
  });

  it('treats a Google search URL as a normal browser root page', async () => {
    vi.setSystemTime(new Date('2026-05-07T00:02:00.000Z'));

    localStorageMock.get.mockResolvedValue({ linkSpaceData: createEmptyData() });
    localStorageMock.set.mockResolvedValue(undefined);
    tabsMock.get.mockResolvedValue({ title: 'Google Results' });

    await import('./index');
    const listener = getNavigationListener();

    listener(createNavigationDetails({ tabId: 32, url: 'https://www.google.com/search?q=keyboard' }));
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.objectContaining({
          'session-1': expect.objectContaining({
            query: 'Google Results',
            rootNodeId: 'node-1',
            currentNodeId: 'node-1'
          })
        }),
        nodes: expect.objectContaining({
          'node-1': expect.objectContaining({
            url: 'https://www.google.com/search?q=keyboard',
            title: 'Google Results',
            domain: 'www.google.com',
            depth: 0
          })
        })
      })
    });
    expect(localStorageMock.set.mock.calls[0][0].linkSpaceData.nodes['node-1'].url).not.toContain('google://search');
  });

  it('does not start an untracked root session after pause and quick resume while tab title is pending', async () => {
    vi.setSystemTime(new Date('2026-05-07T00:03:00.000Z'));

    let currentData: LinkSpaceData = createEmptyData();
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

    navigationListener(createNavigationDetails({ tabId: 33, url: 'https://example.com/root-race' }));
    await vi.waitFor(() => {
      expect(tabsMock.get).toHaveBeenCalledWith(33);
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
    expect(currentData.sessions).toEqual({});
    expect(currentData.nodes).toEqual({});

    localStorageMock.set.mockClear();
    resolveTab({ title: 'Late Root' });
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).not.toHaveBeenCalled();
    expect(currentData.sessions).toEqual({});
    expect(currentData.nodes).toEqual({});
  });

  it('ends the active tab session and starts a new root for typed navigation', async () => {
    vi.setSystemTime(new Date('2026-05-07T00:04:00.000Z'));

    const created = createBrowserSession(createEmptyData(), {
      url: 'https://example.com/start',
      title: 'Start Page',
      tabId: 11,
      now: '2026-05-07T00:00:00.000Z'
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
            endedAt: '2026-05-07T00:04:00.000Z',
            nodeIds: ['node-1']
          }),
          'session-2': expect.objectContaining({
            query: 'Typed Page',
            status: 'active',
            rootNodeId: 'node-2',
            currentNodeId: 'node-2',
            nodeIds: ['node-2'],
            tabId: 11
          })
        }),
        nodes: expect.objectContaining({
          'node-2': expect.objectContaining({
            url: 'https://sensitive.example/page',
            title: 'Typed Page',
            depth: 0
          })
        })
      })
    });
  });

  it('attaches a later link navigation to the typed root session', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:06:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'typed then link',
      tabId: 15,
      now: '2026-05-06T00:00:00.000Z'
    });
    let currentData: LinkSpaceData = created.data;

    localStorageMock.get.mockImplementation(() => Promise.resolve({ linkSpaceData: currentData }));
    localStorageMock.set.mockImplementation(({ linkSpaceData }: { linkSpaceData: LinkSpaceData }) => {
      currentData = linkSpaceData;
      return Promise.resolve();
    });
    tabsMock.get
      .mockResolvedValueOnce({ title: 'Typed Page' })
      .mockResolvedValueOnce({ title: 'Later Link' });

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

    listener(
      createNavigationDetails({
        tabId: 15,
        url: 'https://example.com/later',
        transitionType: 'link'
      })
    );
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.objectContaining({
          [created.sessionId]: expect.objectContaining({
            status: 'ended',
            nodeIds: ['node-1']
          }),
          'session-2': expect.objectContaining({
            status: 'active',
            rootNodeId: 'node-2',
            currentNodeId: 'node-3',
            nodeIds: ['node-2', 'node-3'],
            tabId: 15
          })
        }),
        nodes: expect.objectContaining({
          'node-2': expect.objectContaining({
            url: 'https://sensitive.example/page',
            title: 'Typed Page',
            depth: 0
          }),
          'node-3': expect.objectContaining({
            sessionId: 'session-2',
            url: 'https://example.com/later',
            title: 'Later Link',
            fromUrl: 'https://sensitive.example/page',
            depth: 1
          })
        }),
        edges: expect.objectContaining({
          'edge-1': expect.objectContaining({
            sessionId: 'session-2',
            fromNodeId: 'node-2',
            toNodeId: 'node-3'
          })
        })
      })
    });
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

  it('restores an existing page instead of adding a new edge when browser back is reported as a link navigation', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:08:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'back dedupe',
      tabId: 22,
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

    listener(createNavigationDetails({ tabId: 22, url: 'https://example.com/a' }));
    await vi.runAllTimersAsync();

    listener(createNavigationDetails({ tabId: 22, url: 'https://example.com/b' }));
    await vi.runAllTimersAsync();

    listener(createNavigationDetails({ tabId: 22, url: 'https://example.com/a' }));
    await vi.runAllTimersAsync();

    listener(createNavigationDetails({ tabId: 22, url: 'https://example.com/c' }));
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

  it('keeps the restored page after the background worker restarts before the next click', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:09:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'back restart',
      tabId: 23,
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
    let listener = getNavigationListener();

    listener(createNavigationDetails({ tabId: 23, url: 'https://example.com/a' }));
    await vi.runAllTimersAsync();

    listener(createNavigationDetails({ tabId: 23, url: 'https://example.com/b' }));
    await vi.runAllTimersAsync();

    listener(
      createNavigationDetails({
        tabId: 23,
        url: 'https://example.com/a',
        transitionQualifiers: ['forward_back']
      })
    );
    await vi.runAllTimersAsync();

    expect(currentData.sessions[created.sessionId]).toEqual(
      expect.objectContaining({
        currentNodeId: 'node-2'
      })
    );

    vi.resetModules();
    await import('./index');
    listener = getNavigationListener();

    listener(createNavigationDetails({ tabId: 23, url: 'https://example.com/c' }));
    await vi.runAllTimersAsync();

    expect(currentData.sessions[created.sessionId].nodeIds).toEqual([
      'node-1',
      'node-2',
      'node-3',
      'node-4'
    ]);
    expect(currentData.nodes['node-4']).toMatchObject({
      url: 'https://example.com/c',
      depth: 2,
      fromUrl: 'https://example.com/a'
    });
    expect(currentData.sessions[created.sessionId].edgeIds).toEqual(['edge-1', 'edge-2', 'edge-3']);
  });

  it('records a site-internal SPA navigation as a linked page visit', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:11:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'coupang',
      tabId: 24,
      now: '2026-05-06T00:00:00.000Z'
    });
    let currentData: LinkSpaceData = created.data;

    localStorageMock.get.mockImplementation(() => Promise.resolve({ linkSpaceData: currentData }));
    localStorageMock.set.mockImplementation(({ linkSpaceData }: { linkSpaceData: LinkSpaceData }) => {
      currentData = linkSpaceData;
      return Promise.resolve();
    });
    tabsMock.get.mockImplementation(() => Promise.resolve({ title: 'Coupang Product' }));

    await import('./index');
    const committedListener = getNavigationListener();
    const historyListener = getHistoryStateNavigationListener();

    committedListener(createNavigationDetails({ tabId: 24, url: 'https://www.coupang.com/np/search?q=keyboard' }));
    await vi.runAllTimersAsync();

    historyListener(
      createNavigationDetails({
        tabId: 24,
        url: 'https://www.coupang.com/vp/products/123',
        transitionType: 'link'
      })
    );
    await vi.runAllTimersAsync();

    expect(currentData.sessions[created.sessionId].nodeIds).toEqual(['node-1', 'node-2', 'node-3']);
    expect(currentData.nodes['node-3']).toMatchObject({
      url: 'https://www.coupang.com/vp/products/123',
      fromUrl: 'https://www.coupang.com/np/search?q=keyboard'
    });
  });

  it('links a page opened in a new tab back to the opener page', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:12:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'new tab',
      tabId: 25,
      now: '2026-05-06T00:00:00.000Z'
    });
    let currentData: LinkSpaceData = created.data;

    localStorageMock.get.mockImplementation(() => Promise.resolve({ linkSpaceData: currentData }));
    localStorageMock.set.mockImplementation(({ linkSpaceData }: { linkSpaceData: LinkSpaceData }) => {
      currentData = linkSpaceData;
      return Promise.resolve();
    });
    tabsMock.get.mockImplementation((tabId: number) =>
      Promise.resolve({ title: tabId === 26 ? 'Opened Product' : 'Coupang Search' })
    );

    await import('./index');
    const navigationListener = getNavigationListener();
    const tabCreatedListener = getTabCreatedListener();

    navigationListener(createNavigationDetails({ tabId: 25, url: 'https://www.coupang.com/np/search?q=mouse' }));
    await vi.runAllTimersAsync();

    tabCreatedListener({ id: 26, openerTabId: 25 } as chrome.tabs.Tab);

    navigationListener(createNavigationDetails({ tabId: 26, url: 'https://www.coupang.com/vp/products/456' }));
    await vi.runAllTimersAsync();

    expect(currentData.sessions[created.sessionId].nodeIds).toEqual(['node-1', 'node-2', 'node-3']);
    expect(currentData.nodes['node-3']).toMatchObject({
      url: 'https://www.coupang.com/vp/products/456',
      fromUrl: 'https://www.coupang.com/np/search?q=mouse',
      title: 'Opened Product'
    });
  });

  it('branches from the restored opener page in a child tab after child tab back navigation', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:12:30.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'child back',
      tabId: 27,
      now: '2026-05-06T00:00:00.000Z'
    });
    let currentData: LinkSpaceData = created.data;

    localStorageMock.get.mockImplementation(() => Promise.resolve({ linkSpaceData: currentData }));
    localStorageMock.set.mockImplementation(({ linkSpaceData }: { linkSpaceData: LinkSpaceData }) => {
      currentData = linkSpaceData;
      return Promise.resolve();
    });
    tabsMock.get.mockImplementation((tabId: number) =>
      Promise.resolve({ title: tabId === 28 ? 'Child Page' : 'Opener Page' })
    );

    await import('./index');
    const navigationListener = getNavigationListener();
    const tabCreatedListener = getTabCreatedListener();

    navigationListener(createNavigationDetails({ tabId: 27, url: 'https://example.com/a' }));
    await vi.runAllTimersAsync();
    tabCreatedListener({ id: 28, openerTabId: 27 } as chrome.tabs.Tab);
    navigationListener(createNavigationDetails({ tabId: 28, url: 'https://example.com/b' }));
    await vi.runAllTimersAsync();

    navigationListener(
      createNavigationDetails({
        tabId: 28,
        url: 'https://example.com/a',
        transitionQualifiers: ['forward_back']
      })
    );
    await vi.runAllTimersAsync();
    navigationListener(createNavigationDetails({ tabId: 28, url: 'https://example.com/c' }));
    await vi.runAllTimersAsync();

    expect(currentData.sessions[created.sessionId].nodeIds).toEqual([
      'node-1',
      'node-2',
      'node-3',
      'node-4'
    ]);
    expect(currentData.nodes['node-4']).toMatchObject({
      url: 'https://example.com/c',
      fromUrl: 'https://example.com/a',
      depth: 2
    });
    expect(currentData.sessions[created.sessionId].edgeIds).toEqual(['edge-1', 'edge-2', 'edge-3']);
  });

  it('does not start a new session when an untracked tab reloads', async () => {
    vi.setSystemTime(new Date('2026-05-07T00:16:00.000Z'));

    localStorageMock.get.mockResolvedValue({ linkSpaceData: createEmptyData() });
    localStorageMock.set.mockResolvedValue(undefined);
    tabsMock.get.mockResolvedValue({ title: 'Reloaded Page' });

    await import('./index');
    const listener = getNavigationListener();

    listener(
      createNavigationDetails({
        tabId: 34,
        url: 'https://example.com/reloaded',
        transitionType: 'reload'
      })
    );
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).not.toHaveBeenCalled();
  });

  it('does not add a node when a child page reloads', async () => {
    vi.setSystemTime(new Date('2026-05-07T00:17:00.000Z'));

    const created = createBrowserSession(createEmptyData(), {
      url: 'https://example.com/root',
      title: 'Root Page',
      tabId: 35,
      now: '2026-05-07T00:00:00.000Z'
    });
    let currentData: LinkSpaceData = created.data;

    localStorageMock.get.mockImplementation(() => Promise.resolve({ linkSpaceData: currentData }));
    localStorageMock.set.mockImplementation(({ linkSpaceData }: { linkSpaceData: LinkSpaceData }) => {
      currentData = linkSpaceData;
      return Promise.resolve();
    });
    tabsMock.get.mockResolvedValue({ title: 'Child Page' });

    await import('./index');
    const listener = getNavigationListener();

    listener(createNavigationDetails({ tabId: 35, url: 'https://example.com/child' }));
    await vi.runAllTimersAsync();
    localStorageMock.set.mockClear();

    listener(
      createNavigationDetails({
        tabId: 35,
        url: 'https://example.com/child',
        transitionType: 'reload'
      })
    );
    await vi.runAllTimersAsync();

    expect(currentData.sessions[created.sessionId].nodeIds).toEqual(['node-1', 'node-2']);
    expect(currentData.sessions[created.sessionId].edgeIds).toEqual(['edge-1']);
    expect(currentData.sessions[created.sessionId]).toEqual(
      expect.objectContaining({
        currentNodeId: 'node-2',
        currentNodeIdByTab: expect.objectContaining({
          35: 'node-2'
        })
      })
    );
    expect(localStorageMock.set).not.toHaveBeenCalled();
  });

  it('restores an existing parent page when browser back is reported as reload', async () => {
    vi.setSystemTime(new Date('2026-05-07T00:18:00.000Z'));

    const created = createBrowserSession(createEmptyData(), {
      url: 'https://example.com/root',
      title: 'Root Page',
      tabId: 36,
      now: '2026-05-07T00:00:00.000Z'
    });
    let currentData: LinkSpaceData = created.data;

    localStorageMock.get.mockImplementation(() => Promise.resolve({ linkSpaceData: currentData }));
    localStorageMock.set.mockImplementation(({ linkSpaceData }: { linkSpaceData: LinkSpaceData }) => {
      currentData = linkSpaceData;
      return Promise.resolve();
    });
    tabsMock.get.mockResolvedValue({ title: 'Visited Page' });

    await import('./index');
    const listener = getNavigationListener();

    listener(createNavigationDetails({ tabId: 36, url: 'https://example.com/a' }));
    await vi.runAllTimersAsync();
    listener(createNavigationDetails({ tabId: 36, url: 'https://example.com/b' }));
    await vi.runAllTimersAsync();

    listener(
      createNavigationDetails({
        tabId: 36,
        url: 'https://example.com/a',
        transitionType: 'reload'
      })
    );
    await vi.runAllTimersAsync();

    expect(currentData.sessions[created.sessionId].nodeIds).toEqual(['node-1', 'node-2', 'node-3']);
    expect(currentData.sessions[created.sessionId].edgeIds).toEqual(['edge-1', 'edge-2']);
    expect(currentData.sessions[created.sessionId]).toEqual(
      expect.objectContaining({
        currentNodeId: 'node-2',
        currentNodeIdByTab: expect.objectContaining({
          36: 'node-2'
        })
      })
    );
  });

  it('restores an existing page when browser back returns to a trailing-slash variant', async () => {
    vi.setSystemTime(new Date('2026-05-07T00:19:00.000Z'));

    const created = createBrowserSession(createEmptyData(), {
      url: 'https://example.com/root',
      title: 'Root Page',
      tabId: 37,
      now: '2026-05-07T00:00:00.000Z'
    });
    let currentData: LinkSpaceData = created.data;

    localStorageMock.get.mockImplementation(() => Promise.resolve({ linkSpaceData: currentData }));
    localStorageMock.set.mockImplementation(({ linkSpaceData }: { linkSpaceData: LinkSpaceData }) => {
      currentData = linkSpaceData;
      return Promise.resolve();
    });
    tabsMock.get.mockResolvedValue({ title: 'Visited Page' });

    await import('./index');
    const listener = getNavigationListener();

    listener(createNavigationDetails({ tabId: 37, url: 'https://example.com/a' }));
    await vi.runAllTimersAsync();
    listener(createNavigationDetails({ tabId: 37, url: 'https://example.com/b' }));
    await vi.runAllTimersAsync();

    listener(createNavigationDetails({ tabId: 37, url: 'https://example.com/a/' }));
    await vi.runAllTimersAsync();

    expect(currentData.sessions[created.sessionId].nodeIds).toEqual(['node-1', 'node-2', 'node-3']);
    expect(currentData.sessions[created.sessionId].edgeIds).toEqual(['edge-1', 'edge-2']);
    expect(currentData.sessions[created.sessionId]).toEqual(
      expect.objectContaining({
        currentNodeId: 'node-2',
        currentNodeIdByTab: expect.objectContaining({
          37: 'node-2'
        })
      })
    );
  });

  it('keeps the opener tab current node after a child tab visit and worker restart', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:12:45.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'opener restart',
      tabId: 29,
      now: '2026-05-06T00:00:00.000Z'
    });
    let currentData: LinkSpaceData = created.data;

    localStorageMock.get.mockImplementation(() => Promise.resolve({ linkSpaceData: currentData }));
    localStorageMock.set.mockImplementation(({ linkSpaceData }: { linkSpaceData: LinkSpaceData }) => {
      currentData = linkSpaceData;
      return Promise.resolve();
    });
    tabsMock.get.mockImplementation((tabId: number) =>
      Promise.resolve({ title: tabId === 30 ? 'Child B' : 'Opener Page' })
    );

    await import('./index');
    let navigationListener = getNavigationListener();
    const tabCreatedListener = getTabCreatedListener();

    navigationListener(createNavigationDetails({ tabId: 29, url: 'https://example.com/a' }));
    await vi.runAllTimersAsync();
    tabCreatedListener({ id: 30, openerTabId: 29 } as chrome.tabs.Tab);
    navigationListener(createNavigationDetails({ tabId: 30, url: 'https://example.com/b' }));
    await vi.runAllTimersAsync();

    vi.resetModules();
    await import('./index');
    navigationListener = getNavigationListener();

    navigationListener(createNavigationDetails({ tabId: 29, url: 'https://example.com/c' }));
    await vi.runAllTimersAsync();

    expect(currentData.sessions[created.sessionId].nodeIds).toEqual([
      'node-1',
      'node-2',
      'node-3',
      'node-4'
    ]);
    expect(currentData.nodes['node-4']).toMatchObject({
      url: 'https://example.com/c',
      fromUrl: 'https://example.com/a',
      depth: 2
    });
    expect(currentData.sessions[created.sessionId].edgeIds).toEqual(['edge-1', 'edge-2', 'edge-3']);
  });

  it('does not create a new root when an active page opens a link in a new tab', async () => {
    vi.setSystemTime(new Date('2026-05-07T00:03:00.000Z'));

    const created = createBrowserSession(createEmptyData(), {
      url: 'https://namu.wiki/w/keyboard',
      title: 'Keyboard Wiki',
      tabId: 41,
      now: '2026-05-07T00:00:00.000Z'
    });
    let currentData: LinkSpaceData = created.data;

    localStorageMock.get.mockImplementation(() => Promise.resolve({ linkSpaceData: currentData }));
    localStorageMock.set.mockImplementation(({ linkSpaceData }: { linkSpaceData: LinkSpaceData }) => {
      currentData = linkSpaceData;
      return Promise.resolve();
    });
    tabsMock.get.mockImplementation((tabId: number) =>
      Promise.resolve({ title: tabId === 42 ? 'Coupang Product' : 'Keyboard Wiki' })
    );

    await import('./index');
    const tabCreatedListener = getTabCreatedListener();
    const navigationListener = getNavigationListener();

    navigationListener(createNavigationDetails({ tabId: 41, url: 'https://namu.wiki/w/keyboard' }));
    await vi.runAllTimersAsync();
    tabCreatedListener({ id: 42, openerTabId: 41 } as chrome.tabs.Tab);
    navigationListener(createNavigationDetails({ tabId: 42, url: 'https://www.coupang.com/vp/products/456' }));
    await vi.runAllTimersAsync();

    expect(Object.values(currentData.sessions)).toHaveLength(1);
    expect(currentData.sessions[created.sessionId].nodeIds).toEqual(['node-1', 'node-2']);
    expect(currentData.nodes['node-2']).toMatchObject({
      url: 'https://www.coupang.com/vp/products/456',
      fromUrl: 'https://namu.wiki/w/keyboard',
      depth: 1,
      title: 'Coupang Product'
    });
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

  it('does not let an in-flight page visit save after recording version changes without pausing', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:16:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'version race',
      tabId: 20,
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
        tabId: 20,
        url: 'https://example.com/version-race',
        transitionType: 'link'
      })
    );
    await vi.waitFor(() => {
      expect(tabsMock.get).toHaveBeenCalledWith(20);
    });

    messageListener(
      { type: 'SET_RECORDING_PAUSED', paused: false },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );
    await vi.runAllTimersAsync();
    localStorageMock.set.mockClear();

    resolveTab({ title: 'Version Race Page' });
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).not.toHaveBeenCalled();
    expect(currentData.sessions[created.sessionId].nodeIds).toEqual(['node-1']);
    expect(currentData.nodes).not.toHaveProperty('node-2');
  });

  it('does not let a stale paused navigation save after pause and resume completed', async () => {
    vi.setSystemTime(new Date('2026-05-06T00:17:00.000Z'));

    const created = createSearchSession(createEmptyData(), {
      query: 'stale paused snapshot',
      tabId: 43,
      now: '2026-05-06T00:00:00.000Z'
    });
    const stalePausedData: LinkSpaceData = {
      ...created.data,
      settings: {
        ...created.data.settings,
        recordingPaused: true
      }
    };
    let currentData: LinkSpaceData = created.data;
    let resolveNavigationLoad: (data: { linkSpaceData: LinkSpaceData }) => void = () => undefined;
    const pendingNavigationLoad = new Promise<{ linkSpaceData: LinkSpaceData }>((resolve) => {
      resolveNavigationLoad = resolve;
    });

    localStorageMock.get
      .mockReturnValueOnce(pendingNavigationLoad)
      .mockImplementation(() => Promise.resolve({ linkSpaceData: currentData }));
    localStorageMock.set.mockImplementation(({ linkSpaceData }: { linkSpaceData: LinkSpaceData }) => {
      currentData = linkSpaceData;
      return Promise.resolve();
    });

    await import('./index');
    const navigationListener = getNavigationListener();
    const messageListener = getRuntimeMessageListener();
    const sendResponse = vi.fn();

    navigationListener(createNavigationDetails({ tabId: 43, url: 'https://example.com/stale-paused' }));
    await vi.waitFor(() => {
      expect(localStorageMock.get).toHaveBeenCalledTimes(1);
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
    localStorageMock.set.mockClear();

    resolveNavigationLoad({ linkSpaceData: stalePausedData });
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).not.toHaveBeenCalled();
    expect(currentData.settings.recordingPaused).toBe(false);
    expect(currentData.sessions[created.sessionId]).toEqual(
      expect.objectContaining({
        status: 'ended',
        nodeIds: ['node-1']
      })
    );
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

    const created = createBrowserSession(createEmptyData(), {
      url: 'https://example.com/pause',
      title: 'Pause Privacy',
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

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.objectContaining({
          [created.sessionId]: expect.objectContaining({
            status: 'ended'
          }),
          'session-2': expect.objectContaining({
            query: 'Later Link',
            status: 'active',
            tabId: 16,
            rootNodeId: 'node-2'
          })
        }),
        nodes: expect.objectContaining({
          'node-2': expect.objectContaining({
            url: 'https://example.com/later',
            title: 'Later Link',
            depth: 0
          })
        })
      })
    });
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

  it('adds a Google search page as a child when reached from an active page', async () => {
    vi.setSystemTime(new Date('2026-05-07T00:05:00.000Z'));

    const created = createBrowserSession(createEmptyData(), {
      url: 'https://example.com/start',
      title: 'Start Page',
      tabId: 4,
      now: '2026-05-07T00:00:00.000Z'
    });
    localStorageMock.get.mockResolvedValue({ linkSpaceData: created.data });
    localStorageMock.set.mockResolvedValue(undefined);
    tabsMock.get.mockResolvedValue({ title: 'Google Results' });

    await import('./index');
    const listener = getNavigationListener();

    listener(createNavigationDetails({ tabId: 4, url: 'https://www.google.com/search?q=second' }));
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.objectContaining({
          [created.sessionId]: expect.objectContaining({
            status: 'active',
            nodeIds: ['node-1', 'node-2'],
            edgeIds: ['edge-1']
          })
        }),
        nodes: expect.objectContaining({
          'node-2': expect.objectContaining({
            url: 'https://www.google.com/search?q=second',
            title: 'Google Results',
            fromUrl: 'https://example.com/start'
          })
        })
      })
    });

    const savedData = localStorageMock.set.mock.calls[0][0].linkSpaceData as LinkSpaceData;
    expect(savedData.sessions).not.toHaveProperty('session-2');
  });

  it('starts an untracked Google search tab as a normal browser root', async () => {
    vi.setSystemTime(new Date('2026-05-07T00:06:00.000Z'));

    const existing = createBrowserSession(createEmptyData(), {
      url: 'https://example.com/existing',
      title: 'Existing Page',
      tabId: 6,
      now: '2026-05-07T00:00:00.000Z'
    });
    localStorageMock.get.mockResolvedValue({ linkSpaceData: existing.data });
    localStorageMock.set.mockResolvedValue(undefined);
    tabsMock.get.mockResolvedValue({ title: 'Google A' });

    await import('./index');
    const listener = getNavigationListener();

    listener(createNavigationDetails({ tabId: 60, url: 'https://www.google.com/search?q=A' }));
    await vi.runAllTimersAsync();

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.objectContaining({
          [existing.sessionId]: expect.objectContaining({
            status: 'active',
            tabId: 6
          }),
          'session-2': expect.objectContaining({
            query: 'Google A',
            status: 'active',
            tabId: 60,
            rootNodeId: 'node-2'
          })
        }),
        nodes: expect.objectContaining({
          'node-2': expect.objectContaining({
            url: 'https://www.google.com/search?q=A',
            title: 'Google A',
            depth: 0
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

    tabsMock.get.mockResolvedValue({ title: 'Stale Root' });
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

    expect(localStorageMock.set).toHaveBeenCalledWith({
      linkSpaceData: expect.objectContaining({
        sessions: expect.objectContaining({
          'session-1': expect.objectContaining({
            tabId: 99
          }),
          'session-2': expect.objectContaining({
            query: 'Should Not Attach',
            status: 'active',
            tabId: 7,
            rootNodeId: 'node-2'
          })
        }),
        nodes: expect.objectContaining({
          'node-2': expect.objectContaining({
            url: 'https://example.com/stale',
            title: 'Should Not Attach',
            depth: 0
          })
        })
      })
    });
  });
});

function getNavigationListener(): (
  details: chrome.webNavigation.WebNavigationTransitionCallbackDetails
) => void {
  return webNavigationMock.addListener.mock.calls[0][0] as (
    details: chrome.webNavigation.WebNavigationTransitionCallbackDetails
  ) => void;
}

function getHistoryStateNavigationListener(): (
  details: chrome.webNavigation.WebNavigationTransitionCallbackDetails
) => void {
  return historyStateNavigationMock.addListener.mock.calls[0][0] as (
    details: chrome.webNavigation.WebNavigationTransitionCallbackDetails
  ) => void;
}

function getTabCreatedListener(): (tab: chrome.tabs.Tab) => void {
  return tabsMock.onCreated.addListener.mock.calls[0][0] as (tab: chrome.tabs.Tab) => void;
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

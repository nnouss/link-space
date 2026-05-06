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
});

function createNavigationDetails({
  tabId,
  url
}: {
  tabId: number;
  url: string;
}): chrome.webNavigation.WebNavigationFramedCallbackDetails {
  return {
    frameId: 0,
    tabId,
    url,
    timeStamp: 0,
    documentId: 'document-1',
    documentLifecycle: 'active',
    frameType: 'outermost_frame',
    processId: 1,
    parentFrameId: -1
  };
}

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

    listener({
      frameId: 0,
      tabId: 9,
      url: 'https://example.com/page',
      timeStamp: 0,
      documentId: 'document-1',
      documentLifecycle: 'active',
      frameType: 'outermost_frame',
      processId: 1,
      parentFrameId: -1
    });
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
});

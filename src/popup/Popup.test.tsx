import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LinkSpaceData } from '../shared/types';
import { Popup } from './Popup';

describe('Popup', () => {
  it('renders the themed Korean control panel from captured data', async () => {
    const data = createData(false);
    const sendMessage = chrome.runtime.sendMessage as unknown as {
      mockResolvedValueOnce: (value: unknown) => void;
    };
    sendMessage.mockResolvedValueOnce({ ok: true, data });

    render(<Popup />);

    expect(await screen.findByText('검색 기록 중')).toBeTruthy();
    expect(screen.getByText('검색 경로 분석')).toBeTruthy();
    expect(screen.getByText('기록 일시정지')).toBeTruthy();
    expect(screen.getByText('대시보드')).toBeTruthy();
    expect(screen.getByText('최근 세션')).toBeTruthy();
    expect(screen.getByText('impeccable')).toBeTruthy();
    expect(screen.getByText('3개 노드')).toBeTruthy();
    expect(screen.getByRole('main').style.fontFamily).toContain('Pretendard');

    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'GET_DATA' });
    });
  });

  it('opens the dashboard from the popup action', async () => {
    const sendMessage = chrome.runtime.sendMessage as unknown as {
      mockResolvedValueOnce: (value: unknown) => void;
    };
    sendMessage.mockResolvedValueOnce({ ok: true, data: createData(false) });

    render(<Popup />);

    fireEvent.click(await screen.findByText('대시보드'));

    expect(chrome.runtime.getURL).toHaveBeenCalledWith('index.html');
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://test/index.html'
    });
  });
});

function createData(recordingPaused: boolean): LinkSpaceData {
  return {
    sessions: {
      'session-1': {
        id: 'session-1',
        query: 'impeccable',
        searchEngine: 'google',
        startedAt: '2026-05-06T00:00:00.000Z',
        lastActivityAt: '2026-05-06T00:01:00.000Z',
        status: 'ended',
        rootNodeId: 'node-1',
        nodeIds: ['node-1', 'node-2', 'node-3'],
        edgeIds: ['edge-1', 'edge-2']
      }
    },
    nodes: {},
    edges: {},
    settings: {
      recordingPaused,
      sessionTimeoutMinutes: 30
    }
  };
}

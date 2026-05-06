import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LinkSpaceData } from '../shared/types';
import { Dashboard } from './Dashboard';

vi.mock('react-force-graph-3d', () => ({
  default: ({ graphData, onNodeClick }: { graphData: { nodes: Array<{ page: unknown }> }; onNodeClick: (node: { page: unknown }) => void }) => (
    <button type="button" data-testid="graph-node" onClick={() => onNodeClick(graphData.nodes[0])}>
      graph node
    </button>
  )
}));

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

describe('Dashboard', () => {
  it('renders analysis-oriented dashboard copy from captured data', async () => {
    const data = createData();
    const sendMessage = chrome.runtime.sendMessage as unknown as {
      mockResolvedValueOnce: (value: unknown) => void;
    };
    sendMessage.mockResolvedValueOnce({ ok: true, data });

    render(<Dashboard />);

    expect(await screen.findByText('검색 경로 분석')).toBeTruthy();
    expect(screen.getByText('세션')).toBeTruthy();
    expect(screen.getByText('현재 세션')).toBeTruthy();
    expect(screen.getByText('내보내기')).toBeTruthy();
    expect(screen.getByText('가져오기')).toBeTruthy();
    expect(screen.getByText('선택됨')).toBeTruthy();
    expect(screen.queryByText('Active')).toBeNull();
    expect(screen.queryByText('Completed')).toBeNull();
    expect(screen.queryByText('Nodes')).toBeNull();
    expect(screen.queryByText('Links')).toBeNull();
    expect(screen.queryByText(/nodes \/.*links/)).toBeNull();

    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'GET_DATA' });
    });
  });

  it('shows a compact Korean node detail panel after selecting a graph node', async () => {
    const data = createData();
    const sendMessage = chrome.runtime.sendMessage as unknown as {
      mockResolvedValueOnce: (value: unknown) => void;
    };
    sendMessage.mockResolvedValueOnce({ ok: true, data });

    render(<Dashboard />);

    await screen.findByText('검색 경로 분석');
    fireEvent.click(screen.getByTestId('graph-node'));

    expect(screen.getByText('노드 상세')).toBeTruthy();
    expect(screen.getByText('Example Page')).toBeTruthy();
    expect(screen.getByText('example.com')).toBeTruthy();
    expect(screen.getByText('기본 정보')).toBeTruthy();
    expect(screen.getByText('깊이')).toBeTruthy();
    expect(screen.getByText('방문 횟수')).toBeTruthy();
    expect(screen.getByText('체류 시간')).toBeTruthy();
    expect(screen.getByText('방문 시각')).toBeTruthy();
    expect(screen.getByText('이전 URL')).toBeTruthy();
  });
});

function createData(): LinkSpaceData {
  return {
    sessions: {
      'session-1': {
        id: 'session-1',
        query: 'knowledge graph',
        searchEngine: 'google',
        startedAt: '2026-05-06T00:00:00.000Z',
        lastActivityAt: '2026-05-06T00:01:00.000Z',
        status: 'active',
        rootNodeId: 'node-1',
        nodeIds: ['node-1'],
        edgeIds: []
      }
    },
    nodes: {
      'node-1': {
        id: 'node-1',
        sessionId: 'session-1',
        url: 'https://example.com/page',
        title: 'Example Page',
        domain: 'example.com',
        visitedAt: '2026-05-06T00:01:00.000Z',
        dwellTime: 30_000,
        visitCount: 1,
        depth: 0,
        isSearchResultClick: true
      }
    },
    edges: {},
    settings: {
      recordingPaused: false,
      sessionTimeoutMinutes: 30
    }
  };
}

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LinkSpaceData } from '../shared/types';
import { Dashboard } from './Dashboard';

vi.mock('react-force-graph-3d', () => ({
  default: () => <div data-testid="force-graph-3d" />
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

    expect(await screen.findByText('Search path analysis')).toBeTruthy();
    expect(screen.getByText('Sessions')).toBeTruthy();
    expect(screen.getByText('Current session')).toBeTruthy();
    expect(screen.getByText('Export')).toBeTruthy();
    expect(screen.getByText('Import')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Nodes')).toBeTruthy();
    expect(screen.getByText('Links')).toBeTruthy();

    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'GET_DATA' });
    });
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

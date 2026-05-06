# Dashboard Design Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Link Space dashboard as a graph-first analysis console with readable copy, restrained styling, and clearer node/session inspection.

**Architecture:** Keep the existing React dashboard structure and 3D graph library. Update `Dashboard.tsx` for product UI layout/copy/states, and update `GraphView.tsx` for graph palette and empty state. Add narrow tests for dashboard copy and graph color behavior.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, `react-force-graph-3d`, `lucide-react`.

---

## File Structure

- Modify `src/dashboard/Dashboard.tsx`: dashboard copy, layout styles, session row metadata, HUD, drawer presentation.
- Modify `src/dashboard/GraphView.tsx`: graph background, node palette, link color, empty state copy.
- Modify `src/dashboard/GraphView.test.ts`: update expected node color to the new restrained palette.
- Create `src/dashboard/Dashboard.test.tsx`: verify user-facing dashboard copy renders from mocked runtime data.

## Task 1: Dashboard Copy Regression Test

**Files:**
- Create: `src/dashboard/Dashboard.test.tsx`
- Modify: `src/test/chromeMock.ts` only if the existing mock cannot support `chrome.runtime.sendMessage`.

- [ ] **Step 1: Write the failing test**

Create `src/dashboard/Dashboard.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LinkSpaceData } from '../shared/types';
import { Dashboard } from './Dashboard';

describe('Dashboard', () => {
  it('renders analysis-oriented dashboard copy from captured data', async () => {
    const data = createData();
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({ ok: true, data });

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/dashboard/Dashboard.test.tsx`

Expected: FAIL because the current dashboard still renders old/broken copy instead of `Search path analysis`, `Sessions`, `Current session`, `Export`, and `Import`.

- [ ] **Step 3: Update dashboard copy and visual structure**

Modify `src/dashboard/Dashboard.tsx`:

- Replace broken strings with the copy from the design spec.
- Keep `selectSession`, `exportData`, `importData`, `latestSession`, and formatters behavior unchanged.
- Keep the two-column app shell, but tune styles into a graph-first console:
  - left rail width around `280px`
  - tinted dark background
  - compact metrics
  - HUD top bar
  - analytical node drawer
- Add non-color selected marker text or `aria-current="true"` to selected session buttons.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/dashboard/Dashboard.test.tsx`

Expected: PASS.

## Task 2: Graph Palette Regression Test

**Files:**
- Modify: `src/dashboard/GraphView.test.ts`
- Modify: `src/dashboard/GraphView.tsx`

- [ ] **Step 1: Write the failing test**

In `src/dashboard/GraphView.test.ts`, update the expected depth-2 color:

```ts
expect(graphData.nodes[0]).toMatchObject({
  id: 'deep-node',
  page: node,
  title: 'Page deep-node',
  color: 'oklch(72% 0.11 252)'
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/dashboard/GraphView.test.ts`

Expected: FAIL because `GraphView.tsx` still returns `#c084fc` for a depth-2 node.

- [ ] **Step 3: Update graph palette and empty state**

Modify `src/dashboard/GraphView.tsx`:

```ts
const NODE_COLORS = [
  'oklch(75% 0.11 166)',
  'oklch(73% 0.1 215)',
  'oklch(72% 0.11 252)',
  'oklch(78% 0.12 82)',
  'oklch(72% 0.1 24)'
];
const BACKGROUND_COLOR = 'oklch(16% 0.012 225)';
```

Also update:

- Empty state text to `Select a session to inspect its graph.`
- Link color to a muted tinted neutral such as `oklch(65% 0.025 230)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/dashboard/GraphView.test.ts`

Expected: PASS.

## Task 3: Full Verification And Commit

**Files:**
- Verify all modified dashboard files.
- Commit only files changed for this implementation.

- [ ] **Step 1: Run full tests**

Run: `npm test`

Expected: all Vitest suites pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: TypeScript and Vite build complete with exit code 0.

- [ ] **Step 3: Review changed files**

Run: `git -c safe.directory='C:/Users/Park/Desktop/프로젝트/link-space' status --short`

Expected: implementation files are modified, and unrelated `.gitignore` remains unstaged.

- [ ] **Step 4: Commit implementation**

```bash
git -c safe.directory='C:/Users/Park/Desktop/프로젝트/link-space' add src/dashboard/Dashboard.tsx src/dashboard/Dashboard.test.tsx src/dashboard/GraphView.tsx src/dashboard/GraphView.test.ts docs/superpowers/plans/2026-05-06-dashboard-design-refresh.md
git -c safe.directory='C:/Users/Park/Desktop/프로젝트/link-space' commit -m "design: refresh dashboard analysis console"
```

Expected: commit includes the dashboard refresh, tests, and plan. It does not include `.gitignore`.

## Self-Review

- Spec coverage: graph-first layout, left rail, HUD, drawer, copy cleanup, restrained palette, and verification are covered by Tasks 1-3.
- Placeholder scan: no open `TODO` or `TBD` items.
- Type consistency: tests use existing `LinkSpaceData`, `SearchSession`, `PageNode`, and `NavigationEdge` fields from `src/shared/types.ts`.

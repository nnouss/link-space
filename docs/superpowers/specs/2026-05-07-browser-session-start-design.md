# Browser Session Start Design

## Goal

Link Space should start recording from a newly opened browser session instead of from a Google search. A new root node is created from the first real page visited in a tab only when that tab is not already connected to an existing active session. If a page opens a link in a new tab, that new tab continues the opener's session and the opened page is added as a child node.

## Current Behavior

The background worker currently starts sessions by detecting Google search URLs. `createSearchSession` creates a synthetic `google://search?q=...` root node, and later navigations are added with `addPageVisit`. The worker tracks active state with `sessionByTab` and `currentNodeByTab`, and it already inherits state for new tabs through `chrome.tabs.onCreated` and `openerTabId`.

Back/forward handling is partially in place. Navigations with the `forward_back` qualifier restore `currentNodeId` to an existing node instead of adding an edge. There is also URL-based restoration for cases where browser back is reported as a normal link navigation.

## Required Behavior

1. Google search URLs should no longer be special session starters.
2. When a tab with no inherited active session performs its first recordable page navigation, the visited page becomes the root node of a new active session.
3. When a page in an active session opens a link in a new tab, the new tab inherits the opener's session and current node. The opened page is added as a child node, not as a new root.
4. Page links, SPA history-state changes, redirects from link/form navigation, and same-session new-tab openings create node connections from the current node.
5. Browser back/forward never creates a new node or edge. It only restores the active current node to the existing node for the destination URL when that URL exists in the session.
6. Typed/bookmark/generated direct navigations should start a new root session when no active session exists for the tab. If an active session exists for that tab, direct navigation ends that session and then starts a new root session for the new page.
7. Paused recording, import, deletion, tab close, and expiration behavior should keep their current safety properties.

## Data Model

The existing `SearchSession` shape can continue to be used for this change, but its meaning broadens from "search session" to "browser session". To minimize UI/storage churn, the initial implementation will keep existing field names and use:

- `query`: root page title or URL fallback.
- `searchEngine`: still `'google'` for backward compatibility until a later model cleanup.
- `rootNodeId`: the first page node for root-started browser sessions.
- `currentNodeId`: the current browser-history position inside the session.

The new root node uses the real page URL, title, parsed domain, `depth: 0`, `visitCount: 1`, and `isSearchResultClick: false`.

## Architecture

`src/shared/session.ts` will gain a root-session creator that accepts `url`, `title`, `tabId`, and `now`. It will share ID creation and node/session construction patterns with the current `createSearchSession`.

`src/background/index.ts` will change navigation handling order:

1. Load data and end expired sessions.
2. Respect paused recording by ending active tab sessions and clearing maps.
3. Handle back/forward restoration before any node creation.
4. Resolve an inherited or active source via `sessionByTab` and `currentNodeByTab`.
5. If a source exists and the navigation is recordable, add or restore a child node.
6. If no source exists and the navigation is a real top-level page navigation, create a browser root session from that page.
7. If a direct navigation happens while a session is active in the same tab, end that active tab session, clear the tab maps, then create a new root session for the destination page.

The existing `chrome.tabs.onCreated` opener inheritance remains the key distinction between a standalone new browser session and a page-opened new tab.

## Back/Forward Semantics

Back/forward detection stays based on the `forward_back` transition qualifier. When detected, the worker searches the active tab session for the latest node matching the destination URL and sets `currentNodeId` to that node. No call to `addPageVisit` happens for this path.

If Chrome reports a browser-back destination as a normal link transition, the existing URL restoration path still prevents duplicate edge creation by restoring to the existing node before adding a visit.

## Testing

Add and update tests around the background worker and session helper:

- Creating a root browser session from a first page visit with no Google URL.
- Ensuring Google search URLs are ordinary root pages or ordinary child pages, not synthetic `google://search` roots.
- Opening a page link in a new tab attaches to the opener's current node.
- Direct navigation from an active session ends the old session and creates a new root session.
- Browser back restores `currentNodeId` and the next click branches from the restored node.
- Paused recording and in-flight navigation race protections still prevent late writes.

Existing storage validation tests should continue to pass because the first implementation keeps the current session schema.

## Out Of Scope

- Renaming `SearchSession` and `searchEngine` throughout the app.
- Adding cross-session edges.
- Changing dashboard visual design.
- Rewriting existing stored data.

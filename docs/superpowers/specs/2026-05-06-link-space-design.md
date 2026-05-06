# Link Space Design

## Purpose

Link Space is a Chrome/Edge browser extension that records web navigation paths that start from a Google search and visualizes them as a 3D link map. The first version focuses on two jobs:

- Preserve the search journey without requiring manual bookmarks.
- Help the user review browsing patterns from search terms to visited pages.

The MVP does not collect all browsing history. It records only navigation that starts from a Google search result flow.

## Product Scope

### Included

- Chrome/Edge Manifest V3 extension.
- Google search detection.
- Search-session based recording.
- Local-only storage with `chrome.storage.local`.
- JSON export/import.
- Popup for recording status and quick actions.
- Dashboard for browsing saved search sessions.
- Dark 3D node-link visualization similar to a spatial knowledge map.

### Excluded From MVP

- Windows desktop app.
- Cloud sync or remote backend.
- Full browser history capture.
- Page body capture, summarization, or indexing.
- Naver/Bing support.
- Multi-device account system.

## Architecture

The extension is divided into four parts.

### Background Service Worker

The background service worker owns event capture and session state.

Responsibilities:

- Observe tab URL changes and navigation events.
- Detect Google search result URLs and extract the search query.
- Start a new search session when a new Google query appears.
- Add pages visited from the active search flow as nodes.
- Add navigation relationships as edges.
- End a session when a new search query starts or the session is inactive for 30 minutes.
- Respect the recording pause state from user settings.

### Storage Layer

The storage layer persists data to `chrome.storage.local`.

Responsibilities:

- Store search sessions, page nodes, and navigation edges.
- Store extension settings such as recording pause state.
- Provide JSON export/import.
- Keep the saved data format stable enough to reuse in a future local desktop app.

### Popup

The popup is a compact control surface.

Responsibilities:

- Show whether recording is active or paused.
- Toggle recording pause/resume.
- Show recent search sessions.
- Open the dashboard.

The popup should not contain complex analysis or 3D interaction.

### Dashboard

The dashboard is the main review and visualization interface.

Layout:

- Left panel: saved search sessions.
- Center: 3D link map.
- Right panel: selected node or session details.
- Top area: search/filter controls and JSON import/export.

The MVP defaults to a per-search-session map. The data model should allow a future global history map that combines multiple sessions.

## Data Model

### Search Session

```json
{
  "id": "session_...",
  "query": "example search",
  "searchEngine": "google",
  "startedAt": "2026-05-06T00:00:00.000Z",
  "endedAt": "2026-05-06T00:30:00.000Z",
  "lastActivityAt": "2026-05-06T00:10:00.000Z",
  "status": "active",
  "rootNodeId": "node_...",
  "nodeIds": ["node_..."],
  "edgeIds": ["edge_..."]
}
```

### Page Node

```json
{
  "id": "node_...",
  "sessionId": "session_...",
  "url": "https://example.com/page",
  "title": "Example Page",
  "domain": "example.com",
  "visitedAt": "2026-05-06T00:01:00.000Z",
  "fromUrl": "https://www.google.com/search?q=example",
  "dwellTime": 120,
  "visitCount": 1,
  "depth": 1,
  "isSearchResultClick": true
}
```

### Navigation Edge

```json
{
  "id": "edge_...",
  "sessionId": "session_...",
  "fromNodeId": "node_...",
  "toNodeId": "node_...",
  "createdAt": "2026-05-06T00:01:00.000Z",
  "type": "navigation"
}
```

## Session Rules

A search session starts when the extension detects a supported Google search result URL and extracts a non-empty query.

A session ends when either condition is true:

- A new Google search query is detected.
- No related navigation occurs for 30 minutes.

The first version records pages that continue from the same tab flow. Pages opened from the search results in a new tab remain associated with the originating session only when Chrome exposes a reliable opener relationship. If the relationship is unavailable, the page is not added to the session.

## 3D Visualization

The visual target is a dark 3D spatial link map with floating labeled nodes and thin connecting lines.

Rules:

- The search query is the root node.
- Pages clicked directly from Google search results are first-depth nodes.
- Pages visited after those pages become deeper nodes.
- Edges represent actual navigation order.
- Node color is based on `depth`.
- Node size is based on `visitCount` and `dwellTime`.
- Node brightness or emphasis reflects `isSearchResultClick` and revisits.
- Labels use page `title` by default and fall back to `domain` when needed.
- Users can rotate, zoom, and pan the camera.
- Clicking a node shows URL, title, domain, visited time, dwell time, and path context in the details panel.

The recommended implementation direction is `Three.js` or a small wrapper such as `react-force-graph-3d`, chosen during implementation planning based on the frontend stack.

## Privacy

The MVP uses a local-first privacy model.

- Data stays in `chrome.storage.local`.
- No backend service is used.
- No cloud sync is implemented.
- Page body text is not stored.
- Only Google-search-originated flows are recorded.
- The user can pause recording from the popup.
- JSON export/import is controlled by the user.

## Error Handling

The extension should fail quietly and keep user control clear.

- If a Google query cannot be parsed, no session is created.
- If storage writes fail, the popup or dashboard should expose a concise error state.
- If imported JSON is invalid, reject it and keep existing data unchanged.
- If a tab relationship cannot be resolved, avoid guessing across unrelated browsing contexts.
- If recording is paused, no new sessions or nodes are created.

## Testing Strategy

Testing should focus on the boundaries that can lose or distort user history.

- Unit tests for Google query parsing.
- Unit tests for session start/end rules.
- Unit tests for node and edge creation.
- Unit tests for JSON import validation.
- Manual extension test for Google search to page navigation.
- Manual dashboard test for 3D map rendering and node selection.

## Open Extension Points

The design intentionally leaves room for these future additions:

- Naver and Bing query adapters.
- A global history map combining multiple search sessions.
- Windows local app consuming the same JSON format.
- Optional manual recording sessions.
- Advanced filters for domain, date, dwell time, and depth.

# Link Space Dashboard Design

## Goal

Redesign the Link Space dashboard as a graph-first analysis console for reviewing search and browsing exploration paths.

The dashboard should help users read the structure of a session before inspecting individual pages. It should feel precise, calm, and premium. The graph is the primary surface; panels and controls exist to make the graph easier to interpret.

## Product Context

Link Space is a Chrome extension that captures browsing/search sessions and visualizes visited pages as a 3D node-link graph. The dashboard is a product surface, not a marketing surface.

Primary user task:

1. Open a captured session.
2. Understand the shape of the exploration.
3. Identify important branches and nodes.
4. Select a node to inspect URL, domain, depth, dwell time, visit count, and referrer.

## Design Direction

Use the "graph-first analysis console" direction.

The scene: a researcher or analyst reviews a search session on a desktop monitor after collecting information. They need a composed, low-distraction interface that keeps the graph readable and turns metadata into instrumentation.

Theme:

- Dark, because the 3D graph is the main reading surface and benefits from reduced ambient glare.
- Avoid pure black and pure white. Use tinted near-black surfaces and muted light text.
- Avoid neon hacker styling and exaggerated 3D spectacle.

Color strategy:

- Restrained product palette.
- Use one primary accent for selected state and primary actions.
- Use a small node palette only where it helps distinguish depth and branches.
- Use semantic colors for error, active, paused, and selected states. Do not rely on color alone.

Typography:

- Keep the existing product-friendly sans stack.
- Use compact UI sizes with clear weight contrast.
- Labels should be short, stable, and analysis-oriented.

## Layout

The dashboard keeps a three-part structure:

1. Left session rail.
2. Main graph canvas.
3. Right node detail drawer, shown only when a node is selected.

### Left Session Rail

Purpose: session selection and quick scan.

Changes:

- Reduce the brand block so it does not compete with the graph.
- Keep node/link metrics near the top, but make them compact instrument readouts rather than decorative cards.
- List sessions as dense rows with:
  - query
  - active/completed status
  - node count
  - last activity
- Use selected-row treatment with border, background, and an accessible state marker.
- Provide useful loading and empty copy.

### Main Graph Canvas

Purpose: primary analysis surface.

Changes:

- Preserve maximum graph area.
- Move the current session summary into a compact top HUD rather than a large floating card.
- Keep export/import controls in the HUD, visually secondary to the session title.
- Keep the graph background calm and tinted.
- Node colors should stay legible but restrained.
- Empty state should explain how to create/select a session without sounding like placeholder text.

### Node Detail Drawer

Purpose: progressive inspection after graph selection.

Changes:

- Make the drawer an analytical detail panel, not a decorative card stack.
- Lead with domain and page title.
- Show URL as a clear external link.
- Present metadata as scan-friendly rows:
  - depth
  - visit count
  - dwell time
  - visited at
  - from URL
- Keep close affordance standard and predictable.

## Copy

Replace broken mojibake strings across the dashboard with clear copy.

Suggested dashboard copy:

- Subtitle: "Search path analysis"
- Metrics: "Nodes", "Links"
- Section title: "Sessions"
- Loading: "Loading captured sessions..."
- Empty sessions: "No captured sessions yet. Start a search with recording enabled."
- Current session eyebrow: "Current session"
- Empty current session: "No session selected"
- Export: "Export"
- Import: "Import"
- Drawer title: "Node detail"
- Drawer close label: "Close node detail"
- Empty graph: "Select a session to inspect its graph."
- Unknown query: "Untitled search"
- Active status: "Active"
- Completed status: "Completed"

## Interaction And States

- Session selection resets the selected node.
- Export is disabled when no data is loaded.
- Import is disabled while importing.
- Loading uses inline/skeleton-like copy instead of a central spinner.
- Error messages should describe the action that failed and suggest retrying where practical.
- Drawer transition should be short and state-based. Respect reduced-motion preferences where practical.
- Focus states must be visible for buttons, session rows, and drawer close.

## Accessibility

- Target WCAG AA contrast for text and controls.
- Do not communicate selected/active/error state through color alone.
- Keep icon buttons accessible with `aria-label`.
- Preserve keyboard navigation for buttons and links.
- Avoid text overlap by keeping compact rows constrained and allowing long URLs/titles to wrap where needed.

## Implementation Scope

In scope:

- Update `src/dashboard/Dashboard.tsx` dashboard layout styles and copy.
- Update `src/dashboard/GraphView.tsx` graph colors, empty state, and related styling.
- Keep the current data model and runtime message behavior unchanged.
- Keep the existing 3D graph library.

Out of scope:

- New filtering, timeline, search, or analytics features.
- Data model changes.
- Popup redesign.
- Backend or cloud sync.
- Major graph physics changes.

## Verification

Run:

```bash
npm test
npm run build
```

Manual checks:

- Dashboard renders with no selected session.
- Dashboard renders with sessions and a selected session.
- Selecting a session updates the graph and clears node detail.
- Selecting a graph node opens the detail drawer.
- Export/import controls remain reachable.
- Long query, title, URL, and referrer text do not break layout.

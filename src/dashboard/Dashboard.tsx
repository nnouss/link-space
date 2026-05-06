import { Download, ExternalLink, Search, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { exportLinkSpaceData, importLinkSpaceData } from '../shared/storage';
import type { LinkSpaceData, PageNode, RuntimeMessage, SearchSession } from '../shared/types';
import { GraphView } from './GraphView';

type RuntimeResponse =
  | { ok: true; data: LinkSpaceData }
  | { ok: false; error: string };

export function Dashboard() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [data, setData] = useState<LinkSpaceData | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<PageNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    let mounted = true;

    sendRuntimeMessage({ type: 'GET_DATA' })
      .then((response) => {
        if (!mounted) {
          return;
        }

        if (response.ok) {
          setData(response.data);
          setSelectedSessionId(latestSession(response.data.sessions)?.id ?? null);
          setError(null);
        } else {
          setError('Unable to load captured sessions. Try opening the dashboard again.');
        }
      })
      .catch(() => {
        if (mounted) {
          setError('Unable to load captured sessions. Try opening the dashboard again.');
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const sessions = useMemo(() => {
    if (!data) {
      return [];
    }

    return Object.values(data.sessions).sort((a, b) => sessionTime(b) - sessionTime(a));
  }, [data]);

  const selectedSession = selectedSessionId && data ? data.sessions[selectedSessionId] ?? null : null;
  const selectedNodeCount = selectedSession?.nodeIds.length ?? 0;
  const selectedEdgeCount = selectedSession?.edgeIds.length ?? 0;

  function selectSession(session: SearchSession) {
    setSelectedSessionId(session.id);
    setSelectedNode(null);
  }

  function exportData() {
    if (!data) {
      return;
    }

    const blob = new Blob([exportLinkSpaceData(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'link-space-export.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const importedData = importLinkSpaceData(await file.text());
      const response = await sendRuntimeMessage({ type: 'IMPORT_DATA', payload: importedData });

      if (!response?.ok) {
        setError('Import failed. Check the JSON file and try again.');
        return;
      }

      setData(response.data);
      setSelectedSessionId(latestSession(response.data.sessions)?.id ?? null);
      setSelectedNode(null);
    } catch {
      setError('Import failed. Select a valid Link Space JSON file.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <main style={pageStyle}>
      <aside style={leftPanelStyle} aria-label="Session rail">
        <div style={brandBlockStyle}>
          <span style={brandMarkStyle}>LS</span>
          <div>
            <h1 style={titleStyle}>Link Space</h1>
            <p style={subtitleStyle}>Search path analysis</p>
          </div>
        </div>

        <section style={summaryGridStyle} aria-label="Selected session summary">
          <Metric label="Nodes" value={String(selectedNodeCount)} />
          <Metric label="Links" value={String(selectedEdgeCount)} />
        </section>

        {error ? <p style={errorTextStyle}>{error}</p> : null}

        <section style={sessionSectionStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>Sessions</h2>
            <span style={countPillStyle}>{sessions.length}</span>
          </div>

          {isLoading ? (
            <p style={mutedTextStyle}>Loading captured sessions...</p>
          ) : sessions.length > 0 ? (
            <ul style={sessionListStyle}>
              {sessions.map((session) => {
                const isSelected = selectedSessionId === session.id;

                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => selectSession(session)}
                      style={{
                        ...sessionButtonStyle,
                        borderColor: isSelected ? surfaceColors.accent : surfaceColors.borderStrong,
                        background: isSelected ? surfaceColors.selectedPanel : surfaceColors.panel
                      }}
                    >
                      <span style={sessionIconStyle}>
                        <Search size={15} aria-hidden="true" />
                      </span>
                      <span style={sessionTextStyle}>
                        <span style={sessionQueryStyle}>{session.query || 'Untitled search'}</span>
                        <span style={sessionMetaStyle}>
                          <span style={statusDotStyle} aria-hidden="true" />
                          <span>{formatSessionStatus(session.status)}</span>
                          <span>/ {session.nodeIds.length} nodes</span>
                          <span>/ {formatShortDate(session.lastActivityAt)}</span>
                        </span>
                      </span>
                      {isSelected ? <span style={selectedMarkerStyle}>Selected</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p style={mutedTextStyle}>No captured sessions yet. Start a search with recording enabled.</p>
          )}
        </section>
      </aside>

      <section style={graphPanelStyle}>
        <div style={topBarStyle}>
          <div style={sessionTitleBlockStyle}>
            <span style={eyebrowStyle}>Current session</span>
            <strong style={currentQueryStyle}>{selectedSession?.query || 'No session selected'}</strong>
            <span style={hudMetaStyle}>
              {selectedNodeCount} nodes / {selectedEdgeCount} links
            </span>
          </div>
          <div style={toolbarStyle}>
            <button
              type="button"
              onClick={exportData}
              disabled={!data}
              style={{ ...toolbarButtonStyle, opacity: data ? 1 : 0.48 }}
            >
              <Download size={16} aria-hidden="true" />
              Export
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              style={{ ...toolbarButtonStyle, opacity: isImporting ? 0.56 : 1 }}
            >
              <Upload size={16} aria-hidden="true" />
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={importData}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        <GraphView
          session={selectedSession}
          nodes={data?.nodes ?? {}}
          edges={data?.edges ?? {}}
          onSelectNode={setSelectedNode}
        />
      </section>

      {selectedNode ? (
        <button
          type="button"
          aria-label="Close node detail"
          onClick={() => setSelectedNode(null)}
          style={drawerBackdropStyle}
        />
      ) : null}

      <aside style={{ ...drawerStyle, transform: selectedNode ? 'translateX(0)' : 'translateX(100%)' }}>
        <div style={drawerHeaderStyle}>
          <div>
            <span style={eyebrowStyle}>Node detail</span>
            <h2 style={drawerTitleStyle}>{selectedNode?.domain ?? 'No node selected'}</h2>
          </div>
          <button type="button" aria-label="Close node detail" onClick={() => setSelectedNode(null)} style={iconButtonStyle}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {selectedNode ? (
          <div style={drawerContentStyle}>
            <section style={nodeSummaryStyle}>
              <span style={domainPillStyle}>{selectedNode.domain}</span>
              <h3 style={nodeTitleStyle}>{selectedNode.title || selectedNode.url}</h3>
              <a href={selectedNode.url} target="_blank" rel="noreferrer" style={nodeUrlStyle}>
                <ExternalLink size={14} aria-hidden="true" />
                {selectedNode.url}
              </a>
            </section>

            <dl style={detailsListStyle}>
              <DetailRow label="Depth" value={String(selectedNode.depth)} />
              <DetailRow label="Visit count" value={String(selectedNode.visitCount)} />
              <DetailRow label="Dwell time" value={formatDwellTime(selectedNode.dwellTime)} />
              <DetailRow label="Visited at" value={formatLongDate(selectedNode.visitedAt)} />
              <DetailRow label="From URL" value={selectedNode.fromUrl ?? '-'} />
            </dl>
          </div>
        ) : null}
      </aside>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricStyle}>
      <span style={metricValueStyle}>{value}</span>
      <span style={metricLabelStyle}>{label}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={detailRowStyle}>
      <dt style={detailLabelStyle}>{label}</dt>
      <dd style={detailValueStyle} title={value}>
        {value}
      </dd>
    </div>
  );
}

function sendRuntimeMessage(message: RuntimeMessage): Promise<RuntimeResponse> {
  return chrome.runtime.sendMessage(message);
}

function latestSession(sessions: Record<string, SearchSession>): SearchSession | undefined {
  return Object.values(sessions).sort((a, b) => sessionTime(b) - sessionTime(a))[0];
}

function sessionTime(session: SearchSession): number {
  return new Date(session.lastActivityAt || session.startedAt).getTime();
}

function formatSessionStatus(status: SearchSession['status']): string {
  return status === 'active' ? 'Active' : 'Completed';
}

function formatDwellTime(dwellTime: number): string {
  const seconds = Math.round(dwellTime / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value));
}

const fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const surfaceColors = {
  page: 'oklch(16% 0.012 225)',
  rail: 'oklch(19% 0.014 225)',
  panel: 'oklch(21% 0.015 225)',
  selectedPanel: 'oklch(24% 0.025 178)',
  border: 'oklch(31% 0.018 225)',
  borderStrong: 'oklch(39% 0.026 225)',
  text: 'oklch(94% 0.012 225)',
  muted: 'oklch(70% 0.028 225)',
  dim: 'oklch(58% 0.03 225)',
  accent: 'oklch(75% 0.11 166)',
  accentText: 'oklch(17% 0.03 166)',
  errorBg: 'oklch(24% 0.04 25)',
  errorBorder: 'oklch(48% 0.12 25)',
  errorText: 'oklch(84% 0.08 25)'
};

const pageStyle = {
  background: surfaceColors.page,
  color: surfaceColors.text,
  display: 'grid',
  fontFamily,
  gridTemplateColumns: '280px minmax(0, 1fr)',
  height: '100vh',
  overflow: 'hidden'
} satisfies CSSProperties;

const leftPanelStyle = {
  background: surfaceColors.rail,
  borderRight: `1px solid ${surfaceColors.border}`,
  padding: '18px 16px',
  overflowY: 'auto',
  zIndex: 3
} satisfies CSSProperties;

const brandBlockStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: 10
} satisfies CSSProperties;

const brandMarkStyle = {
  alignItems: 'center',
  background: surfaceColors.accent,
  borderRadius: 6,
  color: surfaceColors.accentText,
  display: 'inline-flex',
  fontSize: 12,
  fontWeight: 900,
  height: 32,
  justifyContent: 'center',
  width: 32
} satisfies CSSProperties;

const titleStyle = {
  fontSize: 18,
  lineHeight: 1.15,
  margin: 0
} satisfies CSSProperties;

const subtitleStyle = {
  color: surfaceColors.muted,
  fontSize: 12,
  margin: '3px 0 0'
} satisfies CSSProperties;

const summaryGridStyle = {
  display: 'grid',
  gap: 8,
  gridTemplateColumns: '1fr 1fr',
  marginTop: 20
} satisfies CSSProperties;

const metricStyle = {
  background: surfaceColors.panel,
  border: `1px solid ${surfaceColors.border}`,
  borderRadius: 6,
  display: 'grid',
  gap: 2,
  padding: '10px 12px'
} satisfies CSSProperties;

const metricValueStyle = {
  fontSize: 18,
  fontWeight: 800,
  lineHeight: 1.1
} satisfies CSSProperties;

const metricLabelStyle = {
  color: surfaceColors.dim,
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase'
} satisfies CSSProperties;

const sessionSectionStyle = {
  marginTop: 22
} satisfies CSSProperties;

const sectionHeaderStyle = {
  alignItems: 'center',
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: 10
} satisfies CSSProperties;

const sectionTitleStyle = {
  color: surfaceColors.muted,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0,
  margin: 0,
  textTransform: 'uppercase'
} satisfies CSSProperties;

const countPillStyle = {
  background: surfaceColors.panel,
  border: `1px solid ${surfaceColors.border}`,
  borderRadius: 999,
  color: surfaceColors.muted,
  fontSize: 12,
  padding: '2px 8px'
} satisfies CSSProperties;

const sessionListStyle = {
  display: 'grid',
  gap: 8,
  listStyle: 'none',
  margin: 0,
  padding: 0
} satisfies CSSProperties;

const sessionButtonStyle = {
  alignItems: 'center',
  border: `1px solid ${surfaceColors.borderStrong}`,
  borderRadius: 6,
  color: surfaceColors.text,
  cursor: 'pointer',
  display: 'grid',
  gap: 10,
  gridTemplateColumns: '30px minmax(0, 1fr)',
  minHeight: 70,
  padding: 11,
  position: 'relative',
  textAlign: 'left',
  width: '100%'
} satisfies CSSProperties;

const sessionIconStyle = {
  alignItems: 'center',
  background: 'oklch(25% 0.018 225)',
  borderRadius: 6,
  color: surfaceColors.accent,
  display: 'inline-flex',
  height: 30,
  justifyContent: 'center',
  width: 30
} satisfies CSSProperties;

const sessionTextStyle = {
  display: 'grid',
  gap: 7,
  minWidth: 0
} satisfies CSSProperties;

const sessionQueryStyle = {
  fontSize: 13,
  fontWeight: 800,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
} satisfies CSSProperties;

const sessionMetaStyle = {
  alignItems: 'center',
  color: surfaceColors.dim,
  display: 'inline-flex',
  fontSize: 12,
  gap: 6,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
} satisfies CSSProperties;

const statusDotStyle = {
  background: surfaceColors.accent,
  borderRadius: 999,
  display: 'inline-block',
  flex: '0 0 auto',
  height: 6,
  width: 6
} satisfies CSSProperties;

const selectedMarkerStyle = {
  color: surfaceColors.accent,
  fontSize: 10,
  fontWeight: 800,
  position: 'absolute',
  right: 10,
  top: 8,
  textTransform: 'uppercase'
} satisfies CSSProperties;

const graphPanelStyle = {
  minWidth: 0,
  position: 'relative'
} satisfies CSSProperties;

const topBarStyle = {
  alignItems: 'start',
  display: 'flex',
  gap: 14,
  justifyContent: 'space-between',
  left: 18,
  position: 'absolute',
  right: 18,
  top: 16,
  zIndex: 2
} satisfies CSSProperties;

const sessionTitleBlockStyle = {
  background: 'oklch(19% 0.014 225 / 88%)',
  border: `1px solid ${surfaceColors.border}`,
  borderRadius: 6,
  boxShadow: '0 18px 44px oklch(10% 0.01 225 / 38%)',
  display: 'grid',
  gap: 4,
  minWidth: 0,
  padding: '10px 12px'
} satisfies CSSProperties;

const eyebrowStyle = {
  color: surfaceColors.dim,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0,
  textTransform: 'uppercase'
} satisfies CSSProperties;

const currentQueryStyle = {
  color: surfaceColors.text,
  fontSize: 14,
  maxWidth: 360,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
} satisfies CSSProperties;

const hudMetaStyle = {
  color: surfaceColors.dim,
  fontSize: 12
} satisfies CSSProperties;

const toolbarStyle = {
  display: 'flex',
  gap: 8
} satisfies CSSProperties;

const toolbarButtonStyle = {
  alignItems: 'center',
  background: 'oklch(20% 0.015 225 / 92%)',
  border: `1px solid ${surfaceColors.borderStrong}`,
  borderRadius: 6,
  color: surfaceColors.text,
  cursor: 'pointer',
  display: 'inline-flex',
  fontSize: 13,
  fontWeight: 800,
  gap: 7,
  minHeight: 36,
  padding: '0 12px'
} satisfies CSSProperties;

const drawerBackdropStyle = {
  background: 'oklch(10% 0.01 225 / 38%)',
  border: 0,
  bottom: 0,
  cursor: 'default',
  left: 280,
  padding: 0,
  position: 'fixed',
  right: 0,
  top: 0,
  zIndex: 4
} satisfies CSSProperties;

const drawerStyle = {
  background: surfaceColors.rail,
  borderLeft: `1px solid ${surfaceColors.borderStrong}`,
  bottom: 0,
  boxShadow: '-24px 0 60px oklch(10% 0.01 225 / 45%)',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  maxWidth: 'calc(100vw - 280px)',
  overflow: 'hidden',
  position: 'fixed',
  right: 0,
  top: 0,
  transition: 'transform 170ms cubic-bezier(0.22, 1, 0.36, 1)',
  width: 390,
  zIndex: 5
} satisfies CSSProperties;

const drawerHeaderStyle = {
  alignItems: 'center',
  borderBottom: `1px solid ${surfaceColors.border}`,
  display: 'flex',
  justifyContent: 'space-between',
  padding: '20px 20px 16px'
} satisfies CSSProperties;

const drawerTitleStyle = {
  color: surfaceColors.text,
  fontSize: 20,
  lineHeight: 1.2,
  margin: '4px 0 0',
  overflowWrap: 'anywhere'
} satisfies CSSProperties;

const iconButtonStyle = {
  alignItems: 'center',
  background: surfaceColors.panel,
  border: `1px solid ${surfaceColors.borderStrong}`,
  borderRadius: 6,
  color: surfaceColors.text,
  cursor: 'pointer',
  display: 'inline-flex',
  height: 34,
  justifyContent: 'center',
  width: 34
} satisfies CSSProperties;

const drawerContentStyle = {
  display: 'grid',
  gap: 16,
  overflowY: 'auto',
  padding: 20
} satisfies CSSProperties;

const nodeSummaryStyle = {
  borderBottom: `1px solid ${surfaceColors.border}`,
  display: 'grid',
  gap: 12,
  paddingBottom: 16
} satisfies CSSProperties;

const domainPillStyle = {
  background: 'oklch(26% 0.04 166)',
  border: '1px solid oklch(47% 0.08 166)',
  borderRadius: 999,
  color: 'oklch(86% 0.08 166)',
  fontSize: 12,
  justifySelf: 'start',
  padding: '3px 9px'
} satisfies CSSProperties;

const nodeTitleStyle = {
  color: surfaceColors.text,
  fontSize: 18,
  lineHeight: 1.35,
  margin: 0,
  overflowWrap: 'anywhere'
} satisfies CSSProperties;

const nodeUrlStyle = {
  alignItems: 'center',
  color: 'oklch(76% 0.09 215)',
  display: 'inline-flex',
  fontSize: 13,
  gap: 6,
  lineHeight: 1.45,
  overflowWrap: 'anywhere',
  textDecoration: 'none'
} satisfies CSSProperties;

const detailsListStyle = {
  display: 'grid',
  gap: 8,
  margin: 0
} satisfies CSSProperties;

const detailRowStyle = {
  borderBottom: `1px solid ${surfaceColors.border}`,
  display: 'grid',
  gap: 5,
  minWidth: 0,
  padding: '10px 0'
} satisfies CSSProperties;

const detailLabelStyle = {
  color: surfaceColors.dim,
  fontSize: 12,
  fontWeight: 800,
  margin: 0,
  textTransform: 'uppercase'
} satisfies CSSProperties;

const detailValueStyle = {
  color: surfaceColors.text,
  fontSize: 13,
  lineHeight: 1.45,
  margin: 0,
  overflowWrap: 'anywhere'
} satisfies CSSProperties;

const mutedTextStyle = {
  color: surfaceColors.muted,
  fontSize: 13,
  lineHeight: 1.45,
  margin: 0
} satisfies CSSProperties;

const errorTextStyle = {
  background: surfaceColors.errorBg,
  border: `1px solid ${surfaceColors.errorBorder}`,
  borderRadius: 6,
  color: surfaceColors.errorText,
  fontSize: 13,
  lineHeight: 1.45,
  margin: '18px 0 0',
  padding: 12
} satisfies CSSProperties;

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
          setError('검색 흐름 데이터를 불러오지 못했습니다.');
        }
      })
      .catch(() => {
        if (mounted) {
          setError('검색 흐름 데이터를 불러오지 못했습니다.');
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
        setError('가져온 검색 흐름 데이터를 저장하지 못했습니다.');
        return;
      }

      setData(response.data);
      setSelectedSessionId(latestSession(response.data.sessions)?.id ?? null);
      setSelectedNode(null);
    } catch {
      setError('올바른 Link Space JSON 파일이 아닙니다.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <main style={pageStyle}>
      <aside style={leftPanelStyle}>
        <div style={brandBlockStyle}>
          <span style={brandMarkStyle}>LS</span>
          <div>
            <h1 style={titleStyle}>Link Space</h1>
            <p style={subtitleStyle}>검색 흐름 그래프</p>
          </div>
        </div>

        <section style={summaryGridStyle} aria-label="선택된 세션 요약">
          <Metric label="nodes" value={String(selectedNodeCount)} />
          <Metric label="links" value={String(selectedEdgeCount)} />
        </section>

        {error ? <p style={errorTextStyle}>{error}</p> : null}

        <section style={sessionSectionStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>세션</h2>
            <span style={countPillStyle}>{sessions.length}</span>
          </div>

          {isLoading ? (
            <p style={mutedTextStyle}>검색 흐름을 불러오는 중입니다.</p>
          ) : sessions.length > 0 ? (
            <ul style={sessionListStyle}>
              {sessions.map((session) => {
                const isSelected = selectedSessionId === session.id;

                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => selectSession(session)}
                      style={{
                        ...sessionButtonStyle,
                        borderColor: isSelected ? '#49d6a0' : '#2f3541',
                        background: isSelected ? '#16231f' : '#171b21'
                      }}
                    >
                      <span style={sessionIconStyle}>
                        <Search size={15} aria-hidden="true" />
                      </span>
                      <span style={sessionTextStyle}>
                        <span style={sessionQueryStyle}>{session.query || '검색어 없음'}</span>
                        <span style={sessionMetaStyle}>
                          {session.status === 'active' ? '기록 중' : '종료됨'} · node {session.nodeIds.length} ·{' '}
                          {formatShortDate(session.lastActivityAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p style={mutedTextStyle}>아직 기록된 검색 세션이 없습니다.</p>
          )}
        </section>
      </aside>

      <section style={graphPanelStyle}>
        <div style={topBarStyle}>
          <div style={sessionTitleBlockStyle}>
            <span style={eyebrowStyle}>현재 그래프</span>
            <strong style={currentQueryStyle}>{selectedSession?.query || '세션 없음'}</strong>
          </div>
          <div style={toolbarStyle}>
            <button type="button" onClick={exportData} disabled={!data} style={toolbarButtonStyle}>
              <Download size={16} aria-hidden="true" />
              내보내기
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              style={toolbarButtonStyle}
            >
              <Upload size={16} aria-hidden="true" />
              가져오기
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
          aria-label="상세정보 닫기"
          onClick={() => setSelectedNode(null)}
          style={drawerBackdropStyle}
        />
      ) : null}

      <aside style={{ ...drawerStyle, transform: selectedNode ? 'translateX(0)' : 'translateX(100%)' }}>
        <div style={drawerHeaderStyle}>
          <div>
            <span style={eyebrowStyle}>node detail</span>
            <h2 style={drawerTitleStyle}>상세정보</h2>
          </div>
          <button type="button" aria-label="상세정보 닫기" onClick={() => setSelectedNode(null)} style={iconButtonStyle}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {selectedNode ? (
          <div style={drawerContentStyle}>
            <div style={nodeCardStyle}>
              <span style={domainPillStyle}>{selectedNode.domain}</span>
              <h3 style={nodeTitleStyle}>{selectedNode.title || selectedNode.url}</h3>
              <a href={selectedNode.url} target="_blank" rel="noreferrer" style={nodeUrlStyle}>
                <ExternalLink size={14} aria-hidden="true" />
                {selectedNode.url}
              </a>
            </div>

            <dl style={detailsListStyle}>
              <DetailRow label="depth" value={String(selectedNode.depth)} />
              <DetailRow label="visit count" value={String(selectedNode.visitCount)} />
              <DetailRow label="dwell time" value={formatDwellTime(selectedNode.dwellTime)} />
              <DetailRow label="visited at" value={formatLongDate(selectedNode.visitedAt)} />
              <DetailRow label="from url" value={selectedNode.fromUrl ?? '-'} />
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

function formatDwellTime(dwellTime: number): string {
  return `${Math.round(dwellTime / 1000)}초`;
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

const pageStyle = {
  background: '#0f1216',
  color: '#f4f7fb',
  display: 'grid',
  fontFamily,
  gridTemplateColumns: '300px minmax(0, 1fr)',
  height: '100vh',
  overflow: 'hidden'
} satisfies CSSProperties;

const leftPanelStyle = {
  background: '#141922',
  borderRight: '1px solid #26303d',
  boxShadow: '8px 0 30px rgba(0, 0, 0, 0.18)',
  padding: 20,
  overflowY: 'auto',
  zIndex: 3
} satisfies CSSProperties;

const brandBlockStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: 12
} satisfies CSSProperties;

const brandMarkStyle = {
  alignItems: 'center',
  background: '#49d6a0',
  borderRadius: 8,
  color: '#07110d',
  display: 'inline-flex',
  fontSize: 13,
  fontWeight: 900,
  height: 38,
  justifyContent: 'center',
  width: 38
} satisfies CSSProperties;

const titleStyle = {
  fontSize: 22,
  lineHeight: 1.15,
  margin: 0
} satisfies CSSProperties;

const subtitleStyle = {
  color: '#94a3b8',
  fontSize: 12,
  margin: '4px 0 0'
} satisfies CSSProperties;

const summaryGridStyle = {
  display: 'grid',
  gap: 8,
  gridTemplateColumns: '1fr 1fr',
  marginTop: 22
} satisfies CSSProperties;

const metricStyle = {
  background: '#10151d',
  border: '1px solid #2a3442',
  borderRadius: 8,
  display: 'grid',
  gap: 4,
  padding: '12px 14px'
} satisfies CSSProperties;

const metricValueStyle = {
  fontSize: 20,
  fontWeight: 800
} satisfies CSSProperties;

const metricLabelStyle = {
  color: '#94a3b8',
  fontSize: 11,
  textTransform: 'uppercase'
} satisfies CSSProperties;

const sessionSectionStyle = {
  marginTop: 24
} satisfies CSSProperties;

const sectionHeaderStyle = {
  alignItems: 'center',
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: 12
} satisfies CSSProperties;

const sectionTitleStyle = {
  color: '#dbe4f0',
  fontSize: 13,
  letterSpacing: 0,
  margin: 0,
  textTransform: 'uppercase'
} satisfies CSSProperties;

const countPillStyle = {
  background: '#202938',
  border: '1px solid #334155',
  borderRadius: 999,
  color: '#cbd5e1',
  fontSize: 12,
  padding: '2px 8px'
} satisfies CSSProperties;

const sessionListStyle = {
  display: 'grid',
  gap: 9,
  listStyle: 'none',
  margin: 0,
  padding: 0
} satisfies CSSProperties;

const sessionButtonStyle = {
  alignItems: 'center',
  border: '1px solid #2f3541',
  borderRadius: 8,
  color: '#f4f7fb',
  cursor: 'pointer',
  display: 'grid',
  gap: 10,
  gridTemplateColumns: '32px minmax(0, 1fr)',
  minHeight: 72,
  padding: 12,
  textAlign: 'left',
  width: '100%'
} satisfies CSSProperties;

const sessionIconStyle = {
  alignItems: 'center',
  background: '#222c3a',
  borderRadius: 8,
  color: '#9be7c9',
  display: 'inline-flex',
  height: 32,
  justifyContent: 'center',
  width: 32
} satisfies CSSProperties;

const sessionTextStyle = {
  display: 'grid',
  gap: 6,
  minWidth: 0
} satisfies CSSProperties;

const sessionQueryStyle = {
  fontSize: 14,
  fontWeight: 800,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
} satisfies CSSProperties;

const sessionMetaStyle = {
  color: '#93a1b5',
  fontSize: 12,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
} satisfies CSSProperties;

const graphPanelStyle = {
  minWidth: 0,
  position: 'relative'
} satisfies CSSProperties;

const topBarStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: 14,
  justifyContent: 'space-between',
  left: 20,
  position: 'absolute',
  right: 20,
  top: 18,
  zIndex: 2
} satisfies CSSProperties;

const sessionTitleBlockStyle = {
  background: 'rgba(16, 21, 29, 0.82)',
  border: '1px solid rgba(71, 85, 105, 0.72)',
  borderRadius: 8,
  boxShadow: '0 14px 34px rgba(0, 0, 0, 0.2)',
  display: 'grid',
  gap: 3,
  minWidth: 0,
  padding: '10px 13px'
} satisfies CSSProperties;

const eyebrowStyle = {
  color: '#8ba1bb',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0,
  textTransform: 'uppercase'
} satisfies CSSProperties;

const currentQueryStyle = {
  color: '#f8fafc',
  fontSize: 14,
  maxWidth: 360,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
} satisfies CSSProperties;

const toolbarStyle = {
  display: 'flex',
  gap: 8
} satisfies CSSProperties;

const toolbarButtonStyle = {
  alignItems: 'center',
  background: 'rgba(20, 25, 34, 0.9)',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#f4f7fb',
  cursor: 'pointer',
  display: 'inline-flex',
  fontSize: 13,
  fontWeight: 800,
  gap: 7,
  minHeight: 36,
  padding: '0 12px'
} satisfies CSSProperties;

const drawerBackdropStyle = {
  background: 'rgba(2, 6, 12, 0.34)',
  border: 0,
  bottom: 0,
  cursor: 'default',
  left: 300,
  padding: 0,
  position: 'fixed',
  right: 0,
  top: 0,
  zIndex: 4
} satisfies CSSProperties;

const drawerStyle = {
  background: '#151a22',
  borderLeft: '1px solid #303b4a',
  bottom: 0,
  boxShadow: '-24px 0 60px rgba(0, 0, 0, 0.38)',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  maxWidth: 'calc(100vw - 300px)',
  overflow: 'hidden',
  position: 'fixed',
  right: 0,
  top: 0,
  transition: 'transform 180ms ease',
  width: 380,
  zIndex: 5
} satisfies CSSProperties;

const drawerHeaderStyle = {
  alignItems: 'center',
  borderBottom: '1px solid #2b3543',
  display: 'flex',
  justifyContent: 'space-between',
  padding: '20px 20px 16px'
} satisfies CSSProperties;

const drawerTitleStyle = {
  fontSize: 20,
  lineHeight: 1.2,
  margin: '4px 0 0'
} satisfies CSSProperties;

const iconButtonStyle = {
  alignItems: 'center',
  background: '#202938',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#dbe4f0',
  cursor: 'pointer',
  display: 'inline-flex',
  height: 34,
  justifyContent: 'center',
  width: 34
} satisfies CSSProperties;

const drawerContentStyle = {
  display: 'grid',
  gap: 18,
  overflowY: 'auto',
  padding: 20
} satisfies CSSProperties;

const nodeCardStyle = {
  background: '#10151d',
  border: '1px solid #2d3847',
  borderRadius: 8,
  display: 'grid',
  gap: 12,
  padding: 16
} satisfies CSSProperties;

const domainPillStyle = {
  background: '#16332a',
  border: '1px solid #256b52',
  borderRadius: 999,
  color: '#a8f3d4',
  fontSize: 12,
  justifySelf: 'start',
  padding: '3px 9px'
} satisfies CSSProperties;

const nodeTitleStyle = {
  color: '#f8fafc',
  fontSize: 18,
  lineHeight: 1.35,
  margin: 0,
  overflowWrap: 'anywhere'
} satisfies CSSProperties;

const nodeUrlStyle = {
  alignItems: 'center',
  color: '#93c5fd',
  display: 'inline-flex',
  fontSize: 13,
  gap: 6,
  lineHeight: 1.45,
  overflowWrap: 'anywhere',
  textDecoration: 'none'
} satisfies CSSProperties;

const detailsListStyle = {
  display: 'grid',
  gap: 12,
  margin: 0
} satisfies CSSProperties;

const detailRowStyle = {
  background: '#10151d',
  border: '1px solid #2b3543',
  borderRadius: 8,
  display: 'grid',
  gap: 5,
  minWidth: 0,
  padding: '12px 14px'
} satisfies CSSProperties;

const detailLabelStyle = {
  color: '#8ba1bb',
  fontSize: 12,
  margin: 0,
  textTransform: 'uppercase'
} satisfies CSSProperties;

const detailValueStyle = {
  color: '#f4f7fb',
  fontSize: 13,
  lineHeight: 1.45,
  margin: 0,
  overflowWrap: 'anywhere'
} satisfies CSSProperties;

const mutedTextStyle = {
  color: '#94a3b8',
  fontSize: 13,
  lineHeight: 1.45,
  margin: 0
} satisfies CSSProperties;

const errorTextStyle = {
  background: '#2b1519',
  border: '1px solid #7f1d1d',
  borderRadius: 8,
  color: '#fecaca',
  fontSize: 13,
  lineHeight: 1.45,
  margin: '18px 0 0',
  padding: 12
} satisfies CSSProperties;

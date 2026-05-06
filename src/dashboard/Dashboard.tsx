import { Download, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
          setError('데이터를 불러오지 못했습니다.');
        }
      })
      .catch(() => {
        if (mounted) {
          setError('데이터를 불러오지 못했습니다.');
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

  async function importData(event: React.ChangeEvent<HTMLInputElement>) {
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

      if (!response.ok) {
        setError('가져온 데이터를 저장하지 못했습니다.');
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
        <h1 style={titleStyle}>Link Space</h1>
        <section style={{ marginTop: 18 }}>
          <h2 style={sectionTitleStyle}>저장된 검색 세션</h2>
          {isLoading ? (
            <p style={mutedTextStyle}>데이터를 불러오는 중입니다.</p>
          ) : sessions.length > 0 ? (
            <ul style={sessionListStyle}>
              {sessions.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => selectSession(session)}
                    style={{
                      ...sessionButtonStyle,
                      borderColor: selectedSessionId === session.id ? '#6ee7b7' : '#2f343a',
                      background: selectedSessionId === session.id ? '#17211f' : '#171a1d'
                    }}
                  >
                    <span style={sessionQueryStyle}>{session.query || '검색어 없음'}</span>
                    <span style={sessionMetaStyle}>
                      {session.status === 'active' ? '진행 중' : '종료'} · node {session.nodeIds.length}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p style={mutedTextStyle}>저장된 세션이 없습니다.</p>
          )}
        </section>
      </aside>

      <section style={graphPanelStyle}>
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
        <GraphView
          session={selectedSession}
          nodes={data?.nodes ?? {}}
          edges={data?.edges ?? {}}
          onSelectNode={setSelectedNode}
        />
      </section>

      <aside style={rightPanelStyle}>
        <h2 style={sectionTitleStyle}>상세 정보</h2>
        {error ? <p style={errorTextStyle}>{error}</p> : null}
        {selectedNode ? (
          <dl style={detailsListStyle}>
            <DetailRow label="title" value={selectedNode.title} />
            <DetailRow label="domain" value={selectedNode.domain} />
            <DetailRow label="url" value={selectedNode.url} />
            <DetailRow label="depth" value={String(selectedNode.depth)} />
            <DetailRow label="dwellTime" value={formatDwellTime(selectedNode.dwellTime)} />
          </dl>
        ) : selectedSession ? (
          <div style={detailsListStyle}>
            <p style={mutedTextStyle}>node를 선택하세요.</p>
            <dl style={{ margin: 0 }}>
              <DetailRow label="query" value={selectedSession.query || '검색어 없음'} />
              <DetailRow label="status" value={selectedSession.status === 'active' ? '진행 중' : '종료'} />
              <DetailRow label="nodes" value={String(selectedSession.nodeIds.length)} />
            </dl>
          </div>
        ) : (
          <p style={mutedTextStyle}>node를 선택하세요.</p>
        )}
      </aside>
    </main>
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

const fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const pageStyle = {
  background: '#111315',
  color: '#f3f4f6',
  display: 'grid',
  fontFamily,
  gridTemplateColumns: '280px minmax(0, 1fr) 320px',
  height: '100vh',
  overflow: 'hidden'
} satisfies React.CSSProperties;

const leftPanelStyle = {
  background: '#15181b',
  borderRight: '1px solid #282d33',
  padding: 18,
  overflowY: 'auto'
} satisfies React.CSSProperties;

const rightPanelStyle = {
  background: '#15181b',
  borderLeft: '1px solid #282d33',
  padding: 18,
  overflowY: 'auto'
} satisfies React.CSSProperties;

const graphPanelStyle = {
  minWidth: 0,
  position: 'relative'
} satisfies React.CSSProperties;

const toolbarStyle = {
  display: 'flex',
  gap: 8,
  left: 18,
  position: 'absolute',
  top: 16,
  zIndex: 2
} satisfies React.CSSProperties;

const toolbarButtonStyle = {
  alignItems: 'center',
  background: '#1b2025',
  border: '1px solid #333a42',
  borderRadius: 6,
  color: '#f3f4f6',
  cursor: 'pointer',
  display: 'inline-flex',
  fontSize: 13,
  fontWeight: 700,
  gap: 7,
  minHeight: 34,
  padding: '0 11px'
} satisfies React.CSSProperties;

const titleStyle = {
  fontSize: 22,
  lineHeight: 1.15,
  margin: 0
} satisfies React.CSSProperties;

const sectionTitleStyle = {
  color: '#d1d5db',
  fontSize: 13,
  letterSpacing: 0,
  margin: '0 0 12px',
  textTransform: 'uppercase'
} satisfies React.CSSProperties;

const sessionListStyle = {
  display: 'grid',
  gap: 8,
  listStyle: 'none',
  margin: 0,
  padding: 0
} satisfies React.CSSProperties;

const sessionButtonStyle = {
  border: '1px solid #2f343a',
  borderRadius: 6,
  color: '#f3f4f6',
  cursor: 'pointer',
  display: 'grid',
  gap: 7,
  minHeight: 72,
  padding: 12,
  textAlign: 'left',
  width: '100%'
} satisfies React.CSSProperties;

const sessionQueryStyle = {
  fontSize: 14,
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
} satisfies React.CSSProperties;

const sessionMetaStyle = {
  color: '#9ca3af',
  fontSize: 12
} satisfies React.CSSProperties;

const detailsListStyle = {
  display: 'grid',
  gap: 14,
  margin: 0
} satisfies React.CSSProperties;

const detailRowStyle = {
  display: 'grid',
  gap: 5,
  minWidth: 0
} satisfies React.CSSProperties;

const detailLabelStyle = {
  color: '#9ca3af',
  fontSize: 12,
  margin: 0
} satisfies React.CSSProperties;

const detailValueStyle = {
  color: '#f3f4f6',
  fontSize: 13,
  lineHeight: 1.45,
  margin: 0,
  overflowWrap: 'anywhere'
} satisfies React.CSSProperties;

const mutedTextStyle = {
  color: '#9ca3af',
  fontSize: 13,
  lineHeight: 1.45,
  margin: 0
} satisfies React.CSSProperties;

const errorTextStyle = {
  color: '#fca5a5',
  fontSize: 13,
  lineHeight: 1.45,
  margin: '0 0 16px'
} satisfies React.CSSProperties;

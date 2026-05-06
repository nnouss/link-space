import { Network, Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { LinkSpaceData, RuntimeMessage, SearchSession } from '../shared/types';

type RuntimeResponse =
  | { ok: true; data: LinkSpaceData }
  | { ok: false; error: string };

const containerStyle = {
  width: 320,
  padding: 16,
  color: '#17202a',
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
} satisfies React.CSSProperties;

const buttonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  border: '1px solid #d0d7de',
  borderRadius: 6,
  background: '#ffffff',
  color: '#17202a',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  minHeight: 36,
  padding: '0 12px'
} satisfies React.CSSProperties;

export function Popup() {
  const [data, setData] = useState<LinkSpaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    let mounted = true;

    sendRuntimeMessage({ type: 'GET_DATA' })
      .then((response) => {
        if (!mounted) {
          return;
        }

        if (response.ok) {
          setData(response.data);
          setError(null);
        } else {
          setError(response.error);
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

  const recentSessions = useMemo(() => {
    if (!data) {
      return [];
    }

    return Object.values(data.sessions)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, 5);
  }, [data]);

  async function toggleRecordingPaused() {
    if (!data || isUpdating) {
      return;
    }

    setIsUpdating(true);
    try {
      const response = await sendRuntimeMessage({
        type: 'SET_RECORDING_PAUSED',
        paused: !data.settings.recordingPaused
      });

      if (response.ok) {
        setData(response.data);
        setError(null);
      } else {
        setError(response.error);
      }
    } catch {
      setError('설정을 변경하지 못했습니다.');
    } finally {
      setIsUpdating(false);
    }
  }

  function openDashboard() {
    void chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
  }

  const recordingPaused = data?.settings.recordingPaused ?? false;
  const ToggleIcon = recordingPaused ? Play : Pause;

  return (
    <main style={containerStyle}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: 1.2 }}>Link Space</h1>
        <span style={{ color: recordingPaused ? '#9a3412' : '#166534', fontSize: 12 }}>
          {recordingPaused ? '일시정지' : '기록 중'}
        </span>
      </header>

      <section style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          type="button"
          onClick={toggleRecordingPaused}
          disabled={!data || isUpdating}
          style={{ ...buttonStyle, flex: 1, opacity: !data || isUpdating ? 0.6 : 1 }}
        >
          <ToggleIcon size={16} aria-hidden="true" />
          {recordingPaused ? '다시 시작' : '일시정지'}
        </button>
        <button type="button" onClick={openDashboard} style={buttonStyle} aria-label="대시보드 열기">
          <Network size={16} aria-hidden="true" />
          대시보드
        </button>
      </section>

      {error ? (
        <p style={{ margin: '16px 0 0', color: '#b42318', fontSize: 13 }}>{error}</p>
      ) : null}

      <section style={{ marginTop: 18 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14 }}>최근 검색 세션</h2>
        {isLoading ? (
          <p style={{ margin: 0, color: '#57606a', fontSize: 13 }}>불러오는 중입니다.</p>
        ) : recentSessions.length > 0 ? (
          <ul style={{ display: 'grid', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
            {recentSessions.map((session) => (
              <RecentSessionItem key={session.id} session={session} />
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, color: '#57606a', fontSize: 13 }}>저장된 세션이 없습니다.</p>
        )}
      </section>
    </main>
  );
}

function RecentSessionItem({ session }: { session: SearchSession }) {
  return (
    <li
      style={{
        border: '1px solid #d8dee4',
        borderRadius: 6,
        padding: 10,
        background: '#f6f8fa'
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
        title={session.query}
      >
        {session.query}
      </div>
      <div style={{ color: '#57606a', display: 'flex', gap: 10, marginTop: 6, fontSize: 12 }}>
        <span>{session.status === 'active' ? '진행 중' : '종료됨'}</span>
        <span>노드 {session.nodeIds.length}개</span>
      </div>
    </li>
  );
}

function sendRuntimeMessage(message: RuntimeMessage): Promise<RuntimeResponse> {
  return chrome.runtime.sendMessage(message);
}

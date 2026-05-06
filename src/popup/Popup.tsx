import { Check, Network, Pause, Play, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LinkSpaceData, RuntimeMessage, SearchSession } from '../shared/types';

type RuntimeResponse =
  | { ok: true; data: LinkSpaceData }
  | { ok: false; error: string };

export function Popup() {
  const [data, setData] = useState<LinkSpaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [confirmingDeleteMode, setConfirmingDeleteMode] = useState<'selected' | 'all' | null>(null);

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
          setError('세션 정보를 불러오지 못했습니다.');
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

  function applyDeletedData(nextData: LinkSpaceData) {
    setData(nextData);
    setSelectedSessionIds((currentIds) => currentIds.filter((sessionId) => nextData.sessions[sessionId]));
    setConfirmingDeleteMode(null);
  }

  function toggleSessionSelection(sessionId: string) {
    setConfirmingDeleteMode(null);
    setSelectedSessionIds((currentIds) =>
      currentIds.includes(sessionId)
        ? currentIds.filter((currentId) => currentId !== sessionId)
        : [...currentIds, sessionId]
    );
  }

  async function deleteSelectedSessions() {
    if (isDeleting || selectedSessionIds.length === 0) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      let response = await sendRuntimeMessage({
        type: 'DELETE_SESSIONS',
        sessionIds: selectedSessionIds
      });

      if (!response?.ok) {
        for (const sessionId of selectedSessionIds) {
          response = await sendRuntimeMessage({ type: 'DELETE_SESSION', sessionId });

          if (!response?.ok) {
            break;
          }
        }
      }

      if (response.ok) {
        applyDeletedData(response.data);
        setSelectedSessionIds([]);
      } else {
        setError(response.error);
      }
    } catch {
      setError('선택한 세션을 삭제하지 못했습니다.');
    } finally {
      setIsDeleting(false);
    }
  }

  async function deleteAllSessions() {
    if (isDeleting || !data || Object.keys(data.sessions).length === 0) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await sendRuntimeMessage({ type: 'DELETE_ALL_SESSIONS' });

      if (response.ok) {
        applyDeletedData(response.data);
        setSelectedSessionIds([]);
      } else {
        setError(response.error);
      }
    } catch {
      setError('전체 세션을 삭제하지 못했습니다.');
    } finally {
      setIsDeleting(false);
    }
  }

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
      setError('기록 상태를 변경하지 못했습니다.');
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
      <header style={headerStyle}>
        <div style={brandBlockStyle}>
          <span style={brandMarkStyle}>LS</span>
          <div>
            <h1 style={titleStyle}>Link Space</h1>
            <p style={subtitleStyle}>검색 경로 분석</p>
          </div>
        </div>
        <span style={recordingPaused ? pausedPillStyle : activePillStyle}>
          {recordingPaused ? '기록 일시정지' : '검색 기록 중'}
        </span>
      </header>

      <section style={actionsStyle}>
        <button
          type="button"
          onClick={toggleRecordingPaused}
          disabled={!data || isUpdating}
          style={{ ...primaryButtonStyle, opacity: !data || isUpdating ? 0.58 : 1 }}
        >
          <ToggleIcon size={16} aria-hidden="true" />
          {recordingPaused ? '기록 다시 시작' : '기록 일시정지'}
        </button>
        <button type="button" onClick={openDashboard} style={secondaryButtonStyle}>
          <Network size={16} aria-hidden="true" />
          대시보드
        </button>
      </section>

      {error ? <p style={errorTextStyle}>{error}</p> : null}

      <section style={sessionsSectionStyle}>
        <div style={sectionHeaderStyle}>
          <h2 style={sectionTitleStyle}>최근 세션</h2>
          <span style={countPillStyle}>{recentSessions.length}</span>
        </div>

        {isLoading ? (
          <p style={mutedTextStyle}>세션을 불러오는 중...</p>
        ) : recentSessions.length > 0 ? (
          <>
            <div style={deleteBarStyle}>
              <span style={selectedCountStyle}>선택 {selectedSessionIds.length}</span>
              <div style={deleteActionsStyle}>
                {confirmingDeleteMode === 'selected' ? (
                  <span style={inlineConfirmStyle}>
                    <button type="button" aria-label="선택 세션 삭제 확인" onClick={deleteSelectedSessions} disabled={isDeleting} style={dangerConfirmButtonStyle}>
                      <Check size={13} aria-hidden="true" />
                    </button>
                    <button type="button" aria-label="선택 세션 삭제 취소" onClick={() => setConfirmingDeleteMode(null)} disabled={isDeleting} style={quietIconButtonStyle}>
                      <X size={13} aria-hidden="true" />
                    </button>
                  </span>
                ) : (
                  <button type="button" aria-label="선택 세션 삭제" onClick={() => setConfirmingDeleteMode('selected')} disabled={selectedSessionIds.length === 0 || isDeleting} style={{ ...deleteTextButtonStyle, opacity: selectedSessionIds.length === 0 || isDeleting ? 0.42 : 1 }}>
                    <Trash2 size={13} aria-hidden="true" />
                    선택 삭제
                  </button>
                )}
                {confirmingDeleteMode === 'all' ? (
                  <span style={inlineConfirmStyle}>
                    <button type="button" aria-label="전체 세션 삭제 확인" onClick={deleteAllSessions} disabled={isDeleting} style={dangerConfirmButtonStyle}>
                      <Check size={13} aria-hidden="true" />
                    </button>
                    <button type="button" aria-label="전체 세션 삭제 취소" onClick={() => setConfirmingDeleteMode(null)} disabled={isDeleting} style={quietIconButtonStyle}>
                      <X size={13} aria-hidden="true" />
                    </button>
                  </span>
                ) : (
                  <button type="button" aria-label="전체 세션 삭제" onClick={() => setConfirmingDeleteMode('all')} disabled={isDeleting} style={deleteTextButtonStyle}>
                    전체 삭제
                  </button>
                )}
              </div>
            </div>
            <ul style={sessionListStyle}>
              {recentSessions.map((session) => (
                <RecentSessionItem
                  key={session.id}
                  session={session}
                  checked={selectedSessionIds.includes(session.id)}
                  onToggle={() => toggleSessionSelection(session.id)}
                />
              ))}
            </ul>
          </>
        ) : (
          <p style={mutedTextStyle}>저장된 세션이 없습니다.</p>
        )}
      </section>
    </main>
  );
}

function RecentSessionItem({
  session,
  checked,
  onToggle
}: {
  session: SearchSession;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li style={sessionItemStyle}>
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          aria-label={`세션 선택: ${session.query || '제목 없는 검색'}`}
          checked={checked}
          onChange={onToggle}
          style={checkboxInputStyle}
        />
        <span style={checked ? checkedBoxStyle : checkboxBoxStyle}>
          {checked ? <Check size={12} aria-hidden="true" /> : null}
        </span>
      </label>
      <div style={sessionTextStyle}>
      <div style={sessionQueryStyle} title={session.query}>
        {session.query || '제목 없는 검색'}
      </div>
      <div style={sessionMetaStyle}>
        <span>{formatSessionStatus(session.status)}</span>
        <span>{session.nodeIds.length}개 노드</span>
      </div>
      </div>
    </li>
  );
}

function sendRuntimeMessage(message: RuntimeMessage): Promise<RuntimeResponse> {
  return chrome.runtime.sendMessage(message);
}

function formatSessionStatus(status: SearchSession['status']): string {
  return status === 'active' ? '진행 중' : '종료됨';
}

const fontFamily =
  'Pretendard, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const surfaceColors = {
  page: 'oklch(16% 0.012 225)',
  panel: 'oklch(19% 0.014 225)',
  panelRaised: 'oklch(21% 0.015 225)',
  selectedPanel: 'oklch(24% 0.025 178)',
  border: 'oklch(30% 0.018 225)',
  text: 'oklch(94% 0.012 225)',
  muted: 'oklch(70% 0.028 225)',
  dim: 'oklch(58% 0.03 225)',
  accent: 'oklch(75% 0.11 166)',
  accentText: 'oklch(17% 0.03 166)',
  warning: 'oklch(78% 0.12 82)',
  errorBg: 'oklch(24% 0.04 25)',
  errorText: 'oklch(84% 0.08 25)'
};

const containerStyle = {
  background: surfaceColors.page,
  borderRadius: 10,
  color: surfaceColors.text,
  fontFamily,
  margin: 0,
  overflow: 'hidden',
  padding: 16,
  width: 336
} satisfies CSSProperties;

const headerStyle = {
  alignItems: 'start',
  display: 'flex',
  gap: 12,
  justifyContent: 'space-between'
} satisfies CSSProperties;

const brandBlockStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: 10,
  minWidth: 0
} satisfies CSSProperties;

const brandMarkStyle = {
  alignItems: 'center',
  background: surfaceColors.accent,
  borderRadius: 8,
  color: surfaceColors.accentText,
  display: 'inline-flex',
  flex: '0 0 auto',
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

const activePillStyle = {
  background: 'oklch(24% 0.035 166)',
  borderRadius: 999,
  color: 'oklch(82% 0.09 166)',
  flex: '0 0 auto',
  fontSize: 12,
  fontWeight: 800,
  padding: '5px 9px'
} satisfies CSSProperties;

const pausedPillStyle = {
  ...activePillStyle,
  background: 'oklch(25% 0.035 82)',
  color: surfaceColors.warning
} satisfies CSSProperties;

const actionsStyle = {
  display: 'grid',
  gap: 8,
  gridTemplateColumns: '1fr auto',
  marginTop: 18
} satisfies CSSProperties;

const primaryButtonStyle = {
  alignItems: 'center',
  background: surfaceColors.accent,
  border: 0,
  borderRadius: 8,
  color: surfaceColors.accentText,
  cursor: 'pointer',
  display: 'inline-flex',
  fontSize: 13,
  fontWeight: 900,
  gap: 7,
  justifyContent: 'center',
  minHeight: 38,
  padding: '0 12px'
} satisfies CSSProperties;

const secondaryButtonStyle = {
  alignItems: 'center',
  background: surfaceColors.panelRaised,
  border: '1px solid transparent',
  borderRadius: 8,
  color: surfaceColors.text,
  cursor: 'pointer',
  display: 'inline-flex',
  fontSize: 13,
  fontWeight: 800,
  gap: 7,
  justifyContent: 'center',
  minHeight: 38,
  padding: '0 12px'
} satisfies CSSProperties;

const sessionsSectionStyle = {
  marginTop: 20
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
  fontWeight: 900,
  margin: 0,
  textTransform: 'uppercase'
} satisfies CSSProperties;

const countPillStyle = {
  background: surfaceColors.panelRaised,
  borderRadius: 999,
  color: surfaceColors.muted,
  fontSize: 12,
  padding: '2px 8px'
} satisfies CSSProperties;

const deleteBarStyle = {
  alignItems: 'center',
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: 8
} satisfies CSSProperties;

const deleteActionsStyle = {
  display: 'inline-flex',
  gap: 6
} satisfies CSSProperties;

const selectedCountStyle = {
  color: surfaceColors.dim,
  fontSize: 12,
  fontWeight: 800
} satisfies CSSProperties;

const deleteTextButtonStyle = {
  alignItems: 'center',
  background: surfaceColors.panelRaised,
  border: `1px solid ${surfaceColors.border}`,
  borderRadius: 7,
  color: surfaceColors.muted,
  cursor: 'pointer',
  display: 'inline-flex',
  fontSize: 12,
  fontWeight: 850,
  gap: 5,
  height: 28,
  padding: '0 8px'
} satisfies CSSProperties;

const inlineConfirmStyle = {
  display: 'inline-flex',
  gap: 5
} satisfies CSSProperties;

const quietIconButtonStyle = {
  alignItems: 'center',
  background: surfaceColors.panelRaised,
  border: `1px solid ${surfaceColors.border}`,
  borderRadius: 7,
  color: surfaceColors.muted,
  cursor: 'pointer',
  display: 'inline-flex',
  height: 28,
  justifyContent: 'center',
  width: 28
} satisfies CSSProperties;

const dangerConfirmButtonStyle = {
  ...quietIconButtonStyle,
  background: 'oklch(31% 0.055 28)',
  borderColor: 'oklch(47% 0.08 28)',
  color: 'oklch(86% 0.055 40)'
} satisfies CSSProperties;

const sessionListStyle = {
  display: 'grid',
  gap: 8,
  listStyle: 'none',
  margin: 0,
  padding: 0
} satisfies CSSProperties;

const sessionItemStyle = {
  background: surfaceColors.panel,
  border: `1px solid ${surfaceColors.border}`,
  borderRadius: 8,
  display: 'grid',
  gap: 7,
  gridTemplateColumns: '24px minmax(0, 1fr)',
  padding: '11px 12px'
} satisfies CSSProperties;

const sessionTextStyle = {
  display: 'grid',
  gap: 7,
  minWidth: 0
} satisfies CSSProperties;

const checkboxLabelStyle = {
  alignItems: 'center',
  cursor: 'pointer',
  display: 'inline-flex',
  height: 22,
  justifyContent: 'center',
  width: 22
} satisfies CSSProperties;

const checkboxInputStyle = {
  height: 1,
  opacity: 0,
  position: 'absolute',
  width: 1
} satisfies CSSProperties;

const checkboxBoxStyle = {
  alignItems: 'center',
  background: 'oklch(22% 0.014 225)',
  border: `1px solid ${surfaceColors.border}`,
  borderRadius: 5,
  color: surfaceColors.accentText,
  display: 'inline-flex',
  height: 18,
  justifyContent: 'center',
  width: 18
} satisfies CSSProperties;

const checkedBoxStyle = {
  ...checkboxBoxStyle,
  background: surfaceColors.accent,
  borderColor: surfaceColors.accent,
  color: surfaceColors.accentText
} satisfies CSSProperties;

const sessionQueryStyle = {
  color: surfaceColors.text,
  fontSize: 13,
  fontWeight: 850,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
} satisfies CSSProperties;

const sessionMetaStyle = {
  color: surfaceColors.dim,
  display: 'flex',
  fontSize: 12,
  gap: 10
} satisfies CSSProperties;

const mutedTextStyle = {
  color: surfaceColors.muted,
  fontSize: 13,
  lineHeight: 1.45,
  margin: 0
} satisfies CSSProperties;

const errorTextStyle = {
  background: surfaceColors.errorBg,
  borderRadius: 6,
  color: surfaceColors.errorText,
  fontSize: 13,
  lineHeight: 1.45,
  margin: '14px 0 0',
  padding: 10
} satisfies CSSProperties;

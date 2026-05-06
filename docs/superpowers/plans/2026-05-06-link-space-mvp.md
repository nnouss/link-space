# Link Space MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google 검색에서 시작된 탐색 흐름을 로컬에 기록하고, 확장프로그램 dashboard에서 어두운 3D 링크 맵으로 복기할 수 있는 MVP를 만든다.

**Architecture:** Manifest V3 확장프로그램으로 구성한다. `background service worker`는 검색 세션과 navigation 수집을 담당하고, `chrome.storage.local` adapter는 저장과 JSON import/export를 담당하며, React 기반 `popup`과 `dashboard`는 상태 제어와 3D 시각화를 담당한다.

**Tech Stack:** TypeScript, Vite, React, Manifest V3, Chrome Extension APIs, Vitest, Testing Library, Three.js 또는 `react-force-graph-3d`.

---

## 파일 구조

- Create: `package.json` - npm scripts와 dependency 선언.
- Create: `tsconfig.json` - TypeScript 컴파일 기준.
- Create: `vite.config.ts` - popup, dashboard, background entry를 빌드한다.
- Create: `index.html`, `popup.html`, `public/manifest.json` - 확장프로그램 entry와 manifest.
- Create: `src/shared/types.ts` - `SearchSession`, `PageNode`, `NavigationEdge`, `Settings` 타입.
- Create: `src/shared/google.ts` - Google 검색 URL 감지와 query 추출.
- Create: `src/shared/session.ts` - 세션 시작/종료, node/edge 생성 순수 로직.
- Create: `src/shared/storage.ts` - `chrome.storage.local` adapter와 JSON import/export 검증.
- Create: `src/background/index.ts` - Chrome 이벤트 연결과 runtime message 처리.
- Create: `src/popup/Popup.tsx`, `src/popup/main.tsx` - 기록 상태 제어 popup.
- Create: `src/dashboard/Dashboard.tsx`, `src/dashboard/GraphView.tsx`, `src/dashboard/main.tsx` - 세션 목록, 3D 맵, 상세 패널.
- Create: `src/test/chromeMock.ts`, `src/shared/*.test.ts` - Chrome API mock과 unit test.

---

### Task 1: 프로젝트 스캐폴딩

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `popup.html`
- Create: `public/manifest.json`

- [ ] **Step 1: 기본 package와 script 작성**

`package.json`을 생성한다.

```json
{
  "name": "link-space",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "vite": "latest",
    "typescript": "latest",
    "react": "latest",
    "react-dom": "latest",
    "three": "latest",
    "react-force-graph-3d": "latest",
    "lucide-react": "latest"
  },
  "devDependencies": {
    "@testing-library/react": "latest",
    "@types/chrome": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "@types/three": "latest",
    "jsdom": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: TypeScript와 Vite 설정 작성**

`tsconfig.json`을 생성한다.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "strict": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "jsx": "react-jsx",
    "types": ["chrome", "vitest/globals"],
    "skipLibCheck": true
  },
  "include": ["src", "vite.config.ts"]
}
```

`vite.config.ts`를 생성한다.

```ts
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, 'index.html'),
        popup: resolve(__dirname, 'popup.html'),
        background: resolve(__dirname, 'src/background/index.ts')
      },
      output: {
        entryFileNames: (chunk) => chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/chromeMock.ts']
  }
});
```

- [ ] **Step 3: HTML과 manifest 작성**

`index.html`, `popup.html`, `public/manifest.json`을 생성한다. `manifest.json`은 `storage`, `tabs`, `webNavigation` 권한과 `https://www.google.com/*`, `https://www.google.co.kr/*`, `<all_urls>` host permission을 가진다.

- [ ] **Step 4: 설치와 초기 검증**

Run: `npm install`

Expected: `package-lock.json`이 생성되고 dependency 설치가 완료된다.

Run: `npm run build`

Expected: 아직 source entry가 없어서 `src/dashboard/main.tsx` 또는 `src/popup/main.tsx` missing 오류로 실패한다.

- [ ] **Step 5: Commit**

`$git-commit-by-scope`를 사용한다. 예상 commit message:

```bash
git commit -m "build: 확장프로그램 프로젝트 스캐폴딩"
```

---

### Task 2: 공유 타입과 Google 검색어 파서

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/google.ts`
- Create: `src/shared/google.test.ts`
- Create: `src/test/chromeMock.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/shared/google.test.ts`를 생성한다.

```ts
import { describe, expect, it } from 'vitest';
import { parseGoogleSearch } from './google';

describe('parseGoogleSearch', () => {
  it('google.com search URL에서 q 값을 추출한다', () => {
    expect(parseGoogleSearch('https://www.google.com/search?q=three.js+graph')).toEqual({
      engine: 'google',
      query: 'three.js graph'
    });
  });

  it('Google 검색 URL이 아니면 null을 반환한다', () => {
    expect(parseGoogleSearch('https://example.com/search?q=three')).toBeNull();
  });

  it('q 값이 비어 있으면 null을 반환한다', () => {
    expect(parseGoogleSearch('https://www.google.com/search?q=')).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- src/shared/google.test.ts`

Expected: FAIL with `Cannot find module './google'`.

- [ ] **Step 3: 공유 타입과 Google parser 구현**

`src/shared/types.ts`에 `SearchSession`, `PageNode`, `NavigationEdge`, `Settings`, `LinkSpaceData`를 정의한다.

`src/shared/google.ts`를 생성한다.

```ts
import type { SearchEngine } from './types';

export interface ParsedSearch {
  engine: SearchEngine;
  query: string;
}

const GOOGLE_HOSTS = new Set(['www.google.com', 'google.com', 'www.google.co.kr', 'google.co.kr']);

export function parseGoogleSearch(url: string): ParsedSearch | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!GOOGLE_HOSTS.has(parsed.hostname) || parsed.pathname !== '/search') return null;

  const query = parsed.searchParams.get('q')?.trim();
  return query ? { engine: 'google', query } : null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- src/shared/google.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

`$git-commit-by-scope`를 사용한다. 예상 commit message:

```bash
git commit -m "feat: Google 검색어 파서 추가"
```

---

### Task 3: 세션 그래프 로직과 저장소

**Files:**
- Create: `src/shared/session.ts`
- Create: `src/shared/session.test.ts`
- Create: `src/shared/storage.ts`
- Create: `src/shared/storage.test.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: 세션 로직 실패 테스트 작성**

`src/shared/session.test.ts`를 생성한다. 테스트는 root node 생성, 새 검색어 감지, page node와 edge 추가, 30분 timeout 종료를 검증한다.

```ts
import { describe, expect, it } from 'vitest';
import { addPageVisit, createSearchSession, endExpiredSessions, shouldStartNewSession } from './session';
import { createEmptyData } from './storage';

describe('session logic', () => {
  it('검색어 root node와 active session을 생성한다', () => {
    const result = createSearchSession(createEmptyData(), {
      query: 'three graph',
      tabId: 7,
      now: '2026-05-06T00:00:00.000Z'
    });
    const session = result.data.sessions[result.sessionId];
    const root = result.data.nodes[session.rootNodeId];

    expect(session.status).toBe('active');
    expect(root.title).toBe('three graph');
    expect(root.depth).toBe(0);
  });

  it('페이지 방문을 node와 edge로 추가한다', () => {
    const first = createSearchSession(createEmptyData(), {
      query: 'first',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    const added = addPageVisit(first.data, {
      sessionId: first.sessionId,
      fromNodeId: first.data.sessions[first.sessionId].rootNodeId,
      url: 'https://example.com/a',
      title: 'A',
      now: '2026-05-06T00:01:00.000Z',
      isSearchResultClick: true
    });

    expect(added.data.sessions[first.sessionId].nodeIds).toHaveLength(2);
    expect(added.data.sessions[first.sessionId].edgeIds).toHaveLength(1);
  });

  it('30분보다 오래 비활성인 세션을 종료한다', () => {
    const first = createSearchSession(createEmptyData(), {
      query: 'first',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    const expired = endExpiredSessions(first.data, '2026-05-06T00:31:00.000Z');
    expect(expired.sessions[first.sessionId].status).toBe('ended');
  });

  it('새 검색어가 기존 active session과 다르면 새 세션을 시작해야 한다', () => {
    const first = createSearchSession(createEmptyData(), {
      query: 'first',
      tabId: 1,
      now: '2026-05-06T00:00:00.000Z'
    });
    expect(shouldStartNewSession(first.data, 1, 'second')).toBe(true);
    expect(shouldStartNewSession(first.data, 1, 'first')).toBe(false);
  });
});
```

- [ ] **Step 2: storage 실패 테스트 작성**

`src/shared/storage.test.ts`를 생성한다. 테스트는 빈 데이터 반환, `chrome.storage.local.set`, 유효한 JSON import, 잘못된 JSON 거부를 검증한다.

- [ ] **Step 3: 실패 확인**

Run: `npm run test -- src/shared/session.test.ts src/shared/storage.test.ts`

Expected: FAIL with `Cannot find module './session'` 또는 `Cannot find module './storage'`.

- [ ] **Step 4: 최소 구현 작성**

`src/shared/session.ts`는 순수 함수 `createSearchSession`, `shouldStartNewSession`, `addPageVisit`, `endExpiredSessions`를 export한다. `src/shared/storage.ts`는 `createEmptyData`, `loadData`, `saveData`, `exportLinkSpaceData`, `importLinkSpaceData`를 export한다. `importLinkSpaceData`는 `sessions`, `nodes`, `edges`, `settings.recordingPaused`, `settings.sessionTimeoutMinutes` 형태를 검증하고 실패하면 `Invalid Link Space data` error를 던진다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm run test -- src/shared/session.test.ts src/shared/storage.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

`$git-commit-by-scope`를 사용한다. 예상 commit message:

```bash
git commit -m "feat: 검색 세션 저장 로직 추가"
```

---

### Task 4: Background 수집과 popup 제어

**Files:**
- Create: `src/background/index.ts`
- Create: `src/popup/Popup.tsx`
- Create: `src/popup/main.tsx`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Runtime message 타입 추가**

`src/shared/types.ts`에 다음 타입을 추가한다.

```ts
export type RuntimeMessage =
  | { type: 'GET_DATA' }
  | { type: 'SET_RECORDING_PAUSED'; paused: boolean }
  | { type: 'IMPORT_DATA'; payload: LinkSpaceData };
```

- [ ] **Step 2: background 구현**

`src/background/index.ts`를 생성한다. `chrome.webNavigation.onCommitted`에서 main frame만 처리하고, Google 검색 URL이면 세션을 만들며, 일반 URL이면 같은 tab의 active session에 page node와 edge를 추가한다. `chrome.runtime.onMessage`는 `GET_DATA`, `SET_RECORDING_PAUSED`, `IMPORT_DATA`를 처리한다.

- [ ] **Step 3: popup 구현**

`src/popup/Popup.tsx`는 `GET_DATA`로 상태를 읽고, 기록 일시정지/재개 버튼과 최근 세션 목록, dashboard 열기 버튼을 표시한다. `src/popup/main.tsx`는 React root를 mount한다.

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`

Expected: dashboard entry가 아직 없어서 `src/dashboard/main.tsx` missing 오류로 실패한다.

- [ ] **Step 5: Commit**

`$git-commit-by-scope`를 사용한다. 예상 commit message:

```bash
git commit -m "feat: 탐색 기록 수집과 popup 제어 추가"
```

---

### Task 5: Dashboard와 3D 링크 맵

**Files:**
- Create: `src/dashboard/Dashboard.tsx`
- Create: `src/dashboard/GraphView.tsx`
- Create: `src/dashboard/main.tsx`

- [ ] **Step 1: GraphView 구현**

`src/dashboard/GraphView.tsx`를 생성한다. `react-force-graph-3d`를 사용하고, `depth` 기반 색상, `visitCount`와 `dwellTime` 기반 node 크기, 얇은 link line, node click callback을 구현한다.

- [ ] **Step 2: Dashboard 구현**

`src/dashboard/Dashboard.tsx`를 생성한다. 왼쪽 세션 목록, 중앙 3D map, 오른쪽 node 상세 패널, 상단 JSON export/import 버튼을 구현한다.

- [ ] **Step 3: Dashboard mount 작성**

`src/dashboard/main.tsx`를 생성한다.

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from './Dashboard';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Dashboard />
  </React.StrictMode>
);
```

- [ ] **Step 4: 전체 검증**

Run: `npm run test`

Expected: PASS.

Run: `npm run build`

Expected: PASS and `dist/manifest.json`, `dist/background.js`, dashboard assets, popup assets are created.

- [ ] **Step 5: 수동 확장프로그램 검증**

Chrome 또는 Edge에서 `dist` 폴더를 unpacked extension으로 로드한다.

검증 순서:

1. Google에서 `three.js graph`를 검색한다.
2. 검색 결과 하나를 클릭한다.
3. 확장프로그램 popup에서 최근 세션에 `three.js graph`가 보이는지 확인한다.
4. dashboard를 열고 3D map에 root node와 page node가 연결되어 있는지 확인한다.
5. node 클릭 시 오른쪽 상세 패널에 title, domain, URL이 보이는지 확인한다.

- [ ] **Step 6: Commit**

`$git-commit-by-scope`를 사용한다. 예상 commit message:

```bash
git commit -m "feat: 검색 세션 3D 대시보드 추가"
```

---

## 계획 자체 검토

- 설계 범위의 Google 검색 감지, 검색 세션 저장, JSON import/export, popup, dashboard, 3D map, local-first privacy는 Task 2부터 Task 5에 반영되어 있다.
- Windows 앱, cloud sync, 전체 방문 기록 수집, 페이지 본문 저장, Naver/Bing 지원은 구현 작업에 포함하지 않았다.
- 테스트는 Google parser, 세션 규칙, storage import/export를 unit test로 먼저 다루고, 확장프로그램과 3D map은 수동 검증 단계로 둔다.
- 각 commit은 `$git-commit-by-scope`를 사용해 scope별로 분리한다.

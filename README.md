# Link Space

Google 검색과 브라우징 흐름을 세션 단위로 기록하고, 방문한 페이지 간의 관계를 3D 링크 그래프로 확인하는 Chrome 확장 프로그램입니다.

## Overview

Link Space는 단순한 북마크 도구가 아니라 사용자가 어떤 검색어에서 출발했고, 어떤 페이지로 이동했으며, 탐색이 어디에서 분기되었는지를 분석하기 위한 도구입니다.

확장 프로그램은 백그라운드에서 탐색 이벤트를 수집하고, 팝업과 대시보드를 통해 세션 기록을 관리합니다. 대시보드에서는 선택한 세션의 페이지 노드와 이동 경로를 3D 그래프로 살펴볼 수 있습니다.

## Features

- Google 검색 및 일반 브라우징 세션 기록
- 방문 페이지를 노드, 페이지 간 이동을 엣지로 저장
- 세션별 3D 링크 그래프 시각화
- 노드 선택 시 URL, 도메인, 방문 시각, 깊이 등 상세 정보 확인
- 팝업에서 기록 일시정지 및 재시작
- 선택 세션 삭제, 전체 세션 삭제
- Link Space JSON 데이터 내보내기 및 가져오기
- `chrome.storage.local` 기반 로컬 저장

## Tech Stack

- React
- TypeScript
- Vite
- Chrome Extension Manifest V3
- Three.js
- react-force-graph-3d
- Vitest
- Testing Library

## Getting Started

### Prerequisites

- Node.js
- npm
- Chrome 또는 Chromium 기반 브라우저

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Vite 개발 서버는 `127.0.0.1` 호스트로 실행됩니다. 확장 프로그램 기능은 Chrome Extension 환경에서 동작하므로 실제 확장 동작 확인은 빌드 후 Chrome에 로드하는 방식을 사용합니다.

### Build

```bash
npm run build
```

빌드 결과물은 `dist/` 디렉터리에 생성됩니다.

### Load Extension in Chrome

1. Chrome에서 `chrome://extensions`로 이동합니다.
2. 우측 상단의 Developer mode를 켭니다.
3. Load unpacked를 선택합니다.
4. 프로젝트의 `dist/` 디렉터리를 선택합니다.

## Usage

1. 확장 프로그램을 Chrome에 로드합니다.
2. Google 검색 또는 일반 브라우징을 시작합니다.
3. 확장 프로그램 팝업에서 기록 상태와 최근 세션을 확인합니다.
4. Dashboard 버튼으로 대시보드를 엽니다.
5. 왼쪽 세션 목록에서 세션을 선택하고, 그래프 노드를 클릭해 상세 정보를 확인합니다.
6. 필요한 경우 데이터를 JSON으로 내보내거나 가져옵니다.

## Project Structure

```text
.
├── public/
│   └── manifest.json
├── src/
│   ├── background/
│   │   └── index.ts
│   ├── dashboard/
│   │   ├── Dashboard.tsx
│   │   ├── GraphView.tsx
│   │   └── main.tsx
│   ├── popup/
│   │   ├── Popup.tsx
│   │   └── main.tsx
│   ├── shared/
│   │   ├── google.ts
│   │   ├── session.ts
│   │   ├── storage.ts
│   │   └── types.ts
│   └── test/
│       └── chromeMock.ts
├── index.html
├── popup.html
├── vite.config.ts
└── package.json
```

## Core Modules

- `src/background/index.ts`: Chrome navigation 이벤트를 수신하고 세션, 노드, 엣지 데이터를 저장합니다.
- `src/popup/Popup.tsx`: 기록 상태 전환, 최근 세션 확인, 세션 삭제, 대시보드 열기를 제공합니다.
- `src/dashboard/Dashboard.tsx`: 세션 목록, 데이터 가져오기/내보내기, 노드 상세 패널을 관리합니다.
- `src/dashboard/GraphView.tsx`: 세션 데이터를 3D 그래프로 변환하고 렌더링합니다.
- `src/shared/session.ts`: 세션 생성, 페이지 방문 추가, 세션 만료 처리 로직을 담당합니다.
- `src/shared/storage.ts`: `chrome.storage.local` 입출력, 데이터 검증, 가져오기/내보내기, 삭제 로직을 담당합니다.
- `src/shared/google.ts`: Google 검색 URL에서 검색어를 파싱합니다.

## Data Model

Link Space 데이터는 다음 구조로 저장됩니다.

- `sessions`: 검색 또는 브라우징 흐름 단위의 세션
- `nodes`: 방문한 페이지 또는 세션의 루트 페이지
- `edges`: 페이지 간 이동 관계
- `settings`: 기록 일시정지 상태와 세션 타임아웃 설정

기본 세션 타임아웃은 30분입니다. 유효하지 않은 가져오기 데이터는 저장 전에 검증 단계에서 거부됩니다.

## Permissions

확장 프로그램은 다음 Chrome 권한을 사용합니다.

- `storage`: 세션과 그래프 데이터를 로컬에 저장합니다.
- `tabs`: 현재 탭 정보와 페이지 제목을 읽습니다.
- `webNavigation`: 페이지 이동 이벤트를 추적합니다.
- `host_permissions`: Google 검색 및 방문 페이지 흐름을 기록하기 위해 사용됩니다.

## Scripts

```bash
npm run dev
npm run build
npm run test
npm run test:watch
```

## Testing

```bash
npm run test
```

테스트는 Vitest와 jsdom 환경에서 실행되며, Chrome API는 `src/test/chromeMock.ts`에서 모킹합니다.

## Product Direction

Link Space의 인터페이스는 분석 중심의 차분한 도구를 지향합니다. 그래프를 장식 요소가 아니라 탐색 구조를 읽기 위한 핵심 화면으로 다루며, 사용자가 세션의 시작점, 분기, 중요 페이지, 관계를 빠르게 파악하는 것을 목표로 합니다.

# Link Space 설계

## 목적

Link Space는 Google 검색에서 시작된 웹 탐색 경로를 기록하고, 이를 3D 링크 맵으로 시각화하는 Chrome/Edge 브라우저 확장프로그램이다. 첫 버전은 두 가지 문제를 해결하는 데 집중한다.

- 매번 북마크하지 않아도 검색 여정을 보존한다.
- 검색어에서 방문 페이지로 이어지는 브라우징 패턴을 나중에 복기할 수 있게 한다.

MVP는 전체 브라우저 방문 기록을 수집하지 않는다. Google 검색 결과 흐름에서 시작된 탐색만 기록한다.

## 제품 범위

### 포함

- Chrome/Edge Manifest V3 확장프로그램.
- Google 검색 감지.
- 검색 세션 기반 기록.
- `chrome.storage.local` 기반 로컬 전용 저장.
- JSON export/import.
- 기록 상태와 빠른 동작을 제공하는 popup.
- 저장된 검색 세션을 살펴보는 dashboard.
- 공간형 지식 지도에 가까운 어두운 3D node-link 시각화.

### MVP에서 제외

- Windows 데스크톱 앱.
- cloud sync 또는 원격 backend.
- 전체 브라우저 방문 기록 수집.
- 페이지 본문 저장, 요약, 색인.
- Naver/Bing 지원.
- 다중 기기 계정 시스템.

## 아키텍처

확장프로그램은 네 부분으로 나눈다.

### Background Service Worker

`background service worker`는 이벤트 수집과 세션 상태를 담당한다.

역할:

- 탭 URL 변경과 navigation 이벤트를 관찰한다.
- Google 검색 결과 URL을 감지하고 검색어를 추출한다.
- 새 Google 검색어가 나타나면 새 검색 세션을 시작한다.
- 활성 검색 흐름에서 방문한 페이지를 node로 추가한다.
- navigation 관계를 edge로 추가한다.
- 새 검색어가 시작되거나 세션이 30분 동안 비활성 상태이면 세션을 종료한다.
- 사용자 설정의 기록 일시정지 상태를 따른다.

### Storage Layer

`storage layer`는 데이터를 `chrome.storage.local`에 저장한다.

역할:

- 검색 세션, 페이지 node, navigation edge를 저장한다.
- 기록 일시정지 상태 같은 확장프로그램 설정을 저장한다.
- JSON export/import를 제공한다.
- 나중에 로컬 데스크톱 앱에서도 재사용할 수 있을 정도로 저장 포맷을 안정적으로 유지한다.

### Popup

`popup`은 작고 빠른 제어 화면이다.

역할:

- 기록이 활성 상태인지 일시정지 상태인지 보여준다.
- 기록 일시정지/재개를 전환한다.
- 최근 검색 세션을 보여준다.
- dashboard를 연다.

`popup`에는 복잡한 분석이나 3D 상호작용을 넣지 않는다.

### Dashboard

`dashboard`는 복기와 시각화를 위한 메인 화면이다.

레이아웃:

- 왼쪽 패널: 저장된 검색 세션 목록.
- 중앙: 3D 링크 맵.
- 오른쪽 패널: 선택한 node 또는 세션 상세 정보.
- 상단 영역: 검색/필터 제어와 JSON import/export.

MVP는 검색 세션별 맵을 기본으로 한다. 데이터 모델은 나중에 여러 세션을 합친 전체 히스토리 맵으로 확장할 수 있게 둔다.

## 데이터 모델

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

## 세션 규칙

확장프로그램이 지원 가능한 Google 검색 결과 URL을 감지하고 비어 있지 않은 검색어를 추출하면 검색 세션이 시작된다.

다음 조건 중 하나가 참이면 세션을 종료한다.

- 새 Google 검색어가 감지된다.
- 관련 navigation이 30분 동안 발생하지 않는다.

첫 버전은 같은 탭 흐름에서 이어지는 페이지를 기록한다. 검색 결과에서 새 탭으로 열린 페이지는 Chrome이 신뢰 가능한 opener 관계를 제공할 때만 원래 세션에 연결한다. 관계를 확인할 수 없으면 해당 페이지는 세션에 추가하지 않는다.

## 3D 시각화

시각 목표는 어두운 3D 공간 안에 라벨이 붙은 node가 떠 있고, 얇은 연결선이 node 사이를 잇는 공간형 링크 맵이다.

규칙:

- 검색어는 root node다.
- Google 검색 결과에서 직접 클릭한 페이지는 1-depth node다.
- 그 페이지 이후 방문한 페이지는 더 깊은 node가 된다.
- edge는 실제 navigation 순서를 나타낸다.
- node 색상은 `depth`를 기준으로 한다.
- node 크기는 `visitCount`와 `dwellTime`을 기준으로 한다.
- node 밝기 또는 강조는 `isSearchResultClick`과 재방문 여부를 반영한다.
- 라벨은 기본적으로 페이지 `title`을 사용하고, 필요하면 `domain`으로 대체한다.
- 사용자는 camera를 회전, 확대/축소, pan할 수 있다.
- node를 클릭하면 상세 패널에 URL, title, domain, 방문 시간, dwell time, 경로 맥락을 표시한다.

구현 계획 단계에서 frontend stack에 맞춰 `Three.js` 또는 `react-force-graph-3d` 같은 작은 wrapper 중 하나를 선택한다.

## Privacy

MVP는 local-first privacy 모델을 따른다.

- 데이터는 `chrome.storage.local`에 남는다.
- backend service를 사용하지 않는다.
- cloud sync를 구현하지 않는다.
- 페이지 본문 text를 저장하지 않는다.
- Google 검색에서 시작된 흐름만 기록한다.
- 사용자는 popup에서 기록을 일시정지할 수 있다.
- JSON export/import는 사용자가 직접 제어한다.

## 오류 처리

확장프로그램은 조용히 실패하되, 사용자가 상태를 이해할 수 있게 해야 한다.

- Google 검색어를 파싱할 수 없으면 세션을 만들지 않는다.
- storage write가 실패하면 popup 또는 dashboard에 간결한 error state를 보여준다.
- import한 JSON이 유효하지 않으면 거부하고 기존 데이터는 변경하지 않는다.
- 탭 관계를 확인할 수 없으면 관련 없는 브라우징 맥락을 임의로 연결하지 않는다.
- 기록이 일시정지 상태이면 새 세션이나 node를 만들지 않는다.

## 테스트 전략

테스트는 사용자 기록이 사라지거나 왜곡될 수 있는 경계에 집중한다.

- Google 검색어 파싱 unit test.
- 세션 시작/종료 규칙 unit test.
- node와 edge 생성 unit test.
- JSON import 검증 unit test.
- Google 검색에서 페이지 이동까지의 확장프로그램 manual test.
- 3D map rendering과 node 선택 dashboard manual test.

## 향후 확장 지점

설계는 다음 기능을 나중에 추가할 수 있게 여지를 둔다.

- Naver와 Bing query adapter.
- 여러 검색 세션을 합친 전체 히스토리 맵.
- 같은 JSON 포맷을 읽는 Windows 로컬 앱.
- 선택적 수동 기록 세션.
- domain, 날짜, dwell time, depth 기준 고급 필터.
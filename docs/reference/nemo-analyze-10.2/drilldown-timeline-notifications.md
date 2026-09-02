# 드릴다운 · 타임라인 · 알림 설정 · 옵션 (p87–93 · p200–214 · p451–459)

브리프 ①·②가 요약만 한 네 절의 원문 전사입니다. 공통점은 셋 다 **"문제의 그 순간으로 가는"**
조작이라는 것 — 파이에서, 그리드 행에서, 지도의 점에서, 타임라인의 구간에서.

| | |
|---|---|
| 출처 | User Guide ch.8 Drilldown (p87–93) · Numerical/Info/Timeline/Other views (p200–214) · ch.12 Notifications (p451–453) · Options (p454–459) |
| 관련 문서 | [`data-views.md` §3·§4](data-views.md), 브리프 ② §1, [`corrections.md` C5](corrections.md) |

---

## 1. Drilldown — Troubleshooting toolkit의 선택 구성요소 (p87–93)

### 1.1 파이 차트에서 (p87–88)

Troubleshooting 파라미터로 질의한 뷰에서 시작합니다. 파이의 **조각 또는 범례 색을 더블클릭** →
그 원인의 문제 이벤트 전체가 든 그리드. *"Each drill-down from the same chart will open a new tab in
the same window. These tabs are displayed on the left side of the window with the colors of the
corresponding sectors."* 예: 초록 조각 = `RACH Failure, unknown reason` → 초록 탭.

### 1.2 그리드 행에서 (p89–90)

- **전후 시간 범위**: `View | Options | Environment | Drill Down`의 `Before` · `After`(초) — 선택
  이벤트 앞뒤로 얼마나 포함할지.
- 행 **더블클릭** → 그 행의 측정 데이터에 맞는 **기본 드릴다운 파라미터**가 있으면 바로 실행. 없으면
  우클릭 `Drill Down | Pick Parameter`(다른 파라미터로) 또는 `Drill Down | [워크북]`(예 `UMTS | UMTS
  Troubleshooting`).
- 드릴다운마다 선택 시간 범위의 데이터가 **둘째 탭 줄**에 새 탭으로. 초록 탭을 클릭하면 그리드로,
  파란 화살표를 클릭하면 파이로 복귀.

### 1.3 지도에서 (p91–92)

- 경로의 점을 **위치 아이콘 좌클릭**으로 고름. 우클릭으로 드릴다운할 파라미터를 고르며, **여러
  파라미터를 골라 비교**할 수 있음.
- 시간 범위는 같은 `Options … Drill Down`의 Before/After.
- 위치 아이콘 우클릭 → `Drill Down | System | [시스템] | [워크북]` → 드릴다운 워크북이 지도 뷰의
  **탭으로** 추가. 좌상단 탭으로 지도 복귀.

### 1.4 지도의 이벤트 심볼에서 (p92–93)

Parameters 필터에 **`drop`** 또는 **`failure`**를 쳐 실패 이벤트 파라미터를 찾음 → 우클릭 `Open In |
Map` → 지도에 이벤트 심볼 → **심볼 더블클릭** → 드릴다운 워크북이 탭으로.

### 1.5 이벤트 제외 (p94)

측정 우클릭 `Exclude Events` → 대화상자 → `Utilities | Edit`의 Global Filters에 `Exclude event <> 1`
추가 → 이후 결과에서 제외(예: 측정 시스템 오류로 실패한 호).

> **우리.** Problem Survey의 연쇄(원인 파이 → 사례 목록 → 그 순간)와 커서 동기화가 대응. 없는 것:
> **여러 원인을 탭으로 동시 유지**([`corrections.md` C5](corrections.md)), **전후 시간 범위 설정**,
> 지도의 이벤트 마크에서 직접 드릴다운(우리는 클릭 → 커서 이동까지), 사례 단위 제외.

## 2. Timeline view (p203–208)

측정 우클릭 `Timeline` 또는 측정 **더블클릭**. 다중 측정에도 열림. 파일의 시작·끝 시각, **빨간 동기화
선**(현재 위치)과 그 아래 현재 시각.

- **Highlight Parameter** (p204–206): 우클릭 `Highlight Parameter` → `Pick Parameter`(필터 칸) → `Value`
  더블클릭으로 조건 정의 → `Finish` → 조건에 맞는 구간이 타임라인에 **강조**. "값이 임계 아래/위인
  구간을 눈으로 훑기"용.
- **Notifications** (p207): 우클릭 `Properties` → `Notifications` 탭 → 알림 선택(예 attach failure, BLER)
  → **작은 빨간 세로 막대**로 표시.
- **Range selection** (p207–208): 시작점 **더블클릭**, 끝점 **클릭** → 범위 우클릭 → `Range | Report |
  Open`(`.rpt` 템플릿) 또는 `Range | Workbook | [폴더] | [워크북]` → **그 범위만으로** 리포트·워크북
  생성.

> **우리.** 재생 트랜스포트(브리프 ③)가 진행 바 역할. 없는 것: **임계 조건 강조**, 알림 막대,
> **범위를 골라 그 범위로 리포트·워크북**. 우리 `[ ] \` 구간 자르기가 범위 선택의 절반입니다.

## 3. 그 밖의 뷰 (p200–214)

| 뷰 | 원문 | 요지 |
|---|---|---|
| **Numerical data** | p200–202 | 여러 측정을 나란히 놓고 값 비교(벤치마킹). 빈 워크북에 `Page | Add Data View | Numerical Data` → 측정 드래그. 비어 있으면 타임라인에서 시각을 앞으로. `Properties`: `Visible parameters` · 순서 · `Title` · `Alignment` · 파라미터별 **색상셋** |
| **Info view** | p202 | 시그널링 · BTS 사이트 · 계층 메시지의 상세 |
| **Network Parameters** | p209–210 | 파일 우클릭. 주요 망 파라미터. `Pick Parameter…`로 추가, `Properties`로 제거 |
| **Measurement Settings** | p210 | 기록 당시 설정 |
| **Properties** | p211 | 선택 항목의 속성. 기본 우측 도킹, 떼어내기 · 더블클릭으로 재도킹 |
| **Query clipboard** | p212 | 복사한 질의 목록. `Query | Copy` → 빈 뷰에 `Query | Paste` → `Paste Query`에서 선택. `Clear` |
| **Activity** | p213 | 업로드 · 변환 · 큐 진행. `Cancel All`, 파일별 X |
| **Log window** | p213–214 | 프로그램·오류 메시지와 **실행 중인 SQL**. Logging 대화상자에서 Log/SQL 선택, `Show Timestamps`, `Clear`, `Write to File`(.txt). 기본 하단 도킹 |

## 4. 알림 아이콘 설정 (p451–453)

모든 측정 이벤트에 아이콘을 매어 그래프·지도에 띄웁니다. 두 경로:

- **Parameters 뷰에서**: 아이콘이 있는 파라미터(예 `Call connected`)는 그 아이콘이, 없는 것은 기본
  아이콘이 표시. 우클릭 `Change Defaults` → `Image`의 `…`로 새 아이콘 파일 선택 → `OK`.
- **Notification Configuration** (`Tools | Notifications`): 기본 알림 목록을 수정하거나 새로 만듦.
  선택 → `Modify` → `Notification Properties`의 `Icon`에 비트맵.

> **우리.** `event_type` 레지스트리가 대응 — 이름 · 색 · 글리프를 한 곳에서 정해 지도 · 차트 · 독 ·
> 파이가 공유(브리프 ②). 레퍼런스는 **사용자가 아이콘을 바꿀 수 있고**, 우리는 코드 상수입니다.

## 5. Options — 우리에게 의미 있는 항목 (p454–459)

전체 목록이 아니라 **분석 결과에 영향을 주거나 우리에게 대응물이 있는 것**만 골랐습니다. BTS와
Statistics 탭 전문은 [`use-cases.md`](use-cases.md) UC17 · UC15.

| 탭 | 항목 | 뜻 | 우리 |
|---|---|---|---|
| Environment › General | `Auto-save default workspace every X minutes` | 열린 워크북을 주기 저장, 시작 시 복원(Shift로 건너뜀) | 서버 저장 워크북 |
| | `Auto set synchronizer source` | 워크북을 돌리면 그 측정이 동기화 소스 | 세션 선택이 곧 소스 |
| | `Display mobile type / device label` | 트리에 단말 종류 · 라벨 | 세션 메타 |
| Environment › Presentation | `Throughput` · `Distance` · `Velocity` 단위, `Cell identification` 표시 모드, `Hide date from timestamps`, **`Limit number of decimal digits`** | 표시 단위·자릿수 | 고정 |
| Environment › **Drill down** | `Before` · `After`(초) | §1.2 | 없음 |
| Environment › Email | SMTP 서버 · 포트 · 계정 · From/To · SSL · `Test` | 스케줄러 알림 메일 | 없음 |
| Database › Queries | `Auto-hide columns from queries` · `Enable query memory usage warning` + `Threshold` · `Allow queries to be run in parallel` + 최대 수 · `Allow overlapping when joining measurements` · **`Scope filtering for reports and workbooks`** | 질의 실행 정책 | 없음 |
| Database › **Loader** | **`Add description to loaded`**(Prompt user / Project name) · `Auto rename duplicate file names` | 적재 시 설명 자동 부여 | 임포트 시 메타 입력 |
| Color | 팔레트(`.aex`로 이동) · 색상 범례 기본값 | | 이벤트 팔레트 |
| **Statistics** | 기준 Time / Distance / Sample(매번 묻기) · 범례 통계 기준 · **dB 파라미터 선형 계산** · Area binning X/Y steps(`Bins in meters`) · Distance binning 구간(m; 구간 중점에 가장 가까운 GPS 점 기준) · `Distribution plots` | 통계 정책 | `AggregationBasis` |
| Graph | `Smooth scrolling when synchronizing` · 팔레트 · `Sort bar graph by parameter` · `Optimization` · `Zoom all graphs` | | 동기 줌 없음 |
| **Map** | `Default map type` · `Zoom all maps` · `Automatically zoom to first added layer` · `Draw`(line / symbol / image / image & background) · **`Automatically offset simultaneous measurement routes`**(겹치는 경로 x/y 오프셋) · **`Automatically add default BTS for measurement route`**(로그 헤더의 BTS 파일) · **`Hide distance lines longer than X km`**(GPS 이상 의심) · `Hide default color line` · `Show route tooltip` · `Default route thickness`(고대역 · 저대역) · 기본 MapX 지도 · `Zoom margin` · `Use map defined in log file header` · `Shared map folder` · `Zoom slider` · `Map service` | | 경로 끊기(브리프 ②)가 `Hide distance lines`와 같은 문제를 다룸. 다중 경로 오프셋은 없음 |
| BTS | [UC17](use-cases.md) 전문 | | `cell_ref` |

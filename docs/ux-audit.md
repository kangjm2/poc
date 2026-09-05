# UI/UX 동작 정상성 점검 — 사용자 시나리오 기준 (2026-09)

`docs/ui-ux-backlog.md`가 **레퍼런스에 없는 것**을 순서 매긴 문서라면, 이 문서는 **지금 있는 것이
사용자 손에서 제대로 동작하는가**를 본 기록입니다. 자동 점검 넷(`verify-ui` 139, `verify-scenarios`
311, `api-surface`, `mvn test` 99)이 모두 통과한 상태에서 실행 중인 스택을 직접 조작해 찾은 것이므로,
여기 적힌 것은 곧 **자동 점검이 보지 못하는 영역**입니다 — 레이아웃, 지도 프레이밍, 화면 사이의
정합성, 빈 결과의 표현.

## 어떻게 점검했나

| | |
|---|---|
| 대상 | `docker compose` 스택(:4173 / :8080), 세 측정: 도심 드라이브(build 1.4.2), 고속도로(build 1.5.0), Lab fronthaul replay |
| 방법 | Playwright 투어 43화면 + 표적 탐침(DOM 계측), 1680×1000과 1280×720 두 뷰포트, 스크린샷 판독을 코드 대조(파일:줄)로 확인 |
| 시나리오 | 백로그의 세 관점을 그대로 씀 — **신입**(막히지 않는가, 틀렸을 때 알 수 있는가), **베테랑**(세션·탭·필터를 빠르게 오가는가), **장애추적**(한 구간을 지도·차트·표에서 같은 것으로 보는가) |
| 여정 | 세션 열기 → 탭 순회(14개) → 세션 전환 → 전역 필터 걸기/풀기/틀리기 → Reach 열기 → Compare(코호트·Compare on the ground) → 워크북 만들기·내보내기 → 재생·키보드 → 좁은 창 |

계측값은 이 문서 안에 그대로 적었습니다. 재현 절차는 각 항목에 있습니다.

## 잘 동작하는 것 (지킬 것)

- **틀린 필터는 바로 말한다.** `kpi:RSRP:>>:-100` 같은 문법 오류는 배지가 아니라 오류 문구로 돌아오고, 이전 조건은 그대로 남습니다.
- **커서 동기화.** Degradation 행 클릭 → 지도 마커·차트 커서·우측 Numerical Data가 같은 seq로 움직입니다. 장애추적 시나리오의 핵심이고, 어긋나는 경우를 찾지 못했습니다.
- **정직한 빈 화면.** 도심 드라이브의 Fronthaul 탭("No fronthaul counters in this session…"), 타일 없는 지도("Basemap tiles unavailable (network) — route still shown")는 왜 비었는지 말합니다.
- **필터 인지 문구.** Coverage Issues의 "Narrowed by the condition above… this count can go up as well as down", Compare 헤더의 "recorded · under this condition"은 숫자가 왜 바뀌었는지 설명합니다.
- **모든 차트에 임계선과 값, 헤더에 현재값.** 이벤트 마커가 차트 상단에 같은 시각 축으로 놓입니다.
- **키보드 시트(?)·재생 제어·Lab/Import 화면**에 오동작 없음. 콘솔 오류 0건, 800 ms를 넘는 요청 0건.

## 결함 — 심각도순

심각도 기준: **S1** 사용 불가 · **S2** 잘못된 답을 보여줌 · **S3** 답은 맞지만 읽을 수 없음 · **S4** 마감.

### S1-1. 필터가 걸린 상태에서 Reach를 열면 앱이 무너진다

재현: 필터 `kpi:RSRQ:>=:-12` 적용 → `Reach: 17 of 29` 클릭.
계측: 필터 바 높이 6320 px, 두 `.col` 너비 0, `.center` 높이 0. 화면 전체가 노란 바 하나가 되고 목록은 오른쪽 가장자리에 세로 한 글자씩 찍힙니다(투어 51번 화면).
원인: `frontend/src/styles/app.css:288-291` `.gf-reach-list`가 `display:flex`인데 `flex-wrap`이 없고, 필터가 활성일 때만 렌더되는 `.gf-scope`(`:292-294`)가 `flex-basis:100%`입니다. 필터가 없을 때는 `.gf-scope`가 없어 정상이라, 시나리오 점검(S20)이 잡지 못했습니다.
수정: `.gf-reach-list { flex-wrap: wrap }` 한 줄. 검증: `verify-scenarios`에 "필터 활성 + Reach 열기 → `.center` 높이 > 0" 한 단계.

### S1-2. 세션을 바꾸면 지도가 새 드라이브로 프레임되지 않는다

재현: 도심 드라이브를 연 채 측정 선택을 고속도로로 바꿈.
계측: 고속도로 경로의 화면 y 범위 −32 … 134 (경로 상단이 지도 밖). 새로 고침해 처음부터 고속도로를 열면 32 … 287로 정상.
원인: `frontend/src/App.tsx:436-439`의 track effect는 세션이 바뀌어도 `track`을 비우지 않고 새 응답이 올 때까지 이전 드라이브의 점을 들고 있습니다. `RouteMap`의 `fitOnce`(`frontend/src/components/RouteMap.tsx`, `wanted`는 `:168`)는 `frameKey`(=sessionId)가 바뀐 첫 렌더에서 **이전 드라이브의 track**으로 프레임을 잡고 `framedFor = wanted`를 찍습니다. 새 track이 도착하면 도장이 이미 찍혀 있어 다시 맞추지 않습니다 — 주석이 막겠다고 적은 바로 그 경로입니다. 가드가 `track.length === 0`만 보기 때문에, 비어 있지 않은 **옛** track을 새 것으로 착각합니다.
수정(둘 중 하나): ① 세션이 바뀌면 `setTrack([])`(App) — 가장 작고 안전. ② track 응답에 sessionId를 실어 `fitOnce`가 `track`의 소속과 `frameKey`가 같을 때만 도장을 찍기 — "가드는 데이터에" 원칙에 더 맞음. 검증: `verify-scenarios`에 "세션 전환 후 경로 bbox가 지도 뷰포트 안" 한 단계(경로 SVG의 bbox를 읽으면 됩니다).

### S2-1. 면제 패널이 필터 아래에서 아무 말도 하지 않는다

재현: 필터 `kpi:RSRQ:>=:-12` 적용 → Problem Survey 탭.
관측: 바에는 `In force: RSRQ >= -12`, 우측 범례는 558 samples, 그런데 패널은 필터 없을 때와 픽셀 단위로 같은 `34 problems`. Monitored Set의 "Across the whole drive"도 같습니다. Reach 목록을 열어야만 면제임을 알 수 있는데, 그 목록은 S1-1 때문에 지금 열 수 없습니다.
원인: `frontend/src/components/ProblemSurveyPanel.tsx:101`은 면제를 **주석**으로만 말합니다. `GlobalFilter.coverage`에는 면제 사유가 이미 문자열로 있으니 데이터는 있습니다.
수정: 필터가 활성이고 패널의 엔드포인트가 `coverage`에서 exempt일 때 패널 헤더 옆에 "Whole drive — not narrowed by the filter" 한 줄. `coverage`를 읽는 컴포넌트가 이미 `GlobalFilterBar`에 있으므로 훅 하나로 재사용. 12개 면제 패널 중 화면에 있는 것만(Problem Survey, Monitored Set, Cells, L3, Mobility, Field-to-Lab). 검증: `verify-scenarios`에 "필터 활성 + Problem Survey에 exempt 문구" 한 단계.

### S2-2. 필터로 빠진 구간을 평평한 선으로 이어 그린다

재현: 필터 `kpi:RSRQ:>=:-12` → Overview 라인 그래프 09:22–09:24.
관측: 걸러진 구간이 −88 dBm 근처의 수평선으로 이어져 실제 측정된 안정 구간처럼 보입니다.
원인: `frontend/src/components/TimeSeriesChart.tsx:86`이 `value !== null`인 점만 남기고 `:112-117`의 step 경로가 남은 점을 그대로 이으므로, seq가 건너뛴 자리에 `M`(새 하위 경로)이 생기지 않습니다.
수정: 이웃 점의 seq 차이가 1을 넘으면(또는 시각 차이가 샘플 주기의 n배를 넘으면) `M`으로 새 경로 시작. 경로 계산은 순수 함수이니 `view/geom`으로 내리고 Node 검사로 "gap이 있으면 하위 경로가 2개"를 확인.

### S2-3. 빈 결과가 "100.00%"와 값 있는 패널로 표현된다

재현: `cell:999`(없는 PCI) 또는 `kpi:NOPE:>=:0`(없는 KPI) 적용.
관측: 배지 `In force: NOPE >= 0`, 범례 각 구간 `0 0.00%` 아래 `Total 0 100.00%`, 차트 상자는 빈 채로, 우측 Numerical Data는 여전히 커서 샘플 값을 보여줌. 한 화면의 세 패널이 "데이터가 있는가"에 대해 서로 다르게 답합니다.
원인: ① `frontend/src/components/Panels.tsx:176` Total 행의 `100.00%`가 하드코딩. ② `backend/…/service/GlobalFilter.java:96-129`는 문법과 연산자는 검사하지만 **KPI 이름은 검사하지 않습니다**(`KpiCatalog`는 `Unknown KPI`를 던질 수 있는데 여기서는 쓰지 않음). ③ 필터가 0건을 골랐을 때의 빈 상태 문구가 없습니다.
수정: ① `dist.total > 0 ? '100.00%' : '—'`. ② `GlobalFilter.parse`에서 KPI 이름을 카탈로그에 대조해 `Unknown KPI: NOPE`로 거절 → 프론트의 기존 `gf-error` 경로가 그대로 표시. ③ 결과 0건일 때 차트·범례 자리에 "The condition selects no samples in this measurement" 한 줄. 검증: 시나리오 S30(cell:999) 확장, 새 단계 "알 수 없는 KPI는 gf-error".

### S2-4. Compare on the ground: 기본 상대·자기 비교·중복 응답

재현: 도심 드라이브에서 Compare on the Ground 탭 → 측정을 고속도로로 전환.
관측: ① 처음 열면 상대가 형제 빌드가 아니라 **Lab replay**로 잡힙니다(`sessions.find(s => s.id !== sessionId)` — 목록 순서상 첫 '다른' 세션). ② 전환 직후 `400: A measurement cannot be on both sides: [4]`가 그대로 노출되고, 그 옆에 `2 tiles in both · 36 only A · 103 only B`가 함께 서 있습니다. ③ 지도 헤더는 "Map — route coloured by RSRP (NR SpCell)"·"0 samples"인데 지도에는 diff 타일만 있습니다.
원인: `frontend/src/components/SpatialDiffPanel.tsx:44-55`는 상대가 자기 자신이 되면 고쳐 잡지만, 같은 커밋에서 `:59-64`의 fetch effect가 **옛 상대로 먼저 한 번** 나갑니다. 요청 취소나 "최신 요청만 반영" 가드가 없어 400이 뒤늦게 도착하면 정상 데이터 위에 오류가 덧씌워집니다(`setError(null)`은 effect 시작에서만).
수정: ① 기본 상대 선택을 "같은 시나리오·다른 빌드 → 같은 장치 → 그 외" 순으로. ② fetch에 `AbortController` 또는 요청 일련번호 가드(오래된 응답 무시). 같은 패턴이 `App.tsx`의 다른 fetch effect에도 없으니 `api/client.ts`에 `latestOnly()` 헬퍼 하나로. ③ diff 모드일 때 지도 헤더를 "Map — difference tiles, {A} vs {B}"로.

### S3-1. 툴바가 뷰포트를 넘친다

계측(1680): 툴바 자식 폭 합 ≈1760 px, `scrollWidth` 1967. 지도 탭에서 `Ask an area`가 세 줄로, `Colour by`·`Area bins`·`Distance bins`·`Footprints`가 붙으면 Export가 `Expor`, Delete가 `De`로 잘리고 장치 요약은 사라집니다. 탭을 바꿀 때마다 툴바 높이가 달라져 아래 내용이 튑니다.
1280: 우측 도크와 탭 스트립이 잘리고 스크롤 단서가 없습니다(투어 41–43).
원인: `frontend/src/styles/app.css:43-49` `.toolbar { display:flex; gap:16px }`에 wrap도 축소 규칙도 없음. 지도 컨트롤이 툴바에 인라인으로 들어감.
수정: 두 층으로 나누기 — 1층 세션·KPI·Export(항상 한 줄), 2층 지도 컨트롤(지도 탭에서만, 지도 패널 헤더 안으로 이동해도 좋음). 최소 수정은 `.toolbar { flex-wrap: wrap }`이지만 높이 튐은 남습니다. 검증: `verify-ui`에 "1680에서 `.toolbar` scrollWidth ≤ clientWidth".

### S3-2. 비음수 KPI의 y축이 음수에서 시작한다

관측: Throughput `−18 Mbps`, BLER `−5 %`, CUS RX late `−88 pkt/s`.
원인: `TimeSeriesChart.tsx:94-99`가 `span × 0.08`을 위아래로 무조건 더합니다.
수정: `rawLo >= 0`이면 `lo = 0`으로 고정(패딩은 위쪽만). dBm/dB는 그대로. 가로 눈금은 이미 5분할이니 `-0`도 함께 사라집니다(`Number(v.toFixed(d)) + 0`).

### S3-3. 코호트 점 도표의 축이 차이를 과장한다

관측: x축이 0.8 dB 폭이라 0.67 dB 차이가 화면 전체를 가로지릅니다.
원인: `frontend/src/components/CohortStrip.tsx:52-58`이 데이터 범위 ± margin만 씁니다.
수정: 최소 축 폭을 KPI 단위별로(dBm/dB 3 dB, % 5, Mbps 10) 두고 `hi−lo`가 그보다 작으면 중앙 기준으로 넓히기. `<desc>`에 `axisLo/axisHi`가 이미 나가므로 Node 검사로 확인 가능.

### S3-4. 표의 머리글과 값이 다른 열에 서 있다

관측: Statistics(`-125 dBm`이 p05 아래), Field-to-Lab Detected carriers(한 열 오른쪽으로 밀림), Cells의 ARFCN/Azimuth, Monitored Set의 Contended/Served.
원인: `app.css:147-151` — `th`는 `text-align:left`, `td.num`은 `right`. 숫자 열의 머리글만 우측 정렬하면 끝납니다.
수정: `table.grid th.num { text-align:right }` + 숫자 열 `th`에 `className="num"`(컴포넌트 6곳). 또는 `th:has(+ …)`는 불가하니 마크업이 필요합니다.

### S4. 마감 — 잘림·줄바꿈·표기

| 위치 | 관측 | 수정 |
|---|---|---|
| Statistics 헤더 | `Statistics — RSRP (NR SpCell)1,174 samples` 공백 없음 (`StatisticsPanel.tsx:64-67`) | `.panel header { gap: 8px }` |
| 우측 범례 머리글 | `RSRP (NR SpCell) (dBm) [Sample]`이 5줄 | 단위·기준을 두 번째 줄로, 머리글 `min-width` |
| Events 도크 | Detail이 5–8줄, `exclude`가 `ex`로 잘림 | Detail을 한 줄 말줄임 + title, exclude를 아이콘 버튼 |
| 탭 스트립 | 우측이 `Co…`, Lab에서는 좌측이 잘림, 스크롤 단서 없음 (`app.css:164-168`) | 양끝 그라데이션 페이드 + 활성 탭 `scrollIntoView` |
| 차트 | 우측 끝 x 라벨 `09:35:1`, CDF `p95`가 `p9`, 임계 라벨이 선을 가림 | 마지막 라벨 `text-anchor:end`, 임계 라벨 배경 상자 |
| Monitored Set | y축 제목 `RSRP (dBm`, `PCI / Ch`가 눈금과 겹침, `1 stretches`, 이탤릭 `(UC20 p173)` | 여백, 복수형, 내부 참조는 title로 |
| Problem Survey | `34 problems`인데 18행만 보이고 스크롤바 없음, `From seq/To seq`만 시각이 아님, 세부에 단위 없음 | `.grid-panel` 적용, 시각 병기, 단위 |
| Field-to-Lab | 본문 `Peak 15 km/h` vs 표 `14.7 km/h` | 같은 소수 자리 |
| 설명 없는 요소 | `Reach: 17 of 29`(툴팁만), MAC UL `13.7` 노란 하이라이트, `Δ`, `210 •`, `Near`, Layers의 회색 체크박스 | 배지 뒤 "analytics", 하이라이트 이유 title, 열 머리글 title, 잠금 아이콘 |
| Fronthaul 파라미터 | 도심 드라이브에서도 좌측 목록에 있음(탭은 "없다"고 말함) | 세션에 없는 KPI는 회색 + "not in this measurement" |
| 하단 바 | `seq 0 / 1173` vs `1174 samples` | `seq 1 / 1174` 표기 또는 "index" 명시 |

## 시나리오별로 다시 읽으면

- **신입**: S2-3(틀린 KPI를 받아들임)과 S2-1(면제를 말하지 않음)이 "내가 틀렸을 때 알 수 있는가"를 깨뜨립니다. S1-1은 필터를 배우려 Reach를 누른 순간 화면이 사라지니 첫날의 이탈 지점입니다.
- **베테랑**: S1-2(세션 전환)와 S3-1(툴바)이 매 전환마다 비용을 냅니다. 지도 탭에서 Export가 잘려 CSV를 못 누르는 것도 여기.
- **장애추적**: S2-2(가짜 안정 구간)가 가장 위험합니다 — 걸러진 구간을 "여기는 괜찮았다"로 읽게 됩니다. S2-4는 두 빌드를 지도에서 비교하려는 순간에 오류 문구를 보여줍니다.

## 진행 순서 제안

| 묶음 | 항목 | 규모 | 검증 추가 |
|---|---|---|---|
| A. 즉시 | S1-1 Reach wrap · S1-2 세션 전환 프레임 · S2-3① Total `—` · S4 Statistics 공백 | CSS 2줄 + TS 5줄 | 시나리오 2단계 |
| B. 반나절 | S2-1 면제 문구 · S2-2 gap 끊기 · S2-3② KPI 이름 검증 · S3-2 y축 0 고정 | 훅 1, geom 1, Java 5줄 | 시나리오 2단계, Node 검사 1, mvn 1 |
| C. 하루 | S2-4 Compare on the ground 셋 · S3-1 툴바 2층 · S3-4 표 정렬 | 컴포넌트 3, CSS | verify-ui 1 |
| D. 이어서 | S3-3 코호트 축 · S4 표 나머지 · 1280 레이아웃 | 흩어진 소규모 | — |

각 묶음은 기존 규칙대로 갑니다 — 검사를 먼저 쓰고, 결함 등록(`tools/uxtest/defects.mjs`)에 주입 항목을 두어 그 검사가 실패할 수 있음을 증명한 뒤 고칩니다. S1-1과 S1-2는 특히 "통과하던 점검이 못 본 것"이므로, 점검 쪽의 빈틈(필터 활성 상태에서의 레이아웃, 세션 전환 후의 프레임)을 먼저 메우는 것이 순서입니다.

# Nemo Analyze 10.2 User Guide — Use Case 31개 상세 정리

매뉴얼이 "Use Case N:" 제목으로 실은 사용자 절차 **31개 전부**를, 장(chapter) 순서대로
한 곳에 정리한 문서입니다. 각 항목은 **매뉴얼이 무엇을 하라고 하는가**(목적·절차·원문
인용·그림)를 먼저 적고, 그 아래에 **우리 구현과의 관계**를 짧게 붙였습니다.

| | |
|---|---|
| 출처 | Nemo Analyze User Guide · `NTN00000A-90013` · Edition 1, 2023-11-27 · 문서화 대상 SW 10.1.0 · 505p |
| 기계 판독 인덱스 | [`use-cases.json`](use-cases.json) (번호·페이지·제목) · [`toc.json`](toc.json) (목차 321항목) |
| 현재 구현 상태 | [`../../use-case-coverage.md`](../../use-case-coverage.md) — **상태는 그쪽에서 셉니다.** 이 문서는 *매뉴얼이 말하는 것*의 기록입니다 |
| 판단의 기록 | [`../../briefs/`](../../briefs/) ①–⑥ |

> **원본 PDF는 이 저장소에 없습니다.** 라이선스 보유자 전용 배포물이라 두지 않기로 했고
> ([`README.md`](README.md)), 지금 작업 공간에 남아 있는 것은 2026-09-01 추출 때 옮겨 적은
> **인용·절차·그림 14장·인덱스**뿐입니다. 그래서 이 문서는 31개를 **같은 깊이로** 적을 수
> 없습니다. 항목마다 **근거 등급**을 붙였고, 등급이 낮은 항목은 원문에서 무엇을 확인해야
> 하는지를 대신 적었습니다. **등급 ○ 항목의 절차는 이 문서에 없습니다** — 추측으로 채우지
> 않았습니다.

## 근거 등급

| 등급 | 뜻 | 해당 UC |
|---|---|---|
| **●** | 원문 인용 또는 단계별 절차가 작업 공간에 남아 있음 | 1 · 5 · 12 · 15 · 20 · 21 · 25 · 26 · 27 |
| **◐** | 원문 그림, 또는 주변 절(節)의 설명으로 내용을 특정할 수 있음 | 6 · 7 · 8 · 10 · 13 · 14 · 17 · 19 · 23 · 28–31 |
| **○** | 제목·페이지·목차상 위치만 남아 있음 | 2 · 3 · 4 · 9 · 11 · 16 · 18 · 22 · 24 |

## 페이지 번호에 대해

세 문서가 서로 다른 페이지를 적고 있었습니다. **이 문서와 `use-cases.json`은 목차(`toc.json`)
기준**으로 통일했고, `use-case-coverage.md`의 페이지 열도 같은 값으로 고쳤습니다.

| UC | 목차 | 인덱스(구) | 대조표(구) | 채택 | 근거 |
|---|---|---|---|---|---|
| 13 | 147 | 150 | 150 | **147** | 목차. UC13·14·15가 147·148·150으로 이어지는 것이 자연스럽고, 13과 15가 같은 150일 수는 없음 |
| 16 | (없음) | 469 | 156 | **158** | 목차에 UC16 줄이 빠져 있으나 다음 줄 제목이 `"158 Use Case 17…"`로 시작 — 앞 항목의 페이지 번호가 붙어 넘어온 추출 흔적. 469는 Map 메뉴의 `Delta plotting`(p469)에서 UC16을 **교차 참조**한 자리로 보임 |
| 20 | (없음) | 172 | 172 | **172** | 같은 흔적: `"172 Use Case 21…"` |
| 25 | (없음) | 307 | 196 | **307** | 브리프 ④가 p307로 인용. Report Automation(p293) 안 |
| 27 | (없음) | 403 | 403 | **403** | 목차에 `"…missing handover403 12 Other tasks"`로 붙어 있음 |
| 2–12, 19, 28–31 | 목차 | 목차와 같음 | 다른 값 | **목차** | 대조표의 값은 어느 자료와도 맞지 않았음 |

---

## 한눈에 — 31개 인덱스

| UC | p | 장·절 | 제목 | 근거 | 우리 ([대조표](../../use-case-coverage.md)) |
|---|---|---|---|---|---|
| 1 | 66 | 8 · 지도 | Viewing cell footprints, RSCP footprints, and LTE footprints | ● | ✅ |
| 2 | 68 | 8 · 지도 | Viewing uplink voice quality server data | ○ | ✕ 범위 밖 |
| 3 | 69 | 8 · 지도 | Viewing IP/UDP packet trace data | ○ | ✕ 범위 밖 |
| 4 | 72 | 8 · 지도 | Viewing Binary Log Data | ○ | ✕ 범위 밖 |
| 5 | 77 | 8 · 필터 | Global parameter filtering based on a secondary parameter | ● | ◐ |
| 6 | 108 | 8 · 그래프 | Multiple graph layers | ◐ | ✅ |
| 7 | 110 | 8 · 그래프 | Notification icons in graphs | ◐ | ✅ |
| 8 | 110 | 8 · 그래프 | Correlating parameters using color grids and surface graphs | ◐ | ✕ 미룸 |
| 9 | 112 | 8 · 그래프 | Viewing 5G measurement results in 3D Visualizer (optional) | ○ | ✕ 범위 밖 |
| 10 | 118 | 8 · 그리드 | Color sets in grids | ◐ | ◐ |
| 11 | 120 | 8 · 그리드 | Play audio sample | ○ | ✕ 범위 밖 |
| 12 | 121 | 8 · 그리드 | Using L3 and RRC message search parameters | ● | ◐ |
| 13 | 147 | 8 · MapX/BTS | Adding map layers and saving layer combinations as geosets | ◐ | ✅ |
| 14 | 148 | 8 · MapX/BTS | Coloring routes based on BTS coverage | ◐ | ✅ |
| 15 | 150 | 8 · MapX/BTS | Performing area binning | ● | ✅ |
| 16 | 158 | 8 · MapX/BTS | Comparing two groups of measurements from the same route on [map] | ○ | ✅ |
| 17 | 162 | 8 · MapX/BTS | Displaying base station cell beam range on map | ◐ | ✕ 미구현 |
| 18 | 168 | 8 · MapX/BTS | Synchronizing base station map overlay with grid rows | ○ | ✅ |
| 19 | 171 | 8 · MapX/BTS | Using BTS reference parameters | ◐ | ◐ |
| 20 | 172 | 8 · MapX/BTS | Displaying base station connections on map based on pilot pollution | ● | ✅ |
| 21 | 174 | 8 · MapX/BTS | Cell locator analysis | ● | ✕ 미구현 |
| 22 | 177 | 8 · MapX/BTS | 5G beam visualization | ○ | ✕ 미구현 |
| 23 | 177 | 8 · MapX/BTS | Exporting Serving Cell Lines to Google Earth | ◐ | ◐ |
| 24 | 190 | 8 · 스프레드시트 | Retrieving data from minimized data sets | ○ | ✕ 해당 없음 |
| 25 | 307 | 10 · 리포트 자동화 | Triggering events | ● | ◐ |
| 26 | 396 | 11 · KPI Workbench | Creating complex filters using multiple conditions | ● | ✅ |
| 27 | 403 | 11 · KPI Workbench | Creating a KPI for dropped calls resulting from a missing handover | ● | ◐ |
| 28 | 432 | 12 · 색상셋 | Automatic generation of color set for a value range | ◐ | ✅ |
| 29 | 434 | 12 · 색상셋 | Creating a color set | ◐ | ◐ |
| 30 | 436 | 12 · 색상셋 | Creating and applying a color set on map | ◐ | ✅ |
| 31 | 440 | 12 · 색상셋 | Creating and applying a color set in grid | ◐ | ◐ |

UC 번호가 **장의 흐름을 그대로 따릅니다** — 1–24가 8장(Viewing Measurement Data) 안에 있고,
25가 10장(Reports), 26–27이 11장(Customization, KPI Workbench), 28–31이 12장(Other tasks)입니다.
즉 매뉴얼의 유즈케이스는 독립된 시나리오 모음이 아니라 **각 절의 끝에 붙은 실습**입니다.
이 문서도 그 순서를 따릅니다.

---

## 8장 — Viewing Measurement Data (UC1–UC24)

### 8.1 파라미터에서 지도로 (p48–p73) — UC1 · UC2 · UC3 · UC4

이 넷은 모두 "Viewing measurement data on map"(p61) 절의 끝에 붙어 있습니다. 앞 절이 측정
파일을 지도에 여는 법(p61), BTS 파일을 지도에 여는 법(p63), 지도의 알림 아이콘(p65)을
설명하고, 그 다음에 유즈케이스 넷이 옵니다.

#### UC1 · p66 · 셀 푸트프린트, RSCP 푸트프린트, LTE 푸트프린트 보기 — ●

**목적.** 측정 세션 동안 **한 번이라도 3강 안에 든 셀**마다 그 셀의 서비스 범위(푸트프린트)를
지도에 그립니다.

> *"Cell/RSCP/LTE footprint is displayed for every cell whose signal has been among the
> three strongest at some point during the measurement session. The footprint of each cell
> is displayed on map on a separate page, allowing you to browse from footprint to another."*

**진입.** 측정 파일 우클릭 → `Analyses | RSRP Cell Footprints (mobile)` 식. 조합은
Ec/N0 · RSCP · RSRP · RSRQ × mobile / scanner.

**옵션.** Scrambling code 필터 **또는** channel number 필터 중 하나 · 범례 표시 여부 · 전체
경로 표시 여부.

**경고.** *"Analysis will not work properly if there will be hundreds of pages"* — 셀마다
페이지 하나가 생기므로 필터로 결과를 줄이라고 명시합니다.

**그림.** `manual10.2_cell-footprint_p66.png` — 한 셀의 푸트프린트 페이지. 경로가 RSCP
구간색으로 칠해져 있고 Layers에 `RSCP 1. best (RSCP (dBm))`, 육각형 BTS 아이콘, Color
Legends에 구간별 건수·비율(`>= -80 … 9703 74.73%`)이 보입니다.

**우리.** `GeoAnalysisService.cellFootprints` — 셀이 **서빙했던** 표본의 볼록 껍질. 다른 점
둘: (1) 포함 기준이 "서빙"이지 "3강 안"이 아님 — `sample_neighbour`에 순위별 이웃이 있어
바꿀 수 있고, 그것이 오버슛 판단의 근거가 됩니다. (2) 셀당 한 페이지가 아니라 **전부 겹쳐**
그립니다 — 중첩이 곧 파일럿 오염이라 우리 방식이 낫다고 봤지만, 셀이 수십 개면 못 읽습니다.

#### UC2 · p68 · 업링크 음성 품질 서버 데이터 보기 — ○

**목차상 위치.** UC1 바로 뒤, 지도 절 안. 관련 절이 둘 더 있습니다 — Workspace의 `Voice
Quality folders`(p44), 그리고 `Processing uplink voice quality data`(p191).

**추정 가능한 범위.** 제목과 관련 절의 존재로 보아, 음성 품질 서버(업링크 쪽 MOS 측정을
받는 서버)의 결과를 측정 파일과 함께 지도에 올리는 절차입니다. **절차 본문은 작업 공간에
없습니다.**

**우리.** 범위 밖 — 음성 품질 측정도, 그것을 받는 서버도 데이터 모델에 없습니다.

#### UC3 · p69 · IP/UDP 패킷 트레이스 데이터 보기 — ○

**목차상 위치.** Workspace 하단 탭의 `IP Traces` 페이지(p24)와 `Options – IP Trace`(p457)가
짝입니다. 즉 패킷 트레이스는 측정 파일과 **별도의 자산 종류**로 Workspace에 들어오고, 이
유즈케이스는 그것을 데이터 뷰에 여는 절차로 보입니다.

**우리.** 범위 밖 — 패킷 캡처를 수집하지 않습니다.

#### UC4 · p72 · 바이너리 로그 데이터 보기 — ○

**목차상 위치.** Workspace의 `Binary Logs` 페이지(p24)가 짝. 단말 칩셋의 바이너리 로그를
디코딩해 보는 절차로 보입니다.

**우리.** 범위 밖 — 입력이 CSV이고 벤더 바이너리 디코더가 없습니다.

### 8.2 파라미터 필터링 (p74–p82) — UC5

앞 절: `Parameter filtering`(p74), `Filtering based on polygon area`(p75). 즉 필터에는 **값
조건**과 **폴리곤 영역** 두 입력이 있고, UC5는 값 조건 쪽의 심화입니다.

#### UC5 · p77 · 2차 파라미터에 의한 전역 파라미터 필터링 — ●

**목적.** 사업자가 "커버리지 영역"을 특정 파라미터 임계로 정의하는 실무를 그대로 옮긴
시나리오입니다. **1차 데이터셋을 2차 파라미터로 거릅니다** — 결과에는 2차 파라미터 조건을
만족하는 시점의 1차 값만 남습니다.

> *"all data with Received Signal Code Power (RSCP) of -100 or higher will be considered
> measurement data from coverage area … The global filter created based on this condition
> will exclude all data with RSCP values lower than -100 from all subsequent Nemo Analyze
> operations."*

**절차.**

1. 리본 `Utilities | Global Filters` → `Edit`
2. `Add` → `Name`에서 `<Secondary parameter>` 선택
3. `Value` 열의 `…` 버튼 → 2차 파라미터로 `RSCP best active set` 선택
4. 다시 `Add` → `RSCP >= -100`
5. `Finish`. 이후 **모든 조작**이 이 필터를 통과한 데이터에만 적용됨

**메뉴 쪽 근거.** `Utilities | Global Filters`(p467)의 설명은 *"applied to all operations
performed with Nemo Analyze"* 이고, 예시로 **폴리곤 영역 선택**을 듭니다. 즉 지도에서 그린
도형도 같은 전역 필터의 입력이 됩니다 — 앞 절 p75와 이어집니다.

**우리.** 전역 필터라는 개념이 없습니다. 우리 필터는 화면 단위(Statistics의 범위 필터,
지도의 임계 색상)라 화면을 옮기면 초기화됩니다. 2차 파라미터 게이팅 자체는 워크벤치로
표현됩니다 — `SOURCE_KPI(RSRP) + SOURCE_KPI(대상) → COMBINE → FILTER: rsrp >= -100 →
OUTPUT` — 결과가 새 KPI가 되어 이후 모든 화면에서 쓸 수 있습니다. 남는 차이는 "지금 보고
있는 화면에 즉시" 걸리지 않는다는 것, 그리고 폴리곤 같은 **공간 조건은 전역으로 걸 수
없다**는 것입니다.

### 8.3 그래프 (p94–p112) — UC6 · UC7 · UC8 · UC9

앞 절: 그래프 종류(line / bar / scatter / **color grid** / **surface**, p94), Graph Tools 메뉴,
팝업 메뉴(Change graph type · Query · Pick parameter · Add function · Add reference line, p95–97),
Side panel(p99), 3D mode(p101), Group values(p101), Graph properties(p103), **Layer
properties**(p104, 라인·바·산점도별 p106–107).

#### UC6 · p108 · 다중 그래프 레이어 — ◐

**절 위치로 읽히는 것.** `Layer properties`(p104–107) 바로 뒤입니다. 한 그래프 데이터 뷰에
여러 파라미터를 **레이어**로 겹쳐 올리고, 레이어마다 속성(선/막대/산점, 축, 색)을 따로
두는 절차입니다. 절차의 단계 본문은 작업 공간에 없습니다.

**우리.** ✅ — 구성 워크북의 페인에 KPI를 겹쳐 그립니다. 레이어 체크 해제는 **숨기기이지
삭제가 아닙니다**(`visible`을 소속과 분리). `verify-ui.mjs`가 확인합니다.

#### UC7 · p110 · 그래프의 알림 아이콘 — ◐

**관련 절.** 알림(notification)은 매뉴얼에서 하나의 횡단 개념입니다 — 지도의 알림
아이콘(p65), 타임라인의 알림(p207), 그리고 설정 쪽 `Configuring notification icons`(p451) ·
`Configuring notifications using the Parameters view`(p451) · `Notification configuration`(p453).
UC7은 그것을 **그래프 위에** 띄우는 절차입니다.

**우리.** ✅ — 브리프 ②의 차트 이벤트 마크: 시각 위치에 점선 + 타입 글리프
(`TimeSeriesChart`). 이벤트의 이름과 색은 `event_type` 레지스트리 한 곳에서 나와
지도·차트·독·파이가 같은 것을 씁니다.

#### UC8 · p110 · 컬러 그리드·표면 그래프로 파라미터 상관 보기 — ◐

**절 위치로 읽히는 것.** 그래프 종류 중 color grid와 surface(p94), 3D mode(p101)를 쓰는
절차. 두 파라미터를 X·Y축에 놓고 셀 색(또는 높이)으로 세 번째 값을 보는, **두 파라미터
상관을 보는 유일한 뷰**입니다.

**우리.** ✕ 미룸 — 가치는 인정하되 순위가 낮습니다([백로그 §6](../../ui-ux-backlog.md)).

#### UC9 · p112 · 3D Visualizer로 5G 측정 결과 보기 (옵션) — ○

**우리.** 범위 밖 — 레퍼런스에서도 **별매 옵션**입니다(제목에 optional). 관련 자료는
2026-08-31 정리 때 저장소에서 뺐습니다(`MANIFEST.md` §0).

### 8.4 그리드 (p112–p121) — UC10 · UC11 · UC12

앞 절: Side panel(p112), Row details(p115), Export data to(p115), Grid properties(p116).

#### UC10 · p118 · 그리드의 색상셋 — ◐

**절 위치로 읽히는 것.** `Grid properties`(p116) 뒤. 그리드 셀을 파라미터의 **색상셋**으로
칠하는 절차입니다. 색상셋은 12장에서 만들고(UC28–29), 지도(UC30)와 그리드(UC31)에 각각
적용하는데, UC10은 그리드 쪽의 첫 등장입니다. 색상셋 자체는 [§12](#12장--other-tasks--색상셋-uc28uc31) 참조.

**우리.** ◐ — KPI별 임계 사다리를 편집·저장합니다. **이름 붙은 재사용 색상셋은 미룸**.
그리드 셀은 스케일 색이 아니라 심각도 클래스(`sev-*`)로 칠합니다.

#### UC11 · p120 · 오디오 샘플 재생 — ○

**관련 파라미터.** Parameters 트리 `Services › Voice/video call › Voice › Voice quality` 아래에
`Audio quality reference sample filename DL` / `UL`이 있습니다(작업 공간의 그림
`manual10.2_cell-locator-estimated-site_p174.png`에 우연히 찍혀 있음 — 아래
[그림 라벨 정정](#그림-라벨-정정) 참조). 즉 음성 품질 측정에 쓰인 참조 샘플과 녹음을 재생하는
절차로 보입니다.

**우리.** 범위 밖 — 오디오를 수집하지 않습니다.

#### UC12 · p121 · L3·RRC 메시지 검색 파라미터 사용 — ●

**목적.** 디코딩된 시그널링 본문에서 값을 뽑아 **새 열(파라미터)로 승격**시킵니다. 메시지
목록을 보는 것이 아닙니다.

**절차.**

1. 측정 파일 선택 → `L3 signaling parameter search` 파라미터를 더블클릭
2. `Filters` 다이얼로그에 검색 텍스트(예: `Short MAC value`)와 검색 대상 메시지(예:
   `SERVICE_REQUEST`)를 입력
3. `Parameter name`으로 결과 열의 이름을 직접 정함

**질의 API 쪽 대응.** Appendix 5의 Decoder 스칼라 13개와 Appendix 6의 `MSG_DECODER_*`
프로시저 8개가 같은 능력의 SQL 층입니다([`query-api.md`](query-api.md)).

**우리.** ◐ — Signaling 화면은 목록·필터·커서 동기화·본문 펼치기까지 있으나, 본문 필드를
KPI 열로 만드는 경로가 없습니다. 우리 시그널링은 이벤트 타입과 시각이 주 정보이고 **본문이
구조화돼 있지 않아** 데이터 모델에서 시작하는 격차입니다.

### 8.5 지도 · MapX · BTS 파일 (p122–p179) — UC13 ~ UC23

이 구간이 유즈케이스 **11개**로 가장 두껍습니다. 앞 절의 구성:

| 절 | p | 내용 |
|---|---|---|
| Maps / Viewing in live maps / Google Street View | 122–125 | |
| Map popup menu | 126–129 | Add · Find · **Generate color set** · **Export to KML file** · Zoom to Layers · **Create New Folder From This Area** · Set As Default Location · Street View |
| Side Panel – Map · Drawing options · Tool | 130–132 | |
| MapX · Map Properties · Route Properties · Draw route as symbols | 132–139 | MapInfo 계열 |
| **BTS files** · BTS properties | 140–146 | BTS 파일을 지도로 드래그해 경로와 연결 |

BTS 파일이 이 구간의 축입니다 — UC14 · 17 · 18 · 19 · 20 · 21이 전부 BTS 파일(기지국 위치·
방위·채널 목록)을 전제로 합니다. 우리는 그 정보를 **`cell_ref` 테이블**로 DB 안에 갖고 있어
"BTS 파일을 드래그해 연결한다"는 단계 자체가 없습니다.

#### UC13 · p147 · 맵 레이어 추가와 레이어 조합을 지오셋으로 저장 — ◐

**제목이 말하는 것.** 지도 데이터 뷰에 레이어(경로·BTS·MapInfo 맵)를 더하고, 그 **조합을
geoset으로 저장**해 다시 불러오는 절차. 기존 스크린샷
`nemo-analyze_live-map_route-coloring_color-legend.jpeg`의 `Loaded MapX Maps (.TAB/.GST)`에서
`.GST`가 이 지오셋 파일입니다.

**우리.** ✅ — Layers 도크 + 서버 저장 워크북. 지오셋 **파일** 개념은 없고 워크북이 그
역할을 합니다.

#### UC14 · p148 · BTS 커버리지로 경로 채색 — ◐

**제목이 말하는 것.** 경로의 각 지점을 값이 아니라 **어느 셀이 서빙했는가**로 칠합니다. BTS
파일의 셀 목록이 색의 범주가 됩니다.

**우리.** ✅ — 브리프 ④의 **서빙 셀(PCI) 채색**. 색이 바뀌는 지점이 곧 핸드오버 경계입니다.
정체성 색은 `view/paint.ts` 한 곳에서 나오고, 이벤트 팔레트를 재사용하지 않습니다.

#### UC15 · p150 · 영역 비닝 수행 — ●

**목적.** 지도에서 고른 영역 안의 측정을 격자로 나눠 집계합니다.

**절차.**

1. Tools 패널의 **Area Binning 아이콘** → 지도에서 영역 선택
2. `Select Measurement` 다이얼로그에서 대상 측정 파일 추가 (선택 영역에 걸친 경로는 기본
   포함)
3. `Measurement parameters`에서 집계할 파라미터 선택

**그림.** `manual10.2_area-binning_p150.png` — Tools의 아이콘 하나가 빨간 원으로 표시돼 있고,
지도 위에 반투명 사각형 선택 영역이 그려져 있습니다. Color Legends는 `RSCP (dBm) [Distance]`
— 아직 건수가 0인, 선택 직후의 상태입니다. 배경에 BTS 섹터 부채꼴이 함께 보입니다.

**메뉴 쪽 근거.** `Map | Area binning` · `Distance binning`(p469). 통계 방식으로는
Parameters 뷰의 `Statistics by: Fixed Geographical Bin Area`(p52)가 같은 것입니다.

**우리.** ✅ — 격자 비닝(50/150/500 m) + 브리프 ⑤의 **지도 위 임의 폴리곤**. 레퍼런스와 같은
"지도에서 영역을 고른다" 진입점이 생겼고, 폴리곤 안의 통계에 **통과 목록**(같은 사거리를
세 번 지났으면 세 번의 통과)이 함께 나옵니다(`AreaStatsService`, `AreaSelection.inside`).

#### UC16 · p158 · 같은 경로의 두 측정 그룹 비교 — ○

**제목이 말하는 것.** 제목이 인덱스에서 `"…from the same route on"`으로 잘려 있습니다. 문맥상
`on map`입니다. Map 메뉴의 **`Delta plotting`**(p469)이 이 유즈케이스를 교차 참조하는 것으로
보이며(인덱스의 p469가 그 자리), 두 주행(예: 최적화 전·후, 사업자 A·B)의 차이를 지도 위에
그리는 절차입니다.

**페이지.** 목차에 줄이 빠져 있고, 다음 줄의 `"158 Use Case 17"` 흔적으로 p158을 채택했습니다
([페이지 번호에 대해](#페이지-번호에-대해)).

**우리.** ✅ — 브리프 ⑤의 **공간 차분 지도**(`SpatialDiffService`): 두 주행을 하나의 격자에
담아 타일별 차이. 한쪽만 지나간 타일은 0이 아니라 null이고, 색과 라벨은 `verdict()` 한
곳에서 정해집니다. A/B 통계 비교(Compare 모드)와 함께.

#### UC17 · p162 · 기지국 셀 빔 범위를 지도에 표시 — ◐

**설정 쪽 근거.** `Options – BTS`(p459)에 **기본 빔 길이·각도**와 *"use estimation from
antenna height and tilt"* 옵션이 있습니다. 즉 빔 범위(섹터 부채꼴)의 길이는 고정값이거나
**안테나 높이·틸트로 추정**한 값입니다. p150 그림의 부채꼴이 이 표시입니다.

**그림.** `manual10.2_cell-beam-range-on-map_p162.png`이 이 이름으로 저장돼 있으나, 열어 보면
경로를 따라 **비닝된 타일**(RSCP · Throughput `[Distance]` 범례)이 그려진 화면이고 빔 범위가
두드러지지 않습니다. 라벨과 내용이 맞는지 원문 확인이 필요합니다 — [그림 라벨 정정](#그림-라벨-정정).

**우리.** ✕ 미구현 — `cell_ref`에 방위각이 있어 부채꼴을 그릴 데이터는 있습니다. 안테나
높이·틸트 두 열을 nullable로 더하면 레퍼런스식 **설계 커버리지 추정**까지 열립니다.

#### UC18 · p168 · BTS 지도 오버레이와 그리드 행 동기화 — ○

**제목이 말하는 것.** 그리드에서 행을 고르면 지도의 BTS 오버레이(서빙 셀 선 등)가 그 시점으로
따라오는 절차. 기존 스크린샷 `nemo-analyze_basestation-map-synchronized-views.png`가 이 결과
화면입니다.

**우리.** ✅ — 공유 시간 커서가 지도·그리드·차트·L3를 함께 움직입니다.

#### UC19 · p171 · BTS 참조 파라미터 사용 — ◐

**그림에서 읽히는 것.** Parameters 트리 `Other` 아래에 **`All BTS reference cells`** 파라미터가
있습니다(작업 공간 그림 `…_p174.png`, 아래 정정 참조). 즉 BTS 파일의 셀 목록을 측정
파라미터처럼 질의·표시하는 진입점이고, UC19는 이것을 쓰는 절차입니다. Appendix 6의
`BTS_QUEST` 프로시저(p499) — 측정과 BTS 파일로 "언제 어느 사이트·셀에 붙어 있었나"의 목록을
만드는 것 — 가 그 SQL 층입니다.

**우리.** ◐ — `cell_ref`(PCI · ARFCN · 밴드 · GSCN · 방위각)를 DB가 갖고 있어 **임포트 절차
자체가 불필요**합니다. 별도 참조 파일 형식은 지원하지 않습니다.

#### UC20 · p172 · 파일럿 오염 기반 기지국 연결선 표시 — ●

**목적.** 측정 지점에서 **보이는(측정된) 파일럿들**로 기지국까지 선을 그어, 여러 셀이 비슷하게
강한 곳(파일럿 오염)을 지도에서 보이게 합니다.

**절차.**

1. Parameters 뷰에서 `Pilot pollution`을 우클릭 → `Open In | Map`
2. **carrier number**를 묻습니다 — BTS 파일의 값과 일치해야 합니다
3. `Base stations` 탭에서 BTS 파일을 지도로 드래그 → "경로를 BTS와 연결할까요?" → `Yes`
4. 같은 channel number를 입력하면 측정된 파일럿들이 선으로 그려집니다

**그림.** `manual10.2_pilot-pollution-connections_p172.png` — 지도 워크북 위에 `Properties ›
BTS` 탭이 열려 있고, **"Select which lines to draw"** 목록이 보입니다:

| 그릴 수 있는 선 (원문 목록) |
|---|
| Mobile serving and neighboring cells |
| CDMA / EVDO / LTE / UMTS scanner measured pilots · GSM scanner top N measured BCCHs · LTE / UMTS scanner top N measured pilots |
| GSM neighbor list · UMTS neighbor list |
| **Missing CDMA / GSM / UMTS neighbors** |
| UMTS Mobile Detected Set Cells · **UMTS Mobile Pilot Pollution** |

Layers의 `Pilot pollution` 레이어 설명에 판정 창이 보입니다 — *Polluter level window from
Ec/N0 active set best below · RSCP active set best above · Pilot count threshold: 3*. Color
Legends는 `Number of cells [Time]`로 1 · 2 · 3 · 4 … > 7 구간(그림에서 3이 59.44 %, 4가
40.52 %).

**우리.** ✅ — Mobility 탭의 모니터드 셋 점선 + `MonitoredSetService`의 파일럿 오염 구간.
매뉴얼에 없는 **하한 조건** `POLLUTION_MIN_BEST_DBM = -110`을 답니다 — 없으면 모든 셀이 똑같이
약한 커버리지 홀이 "여러 셀이 비슷하게 강함"으로 오탐됩니다. 검증이 매번 확인합니다. 절차는
훨씬 짧습니다 — carrier number를 두 번 입력하고 BTS 파일을 드래그하는 대신 탭 하나입니다.

#### UC21 · p174 · Cell locator 분석 — ●

**목적.** 측정된 셀별 신호 강도만으로 **사이트 위치와 안테나 방향을 역추정**합니다.

> *"Cell locator is an algorithm that estimates the site locations and antenna directions of
> individual cells based on measured signal strength per cell … a confidence number (1—10)
> is reported per estimated cell location, with accuracy of <100 meters when data is
> collected from opposite sides of the BTS."*

**실행 시 입력 셋.**

| 입력 | 의미 |
|---|---|
| Minimum accuracy | 6 이상이면 <100 m급만. 9–10은 데이터가 조밀하지 않으면 결과가 전부 걸러질 수 있음 |
| Carrier number | 채널 번호 단위로 분석 |
| Minimum received power | 임계 미만 제거. 매우 낮은 전력에서 단말·스캐너가 유령 셀을 보고하므로 정확도가 올라감 (LTE −120 dBm, UMTS −100 dBm) |

**그림.** 브리프 ②와 `MANIFEST.md`는 `manual10.2_cell-locator-estimated-site_p174.png`를 "실제
위치(초록)와 추정 위치(보라)"로 적었으나, **그 파일은 Workspace 패널 그림**입니다. Cell
locator의 결과 그림은 작업 공간에 없습니다 — [그림 라벨 정정](#그림-라벨-정정).

**우리.** ✕ 미구현 — 그런데 유리한 위치입니다. 이 알고리즘은 "추정 위치 대 실제 위치"의
오차가 전부인데, 우리는 `cell_ref`에 **실제 좌표와 방위각**이 있어 추정 오차를 수치로
단언하는 검사를 붙일 수 있습니다. 입력(푸트프린트 볼록 껍질 + `sample_neighbour`)은
갖춰져 있습니다.

#### UC22 · p177 · 5G 빔 시각화 — ○

**제목이 말하는 것.** SSB 빔 인덱스별 측정을 지도·3D에 그리는 절차. UC9(3D Visualizer)와
같은 계열입니다.

**우리.** ✕ 미구현 — 빔 인덱스별 측정이 데이터 모델에 없습니다.

#### UC23 · p177 · 서빙 셀 선을 Google Earth로 내보내기 — ◐

**메뉴 쪽 근거.** Map 팝업 메뉴의 `Export to KML file`(p128), Map 메뉴의 `Export to KML`(p468).
측정 지점에서 서빙 셀까지 그은 선을 KML로 내보내 Google Earth에서 보는 절차입니다.

**우리.** ◐ — **GeoJSON**으로 내보냅니다. KML이 아니라 플래닝 도구용 형식을 골랐습니다.

### 8.6 스프레드시트 그리드 (p180–p190) — UC24

앞 절: Editing cell format(p182) · Filtering data(p186) · Creating formulas(p188) · Adding
functions(p189). 셀 서식·수식·함수가 있는 **엑셀형 그리드**입니다.

#### UC24 · p190 · 최소화된 데이터셋에서 데이터 조회 — ○

**제목이 말하는 것.** "minimized data set"은 임포트 시 원시 표본을 버리고 **사전 계산된
통계만** 남긴 데이터셋으로 보입니다 — KPI Workbench의 Parameter 설명(p347)에 *폴더를 고르면
원시 샘플이 아니라 사전 계산된 통계로 제한된 데이터셋이 들어온다*는 문장이 같은 개념을
가리킵니다. UC24는 그런 데이터셋에서 스프레드시트 그리드로 값을 꺼내는 절차로 보입니다.

**우리.** ✕ 해당 없음 — 우리 저장은 `sample_kpi` 세로형이 전부를 보관하고, 최소화라는
단계가 없습니다.

---

## 10장 — Reports (UC25)

리포트 장(p231–p318)의 마지막 절 `Report Automation`(p293) → `Scheduling events with Nemo
Analyze client`(p294) 안에 있습니다. 그 뒤가 `Reporting automation with Nemo Analyze
Enterprise`(p310)입니다.

#### UC25 · p307 · 이벤트 트리거 — ●

**목적.** "파일이 도착하면 리포트가 자동으로 만들어진다"는 파이프라인. 정기 드라이브 테스트를
돌리는 조직의 실제 운영 형태입니다.

> *"Triggering events enables report automation with server autoload, making running final
> measurement reports more convenient for the end-user. … please note that triggering
> events is not possible without a server connection."*

**절차.**

1. Nemo Analyze **Server**에서 backup/retrieve, autoload, FTP autoload를 켬
2. `Backup & Retrieve`와 `Autoload`에서 `*.nmf`와 `*.zip`을 선택
3. FTP 설정에서 하위 폴더 재귀 로드와 로드 후 서버에서 삭제를 선택
4. FTP 서버에 폴더(예: `test`)를 만들고 측정 파일을 넣음 → 자동 로드되어 클라이언트의 같은
   이름 폴더에 나타남
5. 클라이언트에서 `Tools | Event scheduler` → 달력 → `Triggering events` → `Add`
6. `Schedule Event Batch`의 `Triggering folder`에 FTP와 같은 폴더 이름을 입력

**우리.** ◐ — 이벤트 스케줄러도 자동 로드도 없고, 임포트는 사람이 파일을 올려 시작합니다.
다만 구조는 오히려 가깝습니다 — 레퍼런스는 데스크톱 클라이언트가 별도 서버 제품에 붙는
구조라 서버 설정 6단계와 FTP 폴더 규약이 필요한데, 우리는 처음부터 서버가 임포트하고 서버가
리포트를 만듭니다(`report.html`이 이미 HTTP 엔드포인트). 없는 것은 **트리거뿐**입니다.
브리프 ⑧의 여러 파일 임포트는 사람이 고르는 쪽이고 트리거가 아닙니다.

---

## 11장 — Customization · KPI Workbench (UC26 · UC27)

11장은 SQL 질의(p319–p332) → Query Manager(p333–p344) → **Custom KPI Workbench**(p344–p396)
순서이고, UC26이 워크벤치 요소 설명의 끝(p396)에, UC27이 그 뒤 **24페이지짜리 실전
예제**(p403–p426)로 붙어 있습니다. 요소별 명세는 [`kpi-workbench.md`](kpi-workbench.md).

#### UC26 · p396 · 다중 조건으로 복합 필터 만들기 — ●

**예제.** scrambling code를 12–21, 29–30, 74–88 세 범위로 거릅니다.

```
(scr<=21 AND scr>11) OR (scr<=30 AND scr>=29) OR (scr<=88 AND scr>=74)
```

**제약.**

> *"The logic of the filter element follows that of a binary tree, and thus one node can
> always have only two child nodes."*

즉 Filter 요소의 조건은 다이얼로그에서 `Add`로 하나씩 트리에 붙이며, 세 번째 범위를 넣으려면
**남은 자리가 어디인지 세어 가며** 넣어야 합니다.

**우리.** ✅ — 여기는 우리가 낫습니다. `FILTER` 노드는 조건식을 텍스트 한 줄로 쓰고, 파서
(`ColumnCondition`)가 AND/OR/괄호를 지원해 중첩 깊이 제한이 없습니다. 안전성은 파싱
방식으로 보장합니다 — 연산자는 하드코딩 목록과 대조해 상수를 출력하고, 열 이름은 알려진
집합과 대조하며, 사용자 입력의 어떤 조각도 SQL로 복사되지 않습니다.

#### UC27 · p403–p426 · 이웃 누락(핸드오버 누락)에 의한 호 단절 KPI 만들기 — ●

매뉴얼에서 가장 긴 유즈케이스이고, 우리가 워크벤치를 설계할 때 본 "스크린샷"의 정체가 이
유즈케이스의 완성 그래프(p425)였습니다. 이 절은 [`kpi-workbench.md` §7](kpi-workbench.md)의
요약이며, 세부는 그쪽이 원본입니다.

**문제 (p403).** 도심에서 건물 모서리가 서빙 셀을 순간 차단하면 핸드오버를 알릴 시간이
없어 호가 끊깁니다. 이런 드롭콜만 골라내는 KPI를 만듭니다.

**지표 선택 (p404).** 핸드오버 누락 시 두 파라미터가 거의 동시에 움직입니다 — BLER이 오르고,
active set의 Ec/N0가 monitored set의 것보다 낮아집니다.

> *"if Ec/N0 1. best is better than Ec/N0 best active set, the handover has not occurred."*

즉 `Ec/N0 best active set − Ec/N0 1. best < 0`이면 더 좋은 셀이 있는데 옮겨가지 않은 것입니다.
**설정된 이웃 목록은 쓰지 않습니다** — 측정값만으로 판정합니다.

**상태 기계 설계 (p404–p405).** `OK` → `Bad BLER` → `Missing handover` 3상태. `OK →
Missing handover` 직행 전이가 **없다**는 점이 핵심입니다 — Ec/N0 차이가 음수여도 BLER이 먼저
나빠진 상태를 거쳐야만 누락 핸드오버로 판정됩니다.

| 전이 | 조건 | Output 필드 |
|---|---|---|
| OK → Bad BLER | `BLER >= 20` | (비움) |
| Bad BLER → OK | `BLER < 20` | (비움) |
| Bad BLER → Missing handover | `Ec/N0 difference < 0` | (비움) |
| **Missing handover → OK** | `BLER < 20` | **`Missing handover`** |
| **Missing handover → Bad BLER** | `Ec/N0 difference >= 0` | **`Missing handover`** |

Output 이름은 상태가 아니라 **그 상태에서 나가는 전이**에 붙입니다. 매뉴얼의 설명: *"Because
the only relevant state in terms of the KPI is Missing handover and the output should not
include any data from the state OK, leave the Output field empty"*(p415), *"As the output
should include the data from the state Missing handover, enter the name Missing handover
to the Output field"*(p421). 그래서 행은 그 상태를 **빠져나올 때** 기록되고, `time_interval`이
"그 상태에 머문 시간"이 됩니다.

**그래프 제작 절차 (p405–p426).**

| # | 노드 | 매뉴얼이 밝힌 이유 |
|---|---|---|
| 1 | 파라미터 3개 드롭 — `BLER`, `Ec/N0 best active set`, `Ec/N0 Nth best`(Value = 1) | Nth best의 Value=1이 "1. best" |
| 2 | Ec/N0 둘 → **All Values Within Time Range** | 시간 기준 결합 |
| 3 | → **Math 뺄셈** (`- ec/no AND 1. best Ec/No AS Ec/No difference`) | 차이를 열 하나로 |
| 4 | `BLER` + 차이 → **Union** | *"a correlation method that does not remove any data from either of the sets, namely Union"* (p407) |
| 5 | → **Ascending sort** (Column = time) | *"rows are not ordered by time. As most operations require the input data to be ordered by time, you need to sort the data set before performing any further operations"* (p409) |
| 6 | → **State Machine** (OK / Bad BLER / Missing handover) | |
| 7 | `Call dropped` + 상태 기계 → **All Values Within Time Range** | 상태 기계가 **primary**(가장 왼쪽 소켓) |
| 8 | → **Output** (`Column count: 19`) | |
| 9 | 우클릭 → `Save` → 이름 입력 → **Column Aliases** 마법사 | 저장하면 *"can now be found in the Parameters view under the User item"* (p426) |

**그림 4장.** `…_uc27-state-flow_p405.png`(파라미터 3개와 빨간 Output만 놓인 시작 상태) ·
`…_uc27-graph-partial-union_p408.png`(Union까지 연결, Output은 아직 빨강) ·
`…_uc27-complete-graph_p425.png`(완성 그래프 — BLER + (best active set − 1. best) → Union →
Ascending time → State Machine → Call dropped와 상관 → Output 19열) ·
`…_uc27-result-grid_p426.png`(실행 결과).

> **정정 이력.** 처음에는 p405 그림을 "상태 흐름도"로, p408을 "완성 그래프"로 적었습니다.
> 열어 보면 p405는 노드 3개 + Output만 놓인 **시작 화면**이고, 완성 그래프는 p425입니다.
> `MANIFEST.md`의 p405 설명("상태 흐름도")도 그림 내용과 다릅니다.

**실행 결과 (p426).** 전체 측정에서 **2행**입니다.

| start_time | end_time | time_interval | index | text | Event ID | Event |
|---|---|---|---|---|---|---|
| 15:55:46.435 | 15:55:51.776 | **5341** | 1 | Missing handover | CAD | Call dropped |
| 15:55:48.986 | 15:55:51.776 | 5341 | 1 | Missing handover | CAD | Call dropped |

*"The final output includes only the rows with Missing handover events … and if there are
Call dropped events within the time range of the Missing handover events, these will be
displayed as well"*(p425). 우측 Information 패널에는 `Measurement` · `Time` · `System (UMTS
FDD)` · `Downlink Band (2100)` · `Status (Dropped call…)` · `Call type (Voice call)`까지 19열이
이어집니다. 수만 표본에서 행 2개가 남고, 각 행이 "언제부터 언제까지, 몇 ms 동안, 무엇
때문에"를 답합니다.

**우리.** ◐ — 노드 그래프의 **구조**(배치·연결 방향·상태 이름)는 일치합니다. 같은 KPI를
만들 수 있는가는 **아니오**이고, 막는 것이 넷입니다: (1) 우리 `STATE_MACHINE`은 표본별 `CASE`라
"Bad BLER를 거쳐야 Missing handover"라는 **순서**를 표현 못 함, (2) 출력이 표본별 값이라
`start_time`/`time_interval` 구간 행을 못 냄, (3) primary 게이팅이 없음, (4) `sample_neighbour`에
**active set 개념이 없음**. 반면 "설정된 이웃 목록이 없어 원천 불가"라던 기존 판단은
틀렸습니다 — 레퍼런스도 측정값만 씁니다. 실제로 막는 것은 시드 생성기가 매 표본 argmax를
서빙으로 골라 "이웃이 서빙보다 강한" 표본이 0개라는 점입니다([`corrections.md` C1·C2·C9](corrections.md)).
브리프 ⑥에서 `SOURCE_EVENT`가 생겨 7단계의 상관 상대는 이제 캔버스에 올릴 수 있습니다.

---

## 12장 — Other tasks · 색상셋 (UC28–UC31)

12장(p427)의 첫 절이 색상셋입니다 — `Editing color sets`(p427) · `Importing color sets`(p428) ·
`Automatic generation of color sets`(p429) — 그리고 유즈케이스 넷이 이어집니다. 색상셋은
레퍼런스에서 **독립된 1급 자산**입니다: 이름을 붙여 저장·임포트하고, 파라미터의 기본값으로
매고(`Change defaults`, p59), 지도(UC30)·그리드(UC31)·리포트(`Passing color set information to
MS Excel charts`, p245)에 적용합니다. 지도 팝업 메뉴에도 `Generate color set`(p128)이 있고,
`Options – Color`(p457)가 전역 설정입니다.

#### UC28 · p432 · 값 범위에서 색상셋 자동 생성 — ◐

**절 위치로 읽히는 것.** `Automatic generation of color sets`(p429)의 실습. 파라미터의
값 범위(최소·최대)를 N개 구간으로 나눠 색을 자동 배정합니다.

**우리.** ✅ — `AutoScale`: 임계값이 없는 KPI에 이 세션의 **사분위**로 자동 구간. 판정이 아님을
범례가 명시합니다.

#### UC29 · p434 · 색상셋 만들기 — ◐

**절 위치로 읽히는 것.** `Editing color sets`(p427)의 실습 — 구간 경계와 색을 손으로 정해
이름 붙여 저장.

**우리.** ◐ — 임계 편집기로 만들지만 **KPI에 매입니다**. 이름 붙여 재사용하는 색상셋은 미룸.
또 하나의 차이: `Change defaults`의 Statistics 탭에는 구간 경계의 **포함 방향**(Up/Down —
`>0 and <=25` 대 `>=0 and <25`)이 있는데, 우리는 "하한 포함, 상한 배제"로 고정입니다.

#### UC30 · p436 · 색상셋을 지도에 만들어 적용 — ◐

**우리.** ✅ — 경로선·영역 빈·거리 빈이 모두 같은 스케일을 씁니다. 브리프 ④의 **범례 구간
클릭 격리**가 여기 붙습니다.

#### UC31 · p440 · 색상셋을 그리드에 만들어 적용 — ◐

**우리.** ◐ — 그리드 셀은 **심각도 클래스**(`sev-*`)로 칠합니다. 스케일 색 그대로 칠하는 것은
미룸([백로그 ④](../../ui-ux-backlog.md)). UC10과 같은 항목입니다.

---

## 유즈케이스를 가로지르는 개념 여섯

31개를 따로 읽으면 놓치는, 여러 유즈케이스가 공유하는 전제입니다.

| 개념 | 걸린 UC | 매뉴얼 | 우리 |
|---|---|---|---|
| **BTS 파일** — 기지국 위치·방위·채널의 별도 자산. 지도로 드래그해 경로와 "연결" | 14 · 17 · 18 · 19 · 20 · 21 · 23 | p63, p140–146, `BTS_QUEST`(p499), `Options – BTS`(p459) | `cell_ref` 테이블. 연결 단계가 없음. 안테나 높이·틸트는 없음 |
| **색상셋** — 이름 붙은 1급 자산, 파라미터 기본값으로 매임 | 1 · 10 · 14 · 28–31 | p59, p128, p245, p427–443, p457 | KPI별 임계 사다리 + `AutoScale`. 이름 붙은 재사용은 미룸 |
| **전역 필터** — 값 조건 또는 폴리곤, 이후 모든 조작에 적용 | 5 · 15 · 16 | p74–82, p467 | 없음. 파생 KPI로 우회. 공간 조건은 전역 불가 |
| **시간 기반 파일** — 값이 바뀔 때만 표본이 생김. 집계는 시간 가중, 경로 균등은 거리 가중 | 15 · 16 · 27 | p353·375·378, Appendix 3(p477), `QSR_TIME`/`QSR_DISTANCE`(p495–497) | 1 Hz 균일이라 시간 가중 불필요. **거리 가중은 필요**했고 브리프 ⑦에서 넣음 |
| **선택 구성요소** — Troubleshooting Toolkit(드릴다운·KPI Workbench), 3D Visualizer, Lee's criteria | 9 · 22 · 26 · 27 (+ 드릴다운) | p87, p112, p55, p466 | 기본 포함. "격차"의 상당수가 레퍼런스 기본 제품에도 없는 것 |
| **상태 점유 = 한 행** — State Machine의 출력은 표본별 값이 아니라 구간 행 (`start_time`, `time_interval`) | 27 | p370, p426 | 우리 `STATE_MACHINE`은 분류기. 구간 출력은 저장 모델을 건드려야 하는 유일한 항목 |

---

## 그림 라벨 정정

작업 공간의 `manual10.2_*` 14장 중 유즈케이스 페이지의 그림을 이 문서를 쓰며 **전부 열어
보았습니다.** 둘이 라벨과 내용이 다릅니다.

| 파일 | 라벨(MANIFEST · 브리프 ②) | 실제 내용 | 조치 |
|---|---|---|---|
| `manual10.2_cell-locator-estimated-site_p174.png` | "Cell locator — 실제 셀 위치(초록)와 추정 위치(보라)" | **Workspace 패널** — Folders(`localhost › All Measurements (3)`) · Measurements 3건 · Parameters에 `reference` 검색 → `Other › All BTS reference cells`, `Services › … › Audio quality reference sample filename DL/UL`. 지도도, 초록·보라 표식도 없음 | 내용상 **UC19(BTS 참조 파라미터, p171)** 쪽 그림. Cell locator 결과 그림은 저장소에 **없음**. MANIFEST와 브리프 ②의 설명을 고쳤고, 파일명은 원문 페이지를 확인할 수 없어 그대로 둠 |
| `manual10.2_cell-beam-range-on-map_p162.png` | "지도 위 셀 빔 범위(섹터)" | 경로를 따라 **비닝된 타일**(RSCP · Throughput `[Distance]` 범례). 빔 범위 부채꼴은 두드러지지 않음 | UC15/UC16 결과 화면일 가능성. **원문 확인 필요** — 라벨은 유지 |

반대로 `…_area-binning_p150.png`(선택 도구 + 사각형 영역), `…_pilot-pollution-connections_p172.png`
(BTS 탭의 선 종류 목록 + 오염 범례), `…_cell-footprint_p66.png`(한 셀 페이지)는 라벨과 내용이
맞습니다. UC27 그림 4장의 정정은 [UC27](#uc27--p403p426--이웃-누락핸드오버-누락에-의한-호-단절-kpi-만들기--) 절에.

> 교훈은 `MANIFEST.md`가 이미 적어 둔 것과 같습니다 — **파일명과 치수는 동일성의 근거가
> 아닙니다.** 열어 보는 비용이 훨씬 쌉니다.

---

## 원문이 다시 손에 들어오면 확인할 것

이 문서가 등급 ○·◐로 남긴 자리입니다. 원문 PDF를 다시 받으면 이 순서로 채우면 됩니다.

1. **UC16 (p158?)** — 제목 끝(`on map`?)과 실제 페이지. Delta plotting과의 관계
2. **UC17 (p162)** — 절차와 그림. 빔 길이가 고정값인지, 높이·틸트 추정인지의 선택 UI
3. **UC19 (p171)** — `All BTS reference cells` 파라미터로 무엇을 여는가
4. **UC18 (p168)** — 동기화가 그리드→지도 한 방향인지 양방향인지
5. **UC6 · UC7 · UC8 (p108–111)** — 레이어 속성 다이얼로그의 항목, 알림 아이콘의 설정 경로,
   color grid의 축 배정 방식
6. **UC13 (p147)** — geoset 파일(`.GST`)의 저장 위치와 공유 방식
7. **UC24 (p190)** — "minimized data set"의 정확한 정의와 만드는 시점(임포트 옵션인지)
8. **UC28–31 (p432–443)** — 색상셋 다이얼로그의 필드(구간 수 · 경계 포함 방향 · 이름) 와
   저장 단위
9. **UC21 (p174)** — 결과 화면 그림. 저장소의 그림은 다른 것이었음
10. **UC2 · 3 · 4 · 9 · 11 · 22** — 범위 밖이지만, 데이터 모델을 넓힐 결정을 할 때의 근거로
    절차의 입력 파일 형식만이라도

---

출처: Nemo Analyze User Guide · NTN00000A-90013 · Edition 1, 2023-11-27. 인용은 2026-09-01
추출본(`kpi-workbench.md` · `data-views.md` · `corrections.md` · 브리프 ①–⑥)에서 옮겼고, 그림은
`docs/assets/screenshots/manual10.2_*`이며 재배포하지 않습니다(`docs/assets/NOTICE.md`).

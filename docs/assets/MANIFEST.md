# 레퍼런스 자료 매니페스트

기존 Keysight 솔루션의 요구사항 분석 및 UI/UX 모사를 위해 수집한 참고 자료입니다.
모든 파일은 아래 출처에서 직접 내려받아 **매직 바이트(`%PDF`)로 무결성을 확인**했습니다.

> 저작권 고지는 [`NOTICE.md`](./NOTICE.md)를 참조하십시오.

## 0-1. 2026-09-01 추가 — Nemo Analyze 10.2 User Guide

사용자가 **Nemo Analyze User Guide**(부품번호 `NTN00000A-90013`, Edition 1, 2023-11-27,
문서화 대상 SW 10.1.0) 505페이지 전체를 제공했습니다. 지금까지 우리가 가진 것은 전부
마케팅용 Technical Overview였고, **메뉴 설명과 사용자 절차가 담긴 문서는 이것이 처음입니다.**

| | |
|---|---|
| **원본 PDF** | **이 저장소에 두지 않습니다.** 라이선스 보유자 전용 배포물이며, 아래 재배포 금지 원칙이 그대로 적용됩니다 |
| 추출한 그림 | `manual10.2_*` — 2026-09-01에 16장, **2026-09-02에 77 + 26장 추가**(아래 §0-2 · §0-3). 파일명 끝의 `_pNNN`이 원문 페이지 |
| 텍스트 인용 | `docs/reference/nemo-analyze-10.2/`에 페이지 번호와 함께 |

> 이 그림들에도 §0의 원칙이 그대로 적용됩니다: **재배포 금지 · 원본 유지 · 저장소 공개 시
> 재검토.** 저장소를 공개하면 `docs/assets`는 제외하는 것이 기본값입니다.

| 파일 | 원문 | 무엇 |
|---|---|---|
| `manual10.2_workspace-three-sections_p24.png` | p24 | Workspace 좌측 도크 — Folders / Measurements / Parameters 3단 |
| `manual10.2_lee-criteria-distance-sampling_p55.png` | p55 | Lee's criteria 거리 표본화 대화상자 (**40λ**) |
| `manual10.2_cell-footprint_p66.png` | p66 | 셀 푸트프린트 — **3위 안에 든 적 있는** 셀마다 별도 페이지 |
| `manual10.2_drilldown-pie-with-coloured-side-tabs_p88.png` | p88 | 드릴다운 파이 + **좌측에 조각 색으로 쌓이는 세로 탭** |
| `manual10.2_area-binning_p150.png` | p150 | 영역 비닝 |
| `manual10.2_uc16-delta-plotting-result_p162.png` | p162 | **2026-09-02 개명** (구 `cell-beam-range-on-map_p162`). 원문 대조 결과 p162 상단의 **UC16 Delta plotting 결과**(경로를 따라 비닝된 타일, RSCP · Throughput `[Distance]` 범례). 빔 범위 그림은 같은 페이지의 다른 그림 → `uc17-cell-beam-range-sector_p162` |
| `manual10.2_uc19-bts-reference-parameters-workspace_p172.png` | p172 | **2026-09-02 개명** (구 `pilot-pollution-connections_p172`). 원문 대조 결과 **UC19의 그림** — Workspace 패널, Parameters에 `reference` 검색 → `Other › All BTS reference cells` |
| `manual10.2_uc20-bts-lines-properties_p174.png` | p174 | **2026-09-02 개명** (구 `cell-locator-estimated-site_p174`). 원문 대조 결과 **UC20의 마지막 그림** — 지도 워크북 + `Properties › BTS` "Select which lines to draw" + `Number of cells [Time]` 범례. (같은 날 오전 판은 이 파일과 p172 파일의 내용을 서로 바꿔 적었음 — 원문 이미지 해시 비교로 확정.) 진짜 Cell locator 그림은 `uc21-real-vs-estimated-site_p175` |
| `manual10.2_workbook-pages_p216.png` | p216 | 워크북 페이지 구성 |
| `manual10.2_kpi-workbench-canvas_p346.png` | p346 | Parameters 트리에서 캔버스로 파라미터 드래그. 우측에 요소 분류(Parameters·Correlations·Joins·Operations·Aggregates·Sorting·Filters·Math·Time·Components), Properties의 `Execute per` |
| `manual10.2_kpi-workbench-sockets_p349.png` | p349 | Correlation 실물 예 — `Call attempt failure`(primary) + `Ec/N0 active set` → `Previous Value` → `Output`. 미설정 노드가 빨강인 색 규약이 보임 |
| `manual10.2_state-machine-states_p368.png` | p368 | State Machine 상태 정의 대화상자. p368 원본과 픽셀 동일 확인(2026-09-02 오후, p300–399 제공 후). p413에서 재사용 |
| `manual10.2_uc27-start-canvas_p405.png` | p405 | **2026-09-02 개명** (구 `uc27-state-flow_p405`). UC27의 **시작 캔버스** — `BLER` · `Ec/No best active set` · `Ec/No 1. best` 파라미터 3개와 아직 빨간 `Output`. p405의 상태 흐름도는 벡터 텍스트라 그림 파일이 없고 `use-cases.md`에 mermaid로 재현 |
| `manual10.2_uc27-graph-partial-union_p408.png` | p408 | UC27 **중간 단계** — Union까지 연결하고 Output은 아직 빨강(미연결). 색 규약이 보이는 그림 |
| `manual10.2_uc27-complete-graph_p425.png` | p425 | UC27 **완성 그래프** (기존 `nemo-analyze_kpi-workbench.png`와 같은 내용, 다른 크롭) — BLER + (Ec/No best active set − 1. best) → **Union** → **Ascending time** → State Machine → Call dropped와 상관 → `Output (Column count: 19)` |
| `manual10.2_uc27-result-grid_p426.png` | p426 | UC27 **실행 결과** — `start_time · end_time · time_interval · index · text · Event ID · Event · Measurement`. 상태 점유마다 한 행이라는 사실이 실제 값(5341 ms, `Missing handover`, `CAD`)으로 보임 |

> **기존 `nemo-analyze_kpi-workbench.png`(774×717)의 정체 — 두 번 고쳤습니다.**
>
> 처음에는 크기가 같다는 이유로 *"`p405`의 상태 흐름도"* 라고 적었습니다. **틀렸습니다.**
> 이 매뉴얼에는 774×717 그림이 최소 셋(`p405`·`p411`·`p424`) 있어 **크기 일치는 식별이
> 아니었고**, 픽셀 비교에서 셋 중 어느 것과도 일치하지 않았습니다.
>
> 그림을 실제로 열어 보니 **UC27의 완성 노드 그래프**입니다 — `p425`와 내용이 같고
> (BLER + Ec/No 차이 → `Union` → `Ascending time` → State Machine → `Call dropped`와 상관 →
> `Output (Column count: 19)`) 자른 높이만 다릅니다(717 대 660).
>
> **함의**: 우리는 설계할 때 **완성 그래프를 본 것이 맞습니다.** `Union`과 정렬 노드도
> 보았고, 정렬 노드를 넣지 않기로 한 판단은 그것을 보고 내린 것입니다.
> 빠뜨린 것은 설계가 아니라 **레퍼런스 문서의 단계 목록**이었고, 그쪽을 고쳤습니다.
>
> 교훈은 방법에 있습니다 — **치수 일치를 동일성의 근거로 쓰면 안 됩니다.**


### 0-2. 2026-09-02 추가 — 유즈케이스 그림 77장

사용자가 원문 PDF(p1–299 · p400–504, 이어서 p300–399)를 다시 제공해, Use Case 31개의 그림을 원문에서 직접 추출했습니다
(`pymupdf`, 임베드 이미지 무손실). 각 그림이 무엇인지와 절차상 위치는
[`docs/reference/nemo-analyze-10.2/use-cases.md`](../reference/nemo-analyze-10.2/use-cases.md)에 있습니다.
기존 16장 중 4장은 원문과의 해시 대조로 라벨이 틀린 것이 확정돼 **개명**했습니다(위 표의 "2026-09-02 개명" 행).
§0의 원칙(재배포 금지 · 원본 유지 · 공개 시 재검토)이 그대로 적용됩니다.

| 파일 | 원문 | 무엇 |
|---|---|---|
| `manual10.2_uc01-analyses-submenu_p67.png` | p67 | UC1 — 측정 우클릭 `Analyses` 하위 메뉴 (Ec/N0 · RSCP · RSRP · RSRQ × mobile/scanner) |
| `manual10.2_uc01-footprint-filter-dialog_p67.png` | p67 | UC1 — 푸트프린트 필터 대화상자 (Scrambling code / Channel number 필터, 범례·전체 경로 옵션, 값 예 `3,10-30,42,100-`) |
| `manual10.2_uc01-footprint-pages_p68.jpeg` | p68 | UC1 — 셀마다 페이지, 하단 탭으로 이동 |
| `manual10.2_uc02-ul-voice-quality-workbook_p69.jpeg` | p69 | UC2 — 단말 파일에서 연 음성 품질 워크북 |
| `manual10.2_uc03-ip-traces-page_p71.jpeg` | p71 | UC3 — Workspace `IP Traces` 페이지 (.pcap 목록) |
| `manual10.2_uc04-binary-logs-page_p73.png` | p73 | UC4 — Workspace `Binary Logs` 페이지 |
| `manual10.2_filters-dialog-name-list_p75.png` | p75 | Parameter filtering — `Filters` 대화상자의 `Name` 목록 (Secondary parameter · Area · Cell ID · Channel number · Distance · Exclude event …) |
| `manual10.2_polygon-filter-route_p77.png` | p77 | 폴리곤 영역 필터 — 폴리곤 구간만 색상셋, 나머지는 기본색 |
| `manual10.2_uc05-secondary-parameter-dialog_p79.png` | p79 | UC5 — `Secondary Measurement Parameters` (RSCP best active set 선택) |
| `manual10.2_uc05-filter-rscp_p80.png` | p80 | UC5 — 2차 파라미터 필터 `RSCP >= -100` |
| `manual10.2_uc05-save-filter_p81.png` | p81 | UC5 — `Save Filter` (기본 이름이 필터 문자열 `… AND ("rscp" >= -100)`) |
| `manual10.2_uc05-global-filters-saved_p82.png` | p82 | UC5 — `Global Filters`에 저장된 세트, `Set Active / Modify / Delete` |
| `manual10.2_uc06-page-properties_p108.png` | p108 | UC6 — `Page Properties` (Fit to window / Fixed size 1483×640) |
| `manual10.2_uc06-three-layers-stacked_p108.png` | p108 | UC6 — 레이어 3개 stacked 모드 |
| `manual10.2_uc06-graph-properties-axes_p109.png` | p109 | UC6 — `Graph Properties` Axes Left/Right (RSCP 1. best / MIMO RSCP) |
| `manual10.2_uc07-notification-icons-graph_p110.png` | p110 | UC7 — 알림 아이콘이 찍힌 그래프 |
| `manual10.2_uc08-change-graph-type-popup_p111.png` | p111 | UC8 — 그래프 팝업 메뉴 (`Change Graph Type` · `Correlate Parameters` · `Bin Data` …) |
| `manual10.2_uc08-color-grid_p112.png` | p112 | UC8 — 두 파라미터 상관 color grid |
| `manual10.2_uc10-grid-color-sets-tab_p119.png` | p119 | UC10 — `Grid Properties › Color Sets` 탭 (Scr. code · Ec/No 열에 색상셋) |
| `manual10.2_uc10-grid-color-bars_p120.png` | p120 | UC10 — 셀 안 막대로 표시되는 색상셋 |
| `manual10.2_uc10-grid-color-whole-cell_p120.png` | p120 | UC10 — `Color whole cell` |
| `manual10.2_uc11-play-audio-sample_p121.jpeg` | p121 | UC11 — 그리드 행 우클릭 `Play Audio Sample` |
| `manual10.2_uc12-search-parameter-result_p122.png` | p122 | UC12 — 검색 파라미터 결과 (사용자가 이름 붙인 열) |
| `manual10.2_uc13-drag-tab-layer_p147.png` | p147 | UC13 — `.TAB` 파일을 지도로 드래그 |
| `manual10.2_uc13-mapx-save-geoset_p148.png` | p148 | UC13 — 지도 팝업 `MapX › Save Geoset` |
| `manual10.2_uc14-color-layers-popup_p149.jpeg` | p149 | UC14 — 기지국 팝업 `Color Layers Based On Scrambling Code` · `Highlight …` · `Create Global Filter From Cell ID` |
| `manual10.2_uc14-route-colored-by-bts_p149.jpeg` | p149 | UC14 — 한 기지국의 Ec/N0·RSCP로 칠해진 경로 |
| `manual10.2_uc15-filters-scrambling-code_p151.png` | p151 | UC15 — 필터 (Area 좌표 · X steps · Scrambling code 목록) |
| `manual10.2_uc15-area-binning-result_p152.jpeg` | p152 | UC15 — 영역 비닝 결과 레이어 |
| `manual10.2_uc15-bin-layer-properties_p156.png` | p156 | UC15 — 비닝 레이어 `Properties › Statistics` (Draw method · Size · X steps · Area) |
| `manual10.2_uc15-statistic-dropdown_p157.png` | p157 | UC15 — `Statistic` 목록 (Average · Minimum · Maximum · Sample count · Std. deviation · Variance · Mode) |
| `manual10.2_uc16-area-selection_p158.jpeg` | p158 | UC16 — 점선 영역 선택 |
| `manual10.2_uc16-tools-delta-plotting_p158.png` | p158 | UC16 — Tools 패널의 Delta plotting 아이콘 |
| `manual10.2_uc16-delta-plotting-dialog_p159.png` | p159 | UC16 — `Delta Plotting` 대화상자 (Group 1 / Group 2, Configure) |
| `manual10.2_uc16-delta-plotting-configured_p161.png` | p161 | UC16 — 두 그룹 설정 완료 (Ec/N0 best active set / Ec/N0 detected set) |
| `manual10.2_uc17-cell-beam-range-sector_p162.png` | p162 | UC17 — 선택한 셀의 빔 범위가 섹터로 |
| `manual10.2_uc17-options-bts-general_p163.png` | p163 | UC17 — `Options › BTS › General` |
| `manual10.2_uc17-cell-properties-beam-range_p166.png` | p166 | UC17 — 셀 `Properties` `Beam range` (m) |
| `manual10.2_uc17-bts-tab-beam-options_p167.png` | p167 | UC17 — `Use cell beam range from BTS file` · `use estimation from antenna height and tilt` · `Beam transparency` |
| `manual10.2_uc18-split-vertically-popup_p169.jpeg` | p169 | UC18 — `Data View › Split › Vertically` |
| `manual10.2_uc18-insert-grid_p170.jpeg` | p170 | UC18 — `Data View › Insert › Grid` |
| `manual10.2_uc18-grid-synced-with-bts-map_p171.jpeg` | p171 | UC18 — BTS 그리드 행 선택 → 지도 줌 |
| `manual10.2_uc19-set-active-bts-files_p171.png` | p171 | UC19 — `Set Active BTS Files` |
| `manual10.2_uc20-pilot-pollution-filters_p173.png` | p173 | UC20 — 파일럿 오염 필터 값 (window −6 · Ec/N0 below −12 · RSCP above −95 · count 3 · carrier 1538) |
| `manual10.2_uc20-select-columns_p173.png` | p173 | UC20 — `Select columns` (Route: gps_longitude · gps_latitude · time) |
| `manual10.2_uc20-pilots-drawn-on-map_p174.png` | p174 | UC20 — 측정된 파일럿 연결선 |
| `manual10.2_uc21-cell-locator-parameters_p175.jpeg` | p175 | UC21 — Parameters 트리의 cell locator 항목 6종 |
| `manual10.2_uc21-real-vs-estimated-site_p175.jpeg` | p175 | UC21 — 실제 셀 위치(초록)와 추정 위치(보라) |
| `manual10.2_uc21-inputs-dialog_p176.png` | p176 | UC21 — 입력 (Minimum accuracy score 3 · Carrier number 5780 · Minimum received power −120) |
| `manual10.2_uc21-result-overlay_p176.jpeg` | p176 | UC21 — 결과를 BTS 참조 오버레이로 연 지도 |
| `manual10.2_uc22-beam-lines_p177.jpeg` | p177 | UC22 — 5G best beam 선 (beam index 색) |
| `manual10.2_uc23-serving-cell-lines-popup_p178.png` | p178 | UC23 — 레이어 팝업 `Serving Cell Lines` |
| `manual10.2_uc23-serving-cell-lines_p178.png` | p178 | UC23 — 서빙 셀 선 |
| `manual10.2_uc23-export-kml-popup_p179.png` | p179 | UC23 — `Export Data To › Google KML-file` |
| `manual10.2_uc24-avg-formula_p190.png` | p190 | 스프레드시트 — `=AVG(B7:B12)` |
| `manual10.2_uc24-minimized-dataset-formula_p191.jpeg` | p191 | UC24 — 최소화 데이터셋 참조 수식 `=AVG(*BLER DL!A1:A15)` |
| `manual10.2_uc26-filter-tree-operator_p401.png` | p401 | UC26 — 이진 트리 노드의 연산자 우클릭 (AND/OR) |
| `manual10.2_uc26-filter-tree-complete_p403.png` | p403 | UC26 — 세 범위가 완성된 필터 트리 |
| `manual10.2_uc27-subtraction-properties_p407.png` | p407 | UC27 — Subtraction `Properties` (Left/Right column, Result title `Ec/N0 difference`) |
| `manual10.2_uc27-sort-column_p410.png` | p410 | UC27 — Ascending sort `Column = time` |
| `manual10.2_uc27-states-initial_p414.png` | p414 | UC27 — 상태 3개와 `Initial state = OK` |
| `manual10.2_uc27-condition-dialog_p415.png` | p415 | UC27 — `Condition` 대화상자 (`bler >= 20`) |
| `manual10.2_uc27-transition-dialog_p415.jpeg` | p415 | UC27 — `Transition` 대화상자 (Conditions · Target · Output) |
| `manual10.2_uc27-transition-with-output_p421.jpeg` | p421 | UC27 — Output 필드에 `Missing handover`를 넣은 전이 |
| `manual10.2_uc27-missing-handover-transitions_p423.png` | p423 | UC27 — Missing handover 상태의 전이 2개 |
| `manual10.2_colorset-wizard-select-query_p430.png` | p430 | 색상셋 자동 생성 — `Color Set Wizard › Select Query` |
| `manual10.2_colorset-auto-route-legend_p431.png` | p431 | 색상셋 자동 생성 — 적용된 경로와 범례 |
| `manual10.2_uc28-color-set-properties_p433.png` | p433 | UC28 — `Color Set Properties` (Cell identification, 이산값별 색) |
| `manual10.2_uc28-add-range_p434.png` | p434 | UC28 — `Add Range` (From 116731 · To 117419 · Step 1) |
| `manual10.2_uc29-range-properties_p435.png` | p435 | UC29 — `Range Properties` (Description · Color · Limits `>= 0 And < 2`) |
| `manual10.2_uc29-color-set-complete_p436.png` | p436 | UC29 — 완성된 numerical 색상셋 (Very good / Good / Bad) |
| `manual10.2_uc30-value-properties_p437.png` | p437 | UC30 — gradient `Value Properties` (Bad, −20) |
| `manual10.2_uc30-gradient-color-set_p438.png` | p438 | UC30 — 완성된 gradient 색상셋 (−20 Bad / 0 Good) |
| `manual10.2_uc30-route-color-properties_p439.png` | p439 | UC30 — 경로 `Properties › Color` (Based on value · Parameter · Color set) |
| `manual10.2_uc30-route-gradient-map_p439.jpeg` | p439 | UC30 — 그라디언트로 칠해진 경로 |
| `manual10.2_uc31-string-properties_p441.png` | p441 | UC31 — `String Properties` (MEASUREMENT_REPORT) |
| `manual10.2_uc31-l3-grid-colored_p443.png` | p443 | UC31 — Message Name 열이 칠해진 L3 그리드 |

### 0-3. 2026-09-02 추가 — p300–399의 그림 26장

같은 날 오후에 빠져 있던 p300–399가 제공되어, UC25 · UC26과 워크벤치 요소 대화상자(State Machine · Group By ·
Aggregate · Filter · Nth · Math · Resample · Time Shift · 저장·실행)의 그림을 추출했습니다. 설명은
[`use-cases.md`](../reference/nemo-analyze-10.2/use-cases.md)의 UC25 · UC26 · 부록.

| 파일 | 원문 | 무엇 |
|---|---|---|
| `manual10.2_scheduler-schedule-event-batch_p294.jpeg` | p294 | Event Scheduler — `Schedule Event Batch` (Batch name · Start time · Recurrence · Events) |
| `manual10.2_scheduler-event-recurrence_p307.png` | p307 | Event Scheduler — `Event Recurrence` (Daily / Weekly / Monthly, Range of recurrence) |
| `manual10.2_uc25-scheduler-calendar_p308.png` | p308 | UC25 — Event scheduler 달력 뷰 |
| `manual10.2_uc25-triggering-events-ribbon_p308.png` | p308 | UC25 — 리본의 `Triggering events` |
| `manual10.2_uc25-triggering-events-dialog_p309.png` | p309 | UC25 — `Triggering Events` 대화상자 |
| `manual10.2_uc25-triggering-folder-ready_p309.png` | p309 | UC25 — `Triggering folder = test_ready` |
| `manual10.2_uc25-batch-with-events-active_p310.png` | p310 | UC25 — Run workbook · Run report 두 이벤트와 `Active` |
| `manual10.2_workbench-transition-dialog-time-trigger_p369.png` | p369 | State Machine — `Transition` (Conditions · Time trigger · Target · Output) |
| `manual10.2_workbench-condition-dialog_p370.png` | p370 | State Machine — `Condition` (Left Column · Operator · Right column · Value) |
| `manual10.2_workbench-transition-two-conditions_p371.png` | p371 | State Machine — 조건 둘과 AND/OR |
| `manual10.2_workbench-group-by-properties_p374.png` | p374 | Group By — `Properties` (Input · Group by · Aggregates · Function · Weight by · Result title) |
| `manual10.2_workbench-group-by-example_p375.png` | p375 | Group By — bts_site_name › bts_cell_name 그룹, ec/no·tx_power 집계 6개 |
| `manual10.2_workbench-group-by-result_p375.png` | p375 | Group By — 결과 데이터셋 |
| `manual10.2_workbench-aggregate-properties_p377.png` | p377 | Aggregate — `Column · Group by · Weight by · Result title` |
| `manual10.2_workbench-filter-tree-third-level_p382.png` | p382 | Filter — 셋째 조건으로 자동 추가된 레벨 |
| `manual10.2_workbench-nth-properties_p385.png` | p385 | Top-N / Nth — `N · Column · Group by` |
| `manual10.2_workbench-math-operator_p387.png` | p387 | Math — `Operator` 탭 |
| `manual10.2_workbench-resample_p389.png` | p389 | Resample — `Interval` (ms/s) |
| `manual10.2_workbench-time-shift_p390.png` | p390 | Time Shift — `Time offset` · `Duration` |
| `manual10.2_workbench-component-type_p392.png` | p392 | `Component Type` — Single component / Multiple nodes |
| `manual10.2_workbench-save-properties_p393.png` | p393 | Save — `Analyze Wizard – Properties` (Name · Title · Description) |
| `manual10.2_workbench-execution-method_p395.png` | p395 | `Execute per` file / measurement / all |
| `manual10.2_workbench-add-constant_p396.png` | p396 | `Add Constant` — `{$example}` |
| `manual10.2_uc26-filter-tab_p397.png` | p397 | UC26 — 빈 `Filter` 탭 |
| `manual10.2_uc26-condition_p398.png` | p398 | UC26 — 첫 조건 `scrambling_code <= 21` |
| `manual10.2_uc26-first-pair_p399.png` | p399 | UC26 — 첫 쌍 완성 |

---

## 0. 수집 원칙 — 2026-08-31 정리

이 저장소는 **드라이브 테스트 사후 분석 UI**를 만듭니다. 그 목적에 기여하지 않는 자료는
남겨두지 않습니다. 2026-08-31에 아래 기준으로 정리했습니다.

**제거한 것** (분석 UI·KPI·워크플로에 기여하지 않음):

| 제거 | 사유 |
|---|---|
| `5992-2774` Nemo Handy IoT 브로슈어 + IoT 화면 캡처 | Android NB-IoT/LTE-M 수집 앱. 측정 수집이지 분석이 아님 |
| `5992-2268` Global License Server 브로슈어 | 라이선스 풀 관리. UI·KPI·워크플로 내용 0 |
| `NTC00000A-900005` Firmware Manager User Guide + 화면 | ADB 기반 단말 펌웨어 플래싱 유틸리티 |
| `nemo-3d-visualizer_ss-rsrp.jpeg`, `nemo-analyze_fig2-data-views.jpeg` | 둘 다 3D Visualizer 빔 렌더링(같은 제품). 별도 라이선스 옵션이며 요구사항 문서가 **범위 외**로 표시 |
| `nemo-analyze_fig1-qos-qoe-analysis.png` | 파일명과 달리 제품 포트폴리오 그리드(배낭·섀시 사진) |
| `s8709a-vdt_p7-figure.jpeg` | 오울루 시내를 지나는 빨간 선이 그려진 위성지도 스크린샷. 제품 UI 아님 |
| `keysight-logo-official.png` | 브랜드 색은 keysight.com CSS에서 이미 확인. 타사 로고를 저장소에 두는 것은 불필요한 재배포 위험 |

**정정한 라벨** — 다음 두 개는 이름이 실제 내용과 달랐습니다. 이름만 믿고 설계하면
블록 다이어그램을 UI로 오인하게 되므로 파일명을 실제 내용에 맞게 바꿨습니다.

| 이전 이름 | 실제 내용 | 새 이름 |
|---|---|---|
| `s8709a-vdt_fig2-architecture.png` | Figure 1 "5G Device Workflow Stages" (제품 포트폴리오 맵) | `s8709a-vdt_fig1-device-workflow-stages.png` |
| `s8709a-vdt_fig3-single-interface.png` | Figure 2, 장비 체인 **블록 다이어그램** (UI 아님) | `s8709a-vdt_fig2-equipment-chain.png` |

**놓쳤던 것** — S8709A 기술개요 5페이지의 **진짜 Figure 3**(실제 UI 스크린샷 3장)은
이전 추출 스크립트의 `w*h > 120000` 임계값에 걸려 빠져 있었습니다. 이번에 추출했습니다.

---

## 1. 공식 PDF (`reference-pdfs/`)

### 1.1 분석 UI의 1차 근거

| 파일 | 리터러처 | 종류 | 출처 URL |
|---|---|---|---|
| `5992-2005EN_Nemo-Analyze-Technical-Overview-keysight.pdf` | 5992-2005EN | Technical Overview (22p, **2026-08 판**) | `.../ungate/ndx/technical-overviews/5992-2005.pdf` |
| `5992-2005EN_Nemo-Analyze-Technical-Overview.pdf` | 5992-2005EN | Technical Overview (21p, **2020-02 판**) | `https://www.avantec2.cl/imagenes/pdf/5992-2005EN_Nemo_Analyze_TE.pdf` (제3자 미러) |
| `5992-2013EN_Nemo-Outdoor-Technical-Overview.pdf` | 5992-2013EN | Technical Overview (30p, 2026-05) | `.../ungate/ndx/technical-overviews/5992-2013.pdf` |
| `5992-2047_Nemo-Analyze-Flyer.pdf` | 5992-2047 | Flyer (3p) | `.../ungate/flyers/5992-2047.pdf` |
| `5992-2057_Nemo-Outdoor-Flyer.pdf` | 5992-2057 | Flyer (4p) | `.../ungate/flyers/5992-2057.pdf` |
| `5992-2050_Nemo-Handy-Flyer.pdf` | 5992-2050 | Flyer (4p) | `.../ungate/flyers/5992-2050.pdf` |

> **두 판을 모두 둔 이유**: 2020년 판은 기존 스크린샷 13장의 출처이므로 지우면 그 자료들의
> 출처가 끊깁니다. 2026년 판은 Keysight 1차 출처이자 최신판이라 새 자료의 근거입니다.
> 두 판의 그림 구성은 대체로 대응하지만 해상도와 세대(UMTS→LTE/5G)가 다릅니다.

### 1.2 VDT(가상 드라이브 테스트) 계열

| 파일 | 리터러처 | 연도 | 구성 |
|---|---|---|---|
| `5992-1598EN_Anite-Virtual-Drive-Testing-Toolset.pdf` | 5992-1598EN | 2016 | Propsim F32 + Anite 9000 네트워크 시뮬레이터 + Nemo(**옵션**) |
| `5992-3870EN_Virtual-Drive-Testing-Toolset.pdf` | 5992-3870EN | 2019 | PROPSIM F64 + 네트워크 에뮬레이터 **또는 실제 망** + Nemo Outdoor |
| `3120-1513_S8709A-VDT-Technical-Overview.pdf` | 3120-1513 | 2020 | UXM 5G + PROPSIM 5G + Nemo Tools |

> 세 세대가 모두 "Virtual Drive Test"를 표방합니다. **Nemo는 VDT 솔루션이 아니라 그 구성요소**이며,
> 2016·2019 문서에서는 명시적으로 **옵션**으로 표기됩니다. 자세한 정리는
> [`../keysight-vdt-research.md`](../keysight-vdt-research.md) §3.

### 1.3 접속·셀 설정 절차의 근거 (S870xA 형제 툴셋)

S8709A 기술개요 8페이지에는 **셋업·연결 절차가 전혀 없습니다.** 그래서 S8709A가 자기 구성요소로
지목한 UXM 5G의 문서를 확보했습니다.

| 파일 | 종류 | 왜 필요한가 |
|---|---|---|
| `S8711A_UXM-5G-Test-Application-Technical-Overview.pdf` | Technical Overview (27p) | **셀 설정과 접속 절차의 유일한 판독 가능한 근거.** 셀별 상태 스트립(CONNECTED/OFF), Impairments 탭의 채널 모델 지정, Scheduling Map |
| `S8703A_Functional-KPI-Toolset-Technical-Overview.pdf` | Technical Overview (25p) | 필드→랩 임포트(`.json`에 MIB/SIB1/RRC Setup hex + Cell Index/Start Time) |
| `S8708A_5G-Advanced-Performance-Test-Toolset-Technical-Overview.pdf` | Technical Overview (9p) | `UE Attached` / `Calibration` 램프(회색→녹색) 관용구 |

> **정직성 경계**: 이 세 문서는 **S8709A 자체가 아니라 같은 S870xA 계열 형제 툴셋**의 것입니다.
> S8709A가 UXM 5G를 자기 구성요소로 명시하므로 그 UI가 랙 안에 있다는 것은 확실하지만,
> S8709A 운용자가 저 화면을 직접 조작하는지 아니면 래퍼를 쓰는지는 **어떤 공개 문서로도 확인되지 않았습니다.**
> S8709A 지원 페이지는 "No information found for this product"를 반환하며 사용자 가이드가 공개되어 있지 않습니다.

### 내려받기 방법 (재현용)

Keysight 자료 **페이지**(`/us/en/assets/...`)는 봇에 403을 반환하지만, **원본 바이트**는 받을 수 있습니다.

```
https://www.keysight.com/content/dam/keysight/en/doc/ungate/<type>/<파일명>.pdf
https://www.keysight.com/content/dam/keysight/en/doc/ungate/ndx/<type>/<번호>.pdf   ← Nemo 계열 다수
```

- `<type>`: `flyers`, `brochures`, `data-sheets`, `technical-overviews`, `solution-briefs`
- 파일명이 항상 리터러처 번호는 아닙니다. flyer/brochure는 번호를, S870xA 기술개요는 제목 기반 파일명을 씁니다.
- **404 시 PDF가 아니라 HTML을 반환하므로 매직 바이트(`%PDF`) 검증이 필수입니다.**

---

## 2. 스크린샷 (`screenshots/`)

전부 위 PDF 내부에 임베드된 원본 이미지를 **손실 없이** 추출한 것입니다(재촬영·재압축 없음).

### 2.1 Nemo Analyze — 사후 분석

| 파일 | 해상도 | 내용 |
|---|---|---|
| `nemo-analyze_workbook_line-and-bar.png` | 1918×1040 | **핵심.** 워크북 메인. 리본, Workspace 도크(Folders/Measurements/Parameters 트리 + 검색창), 라인 그래프 + **바 차트**, 우측 Tools/Layers/Numerical Data/Color Legends 도크, 보라색 상태 바 |
| `nemo-analyze_problem-survey-drilldown_1836x1123.png` | 1836×1123 | **핵심(2026 판, 신규).** 원인별 파이(Dropped RRC connection / File transfer dropped / Handover failure / Data server connect failure) → HOF 사례 그리드(Handover type·HOF cause) → 그 순간의 워크북(핸드오버 마커가 찍힌 RSRP 트레이스 + Layers 시간범위 필터 + OSM 지도 + 시그널링 목록 + **디코드된 PDN CONNECTIVITY REQUEST**) |
| `nemo-analyze_troubleshooting.jpeg` | 1210×1190 | 위 그림의 **2020년 UMTS 세대 판**. Call drop analysis 파이 + Drill Down 컨텍스트 메뉴가 보임 |
| `nemo-analyze_live-map_route-coloring_color-legend.jpeg` | 1490×824 | **핵심.** 경로 색상 코딩 + Color Legends의 실제 구간·건수·비율. LiveMaps 목록, Loaded MapX Maps(.TAB/.GST) |
| `nemo-analyze_basestation-map-synchronized-views.png` | 1025×806 | 기지국 맵과 타 데이터 뷰의 동기화 |
| `nemo-analyze_area-binning.png` | 1327×813 | Area binning. Live Map 리본 전체(Polygon region, Area binning, **Distance binning**, Delta plotting) |
| `nemo-analyze_kpi-workbench.png` | 774×717 | **KPI Workbench** — 노드 그래프 KPI 빌더(소스 → Union/Ascending/State Machine → Output) |
| `nemo-analyze_benchmarking.png` | 1265×899 | 사업자 간 CDF+히스토그램 오버레이 + Aggregates 표 |
| `nemo-analyze_spreadsheet-report-summary.jpeg` | 1267×686 | Spreadsheet Report Designer 요약 페이지 |
| `nemo-analyze_excel-export.jpeg` | 1270×905 | KPI별 리포트 페이지(PDF 바 + CDF 라인 + 색상 구간 지도) |
| `nemo-analyze_database-concept-diagram.png` | 2095×735 | 데이터베이스 개념도 |

### 2.2 Nemo Outdoor — 실시간 측정

| 파일 | 해상도 | 내용 |
|---|---|---|
| `nemo-outdoor_5g-nr_main-window_2560x1440.png` | 2560×1440 | **최고 가치 자료.** 리본, 도킹 패널, 공유 시간 커서, 임계 강조(노랑/빨강), **5G NR RACH metrics 도크**, 서빙 셀 식별 테이블, 워크북 탭 + `+`, START/END/CURRENT 상태 바 |
| `nemo-outdoor_laptop-composite.jpeg` | 610×422 | 랩탑 목업. 텍스트 판독 불가, 2×2 그래프 배치 관용구만 기여 |

> `nemo-outdoor_5g-nr_main-window_2560x1440.png`는 2026-08-31에 **1차 출처로 교차 확인**했습니다.
> 새로 받은 `5992-2013EN` 8페이지의 임베드 이미지와 **md5가 동일**합니다(e7c1601f…).
> 즉 이 스크린샷은 제3자 경유가 아니라 Keysight 원본과 바이트 단위로 일치합니다.

### 2.3 S8709A VDT

| 파일 | 해상도 | 내용 |
|---|---|---|
| `s8709a-vdt_fig1-device-workflow-stages.png` | 1502×754 | Figure 1. "5G Device Workflow Stages" 포트폴리오 맵 |
| `s8709a-vdt_fig2-equipment-chain.png` | 1565×715 | Figure 2. **블록 다이어그램**(UI 아님): Nemo Tools →(Field-To-Lab Conversion)→ UXM 5G →PROPSIM→ DUT, 상단에 Test System PC |
| `s8709a-vdt_fig3a-field-logs-processing_536x450.jpeg` | 536×450 | **진짜 Figure 3 ①.** `FIELD LOGS PROCESSING` 화면 — 로그 메타(제품·측정일시·소요·거리·평균속도), UE 데이터(제조사·모델·펌웨어·칩셋), 검출 캐리어 표, 경로 지도, DUT 측정 셀 파워 차트, **Extracted channel model** 상태, `Generate simulation` |
| `s8709a-vdt_fig3b-run-view_635x367.jpeg` | 635×367 | **진짜 Figure 3 ②.** `RUN VIEW` — Project/Campaign 드롭다운, `Run`/`Cancel Test Case`, **Duration·Progress·Pass Rate 게이지 3개**, 테스트 케이스 그리드, `Result KPI` 표(Measured value / Comparison operator / Expected value) |
| `s8709a-vdt_fig3c-test-execution-monitoring_372x201.jpeg` | 372×201 | **진짜 Figure 3 ③.** `TEST EXECUTION MONITORING` — 주행 시점 영상 + 게이지 오버레이 + 경로 지도 인셋 + 좌우 차트 카드 열 + 타임라인 커서 |

> 세 장 모두 원본이 작습니다(최대 635×367). **레이아웃과 패널 제목은 판독되지만 모든 열 머리글이
> 읽히지는 않습니다.** 이 문서 이상의 S8709A UI 자료는 공개되어 있지 않습니다.

### 2.4 UXM 5G Test Application (접속 절차 근거)

| 파일 | 해상도 | 내용 |
|---|---|---|
| `uxm-5g-test-app_cell-status-strip-pdu-editor_1310x946.jpeg` | 1310×946 | **셀별 상태 스트립** — `L1 PCC/FDD n78 -60 dBm BW 10 MHz EARFCN 18300 **CONNECTED**`, `L2 SCC **OFF**`, `N1 NSA PCC/TDD **CONNECTED**`, `N2 SA PCC **OFF**`. 우측 세로 액션(Main/Cell Off/RRC Release/Power Control/CA·HO/Blind Handover), 하단 탭(System/Scheduling/Cell/PHY/MAC·RLC·PDCP/RRC·NAS/UE Info), RRC Reconfiguration ASN 편집 + PDU Editor 트리 |

### 2.5 기타

| 파일 | 해상도 | 내용 |
|---|---|---|
| `nemo-handy_mobile-screen.png` | 929×1014 | 모바일 수집 앱. **NR Cell Table 열 구성**(Set/Band/NR-ARFCN/PCI/BI/RSRQ/RSRP/SINR)이 서빙+이웃 셀 표의 참고가 됨 |

---

## 3. 추출 재현 방법

```bash
pip install pymupdf pillow
python3 -c "
import pymupdf
d = pymupdf.open('reference-pdfs/3120-1513_S8709A-VDT-Technical-Overview.pdf')
for i in range(d.page_count):
    for im in d[i].get_images(full=True):
        xref, w, h = im[0], im[2], im[3]
        if w*h > 40000:                      # 120000이면 진짜 Figure 3을 놓칩니다
            info = d.extract_image(xref)
            open(f'p{i+1}_{xref}_{w}x{h}.{info[\"ext\"]}','wb').write(info['image'])
"
```

> **임계값 주의**: 이전 판은 `> 120000`을 썼고, 그 결과 S8709A 5페이지의 실제 UI 스크린샷
> 3장(241200 / 74772 / 233045 px)이 전부 누락됐습니다. 작은 이미지가 곧 가치 없는 이미지는 아닙니다.

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
| 추출한 그림 | `manual10.2_*` 14장 — 파일명 끝의 `_pNNN`이 원문 페이지 |
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
| `manual10.2_cell-beam-range-on-map_p162.png` | p162 | 지도 위 셀 빔 범위(섹터) |
| `manual10.2_pilot-pollution-connections_p172.png` | p172 | 파일럿 오염 기반 기지국 연결선 |
| `manual10.2_cell-locator-estimated-site_p174.png` | p174 | Cell locator — 측정만으로 기지국 위치·방위 역추정 |
| `manual10.2_workbook-pages_p216.png` | p216 | 워크북 페이지 구성 |
| `manual10.2_kpi-workbench-canvas_p346.png` | p346 | Parameters 트리에서 캔버스로 파라미터 드래그. 우측에 요소 분류(Parameters·Correlations·Joins·Operations·Aggregates·Sorting·Filters·Math·Time·Components), Properties의 `Execute per` |
| `manual10.2_kpi-workbench-sockets_p349.png` | p349 | Correlation 실물 예 — `Call attempt failure`(primary) + `Ec/N0 active set` → `Previous Value` → `Output`. 미설정 노드가 빨강인 색 규약이 보임 |
| `manual10.2_state-machine-states_p368.png` | p368 | State Machine 상태 정의 대화상자 |
| `manual10.2_uc27-state-flow_p405.png` | p405 | UC27 상태 흐름도 (OK / Bad BLER / Missing handover) |
| `manual10.2_uc27-full-graph_p408.png` | p408 | UC27 완성 그래프 |

> **기존 `nemo-analyze_kpi-workbench.png`(774×717)의 정체가 밝혀졌습니다.** `p405`에서
> 추출한 그림과 크기가 정확히 같습니다 — 우리가 웹에서 주워 스크린샷이라 불렀던 것은
> 사실 **이 매뉴얼 UC27의 상태 흐름도**였습니다. 그걸 보고 노드 그래프를 설계한 것은
> 결과적으로 옳았지만, 근거의 출처를 이제야 정확히 알게 됐습니다.

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

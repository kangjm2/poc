# UI 격차 분석 — 실제 스크린샷 대비

**질문:** 매뉴얼 텍스트만 읽고 UI를 "창작"한 것은 아닌가? 기존 Keysight 툴을 쓰던
통신사 직원이 이 도구를 열었을 때 이질감을 느끼지 않는가?

**방법:** 매뉴얼 기재 항목이 아니라 **화면 이미지**를 근거로 삼았습니다.
`docs/assets/screenshots/`의 실제 제품 스크린샷을 열어 화면 요소를 하나씩 세고,
`docs/poc-screenshots/`의 우리 화면과 대조했습니다. 아래 모든 "레퍼런스" 항목은
이미지에서 직접 판독한 것이며, 매뉴얼 문장에서 옮긴 것이 아닙니다.

기준 이미지 4종:

| 파일 | 무엇 |
|---|---|
| `nemo-analyze_workbook_line-and-bar.png` | Analyze 워크북 (사후 분석 — 우리 Analysis 화면의 직접 대응물) |
| `nemo-outdoor_5g-nr_main-window_2560x1440.png` | Outdoor 실시간 측정 (연결·수집 중 화면) |
| `nemo-analyze_troubleshooting.jpeg` | 자동 문제 조사 → 드릴다운 → 원인 규명 |
| `s8709a-vdt_fig2-equipment-chain.png` | VDT 툴셋 구성 (Nemo → UXM → PROPSIM → DUT) |

---

## 1. 결론부터

**창작이 아닙니다.** 우리 Analysis 화면의 골격은 Analyze 워크북과 같은 배치입니다 —
좌측 Parameters 도크, 중앙 지도+그래프 스택, 우측 Color Legends / Numerical Data 도크,
하단 워크북 탭, 하단 상태 바. Outdoor의 START/END/CURRENT 진행 바와 임계 강조(노랑/빨강)도
같은 형태입니다.

**그러나 빠진 것이 분명히 있었습니다.** 최초 판정(2026-08-30) 시점에 기존 사용자가
즉시 알아챌 부류로 세 가지를 꼽았고, 셋 다 이후 증분에서 닫았습니다.

1. ~~**접속·RACH 계열 화면이 통째로 없음**~~ — `5G NR RACH metrics` 도크와 서빙 셀 식별
   테이블을 구현했습니다(`Lab` → 런 상세). §3 참조.
2. ~~**차트 종류가 라인 하나뿐**~~ — 셀별 **바 차트**(`Cells` 탭)와 원인별 **파이 차트**
   (`Problem Survey` 탭)를 추가했습니다. §2·§4 참조.
3. ~~**드릴다운 연쇄가 없음**~~ — "원인 집계 → 개별 사례 → 그 순간" 3단을 구현했습니다.
   §4 참조.

**지금 남은 것은 성격이 다릅니다.** 아래 표에서 ⛔로 남은 항목은 대부분 UI를 안 만든 것이
아니라 **받쳐 줄 데이터가 없는 것**입니다(이웃 셀 measurement, 주행 영상). 이 구분은
§6에 정리했습니다.

> **표 읽는 법**: §2–§4의 판정 열은 **2026-08-31 재검토 기준**입니다. 최초 판정에서 바뀐
> 행에는 바뀐 사유를 함께 적었습니다.

---

## 2. Analysis 화면 — Analyze 워크북 대비

| 레퍼런스 화면 요소 | 우리 상태 | 판정 |
|---|---|---|
| 좌측 Workspace 도크: Folders / Measurements / **Parameters** 3단 | Parameters 트리만, 세션은 상단 드롭다운 | ◐ 배치는 다르나 기능은 있음 |
| Parameters 트리 위의 **검색창** | **없었음 → 이번에 추가** | ✅ 해소 |
| Measurements 목록 + 검색창 | 드롭다운 | ◐ 세션이 수십 개가 되면 부족 |
| 기술별 파라미터 카테고리 트리 (AMPS/CDMA/GSM/LTE/…) | 기능별 카테고리 (Radio Quality/Throughput/…) | ✅ 동등 |
| 워크북 안에 **여러 개의 그래프 페인 스택** | 지도 1 + 라인 1 고정 (탭에 따라 바/파이 추가) | ◐ 페인 스택을 사용자가 쌓지는 못함 |
| 페인별 **Tools / Layers** 도크 | 없음 | ⛔ |
| 페인별 **Numerical Data** (커서 시점 값 테이블) | 있음 (우측) | ✅ |
| **Color Legends** (구간·건수·비율) | 있음 | ✅ |
| **바 차트** (`RSCP monitored set` — 셀별 막대) | `Cells` 탭 — 서빙 PCI별 막대 + 집계 표 | ✅ 해소. 단 축이 다름: 레퍼런스는 *monitored set*(이웃 셀)별, 우리는 *서빙 셀*별. 이웃 셀 축은 아래 행과 같은 이유로 막힘 |
| monitored set 테이블 (Ch/SC/RSCP, Ch/SC/Ec/N0) | 없음 | ⛔ **데이터 모델 공백** — `sample`이 서빙 셀만 담고 이웃 셀 measurement를 담지 않음. UI가 아니라 스키마 작업 |
| 시간 축 가로 스크롤(팬) | 범위 필터로 대체 | ◐ |
| 하단 **Activity / Log** 탭 | 없음 | ⛔ |
| 상태 바: Ready / **No global filters** / No scheduled events / Query memory | START/END/CURRENT/세션명 | ◐ 전역 필터 표시 없음 |
| 리본 (File/View/Tools/Utilities/Commander/Layout/Graph/Help) | 단일 툴바 | ◐ 의도적 단순화 |

## 3. 접속·수집 화면 — Outdoor 대비 (**가장 큰 공백**)

Outdoor 메인 윈도우에서 직접 판독한 요소입니다.

| 레퍼런스 화면 요소 | 판독한 실제 필드 | 우리 상태 |
|---|---|---|
| **`5G NR RACH metrics` 도크** | RACH type(Contention based), RACH reason(Channel request), RACH result(Succeeded), access delay(31 ms), config(98), contention resolution, logical root sequence(106), maximum preamble, **pathloss(95.0 dB)**, preamble count(1), **preamble format(Format A2)**, preamble index(3), preamble initial power(-3.0 dBm), preamble response, preamble step, PUSCH power(0.0 dBm), **RA-RNTI(267)**, response window(10 slot), SSB ID(0), **timing advance(2)** | ✅ 해소 — 19개 필드 중 **17개** 구현(`Lab` → 런 상세, `5G NR RACH metrics` 도크). `maximum preamble`·`preamble response` 2개만 미구현. 단 레퍼런스는 *실시간 수집* 중 상시 표시, 우리는 *랩 런* 화면 |
| **서빙 셀 식별 테이블** | Cell type(SCG PSCell), SSB band(NR n78), SSB NR-ARFCN(633984), PCI(8), SSB GSCN(7853) | ✅ 해소 — 5개 필드 전부 + `TA offset`(`Lab` → 런 상세, `Serving cell`) |
| `5G NR key parameters` 도크 + 임계 강조 | BLER 9.96% 노랑, TX power 19.4 dBm 빨강 | ✅ 동등 |
| 상단 **트랜스포트 컨트롤** (record/pause/stop) | 없음 (사후 분석 전용) | ⛔ |
| 하단 진행 바 + START/END/CURRENT | 있음 | ✅ |
| 워크북 탭 + **`+` (탭 추가)** | 고정 탭 12개 | ◐ 사용자 정의 탭 없음 |
| 탭 구성 자체 (`5G RACH and Signalling`, `5G NR Beams`, `5G Physical Layer`) | RACH·Signalling은 있음. Beams·Physical Layer 탭 없음 | ◐ Beams는 SSB 빔 measurement가 없어 막힘(데이터), Physical Layer는 미구현(UI) |
| 면적 차트 2계열 (scheduled vs actual throughput) | 단일 라인 | ◐ |
| 상태 바 `Measurement: OnePlus 7 5G Oulu center 19Nov08 091517.1` | 세션명 표시 | ✅ |

## 4. 문제 조사 — Analyze Troubleshooting 대비

레퍼런스의 조작 연쇄를 그대로 옮기면:

```
원인별 파이 차트 (Call drop analysis)
   9.68% Unknown reason · 16.13% Missing neighbour · 3.23% Bad DL coverage, bad UL quality
   9.68% Bad DL coverage · 32.26% CC cause: Normal, unspecified · 29.03% Missing handover
        │  우클릭 → [Drill Down ▶]
        ▼
개별 사례 그리드
   Measurement · Event ID(CAD) · Time · Lat · Long · System · Cell ID · Carrier
   · Scr. code · Miss. nbor. scr. · Ec/No · RSCP · BLER · DL pwr up %
        │  행 선택
        ▼
그 순간의 워크북
   동기화된 라인 그래프(Ec/No·BLER·TX power) + Layers 체크박스 + Numerical Data
   + 지도(경로 + 사건 마커) + 시그널링 목록 + **디코드된 RRC 메시지 본문**
```

| 요소 | 우리 상태 |
|---|---|
| 원인 **분류·집계** | ✅ 해소 — 7개 원인(무선 링크 실패 / 약전계 / 간섭 / 셀 오버슈트 / 높은 BLER / 프론트홀 타이밍 / 처리율 열화). 레퍼런스의 `Missing neighbour`는 이웃 셀 데이터가 없어 산출 불가 |
| 파이 차트 | ✅ 해소 (`Problem Survey` 탭) |
| Drill Down 컨텍스트 메뉴 | ✅ 해소 — 조작은 동등하되 **우클릭 메뉴가 아니라 조각·행 클릭**. 기존 사용자에게 이질적일 수 있는 지점 |
| 개별 사례 그리드 | ✅ 해소 — 원인별 사례 그리드(시각·구간·심각도·값). Degradation/Coverage Issues 탭은 그대로 유지 |
| 사례 → 시각 이동 | ✅ 커서 이동 |
| 시그널링 목록 + 커서 추종 | ✅ |
| **메시지 본문 디코드** (3GPP 절 인용까지) | ◐ 2행 펼침 |
| 드릴다운 breadcrumb (좌측 세로 탭) | ◐ `Back to all categories` 1단 복귀만. 좌측 세로 탭 형태는 아님 |

## 5. VDT 구성 — S8709A 대비

`s8709a-vdt_fig2-equipment-chain.png`가 보여주는 실제 체인:

```
Nemo Tools ──Field-To-Lab Conversion──▶ UXM 5G Wireless Test Platform ──▶ PROPSIM 5G Channel Emulator ──▶ Device Under Test
(필드 캡처)                              (5G NR 네트워크 에뮬레이트)      (필드 측정 채널 조건 재현)        (자동 성능 검증, OTA 챔버)
                                                    ▲
                                          Test System PC — test case execution, analysis and reporting
```

우리 Lab Campaigns 화면은 **설정과 판정은 있으나 그 사이가 비어 있습니다.**
상태가 `QUEUED`에서 `COMPLETED`로 건너뛰고, 장비 체인·링크 상태·UE 접속 절차가 없습니다.
현실감의 공백이 여기 있습니다.

---

## 6. 남은 격차 — 세 부류로 나누어

최초 우선순위표(P0 접속/브링업·바 차트, P1 원인 분류·파라미터 검색창)는 **전부 닫혔습니다.**
갱신된 표는 §7.3에 있습니다. 남은 것을 성격별로 나누면 이렇습니다. **막힌 이유가 다르면
해결 비용도 다르므로** 한 표에 섞어 두지 않았습니다.

### (a) 데이터 모델이 막고 있는 것 — UI 작업이 아님

| 항목 | 필요한 것 |
|---|---|
| monitored set 테이블 (§2) | `sample`에 이웃 셀 measurement(PCI/RSRP/RSRQ 리스트) 추가 |
| 이웃 셀 바 차트 축 (§2) | 위와 동일 |
| `Missing neighbour` 원인 분류 (§4) | 위와 동일 |
| 서빙 셀 → *이웃* 셀 연결선 (pilot pollution 표시, §1.2) | 위와 동일. 서빙 셀 연결선은 이미 있음 |
| `5G NR Beams` 탭 (§3) | SSB 빔 인덱스별 measurement |
| 영상 동기화 재생 (§7) | 주행 영상 소스 자체가 없음 |

이 여섯 개는 화면을 그리는 문제가 아니라 **측정에 없는 값을 어디서 가져올 것인가**의 문제입니다.
지금 화면만 만들면 빈 표가 되므로 만들지 않았습니다.

### (b) 실제로 남은 UI·분석 작업

| 항목 | 규모 |
|---|---|
| KPI Workbench **노드 그래프** 빌더 (§7.3) | 큼 — 캔버스·노드·엣지·실행기 |
| 거리 구간 비닝 (§1.2) | 중 — 백엔드 집계 + 축 |
| 셀 커버리지 폴리곤 (§1.2) | 중 — `cell_ref`에 좌표·방위각은 있으나 빔폭·반경이 없음. **측정된** 서빙 샘플의 외곽으로 그리면 데이터 추가 없이 가능 |
| 대시보드 / 추세 분석 (§1.2, §1.3) | 큼 — 세션 간 집계 모델 |
| 리포트 템플릿 · 벤치마킹 리포트 (§1.4) | 중 |
| 페인별 Tools/Layers 도크, 사용자 정의 워크북 탭 (§2, §3) | 중 |
| Activity/Log 탭, 전역 필터 표시 (§2) | 작음 |
| `5G Physical Layer` 탭 (§3) | 작음 — 값은 이미 있음 |
| RACH `maximum preamble`·`preamble response` 2필드 (§3) | 작음 |
| 드릴다운 breadcrumb를 좌측 세로 탭 형태로 (§4) | 작음 |

### (c) 의도적으로 범위 밖

| 항목 | 이유 |
|---|---|
| 3D Visualizer (§1.2) | 실내 층별 시각화 — 우리 대상은 야외 주행 |
| 트랜스포트 컨트롤 record/pause/stop (§3) | 우리는 사후 분석 전용. 실시간 수집을 하지 않음 |
| 리본 UI (File/View/Tools/…) (§2) | 의도적 단순화 |
| Keysight/Nemo 로고·워드마크·브랜드 레드 | `docs/assets/NOTICE.md` — 복제 금지 |


---

## 7. 2026-08-31 보강 — 실제 VDT UI를 뒤늦게 확보

§5를 쓸 때 근거로 삼은 `s8709a-vdt_fig3-single-interface.png`는 **UI가 아니라 블록 다이어그램**이었습니다
(현재는 `s8709a-vdt_fig2-equipment-chain.png`로 개명). **진짜 Figure 3**은 S8709A 기술개요 5페이지에
있었고, 이전 추출 스크립트의 픽셀 임계값에 걸려 누락돼 있었습니다. 이번에 추출했습니다.

| 화면 | 실제 구성 | 우리 상태 |
|---|---|---|
| **`FIELD LOGS PROCESSING`** | 로그 메타(제품·측정일시·소요·거리·평균속도), UE 데이터(제조사·모델·펌웨어·칩셋), 검출 캐리어 표(Link/Technology/Cell ID/Frequency/Band), 경로 지도, DUT 측정 셀 파워 차트, **Extracted channel model** 상태, `Generate simulation` 버튼 | ⛔ 브링업 1단계 "Convert field capture to channel model" **한 줄**로 압축돼 있음. 레퍼런스는 **화면 하나를 통째로** 씀 |
| **`RUN VIEW`** | Project/Campaign 드롭다운, `Run`/`Cancel Test Case`, **Duration·Progress·Pass Rate 게이지 3개**, 테스트 케이스 그리드(시작시각·진행바·상태·판정·리포트), `Result KPI` 표(Measured value / Comparison operator / Expected value) | ◐ 판정 표는 **대응물 있음**(Acceptance criteria: KPI/Aggregate/Condition/Actual/Result). 게이지 3종과 Run/Cancel은 ⛔ |
| **`TEST EXECUTION MONITORING`** | 주행 시점 영상 + 게이지 오버레이 + 경로 지도 인셋 + 좌우 차트 카드 열 + 타임라인 커서 | ◐ 공유 시간 커서·지도·차트는 있으나 **영상 동기화 없음** |

### 7.1 셀 상태 스트립 — 접속 상태의 표준 관용구

S8709A 문서에는 셋업·연결 절차가 **한 줄도 없습니다.** 그래서 S8709A가 자기 구성요소로 지목한
UXM 5G의 문서(`S8711A`)를 확보했고, 거기서 접속 상태를 어떻게 보여주는지 확인했습니다.

```
L1 │ PCC / FDD    │ n78 │ -60   dBm/15kHz │ BW  10 MHz │ D/U 18300  │ CONNECTED
L2 │ SCC / FDD    │ n78 │       dBm/15kHz │ BW 300     │ D/U 18300  │ OFF
N1 │ NSA PCC/TDD  │ n78 │ -19.85 dBm/BW   │ BW 100 MHz │ D/U 623334 │ CONNECTED
N2 │ SA PCC / TDD │ n78 │ -19.85 dBm/BW   │ BW 100 MHz │ D/U 623334 │ OFF
```

우측 세로 액션은 `Main` / `Cell Off` / `RRC Release` / `Power Control` / `CA/HO` / `Blind Handover`,
하단 탭은 `System` / `Scheduling` / `Cell` / `PHY` / `MAC·RLC·PDCP` / `RRC·NAS` / `UE Info`입니다.

**우리 상태**: 장비 체인은 있으나 **셀 단위 상태 스트립이 없습니다.** 브링업 시퀀스가 "cell started"를
한 줄로 말할 뿐, 어느 셀이 몇 MHz로 어느 ARFCN에서 붙어 있는지는 보이지 않습니다.
`S8708A`는 같은 것을 `UE Attached` / `Calibration` 두 램프(회색→녹색)로 표시합니다.

> **정직성 경계**: `S8711A`/`S8708A`는 S8709A **자체가 아니라 같은 계열 형제 툴셋**의 문서입니다.
> S8709A가 UXM 5G를 구성요소로 명시하므로 그 UI가 랙 안에 있다는 것은 확실하지만, S8709A 운용자가
> 저 화면을 직접 조작하는지는 공개 문서로 확인되지 않았습니다.

### 7.2 문제 조사 — 2026년 판으로 갱신

`nemo-analyze_problem-survey-drilldown_1836x1123.png`(2026 판)가 §4의 2020년 UMTS 판을 대체합니다.
원인 분류가 LTE/5G 세대로 바뀌었습니다 — `Dropped RRC connection` 2.44% / `File transfer dropped`
82.93% / `Handover failure` 9.76% / `Data server connect failure` 4.88%. 드릴다운 그리드는
**`Handover type`(LTE FDD 1800 → LTE FDD 1800)과 `HOF cause`** 열을 갖고, 최종 워크북은 RSRP 트레이스
위에 **핸드오버 마커**를 찍고 `PDN CONNECTIVITY REQUEST`를 IE 단위로 디코드해 보여줍니다.

### 7.3 우선순위 갱신

| 순위 | 항목 | 근거 |
|---|---|---|
| ~~P0~~ | ~~셀 상태 스트립~~ | §7.1 — **완료** |
| ~~P0~~ | ~~바 차트~~ | §2 — **완료** (`Cells` 탭) |
| ~~P0~~ | ~~Run/Cancel + Duration·Progress·Pass Rate 게이지~~ | §7 — **완료** |
| ~~P1~~ | ~~원인 분류 → 파이 → 드릴다운~~ | §7.2 — **완료** (`Problem Survey` 탭) |
| ~~P1~~ | ~~필드→랩 변환 화면~~ | §7 — **완료** (`Field-to-Lab` 탭). 단 UE 데이터의 칩셋·펌웨어·SW 빌드는 **우리가 기록하지 않는 항목**이라 그럴듯한 값으로 채우지 않고 아예 빼놓았습니다 |
| **P1** | KPI Workbench — **노드 그래프** 빌더 | 산술식 부분집합은 구현(`Import` 화면의 Derived KPIs). Union·정렬·State Machine 노드는 미구현 |
| **P2** | 영상 동기화 재생 | §7 `TEST EXECUTION MONITORING` — 데이터 소스가 없어 보류 |

> **합격률 게이지의 규칙**: 아직 평가되지 않은 런은 `n/a`로 표시합니다. 판정을 받지 않은 런은
> 기준을 통과하지 못한 것이 아니라 아직 판단되지 않은 것이고, 0%로 쓰면 정반대로 읽힙니다.

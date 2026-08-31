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
| `s8709a-vdt_fig3-single-interface.png` | VDT 툴셋 구성 (Nemo → UXM → PROPSIM → DUT) |

---

## 1. 결론부터

**창작이 아닙니다.** 우리 Analysis 화면의 골격은 Analyze 워크북과 같은 배치입니다 —
좌측 Parameters 도크, 중앙 지도+그래프 스택, 우측 Color Legends / Numerical Data 도크,
하단 워크북 탭, 하단 상태 바. Outdoor의 START/END/CURRENT 진행 바와 임계 강조(노랑/빨강)도
같은 형태입니다.

**그러나 빠진 것이 분명히 있습니다.** 특히 세 가지는 기존 사용자가 즉시 알아챌 부류입니다.

1. **접속·RACH 계열 화면이 통째로 없음** — Outdoor는 `5G NR RACH metrics` 도크를 상시
   띄웁니다. 우리는 RACH를 이벤트 한 줄로만 표시합니다.
2. **차트 종류가 라인 하나뿐** — 레퍼런스는 같은 워크북 안에서 라인과 **바 차트**를
   나란히 씁니다. 문제 조사 화면에서는 **파이 차트**가 진입점입니다.
3. **드릴다운 연쇄가 없음** — 레퍼런스의 핵심 조작은 "원인 집계 → 개별 사례 → 그 순간"
   3단 드릴다운입니다. 우리는 각각을 별도 탭으로 나열만 합니다.

---

## 2. Analysis 화면 — Analyze 워크북 대비

| 레퍼런스 화면 요소 | 우리 상태 | 판정 |
|---|---|---|
| 좌측 Workspace 도크: Folders / Measurements / **Parameters** 3단 | Parameters 트리만, 세션은 상단 드롭다운 | ◐ 배치는 다르나 기능은 있음 |
| Parameters 트리 위의 **검색창** | **없었음 → 이번에 추가** | ✅ 해소 |
| Measurements 목록 + 검색창 | 드롭다운 | ◐ 세션이 수십 개가 되면 부족 |
| 기술별 파라미터 카테고리 트리 (AMPS/CDMA/GSM/LTE/…) | 기능별 카테고리 (Radio Quality/Throughput/…) | ✅ 동등 |
| 워크북 안에 **여러 개의 그래프 페인 스택** | 지도 1 + 라인 1 고정 | ◐ |
| 페인별 **Tools / Layers** 도크 | 없음 | ⛔ |
| 페인별 **Numerical Data** (커서 시점 값 테이블) | 있음 (우측) | ✅ |
| **Color Legends** (구간·건수·비율) | 있음 | ✅ |
| **바 차트** (`RSCP monitored set` — 셀별 막대) | 없음 | ⛔ **1.2 격차** |
| monitored set 테이블 (Ch/SC/RSCP, Ch/SC/Ec/N0) | 없음 (이웃 셀 데이터 부재) | ⛔ |
| 시간 축 가로 스크롤(팬) | 범위 필터로 대체 | ◐ |
| 하단 **Activity / Log** 탭 | 없음 | ⛔ |
| 상태 바: Ready / **No global filters** / No scheduled events / Query memory | START/END/CURRENT/세션명 | ◐ 전역 필터 표시 없음 |
| 리본 (File/View/Tools/Utilities/Commander/Layout/Graph/Help) | 단일 툴바 | ◐ 의도적 단순화 |

## 3. 접속·수집 화면 — Outdoor 대비 (**가장 큰 공백**)

Outdoor 메인 윈도우에서 직접 판독한 요소입니다.

| 레퍼런스 화면 요소 | 판독한 실제 필드 | 우리 상태 |
|---|---|---|
| **`5G NR RACH metrics` 도크** | RACH type(Contention based), RACH reason(Channel request), RACH result(Succeeded), access delay(31 ms), config(98), contention resolution, logical root sequence(106), maximum preamble, **pathloss(95.0 dB)**, preamble count(1), **preamble format(Format A2)**, preamble index(3), preamble initial power(-3.0 dBm), preamble response, preamble step, PUSCH power(0.0 dBm), **RA-RNTI(267)**, response window(10 slot), SSB ID(0), **timing advance(2)** | ⛔ 이벤트 한 줄뿐 |
| **서빙 셀 식별 테이블** | Cell type(SCG PSCell), SSB band(NR n78), SSB NR-ARFCN(633984), PCI(8), SSB GSCN(7853) | ⛔ PCI만 |
| `5G NR key parameters` 도크 + 임계 강조 | BLER 9.96% 노랑, TX power 19.4 dBm 빨강 | ✅ 동등 |
| 상단 **트랜스포트 컨트롤** (record/pause/stop) | 없음 (사후 분석 전용) | ⛔ |
| 하단 진행 바 + START/END/CURRENT | 있음 | ✅ |
| 워크북 탭 + **`+` (탭 추가)** | 고정 탭 7개 | ◐ 사용자 정의 탭 없음 |
| 탭 구성 자체 (`5G RACH and Signalling`, `5G NR Beams`, `5G Physical Layer`) | Beams·Physical Layer 탭 없음 | ⛔ |
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
| 원인 **분류·집계** | ⛔ 열화 구간은 찾지만 원인 라벨을 붙이지 않음 |
| 파이 차트 | ⛔ |
| Drill Down 컨텍스트 메뉴 | ⛔ |
| 개별 사례 그리드 | ◐ Degradation/Coverage Issues 표 |
| 사례 → 시각 이동 | ✅ 커서 이동 |
| 시그널링 목록 + 커서 추종 | ✅ |
| **메시지 본문 디코드** (3GPP 절 인용까지) | ◐ 2행 펼침 |
| 드릴다운 breadcrumb (좌측 세로 탭) | ⛔ |

## 5. VDT 구성 — S8709A 대비

`s8709a-vdt_fig3-single-interface.png`가 보여주는 실제 체인:

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

## 6. 우선순위

| 순위 | 항목 | 근거 |
|---|---|---|
| **P0** | 접속/브링업 시퀀스 + RACH 지표 + 서빙 셀 식별 | §3, §5. 기존 사용자가 상시 보던 도크가 통째로 없음 |
| **P0** | 바 차트 | §2. 레퍼런스 워크북의 두 페인 중 하나가 바 차트 |
| **P1** | 원인 분류 → 파이 → 드릴다운 연쇄 | §4. 문제 조사의 핵심 조작 |
| **P1** | 파라미터 검색창 | §2. **완료** |
| **P2** | 페인별 Layers/Tools, 사용자 정의 워크북 탭 | §2, §3 |
| **P2** | Activity/Log, 전역 필터 표시 | §2 |

이웃 셀(monitored set) 계열은 **스키마에 이웃 셀 측정이 없어서** 막혀 있습니다.
파이/드릴다운의 "Missing neighbour" 원인도 같은 이유로 지금은 산출할 수 없습니다.
이는 UI 문제가 아니라 데이터 모델 문제이므로 별도 증분으로 다룹니다.

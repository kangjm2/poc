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
>
> **2026-09-01 — 위 "방법"은 §8로 갱신됐습니다.** 이 문서는 화면 이미지만 근거로 삼아
> 썼고, 그때는 그것이 최선이었습니다(가진 매뉴얼이 절차 0건의 마케팅 자료였으므로).
> 이제 **505페이지 사용자 가이드**가 들어왔고, 이미지만으로는 알 수 없던 것들이
> 드러났습니다 — **뒤집힌 판단 넷과 하지 않기로 한 것 다섯**이 §8에 있습니다.
> §2–§4의 개별 행 중 매뉴얼로 정정된 것은 해당 행에 표시했습니다.

---

## 2. Analysis 화면 — Analyze 워크북 대비

| 레퍼런스 화면 요소 | 우리 상태 | 판정 |
|---|---|---|
| 좌측 Workspace 도크: Folders / Measurements / **Parameters** 3단 | Parameters 트리만, 세션은 상단 드롭다운 | ◐ 배치는 다르나 기능은 있음 |
| Parameters 트리 위의 **검색창** | **없었음 → 이번에 추가** | ✅ 해소 |
| Measurements 목록 + 검색창 | 드롭다운 | ◐ 세션이 수십 개가 되면 부족 |
| 기술별 파라미터 카테고리 트리 (AMPS/CDMA/GSM/LTE/…) | 기능별 카테고리 (Radio Quality/Throughput/…) | ✅ 동등 |
| 워크북 안에 **여러 개의 그래프 페인 스택** | 내장 탭은 고정, **구성 워크북은 페인을 쌓음** | ✅ **해소.** `+` 로 탭을 만들고 `+ Chart pane`/`+ Map pane` 으로 스택 |
| 페인별 **Tools / Layers** 도크 | 구성 워크북 페인마다 **Layers** 도크 | ◐ **Layers 해소** — 체크는 숨기기이지 삭제가 아님(레퍼런스와 동일). Tools(줌·마커 등)는 미구현 |
| 페인별 **Numerical Data** (커서 시점 값 테이블) | 있음 (우측) | ✅ |
| **Color Legends** (구간·건수·비율) | 있음 | ✅ |
| **바 차트** (`RSCP monitored set` — 셀별 막대) | `Monitored Set` 탭 — **커서 시점 모니터드 셋 막대**(PCI/Ch 2단 축) + `Cells` 탭의 서빙 PCI별 막대 | ✅ **축까지 해소.** 레퍼런스와 같이 *커서 순간*을 그림 — 집계가 아님. 옆 도크 표와 같은 응답에서 그려 두 패널이 어긋날 수 없음 |
| monitored set 테이블 (Ch/SC/RSCP, Ch/SC/Ec/N0) | 우측 도크 `Monitored Set` — Ch/PCI/RSRP/RSRQ/Δ | ✅ **해소** (V7 `sample_neighbour`). 레퍼런스는 RSCP·Ec/N0 두 표로 나눠 놓았지만 같은 행을 두 곳에서 읽게 되므로 한 표에 합쳤습니다. 서빙 셀은 맨 위 고정 — 0.1 dB 반올림 동률에서 순서가 뒤집히면 "단말이 쓰지 않는 셀"이 1위로 보입니다 |
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
| 워크북 탭 + **`+` (탭 추가)** | 내장 13개 + **사용자 워크북** | ✅ 해소. 서버 저장이라 새로고침·다른 브라우저·동료에게도 남습니다 |
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
| 원인 **분류·집계** | ✅ 해소 — 7개 원인(무선 링크 실패 / 약전계 / 간섭 / 셀 오버슈트 / 높은 BLER / 프론트홀 타이밍 / 처리율 열화). `Missing neighbour`는 아직 없으나 **"이웃 셀 데이터가 없어 산출 불가"라는 기존 설명은 틀렸습니다** — §6(a) 참조 |
| 파이 차트 | ✅ 해소 (`Problem Survey` 탭) |
| Drill Down 컨텍스트 메뉴 | ✅ 해소 — 조작은 동등하되 **우클릭 메뉴가 아니라 조각·행 클릭**. 기존 사용자에게 이질적일 수 있는 지점 |
| 개별 사례 그리드 | ✅ 해소 — 원인별 사례 그리드(시각·구간·심각도·값). Degradation/Coverage Issues 탭은 그대로 유지 |
| 사례 → 시각 이동 | ✅ 커서 이동 |
| 시그널링 목록 + 커서 추종 | ✅ |
| **메시지 본문 디코드** (3GPP 절 인용까지) | ◐ 2행 펼침 |
| 드릴다운 **다중 탭** (좌측, 조각 색) | ◐ `Back to all categories` 1단 복귀만 — **한 번에 한 원인**. 매뉴얼 p88에 따르면 이것은 스타일이 아니라 **여러 원인을 동시에 열어 두는 기능**입니다: *"Each drill-down … will open a **new tab** … with the **colors of the corresponding sectors**"*. §6(b)에서 규모를 올렸습니다 |

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

> **2026-09-01 갱신**: 이 목록의 네 항목이 **한 번에 닫혔습니다.** 넷 다 원인이 하나였기
> 때문입니다 — `sample`이 서빙 셀만 담았다는 것. V7이 `sample_neighbour`를 추가하면서
> monitored set 표·이웃 셀 바 차트 축·이웃 셀 연결선이 함께 열렸고, 파일럿 오염 검출이
> 새로 가능해졌습니다. **이것이 이 분류를 만든 이유입니다**: 막힌 원인이 같으면 해결도
> 같이 됩니다.

| 항목 | 필요한 것 | 상태 |
|---|---|---|
| ~~monitored set 테이블 (§2)~~ | `sample_neighbour` | ✅ V7 |
| ~~이웃 셀 바 차트 축 (§2)~~ | 위와 동일 | ✅ V7 |
| ~~서빙 셀 → *이웃* 셀 연결선 (§1.2)~~ | 위와 동일 | ✅ V7 |
| ~~`Missing neighbour` 원인 분류 (§4)~~ | ~~**설정된** 이웃 목록~~ | ⚠ **판정 철회 — (b)로 이동** |
| `5G NR Beams` 탭 (§3) | SSB 빔 인덱스별 measurement | ⛔ |
| 영상 동기화 재생 (§7) | 주행 영상 소스 자체가 없음 | ⛔ |

> **2026-09-01 정정 — `Missing neighbour`는 데이터 모델이 막고 있지 않았습니다.**
>
> 이 항목은 *"빠진 이웃 = 측정된 이웃 − 설정된 이웃 목록이고 우리는 후자가 없다"*는
> 근거로 여기 올라 있었습니다. **매뉴얼을 확보하고 나니 전제가 틀렸습니다.**
> Nemo는 설정된 이웃 목록을 쓰지 않습니다. UC27(p404)은 **측정값만으로** 판정합니다 —
> *"if Ec/N0 1. best is better than Ec/N0 best active set, the handover has not occurred."*
> 즉 `best active set − 1. best < 0`이면 더 좋은 셀이 있는데 옮겨가지 않은 것이고,
> BLER 상승과 결합해 상태 기계로 격리합니다.
>
> 필요한 두 값 — 서빙 RSRP와 최강 이웃 RSRP — 은 **V7이 이미 넣었습니다.**
> 실제로 `HO_MARGIN` 그래프로 계산해 본 적도 있습니다.
>
> **진짜로 막고 있는 것은 시드 생성기입니다.** 생성기가 매 표본 argmax를 서빙 셀로
> 고르기 때문에 조건이 성립하는 표본이 **정확히 0개**입니다 — 커밋 `9262db0`의 정합성
> 불변식 #2(*"이웃이 서빙보다 강한 표본 = 0"*)가 그것을 단언하고 통과합니다.
> 실제 망은 time-to-trigger와 히스테리시스 때문에 서빙 셀이 일시적으로 열등해지므로,
> 생성기에 그 지연을 넣으면 조건이 자연히 생깁니다.
>
> 이 분류(막힌 원인이 같으면 해결도 같이 된다)는 유효하지만, **어느 분류에 넣을지는
> 근거가 1차 자료여야 한다**는 것이 이번 교훈입니다. 이 항목은 스크린샷 판독에서 나온
> 추론이었고, 매뉴얼이 그것을 뒤집었습니다.

남은 둘은 여전히 화면을 그리는 문제가 아니라 **측정에 없는 값을 어디서 가져올 것인가**의
문제입니다 — SSB 빔 인덱스별 측정과 주행 영상은 우리 데이터에 존재하지 않습니다.

### (b) 실제로 남은 UI·분석 작업

| 항목 | 규모 |
|---|---|
| ~~KPI Workbench **노드 그래프** 빌더 (§7.3)~~ | ✅ **완료.** 캔버스·노드·엣지·CTE 컴파일러 |
| ~~거리 구간 비닝 (§1.2)~~ | ✅ **완료.** 툴바 `Distance bins` → 거리 프로파일 |
| ~~셀 커버리지 폴리곤 (§1.2)~~ | ✅ **완료.** 측정된 서빙 표본의 볼록 껍질. 예측대로 데이터 추가는 필요 없었습니다 |
| ~~사용자 정의 워크북 탭 + 페인별 Layers (§2, §3)~~ | ✅ **완료.** `+` · 페인 스택 · Layers 체크박스 · 서버 저장 |
| 대시보드 / 추세 분석 (§1.2, §1.3) | 큼 — **세션 간 집계 모델**. 둘 다 이것 하나에 막혀 있고, 만들면 벤치마킹 리포트·NPS도 같은 모델 위에 올라갑니다 |
| 리포트 템플릿 (§1.4) | 중 |
| 페인별 **Tools** 도크 (줌·마커 등) (§2) | 중 — Layers는 완료, Tools만 남음 |
| Activity/Log 탭, 전역 필터 표시 (§2) | 작음 |
| `5G Physical Layer` 탭 (§3) | 작음 — 값은 이미 있고, **구성 워크북으로 사용자가 직접 만들 수 있습니다** |
| RACH `maximum preamble`·`preamble response` 2필드 (§3) | 작음 |
| **`Missing handover` / `Missing neighbour` 원인** — 생성기에 **핸드오버 지연**을 넣어 조건이 발생하게 한 뒤 검출기 추가 | 중 — **(a)에서 이동.** 레퍼런스 대표 KPI를 우리 데이터에서 재현하는 전제 |
| 드릴다운 **다중 탭**(좌측, 조각 색) (§4) | **중** — *작음에서 상향.* 스타일이 아니라 여러 원인을 동시에 열어 두는 기능(p88) |
| **워크벤치 State machine이 레퍼런스와 다른 것** | 큼 — *중에서 상향.* 래칭만의 문제가 아닙니다. 레퍼런스 출력은 **상태 점유마다 한 행 + `time_interval`(머문 시간 ms)** 이고(p370), 그래서 **절차 지연 측정**이라는 용도가 성립합니다. 우리 것은 표본별 `CASE` — 정직한 이름은 **분류기(Classifier)** 이고 진짜 State Machine은 별도 작업입니다 |
| **Previous / Current / Next Value 상관 노드** | 중 — *신규.* *"이 드롭 **직전**의 값"*이 근본 원인 분석의 핵심 질문인데 표현할 방법이 없습니다. 매뉴얼 p349 그림의 가장 단순한 그래프조차 우리로는 만들 수 없습니다 |
| **Cell locator** (측정에서 사이트 위치·방위각 추정) | 중 — *신규.* UC21. 우리는 `cell_ref`에 **정답이 있어** 추정 오차를 검증하는 형태로 만들 수 있습니다 |
| 푸트프린트 포함 기준을 **3강 안에 든 셀**로 | 작음 — *신규.* UC1의 기준. V7 데이터로 바로 가능하고, 오버슛 판단의 실제 근거가 됩니다 |
| 거리 빈에 **40λ 옵션** | 작음 — *신규.* 지금 이름값을 못 하고 있습니다(p55) |
| 파라미터 **★ 즐겨찾기**, 사용자 KPI의 **출처 표시** | 작음 — *신규.* 레퍼런스는 사용자 KPI를 `User` 가지에 모읍니다(p83). 우리는 카테고리를 사용자가 입력해 기본 KPI와 섞입니다 |
| 임포트 **진행 큐 + 취소**, KPI 그래프 **생성 SQL 표시** | 작음 — *신규.* Activity/Log window(p213). SQL은 `validate` 응답에 **이미 있고 화면에만 없습니다** |
| 기성 워크북을 **복사해 고치기**, 레이아웃 프리셋 | 작음 — *신규.* 내장 탭의 지식을 사용자 출발점으로(p215) |
| **워크벤치가 상태 이름을 범례에 넘기지 않음** | 작음 — 화면은 넘긴다고 적어 놓고 코드가 없습니다. 문구를 내리거나 실제로 기록해야 합니다 |

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
| ~~P1~~ | ~~KPI Workbench — **노드 그래프** 빌더~~ | **완료** (`Import` 화면). 레퍼런스 워크벤치 스크린샷을 직접 판독해 설계했고 — **그 "스크린샷"의 정체는 매뉴얼 UC27의 완성 노드 그래프였습니다**(p425와 같은 내용, 다른 크롭. 처음에 "p405 상태 흐름도"라고 적었던 것은 크기 일치만 보고 내린 오판이라 철회합니다 — §8.1) — 결정적 단서는 Output 노드의 `Column count: 19`였습니다 — 그래프는 **값이 아니라 이름 붙은 열을 가진 행 집합**의 데이터플로라는 뜻이고, 그래서 수식으로는 표현할 수 없습니다. 정렬 노드는 의도적으로 없습니다 |
| ~~P0~~ | ~~이웃 셀(monitored set) 데이터 모델~~ | **완료** (V7). 막혀 있던 네 기능 중 셋이 함께 열렸습니다 |
| **P2** | 영상 동기화 재생 | §7 `TEST EXECUTION MONITORING` — 데이터 소스가 없어 보류 |

> **합격률 게이지의 규칙**: 아직 평가되지 않은 런은 `n/a`로 표시합니다. 판정을 받지 않은 런은
> 기준을 통과하지 못한 것이 아니라 아직 판단되지 않은 것이고, 0%로 쓰면 정반대로 읽힙니다.

---

## 8. 2026-09-01 보강 — 사용자 가이드 505페이지 확보

이 문서의 §1 "방법"은 **매뉴얼 기재 항목이 아니라 화면 이미지를 근거로 삼았다**고
밝히고 있습니다. 그것이 당시로서는 옳은 선택이었습니다 — 그때 가진 매뉴얼이 마케팅용
Technical Overview 12종이었고, 12개 중 11개가 **번호 붙은 절차 0건**이었기 때문입니다.
기능 목록만 있고 조작이 없는 자료로는 UI를 대조할 수 없었습니다.

**이번에 진짜 사용자 가이드가 들어왔습니다** — `NTN00000A-90013`, Edition 1, 2023-11-27,
505페이지. 각 메뉴의 설명, 입력·출력, 그리고 **Use Case 31개**가 실려 있습니다.
정리는 두 갈래로 나눴습니다.

| 위치 | 용도 |
|---|---|
| [`docs/reference/nemo-analyze-10.2/`](reference/nemo-analyze-10.2/) | **구현 작업용.** 목차·Use Case 인덱스(기계 판독), 노드 요소 전체 명세, 화면 인벤토리, 정정 목록 |
| [`docs/briefs/`](briefs/) | **분석 자료(HTML).** 메뉴 설명 + 유저 시나리오 + 우리 구현에 어떻게 반영됐는가 |

### 8.1 화면 이미지로는 알 수 없었던 것

이번에 뒤집힌 판단들에는 공통점이 있습니다. **틀린 것은 전부 "화면에 보이지 않는
것"이었습니다.**

| 판단 | 화면에서 읽을 수 있었나 | 결과 |
|---|---|---|
| 노드 그래프의 **구조** (소스→결합→연산→상태→출력) | 보임 | ✅ 정확했음 |
| 노드 **배치·연결 방향·상태 이름** | 보임 | ✅ 정확했음 |
| 빨강/초록 **색 규약** | 보임 | ✅ 정확했음 |
| State Machine의 **출력 모양** | **안 보임** | ❌ 틀림 (구간 출력 + `time_interval`) |
| Combine의 **게이팅 규칙** | **안 보임** | ❌ 틀림 (primary 개념) |
| `Missing neighbour`의 **판정 방식** | **안 보임** | ❌ 틀림 (측정값만으로 판정) |
| Lee's criteria의 **실제 수치** | **안 보임** | ❌ 틀림 (40λ) |
| 드릴다운 좌측 탭의 **의미** | 탭은 보였으나 **용도는 안 보임** | ❌ 규모 오판 |

노드가 화면 어디에 놓이는지는 그림에 있지만, 그 노드가 **무엇을 출력하는지**는 그림에
없습니다. 스크린샷 기반 분석의 한계가 정확히 거기였습니다.

### 8.2 매뉴얼을 읽고 **하지 않기로** 한 것

빼는 근거가 "귀찮아서"가 아니라 **우리 데이터 모델에서 의미가 없어서**라는 점이
중요합니다. 매뉴얼이 세 곳(p353·p375·p378)에서 반복하는 문장이 근거입니다 —
*"the Nemo measurement file format is **time-based** as opposed to sample-based (a 'sample' is
created on a timeline only when **changes occur**)"*.

| 항목 | 왜 하지 않는가 |
|---|---|
| 집계의 **`Weight by`** | 시간 가중이 필요한 이유는 Nemo 표본의 **길이가 제각각**이기 때문입니다. 우리는 1 Hz 균일이라 **가중 없는 평균이 맞습니다.** 넣으면 의미 없는 컨트롤이 됩니다 |
| **Time: Resample** | 같은 이유. 재표본화할 불규칙성이 없습니다 |
| **Sort 노드** | 정렬이 필요한 이유가 Union의 순서 파괴인데(p359) 우리는 Union이 없고 `seq` 키입니다 |
| 드릴다운 **더블클릭** 진입 | 한 번 클릭이 낫다고 판단합니다. 고칠 것은 **동시 유지** 쪽입니다 |
| MapX · Spreadsheet grid · Info views · Query clipboard | MapInfo 자산 계열이거나 우리가 다루지 않는 데이터 종류 — **범위 차이지 격차가 아닙니다** |

### 8.3 매뉴얼이 확인해 준 것

| 판단 | 매뉴얼 |
|---|---|
| 정렬 노드를 넣지 않음 | **근거까지 확인** — 정렬이 필요한 이유는 Union이 순서를 파괴하기 때문(p359) |
| 파일럿 오염에 하한 조건(`best RSRP ≥ −110`) | **우리가 더 나음** — UC20에 이 조건이 없습니다. 없으면 커버리지 홀을 오탐합니다 |
| 필터를 텍스트 조건식으로 | **우리가 더 나음** — 레퍼런스는 이진 트리라 한 노드에 자식이 둘뿐(UC26, p396) |
| 세로형 `sample_kpi` 스키마 | **구조적 우위** — 매뉴얼이 밝힌 워크벤치의 존재 이유 중 하나가 *"셋 이상 테이블의 시간 상관이 impossible"*(p332)인데, 우리는 같은 키의 조인입니다 |

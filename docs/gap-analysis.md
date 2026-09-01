# 기능 격차 분석 — Keysight 매뉴얼 및 경쟁 솔루션 대비

두 가지를 대조합니다.

1. **Keysight Nemo Analyze 기술개요(`5992-2005EN`)가 명시한 기능** 대비 현재 구현
2. **경쟁 솔루션(VIAVI, R&S, Spirent, Anritsu, Accuver, Infovista)이 공통으로 갖춘 기능** 대비 현재 구현

모든 인용은 실제로 fetch 한 1차 자료입니다. 확인하지 못한 것은 명시적으로 표기했습니다.

범례: ✅ 구현됨 · ◐ 부분 구현 · ⛔ 미구현 · ⬛ 범위 외(의도적 제외)

---

## 1. Keysight Nemo Analyze 매뉴얼 대비

기술개요 6·9·10페이지의 "Functionality of Nemo Analyze" / "key features" 목록을 그대로 대조했습니다.

### 1.1 데이터 관리

| 매뉴얼 기재 기능 | 상태 | 비고 |
|---|---|---|
| Database engine | ✅ | PostgreSQL. **Nemo Analyze도 PostgreSQL을 씁니다**(flyer `5992-2047` 확인) |
| Organizing measurement data into subsets | ◐ | 세션 단위만. 명명된 collection/폴더 없음 |
| Joining separate measurement files into a joined measurement | ⛔ | 여러 세션 병합 미지원 |
| Database filtering (technology, time, operator) | ⛔ | **미구현** — §3.1 참조 |
| Advanced data filtering and global filters | ⛔ | **미구현** — 경쟁사 공통 기능이기도 함 |
| Custom SQL queries | ◐ | REST API만. 사용자 SQL 창구 없음 |
| ODBC connectivity to third-party databases | ⛔ | |
| Log file manager (원본 로그 검색·회수) | ⛔ | 원본 파일 보관 안 함 |
| Automatable file upload / scheduled execution | ⛔ | 수동 업로드만 |
| 측정 파일 자동 압축(HDD 90% 절감) | ⛔ | 원시 행 저장. §3.3 참조 |

### 1.2 시각화

> **2026-08-31 갱신**: 셀별 바 차트와 원인별 파이 차트를 추가했습니다. 근거는
> [`ui-gap-vs-reference.md`](ui-gap-vs-reference.md) — 레퍼런스 워크북의 두 페인 중
> 하나가 바 차트이고, 문제 조사 화면의 진입점이 파이입니다.

| 매뉴얼 기재 기능 | 상태 | 비고 |
|---|---|---|
| Synchronized workbooks, pages, data views | ✅ | 공유 시간 커서 + 워크북 탭 |
| Maps / grids / line graphs | ✅ | |
| Bar graphs, pie charts, surface grids, color grids, spreadsheets | ◐ | 바 차트(서빙 셀별 + **모니터드 셋별**)·파이 차트(원인별). surface/color grid는 아직 |
| **Area binning** | ✅ | 50/150/500 m |
| **Distance binning** | ⛔ | 거리 기반(Lee's criteria) 집계 없음 |
| Base station map overlay | ✅ | 셀 마커 + 방위각 스포크 |
| **Line from terminal to serving cell** | ✅ | 커서 위치 → 서빙 셀 점선 |
| Line to *monitored* cells (pilot pollution 표시) | ✅ | **해소.** `sample_neighbour`(V7) 추가 → Mobility 지도에서 커서 시점 모니터드 셀까지 점선. 최강 셀 대비 6 dB 이내면 굵게(경합), 그 밖은 흐리게 |
| Cell footprint / service area 시각화 | ⛔ | |
| Playback of individual log files | ◐ | 커서 이동은 되나 자동 재생 없음 |
| 3D Visualizer (빔 3D) | ⬛ | 범위 외 |
| Dashboards | ⛔ | |

### 1.3 분석

| 매뉴얼 기재 기능 | 상태 | 비고 |
|---|---|---|
| Parameter statistics and benchmarking | ✅ | min/max/avg/p05/p50/p95 + CDF |
| 세션 간 벤치마킹 비교 | ✅ | 판정(BETTER/WORSE) 포함 |
| **KPI Workbench (SQL 없이 커스텀 KPI 생성)** | ✅ | **해소.** 노드 그래프 편집기 구현(`Import` 화면). 노드: KPI 소스 · **이웃 셀 소스**(N번째 강한 셀) · Combine · Expression · Filter · State machine · Output. 각 노드는 CTE 하나로 컴파일되며 결과는 `sample_kpi`에 실체화되어 다른 KPI와 완전히 동일하게 취급됩니다. **정렬 노드는 의도적으로 없음** — 우리 행 집합은 `seq` 키라 항상 정렬돼 있고, 아무 일도 하지 않는 컨트롤은 없느니만 못합니다 |
| Automated problem survey with drill-down | ✅ | **원인 분류 7종 → 파이 → 사례 그리드 → 시각 이동** 3단 연쇄 구현. 원인은 전부 기존 검출기에서 유도하며 근거 없는 원인은 만들지 않음 |
| Automated detection of common GSM/UMTS/LTE/5G NR problems | ◐ | weak coverage / interference / overshoot 3종 |
| 5G Advanced Analytics (pilot pollution, overspilling, weak coverage, bad quality, NSA neighbor list) | ◐ | weak coverage + bad quality + **pilot pollution**(경합 셀 구간 검출) + **overspilling 단서**(검출률 대비 서빙률이 낮은 셀). NSA neighbor list는 설정된 이웃 목록이 측정에 없어 여전히 불가 |
| Trend analysis | ⛔ | 세션 간 추세 없음 |
| Advanced cell reference info (drift from antenna main lobe) | ⛔ | |
| Root cause analysis | ◐ | 원인 라벨과 검출 근거(`Detected by`)를 함께 제시. L3 메시지까지 자동 연결하는 단계는 아직 |

### 1.4 리포팅·내보내기

| 매뉴얼 기재 기능 | 상태 |
|---|---|
| Data export to MapInfo / Excel / txt / Google Earth | ◐ CSV + GeoJSON |
| Statistical reporting with Microsoft Excel | ◐ 인쇄 가능한 HTML 리포트(`/report.html`) — 세션 메타 · 원인 요약 · KPI 통계 · 구간 분포. Excel 바이너리는 아님 |
| Report templates (Excel / PowerPoint / Word) | ⛔ 템플릿 디자이너 없음. 고정 레이아웃 리포트 1종만 |
| Benchmarking reports (CDR E2E voice/data) | ⛔ |
| NPS (Network Performance Score) 리포트 | ⛔ |

### 1.5 지원 범위

| 항목 | Nemo Analyze | 현재 구현 |
|---|---|---|
| 지원 기술 | 5G NR, mMIMO, GSM, GPRS, EDGE, WCDMA, HSPA+, cdmaOne, cdma2000, TETRA, TD-SCDMA, WiMAX, LTE/LTE-A CA, NB-IoT, VoLTE, ViLTE, VoWiFi | 5G NR SA 중심 |
| 입력 포맷 | Nemo 포맷, InfoVista TEMS, R&S SwissQual, EADS REMS TETRAPOL, CSV | **CSV만** |
| KPI 개수 | Nemo Outdoor 기준 **"over 4000 statistical calculations of L1-L3 radio KPIs"** 【확인됨】 | **18개** |

> KPI 4,000개는 스키마 폭의 기준점입니다. 현재 `sample_kpi`는 좁은(narrow) 스키마라 KPI 추가가
> 스키마 변경 없이 행 추가만으로 되므로 **구조적으로는 확장 가능**합니다. 부족한 것은 KPI 정의
> 카탈로그의 양이지 저장 구조가 아닙니다.

---

## 2. 경쟁 솔루션 대비

### 2.1 분석 도구 공통 기능 (table stakes)

여러 벤더에서 공통 확인된 기능 = 경쟁 진입 최소 요건.

| 기능 | 확인된 벤더 | 상태 |
|---|---|---|
| **다중 벤더 로그 임포트·정규화** | R&S CM360, Spirent Live2Lab, Accuver XCAP, Infovista TEMS Cloud, Keysight Nemo Analyze | ⛔ **가장 중요한 격차** |
| **크로스 패널 시각 동기화** | R&S, Accuver, Anritsu | ✅ |
| **L3 프로토콜 전체 디코드 + 메시지별 상세 창** | R&S, Anritsu, Accuver, Infovista | ◐ 목록 + 펼침 상세 있음, 실제 ASN.1 디코드 없음 |
| **전 필드 필터링 + 활성 필터 상태 표시** | R&S SmartAnalytics, Accuver, Infovista | ⛔ |
| **표준 KPI 라이브러리 + 사용자 정의 KPI** | R&S, Accuver, Infovista | ◐ 라이브러리만 |
| **실패 KPI 우선 드릴다운** | R&S CM360이 "primary use case"로 문서화 | ◐ 열화/이슈 목록 → 커서 이동 → L3 로그가 커서 추종. 자동 원인 지목은 없음 |
| 자동 근본원인 분석 | Infovista, Accuver, R&S | ⛔ |
| 리포트 템플릿·대시보드·추세 분석 | Accuver, Infovista, R&S | ⛔ |
| **지도 기반 지리 시각화** | Accuver, R&S ROMES, Infovista TEMS | ✅ |
| DB 기반 다중 파일 컬렉션 | R&S(SQL + OLAP cube), Accuver, Infovista | ◐ |
| 스크립팅·원격 자동화 API | R&S XLAPI, Spirent RPI, Anritsu RTD | ◐ REST만 |
| 음성·영상 품질 분석(MOS) | Accuver, R&S, Anritsu | ⛔ |
| 애플리케이션·패킷 분석 | Accuver XCAP, Anritsu MT8000A | ⛔ |

> **주목할 기회**: 조사 결과, 지도 기반 지리 시각화가 **R&S의 Field-to-Lab 워크스페이스에는 없습니다**
> (SUMMARY/SIGNALING 탭만 존재). 랩 재현 제품군에서 지도가 빠져 있는 것은 실제 공백입니다 —
> 필드 로그를 재생하는데 그 경로를 지도에서 못 보는 셈입니다.

### 2.2 VIAVI — "실제 DU + 가상 UE" 시나리오의 직접 참조 대상

VIAVI **TM500**이 이 시나리오의 사실상 표준입니다.

| TM500 확인 사양 | 출처 |
|---|---|
| 수만 대 UE 에뮬레이션, 수십 개 기지국 섹터 연결, **내부 RF 채널 모델링** | TM500 브로슈어 |
| **eCPRI로 실제 O-DU에 직접 접속, O-RU 없이** | TM500-C 데이터시트 |
| 전체 UE 스택(NAS/RRC/SDAP/PDCP/RLC/MAC/H-PHY) + 프론트홀 C/U/S/M-plane 종단 | 〃 |
| **M-plane NETCONF 서버로 동작**(SSHv2), O-RU 관리 평면을 O-DU에 대해 에뮬레이트 | 〃 |
| 10/25 GbE SFP28, C-plane section type 0/1/3, block floating point 압축, O-RU CAT A/B | 〃 |
| FPGA 내 **디지털 공간 채널 모델링**(MU-MIMO Front End) | MU-MIMO 브로슈어 |
| **O-DU 단독 검증**: TM500이 UE와 O-RU를 동시에 에뮬레이트 | 〃 |

**가장 중요한 발견** — TM500 브로슈어 원문:

> *"Upon test completion, measurements and KPIs can be viewed or exported to **third party tools for post processing and advanced analysis**."*

즉 **에뮬레이터는 데이터를 만들고 사후 분석은 외부 도구에 넘깁니다.** 이 프로젝트가 들어갈 자리가
정확히 거기입니다. 우리는 에뮬레이터를 만들 필요가 없고, **에뮬레이터가 뱉는 것을 받아 분석**하면 됩니다.

### 2.3 프론트홀 KPI — 이번에 구현한 부분

TM500이 문서화한 CUS-plane 타이밍 창 카운터는 **프론트홀 주입에만 존재하는 KPI 계열**입니다.
RF 경로에는 대응물이 없습니다 — "late"는 무선 열화가 아니라 타이밍 창 위반이기 때문입니다.

| KPI | 구현 |
|---|---|
| `RX_ON_TIME` / `RX_EARLY` / `RX_LATE` / `RX_CORRUPT` / `RX_TOTAL` | ✅ `FH_RX_*` 5종, 임계 구간 포함 |
| O-RU M-plane / S-plane sync / C-U-plane 연결 상태 | ⛔ 상태값 미모델링 |
| `RX_DUPL` (중복 수신) | ⛔ |

구현 검증 — 프론트홀 결함 구간(140초)에서:

```
CUS RX late      1100.0 pkt/s  CRITICAL
CUS RX on time     87.19 %     CRITICAL
--- 같은 시각 무선 측 ---
RSRP              -74.9 dBm    NORMAL
SS-SINR             6.0 dB     NORMAL
MAC downlink BLER  3.86 %      NORMAL
PRB utilisation    26.5 %      NORMAL
```

**무선 지표만 보면 아무 이상이 없습니다.** 결함은 프론트홀 전송에 있습니다. 이 구분이 가능하다는 것이
프론트홀 주입 시나리오를 지원한다는 말의 실질입니다.

### 2.4 에뮬레이터 측 기능 (의도적 범위 외)

아래는 경쟁 조사에서 확인되었으나 **이 프로젝트가 만들 대상이 아닙니다**. 별도 저장소에서 개발 중인
VDT 장비·소프트웨어의 영역입니다.

- O-RAN 7.2x 프론트홀 종단 / M-plane NETCONF-YANG 서버 / S-plane PTP·SyncE
- 다중 UE 프로토콜 스택 에뮬레이션(L1~L7)
- 다중경로 채널 에뮬레이션(탭별 지연·도플러·상관), AWGN·간섭 생성
- O-CU / 코어망 wrap-around 에뮬레이션
- 프론트홀 프로토콜 캡처·디코드·IQ 추출

이 문서의 데이터 모델(`channel_model`, `cell_config`, `ue_profile`, `du_endpoint`)은 **그 장비의 설정을
기록하고 결과를 분석하기 위한 것**이지 장비를 대체하지 않습니다.

---

## 3. 우선순위 권고

### 3.1 P0 — 경쟁 진입에 필수

| 항목 | 이유 |
|---|---|
| **다중 벤더 로그 임포트** | 조사 결론: *"이 파싱 계층이 반복되는 해자다. 모든 상용 제품이 갖고 있고 오픈소스는 없다."* 현실적 진입점은 **DLF**(Qualcomm Diag 원시 덤프, QCSuper가 읽고 씀). ISF는 벤더 변환 필요. Nemo `.nmf`는 **1차 출처로 확인 실패** — 추측으로 구현하지 말 것 |
| **전역 필터 + 활성 필터 표시** | 전 벤더 공통. R&S는 이것이 가능한 이유를 "로그를 파일이 아니라 쿼리 가능한 DB에 담기 때문"이라고 명시 — 우리 구조는 이미 그러함 |
| **사용자 정의 KPI (수식 기반)** | Nemo의 KPI Workbench 대응. KPI 4,000개를 따라가는 유일한 현실적 방법 |

### 3.2 P1 — 실무 워크플로 완성

- 실패 KPI → 원인 L3 메시지 자동 연결(현재는 시각 동기화까지만)
- 리포트 템플릿 / 대시보드 / 세션 간 추세
- 거리 기반 비닝(Lee's criteria)
- 여러 세션 병합·컬렉션

### 3.3 P2 — 확장

- 이웃 셀 측정 스키마 추가 → pilot pollution·overspilling·neighbor list 분석 가능해짐
- 음성/영상 품질(MOS), 애플리케이션 계층 분석
- O-RU 상태 평면(M/S/C-U) 모델링

### 3.4 데이터 규모에 대한 시사점

조사에서 확인된 수치가 저장 설계의 상한을 규정합니다.

| 사실 | 출처 | 함의 |
|---|---|---|
| Nemo Outdoor "over 4000 L1-L3 KPI 통계" | Keysight 제품 페이지 | KPI 카탈로그가 수천 규모 |
| **랩탑 1대당 최대 60대 단말**(NBM), 백팩 18대 | 〃 | 수집 노드당 18~60배 병렬 스트림 |
| **8CC × 4×4 MIMO** | flyer `5992-2057` | 논리 KPI 1개가 캐리어·레이어별로 수십 개 시리즈로 팽창 — 카디널리티의 실질적 동인 |
| 스캐너 **최대 50 Hz**, 측정 순간마다 다수 셀·빔 | R&S TSMx 페이지 | 초당 행 수 ≫ 50 |
| I/Q 연속 스트리밍 100 MHz × 20-bit | 〃 | 분당 기가바이트 — **별도 범위로 분리해야 함** |
| PostgreSQL 문서: 파티션은 **"수천 개까지"** 가 실용 한계, `DROP`/`DETACH`가 대량 삭제보다 훨씬 빠름 | PostgreSQL 공식 문서 | 보존 정책이 필요해지면 `RANGE(ts)` 전환 근거 |
| **Nemo Analyze 자체가 PostgreSQL 기반** | flyer `5992-2047` | 전용 TSDB가 필수가 아님을 시장 선도 제품이 입증 |

> 마지막 항목이 중요합니다. 시장 1위 제품이 특수 시계열 DB가 아니라 **평범한 PostgreSQL**을
> 선택했습니다. 현재 설계(PostgreSQL + 파티셔닝 + DB 측 집계)는 그 선례와 같은 선상에 있으며,
> 200 device-hours / 940만 행에서 모든 응답이 100 ms 이내임을 측정으로 확인했습니다
> (`architecture-and-scale.md` §3.4).

---

## 4. 조사 중 반증된 항목 (인용 금지)

사실 검증 단계에서 근거가 무너진 주장들입니다. 재조사 시 반복하지 않기 위해 기록합니다.

| 주장 | 왜 틀렸나 |
|---|---|
| Nemo의 네이티브 확장자가 `.nmf` | 인용된 GitHub 저장소는 Nemo의 **CSV 내보내기**를 파싱하는 도구이며 `.nmf`를 언급하지 않음. 여전히 **미확인** |
| TimescaleDB가 InfluxDB 대비 디스크 50배, ClickHouse 대비 20배 | 인용 기사에 그런 수치가 없음. 정성적 서술만 존재 |
| Nemo `.nmf`와 TEMS `.log`는 상호 변환 불가 | 인용 호스트(`ftp.actix.com`)가 **DNS에서 존재하지 않음** |
| QCSuper가 PCAP를 생성하지 못함 | 반대. 인용 문서가 PCAP 생성을 QXDM 대비 차별점으로 명시 |
| VIAVI가 2024년 Spirent에서 채널 에뮬레이션 라인을 인수 | 근거 없음 (실제 Spirent 자산 인수는 2025-10, 대상이 다름) |

---

## 5. 2026-08-30 검토 라운드 — 반영·보류 기록

방향성(기존 Keysight 사용자 대상 분석 기능 패리티 + 추가 인사이트)을 기준으로 전체 구현을
3개 독립 리뷰(요구사항 패리티 / 시나리오 커버리지 / UI 도달성)로 재점검하고, 아래와 같이
반영했습니다. 시나리오 단위 E2E 검증은 `scripts/verify-scenarios.mjs`(49단계)로 상시 재실행됩니다.

### 5.1 이번 라운드에 닫은 항목

| 항목 | 내용 |
|---|---|
| 선택 KPI 시계열 차트 | 사전 로드 6종 외 KPI(프론트홀 포함 12종)는 차트가 조용히 사라졌음 → 선택 시 온디맨드로 시리즈 로드 |
| **Fronthaul 워크북** | CUS RX late/on-time을 처리량·RSRP 위에 겹쳐 보는 전용 페이지. 프론트홀 카운터가 없는 세션에는 이유를 설명하는 빈 상태 표시 |
| 프론트홀 게이트 판정 | 시드 캠페인에 FH_RX_ON_TIME/FH_RX_LATE 기준이 걸린 런 추가 — 무선 기준 PASS + 프론트홀 기준 FAIL이라는, RF 전용 도구가 낼 수 없는 판정을 시연 |
| 결함 구간 재배치 | 주입 결함(기존 seq 380–520)이 리플레이 채널의 딥페이드와 겹쳐 "무선은 정상" 서사가 거짓이었음 → RF가 깨끗한 seq 885–985로 이동하고, 늦게 도착한 데이터를 DU가 폐기하는 물리(처리량·PRB 하락)를 결합 |
| 전역 범위 필터 (P0 일부) | fromSeq/toSeq가 통계·범례(분포)·열화 목록에 적용, 활성 필터는 칩으로 상시 표시. 상태바 "From here / To here"로 커서 위치에서 지정 |
| 세션 삭제 | DELETE /api/sessions/{id} + 툴바 버튼(확인 대화상자). sample_kpi는 FK가 없어 명시 삭제, 랩 런은 구성 유지(session_id NULL) |
| 랩 런 → 세션 드릴스루 | 실패한 런에서 "Open session N in Analysis"로 해당 측정 데이터로 즉시 이동 |
| Compare CDF 오버레이 | 백엔드가 이미 반환하던 양측 CDF를 한 축에 겹쳐 그림. 행 클릭으로 KPI 전환. NO DATA 판정 신설(한쪽에 KPI가 없으면 SAME이 아니라 NO DATA) |
| 커서 디시메이션 버그 | 차트 판독값·지도 커서가 정확히 일치하는 seq만 찾아 대용량(디시메이션된) 세션에서 멈췄음 → 커서 이하 최근접 표본으로 수정 |
| 재생(playback) | 상태바 ▶로 커서가 드라이브를 자동 소거 — 그리드·차트·지도가 함께 움직임 |
| 셀 정보 테이블 (FR-32) | Mobility 워크북에 PCI/타입/밴드/ARFCN/GSCN/방위각 테이블, 서빙 셀 강조 |
| 세션 노트 표기 | 시드가 담아둔 워크플로 힌트(예: 결함 시각)가 백엔드에만 있었음 → 분석 화면 상단에 표시 |
| 임포트 헤더 동의어 | 표시명 헤더("RSRP (NR SpCell)" 등)를 대소문자·문장부호 무시하고 내부 KPI로 매핑 — 타 도구 CSV 수용 |
| 오류 UX | Evaluate 실패 본문 메시지 전달, 오류 배너 닫기 버튼 |
| kpi_rollup 제거 | 쓰인 적 없는 사전집계 테이블을 V3 마이그레이션으로 삭제 (측정상 직접 집계로 충분) |
| 과대표기 정정 | FR-17(바 차트)·FR-33(RACH 그리드)을 ✅에서 실제 상태로 정정 |

### 5.2 보류 (다음 증분, 사유 포함)

| 항목 | 사유 |
|---|---|
| ~~사용자 정의 KPI 생성 (P0)~~ | **2026-08-30 완료 — §5.5**. 남은 것은 **파생 수식**(기존 KPI로 계산되는 KPI)뿐 |
| 벤더 바이너리 로그 인제스트 (DLF 등) | 대형. 헤더 동의어 매핑으로 CSV 경로는 확보 — 바이너리 파서는 별도 증분 |
| 랩 런 생성·시작 UI + 실행기 | POST /lab/runs, /runs/{id}/start는 있으나 UI 없음. 실제 장비 연동 스텁 설계와 함께 진행해야 의미 있음 |
| ~~임계값 편집 UI (NEW-03)~~ | **2026-08-30 완료** — §5.3 참조 |
| 빌드 간 추이(trend) 뷰 | 캠페인 모델이 이미 지원. Compare가 2개 세션을 넘어 N개 런 추이로 확장되는 형태 |
| 세션 선택기 검색·그룹핑 | 임포트 누적 시 필요. 현재 시드 규모에서는 병목 아님 |
| 히스토그램·셀별 바 차트 (FR-17/18 잔여) | CDF·오버레이가 먼저 자리를 잡음. 분포 뷰 계열로 후속 |
| RACH 상세 그리드 (FR-33) | RACH KPI 카탈로그 추가(접속 지연·프리앰블 카운트·TA 등)가 선행 |


### 5.3 임계값 편집 UI (NEW-03) — 2026-08-30 완료

범례가 이 제품 시각 언어의 전부를 좌우하므로(지도 색상, 셀 강조, 범례 통계, 열화 탐지가 모두
`kpi_threshold`에서 파생), 사용자가 자기 기준으로 스케일을 고칠 수 있어야 패리티가 완성됩니다.

**착수하자마자 드러난 사실: PUT 엔드포인트는 한 번도 동작한 적이 없었습니다.**
`getThresholds().clear()` 후 새 행을 추가하면 Hibernate가 삭제보다 삽입을 먼저 내보내
`(kpi_name, ordinal)` 유니크 인덱스를 위반합니다 — **모든 호출이 500으로 실패**했습니다.
이전 라운드에서 "엔드포인트는 있고 UI만 없다"고 적었던 것이 실제로는 "엔드포인트도 없었다"였고,
호출하는 뷰가 없으니 아무도 몰랐던 것입니다. `api-surface.mjs`가 잡는 격차가 "쓰이지 않는 코드"인
이유가 여기 있습니다 — 쓰이지 않는 코드는 **틀려도 아무도 모릅니다**.

| 반영 | 내용 |
|---|---|
| 쓰기 경로 수정 | 기존 행을 먼저 삭제·flush한 뒤 삽입 |
| 입력 검증 신설 | `ThresholdScale.validate()` — 2~12개 구간, 첫 구간은 -∞ 개방·마지막은 +∞ 개방, **인접 구간이 반드시 맞닿을 것**, 심각도는 NORMAL/WARNING/CRITICAL 폐쇄 어휘, 색상은 `#RRGGBB` |
| 라벨 서버 파생 | 비워 보내면 참조 도구 표기(`>= -80`, `< -80 and >= -90`)로 생성 — 경계와 라벨이 영원히 어긋나지 않음 |
| 기본값 복원 | `POST /{name}/thresholds/reset` — 실험이 막다른 길이 되지 않게 |
| 편집 UI | 범례 패널의 `Edit scale` → 모달. **구간이 아니라 경계를 편집**하는 사다리 방식이라 빈틈·중첩이 표현 불가능. 참조 도구 4색 팔레트 프리셋 + 자유 색상 선택, 심각도 드롭다운, 실시간 라벨 미리보기 |
| 저장 후 재도색 | `scaleVersion` 증가로 지도 트랙·범례·열화·스냅샷 심각도·영역 비닝이 함께 갱신 |

**왜 "경계 편집"인가**: 자유 구간 편집을 허용하면 값이 어느 구간에도 속하지 않을 수 있고, 그 증상은
**경로가 조용히 회색으로 변하는 것**뿐입니다. 사용자가 원인을 추적할 방법이 없습니다. 경계만 편집하게
하면 그 상태 자체가 표현 불가능해집니다.

**검증**: 시나리오 S9(8단계) 신설 — 편집기 열기 → 역순 경계 입력 시 저장 차단 확인 → 유효 편집 →
범례 라벨·구간 통계·열화 탐지가 모두 새 스케일을 반영하는지 확인 → 기본값 복원.
재도색 의존성을 제거하는 결함 주입으로 **단언이 실제로 실패함을 증명**한 뒤 복원했습니다
(`docs/ui-testing/README.md`의 규칙 1).


### 5.4 임계값 없는 KPI의 자동 비닝 (A1 + A21) — 2026-08-30 완료

P0 "사용자 정의 KPI"의 선행 게이트였습니다. 착수하자마자 드러난 사실:
**임계값이 없는 KPI는 지도·범례가 500을 반환**했습니다. 생성되는 `CASE` 식에 `WHEN` 가지가
하나도 없어 `CASE ELSE -1 END`가 되는데, 이것은 PostgreSQL 구문 오류입니다. 즉 P0을 그대로
착수했다면 첫 화면에서 죽었을 것입니다.

**A21 먼저 — `direction`만으로는 부족합니다.** 18개 KPI를 분류해 보니 `direction`이 두 가지를
뒤섞고 있었습니다: (1) 램프의 어느 끝이 "좋음"인가, (2) **애초에 좋은 끝이 있는가**.
`FH_RX_TOTAL`(패킷 수)과 `DU_ACTIVE_UES`(접속 단말 수)는 HIGHER_IS_BETTER로 표기돼 있었지만,
패킷이 많다고 좋은 것도 30대가 붙었다고 1대보다 30배 좋은 것도 아닙니다. 이들에 상태 램프
(녹→적)를 씌우면 **측정이 하지 않은 판단을 시각적으로 주장**하게 됩니다.
→ 세 번째 값 **NEUTRAL** 도입, 두 KPI에 적용. 비교 판정은 `NO VERDICT`로 분리했습니다.

**A1 설계 — 세 가지 결정이 산술보다 중요합니다.**

| 결정 | 이유 |
|---|---|
| 스케일은 **세션 전체**에서 도출, 필터 구간에서 도출하지 않음 | 부분집합의 분위수는 필터를 움직일 때마다 경계가 따라 움직입니다. 같은 값이 필터에 따라 색이 바뀌면 두 구간을 비교할 수 없습니다. **필터는 건수를 바꾸되 스케일을 바꾸면 안 됩니다** |
| 파생 구간의 심각도는 **전부 NORMAL** | 분위수는 "이 주행 안에서 어디쯤"이지 "이것은 나쁘다"가 아닙니다. 전 구간이 우수한 주행에서도 하위 25%는 존재합니다. 근거 없는 경보를 만들지 않습니다 |
| 램프는 `direction`이 결정 | HIGHER/LOWER는 확인된 상태 램프를 방향에 맞춰, NEUTRAL은 **단일 색조 순차 램프**(명도 단조, 인접 CVD ΔE≥13). 범례의 수치 열이 최저 명도 단계의 대비를 보완합니다 |

**경계 반올림** — 원 분위수는 `-93.7421` 같은 값이라 범례가 읽히지 않습니다. 1-2-5 사다리로
스냅하되, **스텝을 사다리 내 최소 간격의 절반**에서 취합니다. 이렇게 하면 반올림 이동량이
최소 간격의 1/4을 넘지 못해 (a) 경계가 서로를 추월하거나 합쳐질 수 없고, (b) 경계가 데이터
최댓값을 넘어갈 수 없습니다. 첫 구현은 전체 범위 기준 스텝을 써서 **최상위 구간이 0.00%로
비는** 결과를 냈습니다 — 채워질 수 없는 구간은 범례의 1/4과 램프의 한 단계를 낭비합니다.

**측정 (200 device-hours, 13M KPI 행, 4 GB 테이블)**

| 엔드포인트 | 고정 스케일 | 파생 스케일 | 차이 |
|---|---|---|---|
| `distribution` | 30.5 ms | 51.8 ms | +21 ms |
| `track?maxPoints=4000` | 114 ms | 129 ms | +15 ms |

파생 비용은 요청당 **15~21 ms**로 1.5초 예산의 1.4% 미만입니다. **캐시가 필요 없습니다** —
어젠다가 열어둔 성능 질문의 답입니다.

**UX 정직성** — 자동 스케일은 고정 스케일과 화면상 구별되지 않지만 의미가 전혀 다릅니다
(주행을 자기 자신과 비교한 순위이므로, 같은 값이 다른 주행에서는 다른 색). 범례에
`Auto scale — quartiles of this session, no pass/fail implied`를 명시합니다.

**루프 완성** — 자동 스케일이 제안하고, `Edit scale`(파생 구간으로 미리 채워짐) → Save로
고정하고, `Use auto scale`(DELETE)로 다시 놓아줍니다.

**검증**: 시나리오 S10(9단계) — 응답 여부, derived 표기, 모든 구간이 표본을 가질 것,
분위수 균형, 경계가 반올림되어 있을 것, **필터가 경계를 움직이지 않을 것**, 심각도 미주장,
범례 고지 표시, 편집기 사전 채움.


### 5.5 사용자 정의 KPI와 무손실 임포트 (P0) — 2026-08-30 완료

§5.4가 게이트를 걷어낸 직후의 본체 작업입니다. 카탈로그가 시드 18종으로 고정되어 있어,
**임포트 시 그 밖의 컬럼은 전부 버려지고 이름만 결과에 나열**되었습니다. 타깃이 "기존 도구
사용자"인데 그들의 파일에는 우리가 모르는 컬럼이 반드시 있습니다.

| 반영 | 내용 |
|---|---|
| `POST /api/kpi-definitions` | 이름은 `sample_kpi` 조인 키이자 생성 SQL에 들어가므로 `[A-Z][A-Z0-9_]*` 엄격 검증. direction/source 폐쇄 어휘, decimals 0~4, 길이 상한. 임계값은 비워서 생성 → §5.4의 자동 스케일이 즉시 칠함 |
| 임포트 옵션 `createUnknownColumns` | 미인식 컬럼마다 KPI를 정의하고 같은 패스에서 값까지 적재. **기본값은 꺼짐** — 조용히 카탈로그를 늘리지 않고 사용자가 선택하게 함 |
| direction 기본값 = **NEUTRAL** | 모르는 컬럼이 "높을수록 좋은지" 알 수 없습니다. 추측하면 판단이 없는 데이터에 녹→적 판단을 씌우게 됩니다(§5.4 A21과 같은 원칙) |
| decimals 자동 보정 | 적재 중 실제 값의 소수 자릿수를 관측해 정의를 갱신. 정수 컬럼이 `13.00`으로 보이는 거짓 정밀도, 0.001 단위가 반올림돼 평평해지는 문제를 함께 막습니다 |
| 단위 추출 | `Custom margin (dB)` 같은 관례적 괄호 표기에서 단위를 분리 |
| `DELETE /api/kpi-definitions/{name}` | 오타 헤더로 생긴 KPI가 카탈로그에 영구히 남지 않도록. 값도 함께 지우고 건수를 보고합니다. **시드 KPI는 거부** — 화면들이 이름으로 참조하므로 |
| `seeded` 플래그 | 편집기가 시드 KPI에는 `Reset to default`를, 사용자 정의 KPI에는 `Delete KPI`를 보이도록 |

**부수로 잡은 결함**: 임포트가 KPI를 정의해도 **파라미터 트리가 갱신되지 않았습니다** — 앱이
카탈로그를 최초 마운트에서만 읽었기 때문입니다. 사용자가 방금 살리기로 선택한 컬럼이 화면에
보이지 않는 상태였고, S11이 이것을 잡았습니다.

**검증**: 시나리오 S11(9단계) — 기본값에서 컬럼이 버려지는 것 확인 → 옵션을 켜면 정의됨 →
NEUTRAL·소수 자릿수·단위 확인 → 트리 등장 → 신규 KPI가 자동 스케일로 지도를 칠함 →
시드 KPI 삭제 거부(400) → 편집기 버튼 분기 → 삭제로 카탈로그에서 제거. 스위트를 **연속 두 번
실행해 잔여물 0**임을 확인했습니다.

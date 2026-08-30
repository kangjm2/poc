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

| 매뉴얼 기재 기능 | 상태 | 비고 |
|---|---|---|
| Synchronized workbooks, pages, data views | ✅ | 공유 시간 커서 + 워크북 탭 |
| Maps / grids / line graphs | ✅ | |
| Bar graphs, pie charts, surface grids, color grids, spreadsheets | ⛔ | 라인·그리드·지도만 |
| **Area binning** | ✅ | 50/150/500 m |
| **Distance binning** | ⛔ | 거리 기반(Lee's criteria) 집계 없음 |
| Base station map overlay | ✅ | 셀 마커 + 방위각 스포크 |
| **Line from terminal to serving cell** | ✅ | 커서 위치 → 서빙 셀 점선 |
| Line to *monitored* cells (pilot pollution 표시) | ⛔ | 이웃 셀 측정값이 스키마에 없음 |
| Cell footprint / service area 시각화 | ⛔ | |
| Playback of individual log files | ◐ | 커서 이동은 되나 자동 재생 없음 |
| 3D Visualizer (빔 3D) | ⬛ | 범위 외 |
| Dashboards | ⛔ | |

### 1.3 분석

| 매뉴얼 기재 기능 | 상태 | 비고 |
|---|---|---|
| Parameter statistics and benchmarking | ✅ | min/max/avg/p05/p50/p95 + CDF |
| 세션 간 벤치마킹 비교 | ✅ | 판정(BETTER/WORSE) 포함 |
| **KPI Workbench (SQL 없이 커스텀 KPI 생성)** | ⛔ | **가장 큰 단일 격차.** §3.2 |
| Automated problem survey with drill-down | ◐ | 열화 구간·커버리지 이슈 탐지 → 커서 이동은 되나 "실패 KPI → 원인 L3 메시지" 자동 연결은 부분 |
| Automated detection of common GSM/UMTS/LTE/5G NR problems | ◐ | weak coverage / interference / overshoot 3종 |
| 5G Advanced Analytics (pilot pollution, overspilling, weak coverage, bad quality, NSA neighbor list) | ◐ | weak coverage + bad quality 상당. **pilot pollution·overspilling·neighbor list는 이웃 셀 데이터 부재로 불가** |
| Trend analysis | ⛔ | 세션 간 추세 없음 |
| Advanced cell reference info (drift from antenna main lobe) | ⛔ | |
| Root cause analysis | ⛔ | 문제 탐지는 하나 원인 지목은 안 함 |

### 1.4 리포팅·내보내기

| 매뉴얼 기재 기능 | 상태 |
|---|---|
| Data export to MapInfo / Excel / txt / Google Earth | ◐ CSV + GeoJSON |
| Statistical reporting with Microsoft Excel | ⛔ |
| Report templates (Excel / PowerPoint / Word) | ⛔ |
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

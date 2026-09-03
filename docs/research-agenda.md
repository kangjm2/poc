# 추가 리서치 어젠다

작성일: 2026-08-30 · 방식: 3각 스윕(저장소 미해결 스레드 / 도메인·경쟁 지형 / FE 테스트 생태계)
후 중복 제거·반증 재개 차단(§4 대조)·완결성 크리틱을 거친 랭킹. 28건 후보 → 19건 확정 + 방법론 트랙 9건. *2026-09-03: 그 뒤 A20·A21이 더해져 제품 항목은 **A1–A21**입니다.*

각 항목은 (1) 아직 답이 없는 질문인지 기존 문서와 대조했고, (2) 답을 얻는 구체적 방법(출처·실험)을 명시하며,
(3) `docs/gap-analysis.md` §4의 반증된 주장을 재인용하지 않습니다.

## A. 제품 리서치 어젠다 (우선순위순)

### A1. 임계값 없는 KPI의 자동 비닝 설계 — P0 사용자 정의 KPI의 게이트  ·  수익 상 / 노력 중 / visualization

**질문** — 임계값이 정의되지 않은(사용자 생성·미지 컬럼) KPI를 지도·범례에 그릴 때 등간격/분위수/Jenks 중 무엇이 적합하고, 현재 DB 집계 경로(percentile_cont 단일 패스)에서 200 device-hours 규모에 몇 ms에 계산되며, 커서·필터 변경 시 구간이 요동하지 않는가?

**왜 지금** — gap §5.2 첫 행이 P0 '사용자 정의 KPI'와 '미지 컬럼 자동 KPI 생성' 모두 이 설계에 종속된다고 명시 — 이것이 풀려야 P0 착수 가능. '범례가 곧 통계'라는 제품 정체성(NEW-04)과 충돌하지 않아야 함.

**방법** — (1) 지도학 표준 분류법(quantile/Jenks/equal-interval) 특성은 GIS 표준 문헌으로 확정. (2) 이 저장소에서 실측: 임계값 행을 임시 제거한 KPI(예: FH 카운터)에 percentile_cont 기반 분위수 5구간을 DB에서 생성, load-test.sh 25 규모에서 응답 시간과 범례 안정성(커서·범위 필터 변경 시 구간 요동) 측정. (3) assets/nemo-analyze_kpi-workbench.png 재판독으로 Nemo의 처리 방식 단서 확인.

### A2. .nmf 실증 종결 — 경쟁사 1차 문서와 공식 스펙 경로만 사용  ·  수익 상 / 노력 소 / log-format-interop

**질문** — Nemo 로그 포맷에 대해 아직 시도하지 않은 1차 출처로 무엇이 확정되는가: (a) Spirent Live2Lab VDT-CT 데이터시트의 'Anite Nemo' 입력 지원 표기, (b) TEMS Discovery 릴리스 노트의 'NEMO file format version 2.53' 지원 서술과 .nmf/.mrk/.tab 언급, (c) update.nemo.fi 공개 디렉터리의 File Manager·릴리스 노트 PDF, (d) Keysight 리터러처/dam URL 경로의 공식 'Nemo File Format' 스펙 문서 번호·배포 조건. 임포터 범위를 정할 만큼의 구조 정보가 나오는가, 아니면 확정적 dead end인가?

**왜 지금** — 다중 벤더 로그 임포트가 선언된 P0 해자이고 타깃이 기존 Keysight 사용자이므로 과거 로그 판독이 최대 전환 유인. §4가 추측 구현을 금지했으므로 1차 출처로만 종결해야 하며, 부정적 답이라도 P0 노력을 DLF/AZQ로 확신 있게 재배정하는 가치가 있음. 텍스트 포맷으로 판명되면 gap §5.2 '벤더 바이너리 인제스트' 증분이 대형에서 중형으로 축소.

**방법** — Spirent CDN(assets.ctfassets.net, URL 생존 확인됨)에서 Live2Lab VDT-CT 데이터시트 fetch; Ascom TEMS Discovery 데이터시트·릴리스 노트 포맷 표 교차 확인; update.nemo.fi를 curl로 크롤링(디렉터리 브라우징 불가 확인됨 — 경로 추측만); Keysight 리터러처 검색으로 스펙 문서 번호 확인. 모든 언급을 확인됨/추정 규약으로 기록. 금지: §4 반증 출처(.nmf 무관 GitHub CSV 파서, ftp.actix.com) 및 PDFCoffee류 무단 미러 재인용.

### A3. 3GPP SA5 KPI 카탈로그(TS 28.554/28.552, 32.450/32.425)를 사용자 정의 KPI 기본값으로  ·  수익 상 / 노력 중 / kpi-catalog

**질문** — SA5 관리 규격이 표준화한 accessibility/mobility/retainability/DRB 처리량 공식 중 어떤 것이 이 저장소의 signaling_message + network_event + sample 테이블만으로 계산 가능하고(UE 측 로그만으로), 어떤 것이 TS 28.552 망측 카운터를 요구하는가? 보류 중인 P0 사용자 정의 KPI가 'per TS 28.554 §6.x' 인용 기본값 카탈로그를 탑재해야 하는가?

**왜 지금** — 연구문서 §6.4의 【확인됨】('3GPP가 정의한 양이 아니다')은 RAN 규격(TS 38.215) 기준의 서술로, SA5 관리 규격의 참조 공식 존재를 검토하지 않았음 — 사실이면 뉘앙스 정정 필요. 표준 인용 기본값은 운영사의 '누구 공식인가' 분쟁을 선제 차단하고 4,000-KPI 카탈로그 격차의 구체적 첫걸음이 됨(하드코딩 금지 원칙 유지, 기본값이 표준 인용이 될 뿐).

**방법** — ETSI 공개 PDF 경로(연구문서 §11.1.4와 동일 방식)로 TS 28.554/28.552(+LTE 32.450/32.425) fetch; 각 KPI 공식과 입력 카운터를 열거하고 '지금 계산 가능/새 이벤트 타입 필요/범위 외'로 분류; kpi_definition 시드 목록(규격 절 번호 포함)을 산출하고 §6.4를 정정·보강.

### A4. FH_RX_* 카운터를 O-RAN WG4 M-plane YANG에 정합  ·  수익 상 / 노력 소 / fronthaul-oran

**질문** — O-RAN.WG4.MP.0의 o-ran-performance-management YANG이 정의하는 수신창 카운터(rx-on-time/early/late/corrupt/duplicate/total, TX측, transport-flow granularity, ecpri-delay·transceiver 그룹)와 o-ran-sync.yang의 S-plane 상태값(LOCKED/HOLDOVER 등)의 정확한 목록·의미는 무엇이며, 현재 FH_RX_* 5종의 명명·의미·집계 창과 정확히 일치하는가? 미구현 RX_DUPL과 P2 'O-RU 상태 평면'이 예약해야 할 표준 카운터 패밀리는?

**왜 지금** — 프론트홀 KPI는 이 제품의 차별점인데 현재 근거가 TM500 브로슈어(벤더 마케팅 자료)임. 표준 YANG 정합이 되면 어떤 벤더의 O-RU/DU M-plane PM 파일에도 통하는 분석이 되고, gap §2.3 미구현 2종의 스키마를 추측 없이 설계하며, 영업 자료에서 'O-RAN 표준 카운터 준거'를 말할 수 있음.

**방법** — o-ran-sc Gerrit(공개 접근 확인됨)에서 o-ran-performance-management.yang, o-ran-sync.yang, o-ran-interfaces.yang fetch + O-RAN.WG4.MP.0 공개 미러 PDF와 O-RAN SC 위키 'O-RU File-based PM' 페이지 교차; measurement-group/counter 정의를 전수 추출해 kpi_definition의 FH_RX_* 5종 대응표 작성; S-plane enum을 gap §3.4 P2 컬럼 설계에 직결.

### A5. AZQ .azm — 공개 문서화된 포맷으로 첫 실물 벤더 임포터  ·  수익 상 / 노력 중 / log-format-interop

**질문** — Azenqos .azm(zip 내 SQLite azqdata.db, 공개 테이블·파라미터 스키마, PostgreSQL 타깃 오픈소스 임포터 azm_db_merge 존재)의 테이블(signalling, lte_cell_meas, NR 대응, events)이 measurement_session/sample/sample_kpi/signaling_message 모델에 얼마나 매핑되는가? 재사용 라이선스는 무엇이고 테스트 픽스처용 샘플 .azm은 자유롭게 받을 수 있는가?

**왜 지금** — gap §3.1 P0의 '오픈소스는 없다' 단정에 대한 미검증 반례. 성공하면 CSV 동의어(§5.1)를 넘는 첫 진짜 다중 벤더 바이너리 인제스트가 되고, lte_cell_meas가 이웃 셀 측정을 담고 있어 P2 pilot pollution/overspilling 분석을 막는 바로 그 데이터 격차를 함께 푼다.

**방법** — github.com/freewillfx-azenqos/azm_db_merge README(.azm=zip+SQLite 문서화)와 LICENSE 확인; azenqos_qgis_plugin/preprocess_azm.py의 스키마 처리 판독; sites.google.com/azenqos.com 공개 파라미터 스프레드시트 fetch; 샘플 .azm 확보 후 테이블-컬럼 단위로 우리 스키마 호환성 매트릭스 작성.

### A6. Nemo Analyze PostgreSQL DB 직접 마이그레이션 가능성  ·  수익 상 / 노력 중 / log-format-interop

**질문** — 기존 사용자의 Nemo Analyze 로컬 PostgreSQL DB에 직접 접속해 측정 데이터를 읽어올 수 있는가 — 접속 정보·스키마가 사용자에게 노출되는가, ODBC 커넥터 문서가 뷰/테이블을 열거하는가?

**왜 지금** — 타깃이 기존 Keysight 사용자이므로 수년치 과거 데이터가 Nemo Analyze DB에 있음. 파일 임포트와 별개로 DB 직접 읽기가 되면 전환 비용이 극적으로 하락 — 연구문서 §10.2#6이 열어둔 질문의 제품 지향적 재구성이며, 같은 PostgreSQL(gap §3.4 확인)이라는 점이 기술적 실현 가능성을 시사.

**방법** — (1) 설치 안내·릴리스 노트·기술개요(보관본 5992-2005EN 21p 전문 재정독)에서 DB 구성(포트·인증·ODBC connectivity) 단서 추출. (2) ODBC 드라이버 문서·포럼의 스키마 언급 수집(2차 출처는 【추정】 표기). (3) 결정적: VDT 장비 개발 조직이므로 사내 Nemo 라이선스 보유를 확인하고, 있으면 자사 데이터의 information_schema를 직접 열람(적법) — 유일하게 【확인됨】 등급을 만드는 단계.

### A7. 실물 DU 카운터 어휘 — srsRAN/OAI/O-DU-high + E2SM-KPM 정합  ·  수익 상 / 노력 중 / lab-integration

**질문** — 현재 창작된 이름인 DU_* KPI 3종(DU_PRB_UTILISATION 등)에 대해, 현실적으로 접근 가능한 DU들이 실제로 내보내는 메트릭 이름·단위·주기·전송 스키마(srsRAN metrics JSON/InfluxDB, OAI telemetry, O-RAN SC O-DU-high)와 O-RAN WG3 E2SM-KPM 표준 측정명은 무엇이며, 보류된 랩 런 실행기의 최소 비용 연동 타깃은 어느 DU인가? ZMQ RF-less 모드로 라이브 스트림 인제스트가 되는가?

**왜 지금** — '가상 UE + 실제 DU' 캠페인 스토리 뒤에 실물 DU가 없음 — gap §5.2가 실행기를 '실제 장비 연동 스텁 설계와 함께'로 보류함. 실물 어휘가 DU 측 kpi_definition 시드와 실행기 인제스트 포맷을 확정하고, DU_* 명명을 E2SM-KPM에 정합시키면 오픈소스 DU 대상 라이브 데모가 실현 가능해짐(TM500 조사 결론의 우리 쪽 receiving end 실증).

**방법** — 1단계(소형, 문서만): docs.srsran.com metrics 레퍼런스·gnb config, OAI GitLab 문서, O-RAN SC O-DU-high 문서, E2SM-KPM 공개 미러에서 카운터 매핑표 작성 + 3사 연동 비용 순위. 2단계(선택 심화): srsRAN gNB+UE를 ZMQ 모드 컨테이너로 기동해 실제 메트릭 스트림 캡처, kpi_definition(source=DU) 매핑과 test_run.status/progress_pct 연결의 최소 어댑터 스파이크.

### A8. 필드→랩 리플레이 충실도 지표 — 벤더·학계 선례 조사  ·  수익 상 / 노력 중 / product-differentiator

**질문** — Keysight(F9860200A/Channel Studio), Spirent(Live2Lab, SimXTRACT), VIAVI(TM500) 중 누구든 정량적 리플레이 정확도 지표(필드 대 랩 RSRP/SINR 상관계수, PDP/지연확산/도플러 일치, 처리량 상관)를 공표하는가, 아니면 정성적 'representative conditions' 주장뿐인가? 학술 문헌의 VDT 리플레이 검증 지표는 무엇인가?

**왜 지금** — FIELD_REPLAY 채널 모델 + 세션 비교 위에 '리플레이 충실도 점수'(원 필드 세션 vs 랩 리플레이 세션, KPI별)를 얹는 것은 어떤 분석 도구도 광고하지 않는 기능. 기존 지표를 채택할지 최초 주장을 할 수 있을지가 설계와 포지셔닝 모두를 결정 — TR 38.901 준거만으로는 특정 리플레이의 충실도를 말할 수 없음.

**방법** — Spirent Live2Lab VDT-CT 데이터시트(URL 확인됨)·SimXTRACT 자료의 충실도 서술 fetch; Keysight 3120-1513·Channel Studio 페이지(dam/ungate 경로, 연구 §11.1.3) 정독; IEEE Xplore/arXiv에서 'virtual drive test'/'channel replay' 검증·상관 논문 검색; 후보 지표 카탈로그 + 권고안 산출.

### A9. 한국 시장 요건 — 과기정통부 품질평가 방법론과 국내 운영사 도구 생태계 (신규)  ·  수익 상 / 노력 중 / korean-market

**질문** — 과기정통부/NIA 연례 통신서비스 품질평가의 공표된 측정 방법론(KPI 정의, 측정 조건, 다운로드/업로드/지연 판정 기준, 커버리지 지도 요건)은 무엇이고, SKT/KT/LGU+ 최적화 조직이 현재 쓰는 도구(국내 벤더 Innowireless/Accuver XCAL·XCAP 지배 여부)와 수용 기준은 무엇인가? 국내 고객에게 '정부 평가 방법론 그대로 재현' 리포트가 판매 논거가 되는가?

**왜 지금** — 개발 조직과 1차 고객이 한국인데 연구 전체가 글로벌 벤더 문서만 다루고 국내 시장 요건이 전무함. 정부 품질평가는 공개 문서화된 KPI·방법론이라 리포트 템플릿(P1)의 구체적 타깃이 되고, Accuver가 한국 회사라는 점은 경쟁·호환(XCAL 로그 임포트) 양면에서 국내 전환 전략을 좌우함.

**방법** — 과기정통부·NIA의 통신서비스 품질평가 결과 보고서와 측정 방법론 부속서(공개 PDF) fetch로 KPI·판정 기준 전수 추출; Accuver/Innowireless 공개 제품 자료로 국내 도구 점유 정황과 XCAL 로그 내보내기 포맷(CSV 가능 여부) 확인; 방법론 KPI를 현행 kpi_definition/리포트 격차(P1)에 매핑한 요건표 산출.

### A10. 분석 파이프라인의 메타모픽 불변식 스위트  ·  수익 상 / 노력 중 / analysis-correctness

**질문** — 기존 REST 표면 위에서 어떤 메타모픽 관계가 성립하고 변경마다 돌릴 만큼 싼가 — 디시메이션 불변(maxPoints 2000 vs 4000의 공유 seq 일치), compare(A,A)=전부 SAME, bins 합=sampleCount(모든 빈 크기), CDF 단조성, 범위 필터 통계의 전체 통계 유계성 — 그리고 /series의 디시메이션 통계(min/max 엔벨로프 vs 평균)에 따라 불변식이 exact인가 bounded인가?

**왜 지금** — verify-scenarios.mjs의 수작업 불변식 2개(범례 Total=sampleCount, 백분위 순서)가 모두 고가치로 판명됨. 체계적 스위트는 브라우저 없이 수 초에 돌며 '숫자가 스스로와 맞는가'를 검사 — 분석 패리티의 핵심인 수치 정확성을 UI 저니가 못 덮는 방식으로 덮고, 보류된 P0 사용자 정의 KPI(임계값 없는 KPI)가 필요로 할 자기일관성 검사를 그대로 선행 구축함.

**방법** — tools/uxtest/metamorphic.mjs 작성: verify-scenarios.mjs S8의 엔드포인트들을 전 시드 세션 × 3+ KPI로 순회, 관계별 성립/위반과 벽시계 시간 기록. /series 디시메이션 통계 종류를 먼저 판정해 exact/bounded를 구분. (차트 순수함수 property test는 별도 방법론 트랙으로 이관.)

### A11. 이웃 셀 측정 스키마와 pilot pollution 판정 기준  ·  ~~수익 중 / 노력 중~~ / data-model

> **2026-09-01 — 부분 해소.** 스키마는 만들었습니다(`sample_neighbour`, V7): 표본당
> top-8, `(arfcn, pci, rsrp, rsrq)`, 보고 문턱 아래는 행 없음. pilot pollution 탐지도
> 붙였습니다 — 최강 셀 대비 6 dB 이내 3개 이상, **단 최강 셀이 −110 dBm 이상일 때만**.
> 마지막 조건은 실측에서 나왔습니다: 없으면 깊은 페이드 구간이 오염으로 잡히는데, 그것은
> 커버리지 홀이고 정반대의 조치를 부릅니다.
>
> **남은 질문은 여전히 유효합니다.** 우리가 고른 6 dB / 3셀 / −110 dBm은 **우리가 고른
> 값**이지 벤더 간 수렴을 확인한 값이 아닙니다. 아래 (2)가 그대로 남아 있고, 빔 단위
> 측정과 `Missing neighbour`도 미해결입니다. *2026-09-03 정정: 원래 여기에 "측정된 이웃이 아니라
**설정된** 이웃 목록이 필요"라고 적혀 있었는데, 그 전제는 다른 두 문서에서 이미 철회됐습니다 —
원문 UC27(p404)도 **측정값만으로** 판정합니다(`reference/nemo-analyze-10.2/corrections.md` C1).
남은 것은 목록이 아니라 생성기에 핸드오버 지연을 넣어 조건이 실제로 발생하게 만드는 일입니다.*

**질문** — 샘플당 이웃 셀 레코드의 최소 형태(top-N? 빔 단위? 필드 구성?)는 무엇이고, pilot pollution/overshooting 자동 탐지의 업계 판정 기준(최강 셀 대비 X dB 이내 N개 이상 등)은 벤더 간 수렴하는가?

**왜 지금** — ~~gap §1.2·§1.3에서 이웃 셀 데이터 부재가 분석 3종을 원천 봉쇄~~ (해소). 이제는 반대 방향의 이유입니다: **임계값을 이미 코드에 박아 놓았으므로**, 벤더 관행과 어긋나 있다면 지금 알아야 합니다. AZQ 임포터 항목이 실물 데이터로 교차 검증을 맡습니다.

**방법** — (1) 이미 확보한 TS 38.331 원문의 MeasResults/MeasResultNR에서 이웃 측정의 규범적 형태 추출. (2) R&S/Accuver/Infovista 앱 노트·학술 논문에서 pilot pollution 파라미터('X dB 윈도·N셀')의 벤더 간 수렴 여부 확인. (3) 결정론적 시드 생성기에 이웃 셀 세트를 추가하고 탐지기를 붙여 gap §5.1 방식의 검증 가능 시나리오(S9) 성립 실험 — AZQ 항목의 lte_cell_meas 실물 스키마와 교차 검증.

### A12. 보안·멀티유저·개인정보 요건 — 판매 가능 조건의 사전 정의 (신규)  ·  수익 중 / 노력 중 / security-compliance

**질문** — 드라이브 테스트 로그가 담는 위치 궤적(위치정보법상 개인위치정보 해당 여부)과 L3 로그 내 가입자 식별자(IMSI/SUPI/TMSI)에 대해 국내 개인정보보호법·위치정보법이 부과하는 저장·가명처리 의무는 무엇이고, 운영사 조달이 요구하는 최소 보안 형상(온프렘/망분리, 인증·권한, 감사 로그, 멀티유저 격리)은 무엇인가? 현행 무인증 단일 사용자 poc에서 무엇이 스키마 수준(지금 안 하면 되돌리기 어려운 것)인가?

**왜 지금** — 현재 poc는 인증이 전무하고 연구 어젠다 어디에도 보안·프라이버시 항목이 없음. 측정 로그는 본질적으로 위치+식별자 데이터라 국내 운영사 판매의 전제 조건이며, 익명화 컬럼·사용자/조직 스코프 같은 결정은 스키마에 조기 반영하지 않으면 마이그레이션 비용이 급증함.

**방법** — 위치정보법·개인정보보호법의 공개 조문과 KISA 가이드(가명처리·위치정보 사업 신고 기준)에서 드라이브 테스트 로그 해당성 판정; 경쟁 제품(Nemo Analyze, TEMS, XCAP) 문서의 사용자 관리·익명화 기능 서술 수집으로 시장 관행 확정; 결과를 '스키마 수준 지금/애플리케이션 수준 나중' 2열 요건표로 산출.

### A13. 포맷 인터롭의 법적·라이선스 감사 (신규)  ·  수익 중 / 노력 소 / legal-licensing

**질문** — 타사 로그 포맷 판독의 법적 조건은 무엇인가 — Qualcomm Diag(DLF) 파싱의 법적 지위와 QCSuper(GPLv3) 코드·지식 재사용이 상용 제품에 갖는 카피레프트 함의, azm_db_merge 등 오픈소스 임포터의 라이선스 경계(클린룸 재구현 필요 여부), 벤더 EULA의 리버스 엔지니어링 금지 조항이 파일 포맷 판독(상호운용성 예외)에 미치는 효력?

**왜 지금** — P0 해자가 '타사 포맷 파싱'인데 법적 리스크 검토가 어젠다에 전무함. GPL 코드를 참조한 파서가 제품에 들어가면 전체 공개 의무가 걸릴 수 있고, 이 답은 .nmf/DLF/AZQ 각 임포터의 구현 방식(직접 사용/클린룸/포맷 문서만 참조)을 미리 결정함 — 구현 후 발견하면 전부 재작성임.

**방법** — QCSuper·azm_db_merge 저장소의 LICENSE 전문 확인과 GPL FAQ의 파생저작물 기준 대조; 상호운용성 목적 포맷 분석에 대한 국내 저작권법 규정(프로그램코드역분석 조항)과 주요 벤더 EULA 공개본의 관련 조항 수집; 임포터별 '허용 구현 경로' 판정표 산출(법률 자문 필요 항목은 명시 분리).

### A14. Lee 기준 거리 비닝 파라미터 확정  ·  수익 중 / 노력 소 / geo-analytics

**질문** — Lee의 국지 평균 샘플링 기준(관례 40λ·36~50 샘플)의 원전 근거는 무엇이며, n78(3.5 GHz, λ≈8.6 cm)과 현행 시드의 1 Hz·차량 속도 조건에서 거리 비닝 창을 몇 m로 잡아야 통계적으로 유효한가?

**왜 지금** — gap §3.2 P1 명시 항목(Nemo 매뉴얼 명시 기능인데 미구현). area binning(50/150/500 m)은 있으나 드라이브 테스트 통계의 정석은 거리 기반 — 원전 없이 구현하면 '왜 40λ인가'에 답 못 하는 제품이 됨.

**방법** — (1) W.C.Y. Lee 원 논문(IEEE Trans. VT, 1985)과 표준 교과서로 창 길이·최소 샘플 수 근거 확정. (2) n78 창 길이를 계산하고 1 Hz·60 km/h의 샘플 간 거리(≈16.7 m)가 기준 충족하는지 판정 — 미충족이면 '거리 비닝은 X Hz 이상 로그에서만 유효' 제품 규칙 도출. (3) bins 엔드포인트에 거리 기반 창을 시험 구현해 area binning과 차이 실측.

### A15. RSRP·SS-SINR·처리량 공식 범례 구간 확보  ·  수익 중 / 노력 소 / kpi-catalog

**질문** — Nemo Analyze의 RSRP/SS-SINR/처리량 기본 색상 범례 구간은 무엇인가? (RSCP -80/-90/-100·4구간은 §11.3.3에서 확보, 나머지 KPI는 【미확인】)

**왜 지금** — kpi_threshold 시드가 업계 통례 추정에 근거. 기존 Nemo 사용자가 화면을 열었을 때 '내가 쓰던 구간 그대로'라는 인상이 전환 저항을 낮추는 직접 요소(요구사항 §1.1 UX 정체성 보존 전략).

**방법** — (1) docs/assets/reference-pdfs의 나머지 그림 전수 재추출 — 5992-2005EN Figure들과 troubleshooting/problem-survey/benchmarking 이미지에 Color Legends 패널이 더 있는지 원본 해상도 판독(부록 A pymupdf 절차 재사용). (2) 실패 시 TEMS/XCAP/ROMES 공개 문서에서 업계 기본 구간 교차 수집('업계 관행'으로 격상). (3) 그래도 미확보면 TS 38.133 보고 범위에서 유도하고 '자체 기본값' 명시 표기.

### A16. 경쟁 분석기의 자동 문제 탐지 분류체계 (ROMES NPA·TEMS·XCAP)  ·  수익 중 / 노력 중 / competitor-landscape

**질문** — 경쟁 분석기들이 탑재한 명명된 자동 문제 카테고리 목록은 무엇인가 — R&S ROMES Network Problem Analyzer 문제 목록, TEMS Discovery 자동 트러블슈팅 라이브러리, Accuver XCAP 자동 분석 모듈? (gap §2.1은 기능 유무만 비교, 탐지 분류체계 자체는 미조사; NEW-01은 탐지기 3종 vs Nemo 공표 5+종)

**왜 지금** — 자동 열화 탐지 확장이 선언된 차별점(NEW-01)이고 P1 '실패 KPI→원인' 드릴다운은 시장이 table stakes로 여기는 원인 카테고리를 알아야 함. 구체 분류체계는 '탐지기 추가'를 우선순위 백로그로 바꾸고 이웃 셀 데이터(P2) 의존 항목을 표시해 줌.

**방법** — rohde-schwarz.com에서 ROMES4 데이터시트·기술 브로슈어 fetch(저장소가 R&S 자료 확보 전례 있음)해 NPA 문제 목록 추출; TEMS Discovery 기술 제품 설명서(ManualsLib/Ascom 미러)의 트러블슈팅 라이브러리; accuver.com XCAP 스펙시트; 카테고리명을 우리 탐지기 3종·Nemo 5G Advanced Analytics 목록과 대조표로 정리.

### A17. 플래닝 도구 내보내기 계약 — Atoll·Planet·MapInfo MIF/MID·KML  ·  수익 중 / 노력 중 / integrations

**질문** — Forsk Atoll(문서화됨: 탭/세미콜론/공백 구분 ASCII, TEMS .Pln/.Fmt, 전파 모델 캘리브레이션용 CW 측정 경로)과 Infovista Planet이 수용하는 드라이브 테스트 임포트 포맷·컬럼 계약은 정확히 무엇이고, 공개된 MapInfo MIF/MID 스펙만으로 Nemo 패리티 MapInfo 내보내기(FR-05)를 사유 라이브러리 없이 구현 가능한가? Google Earth 패리티용 KML은 추가 가치가 있는가?

**왜 지금** — FR-05가 ◐(CSV+GeoJSON뿐)인데 Nemo는 MapInfo/Excel/Google Earth 내보내기. 운영사 플래닝 팀이 모델 튜닝에 드라이브 테스트를 Atoll로 넣는다면, 문서화된 컬럼 그대로의 'Atoll-ready export'는 소비자가 명명된 저비용 로드맵 기능 — 내보내기를 워크플로 브리지로 격상.

**방법** — Forsk Atoll 사용자 매뉴얼(3.1.0 Drive Tests 문서 위치 확인; forsk.com 현행판)의 임포트 장에서 필수 컬럼·구분자 기록; Infovista Planet 데이터시트의 측정 임포트 목록; Precisely MIF/MID 공개 스펙과 OGC KML 스펙 fetch; 타깃별 내보내기 필드 계약서 산출.

### A18. 2025 Keysight–Spirent–VIAVI 실제 자산 분할 확정  ·  수익 중 / 노력 소 / competitor-landscape

**질문** — 1차 출처만으로: 2025-10-16 $425M 거래에서 어떤 Spirent 제품 라인(Vertex, Live2Lab, Umetrix, TestCenter, PNT/GNSS)이 VIAVI로 갔고 무엇이 Keysight에 남았는가? VIAVI가 이제 TM500+인수 자산의 field-to-lab 스택으로 Keysight의 PROPSIM+Vertex 통합에 맞서는가? (주의: §4 반증된 '2024년 채널 에뮬레이션 인수' 주장 재인용 금지 — 이 항목은 진짜 2025 분할만 다룸)

**왜 지금** — §7.3이 2025년 이전 경쟁 분석 전체를 stale로 경고하고 §10.1이 재편을 로드맵 리스크로 listed했으나 실제 이동 내역 기록이 없음. 참조 에뮬레이터 벤더(VIAVI TM500)가 랩 리플레이 변환 도구까지 보유하게 됐는지가 어느 벤더의 로그·카운터 포맷과 후처리 hand-off를 우선할지 결정.

**방법** — Keysight 2025-10-15·VIAVI 2025-10-16 완료 보도자료(연구 §11.1.4에서 존재 확인됨)의 자산 목록 정독; Spirent plc scheme-of-arrangement/투자자 FAQ의 매각 경계 확인; spirent.com·viavisolutions.com의 Vertex/Live2Lab/Umetrix 제품 페이지 소유권 배너 검증; §7.3 타임라인 표 갱신.

### A19. 시그널링 스크립트 축의 데이터 모델 형태  ·  수익 중 / 노력 중 / data-model

**질문** — VDT '두 갈래 재생'(연구 §5.3)의 미모델링 축 — 운영사별 시그널링 스크립트 — 는 실물에서 어떤 형태인가(시각 정렬 이벤트 목록? RRC 메시지 템플릿? 테스트 케이스 스크립트)? test_run에 기록할 최소 스키마는?

**왜 지금** — arch §2.6이 명시한 '아직 없는 것'. 채널 축(FIELD_REPLAY)만 모델링돼 랩 런 기록이 반쪽 — 같은 채널이라도 시그널링 시나리오가 다르면 재현이 아님. 분석 제품에도 '어떤 시그널링 조건의 측정인가'가 세션 메타데이터로 필요.

**방법** — (1) 보관본 3120-1513(S8709A 8p)·C8709000A 제품 페이지를 시그널링 관점 재정독 — '사전 제작 테스트 케이스'의 구성 단위 추출. (2) UXM 5G Test Application(S8711A)·TM500 테스트 스크립팅 공개 자료에서 스크립트 입도(이벤트/메시지/파라미터) 확인. (3) 프록시로 TS 38.508/38.523 테스트 케이스 구조를 참조해 '시각 정렬 절차 이벤트 시퀀스' 가설의 최소 테이블(signaling_scenario) 설계안. 1차 출처 게이트 가능성이 높아 확인/추정 표기 필수.

### 진행 상태

| 항목 | 상태 | 결과 |
|---|---|---|
| **A15. 공식 범례 구간 확보** | **완료 (2026-08-30)** | 말뭉치 전수 스캔으로 RSCP·EcNo 두 범례 확보(EcNo는 신규), RSRP/SINR/처리량은 **말뭉치에 없음이 확정**. 외부 교차 확인(AOSP·AZQ 원문 직접 검증)으로 RSRP·SINR 기본값이 독립 출처와 일치함을 확인하고, DL 처리량 하한을 20→50으로 정정, RSCP 색상 hex 3개를 JPEG 아티팩트에서 무손실 실측값으로 정정. 상세: 리서치 §11.3.3~§11.3.5 |

| **A1. 임계값 없는 KPI의 자동 비닝** | **완료 (2026-08-30)** | 착수 즉시 임계값 없는 KPI가 **500을 내던 것**을 발견해 수정. 분위수 4구간 + 1-2-5 스냅(최소 간격 절반 스텝), 세션 전체 기준으로 도출해 **필터 안정성** 확보, 심각도 미주장, 자동↔고정 왕복 루프. 실측 파생 비용 +15~21 ms(200 device-hours) → 캐시 불필요. 상세: gap §5.4, 시나리오 S10 |
| **A21. 색상 램프 방향** | **완료 (2026-08-30)** | `direction`만으로는 부족함을 확인 — 좋은 끝이 **없는** KPI(카운터·부하 지표)가 존재. NEUTRAL 도입 + 단일 색조 순차 램프. 상세: gap §5.4 |

| **P0 사용자 정의 KPI** | **완료 (2026-08-30)** | KPI 정의 생성·삭제 API와 임포트의 `createUnknownColumns` 옵션으로 **무손실 임포트** 달성. 미지 컬럼이 NEUTRAL KPI로 정의되고 자동 스케일로 즉시 분석 가능. 남은 것은 파생 수식뿐. 상세: gap §5.5, 시나리오 S11 |

> A15 수행 중 파생된 신규 항목 두 가지를 아래에 추가합니다.

### A20. 드라이브 테스트 생성기 처리량 보정 · 수익 중 / 노력 소 / data-realism

**질문** — n78 100 MHz 4x4 구성에서 현재 생성기의 MAC DL 처리량 최대값이 약 235 Mbps인데,
실제 동일 구성의 드라이브 테스트는 어느 범위에 분포하는가? SINR→MCS→TBS 경로의 어느 단계가
과소 산출하고 있는가?

**왜 지금** — 처리량 범례의 최상위 구간(`>= 300 Mbps`)이 시드에서 **0.00%**로 비어 있어, 범례의
1/4과 색상 램프의 한 단계가 무의미해집니다. 도메인 사용자가 첫 화면에서 바로 알아채는 종류의
비현실성이고, 랩 캠페인의 합불 기준(`MAC_DL_THROUGHPUT MEAN >= 50`)의 현실성도 여기에 달려 있습니다.

**방법** — TS 38.214의 TBS 계산 절차와 38.306 최대 데이터율 공식으로 해당 구성의 이론 상한을 계산해
현재 생성기 출력과 비교; 단계별(대역폭·레이어·MCS·오버헤드) 기여도를 분해해 과소 산출 지점을 특정;
공개된 5G NR 필드 측정 분포와 대조.

### A21. 임계값 없는 KPI의 색상 램프 방향 · 수익 중 / 노력 소 / visualization

**질문** — A1(자동 비닝)에서 구간을 자동 생성할 때 **색상 방향**은 무엇으로 결정하는가?
`kpi_definition.direction`(HIGHER_IS_BETTER/LOWER_IS_BETTER)만으로 충분한가, 아니면 양방향이
나쁜 KPI(예: TX power, 타이밍 어드밴스)가 존재하는가?

**왜 지금** — A15 조사에서 AZQ가 **무지개 램프**(파랑이 최상)를 쓰는 반면 Nemo는 **녹-적 램프**를
쓴다는 사실이 확인되었습니다. 즉 램프 선택은 자명하지 않으며, 자동 비닝이 방향을 잘못 잡으면
"빨간 지도가 좋은 상태"라는 치명적 오독이 발생합니다. A1보다 먼저 답이 필요한 하위 질문입니다.

**방법** — 현행 18개 KPI를 direction 기준으로 분류하고 양방향 KPI 존재 여부 확인; Nemo의 TX power
셀 강조(§11.3.3 Outdoor 화면에서 19.4/19.6/18.5 dBm이 적색)를 근거로 "높을수록 나쁜" KPI의 실제
처리 방식 추정; 자동 비닝 API에 방향 파라미터를 강제할지 결정.

### 정제 기록

28개 후보를 19개로 정리했습니다(병합 4쌍, 삭제 9, 신규 3). 병합: (a) 한/영 중복이던 O-RAN WG4 M-plane 항목 2건 → 1건, (b) SA5 HOSR/DCR/CSSR 검증 + TS 28.554/28.552 카탈로그 → 1건(공식 존재 검증은 카탈로그 작업의 1단계), (c) .nmf 실증 2건 → 1건 — 단, gap §4가 반증한 GitHub 샘플 경로(ticotico/test-nmf류)와 ftp.actix.com·PDFCoffee 인용을 방법에서 제거하고 경쟁사 1차 데이터시트(Spirent Live2Lab, TEMS 릴리스 노트)+공식 스펙 경로만 남김, (d) srsRAN/OAI 실험 + Real-DU 어휘 → 1건(문서 우선, ZMQ 스파이크는 선택 심화로 격하해 large→medium). 반증 재개 여부 점검: 잔존 항목 중 §4 반증 주장(.nmf=네이티브 확장자 단정, TimescaleDB 수치, actix 상호변환, QCSuper PCAP, 2024 VIAVI 인수)을 재인용하는 것 없음 — 자산 분할 항목은 2025 거래만 다루도록 주의 문구 유지. §5.1 기반영 항목(전역 필터, 헤더 동의어, CDF 오버레이 등)과 중복되는 후보도 없음. 삭제: UI 테스트 방법론 트랙 9건 중 8건(pixel-diff, 차트 테스트 레이어, Stryker, axe-core, flake 측정, random walk, 토큰 계수, 스킬 패키징) — 방법은 구체적이나 payoff가 명시된 제품 방향(분석 패리티+인사이트 / 랩 가상UE+실DU / 기존 Nemo 사용자 전환)이 아니라 개발 방법론 연구에 귀속되므로 이 어젠다에서 제외(별도 방법론 어젠다로 이관 권고). 예외로 메타모픽 불변식 항목만 유지 — 분석 수치의 자기일관성 검증이라 '분석 패리티'의 핵심이고 P0 사용자 정의 KPI를 직접 de-risk함(fast-check 차트 property test 부분은 방법론 트랙으로 분리). 신규 3건(완전히 빠져 있던 각도): ① 한국 시장 — 과기정통부/NIA 품질평가 방법론과 국내 운영사·Accuver 생태계(개발 조직과 1차 고객이 한국인데 국내 요건 조사가 전무), ② 보안·멀티유저·개인정보 — 위치정보법/개인정보보호법상 위치 궤적·IMSI 처리 의무와 스키마 수준 선행 결정(현행 poc 무인증), ③ 법적·라이선스 감사 — GPL 임포터(QCSuper 등) 재사용의 카피레프트 함의와 리버스 엔지니어링의 상호운용성 예외(P0 해자 전체의 구현 경로를 좌우). 순위 논리: P0을 직접 게이트하는 항목(자동 비닝)을 1위로, 이어 소형·고수익 표준/1차출처 확정 4건, 그다음 전환(마이그레이션)·랩·차별점·한국시장, 하위는 P1/P2 지원 및 경쟁 정보 항목.

---

## B. 개발 방법론 트랙 — 프론트엔드 테스트 자동화 후속 연구

제품 어젠다와 분리해 관리합니다(크리틱 판정: 수익이 제품 방향이 아니라 개발 방법론에 귀속).
`docs/ui-testing/README.md`의 측정 결과를 전제로 한 다음 단계 질문들입니다.
메타모픽 불변식 항목은 분석 수치의 자기일관성 검증이라 A트랙(A10)으로 승격되었습니다.

### B1. Pixel-diff as an eighth detector: measured, not argued  ·  수익 상 / 노력 중

**질문** — Does a pixel-diff signal (pixelmatch or odiff), summarized as structured data (diff-pixel count + bounding boxes mapped to DOM elements via elementFromPoint), catch the D1-D6 defect matrix — especially D5 (severity color dropped), which today only the hand-written digest catches — and at what bytes/runtime, with what pixel noise floor?

**방법** — Add an S7 signal to tools/uxtest/signals.mjs: screenshot to PNG, diff against a committed baseline with pixelmatch (pure JS) and odiff-bin (native), then in-page elementFromPoint over diff-cluster centroids to name the changed components. Run experiment.mjs twice unmodified to establish the pixel noise floor (this env has a pinned Chromium at /opt/pw-browsers, so the container-pinning precondition of §2.3 holds), then across D1-D6. Record per-defect: caught?, structured-summary bytes (append to the §1.3 matrix), diff wall time pixelmatch vs odiff, baseline storage bytes.

### B2. Cheapest home for SVG-chart geometry tests  ·  수익 중 / 노력 중

**질문** — For the hand-rolled SVG charts (TimeSeriesChart step-line path math, StatisticsPanel CDF, CompareView overlay), which test layer catches seeded geometry defects at the lowest setup+runtime cost: (a) extracting the path math to pure functions tested in node, (b) Vitest+jsdom rendering and parsing the path 'd' attribute, or (c) real-browser component testing — given the repo currently has no unit test runner at all?

**방법** — In this repo: extract the useMemo body of frontend/src/components/TimeSeriesChart.tsx into a pure buildPath() function; implement the same 6 assertions three ways (node+vitest on the function, vitest+jsdom parsing rendered <path d>, and one real-browser variant via @playwright/experimental-ct-react pinned exact-version); seed 3 chart defects (drop the step 'L prevY' segment, invert the y transform, skip the lo===hi widening) and record which layer catches each, install/setup cost, and wall time per run. Deliverable: a recommendation row-per-layer table in the README's cost-accounting style.

### B3. Metamorphic invariants for the analysis pipeline  ·  수익 상 / 노력 중

**질문** — Which metamorphic relations over the existing REST surface hold and are cheap enough to run per-change — decimation invariance (series at maxPoints=2000 vs 4000 agree at shared seqs), compare(A,A) yields all-SAME verdicts, bins sum to session sampleCount at every bin size, CDF monotone non-decreasing, range-filtered stats bounded by full-session stats — and does fast-check over the extracted chart math find inputs (nulls, single point, constant series) that break rendering?

**방법** — Write tools/uxtest/metamorphic.mjs hitting the endpoints listed in verify-scenarios.mjs S8 across all seeded sessions and 3+ KPIs; for each candidate relation record holds/violations and wall time. Expected genuine subtlety to resolve: which decimation statistic (min/max envelope vs mean) the /series endpoint uses determines whether the invariance relation is exact or bounded. Then npm i -D fast-check and property-test the extracted buildPath() from the chart-testing item with arbitrary Series (nulls interleaved, length 0/1, constant values), asserting path validity and x-monotonicity of emitted points.

### B4. StrykerJS vs hand-rolled defect injection  ·  수익 상 / 노력 대

**질문** — What is the mutation score of the 30-check verify-ui.mjs suite over frontend/src, how many minutes per mutant does it cost when every mutant needs a vite build plus a live-app probe (Stryker command runner: build sandbox, serve dist, run suite), and does the surviving-mutant set expose more D2-class 'assertions that never fail' than the 6 hand-picked defects did?

**방법** — In frontend/: npx stryker run with testRunner 'command', mutate scoped to src/components/Panels.tsx only, commandRunner.command = a wrapper script that runs tsc+vite build, starts vite preview on a per-run port, runs node ../scripts/verify-ui.mjs with BASE pointed at it, and exits accordingly. Cap with --concurrency 2 and mutant sampling if needed. Record: mutants generated, minutes/mutant, score, and manually classify 10 survivors as (a) untested behavior, (b) equivalent mutant, (c) weak assertion. Compare survivor classes against the D1-D6 findings; conclude whether Stryker replaces, supplements, or is too slow for the harness.

### B5. axe-core scan plus selector-quality audit  ·  수익 중 / 노력 중

**질문** — What does an @axe-core/playwright sweep across all modes/workbooks cost (runtime, output bytes in the README's accounting style) and find on this app — and would fixing the accessible-name violations let the two suites migrate off CSS-class selectors: today verify-ui.mjs and verify-scenarios.mjs contain zero getByRole/getByLabel/getByText calls despite README §2.2 arguing role-based failures are what make defects agent-fixable?

**방법** — npm i -D @axe-core/playwright; add a route-walking scan reusing digestAllRoutesSignal's tab iteration; record violations by rule, runtime, and serialized-output bytes. Then audit all 79 assertions: classify each locator as role-migratable-today / migratable-after-a11y-fix / inherently structural. Fix the top accessible-name gaps (chart panels, statusbar controls, legend rows), migrate 10 assertions to getByRole, and re-run one injected defect (D1) to compare failure-message diagnosability bytes-for-bytes against the CSS-selector version.

### B6. Flake rate and wall-time budget of the scenario runner  ·  수익 상 / 노력 중

**질문** — What is the measured flake rate and per-step timing distribution of verify-scenarios.mjs over N=20 repeated runs, and how much wall time (currently >=36.2s of fixed waitForTimeout sleeps across 29 call sites, plus 26 more in verify-ui.mjs) and flake is removed by replacing fixed sleeps with condition polling — possibly by migrating to @playwright/test's auto-waiting expect?

**방법** — Wrapper script runs verify-scenarios.mjs 20x sequentially against the seeded app, emitting JSONL of {run, scenario, step, ok, ms}; compute per-step failure rate and timing spread. Then convert the 5 highest-sleep steps (the 1800-2500ms waits after selectSession/openMode) to polling on the condition they actually await (e.g. waitForFunction on statusbar seq change or legend Total update), re-run 20x, and compare flake rate and total wall time. Deliverable: measured flake budget proposal (e.g. 'quarantine any step >1/20 failures; suite must finish <90s') plus a verdict on whether @playwright/test migration (retries, traces, toPass) pays for itself.

### B7. Random-walk exploration of the interaction state machine  ·  수익 중 / 노력 대

**질문** — Does a seeded random walk over the app's interaction state space (mode x workbook x session x KPI x cursor x range filter x playback — roughly 10 actions), checking ~5 global invariants after every action (cursor-follows-grid, legend Total consistency, no pageerror, active-filter chip presence matches filter state), catch defect classes the 8 hand-written linear journeys structurally miss — and at what runtime per 100-step walk?

**방법** — Build tools/uxtest/randomwalk.mjs: action list (switch mode/workbook/session/KPI, click progress bar at random fraction, set/clear range, toggle play, click a degradation/issue/event row), seeded PRNG, invariants asserted after each step, failure output = the action sequence (replayable). Validate detection power first by re-injecting D1-D6 via inject.mjs and recording which walks catch each within 100 steps; then run 10 walks against HEAD and count genuine findings vs false alarms. Compare cost/detection against the scenario suite in the README's matrix format. Optionally frame with fast-check model-based commands if the bare walker proves valuable.

### B8. Real token counts for the signal cost table  ·  수익 중 / 노력 소

**질문** — Do measured Claude tokenizer counts (messages.count_tokens) for the exact saved signal payloads change the README §1.1 ranking — in particular the headline near-tie 'ARIA snapshot approx equals screenshot' (estimated ~2,184 vs exact 2,160), given whitespace-heavy YAML, dense JSON, and prose tokenize at different chars-per-token and the entire text column is a chars/4 estimate?

**방법** — Requires only an environment with an Anthropic API key (the one thing this container lacks — README §0.1 says so). Script: read each saved signal from the measure-signals.mjs output dir, call the token-counting endpoint per the claude-api skill reference for each payload wrapped as a user message, emit a corrected table with measured tokens and the chars/token ratio per signal type (YAML vs JSON vs prose vs innerText). Update §1.1 and re-state the §1.4 recommendation if any ranking flips; also record the ratio spread as a reusable rule of thumb for future estimates.

### B9. The methodology as a portable Claude Code skill  ·  수익 상 / 노력 대

**질문** — Which parts of the UI-verification methodology are app-invariant (noise-floor protocol, defect-injection-validates-assertions rule, signal cost accounting, api-surface cross-check concept, structured-failure feedback rules) versus app-specific (digest selectors, route walker, api-surface.mjs grep patterns for this Spring/React pair) — and can the invariant core be packaged as a SKILL.md plus scripts with an explicit app-adapter boundary that transfers to a second repo with under ~100 lines of adaptation?

**방법** — Using the skill-creator skill: draft a ui-verification skill encoding the invariant protocol (1: prove noise floor, 2: build app digest, 3: inject one defect to validate each assertion class, 4: api-surface three-way cross-check, 5: cost-account every signal in bytes) with signals/experiment scripts refactored so all app-specific selectors live in one adapter module. Transfer test: scaffold a small second app (fresh Vite + a trivial API) or use another available repo, apply the skill in a clean session, and measure lines of adapter written, wall time, and whether a planted D2-class defect (data fetched but not rendered) is found. Define the skill eval as exactly that planted-defect scenario per skill-creator's benchmark flow.

> B9(방법론의 이식 가능한 스킬화)는 이번 라운드에 1차분을 구현했습니다:
> `.claude/skills/verify-frontend/SKILL.md` — 이 저장소의 3종 검사기 실행·해석·확장 규칙을
> 프로젝트 스킬로 패키징. 남는 연구 질문은 "저장소 독립적(portable) 스킬로 일반화할 때
> 무엇이 파라미터가 되어야 하는가"입니다.

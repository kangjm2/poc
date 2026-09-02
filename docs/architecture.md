# 아키텍처

이 문서는 **시스템 조망**입니다 — 무엇이 어디에 있고, 요청이 어떻게 흐르며, 어떤 규칙이
전체를 지탱하는지. 특정 설계를 **왜** 그렇게 골랐는지에 대한 근거와 실측은
[`architecture-and-scale.md`](./architecture-and-scale.md)에, 기능 격차와 반영 이력은
[`gap-analysis.md`](./gap-analysis.md)에 있습니다.

---

## 1. 전체 구조

```
┌─────────────────────────────────────────────────────────────────┐
│  브라우저 — React 18 + TypeScript (Vite)                         │
│                                                                   │
│  App.tsx  ─ 공유 시간 커서 · 선택 세션 · 선택 KPI · 범위 필터를   │
│             트리 최상단에 보유 (모든 패널이 여기서 읽음)          │
│    ├── RouteMap        Leaflet · 색상 구간별 폴리라인 · 영역 비닝  │
│    ├── TimeSeriesChart 자체 SVG 계단 라인 (차트 라이브러리 없음)   │
│    ├── Panels          파라미터 그리드 · 범례 · 이벤트 · L3 · 열화 │
│    ├── StatisticsPanel 요약 통계 + CDF                            │
│    ├── CompareView     A/B 비교 + CDF 오버레이                    │
│    ├── LabView         랩 캠페인 구성 · 합불 판정                  │
│    ├── ImportView      CSV 임포트 · 이력                          │
│    ├── LegendEditor    색상 스케일 편집 (모달)                     │
│    └── view/           keymap · Esc 사다리 · state(URL 경계+합법성)│
│                        api/client.ts — 유일한 HTTP 경계            │
└───────────────────────────────┬───────────────────────────────────┘
                                │ REST/JSON (gzip)
┌───────────────────────────────┴───────────────────────────────────┐
│  Spring Boot 3.3 · Java 21                                        │
│                                                                    │
│  api/         AnalysisController   세션·트랙·시리즈·스냅샷·비교     │
│               AnalyticsController  영역 비닝·커버리지·내보내기      │
│               KpiController        KPI 카탈로그·임계값 CRUD         │
│               ApiExceptionHandler  IllegalArgument→400 · NoSuchElement→404                    │
│  lab/         LabController/Service 캠페인·런·합불 판정             │
│  ingest/      ImportController/Service  스트리밍 CSV 적재           │
│                                                                    │
│  service/     AnalysisService   읽기 분석 (전량 SQL 집계)           │
│               GeoAnalysisService 공간 분석                          │
│               ExportService     CSV 피벗 · GeoJSON 스트리밍         │
│               KpiCatalog        KPI 정의 조회 · 값→구간 판정        │
│               AutoScale         임계값 없는 KPI의 스케일 파생        │
│               KpiSql            구간 분류 SQL 생성                  │
│               ThresholdScale    색상 스케일 검증·라벨 파생          │
│               KpiDefinitionForm KPI 정의 검증                       │
│  seed/        DataSeeder · DriveTestGenerator · KpiSeed · LabSeed  │
└───────────────────────────────┬───────────────────────────────────┘
                                │ JDBC
┌───────────────────────────────┴───────────────────────────────────┐
│  PostgreSQL 16                                                     │
│  sample_kpi  = HASH(session_id) 8-파티션                          │
│              PK(session_id, seq, kpi_name) + (session_id, kpi_name, seq) │
│  sample      = (session_id, seq) · (session_id, ts) · BRIN(ts)    │
│  그 밖의 도메인 테이블 14개 (측정·랩·임포트)                         │
└────────────────────────────────────────────────────────────────────┘
```

**계층 규칙 하나**: 프론트엔드는 `api/client.ts`를 통해서만 서버와 통신합니다.
컴포넌트가 직접 `fetch`를 부르지 않으므로 API 표면을 기계적으로 대조할 수 있고,
`tools/uxtest/api-surface.mjs`가 그 대조를 자동화합니다(§6).

---

## 2. 요청 흐름 — "지도가 칠해지기까지"

가장 대표적인 경로입니다. 나머지 분석 엔드포인트도 같은 형태입니다.

```
GET /api/sessions/{id}/track?kpi=RSRP&maxPoints=4000
  │
  ├─ KpiCatalog.require("RSRP")          KPI 정의 + 임계값 로드
  ├─ AutoScale.effective(session, def)   임계값이 있으면 그대로,
  │                                       없으면 세션 전체 분위수로 파생 (§4.3)
  ├─ KpiSql.binOrdinalExpr(scale, ...)   구간 분류를 CASE 식으로 생성
  │                                       (경계는 숫자 리터럴, 심각도는 형태 검사)
  ├─ SQL 1회
  │    · 값을 구간 서수로 분류
  │    · lag()로 구간이 바뀌는 지점을 표시
  │    · 구간 전환점은 모두 보존 + 나머지는 stride 간격으로 솎음
  └─ 응답: 좌표 · 값 · 색상 · 구간 라벨
```

**여기서 결정적인 것**: 분류와 데시메이션이 **DB 안에서** 끝납니다. 애플리케이션으로
행을 꺼내와 세는 초기 구현은 8시간 세션에서 이미 감당이 되지 않았습니다
(실측은 `architecture-and-scale.md` §3.2).

데시메이션은 **균등 샘플링이 아닙니다.** 구간이 바뀌는 지점은 전부 남깁니다 —
짧은 드롭아웃이야말로 지도가 존재하는 이유이므로, 균등하게 솎으면 지워집니다.
시계열은 버킷마다 **최솟값과 최댓값**을 남기는 포락선 방식이라 스파이크가 살아남습니다.

---

## 3. 데이터 모델

### 3.1 측정 도메인

| 테이블 | 역할 | 비고 |
|---|---|---|
| `measurement_session` | 하나의 주행/런 | 이름·장비·기술·빌드·시나리오·노트 |
| `sample` | 시각 + 위치 (seq 단위) | `(session_id, seq)`·`(session_id, ts)` 인덱스, `ts` BRIN |
| `sample_kpi` | KPI 값 | **HASH(session_id) 8-파티션**, `(session_id, seq, kpi_name)` PK |
| `cell_ref` | 세션에 등장한 셀 | PCI·ARFCN·밴드·GSCN·방위각 |
| `sample_neighbour` | **모니터드 셋** — 표본별 검출된 이웃 셀 | **HASH(session_id) 8-파티션**, `(session_id, seq, arfcn, pci)` PK |
| `network_event` | 핸드오버·RACH·결함 등 | 심각도 포함 |
| `event_type` | 이벤트 타입 **레지스트리** — 표시명·색·심볼·`kind`(LOGGED/DERIVED)·정렬 순서 | 지도 마커 · 차트 눈금 · Events 독 · 문제 파이가 **모두 여기서** 읽습니다 |
| `signaling_message` | L3/RRC·M-plane 메시지 | 방향·프로토콜·본문 |

`sample_neighbour`에는 **`is_serving` 열이 없습니다.** 어느 셀이 서빙이었는지는 이미
`sample.serving_pci`가 기록하고 있고, 같은 사실의 사본 두 개는 서로 어긋날 수 있습니다.
지도와 모순되는 모니터드 셋은 모니터드 셋이 없는 것보다 나쁘므로, 서빙 여부는 조인으로
**유도**합니다.

행이 없다는 것은 "약했다"가 아니라 **"검출되지 않았다"**입니다. 단말은 잡히는 셀을
보고하고, 보고 문턱 아래 셀은 행을 만들지 않습니다. 그래서 표본당 행 수가 변하고, 그
변화 자체가 측정입니다 — 깊은 페이드에서는 모니터드 셋이 서빙 셀 하나로 줄어듭니다.

`sample_kpi`는 **좁은 세로형**(`session_id, seq, ts, kpi_name, value`)입니다. KPI마다
열을 만드는 가로형이면 KPI를 추가할 때마다 스키마가 바뀌고, 참조 도구가 수천 종을
다룬다는 점에서 유지될 수 없습니다. 세로형이기 때문에 **§4.4의 사용자 정의 KPI가
스키마 변경 없이** 동작합니다.

파티션 키를 `session_id`로 잡은 이유와 그 대가(보존 정책에는 `RANGE(ts)`가 유리)는
`architecture-and-scale.md` §3.3에 기록되어 있습니다.

### 3.2 KPI 카탈로그

| 테이블 | 역할 |
|---|---|
| `kpi_definition` | 이름·표시명·단위·분류·기술·**방향**·출처(UE/DU/FRONTHAUL/SCANNER)·소수 자릿수·`expression` |
| `kpi_threshold` | 색상 구간 사다리 — 경계·색상·라벨·심각도, `(kpi_name, ordinal)` 유니크 |
| `kpi_graph` | **KPI Workbench** 그래프 문서 (JSONB) — 출력 KPI당 하나 |

KPI를 만드는 방법이 **둘**이고, 둘 다 값을 `sample_kpi`에 **실체화**합니다.

| | 정의 | 표현 가능한 것 |
|---|---|---|
| 파생 KPI | `kpi_definition.expression` 한 줄 수식 | 표본별 산술 |
| **KPI 그래프** | `kpi_graph.spec` 노드 문서 | 여러 소스의 결합·조건·상태 분류·**이웃 셀 소스** |

실체화를 고른 이유는 같습니다: 읽을 때 계산하면 트랙·시리즈·스냅샷·분포·통계·열화·
영역 빈·셀 분석·내보내기 두 종·리포트가 **전부** "어떤 KPI는 행이 아니다"를 배워야
합니다. 실체화하면 만들어진 KPI가 측정된 KPI와 하류에서 구분되지 않습니다.

그래프가 **행 집합**의 데이터플로인 이유는 레퍼런스 워크벤치 화면에서 판독했습니다 —
Output 노드가 `Column count: 19`를 보고합니다. 값 하나가 아니라 이름 붙은 열을 가진
표가 흐른다는 뜻이고, 그래서 수식으로는 표현할 수 없습니다. 노드 하나가 CTE 하나로
컴파일됩니다.

`direction`은 **세 값**입니다: `HIGHER_IS_BETTER` · `LOWER_IS_BETTER` · `NEUTRAL`.
세 번째가 필요한 이유는 §4.4에 있습니다.

### 3.3 랩 도메인

| 테이블 | 역할 |
|---|---|
| `channel_model` | 에뮬레이트 채널 — CDL/TDL/GEOMETRIC/**FIELD_REPLAY** |
| `cell_config` | 시험 대상 셀 구성 — 밴드·대역폭·SCS·듀플렉스·MIMO |
| `ue_profile` | 에뮬레이트 UE — 릴리즈·대수·트래픽·이동성 |
| `du_endpoint` | **실물** DU 접속 — RF_CONDUCTED/RF_OTA/FRONTHAUL_ECPRI/**FRONTHAUL_ORAN_7_2X** |
| `test_campaign` / `test_run` | 캠페인과 런 (상태·진행률·판정·연결된 세션) |
| `run_criterion` | 합불 기준 — KPI·집계(MEAN/MIN/MAX/P05/P50/P95)·비교자·임계 |

에뮬레이트된 것과 실물인 것을 **런 레코드가 함께 보존**합니다. 채널 모델만 있고
DU 구성이 없으면 그 런은 재현 불가능하기 때문입니다.

### 3.4 워크북 도메인

| 테이블 | 역할 |
|---|---|
| `workbook` | 사용자가 구성한 탭 |
| `workbook_pane` | 그 탭의 페인 스택 — `CHART` 또는 `MAP` |
| `workbook_layer` | 페인 위의 KPI, **표시 여부**(`visible`), 그리고 **어느 측정을 그리는지**(`session_id`, null이면 지금 열린 것) |

**내장 탭은 데이터가 아니라 코드입니다.** 브링업 시퀀스·드릴다운 파이·임포트 폼처럼
페인이 아닌 것을 담고 있어서, 행으로 만들면 화면마다 페인 종류를 발명해야 하고 얻는
것이 없습니다. 이 테이블은 **추가되는 절반** — 레퍼런스에는 있고 우리에겐 없던 `+` —
을 담습니다.

`visible`이 소속과 별개인 것은 의도적입니다. 레퍼런스에서 레이어 체크를 풀면 트레이스가
숨을 뿐 잊히지 않으므로, 비교 계열을 켰다 껐다 하는 데 체크 한 번이면 됩니다. 둘을
합치면 "잠깐 숨기기"가 파괴적인 동작이 됩니다.

`session_id`가 레이어에 있는 것도 같은 종류의 결정입니다(V12). 레이어가 주행을 지목할 수
있어야 워크북이 **한 주행의 뷰가 아니라 비교의 배치**가 되고, 그 지목은 화면 상태가 아니라
**저장된 배치의 일부**여야 합니다 — 두 주행을 놓고 짠 워크북이 다시 열 때 한 주행으로
돌아온다면 그것은 저장된 적이 없는 것입니다. null은 "지금 열린 측정"이고, 그래서 지목하지
않은 워크북은 예전처럼 **재사용 가능한 배치**로 남습니다.

브라우저가 아니라 **서버**에 둡니다. 문제를 쫓으며 만든 워크북은 동료에게 보낼 가치가
있고, 사이트 데이터를 지웠다고 사라져서는 안 됩니다.

### 3.5 임포트 도메인

`import_job` — 파일명·상태·읽은 행·적재 샘플/KPI 수·메시지.

임포트 본체는 트랜잭션이라 절반만 적재된 파일이 남지 않습니다. 그 롤백이 작업 기록까지
지워버리면 이력에 **성공만** 남으므로, `ImportJobLog`가 기록을 분리합니다 — 실패 기록은
`REQUIRES_NEW`로 롤백을 넘겨 살아남고, 성공 기록은 방금 만들어진 세션을 참조해야 하므로
같은 트랜잭션에 참여합니다(별도 트랜잭션은 아직 커밋되지 않은 세션을 볼 수 없어 FK가
거부합니다).

---

## 4. 전체를 지탱하는 규칙

문서 여러 곳에 흩어져 있으면 깨지기 쉬운 불변식들입니다. 여기에 모읍니다.

### 4.1 색상 스케일이 시각 언어의 전부다

지도 경로 색상, 파라미터 그리드의 셀 강조, 범례의 건수·비율, 자동 열화 탐지가
**모두 `kpi_threshold`에서 파생**됩니다. 그래서 스케일을 바꾸면 다섯 화면이 함께
다시 칠해져야 하고(프론트엔드는 `scaleVersion` 카운터로 이를 강제), 스케일 검증이
곧 화면 정합성 검증이 됩니다.

기본 구간의 근거(무엇이 확인됐고 무엇이 자체 기본값인지)는
`keysight-vdt-research.md` §11.3.3~§11.3.5에 출처와 함께 기록되어 있습니다.

**그리는 방식은 두 가지입니다**(V12, `kpi_definition.scale_type`). `NUMERICAL`은 구간마다
한 색이고, `GRADIENT`는 그 사이를 보간합니다 — 도시를 가로지르는 RSRP처럼 실제로 매끄러운
양은 구간 사다리가 **읽으려던 모양을 계단으로 지워 버리기** 때문입니다. 보간은 별도의
정지점이 아니라 **구간 자체에서** 만들어집니다(`ColourRamp`): 각 구간이 자기 중점에 자기
색을 놓으므로, 구간 한가운데 값은 사다리가 줬을 색을 **정확히** 받고 움직임은 경계에서만
일어납니다 — 사다리가 거짓말을 하고 있는 바로 그 자리입니다. 그래서 옆의 범례와 어긋날 수
없습니다.

이름을 키로 하는 색상 집합(레퍼런스의 *string colour set*)은 **이벤트 타입 레지스트리**가
맡습니다. 색을 바꾸면 지도 마커·차트 눈금·도크·파이가 함께 바뀝니다 — 넷이 한 레지스트리를
읽기 때문이고, 그것이 이 구조를 가진 유일한 이유입니다.

### 4.2 구간이 아니라 경계를 편집한다

스케일은 **맞닿은 사다리**입니다: 첫 구간은 -∞에서 열리고, 마지막은 +∞에서 닫히며,
인접 구간은 반드시 경계를 공유합니다. 서버(`ThresholdScale.validate`)가 이를 강제하고
UI는 경계 숫자만 편집하게 합니다.

이유는 실패 양상에 있습니다. 빈틈이 생기면 어떤 값이 **어느 구간에도 속하지 않고**,
그 증상은 경로가 조용히 회색으로 변하는 것뿐이라 사용자가 원인을 추적할 방법이
없습니다. 경계만 편집하면 그 상태 자체가 표현 불가능해집니다.

라벨은 비워서 보내면 **서버가 경계에서 파생**합니다(`>= -80`, `< -80 and >= -90`).
API는 호출자가 보낸 라벨도 그대로 저장하므로, 경계와 라벨이 어긋날 수 없게 만드는 것은
**편집기가 항상 빈 라벨을 보내는 것**입니다. 다른 클라이언트를 붙일 때 지켜야 할 규약입니다.

### 4.3 파생 스케일은 세션 전체에서, 심각도는 주장하지 않는다

임계값이 없는 KPI는 `AutoScale`이 사분위수 4구간을 만들고 1-2-5 사다리로 반올림합니다.
두 가지가 산술보다 중요합니다.

- **세션 전체에서 도출합니다.** 필터 구간의 분위수를 쓰면 필터를 움직일 때마다 경계가
  따라 움직여, 같은 값이 필터에 따라 색이 바뀌고 두 구간을 비교할 수 없게 됩니다.
  필터는 **건수만** 바꿉니다.
- **파생 구간은 전부 `NORMAL`입니다.** 분위수는 "이 주행 안에서 어디쯤"이지
  "나쁘다"가 아닙니다. 전 구간이 우수한 주행에도 하위 25%는 존재합니다.

파생 스케일은 고정 스케일과 화면상 구별되지 않으므로 **범례가 명시**합니다.

### 4.4 방향은 "어느 끝이 좋은가"와 "좋은 끝이 있는가"를 함께 답한다

카운터와 부하 지표(패킷 수, 접속 단말 수)에는 좋은 끝이 없습니다. 이들에 상태 램프
(녹→적)를 씌우면 측정이 하지 않은 판단을 주장하게 됩니다.

- **파생 스케일**에서 `NEUTRAL`은 단일 색조 순차 램프를 받습니다. 고정 임계값이 설정된
  `NEUTRAL` KPI는 그 임계값이 지시하는 색을 그대로 씁니다 — 시드의 `DU_ACTIVE_UES`·
  `FH_RX_TOTAL`은 "값이 0인가"만 붉게 표시하는 2구간 스케일을 가집니다.
- **비교 판정**에서는 두 평균이 실제로 다를 때 `NO VERDICT`가 됩니다. 한쪽에 데이터가
  없으면 `NO DATA`가, 차이가 0.01 미만이면 `SAME`이 먼저 적용됩니다.

### 4.5 생성 SQL에 사용자 입력이 문자열로 들어가지 않는다

`KpiSql`은 구간 경계를 **숫자 리터럴**로만 방출하고, 심각도는 `[A-Z_]{1,20}` 형태 검사를
통과한 것만 SQL에 넣습니다(주입 차단). 값 자체를 `NORMAL`·`WARNING`·`CRITICAL`로 제한하는
**폐쇄 어휘 검증은 저장 시점의 `ThresholdScale.validate`**가 담당합니다. KPI 이름은 `KpiDefinitionForm`이 `[A-Z][A-Z0-9_]*`로 제한합니다
(이름은 조인 키이자 생성 SQL에 도달하므로). `ExportService`도 리터럴 가드를 둡니다.

### 4.6 전역 필터는 절이 하나여야 검사할 수 있다

`GlobalFilter`가 내놓는 것은 `<alias>.seq IN (SELECT seq FROM …)` **한 절**입니다. 조인이나
컬럼별 WHERE 조각이 아닌 이유는 성능이 아니라 **검사 가능성**입니다.

이 스키마의 분석은 전부 세션 하나 안에서 `seq`로 매여 있으므로, 그 절은 질의가 무엇을
select·join·group by 하든 끼워 넣기만 하면 됩니다. 그래서 "이 엔드포인트가 필터를
지키는가"가 **예/아니오로 답할 수 있는 질문**이 되고, `GlobalFilter.coverage()`가 그 답의
목록이 되며, `verify-scenarios` S20이 목록을 읽어 각 엔드포인트를 두 번 호출한 뒤
**모든 표본 수가 하나의 값으로 모이는지**를 봅니다.

연산자는 `>=` `<=` `!=` `>` `<` `=` **여섯 개 허용 목록**에서만 나옵니다. `value ? ?`는
비교가 아니므로 연산자만은 파라미터가 될 수 없고, 사용자 입력 중 유일하게 문자열로 SQL에
닿는 부분이라 §4.5와 같은 규칙을 따릅니다. KPI 이름과 값은 평범한 바인딩입니다.

면제된 여덟 엔드포인트는 **목록에 이유와 함께** 실려 화면에서 읽힙니다. 지키지 못하는 것이
문제가 아니라 **지키지 못한다는 사실이 보이지 않는 것**이 문제이기 때문입니다.

---

## 5. API

`/api` 하위 전체입니다. 오류 규약은 다음과 같습니다.

- **알 수 없는 KPI 이름** → **400** `{error, message}`. KPI를 받는 모든 엔드포인트에 적용됩니다
  (`export.geojson`은 검증을 빠뜨려 200에 전부 `null`인 파일을 내주고 있었습니다 — 문서를
  쓰다 발견해 고쳤습니다).
- **필수 파라미터 누락** → 400이지만 Spring 기본 본문이라 `message`가 없습니다.
- **없는 세션** → `GET /sessions/{id}`, `/snapshot`, `DELETE /sessions/{id}`, `/compare`만
  **404**입니다. 나머지 세션 범위 엔드포인트는 **200에 빈 결과**를 돌려줍니다 — 분석 쿼리가
  `session_id`로 걸린 평범한 SQL이라 행이 없을 뿐이기 때문입니다. 프론트엔드는 `res.ok`가
  아니면 던지므로, 사라진 세션 id는 오류가 아니라 **빈 화면**으로 나타납니다.

`ApiExceptionHandler`가 매핑하는 것은 `NoSuchElementException`/`EmptyResultDataAccessException`
→ 404, `IllegalArgumentException` → 400 두 가지입니다.

### 분석

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/sessions` | 세션 목록 (샘플·이벤트 수, 노트 포함) |
| GET | `/sessions/{id}` | 세션 하나 |
| DELETE | `/sessions/{id}` | 세션과 모든 데이터 삭제 |
| GET | `/sessions/{id}/track?kpi&maxPoints` | 지도 경로 (색상 구간 포함, 서버 데시메이션) |
| GET | `/sessions/{id}/series?kpis&maxPoints` | 시계열 (min/max 포락선 데시메이션) |
| GET | `/sessions/{id}/snapshot?seq` | 커서 시점 전 KPI 값 + 심각도 |
| GET | `/sessions/{id}/distribution?kpi&fromSeq&toSeq` | 범례 = 구간별 건수·비율 |
| GET | `/sessions/{id}/statistics?kpi&fromSeq&toSeq` | 요약 통계 + 101점 CDF |
| GET | `/sessions/{id}/degradations?kpi&minSamples&fromSeq&toSeq` | 연속 열화 구간 |
| GET | `/sessions/{id}/events` · `/messages` · `/cells` | 이벤트 · L3 메시지 · 셀 목록 |
| GET | `/global-filter/coverage` | 전역 필터를 **지키는 엔드포인트와 면제 사유** 목록. 상태바와 검사기가 같은 목록을 읽습니다 |
| GET | `/global-filter/describe?filter=` | 조건을 말로 풀어 씁니다. 문법 검증도 겸합니다(400) |
| GET | `/sessions/{id}/area-statistics?polygon=` | 지도에 그린 도형 안의 통계 + **통과 목록**. 짝홀 광선 판정을 SQL에서 (PostGIS 없음) |
| GET | `/sessions/{id}/spatial-diff?other=` | 두 주행을 **하나의 격자**에 담아 타일별 차분 |
| GET | `/compare?a&b&kpis` | 두 세션 KPI별 통계·판정 |

> **`filter=`는 위 표의 대부분과 아래 표의 일부가 함께 받습니다** — `track` · `series` ·
> `distribution` · `statistics` · `cell-breakdown` · `degradations` · `area-statistics` ·
> `bins` · `cell-footprints` · `export.csv` · `export.geojson` · `report.html` 열둘입니다.
> 어느 것이 받고 어느 것이 받지 않는지는 문서가 아니라 `/global-filter/coverage`가 답합니다.

### 공간·내보내기

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/sessions/{id}/bins?kpi&sizeMeters` | 영역 비닝 — "여기 신호가 어떤가" |
| GET | `/sessions/{id}/distance-bins?kpi&stepMeters` | **거리 비닝** — "도로 단위로 무엇을 봤나". 신호등에 선 정차가 평균을 끌어당기지 않습니다 |
| GET | `/sessions/{id}/cell-footprints?minSamples` | **셀별 측정 서빙 영역**(볼록 껍질) |
| GET | `/sessions/{id}/monitored-set?seq` | 커서 시점 모니터드 셋 |
| GET | `/sessions/{id}/neighbour-breakdown` | 드라이브 전체 셀 검출 요약 (p95·검출률·서빙률) |
| GET | `/sessions/{id}/pilot-pollution` | 경합 셀 구간 |
| GET | `/sessions/{id}/coverage-issues?weakRsrpDbm&poorSinrDb&overshootKm` | 커버리지 문제 자동 탐지 (기본 -105 dBm · 0 dB · 3 km) |
| GET | `/sessions/{id}/export.csv` | 전 KPI 피벗 CSV (스트리밍) |
| GET | `/sessions/{id}/export.geojson?kpi` | 지리 데이터 |

### KPI 카탈로그

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/kpi-definitions` | 전체 카탈로그 (구간·`seeded` 플래그 포함) |
| POST | `/kpi-definitions` | KPI 정의 생성 |
| DELETE | `/kpi-definitions/{name}` | KPI와 그 값 삭제 (시드 KPI는 거부) |
| PUT | `/kpi-definitions/{name}/thresholds` | 색상 스케일 저장 |
| DELETE | `/kpi-definitions/{name}/thresholds` | 고정 스케일 해제 → 자동 스케일 |
| POST | `/kpi-definitions/{name}/thresholds/reset` | 시드 기본값 복원 |

### 랩

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/lab/channel-models` · `/cell-configs` · `/ue-profiles` · `/du-endpoints` | 구성 카탈로그 |
| GET | `/lab/campaigns` · `/lab/runs?campaignId` · `/lab/runs/{id}` | 캠페인·런 |
| POST | `/lab/runs` · `/lab/runs/{id}/start` · `/lab/runs/{id}/evaluate` | 런 생성·시작·판정 |

### 임포트

| 메서드 | 경로 | 용도 |
|---|---|---|
| POST | `/import/csv` (multipart) | CSV 적재. `file`(필수), 선택 `sessionName`·`device`·`operator`·`technology`·`delimiter`(기본 `,`)·`createUnknownColumns`(기본 false — 켜면 미인식 컬럼을 KPI로 정의) |
| GET | `/import/jobs` | 임포트 이력 |

---

## 6. 검증 구조

세 검사기가 **서로 다른 실패 계열**을 담당합니다. 어느 하나도 나머지를 대신하지 못합니다.

| 검사기 | 잡는 것 | 규모 (2026-09-02) |
|---|---|---|
| `scripts/verify-ui.mjs` | 개별 동작 회귀 | 125개 |
| `scripts/verify-scenarios.mjs` | 여정 회귀 — 단계 간 상태가 이어짐 | 184단계 / 20 시나리오 |
| `tools/uxtest/api-surface.mjs` | **로직은 있는데 뷰가 없는** 격차 | 엔드포인트 · 클라이언트 · KPI 도달성 |
| `mvn test` | SQL을 조립하는 코드와 기하 | 47개 단위 테스트 |

단위 테스트가 **네 곳**에만 있는 것은 의도적입니다. 나머지 코드는 값을 파라미터로
바인딩하므로 다른 질의를 실행하도록 유도될 수 없지만, `KpiGraph`와 `GlobalFilter`는 사용자
입력이 질의의 **모양**을 정하고(전자는 구조, 후자는 연산자), `convexHull`은 사용자가 커버리지
주장으로 읽을 도형을 만들며, `ColourRamp`는 범례와 어긋나면 지도 전체가 조용히 틀려집니다.
넷 다 주석으로 "안전하다"고 말하는 것으로는 부족합니다.

세 번째가 왜 별도인지는 실제 사례가 답합니다: 임계값 저장 엔드포인트는 유니크 인덱스
위반으로 **한 번도 동작한 적이 없었지만**, 호출하는 뷰가 없어 아무도 몰랐습니다.
쓰이지 않는 코드는 틀려도 아무도 모릅니다.

단언을 추가하는 규칙(결함 주입으로 실패를 먼저 증명할 것 등)은
[`.claude/skills/verify-frontend/SKILL.md`](../.claude/skills/verify-frontend/SKILL.md)에,
방법론의 근거와 실측은 [`ui-testing/README.md`](./ui-testing/README.md)에 있습니다.
시나리오 카탈로그와 검증이 잡아낸 결함 목록은
[`scenario-verification.md`](./scenario-verification.md)에 있습니다.

---

## 7. 런타임

| 항목 | 값 |
|---|---|
| 백엔드 | `:8080`, 실행 가능 JAR |
| 프론트엔드 | `:4173`, **빌드 산출물**을 서빙 |
| DB 마이그레이션 | Flyway, 기동 시 자동 (`V1` 스키마 → `V2` 파티셔닝·랩 도메인 → `V3` 미사용 테이블 제거 → … → `V10` 이벤트 타입 레지스트리 → `V11` 임포트 취소 → `V12` 색상셋 종류·이벤트 색 재정의·레이어의 측정) |
| 시드 | 빈 DB에서만 실행. 4개 세션(도심 2빌드·고속도로·프론트홀 주입)과 랩 캠페인 |
| 압축 | 응답 gzip |

### 7.1 두 가지 기동 방식

| | 컨테이너 | 호스트 직접 |
|---|---|---|
| 기동 | `docker compose up -d --build` | `scripts/backend.sh start` · `scripts/frontend.sh start` |
| 정지 | `docker compose down` (`-v`면 데이터까지) | `scripts/*.sh stop` |
| 정적 서빙 | nginx | `vite preview` |
| DB | `postgres:16-alpine` 컨테이너, 이름 있는 볼륨 | 호스트 PostgreSQL |
| 설정 | `.env` (`.env.example` 참고) | 환경변수 또는 `application.yml` 기본값 |

포트를 양쪽 모두 `:8080`/`:4173`으로 맞춘 것은 의도적입니다. §6의 세 검사기가
`BASE`/`API`를 그대로 둔 채 어느 쪽 스택에도 붙습니다.

호스트 방식의 프로세스 관리는 **pid 파일 기반**입니다. `pgrep -f`로 죽이면 스크립트를
실행 중인 셸까지 매칭되므로 쓰지 않습니다.

### 7.2 컨테이너 구성

세 서비스가 순서대로 올라오며, 각 단계는 **앞 단계가 healthy가 된 뒤에** 시작합니다.

```
db (postgres:16-alpine)   pg_isready -U vdt -d vdt
  └─ backend              wget /api/sessions   ← 스키마 + 시드까지 끝나야 200
       └─ frontend        wget /
```

- **백엔드 이미지**: Maven 빌드 스테이지 → JRE 런타임 스테이지. 런타임에는 JDK도
  빌드 도구도 없고, 비루트 사용자(`vdt`)로 실행합니다. 힙은 `-XX:MaxRAMPercentage=75`로
  **컨테이너 메모리 한도**에서 잡습니다 — 이 플래그는 한도가 실제로 걸려 있을 때만
  의미가 있으므로(한도가 없으면 JVM이 호스트 RAM을 읽습니다) compose가
  `mem_limit`(`BACKEND_MEMORY`, 기본 2 GB)를 함께 지정합니다. 분석 부하 실측은
  약 350 MB입니다.
- **Maven 로컬 저장소**는 `/root/.m2`가 아니라 `/m2` 캐시 마운트입니다. `/root/.m2`
  위에 마운트하면 미러용 베이스 이미지가 거기 넣어둔 `settings.xml`을 가리게 되는데,
  그건 `MAVEN_IMAGE`를 둔 목적과 정면으로 어긋납니다.
- **`# syntax=` 지시자는 쓰지 않습니다.** 그 줄은 build arg로 바꿀 수 없는
  docker.io 이미지를 강제로 당겨오므로, 역시 미러 전용 환경에서 베이스를 갈아끼울 수
  있게 한 의도를 깹니다. 쓰는 기능(`RUN --mount=type=cache`)은 Docker 23+의 기본
  프런트엔드가 이미 지원합니다.
- **프론트엔드 이미지**: `npm ci` → `vite build` → nginx가 `dist/`를 서빙.
  `npm run build`가 `tsc -b`를 포함하므로 **타입 오류는 이미지 빌드를 실패시킵니다.**
- **`/api` 프록시**: 개발 중에는 `vite preview`가, 컨테이너에서는 nginx가 같은 일을
  합니다(`frontend/nginx/default.conf`). 덕분에 프론트엔드는 어느 쪽에서도 상대경로
  `/api`만 호출하며(`api/client.ts`), 환경마다 달라지는 빌드타임 API URL이 없습니다.
  업스트림은 Docker 내장 DNS로 **주기적으로 재확인**합니다(`valid=10s`). 설정 로드
  시점에 IP를 고정하지 않으므로, 백엔드 컨테이너를 새로 만들어 IP가 바뀌어도 nginx를
  재시작할 필요 없이 최대 10초 안에 따라갑니다.
- **베이스 이미지는 build arg**입니다(`MAVEN_IMAGE`, `JRE_IMAGE`, `NODE_IMAGE`,
  `NGINX_IMAGE`). 사설 레지스트리 미러나 사내 CA를 넣은 베이스를 써야 하는 빌드가
  Dockerfile을 고치지 않고 갈아끼울 수 있습니다. 값을 주지 않으면 Dockerfile의
  기본값이 그대로 쓰입니다.

### 7.3 준비 완료의 의미

시드는 `ApplicationRunner`가 아니라 `SmartInitializingSingleton`에서 돕니다. 순서가
핵심입니다 — `ApplicationRunner`로 두면 시드가 **Tomcat이 listen을 시작한 약 2.5초 뒤**에
끝나므로, `/api/sessions`의 200을 준비 완료로 읽는 쪽(컨테이너 HEALTHCHECK,
`scripts/backend.sh`, `docker compose up` 직후 실행한 검사기)이 **빈 DB를 상대로
green이 될 수 있었습니다.**

`ContextRefreshedEvent`도 늦습니다. Spring Boot는 웹 서버를 `finishRefresh()` 안의
`SmartLifecycle`에서 띄우는데, 그 이벤트는 그보다 나중에 발행됩니다. 반면
`SmartInitializingSingleton`은 여전히 빈 팩토리 초기화 안이라 웹 서버보다 확실히
앞섭니다. 로그로 확인되는 순서는 `Seed complete …` → `Tomcat started on port 8080`.

---

## 8. 의도적으로 하지 않은 것

| 항목 | 이유 |
|---|---|
| 인증·멀티유저 | POC 범위 밖. 다만 스키마 수준 결정이 필요한 항목이라 리서치 어젠다에 있음 |
| 벤더 바이너리 로그(DLF 등) 파싱 | 대형. CSV 경로와 표시명 동의어 매핑으로 실용 범위를 먼저 확보 |
| 랩 런 실행기 | 실물 장비 연동 스텁 설계가 선행되어야 함. 현재 랩 화면은 읽기·판정 전용 |
| 파생 KPI 수식 | 사용자 정의 KPI의 남은 절반 |
| 사전 집계 테이블 | `kpi_rollup`을 만들었다가 **제거**했습니다. 200 device-hours 실측에서 직접 집계가 충분했고, 쓰이지 않는 스키마는 오해만 남깁니다 |

기능 격차의 전체 목록과 우선순위는 [`gap-analysis.md`](./gap-analysis.md),
다음 리서치 항목은 [`research-agenda.md`](./research-agenda.md)에 있습니다.

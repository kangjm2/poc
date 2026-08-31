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
│    └── LegendEditor    색상 스케일 편집 (모달)                     │
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
| `network_event` | 핸드오버·RACH·결함 등 | 심각도 포함 |
| `signaling_message` | L3/RRC·M-plane 메시지 | 방향·프로토콜·본문 |

`sample_kpi`는 **좁은 세로형**(`session_id, seq, ts, kpi_name, value`)입니다. KPI마다
열을 만드는 가로형이면 KPI를 추가할 때마다 스키마가 바뀌고, 참조 도구가 수천 종을
다룬다는 점에서 유지될 수 없습니다. 세로형이기 때문에 **§4.4의 사용자 정의 KPI가
스키마 변경 없이** 동작합니다.

파티션 키를 `session_id`로 잡은 이유와 그 대가(보존 정책에는 `RANGE(ts)`가 유리)는
`architecture-and-scale.md` §3.3에 기록되어 있습니다.

### 3.2 KPI 카탈로그

| 테이블 | 역할 |
|---|---|
| `kpi_definition` | 이름·표시명·단위·분류·기술·**방향**·출처(UE/DU/FRONTHAUL/SCANNER)·소수 자릿수 |
| `kpi_threshold` | 색상 구간 사다리 — 경계·색상·라벨·심각도, `(kpi_name, ordinal)` 유니크 |

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

### 3.4 임포트 도메인

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
| GET | `/compare?a&b&kpis` | 두 세션 KPI별 통계·판정 |

### 공간·내보내기

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/sessions/{id}/bins?kpi&sizeMeters` | 영역 비닝 |
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

| 검사기 | 잡는 것 | 규모 |
|---|---|---|
| `scripts/verify-ui.mjs` | 개별 동작 회귀 | 30개 |
| `scripts/verify-scenarios.mjs` | 여정 회귀 — 단계 간 상태가 이어짐 | 75단계 / 11 시나리오 |
| `tools/uxtest/api-surface.mjs` | **로직은 있는데 뷰가 없는** 격차 | 엔드포인트 · 클라이언트 · KPI 도달성 |

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
| DB 마이그레이션 | Flyway, 기동 시 자동 (`V1` 스키마 → `V2` 파티셔닝·랩 도메인 → `V3` 미사용 테이블 제거) |
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
  빌드 도구도 없고, 비루트 사용자(`vdt`)로 실행합니다. 힙은 `-XX:MaxRAMPercentage`로
  호스트 RAM이 아니라 **컨테이너 한도**에서 잡습니다.
- **프론트엔드 이미지**: `npm ci` → `vite build` → nginx가 `dist/`를 서빙.
  `npm run build`가 `tsc -b`를 포함하므로 **타입 오류는 이미지 빌드를 실패시킵니다.**
- **`/api` 프록시**: 개발 중에는 `vite preview`가, 컨테이너에서는 nginx가 같은 일을
  합니다(`frontend/nginx/default.conf`). 덕분에 프론트엔드는 어느 쪽에서도 상대경로
  `/api`만 호출하며(`api/client.ts`), 환경마다 달라지는 빌드타임 API URL이 없습니다.
  업스트림은 Docker 내장 DNS로 **매 요청 재확인**하므로, 백엔드 컨테이너를 새로
  만들어 IP가 바뀌어도 nginx를 재시작할 필요가 없습니다.
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

# VDT Analyzer (POC)

기존 Keysight Nemo 계열 드라이브 테스트 도구 사용자를 대상으로, **쓰던 기능을 동등하게 제공하면서
기존 도구에 없던 인사이트를 더하는** 분석 웹 애플리케이션의 개념 검증입니다.

VDT 장비·소프트웨어 자체는 별도 저장소에서 개발되었으며, 이 저장소는 **분석 UI 계층**만 다룹니다.

## 문서

**처음 오셨다면**: 이 도구를 *쓰는* 분은 [`docs/user-guide.md`](docs/user-guide.md),
*고치는* 분은 [`docs/architecture.md`](docs/architecture.md)부터 보십시오.

| 문서 | 내용 |
|---|---|
| [`docs/user-guide.md`](docs/user-guide.md) | **사용자 가이드.** 작업별 안내 — 주행 분석, 빌드 비교, 랩 캠페인, 커버리지, 임포트, 색상 스케일, KPI 추가 |
| [`docs/architecture.md`](docs/architecture.md) | **아키텍처.** 구성 요소, 요청 흐름, 데이터 모델, API 전체, 전체를 지탱하는 설계 규칙 |
| [`docs/ui-gap-vs-reference.md`](docs/ui-gap-vs-reference.md) | **UI 격차 분석.** 실제 제품 스크린샷 대비 우리 화면을 요소 단위로 대조 |
| [`docs/keysight-vdt-research.md`](docs/keysight-vdt-research.md) | 기존 솔루션 리서치. 제품 구성, 아키텍처, KPI, 경쟁 지형, UI 구조, 시각 디자인 언어 |
| [`docs/requirements-analysis.md`](docs/requirements-analysis.md) | 기능 인벤토리(FR-xx), 추가 기능(NEW-xx), 화면 명세, 데이터 모델, 검증 기준 |
| [`docs/assets/MANIFEST.md`](docs/assets/MANIFEST.md) | 참고 자료 출처·취득 방법 |
| [`docs/architecture-and-scale.md`](docs/architecture-and-scale.md) | 데이터 수집, 가상 채널 + 실제 DU 시나리오, 대용량 처리 설계와 측정 결과 |
| [`docs/gap-analysis.md`](docs/gap-analysis.md) | Keysight 매뉴얼 및 경쟁 솔루션(VIAVI 등) 대비 기능 격차와 우선순위 |
| [`docs/verification.md`](docs/verification.md) | 검증 기록 |
| [`docs/scenario-verification.md`](docs/scenario-verification.md) | 시나리오 단위 E2E 검증 — 13개 사용자 여정과 검증이 잡아낸 결함들 |
| [`docs/research-agenda.md`](docs/research-agenda.md) | 다음 리서치 항목 (제품 19건 + 방법론 9건) |
| [`docs/ui-testing/README.md`](docs/ui-testing/README.md) | **(별도 주제)** UI 검증 기법 리서치 — 신호별 토큰 비용 실측, 결함 주입 매트릭스, UX-driven development 근거 검토 |
| [`docs/assets/NOTICE.md`](docs/assets/NOTICE.md) | 저작권 고지 및 구현 시 복제 금지 항목 |

`docs/poc-screenshots/`는 아래 검증 스크립트가 실제 브라우저에서 캡처한 이 앱의 화면입니다.

## 구성

```
backend/    Spring Boot 3.3 · Java 21 · JPA · Flyway · PostgreSQL 16 (+ Dockerfile)
frontend/   React 18 · TypeScript · Vite · Leaflet (차트는 자체 SVG 구현) (+ Dockerfile, nginx/)
scripts/    실행 및 검증 스크립트
docker-compose.yml   PostgreSQL + 백엔드 + 프론트엔드 스택
```

## 실행

### 컨테이너 (권장)

사전 요구: Docker Engine 24+ 와 Compose v2. 그 외에는 아무것도 설치하지 않습니다.

```bash
docker compose up -d --build      # http://127.0.0.1:4173
docker compose down               # 정지 (데이터 유지)
docker compose down -v            # 정지 + DB 볼륨 삭제
```

PostgreSQL·백엔드·프론트엔드 세 서비스가 순서대로 올라오며, 각각 앞 서비스가 healthy가
된 뒤에 시작합니다. 포트·DB 접속 정보·시드 여부는 `.env.example`을 `.env`로 복사해
바꿉니다. 구성 상세는 [`docs/architecture.md`](docs/architecture.md) §7.

### 호스트에서 직접

사전 요구: JDK 21, Node 20+, PostgreSQL 16.

```bash
# 1) DB 준비 (최초 1회)
sudo service postgresql start
sudo -u postgres psql -c "CREATE ROLE vdt LOGIN PASSWORD 'vdt' CREATEDB;"
sudo -u postgres createdb -O vdt vdt

# 2) 백엔드 — 스키마 마이그레이션과 시드 데이터가 최초 기동 시 자동 적용됩니다
(cd backend && mvn -B package -DskipTests)
./scripts/backend.sh start        # http://127.0.0.1:8080

# 3) 프론트엔드
(cd frontend && npm install)
./scripts/frontend.sh start       # http://127.0.0.1:4173
```

중지: `./scripts/backend.sh stop`, `./scripts/frontend.sh stop`

### 검증

세 검사기와 신호 측정 도구는 HTTP로만 붙으므로, 두 방식 중 어느 쪽으로 띄웠든 그대로
실행됩니다.

```bash
# 세 검사기가 서로 다른 실패 계열을 담당합니다
node scripts/verify-ui.mjs             # 개별 동작 85개
node scripts/verify-scenarios.mjs      # 사용자 여정 95단계 / 13 시나리오
node tools/uxtest/api-surface.mjs      # 로직은 있는데 뷰가 없는 격차
(cd backend && mvn test)               # SQL을 조립하는 코드와 기하 — 25개
node tools/uxtest/measure-signals.mjs  # (선택) 검증 신호별 비용 측정
```

### 부하 · 결함 주입 — 호스트 실행 방식 전용

아래 둘은 HTTP만으로는 부족해서, **컨테이너 스택에서는 그대로 동작하지 않습니다.**

```bash
./scripts/load-test.sh 25          # 200 device-hours 생성 후 응답시간 출력
./scripts/load-test.sh clean
node tools/uxtest/experiment.mjs   # 결함 주입 × 검출기 매트릭스
```

- **`load-test.sh`**: API가 아니라 **psql로 DB에 직접** 붙습니다. compose는 5432를
  의도적으로 공개하지 않으므로(`docker-compose.yml`의 `db` 서비스 주석) 컨테이너
  스택에서는 연결이 거부됩니다. 굳이 쓰려면 `db`에 `ports: ["5432:5432"]`를 열고
  `PGHOST`/`PGPORT`를 지정하십시오.
- **`experiment.mjs`**: `frontend/src`를 고쳐 **호스트에서** 다시 빌드한 뒤 `:4173`을
  관찰합니다. 컨테이너의 nginx는 이미지에 구워진 번들을 서빙하므로 호스트 재빌드가
  반영되지 않고, 주입한 결함이 전부 "미검출"로 **조용히 잘못 보고**됩니다.

## 시드 데이터

경로 손실 모델 + 상관 섀도잉으로 생성합니다. 서빙 셀은 가장 강한 사이트, SINR은 나머지 셀의 간섭에서,
처리량은 SINR에서 유도되므로 **KPI들이 실제 측정처럼 함께 움직입니다.**

| 세션 | 내용 |
|---|---|
| Oulu city centre — build 1.4.2 | 기준 측정. 지하차도 구간에 깊은 페이딩 포함 |
| Oulu city centre — build 1.5.0 | 동일 경로를 펌웨어 갱신 후 재측정 (비교용) |
| Oulu highway northbound | 사이트 밀도가 낮은 고속 주행 |
| Lab fronthaul replay — O-DU under test | **O-RAN 7.2x 프론트홀로 주입된 랩 실행.** 중간에 타이밍 창 결함이 있으며, 그 구간에서 무선 KPI는 정상인 채 프론트홀 KPI만 악화됩니다 |

대용량 검증용 데이터는 `./scripts/load-test.sh 25`로 생성합니다 (25 × 8시간 = 200 device-hours,
940만 KPI 행). `./scripts/load-test.sh clean`으로 제거합니다.

## API

전체 엔드포인트 표는 [`docs/architecture.md`](docs/architecture.md) §5에 있습니다. 계열만 적으면:

| 계열 | 예 |
|---|---|
| 분석 | `/api/sessions/{id}/track` · `/series` · `/snapshot` · `/distribution` · `/statistics` · `/degradations` · `/compare` |
| 공간·내보내기 | `/bins` · `/coverage-issues` · `/export.csv` · `/export.geojson` |
| KPI 카탈로그 | `/api/kpi-definitions` (생성·삭제, 임계 구간 저장·해제·복원) |
| 랩 | `/api/lab/campaigns` · `/runs` · `/runs/{id}/evaluate` |
| 임포트 | `/api/import/csv` · `/api/import/jobs` |

## 설계상 중요한 선택

**1. 임계 구간은 코드가 아니라 데이터입니다.** CSSR·DCR·HOSR 같은 지표는 3GPP가 정의한 양이 아니라
사업자 관행입니다. 따라서 구간 경계와 색상은 DB에 두고 런타임에 바꿀 수 있게 했습니다.

**2. 범례가 곧 분포 요약입니다.** 기존 도구의 Color Legends는 색상 키가 아니라 구간별 샘플 수와 비율을
보여주는 통계 패널입니다. 같은 성질을 기본 동작으로 두었습니다.

**3. 공유 시간 커서를 최상위 상태로 두었습니다.** 지도·그래프·그리드가 하나의 시각을 가리키는 것이
기존 사용자가 가장 많이 쓰는 조작이므로, 컴포넌트가 아니라 앱 상태로 관리합니다.

**4. `sample_kpi`는 좁은(narrow) 스키마이며 `session_id`로 해시 파티셔닝됩니다.** 기존 도구가
4,000종 이상의 L1–L3 KPI 통계를 다루므로 넓은 테이블로는 표현할 수 없습니다. 분석은 항상 세션 단위라
파티션 프루닝이 걸립니다. 상세와 측정치는 `docs/architecture-and-scale.md`.

**5. 집계는 전부 DB에서 수행합니다.** 분포·통계·열화 구간 모두 SQL로 계산하며, 응답은 서버에서
데시메이션합니다. 200 device-hours(1,300만 KPI 행, 4 GB)에서 모든 분석 엔드포인트가 200 ms 이내이며
최악은 `track` 193 ms입니다.

**6. UE 측과 네트워크(DU) 측 지표를 구분합니다.** 실제 DU가 피시험 대상이면 DU도 카운터를 냅니다.
UE 측만 보면 "이 단말이 힘들다"와 "이 셀이 혼잡하다"를 구분할 수 없습니다. 프론트홀 주입 시에는
`FH_RX_*` 계열이 추가되며, 이는 RF 경로에 대응물이 없는 KPI 계열입니다.

## 알려진 제약

- **배경 지도 타일**: 샌드박스 환경에서 브라우저의 `tile.openstreetmap.org` 접근이 차단되어 타일이
  표시되지 않습니다. 앱은 이를 감지해 안내 문구를 띄우고 격자 배경 위에 경로를 그립니다.
  일반 네트워크에서는 정상 동작합니다.
- **아직 없는 것**: 벤더 바이너리 로그(DLF 등) 파싱, 3D 시각화, 리포트 템플릿 생성,
  랩 런 실행기, 파생 KPI 수식. 전체 목록과 우선순위는 [`docs/gap-analysis.md`](docs/gap-analysis.md),
  다음 리서치 항목은 [`docs/research-agenda.md`](docs/research-agenda.md)에 있습니다.
  (CSV 임포트와 area binning은 이후 구현되었습니다.)

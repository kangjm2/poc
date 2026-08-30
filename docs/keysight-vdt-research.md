# Keysight Virtual Drive Test (VDT) 심화 리서치

> 목적: Keysight의 Virtual Drive Test 계열 툴의 UI/UX를 최대한 반영한 유사 툴을 설계·개발하기 위한 기반 문서.
> 작성일: 2026-08-30

## 0. 이 문서의 신뢰도 표기

리서치 환경의 네트워크 프록시가 `keysight.com` 및 다수 외부 도메인을 차단하고 있어
**공식 데이터시트 PDF와 실제 제품 스크린샷은 직접 열람하지 못했습니다.**
따라서 모든 항목에 근거 수준을 표기합니다.

| 표기 | 의미 |
|---|---|
| `[확인]` | 공개 문서·매뉴얼·제품 페이지 요약에서 직접 확인된 사실 |
| `[추론]` | 확인된 사실로부터 도출한 설계 해석. 검증 전 가설 |
| `[제안]` | 유사 툴 개발을 위한 필자의 설계 제안 |

§11에 미검증 항목과 후속 검증 방법을 정리했습니다.

---

## 1. 범위 확정 — VDT 계열이란 무엇인가

Keysight에서 "virtual driving test"는 두 갈래를 가리킬 수 있습니다.
이 문서는 **A. 무선(5G) 계열 Virtual Drive Test**를 다룹니다.

- **A. Virtual Drive Test (VDT)** — 실제 도로 주행 중 수집한 무선 측정 로그를
  랩 안에서 재현. 검증 대상은 **5G 단말·칩셋·네트워크**. ← 본 문서
- B. Autonomous Drive Emulation (ADE) — ADAS/자율주행 센서 에뮬레이션. 범위 외.

### 1.1 핵심 가치 제안 `[확인]`

> "현실 세계 로그를 테스트 워크플로우로 가져오는 유일한 솔루션."

필드 드라이브 테스트는 비싸고, 느리고, **재현 불가능**합니다. 같은 도로를 두 번 달려도
같은 무선 환경이 나오지 않습니다. VDT는 필드에서 한 번 캡처한 무선 환경을
랩 장비로 **반복 재생 가능한 시나리오**로 바꿔, R&D 단계에서 체계적 검증을 가능하게 합니다.

- 값비싼 필드 트라이얼 축소, 엔지니어 현장 투입 전 사전 검증 `[확인]`
- VoLTE, Carrier Aggregation, MIMO, 빔포밍, CoMP 등 신기술을 현실적 네트워크 조건에서 검증 `[확인]`
- NSA / SA 네트워크 모두 지원 `[확인]`

### 1.2 제품 라인업 `[확인]`

| 제품번호 | 이름 | 역할 |
|---|---|---|
| `S8709A` | 5G Virtual Drive Test Toolset | 통합 툴셋 (본 문서의 중심) |
| `C8709000A` | Virtual Drive Test Software | VDT 소프트웨어 라이선스 |
| `S8809A` | RF Field-to-Lab Toolset | 필드→랩 변환 툴셋 |
| `NTA50000B` | Nemo Outdoor 5G NR Drive Test Solution | 필드 캡처 (랩탑 기반) |
| `NTN50046C` | Nemo Analyze | 후처리·분석 (데스크톱) |
| `NTH50047B` | Nemo Handy | 핸드헬드 측정 |
| `S8800A` / `S8820A` | PROPSIM F64 / FS16 Channel Emulation Toolset | 채널 에뮬레이션 SW |
| PROPSIM F8/F32/F64/FS8/FS16 | RF Channel Emulator | 채널 에뮬레이션 HW |
| UXM 5G | Wireless Test Platform | 네트워크(시그널링) 에뮬레이션 |
| PathWave Lab Operations | 테스트 자동화 | 랩 운영·자동화 |

---

## 2. 엔드투엔드 워크플로우

VDT의 UX는 **선형 5단계 파이프라인**입니다. 이것이 모사 툴 IA의 뼈대가 됩니다. `[확인 + 추론]`

```
 ①  CAPTURE            ②  IMPORT            ③  AUTHOR
 필드 주행 측정   →   로그 임포트/변환   →   시나리오 저작
 Nemo Outdoor         VDT Toolset           VDT + PROPSIM
                                                  │
                                                  ▼
                      ⑤  ANALYZE          ④  EMULATE
                      후처리·리포트    ←    랩 재현(재생)
                      Nemo Analyze          PROPSIM + UXM 5G
```

### 단계별 상세

**① CAPTURE — 필드 캡처** `[확인]`
- 도구: Nemo Outdoor (랩탑 + 단말/스캐너), Nemo Handy (핸드헬드)
- 지원: 2G/3G/4G/5G NR, 300종 이상 단말·IoT 디바이스·스캐닝 리시버
- 산출물: GPS 궤적 + RF/프로토콜 KPI 시계열 + 이벤트 로그 (측정 파일)

**② IMPORT — 로그 임포트** `[확인]`
- 필드에서 캡처한 데이터를 VDT 테스트 시나리오로 임포트
- 지리 데이터(geographic data)로부터 이동성(mobility) 정보 추출

**③ AUTHOR — 시나리오 저작** `[확인]`
- 필드 측정 기반 **기하학적 채널 모델(geometrical channel model)** 생성
- high-capacity fading 옵션
- 사업자별 네트워크 능력을 재현하는 **시그널링 스크립트**
- 상관 페이딩(correlated fading), 멀티패스, 도플러, 이동성 파라미터 구성

**④ EMULATE — 랩 재현** `[확인]`
- PROPSIM 채널 에뮬레이터: 무선 채널 환경 재생
- UXM 5G: 네트워크 시그널링 이벤트 재생
- 결과: **신뢰성 있고 반복 가능한 재생(reliable and repeatable replay)**

**⑤ ANALYZE — 분석·리포트** `[확인]`
- Nemo Analyze로 후처리
- 원시 측정 데이터 → 자동 생성 결과(workbook)까지 자동화된 처리 체인

---

## 3. 사용자 롤(페르소나) `[추론]`

워크플로우 단계별로 실제 사용자가 다릅니다. 모사 툴에서 화면 권한/기본 진입점 설계에 영향.

| 롤 | 주 사용 단계 | 관심사 |
|---|---|---|
| **Field Engineer** | ① | 장비 연결 상태, 스크립트가 도는지, 커버리지 구멍 |
| **Channel Modeling Engineer** | ②③ | 채널 모델 정확도, 탭/도플러/경로손실 파라미터 |
| **Lab Validation Engineer (R&D)** | ④ | 재현 실행, 회귀 비교, DUT 동작 관찰 |
| **Analyst / Manager** | ⑤ | KPI 통계, 합격/불합격, 리포트 |

---

## 4. 화면별 UI 해부

여기가 이 문서의 핵심입니다. 공개 매뉴얼에서 확인된 실제 UI 구성요소를 정리했습니다.

### 4.1 Nemo Outdoor — 캡처/재생 화면 `[확인]`

**윈도우 구조**
- Main window (MDI 스타일 컨테이너)
- **Device Info window** — 연결된 단말/스캐너 정보
- **Output window** — 로그 출력
- **Script Status window** — 자동 측정 스크립트 진행 상태
- Standard toolbar / Custom window toolbar
- **Status bar** — 현재 작업에 따라 가변 정보 표시. 툴바 버튼에 마우스를 올리면
  해당 기능 설명이 상태바에 표시 (컨텍스트 헬프)

**View Groups — 탭 기반 창 그룹화**
- 측정 윈도우를 탭으로 그룹화 (예: `Maps` 그룹, `Graphs` 그룹)
- 그래프와 맵을 동시에 여러 개 열 때 특히 유용
- 창은 view group에 **자동 저장**되어 다음 실행 시 그대로 복원

**Window(데이터 뷰) 종류**
- Graph (그래프)
- Grid (표) — 표시할 **이벤트/파라미터/통계를 사용자가 직접 선택**,
  특정 이벤트를 **컬러로 하이라이트** 가능
- Map (지도) — 파라미터별 색상 표현, 5G NR 빔을 **3D 맵**에 시각화하여
  건물·수목에 의한 감쇠 확인 및 빔 폭·커버리지 평가
- Custom window

**Workspace 직렬화**
- 여러 뷰 구성을 `.wor` 워크스페이스 파일로 저장
- 저장 범위에 **Color Set**과 **Map Window에서 선택한 Parameter**까지 포함
- File 메뉴: 워크스페이스 열기/저장, 디바이스 설정, **재생용 측정 파일 열기**

**설정 다이얼로그**
- Configuration Manager
- **Color Set Editor** — 값 구간 → 색상 매핑 편집
- User Interface Properties

**장비 상태 표시**
- Device Status 창에서 **녹색 등이 점멸**하면 정상 연결·측정 준비 완료

**측정 모드**
- Manual mode — 사용자가 직접 조작
- Automated mode — **스크립트 기반**. 사용자를 대신해 데이터 전송/음성 통화를
  수립하고, 동일하거나 서로 다른 세션을 정해진 시간 동안 반복

**지원 테스트 종류**
음성 통화, 음성 품질, FTP/HTTP 데이터 전송, HTML 브라우징, 이메일,
iPerf, TWAMP(단방향 지연 계산 포함), Ping, SMS/MMS, 외부 애플리케이션 실행, Fast.com

**스케줄링**
- 측정 자동 스케줄링 지원. SMS·MMS·외부앱 실행·ping 세션을 자동 측정 시퀀스에 포함

**UI 철학** `[확인]`
> "완전히 커스터마이즈 가능한 UI를 통해 사용자가 자신의 용도에 맞게 Nemo Outdoor를 재단할 수 있다."

---

### 4.2 Nemo Analyze — 분석 화면 `[확인]`

VDT 계열 중 **모사 가치가 가장 높은 UI**입니다. 인터랙션 모델이 명확합니다.

**좌측: Workspace View**
- `Measurement file` 페이지 — 측정 파일 목록
- **Parameter Tree** — 계측 파라미터 계층 트리
- Parameter Tree 상단에 **filter 입력 필드** (긴 목록에서 특정 파라미터 검색)

**중앙: Workbook**
- **완전 커스터마이즈 가능한, 시간 동기화된 멀티페이지 workbook**
- 생성 흐름: `View → Workbook → Add Data View` → 데이터 뷰 종류 선택 →
  측정 선택 → **Parameter Tree에서 파라미터를 뷰로 드래그**
- 같은 데이터 뷰에 여러 파라미터를 드래그해 겹쳐 볼 수 있음
- Parameter Tree에서 **우클릭 → 뷰 타입 선택** 시 다른 종류의 뷰로 즉시 열기
- 맵에 표시: Workspace view의 Measurement file 페이지에서 파일 선택 →
  Parameter Tree에서 파라미터 선택 → **맵 위로 드래그**

**데이터 뷰 종류**
maps · grids · line graphs · bar graphs · pie charts · surface grids · color grids · spreadsheets · numerical views

**분석 기능**
- 커스텀 대시보드 — 분석 워크플로우에 맞게 적응
- **Playback workbook** — 주요 메트릭/KPI가 미리 배치된 재생용 워크북
- 미리 만들어진 **리포트 템플릿** 세트
- **SSB 빔 footprint 자동 플로팅 루틴** (모든 빔에 대해 자동)
- 다른 Nemo 툴과 연동해 원시 측정 데이터 → 자동 생성 workbook 결과까지 완전 자동 처리 체인
- 플랫폼: Windows 10/11 64-bit 데스크톱

---

### 4.3 PROPSIM Channel Emulation Toolset — 채널 저작 화면 `[확인]`

- **위저드(wizard) 기반 GUI** — 단계별 안내로 테스트 시나리오 생성·편집
- 다중 채널에 대해 **fading, Doppler 등 채널 파라미터를 채널별로 독립 제어**
- **Route(경로) 정의 및 시뮬레이션** (Aerospace 옵션에서는 비행 경로 정의)
- 사전 정의된 **shadowing 프로파일** 또는 **사용자 정의 path loss 프로파일**의 유연한 제어
- 2D/3D 빔포밍 채널 에뮬레이션, 단일/다중 사용자 시나리오, 고속철도(high-speed train) 시나리오
- **PROPSIM Geometric Channel Modeling (GCM)** 툴 — 기하학적 채널 모델링
- 정교한 채널 모델링 애플리케이션 + 사용하기 쉬운 에뮬레이션 제어 소프트웨어로
  빠르게 테스트를 시작하고 새 시나리오 기반 테스트 케이스를 생성

---

### 4.4 VDT Toolset — 통합 레이어 `[확인]`

개별 툴 위에 얹히는 통합 계층. 사용자가 보는 것:
- 필드 캡처 데이터의 테스트 시나리오 임포트
- **필드 측정 기반 기하학적 채널 모델** 접근 (high-capacity fading 옵션 포함)
- 사업자별 네트워크 능력을 재현하는 **시그널링 스크립트**
- 상관 페이딩 · 멀티패스 · 도플러 · 지리 데이터 기반 이동성을 포함한 복합 RF 조건 시뮬레이션
- 계측기와 테스트 환경을 **단일 랩 솔루션 아래 통합**

---

## 5. 추출한 UI/UX 패턴 12가지

모사 툴에서 반드시 재현해야 할 핵심 패턴입니다. 근거는 §4.

| # | 패턴 | 근거 | 모사 우선순위 |
|---|---|---|---|
| 1 | **도킹 가능한 멀티 윈도우 + 탭 그룹(View Groups)** | 4.1 | ★★★ |
| 2 | **워크스페이스 직렬화** (레이아웃 + 컬러셋 + 선택 파라미터를 파일로) | 4.1 | ★★★ |
| 3 | **Parameter Tree + 필터 + 드래그앤드롭** | 4.2 | ★★★ |
| 4 | **우클릭 → 뷰 타입 전환** (같은 데이터, 다른 표현) | 4.2 | ★★★ |
| 5 | **단일 타임라인 동기화** (맵 커서 ↔ 차트 커서 ↔ 로그 행) | 4.2 | ★★★ |
| 6 | **Playback을 1급 모드로** (Live / Playback 이원 모드) | 4.1, 4.2 | ★★★ |
| 7 | **Color Set Editor** (값 구간 → 색 매핑을 사용자가 편집) | 4.1 | ★★ |
| 8 | **이벤트 컬러 하이라이팅 + 이벤트 스트림** | 4.1 | ★★ |
| 9 | **장비 연결 상태 상시 표시** (녹색 점멸) | 4.1 | ★★ |
| 10 | **위저드 기반 시나리오 저작** | 4.3 | ★★ |
| 11 | **리포트 템플릿 + 자동 처리 체인** | 4.2 | ★ |
| 12 | **상태바 컨텍스트 헬프** (호버 시 기능 설명) | 4.1 | ★ |

### 관통하는 UX 원칙 `[추론]`

1. **하나의 타임라인, 모든 뷰 동기화.** 맵의 한 점, 차트의 한 시점, 로그의 한 행은
   모두 같은 시각(t)을 가리킨다. 사용자는 t를 스크럽하고 모든 뷰가 따라온다.
2. **데이터와 표현의 분리.** 같은 파라미터를 맵/그래프/그리드 어디로든 드래그할 수 있다.
   뷰는 파라미터의 렌더러일 뿐이다.
3. **레이아웃은 사용자 자산.** 엔지니어가 만든 화면 구성은 저장되고 공유된다.
4. **선형 파이프라인, 자유로운 화면.** 워크플로우(캡처→분석)는 선형이지만
   각 단계 안의 화면 구성은 완전히 자유롭다.

---

## 6. 모사 툴 정보구조(IA) 제안 `[제안]`

```
App
├── Home / Session Browser          세션 목록, 최근 항목, 새 세션
├── ① Capture (Live)                실시간 측정 (또는 시뮬레이티드 소스)
│   ├── Device panel                장비 연결 상태
│   ├── Script runner               자동 측정 스크립트 실행/진행
│   └── Live views                  맵 · 그래프 · 그리드 (도킹)
├── ② Import                        로그 임포트 · 파싱 · 검증
├── ③ Scenario Author               위저드
│   ├── Step 1  Source              소스 로그 선택 · 구간 트리밍
│   ├── Step 2  Route               경로 확인 · 지오 기준점
│   ├── Step 3  Channel Model       탭/도플러/경로손실/상관 페이딩
│   ├── Step 4  Signaling           네트워크 능력 · 시그널링 스크립트
│   └── Step 5  Review & Save       요약 · 검증 · 저장
├── ④ Replay (Playback)             재생 실행 + 실시간 관찰
│   ├── Transport bar               재생/일시정지/속도/시크
│   ├── Emulator status             채널 에뮬레이터 · 네트워크 에뮬레이터 상태
│   └── Live views                  ①과 동일한 뷰 시스템 재사용
├── ⑤ Analyze (Workbook)            멀티페이지 워크북
│   ├── Parameter Tree
│   ├── Data views                  맵/라인/바/파이/그리드/컬러그리드/숫자
│   └── Compare                     세션 A vs B 회귀 비교
└── Settings
    ├── Color Sets
    ├── KPI definitions
    └── Report templates
```

### 화면 골격 (Capture / Replay / Analyze 공통) `[제안]`

```
┌──────────────────────────────────────────────────────────────────┐
│ 시나리오명 │ 장비 상태 ● │ [▶ ‖ ■]  ├───────●────────┤  1.0x     │ ← 트랜스포트
├───────────┬──────────────────────────────────┬───────────────────┤
│ Parameter │  [Maps] [Graphs] [Protocol]      │  Inspector        │
│ Tree      │  ┌────────────────────────────┐  │  선택 대상의      │
│           │  │                            │  │  속성 편집        │
│ [filter]  │  │      Map / 3D View         │  │                   │
│ ▸ RF      │  │      (궤적 + 현재 위치)     │  │  · 채널 파라미터  │
│ ▸ PHY     │  └────────────────────────────┘  │  · 뷰 설정        │
│ ▸ Thrpt   │  ┌────────────────────────────┐  │  · 컬러셋         │
│ ▸ Events  │  │  KPI Chart Stack (동기화)   │  │                   │
│           │  └────────────────────────────┘  │                   │
├───────────┴──────────────────────────────────┴───────────────────┤
│  Event / Message Grid  (타임라인과 동기화, 컬러 하이라이팅)        │
├──────────────────────────────────────────────────────────────────┤
│ Status bar — 호버한 요소의 설명 · 현재 작업 진행 상황              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. 주요 화면 명세 `[제안]`

### 7.1 Scenario Author (위저드)

- **목적**: 필드 로그 → 재현 가능한 시나리오
- **레이아웃**: 좌측 단계 스테퍼, 중앙 단계 본문, 우측 실시간 요약 패널
- **핵심 인터랙션**
  - 지도에서 **구간 브러시 선택**으로 재현할 로그 구간을 잘라낸다
  - 채널 모델 단계에서 파라미터를 바꾸면 우측 미리보기(전력 지연 프로파일,
    도플러 스펙트럼)가 즉시 갱신된다
  - 마지막 단계에서 **검증 체크리스트** (경로 연속성, 결측 구간, 셀 정보 유무)
- **탈출구**: 어느 단계에서든 "고급 편집"으로 전체 파라미터 폼에 직접 접근

### 7.2 Replay Console

- **목적**: 시나리오 재생 실행 및 관찰
- **상단 트랜스포트 바**: 재생/일시정지/정지, 시크 슬라이더, 배속, 루프,
  현재 시각 · 경과 · 전체 길이
- **에뮬레이터 상태 스트립**: 채널 에뮬레이터 / 네트워크 에뮬레이터 / DUT 각각
  연결·동기 상태를 점(dot)으로. 녹색 점멸 = 정상 (패턴 9)
- **뷰 영역**: Capture와 **완전히 동일한 뷰 시스템**을 재사용
  (사용자가 두 모드에서 같은 워크스페이스를 쓸 수 있어야 함 — 패턴 2·6)

### 7.3 Analysis Workbook

- **목적**: 후처리·비교·리포트
- **좌측**: Parameter Tree (필터 필드 상단 고정)
- **중앙**: 페이지 탭이 있는 워크북. 각 페이지는 도킹 가능한 데이터 뷰 그리드
- **핵심 인터랙션**
  - 파라미터를 뷰로 **드래그** → 시리즈 추가
  - 파라미터 **우클릭** → "다른 뷰로 열기" 메뉴
  - 어떤 뷰에서든 커서를 움직이면 **모든 뷰의 커서가 동기화**
  - 맵에서 한 점을 클릭 → 해당 시각으로 전체 타임라인 점프
- **비교 모드**: 세션 A/B를 겹쳐 그리기, 델타 뷰

### 7.4 Color Set Editor

- **목적**: 값 → 색 매핑 정의 (RSRP 임계값별 색 등)
- 구간 리스트 + 색상 피커, 프리셋 저장/불러오기, 워크스페이스에 포함되어 저장

### 7.5 Device / Connection Panel

- 연결된 장비 카드 목록: 이름, 타입, 상태 점, 마지막 하트비트
- 연결 실패 시 원인과 조치를 인라인으로 표시

---

## 8. 데이터 모델 스케치 `[제안]`

```ts
type Session = {
  id: string
  name: string
  kind: 'field-capture' | 'lab-replay'
  startedAt: number          // epoch ms
  duration: number           // ms
  devices: Device[]
  route: GeoPoint[]          // 시간 정렬된 궤적
  series: Record<ParamId, Series>
  events: Event[]
}

type GeoPoint  = { t: number; lat: number; lon: number; alt?: number; speed?: number }
type Series    = { paramId: ParamId; unit: string; t: Float64Array; v: Float64Array }
type Event     = { t: number; type: EventType; severity: 'info'|'warn'|'error'; detail: unknown }

type Scenario = {
  id: string
  sourceSessionId: string
  timeRange: [number, number]   // 소스 로그에서 잘라낸 구간
  channelModel: ChannelModel
  signaling: SignalingScript
}

type ChannelModel = {
  taps: { delayNs: number; powerDb: number; dopplerHz: number }[]
  pathLossProfile: { t: number; lossDb: number }[]
  shadowing: { sigmaDb: number; correlationM: number }
  correlatedFading: boolean
}

// 모든 뷰가 구독하는 단일 재생 시계
type PlaybackClock = {
  mode: 'live' | 'playback'
  t: number            // 현재 시각
  playing: boolean
  rate: number         // 배속
}
```

**설계 요점**: `PlaybackClock`이 단일 진실 원천(single source of truth).
맵·차트·그리드는 모두 이 시계를 구독할 뿐, 서로를 직접 참조하지 않습니다.
이것이 패턴 5(타임라인 동기화)를 구현하는 가장 단순한 방법입니다.

---

## 9. KPI 카탈로그 `[확인 + 제안]`

Parameter Tree의 계층 구조로 바로 쓸 수 있는 분류입니다.

**RF / 물리 계층**
- RSRP (Reference Signal Received Power) — 5G NR에서는 SSB의 SSS·PBCH-DMRS로 계산, PCI별 분리 가능
- RSRQ (Reference Signal Received Quality)
- SINR / CIR
- RSSI
- PCI (Physical Cell Identifier)
- SSB index / 빔 식별자

**PHY 계층**
- CQI (0–15 정수. 요구 BLER를 만족하는 최고 MCS를 지시)
- RI (Rank Indicator)
- MCS (Modulation and Coding Scheme)
- BLER (Block Error Rate)

**처리량 (5G 서브캐리어별 수집)**
- DL / UL throughput — Application · PDCP · RLC · MAC 계층별
- Link adaptation KPI

**지연**
- Ping RTT
- TWAMP 단방향 지연

**프로토콜 / 이동성 이벤트**
- Handover, Beam switch, Cell reselection
- RACH 파라미터 (광범위한 세트)
- MAC / RLC / PDCP 계층 KPI

**세션 / 서비스**
- 호 설정 성공/실패, 절단
- FTP/HTTP 전송 성공률, 음성 품질 점수

> Nemo Outdoor가 수집하는 것으로 확인된 항목: 셀 측정, 물리 채널 정보,
> 현재 셀 정보(5G 서브캐리어별), 광범위한 RACH 파라미터, MAC 계층 KPI,
> RLC/PDCP KPI, 링크 적응 KPI(서브캐리어별), 5G QoS 측정(계층별 처리량·지연) `[확인]`

---

## 10. 프로토타입 기술 스택 제안 `[제안]`

웹 기반 유사 툴을 만든다는 전제입니다.

| 영역 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | React + TypeScript | 컴포넌트 단위 뷰 시스템 |
| 도킹 레이아웃 | `dockview` 또는 `rc-dock` | 패턴 1(도킹 + 탭 그룹) 직접 구현은 비쌈 |
| 지도 | MapLibre GL JS | 벡터 타일, 궤적 위 값 기반 컬러링, 3D 지형 |
| 시계열 차트 | `uPlot` | 수십만 포인트 실시간 렌더. ECharts는 대용량에서 느림 |
| 표/그리드 | TanStack Table + 가상 스크롤 | 수십만 행 이벤트 로그 |
| 상태 | Zustand | `PlaybackClock` 같은 전역 시계에 적합 |
| 파싱 | Web Worker | 대용량 로그 파싱이 UI를 막지 않도록 |
| 저장 | 워크스페이스를 JSON으로 직렬화 | 패턴 2 |

**성능 주의점**: 드라이브 테스트 로그는 수십 분 × 초당 수십 샘플 × 수백 파라미터입니다.
처음부터 타입드 배열(`Float64Array`)과 다운샘플링을 전제로 설계해야 합니다.

---

## 11. 리서치 한계 및 후속 검증 항목

### 확인하지 못한 것

1. **실제 스크린샷** — `keysight.com` egress 차단. 색상, 타이포그래피, 아이콘,
   여백 등 시각 디자인 언어를 전혀 확인하지 못했습니다.
2. **VDT Toolset 자체의 GUI** — 통합 레이어가 독립 GUI를 갖는지,
   아니면 Nemo/PROPSIM GUI 안의 기능으로 존재하는지 불명확합니다.
3. **PROPSIM 위저드의 실제 단계 구성** — "위저드가 있다"는 사실만 확인.
4. **다크 테마 여부** — PathWave ADS 계열은 라이트/다크 테마를 제공하는 것이 확인되었으나,
   Nemo/PROPSIM 계열도 그런지는 미확인.

### 후속 검증 방법 `[제안]`

- 네트워크 허용 목록에 `keysight.com` 추가 후 다음 문서 직접 열람
  - `S8709A-Virtual-Drive-Test-Toolset.pdf` (technical overview)
  - Nemo Outdoor / Nemo Analyze 사용자 매뉴얼 (스크린샷 다수 포함)
  - PROPSIM F8/F64 데이터시트
- Keysight 공식 데모 영상 시청 (제품 페이지에 데모 링크 존재 확인됨)
  - "Nemo Outdoor - The Ultimate Drive Test Tool for Wireless Networks"
  - "Nemo Analyze - Professional Post-Processing of Drive Test Data"
  - "Anite Virtual Drive Testing Toolset - An Overview"
- 위 영상/매뉴얼 확보 시 §4의 `[추론]` 항목을 `[확인]`으로 승격하고
  시각 디자인 언어(§11-1) 섹션을 신규 작성

---

## 12. 다음 단계 제안 `[제안]`

1. **UI 목업 우선** — §6 IA와 §7 화면 명세를 기반으로 Analyze Workbook 화면부터
   목업. 이 화면이 패턴 3·4·5를 모두 담고 있어 검증 가치가 가장 높습니다.
2. **수직 슬라이스 프로토타입** — 합성 드라이브 테스트 로그 생성 →
   맵 + 차트 스택 + 이벤트 그리드를 `PlaybackClock`으로 동기화.
   이것만 되면 툴의 심장이 완성됩니다.
3. **도킹 레이아웃과 워크스페이스 저장**을 그 다음에.

---

## 출처

- [S8709A 5G Virtual Drive Test Toolset](https://www.keysight.com/us/en/product/S8709A/s8709a-5g-virtual-drive-test-toolset.html)
- [C8709000A Virtual Drive Test Software](https://www.keysight.com/us/en/product/C8709000A/virtual-drive-test-software.html)
- [Cellular Virtual Drive Test Emulation](https://www.keysight.com/us/en/products/ue-ran-and-core-emulators/cellular-virtual-drive-test-emulation.html)
- [S8709A Virtual Drive Test Toolset — Technical Overview (PDF)](https://www.keysight.com/us/en/assets/3120-1513/technical-overviews/S8709A-Virtual-Drive-Test-Toolset.pdf)
- [Virtual Drive Testing Toolset — Solution Brief (PDF)](https://www.keysight.com/us/en/assets/7018-06582/solution-briefs/5992-3870.pdf)
- [S8809A RF Field-to-Lab Toolset](https://www.keysight.com/us/en/product/S8809A/rf-field-to-lab-toolset.html)
- [Nemo Outdoor 5G NR Drive Test Solution (NTA50000B)](https://www.keysight.com/us/en/product/NTA50000B/nemo-outdoor-5g-nr-drive-test-solution.html)
- [Nemo Analyze Post-Processing Solution (NTN50046C)](https://www.keysight.com/us/en/product/NTN50046C/nemo-analyze-drive-test-post-processing-solution.html)
- [Nemo Analyze — Post-Processing Solution 개요](https://www.keysight.com/us/en/products/ue-ran-and-core-emulators/rf-network-drive-test-solutions/analyze-post-processing-solution.html)
- [Nemo Handy Handheld Measurement Solution (NTH50047B)](https://www.keysight.com/us/en/product/NTH50047B/nemo-handy-handheld-measurement-solution.html)
- [PROPSIM F64 Channel Emulation Toolset (S8800A)](https://www.keysight.com/us/en/product/S8800A/propsim-f64-channel-emulation-toolset.html)
- [PROPSIM FS16 Channel Emulation Toolset (S8820A)](https://www.keysight.com/us/en/product/S8820A/propsim-fs16-channel-emulation-toolset.html)
- [General Channel Emulation Toolsets](https://www.keysight.com/us/en/products/channel-emulators/channel-emulation/general-channel-emulation-toolsets.html)
- [Channel Emulators 개요](https://www.keysight.com/us/en/products/channel-emulators.html)
- [Nemo Outdoor Graphical User Interface (튜토리얼)](http://rfoptimisation.blogspot.com/2017/06/tutorial-nemo-outdoor-graphical-user.html)
- [Nemo Outdoor: User Interface (Pathloss 블로그)](http://pathloss40.blogspot.com/2010/03/nemo-outdoor-5-user-interface.html)
- [Nemo Analyze 8.90 User Guide](https://www.scribd.com/document/738580118/Nemo-Analyze-8-90-User-Guide)
- [Nemo Analyze 5.10 User Manual](https://www.scribd.com/document/191344734/Nemo-Analyze-5-10-User-Manual)
- [Nemo Outdoor Manual 7.40](https://pdfcoffee.com/nemo-outdoor-manual-740-pdf-free.html)
- [Keysight 보도자료 — 5G 실사용 경험 검증](https://www.keysight.com/us/en/about/newsroom/news-releases/2020/1020-nr20119-keysight-enables-device-makers-to-qualify-5g-end-us.html)
- [PathWave ADS 2022 Update 2.0 (라이트/다크 테마)](https://www.keysight.com/us/en/lib/resources/software-releases/pathwave-advanced-design-system-ads-2022-update-20.html)

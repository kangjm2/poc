# 리서치 세션 로그

Keysight Virtual Drive Test 유사 툴 개발을 위한 리서치 작업의 진행 이력입니다.
문서 본문이 아니라 **어떤 판단을 왜 내렸는지, 무엇에 막혔는지**를 남기는 것이 목적입니다.

---

## 세션 1 — 범위 확정 및 1차 리서치

- **세션 ID**: `session_014jyfXyUvTupmGJDyqZ8DMB`
- **일자**: 2026-08-30
- **브랜치**: `claude/keysight-virtual-driving-research-m5scw5`
- **진입 경로**: 모바일 앱
- **산출물**: `docs/keysight-vdt-research.md` (커밋 `6b1e42d`)

### 진행 내용

**1. 범위 확정**

"Keysight의 virtual driving test 툴"이 서로 다른 두 제품군을 가리킬 수 있음을 확인했습니다.

| 갈래 | 내용 | 판단 |
|---|---|---|
| **VDT** — Virtual Drive Test | 5G 단말·칩셋 검증. 필드 무선 측정 로그를 랩에서 재현 | **채택** |
| **ADE** — Autonomous Drive Emulation | ADAS/자율주행 센서 에뮬레이션 (레이더·카메라·GNSS·V2X) | 범위 외 |

사용자가 VDT 계열을 선택했습니다. 두 갈래는 UI가 전혀 다르므로 이 결정이 이후 모든 설계의 전제가 됩니다.

**2. 리서치 범위**

확인한 제품군: `S8709A`, `C8709000A`, `S8809A`, Nemo Outdoor(`NTA50000B`),
Nemo Analyze(`NTN50046C`), Nemo Handy(`NTH50047B`), PROPSIM(`S8800A`/`S8820A`), UXM 5G.

**3. 문서화**

캡처 → 임포트 → 시나리오 저작 → 랩 재현 → 분석의 5단계 파이프라인을 뼈대로,
공개 매뉴얼에서 확인된 UI 구성요소를 정리하고 UI/UX 패턴 12가지를 추출했습니다.
모든 주장에 `[확인]` / `[추론]` / `[제안]` 근거 수준을 표기했습니다.

### 막힌 지점 — 네트워크 egress 정책

1차 리서치의 최대 제약이었습니다. **Keysight 공식 PDF와 제품 스크린샷을 전혀 열람하지 못했습니다.**

**진단 결과** — 프록시 자체는 정상(`enabled: true`, `recentRelayFailures: []`)이었고,
연결 실패가 아니라 **환경의 egress 허용목록에 의한 차단**이었습니다.

| 대상 | 결과 | 해석 |
|---|---|---|
| `api.github.com` | 200 | 허용 |
| `github.com` | 400 | 연결됨 (GitHub 서버 응답) |
| `code.claude.com` | 302 | 허용 (기본 목록 포함) |
| `keysight.com` | 000 | CONNECT 거부 — 차단 |
| `google.com` | 000 | 차단 |
| `arxiv.org` | 000 | 차단 |

원인은 세션이 실행된 클라우드 환경(`Default`, `env_01P1nErUbxZ6ncF5Swpyotfo`)의
네트워크 접근 수준이 **Trusted**로 설정되어 있었기 때문입니다.
Trusted는 패키지 레지스트리·GitHub·클라우드 SDK 등 사전 정의된 허용목록만 통과시킵니다.

WebSearch는 컨테이너 프록시가 아니라 Anthropic 서버 측에서 실행되므로 계속 동작했고,
그 결과 1차 리서치는 **검색 결과 요약에만 의존**하게 되었습니다.
이것이 §11(당시 문서)에 미검증 항목이 남은 직접적 원인입니다.

### 해소 방법

`claude.ai/code` → 메시지 입력창 윗줄의 구름 아이콘 → 환경 위 톱니바퀴 →
**Network access**를 `Custom`으로 변경 → **Allowed domains**에 한 줄에 하나씩 입력.

```
*.keysight.com
keysight.com
*.frame.claudeusercontent.com
```

주의할 점:

- **"Also include default list of common package managers"를 반드시 체크**해야
  기존 Trusted 목록이 유지됩니다. 체크하지 않으면 입력한 도메인만 허용됩니다.
- **변경은 새 세션부터 적용**됩니다. 실행 중인 세션은 시작 시점의 정책을 유지합니다.
- `claude.ai/settings/capabilities`의 "Additional allowed domains"는 **다른 설정**이며
  세션 컨테이너의 허용목록에 반영되지 않습니다. 환경 다이얼로그의 필드를 써야 합니다.
- 계정에 `Default`라는 이름의 환경이 둘 있습니다(`env_01P1n...`, `env_01Ecu...`).
- 더 간단한 대안으로 수준을 `Full`로 두면 도메인 관리 없이 전부 열립니다.
  리서치 종료 후 `Trusted`로 되돌리는 것을 권합니다.

관련 문서: [Configure cloud environments](https://code.claude.com/docs/en/cloud-environments)

---

## 세션 2 — 네트워크 허용 후 재조사

- **세션 ID**: `session_01E65Wuq1QkC9wDi7RRJFmf3`
- **브랜치**: `claude/keysight-vdt-research-section-11-efyn3d` (세션 1의 `6b1e42d`에서 분기)

네트워크 정책을 넓힌 뒤 시작된 세션으로, 세션 1이 열지 못한 1차 자료에 직접 접근해
문서를 재작성하고 미검증 항목을 해소했습니다. 커밋 메시지 기준 주요 성과:

- **공식 PDF**: 6건 직접 열람, 13건 문헌번호로 확인. 자산 페이지가 403을 주는 경우
  `/content/dam/.../ungate/` 경로에서 실제 PDF 바이트를 받을 수 있음을 확인
  (다만 18건 시험 중 5건만 성공하며, 404가 HTML을 반환하므로 상태코드가 아니라
  content type을 확인해야 함)
- **Nemo 매뉴얼·화면**: 공개 Nemo 업데이트 서버에서 정품 매뉴얼 확보,
  공식 flyer에서 2560×1440 원해상도 Nemo Outdoor 5G NR 스크린샷 추출.
  화면 구성을 추론이 아니라 **이미지 직접 판독**으로 재구성
- **시각 디자인 언어**: Keysight 자체 스타일시트와 로고 아트워크에서 브랜드 토큰 확보.
  Inter가 사이트 서체로 확인. 시그니처 레드 `#E90029`가 1차 출처 3곳에서 일치하며,
  널리 인용되는 `#EE4B25`는 근거가 없어 그렇게 표시
- Nemo의 라이트/다크 구분은 제품 역할이 아니라 **플랫폼**을 따름
  (Android 앱은 Windows 유틸리티처럼 다크)

세션 2 문서의 §5–8(랙 구성, KPI/파일 포맷, 3GPP 근거, 경쟁 제품)은 의도적으로 얇게 남겨져
2차 조사 대기 상태입니다.

---

## 브랜치 현황과 정리 방법

```
main
 └── 6b1e42d  세션 1: 초판 리서치 문서
      ├── (m5scw5)     + 이 세션 로그
      └── (efyn3d)     세션 2: 문서 전면 재작성 + §11 해소
```

두 브랜치가 `6b1e42d`에서 갈라져 있습니다.

- `docs/keysight-vdt-research.md`의 **최신본은 `efyn3d` 브랜치**입니다.
  세션 1의 초판은 대체되었습니다.
- `docs/session-log.md`(이 파일)는 `m5scw5`에만 있는 신규 파일이라 충돌하지 않습니다.

**권장 정리 방법**: 두 브랜치를 통째로 병합하면 리서치 문서에서 대규모 충돌이 납니다.
이 로그 커밋만 `efyn3d`로 체리픽하는 편이 깨끗합니다.

```
git checkout claude/keysight-vdt-research-section-11-efyn3d
git cherry-pick <이 커밋>
```

---

## 다음 단계

1. 세션 2 문서의 §5–8 보강 (랙 구성, KPI/파일 포맷, 3GPP 근거, 경쟁 제품)
2. Analyze Workbook 화면 목업 — Parameter Tree 드래그앤드롭, 뷰 타입 전환,
   타임라인 동기화를 한 화면에서 검증
3. 합성 드라이브 테스트 로그로 맵 + 차트 스택 + 이벤트 그리드를
   단일 재생 시계에 묶는 수직 슬라이스 프로토타입

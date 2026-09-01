# Nemo Analyze 10.2 User Guide — 작업용 레퍼런스

우리 구현 작업에 쓰기 위한 정리입니다. 사람이 읽는 분석 자료는
[`../../briefs/`](../../briefs/)에 있고, 이 디렉터리는 **다음 구현을 결정할 때 참조할 사실**만
담습니다.

## 출처와 취급

| | |
|---|---|
| 문서 | Nemo Analyze User Guide, Keysight Technologies |
| 부품번호 | `NTN00000A-90013` · Edition 1, 2023-11-27 |
| 문서화 대상 SW | **10.1.0** (파일명은 10.2) |
| 확보 범위 | **505페이지 전체** (1–505) |
| 입수 경로 | 사용자가 직접 제공 |

> **이 저장소에 원본 PDF는 두지 않습니다.** 라이선스 보유자에게만 배포되는 문서이고,
> `docs/assets/NOTICE.md`의 재배포 금지 원칙이 그대로 적용됩니다. 여기 있는 것은
> **인용과 페이지 참조**이며, 원문이 필요하면 라이선스 보유자를 통해 받아야 합니다.

## 파일

| 파일 | 내용 |
|---|---|
| `toc.json` | 목차 321개 항목 (제목 + 페이지) — 기계 판독용 |
| `use-cases.json` | Use Case 31개 인덱스 (번호 · 페이지 · 제목) |
| `kpi-workbench.md` | **가장 중요.** 노드 요소 전체 명세와 우리 구현과의 차이 |
| `data-views.md` | 화면·뷰 인벤토리 — 어떤 화면이 존재하는가 |
| `query-api.md` | **Appendix 5·6·7 전사.** 스칼라 함수 46개 · 저장 프로시저 16개의 signature, `T_FORMAT` 코드 21개, 레지스트리 키, 원문 결함 17건, 그리고 우리 식 언어와의 대조 |
| `corrections.md` | 매뉴얼이 우리 기존 문서를 반박하는 지점 |

## 이 레퍼런스가 바꾼 것

지금까지 우리 UI 설계 근거는 **스크린샷 판독과 마케팅용 Technical Overview**였습니다.
매뉴얼이 들어오면서 두 종류의 변화가 생겼습니다.

**확인된 것** — KPI Workbench 노드 그래프의 구조는 스크린샷에서 읽은 그대로였습니다.
UC27이 그 화면을 만드는 절차를 그대로 기술하고 있고, 노드 배치·연결 방향·상태 이름
(`OK` / `Bad BLER` / `Missing handover`)까지 일치합니다.

**틀린 것으로 드러난 것** — 구조는 맞았지만 **의미**는 여러 곳에서 달랐습니다. 특히
State Machine은 우리가 만든 것과 출력 모양 자체가 다르고, Combine은 게이팅 규칙이
반대입니다. `corrections.md`에 정리했습니다.

## 근본적인 차이 하나 — 시간 기반 대 샘플 기반

매뉴얼이 여러 곳에서 반복하는 문장입니다 (p353, p375, p378):

> *"the Nemo measurement file format is time-based as opposed to sample-based (that is, a
> 'sample' is created on a timeline only when changes occur in the monitored parameters)"*

**Nemo는 값이 바뀔 때만 샘플을 만듭니다.** 그래서 그들의 표본은 길이가 제각각이고,
평균·개수 집계는 **시간으로 가중해야** 맞습니다(p375: *"the aggregate functions Average and
Count should be weighted by time in order to obtain accurate results"*).

우리는 1 Hz 고정 샘플입니다. 그래서:

- 우리의 **가중 없는 평균이 맞습니다.** 같은 계산을 Nemo에서 하면 틀립니다.
- 반대로 **시간 가중(`Weight by time`)은 우리에게 필요 없습니다.** 없는 것이 격차가 아닙니다.
  단 **거리 가중은 다릅니다** — 정차 편향은 균일 샘플링이 없애 주지 않고, 오히려 1 Hz에서
  가장 심합니다. `corrections.md` C7을 보십시오.
- 그들의 `All Values Within Time Range`가 하는 시간 정렬 결합은,
  **`sample_kpi`·`sample_neighbour` 안에서라면** 우리에겐 `(session_id, seq)` 동등 조인입니다.
  **그러나 `network_event`와 `signaling_message`에는 `seq`가 없습니다** — `ts`뿐입니다.
  그쪽은 진짜 시간 정렬 규칙이 필요하고, 실제로 `ProblemSurvey`가 최근접 타임스탬프
  상관 서브질의로 처리하고 있습니다. **이 절반은 단순하지 않습니다.**

이 차이를 모르고 그들의 UI를 그대로 베끼면, 우리 데이터에서는 의미 없는 컨트롤을
만들게 됩니다.

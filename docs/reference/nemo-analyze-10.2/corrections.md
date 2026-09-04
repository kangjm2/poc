# 매뉴얼이 우리 기존 문서를 반박하는 지점

지금까지 우리 격차 분석은 **스크린샷 판독 + 마케팅용 Technical Overview**에 근거했습니다.
매뉴얼이 들어오면서 확인된 것과 틀린 것이 갈렸습니다. 틀린 쪽만 여기 모읍니다.

우선순위는 "이걸 모르고 다음 구현을 하면 잘못 만든다"의 정도로 매겼습니다.

---

## C1. `Missing neighbour`는 막혀 있지 않았습니다 — 우리 **데이터**가 막고 있었습니다

**기존 주장** (`ui-gap-vs-reference.md` §6(a)):
> *"`Missing neighbour` 원인 분류 — 이건 이웃 셀 측정으로 안 풀립니다. *측정된* 이웃과
> *설정된* 이웃 목록의 차집합인데 우리는 후자가 없습니다."*

**매뉴얼이 보여주는 것** (UC27, p404): Nemo는 설정된 이웃 목록을 쓰지 않습니다.
**측정값만으로** 판정합니다 —

> *"if Ec/N0 1. best is better than Ec/N0 best active set, the handover has not occurred."*

즉 `best active set − 1. best < 0`이면 더 좋은 셀이 있는데 옮겨가지 않은 것입니다.
BLER 상승과 결합해 상태 기계로 격리합니다.

**우리에게 필요한 데이터는 이미 다 있습니다.** 서빙 RSRP와 최강 이웃 RSRP — V7이
넣었고, 실제로 `HO_MARGIN` 그래프로 계산해 본 적도 있습니다.

**그런데 우리 데이터에서는 이 조건이 절대 발생하지 않았습니다.** 시드 생성기가 매 표본
argmax를 서빙 셀로 골랐기 때문입니다. 커밋 `9262db0`의 정합성 불변식 #2가 바로 이것을
단언했습니다 — *"이웃이 서빙보다 강한 표본 = 0"*.

> *2026-09-04 상태: 더 이상 그렇지 않습니다.* ④e에서 `DriveTestGenerator`가
> `handoverLagSamples`(다른 셀이 더 강해진 뒤에도 N표본 동안 붙들고 있음)와
> `strandedPci`(아무리 강해도 절대 서빙하지 않는 셀)를 받고, 고속도로 주행이 그 둘로
> 시드됩니다. 그래서 "이웃이 서빙보다 강한 표본"이 실제로 존재하고 `MISSING_HANDOVER`와
> `MISSING_NEIGHBOUR`가 거기서 발화합니다 — 위에 적은 불변식은 지금 그대로는 성립하지
> 않습니다.

> **결론**: 막고 있던 것은 이웃 셀 스키마가 아니라 **핸드오버 지연을 모델링하지 않는
> 생성기**였습니다. 실제 망은 time-to-trigger와 히스테리시스가 있어 서빙 셀이 일시적으로
> 열등해집니다. 생성기에 그 지연을 넣으면 조건이 자연히 생기고, 레퍼런스의 대표 KPI를
> 우리 데이터에서 재현할 수 있게 됩니다.
>
> 격차표에서 이 항목은 **(a) 데이터 모델이 막음 → (b) 실제로 남은 작업**으로 옮겨야 합니다.

---

## C2. State Machine — "기억이 없다"가 아니라 **출력 모양이 다른 것**

**기존 주장**: *"표본별 `CASE`라 래칭(히스테리시스)이 없습니다. 이름이 실제보다 큽니다."*

맞지만 **부족합니다.** 매뉴얼 p370에 따르면 레퍼런스의 출력은 표본별 값이 아니라
**상태 점유마다 한 행**이고, `start_time`과 **`time_interval`(머문 시간 ms)** 을 냅니다.

대표 용도가 그래서 두 가지입니다 — **커스텀 이벤트 생성**, 그리고 **절차 지연 측정**
(radio bearer 확립 시간이 `time_interval`로 바로 나옴).

> **우리 것은 분류기(Classifier)입니다.** 표본마다 숫자 하나를 냅니다. 진짜 State Machine은
> 별개로 만들어야 하고, 그때 필요한 것은 래칭만이 아니라 **구간 출력**입니다.
> `time_interval`이 나와야 "이 절차가 몇 ms 걸렸나"라는 질문이 열립니다.

> **우리 상태 (2026-09-03).** 위 문단의 "별개로 만들어야 하고"는 이제 지난 이야기입니다.
> `KpiGraph`의 `STATE_MACHINE`은 **래칭 사다리**이고 — 상태 k는 k−1을 거쳐야만 진입하며,
> 초기 상태의 조건이 유일한 복귀 경로입니다(`ladder()`) — 각 상태에 **머문 시간을 ms로**
> 냅니다. 표본별 `CASE`는 `CLASSIFIER`로 이름이 갈렸고, 이름의 뜻이 바뀌었으므로
> `V13__classifier_rename.sql`이 **저장된 문서까지** 옮기면서 `version`을 심어 옛 문서가
> 새 노드로 읽히지 못하게 막습니다(`KpiGraph.LADDER_VERSION`). 편집기 쪽은
> `KpiWorkbench.tsx`의 `LadderEditor` — 사다리를 순서 있는 목록으로 편집하고 출력 단위를
> `ms`로 고정해 보여 줍니다.
>
> **그리고 `time_interval`은 저장 모델을 건드리지 않았습니다.** 점유를 **진입한 표본에**
> 찍으면 그 행의 `ts`가 곧 레퍼런스의 `start_time`이고 값이 곧 `time_interval`이라,
> 점유 하나가 보통의 KPI 행 하나에 손실 없이 들어갑니다(`KpiGraph.ladder()`의 주석이
> 이 계산을 적어 둡니다). 그 덕에 dwell은 이미 있는 화면들이 그대로 칠하고·비닝하고·
> 거르고·내보내고·리포트에 싣습니다. 아래 C9가 "구간 행은 다른 모양이라 담을 곳이 없다"고
> 적은 것은 **이 항목에 관한 한 틀렸습니다.**
>
> **남은 차이**는 모양이 아니라 표현력입니다 — 레퍼런스는 임의의 전이표이고 우리는
> **순서 사다리**이며, 상태 수가 초기 상태 + 3으로 제한됩니다(`KpiGraph.MAX_LADDER_STATES`,
> 화면에도 같은 수로 적혀 있습니다). `end_time`은 따로 내지 않습니다 —
> `start_time + time_interval`과 같은 값이라 열을 하나 덜 씁니다.

---

## C3. Combine의 게이팅이 우리와 **반대**입니다

**매뉴얼 p354**: *"the output will be written only when there are valid values in the
**primary** dataset."* 가장 왼쪽 입력이 primary이고, 그것이 없는 시점은 출력이 없습니다.
매뉴얼의 예 — RX qual을 primary로 잡으면 통화 중일 때만, RX level을 잡으면 idle까지.

**우리 `COMBINE`**: 모든 입력의 표본을 합집합한 키 스파인에 전부 LEFT JOIN. primary 개념이
없고, 어느 입력이든 값이 있으면 그 표본이 살아남습니다.

> 우리 쪽이 정보를 덜 버리지만 **레퍼런스 사용자가 기대하는 게이팅이 없습니다.**
> "primary 입력" 개념을 UI에 도입할지가 결정 사항입니다. 참고로 우리가 처음 만든
> FULL JOIN 체인이 3입력 이상에서 행을 잃은 것은 그냥 버그였고 이미 고쳤습니다(`94ff566`).
> 지금 남은 것은 **버그가 아니라 다른 선택**입니다.

---

## C4. Lee's criteria를 근거로 댔지만 구현하지 않았습니다

**기존 주장** (`gap-analysis.md` §1.2): *"**Distance binning** ✅ 해소. 정차가 평균을
끌어당기지 않습니다"* — 그리고 커밋 메시지에 *"the sampling convention drive testing has
used since Lee"*.

**매뉴얼 p55**: Lee's criteria는 **40λ**입니다. n78(3.5 GHz)에서 **3.4 m**.
우리 빈은 50 / 100 / 250 m — **두 자릿수 큽니다.**

> 거리 비닝 자체는 유효하고 정차 편향 제거도 사실이지만, **"Lee's criteria"라는 이름을
> 붙일 자격은 없습니다.** 붙이려면 캐리어 주파수에서 40λ를 계산해 빈 크기로 쓰는
> 선택지를 줘야 하고, 변환 함수는 이미 있습니다
> (`FieldToLabService.centreFreqMhz`, TS 38.104 래스터).
>
> 빈의 좌표도 다릅니다 — 레퍼런스는 **첫 이벤트**의 위경도, 우리는 빈 내 평균.

---

## C5. 드릴다운 좌측 탭은 스타일이 아니라 **동시 유지 기능**입니다

**기존 주장**: *"드릴다운 breadcrumb를 좌측 세로 탭 형태로 — 작음, 순수 스타일"*

**매뉴얼 p87**: *"Each drill-down from the same chart will open a **new tab** in the same
window. These tabs are displayed on the left side of the window with the **colors of the
corresponding sectors**."*

> 즉 여러 원인을 **동시에 열어 놓고 오가는** 기능입니다. 우리는 `Back to all categories`
> 한 단계뿐이라 한 번에 하나만 볼 수 있었습니다. **"작음/스타일"이 아니라 중간 규모의
> 기능 격차**로 재분류했고, **2026-09-03에 닫았습니다** — 원인 탭이 여는 순서대로 쌓이고
> 탭 색은 파이 조각에서 **가져옵니다**(두 번 정하면 탭과 조각이 갈라집니다).
>
> 진입 조작은 여전히 다릅니다 — 레퍼런스는 **더블클릭**(조각 또는 범례 색), 우리는 한 번
> 클릭. 이 쪽은 우리가 낫다고 판단해 유지합니다.

> **우리 상태 (2026-09-03).** 다중 탭이 나왔습니다. `ProblemSurveyPanel.tsx`가 열린 원인을
> **연 순서대로** 목록(`open`)으로 들고 활성 탭(`active`)만 밑의 사례 목록을 좁히므로,
> 원인 둘을 나란히 열어 놓고 오갈 수 있습니다. 탭은 좌측에 쌓이고 색은 **파이 조각에서
> 그대로 가져옵니다** — 조각과 탭이 같은 `arcs` 항목의 `color`를 읽으니 둘이 갈라질 수
> 없습니다.
>
> **남은 차이는 진입 조작 하나**이고, 그것은 일부러 그대로 둡니다. 이미 활성인 원인을 다시
> 누르면 닫히므로 단일 슬롯 시절의 되돌아가기가 그대로 남아 있고, 탭을 닫으면 남아 있는
> 탭으로 물러납니다. (이 항목은 같은 날 `ui-gap-vs-reference.md`에서 먼저 완료로 정정됐고,
> 근거 문서인 여기가 뒤늦게 따라갑니다.)

---

## C6. 확인된 것 — 정렬 노드를 넣지 않은 판단은 옳았습니다

**기존 주장**: *"정렬 노드는 없습니다. 우리 행 집합은 seq 키라 정렬할 것이 없고, 아무 일도
하지 않는 버튼은 없느니만 못합니다."*

**매뉴얼 p359**가 이유를 확인해 줍니다 — Union이 *"the rows and columns in the resulting
data set are in no particular order"* 로 만들기 때문에 정렬이 필요합니다. 우리는 Union이
없고 `seq` 키라 순서가 무너지지 않습니다. **판단 근거까지 맞았습니다.**

---

## C7. `Weight by` — **시간 가중은 격차가 아니지만, 거리 가중은 격차입니다**

> **2026-09-01 정정.** 이 항목은 처음에 *"`Weight by`가 없는 것은 격차가 아니다"* 로 통째로
> 닫아 놨습니다. **절반만 맞았습니다.** 두 축을 하나로 묶은 것이 잘못이었습니다.

매뉴얼이 세 곳에서 반복합니다(p353·p375·p378): Nemo 파일은 **시간 기반**이라 값이 바뀔
때만 샘플이 생기고, 그래서 Average·Count는 시간 가중이 필요합니다.

**Appendix 3(p477)이 그 근거를 산수로 보여 줍니다.** Rx Quality가 0/90초, 5/0.5초, 0/10초로
기록되면 단순 평균은 (0+5+0)/3 = **1.667**이지만, 지속시간 가중 평균은
(0×90 + 5×0.5 + 0×10)/(90+0.5+10) = **0.025**입니다. 일반식은 `Σ(Sᵢ·dᵢ) / Σdᵢ`.

### 시간 축 — 하지 않습니다 ✅

우리는 1 Hz 균일 샘플이라 모든 `dᵢ`가 같습니다. **가중 없는 평균이 맞고**, 시간 가중
컨트롤은 우리 데이터에서 아무 일도 하지 않습니다.

### 거리 축 — **해야 합니다** ⚠

같은 p477이 이어서 말하는 문장이 결정적입니다:

> *"It should be noted that the duration can be **in time or in distance**, depending on how the
> data is to be used. If the samples from the entire measurement route are to have equal weight
> and for instance **the weighting effect of time spent at traffic lights is to be excluded, the
> samples should be weighted by distance**."*

**이 근거는 표본 간격의 규칙성과 아무 상관이 없습니다.** "경로의 매 미터가 같은 무게를
가져야 한다"는 요구이고, 우리에게도 그대로 성립합니다.

그리고 **1 Hz 균일 샘플에서 이 편향은 오히려 최악입니다** — 신호 대기 중인 차량은
초당 1표본을 꼬박 내보내면서 0미터를 이동합니다. 균일 샘플링은 <strong>시간</strong> 축
문제를 없애 주지만 <strong>거리</strong> 축 문제는 조금도 줄여 주지 않습니다.

SQL 층에도 두 축이 **별개 프로시저**로 존재합니다(Appendix 6):

| 프로시저 | 가중 | 원문 |
|---|---|---|
| `QSR_DISTANCE` | *"a weight that is defined as the **distance** (meters for example) that the value was valid"* | p495–496 |
| `QSR_TIME` | *"…the **time** (milliseconds for example) that the value was valid"* | p497 |
| `SR_SAMPLE` | 가중 없음 | p496 |

셋의 입력 8개·반환 5개가 동일합니다. 즉 레퍼런스는 **가중 방식만 다른 같은 통계를 셋 다
제공**합니다.

> **우리 현재 상태**: 거리 가중 집계가 **어디에도 없습니다.** `AnalysisService.statistics()`는
> 원시 `sample_kpi` 행에 대한 가중 없는 `percentile_cont`이고,
> `GeoAnalysisService.distanceBins()`는 빈별 평균이라 **그 화면 안에서만** 편향을 없앱니다.
> `statistics()` · `distribution()` · 비교 화면의 CDF · 리포트는 전부 정차 편향을 그대로
> 안고 있습니다.
>
> **조치**: 우선순위표의 "하지 않음" 행을 둘로 쪼갭니다. 거리 가중 평균·CDF를 만들고,
> 가중치는 `distanceBins()`가 이미 계산하는 대권거리 구간을 표본별 가중 열로 재사용하면
> 됩니다.

> **우리 상태 (2026-09-03).** 위 "거리 가중 집계가 어디에도 없습니다"는 이제 거짓입니다.
> 가중은 `WeightedStats` 한 곳에 있고, 무엇으로 가중했는지는 `AggregationBasis`가
> (`BY_DISTANCE` / `BY_SAMPLE`, 그리고 dB의 `LINEAR`) 이름과 **화면에 인쇄할 문구**까지
> 함께 냅니다. 조치에 적은 대로 무게를 새로 계산하지 않고 `RouteContinuity`의 구간 거리를
> 씁니다 — 통계가 지도와 도로 길이를 두고 다투지 않게 하려는 것입니다.
>
> 걸린 곳: `/statistics` · `/distribution` · `/compare` · `/cohorts`가 `weightedBy`를
> 받고(`AnalysisController`), CDF는 별도 경로가 아니라 **같은 질의 안에서** 값 순서대로
> 무게를 누적해 나오며(`WeightedStats.computeAcross`), 리포트는 계산 결과에서 기준 문구를
> **되읽어** 인쇄합니다(`ReportService`) — 문구를 다시 적으면 화면과 리포트가 갈라지기
> 때문입니다.
>
> **남은 것 둘은 거절로 처리돼 있습니다.** 주행 여럿에 걸친 거리 가중은 `CohortService`가
> 거부합니다 — 로거 공백 뒤의 표본이 재지 않은 구간을 통째로 무게로 지고 오기 때문이고,
> 한 주행에서는 특징이지만 코호트끼리는 그대로 편향입니다. seq 범위도 세트에는 적용하지
> 않습니다(주행마다 다른 길을 가리키는 창이 됩니다).

---

## C8. KPI Workbench는 그들의 **스키마 한계 우회로**이기도 합니다

매뉴얼 p332가 밝히는 존재 이유 중 하나: 셋 이상 테이블의 시간 상관이
*"impossible"* 하다 — 파라미터들이 **관계가 정의되지 않은 별도 테이블**에 있기 때문.

> 우리 `sample_kpi`는 세로형 단일 테이블이라 N개 KPI 상관이 같은 키의 조인입니다.
> **그들이 도구로 우회한 문제를 우리는 스키마로 이미 풀어 놨습니다.**
>
> 실무적 함의: 우리 Combine 노드의 가치는 그들만큼 크지 않습니다. 반대로 **우리 워크벤치의
> 가치는 전적으로 State Machine과 상관(Previous/Current/Next) 쪽에 있습니다** — 그리고 그
> 둘이 지금 우리에게 없거나 다릅니다.

---

## C9. 우리 워크벤치를 실제로 묶고 있는 것은 **그래프의 모양** 하나입니다

매뉴얼 뒷부분(p396–504)을 훑고 나서, 서로 달라 보이던 격차 넷이 **같은 제약 하나**에서
나온다는 것이 드러났습니다.

`KpiGraph.emit()`의 모든 CTE는 예외 없이 `(session_id, seq, ts)`를 키로 잡고, `OUTPUT`은
**열 하나**를 골라 `sample_kpi`에 실체화합니다. `V8__kpi_graph.sql`의
`UNIQUE (output_kpi_name)`이 그 계약을 스키마에 못박아 두었습니다. 즉 —

> **그래프 하나 = 표본당 한 행 × 출력 열 하나.**

이 한 문장이 아래 넷을 전부 설명합니다.

| 겉보기 격차 | 실제 원인 |
|---|---|
| **이벤트를 캔버스에 올릴 수 없음** | `network_event`는 `(session_id, ts)`이고 **`seq`가 없습니다**. 표본 격자 위의 행이 아니라 키가 맞지 않습니다 |
| **State Machine이 구간을 못 냄** | 구간 행은 `start_time`·`time_interval`을 갖는 **다른 모양**입니다. 표본당 한 행에 담을 곳이 없습니다 |
| **`Nth Best`·`Group By` 같은 노드 불가** | 그것들은 **행 수와 열 수를 바꿉니다.** 매뉴얼이 이 부류를 *"dynamic procedures … the actual result set is defined at runtime rather than fixed"* 라 부릅니다(p501) |
| **지오메트리를 못 읽음** | `sample`의 `latitude`·`longitude`·`speed_kmh`·`serving_pci`를 읽는 소스 노드가 없습니다. 이건 유일하게 **모양 문제가 아니라 그냥 없는 것**입니다 |

### 그래서 우선순위 순서가 틀렸습니다

기존 표는 **① 생성기 핸드오버 지연 → ② 진짜 State Machine → ③ Previous/Current/Next**
순서였습니다. ②와 ③은 **둘 다 위 제약에 걸립니다**:

- ②의 산출물은 구간 행인데, 실체화할 곳이 없습니다.
- ③의 대표 용도는 *"드롭 직전의 값"* 인데, **드롭(이벤트)을 캔버스에 올릴 수 없습니다.**

UC27을 보면 순서가 분명해집니다. 그 그래프의 **마지막 노드**가 `Call dropped` 이벤트와의
상관입니다. 우리 도구로는 **거기서 시작조차 못 합니다** — State Machine을 아무리 잘 만들어도
상관시킬 상대가 캔버스에 없습니다.

> **따라서 0번 항목이 새로 생깁니다**: *그래프가 낼 수 있는 두 번째 결과 모양을 정하는 것.*
> KPI를 실체화하는 지금 경로를 두고, **결과 집합을 워크벤치 그리드로 돌려주는 경로**를
> 하나 더 만들지 여부입니다. 4·5번이 그 결정에 매달려 있으므로 **먼저 정해야 합니다.**
>
> 반대로 **지오메트리 소스(`SOURCE_SAMPLE`)는 이 결정과 무관합니다.** 표본당 한 행,
> 열 하나 — 지금 모양에 정확히 들어맞습니다. `SOURCE_KPI`와 구조가 같아 작은 작업이고,
> 값은 이미 `sample` 테이블에 있습니다. **지금 바로 할 수 있는 유일한 워크벤치 항목입니다.**

> **우리 상태 (2026-09-03) — 위 네 줄짜리 표에서 셋이 사라졌습니다.** 진단(그래프 하나 =
> 표본당 한 행 × 출력 열 하나)은 맞았지만, 그 제약이 막는다고 적은 것 중 셋은 제약을
> 건드리지 않고 풀렸습니다.
>
> | 겉보기 격차 | 2026-09-03 |
> |---|---|
> | 이벤트를 캔버스에 올릴 수 없음 | ✅ `SOURCE_EVENT`가 이벤트를 **가장 가까운 표본**에 얹습니다 — `network_event`에 `seq`가 없다는 사실은 그대로이고, 해석을 소비자가 아니라 소스 노드에서 한 번에 합니다 |
> | State Machine이 구간을 못 냄 | ✅ 못 내는 것이 아니었습니다. 점유를 **진입한 표본**에 찍으면 `ts` = `start_time`, 값 = `time_interval`이라 표본당 한 행에 그대로 들어갑니다(C2) |
> | `Nth Best`·`Group By` 같은 노드 불가 | ⬜ 그대로. 이 부류는 **행 수와 열 수를 바꿉니다** |
> | 지오메트리를 못 읽음 | ✅ `SOURCE_SAMPLE`(`SAMPLE_FIELDS` 네 열) |
>
> 그러므로 "0번 결정이 4·5번을 막고 있다"는 순서도 더는 유효하지 않습니다 — 결정은
> **두 번째 모양을 만들지 않는 쪽**으로 났고, 4·5번은 그 위에서 끝났습니다.

---

## 우선순위 제안

> **2026-09-03 — 상태 열을 붙였습니다.** 이 표는 오랫동안 *할 일*만 적고 있었고, 그 사이
> 열한 줄 중 여덟이 끝났는데도 표는 그대로였습니다. 근거 디렉터리의 표가 이미 나온 기능을
> 격차로 계속 적으면 그 기능이 두 번 계획됩니다. **규모 열은 당시 사정 그대로 두고**
> 상태만 덧붙입니다 — 사정이 맞았는지 나중에 되짚으려면 원래 숫자가 남아 있어야 합니다.
> 아래 각 줄의 근거는 코드를 직접 읽어 확인했습니다.

| | 항목 | 규모 | 상태 (2026-09-03) | 근거 |
|---|---|---|---|---|
| **0** | **그래프의 두 번째 결과 모양을 결정** — KPI 실체화 외에 결과 집합 반환 경로를 둘 것인가 | 결정 | ✅ **정해졌고, 답은 "필요 없다"였습니다.** 점유를 진입 표본에 찍으면 `ts`가 `start_time`, 값이 `time_interval`이라 보통의 KPI 행에 들어갑니다(`KpiGraph.ladder()`) | **C9. 4·5번이 여기 매달려 있습니다** |
| 1 | **`SOURCE_SAMPLE` 노드** (`latitude`·`longitude`·`speed_kmh`·`serving_pci`) | 작음 | ✅ 완료 — `KpiGraph`의 `SAMPLE_FIELDS`가 네 열을 허용 목록으로 들고, 노드는 `(session_id, seq, ts)`로 나와 KPI 소스와 그대로 붙습니다 | C9. 0번과 무관하게 지금 가능. 값은 이미 `sample`에 있음 |
| 2 | **`SOURCE_EVENT` + 시간 상관** — 이벤트를 `(session_id, seq)` 척추에 얹기 | 중 | ✅ 완료 — `KpiGraph`의 `SOURCE_EVENT`가 이벤트를 **가장 가까운 표본**에 얹고(값은 그 표본에서 1, 나머지는 NULL), 시간 상관은 `CORRELATE` 노드 | C9. UC27의 **마지막** 노드. 이것 없이는 State Machine의 산출물을 쓸 데가 없음 |
| 3 | 생성기에 **핸드오버 지연** 도입 → missing handover 조건 발생 | 중 | ✅ **완료 (2026-09-04, ④e).** `DriveTestGenerator`가 `handoverLagSamples`와 `strandedPci`를 받고 서빙은 붙들고 있는 인덱스에서 나옵니다(`if (rsrp > bestRsrp && s.pci() != strandedPci)`). *이 칸은 09-03 13:31에 쓰였고 시드 변경은 그날 23:49에 들어왔습니다* | C1. 레퍼런스 대표 KPI를 재현 가능하게 만드는 전제 |
| 4 | **진짜 State Machine** (전이 그래프 + 구간 출력 + `time_interval`) | 큼 | ✅ 완료 — `KpiGraph.ladder()` + `V13__classifier_rename.sql`. 전이 **그래프**가 아니라 순서 **사다리**이고 상태는 초기 + 3까지 | C2. **0번 결정 이후** |
| 5 | **Previous / Current / Next Value** 상관 노드 | 중 | ✅ 완료 — `KpiGraph.Correlation` 다섯 개(PREVIOUS·CURRENT·NEXT + 두 fallback)와 `correlate()`. primary 게이팅도 여기 있습니다(p354의 규칙) | C8. **2번 이후** — 상관시킬 이벤트가 있어야 의미가 생김 |
| 6 | **거리 가중 통계** (`statistics`·`distribution`·CDF·리포트) | 중 | ✅ 완료 — `WeightedStats` · `AggregationBasis`. 주행 여럿에 걸친 거리 가중은 `CohortService`가 이유를 대고 거부합니다 | C7. 1 Hz 균일이 못 없애는 유일한 편향 |
| 7 | **폴리곤 영역 통계** — 지도에서 임의 영역을 그려 통계 | 중 | ✅ 완료 — `AreaSelection` + `AreaStatsService`(통과 목록 포함). **남은 것은 폴리곤을 저장해 다시 쓰는 것**과 `Folder from area` | 자산이 아니라 기능. `Polygon region`(p468) |
| 8 | 드릴다운 **다중 탭** | 중 | ✅ 완료 — `ProblemSurveyPanel.tsx`. 남은 차이는 더블클릭 대 한 번 클릭뿐이고 그것은 우리 선택입니다 | C5. 재분류됨 |
| 9 | 거리 빈에 **40λ 옵션** | 작음 | ⬜ **열려 있습니다.** 빈 크기는 여전히 사람이 고른 미터이고(`GeoAnalysisService.distanceBins(…, stepMetres)`), `FieldToLabService.centreFreqMhz`는 Field-to-Lab 화면에서만 읽힙니다 | C4. 이름값을 하려면 |
| — | `Weight by **time**` | — | 그대로 **하지 않습니다** | **하지 않음.** C7. 우리 표본은 길이가 같음 |

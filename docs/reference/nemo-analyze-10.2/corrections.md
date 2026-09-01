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

**그런데 우리 데이터에서는 이 조건이 절대 발생하지 않습니다.** 시드 생성기가 매 표본
argmax를 서빙 셀로 고르기 때문입니다. 커밋 `9262db0`의 정합성 불변식 #2가 바로 이것을
단언합니다 — *"이웃이 서빙보다 강한 표본 = 0"* — 그리고 통과합니다.

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
> 한 단계뿐이라 한 번에 하나만 볼 수 있습니다. **"작음/스타일"이 아니라 중간 규모의
> 기능 격차**로 재분류해야 합니다.
>
> 진입 조작도 다릅니다 — 레퍼런스는 **더블클릭**(조각 또는 범례 색), 우리는 한 번 클릭.

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

## 우선순위 제안

| | 항목 | 규모 | 근거 |
|---|---|---|---|
| 1 | 생성기에 **핸드오버 지연** 도입 → missing handover 조건 발생 | 중 | C1. 레퍼런스 대표 KPI를 재현 가능하게 만드는 전제 |
| 2 | **진짜 State Machine** (전이 그래프 + 구간 출력 + `time_interval`) | 큼 | C2. 워크벤치의 실제 가치가 여기 있음 |
| 3 | **Previous / Current / Next Value** 상관 노드 | 중 | C8. 근본 원인 분석의 핵심 조작 |
| 4 | 드릴다운 **다중 탭** | 중 | C5. 재분류됨 |
| 5 | 거리 빈에 **40λ 옵션** | 작음 | C4. 이름값을 하려면 |
| 6 | **거리 가중 통계** (`statistics`·`distribution`·CDF·리포트) | 중 | C7. 1 Hz 균일이 못 없애는 유일한 편향 |
| — | `Weight by **time**` | — | **하지 않음.** C7. 우리 표본은 길이가 같음 |

# KPI Workbench — 노드 요소 전체 명세

출처: User Guide p344–p402 (요소 정의), p403–p410 (UC27 실전 예제).

우리 `KpiGraph.java` / `KpiWorkbench.tsx`가 이 화면의 대응물입니다. **구조는 맞게
만들었지만 의미가 여러 곳에서 다릅니다.** 아래는 매뉴얼이 정의하는 실제 동작이고,
각 항목 끝에 우리 상태를 붙였습니다.

---

## 0. 이 도구가 존재하는 이유 (p332)

매뉴얼이 "SQL vs. KPI workbench" 절에서 직접 밝힙니다. 워크벤치는 SQL로 **불가능한**
두 가지를 위해 있습니다.

1. **셋 이상 테이블의 시간 상관.** 두 테이블은 시간 기반으로 조인할 수 있지만
   *"with three or more tables the task becomes impossible"* — BLER·Ec/N0·TX power가 각각
   별도 테이블이고 **테이블 간 관계가 정의돼 있지 않기** 때문입니다.
2. **이벤트 시퀀스 추적** — 특정 파라미터의 변화 순서를 좇는 질의.

> **우리에겐 1번이 문제가 아닙니다.** `sample_kpi`가 `(session_id, seq, kpi_name, value)`
> 세로형이라 N개 KPI의 상관은 같은 키의 조인일 뿐입니다. 즉 **그들의 워크벤치가 우회로로
> 만들어진 부분을 우리는 스키마로 이미 풀어 놨습니다.** 우리 Combine 노드가 쉬운 것은
> 우연이 아닙니다.
>
> 2번은 여전히 우리에게도 문제이고, 그것이 State Machine입니다.

---

## 1. 입력 — Parameter (p347)

파라미터는 **표 형태의 데이터셋**입니다. 값 열 하나와 보통 time·coordinates·system 열을
함께 가집니다.

| | |
|---|---|
| 넣는 법 | Workspace의 측정 파일을 고르고 Parameters 뷰에서 캔버스로 **드래그 앤 드롭** |
| 폴더를 고르면 | 원시 샘플이 아니라 **사전 계산된 통계**로 제한된 데이터셋이 들어옴 |
| 열 줄이기 | 요소를 더블클릭 → Result Columns에서 체크 해제. **후속 노드에 연결되기 전에만** 가능 |
| 커스텀 | Parameter 요소를 끌어다 놓고 Query Manager로 직접 정의 |

**우리 상태**: `SOURCE_KPI`는 KPI 하나를 열 하나로 읽습니다. 폴더 단위 사전 통계 개념은
없고(우리는 세션 단위), 열 선택도 없습니다(우리 소스는 애초에 열이 하나). `SOURCE_NEIGHBOUR`는
그들의 `Ec/N0 Nth best` 파라미터에 대응하며, UC27이 **Value 필드에 1을 넣어 1st best를
고르는** 방식을 씁니다 — 우리 `rank` 필드와 같은 개념입니다.

---

## 2. 결합 — 두 계열이 있고 기준이 다릅니다 (p348–p362)

매뉴얼 p354가 이 구분을 명시합니다:

> *"A major difference between All Values Within Time Range and the other join elements
> (namely Inner Join, Left Outer Join, and Union) is that All Values Within Time Range
> combines the data based on **time**, whereas these other join elements do this based on
> **matching values**."*

### 2.1 Correlation 계열 — 시간 기준

모두 **가장 왼쪽 입력이 primary**이고, 나머지가 secondary입니다. primary가 시점을
결정합니다.

| 요소 | 동작 |
|---|---|
| **Previous Value** | primary 이벤트 **시작 직전** secondary 값 하나 |
| **Current Value** | primary 이벤트 **진행 중** secondary 값 하나 |
| **Next Value** | primary 이벤트 **직후** secondary 값 하나 |
| **Previous or Current** | 직전 값, 없으면 진행 중 값 |
| **Next or Current** | 직후 값, 없으면 진행 중 값 |
| **All Values Within Time Range** | primary의 시간 범위 안 secondary 값 **전부** |

**결정적인 규칙 (p354)**: *"the output will be written only when there are valid values in
the primary dataset."* primary에 값이 없으면 그 시점의 출력은 없습니다. 매뉴얼이 든 예가
명확합니다 — RX qual을 primary로 잡으면 **통화 중일 때만** 결과가 나오고, RX level을
primary로 잡으면 idle 구간까지 포함됩니다.

> **우리 구현과 반대입니다.** 우리 `COMBINE`은 모든 입력의 표본을 합집합한 **키 스파인**에
> 전부를 LEFT JOIN합니다. 즉 primary가 없는 표본도 살아남습니다. 우리 쪽이 정보를 덜
> 버리지만, **레퍼런스 사용자가 기대하는 게이팅이 없습니다.** primary 개념 자체가 우리 UI에
> 없습니다.
>
> 참고: 우리가 처음 만든 FULL JOIN 체인은 세 입력 이상에서 행을 잃었고 그건 그냥 버그였습니다
> (커밋 `94ff566`). 지금의 스파인은 버그는 아니지만 **레퍼런스와 다른 선택**입니다.

**Previous/Current/Next 계열은 우리에게 아예 없습니다.** "이 드롭 직전에 무슨 일이
있었나"가 근본 원인 분석의 핵심 질문인데, 우리는 그걸 노드로 표현할 수 없습니다.

### 2.2 Join 계열 — 값 기준

| 요소 | 동작 |
|---|---|
| **Inner Join** | 사용자가 지정한 join 값(scrambling code, channel number 등)이 **일치하는 행만**. null은 제외 |
| **Left Outer Join** | 왼쪽 전부 + 일치하는 오른쪽 |
| **Union** | 행을 **중복 제거 없이** 합침. **같은 이름·같은 타입 열은 한 열로 합쳐지고**, 아니면 각자 새 열이 됨 |
| **Cartesian Product** | 모든 조합. 실제 용도는 **한 행짜리 집계 결과 여러 개를 한 행에 옆으로 붙이기** |

Union에 대한 중요한 단서 (p359): *"the rows and columns in the resulting data set are in no
particular order, it is often necessary to [sort]"* — **이것이 스크린샷의 `Ascending time`
노드가 존재하는 이유입니다.**

> **우리에겐 Join 계열이 전부 없습니다.** 그리고 **정렬 노드를 넣지 않은 우리 판단이
> 매뉴얼로 확인됐습니다**: 정렬이 필요한 이유가 Union이 순서를 파괴하기 때문인데, 우리
> 행 집합은 `seq` 키라 순서가 무너지지 않습니다.

---

## 3. 연산 (p362–p378)

| 요소 | 동작 | 우리 상태 |
|---|---|---|
| **Case** | 조건별 분기 | `STATE_MACHINE`이 부분적으로 겸함 |
| **Moving Average** | 앞선 N개 샘플의 이동평균. *"removes anomalies … making it more stable"* | ⛔ |
| **Conversion** | 값 변환 | ⛔ |
| **State Machine** | 아래 §4 | ◐ **이름만 같고 다른 것** |
| **Group By / Binning** | 여러 파라미터로 그룹핑 + 집계 동시 수행 | ⛔ |

**Aggregate Functions** (p376): Minimum, Maximum, Average, Standard Deviation, Variance,
Sum, Count, Mode, Median, Percentile, First, Last.

각 집계에 **`Weight by`** 가 있습니다 — 시간 또는 **거리(GPS 좌표 기반)**. p375가 이유를
못박습니다: Nemo 파일이 시간 기반이라 Average/Count는 시간 가중이 **필수**입니다.

> 우리는 1 Hz 균일 샘플이라 가중이 필요 없습니다. **`Weight by`가 없는 것은 격차가
> 아니라 데이터 모델의 차이입니다.** 단 `Weight by distance`는 우리 거리 비닝과 같은
> 문제의식입니다.

---

## 4. State Machine — 우리가 만든 것과 출력 모양이 다릅니다 (p367–p372)

매뉴얼의 정의:

- **이름 붙은 상태들**과 **Initial State** 하나
- 상태 간 **전이(transition)**. 전이마다 **조건**이 붙고, 조건은 `Left Column` / 연산자 /
  `Value` 또는 `Right Column` 형태이며 **AND/OR로 결합**
- **Time trigger**: 정해진 시간(ms) 안에 조건이 충족되지 **않으면** 발동하는 전이
- **Output**: 전이에 붙이는 제목. **비워 두면 그 전이에서는 출력이 생기지 않음**
  (idle 상태에는 비워 두라고 명시)
- 규칙: *"there is always a returning transition from each state"* — 각 상태마다 돌아오는
  전이가 반드시 있어야 정확한 결과가 나옴

**출력 모양이 핵심입니다 (p370).** 상태 x → y 전이가 일어나면 출력에 기록되는 것은:

| 열 | 뜻 |
|---|---|
| `start_time` | x → y 전이가 일어난 시각 |
| (다음 전이 시각) | y → 다음 상태로 전이한 시각 |
| `time_interval` | **상태 y에 머문 시간 (ms)** |

즉 **표본마다 한 값이 아니라, 상태 점유마다 한 행**입니다. 매뉴얼이 든 용도가 이를
분명히 합니다 — 커스텀 이벤트 생성(`start_time`이 이벤트 발생 시각), 그리고 **절차 지연
측정**: radio bearer 확립 시작에 진입하고 확립되면 빠져나오는 상태를 만들면
*"time_interval output column directly indicates the delay of radio bearer establishment in
milliseconds"*.

> ### 우리 구현과의 차이 — 이것이 가장 큰 격차입니다
>
> 우리 `STATE_MACHINE`은 **표본별 `CASE` 문**입니다. 조건이 맞는 첫 상태의 번호를 그
> 표본의 값으로 냅니다. 즉:
>
> | | 레퍼런스 | 우리 |
> |---|---|---|
> | 상태 정의 | 이름 + 초기 상태 + **전이 그래프** | 조건 목록 (순서대로 평가) |
> | 기억 | **있음** — 현재 상태가 다음 전이를 좌우 | **없음** — 표본마다 독립 판정 |
> | 시간 조건 | **Time trigger** (N ms 안에 미충족 시 전이) | ⛔ |
> | 출력 | **상태 점유마다 한 행** + `time_interval` | **표본마다 한 값** |
> | 대표 용도 | 커스텀 이벤트 생성, **절차 지연 측정** | 값 분류 |
>
> 우리 것은 "기억 없는 상태 기계"가 아니라 **다른 종류의 노드**입니다. 정직한 이름은
> **분류기(Classifier)** 이고, 진짜 State Machine은 별도로 만들어야 합니다.
> `time_interval`을 낼 수 있어야 절차 지연이라는 용도가 열립니다.

---

## 5. 정렬 · 필터 · 수학 · 시간 (p378–p390)

| 요소 | 동작 | 우리 상태 |
|---|---|---|
| **Sort** | 지정 열로 정렬 | ⛔ (불필요 — §2.2 참조) |
| **Filter** | 조건 불충족 값 제거 | ✅ `FILTER` |
| **Top-N / Bottom-N** | 상위·하위 N개. **`Group by` 지원** — 예: scrambling code별 Ec/N0 상위 2개 | ⛔ |
| **Nth Best / Nth Worst** | N번째 값 | ◐ `SOURCE_NEIGHBOUR`의 rank가 이웃 셀 한정으로 대응 |
| **Discard Worst** | 최악값 버리기 | ⛔ |
| **Mathematical functions** | 사칙연산 + **Root(N제곱근)**, **Round** 등 | ◐ 사칙연산만 |
| **Time: Resample** | 지정 간격(ms/s)으로 재표본화 | ⛔ |
| **Time: Time Shift** | 시간축 이동 | ⛔ |

`Resample`이 없는 것은 우리에게 큰 문제가 아닙니다 — 이미 1 Hz 균일이라 재표본화할
불규칙성이 없습니다. 반대로 **Top-N with Group by**는 우리에게 없고 유용합니다.

---

## 6. 실행과 저장 (p391–p396)

| | |
|---|---|
| 실행 | 캔버스 우클릭 → **Run Script**. 실행 전 Output에 연결돼 **초록으로 바뀌어야** 함 |
| 색 규약 | **빨강 = 설정 미완**, **초록 = 동작 가능**. 연결하면 초록으로 바뀜 |
| 저장 | 우클릭 → Save. 부분 그래프는 **컴포넌트로 저장**해 재사용 가능 (p392) |
| 실행 방식 | **KPI execution method**와 **value constants** 정의 가능 (p395) — 스크립트에서 일반 참조로 부를 수 있는 값 |
| 초기화 | 우클릭 → New Script |

> **우리 상태**: Run/Save는 있고(저장 시 즉시 계산), **빨강/초록 색 규약도 구현**돼 있습니다
> (미설정 노드는 검증 리포트가 이유를 말함). 없는 것: **컴포넌트 저장(부분 그래프 재사용)**,
> **value constants**, 그리고 **여러 측정 파일을 골라 실행**하는 개념(우리는 항상 전 세션).

---

## 7. UC27 — 워크벤치 실전 예제 (p403–p426)

우리가 스크린샷에서 판독한 바로 그 그래프의 제작 절차입니다. **구조 판독은 정확했고**,
이제 각 단계의 이유가 확인됐습니다.

**문제**: 핸드오버가 누락돼 발생한 드롭콜을 찾아내기. 도심에서 건물 모서리가 서빙 셀을
순간 차단하면 핸드오버를 알릴 시간이 없습니다.

**지표 선택 (p404)**: 누락 핸드오버 시 두 파라미터가 거의 동시에 움직입니다 — BLER이
오르고, **active set의 Ec/N0가 monitored set의 것보다 낮아집니다.** 그래서
`Ec/N0 best active set − Ec/N0 1. best < 0` 이면 더 좋은 셀이 있는데 옮겨가지 않은 것.

**상태 기계 설계 (p404)**: `OK` → `Bad BLER` → `Missing handover` 3상태.

| 전이 | 조건 |
|---|---|
| OK → Bad BLER | `BLER >= 20` |
| Bad BLER → Missing handover | `Ec/N0 difference < 0` |
| Missing handover → Bad BLER | `Ec/N0 difference >= 0` |
| Bad BLER → OK | `BLER < 20` |
| Missing handover → OK | `BLER < 20` |

**단계 (p405–p426, 실제 그래프는 p425)**:

| # | 노드 | 매뉴얼이 밝힌 이유 |
|---|---|---|
| 1 | 파라미터 3개 드롭 — `BLER`, `Ec/N0 best active set`, `Ec/N0 Nth best`(Value=1) | |
| 2 | Ec/N0 둘 → **All Values Within Time Range** | 시간 기준 결합 |
| 3 | → **Math 뺄셈** (`- ec/no AND 1. best Ec/No AS Ec/No difference`) | 차이를 열 하나로 |
| 4 | `BLER` + 차이 → **Union** | *"a correlation method that **does not remove any data** from either of the sets, namely Union"* (p407) |
| 5 | → **Ascending sort (Column = time)** | *"rows are not ordered by time. As **most operations require the input data to be ordered by time**, you need to sort the data set before performing any further operations"* (p409) |
| 6 | → **State Machine** (OK / Bad BLER / Missing handover) | |
| 7 | `Call dropped` + 상태 기계 → **All Values Within Time Range** | 상태 기계가 **primary**(가장 왼쪽 소켓) |
| 8 | → **Output** (`Column count: 19`) | |
| 9 | 우클릭 → Save → 이름 입력 → **Column Aliases** 마법사 | 저장하면 *"can now be found in the Parameters view under the **User** item"* (p426) |

> **정정 (2026-09-01)**: 이전 판의 단계 목록에서 4·5단계(**Union**과 **정렬**)가 빠져
> 있었고, `p408`을 "완성 그래프"라고 적었으나 그것은 Output이 아직 빨강인 **중간
> 단계**였습니다. 완성 그래프는 **p425**입니다.
>
> 다만 **설계가 이 노드들을 못 본 것은 아닙니다.** 우리가 근거로 삼은
> `nemo-analyze_kpi-workbench.png`는 p425와 내용이 같은 완성 그래프이고,
> `Union`과 `Ascending time`이 그 안에 있습니다. 정렬 노드를 넣지 않기로 한 판단도
> 그것을 보고 내린 것입니다. 빠진 것은 **이 문서의 단계 목록**뿐이었습니다.

### 7.1 Output 필드의 의미 — 상태가 아니라 **나가는 전이**에 붙입니다

전이 5개 중 Output 이름을 넣는 것은 **둘뿐**입니다.

| 전이 | 조건 | Output 필드 |
|---|---|---|
| OK → Bad BLER | `bler >= 20` | **비움** |
| Bad BLER → OK | `bler < 20` | **비움** |
| Bad BLER → Missing handover | `Ec/N0 difference < 0` | **비움** |
| **Missing handover → OK** | `bler < 20` | **`Missing handover`** |
| **Missing handover → Bad BLER** | `Ec/N0 difference >= 0` | **`Missing handover`** |

매뉴얼의 설명이 규칙을 그대로 말합니다 — *"Because the only relevant state in terms of the KPI is
Missing handover and the output should not include any data from the state OK, leave the Output
field empty"* (p415), 그리고 *"As the output should include the data from the state Missing
handover, enter the name Missing handover to the Output field"* (p421).

> 즉 **행은 그 상태를 빠져나올 때 기록되고, 이름은 방금 있었던 상태를 가리킵니다.**
> 그래서 `time_interval`이 "그 상태에 머문 시간"이 됩니다. 관심 있는 상태에서 **나가는 모든
> 전이**에 같은 Output 이름을 적어야 빠짐없이 잡힙니다.

### 7.2 실행 결과 — 출력 모양이 실제 값으로 확인됩니다 (p426)

| start_time | end_time | time_interval | index | text | Event ID | Event |
|---|---|---|---|---|---|---|
| 15:55:46.435 | 15:55:51.776 | **5341** | 1 | **Missing handover** | CAD | Call dropped |
| 15:55:48.986 | 15:55:51.776 | 5341 | 1 | Missing handover | CAD | Call dropped |

전체 측정에서 **2행**입니다. `time_interval` 5341 ms = 드롭 전에 나쁜 상태에 머문 5.3초.
*"The final output includes **only the rows with Missing handover events** … and if there are
Call dropped events within the time range of the Missing handover events, these will be displayed
as well"* (p425).

> 이것이 이 도구의 값어치를 한 장으로 보여 줍니다. 수만 표본에서 **행 2개**가 남고,
> 각 행이 "언제부터 언제까지, 몇 ms 동안, 무엇 때문에" 를 전부 답합니다.
> 우리 `STATE_MACHINE`은 표본마다 상태 번호 하나를 내므로 **이 표를 만들 수 없습니다.**

> **우리 도구로 이 KPI를 만들 수 있는가**: **아니오.** 네 가지가 막습니다 —
> (1) State Machine이 상태를 기억하지 않아 `Bad BLER`를 거쳐야 `Missing handover`가 된다는
> **순서**를 표현할 수 없고, (2) 출력이 표본별 값이라 `start_time`/`time_interval` 구간 행을
> 낼 수 없고, (3) 드롭콜 이벤트와 상태 구간을 상관시킬 **primary 게이팅**이 없고,
> (4) 우리 `sample_neighbour`에는 **active set 개념이 없습니다**(서빙 셀 하나 + 이웃).
>
> 이 넷이 "노드 그래프를 만들었다"와 "레퍼런스의 대표 KPI를 재현할 수 있다" 사이의
> 실제 거리입니다.

### 7.3 위상이 다릅니다 — 그들은 **스트림**, 우리는 **행**

4단계의 Union이 이 차이를 만듭니다. Union은 행을 **쌓습니다** — 결과 스트림의 한 행에는
`BLER`이 있거나 `Ec/N0 difference`가 있고, 보통 **둘 다 있지는 않습니다**. 그래서 시간순
정렬이 필수이고, 상태 기계는 **"직전에 본 다른 파라미터의 값"을 기억해야만** 동작합니다.

우리 `COMBINE`은 키 스파인 조인이라 한 행에 **모든 입력이 동시에** 들어옵니다.
1 Hz 균일 샘플이라 같은 `seq`에 BLER과 Ec/N0 차이가 함께 존재하기 때문입니다.

> **함의**: 우리가 진짜 State Machine을 만들 때 필요한 기억은 그들보다 **적습니다.**
> 그들의 기억은 두 가지 일을 합니다 — (a) 상태 순서(`OK`→`Bad BLER`→`Missing handover`)를
> 강제하는 것과 (b) 스트림이 흩어 놓은 파라미터 값을 모으는 것. **우리에게 필요한 것은
> (a)뿐입니다.** (b)는 스키마가 이미 해결했습니다.
>
> 반대로 우리가 반드시 새로 만들어야 하는 것은 **구간 출력**입니다. 그건 기억의 문제가
> 아니라 결과 테이블의 모양 문제이고, 지금 우리 워크벤치는 출력이 `sample_kpi`의
> `(session_id, seq, kpi_name, value)` 한 행으로 고정돼 있어 `start_time`/`time_interval`을
> 담을 곳이 없습니다. **저장 모델을 건드려야 하는 유일한 항목입니다.**

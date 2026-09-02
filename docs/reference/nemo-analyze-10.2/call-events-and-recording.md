# 호 이벤트 정의와 이벤트 기반 기록 원리 — Appendix 3 · 4 (p477–478)

매뉴얼 부록 두 편의 전사입니다. 둘 다 한 쪽짜리지만 **KPI 정의의 근거**라 따로 둡니다 — 드롭콜과
시도 실패를 어느 시점으로 가르는가(부록 4), 그리고 표본을 어떻게 가중해야 하는가(부록 3).

| | |
|---|---|
| 출처 | Nemo Analyze User Guide · `NTN00000A-90013` · Appendix 3 (p477) · Appendix 4 (p478) |
| 관련 문서 | [`corrections.md` C7](corrections.md) (거리 가중), [`use-cases.md`](use-cases.md) UC27 (드롭콜 KPI) |

---

## Appendix 4 — Nemo 호 이벤트와 ETSI 호 이벤트의 차이 (p478)

### 정의

- **Nemo call events** — 음성/영상 호의 설정·해제 각 단계의 트리거 시점. Nemo 측정 도구가 로그
  파일(`.nmf`)에 쓰는 것이며 *Nemo File Format Specification*에 정의됨.
- **ETSI call events** — **ETSI TS 102 250-2**가 정의한 트리거 시점.

### 결정적 차이 — "연결됨"의 시점

> *"The major difference between the two call events is that Nemo events consider call as connected
> when **traffic channel over the air interface is allocated** to the mobile, while ETSI events consider
> call as connected when **ALERTING is reached** (or when call is answered if ALERTING is not used)."*

이 차이가 **호 설정 성공률과 드롭콜률 KPI에 직접 영향**을 줍니다:

| 상황 | Nemo 이벤트 | ETSI 이벤트 |
|---|---|---|
| 트래픽 채널 할당 **뒤**, ALERTING **전**에 호가 실패 | **Dropped call** | **Call attempt failure** |

### 변환 가능성

- Nemo 도구는 로그에 **Nemo 이벤트**를 씁니다. Nemo 이벤트는 ETSI와 호환되며 **후처리에서 ETSI로
  변환**할 수 있습니다.
- ETSI는 Nemo 트리거 시점의 **부분집합**이고, 모든 ETSI 이벤트에 **일대일 대응하는 Nemo 트리거
  시점**이 있습니다.
- Nemo Analyze와 Nemo Outdoor는 **두 체계를 모두** 사용자에게 제공합니다.

### 어느 쪽을 쓸 것인가 — 매뉴얼의 권고

> *"ETSI way of defining the call setup phases is a widely used industry standard. Therefore, **we
> recommend using the ETSI call events in call KPI reporting.**"*

Nemo 이벤트 논리는 1990년대 초기 망·도구 시절에서 물려받은 것이며, 로그 형식이 많은 제3자 도구에서
쓰이므로 **하위 호환을 위해 원시 로그의 Nemo 이벤트 논리는 앞으로도 유지**됩니다.

### 우리에게

우리 `event_type` 레지스트리와 Problem Survey의 원인 분류(드롭 · 시도 실패)는 **어느 정의를
따르는지가 문서에 없습니다.** 시드 생성기가 만드는 `CALL_DROP` · `CALL_SETUP_FAILURE` 이벤트가
"트래픽 채널 할당 시점"과 "ALERTING 시점" 중 무엇을 기준으로 갈리는지 정해 두어야, 레퍼런스의
ETSI 리포트와 우리 리포트의 드롭콜률을 같은 잣대로 비교할 수 있습니다. 매뉴얼의 권고대로 **ETSI
정의를 기본으로 채택**하고, 필요하면 Nemo 정의를 옵션으로 두는 것이 대응입니다.

---

## Appendix 3 — Nemo 도구의 이벤트 기반 데이터 기록 원리 (p477)

### 원리

> *"The underlying data recording principle of all Nemo measurement tools is that the data is written to
> the log file **only when values change**, that is, values are not written periodically. More precisely,
> if any of the information elements of a given event change, the event is written to the log file."*

실제로는 많은 요소가 최소 표본 주기로 **사실상 주기적으로** 기록됩니다 — 서빙·이웃 셀의 신호
강도·품질이 한 이벤트에 함께 들어 있어, 그중 하나라도 바뀌면 이벤트 전체가 기록되고 실제 망에서는
값이 끊임없이 바뀌기 때문입니다.

### 실질적 영향이 있는 경우 — Rx Quality 예

GSM Rx Quality는 좋은 망에서 오래 0에 머물다 간섭 때 잠깐 튑니다. 통화 중 기록이 세 번뿐인 경우:

| 값 | 지속 |
|---|---|
| 0 | 90 s |
| 5 | 0.5 s |
| 0 | 10 s |

- 단순 평균: (0 + 5 + 0) / 3 = **1.667** — 틀림. 세 표본의 무게가 다름.
- 지속시간 가중 평균: (0×90 + 5×0.5 + 0×10) / (90 + 0.5 + 10) = **0.025**.

일반식: **Mean = Σ(Sᵢ · dᵢ) / Σ dᵢ**, `d`는 표본의 지속 — **시간 또는 거리**.

### Nemo Analyze가 하는 것

- 라인 그래프: 표본의 선은 **다음 표본까지 수평 유지**(지속시간만큼).
- 지도: 경로 구간이 **표본 지속시간에 따라** 칠해짐.
- 평균·cumulation·density: 표본마다 **지속시간으로 가중**.
- 지속은 **시간 또는 거리** — *"If the samples from the entire measurement route are to have equal
  weight and for instance the weighting effect of time spent at traffic lights is to be excluded, the
  samples should be weighted by distance."* 가중 방식은 옵션과 Crystal Reports 템플릿별 설정에서
  고름.

### 우리에게

우리 표본은 1 Hz 균일이라 **시간 가중은 불필요**하고, **거리 가중은 필요**하며 이미 넣었습니다
(`AggregationBasis`의 `[Distance]`). 근거와 정정 이력은 [`corrections.md` C7](corrections.md).
"값이 바뀔 때만 기록"이라는 원리는 우리 데이터에는 없지만, **Nemo 로그를 직접 임포트하게 될 때**
표본 지속시간(이진 타임스탬프의 `TI_INTERVAL`, [`database-schema.md`](database-schema.md))을 함께
읽어야 하는 이유입니다.

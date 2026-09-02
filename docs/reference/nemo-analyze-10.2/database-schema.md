# 레퍼런스의 데이터 모델과 질의 경로 — 11장 SQL · Query Manager (p319–344)

Nemo Analyze가 측정 데이터를 **어떻게 저장하고 어떤 경로로 꺼내는지**를 원문에서 옮겼습니다. 우리
스키마(`sample` · `sample_kpi` · `sample_neighbour` · `network_event` · `signaling_message` ·
`cell_ref`)와의 대조는 각 절 끝에 있습니다.

| | |
|---|---|
| 출처 | User Guide ch.11 Customization — SQL queries (p319–333) · Query Manager (p333–344) |
| 관련 문서 | [`query-api.md`](query-api.md)(스칼라 함수·프로시저 signature) · [`kpi-workbench.md`](kpi-workbench.md) · [`corrections.md` C8·C9](corrections.md) |

---

## 1. 세 가지 질의 경로 (p319)

Nemo Analyze는 SQL DB 위에 있고 표준 ODBC로 질의합니다. 데이터를 꺼내는 길이 셋입니다.

| 경로 | 무엇 | 언제 |
|---|---|---|
| **SQL 질의** | Database Browser나 외부 편집기로 작성, Query Manager에 등록 | 스칼라(행 단위) 필터·서식. **같은 테이블 안**의 데이터면 좋음 |
| **KPI Workbench** | 그래프 기반 스크립트 | 셋 이상 테이블의 시간 상관, 이벤트 시퀀스 추적. **SQL 경험이 없으면 이것이 기본** |
| **제3자 ODBC 도구** | 같은 DB에 직접 | 아래 §7의 차이를 지켜야 함 |

SQL의 한계로 매뉴얼이 드는 둘: *"impossible to create queries that track certain event sequences"*,
*"impossible to merge data from more than two data sets into a single result set based on time"*.
(후자의 "impossible"이 실제로는 "평범한 조인으로는"이라는 뜻임은 [`corrections.md` C8](corrections.md).)

**참고 자료** (p320): Nemo File Format specification(`Help | Nemo file format`), Open Access SQL
reference, Keysight 고유 스칼라·프로시저(`Help | Help topics`), **DB 스키마**(`Help | Creating Customer
Queries | SQL Queries | Nemo Analyze Database schema` — 질의에 수 분, PDF로 내보내기 가능).

## 2. 스키마 — 이벤트 1종 = 테이블 1개 (p320–323)

- **테이블 = Nemo 로그의 이벤트 종류.** BLER 이벤트는 `BLER` 테이블의 행. 참조 문법은
  `"스키마"."테이블"`, 예 `"Nemo.UMTS"."BLER"`. 같은 파라미터가 시스템별로 여러 테이블에 있음
  (`"GSM"."BLER"`, `"UMTS"."BLER"`).
- **키.** 기본 키는 항상 **`lr_id`**. 외래 키는 접두사 **`the_`** — `the_parent` · `the_event` ·
  `the_connection` · `the_measurement`. 관계는 1:1과 1:N만.
- **공통 테이블 셋**

  | 테이블 | 행 하나 = | 담는 것 |
  |---|---|---|
  | `Event` | 이벤트 하나 | time · latitude · longitude · GPS distance 등 **모든 이벤트의 공통 정보** |
  | `Device` | 로그 파일 하나 | 파일 확장자(장치 번호). `the_measurement`로 Measurement를 가리킴 |
  | `Measurement` | 측정 세션 하나 | 제목 등. 다중 단말 측정이면 세션 1행에 Device N행 |

- **정적 이벤트** (예 `SHO`): 정보 요소 수가 고정. `SHO` 테이블 1행 ↔ `Event` 1행(`the_event`), N행 →
  `Device` 1행(`file_id`).
- **동적 이벤트** (예 `ECN0`): 요소 수가 가변 → **자식 테이블로 분리**. `ECN0` 1행(active/monitored 셋
  개수 등) → `Channel` N행(캐리어 RSSI, `the_parent`) → `Cell` N행(셀별 Ec/N0 · RSCP · 채널 · SC,
  `the_parent`). 예: 셀 6개(채널 2개)인 ECN0 이벤트 하나 = `ECN0` 1행 + `Channel` 2행 + `Cell` 6행.

> **우리와 대조.** 우리는 이벤트별 테이블 대신 **KPI 세로형**(`sample_kpi(session_id, seq, kpi_name,
> value)`)입니다. 그들의 `Event`가 우리 `sample`(좌표·시각), `Device`+`Measurement`가 `session`,
> `Cell` 자식 테이블이 `sample_neighbour`에 해당합니다. 그들이 "관계가 정의되지 않은 테이블을
> 시간으로 잇는" 데 쓰는 비용을 우리는 `(session_id, seq)` 조인으로 치르지 않습니다 — 이것이 우리
> Combine이 쉬웠던 이유입니다([`corrections.md` C8·C9](corrections.md)).

## 3. 뷰 — `+` 붙은 자동 조인 테이블 (p323–324)

데이터 테이블마다 `Event` · `Device` · `Measurement`를 조인해 둔 **뷰**가 있고 이름 끝에 **`+`**가
붙습니다 (`BLER+`, `SHO+`). 시각·위경도·파일명이 필요하면 **항상 뷰를 쓰라**고 권합니다 — 질의가
단순해지고, ODBC 드라이버가 조인해 약간 더 빠릅니다.

## 4. 타임스탬프 두 종류 (p325–326)

| 열 | 형식 | 담는 것 |
|---|---|---|
| **`time`** | 고유 **이진** 형식 | 시각 **+ 표본 지속시간**. Nemo Analyze 전용 — 경로 채색·선 그리기·통계 가중에 자동 사용 |
| **`sql_time`** | 표준 SQL timestamp | 시각만. 제3자 도구, `ORDER BY`, 조건식(`x.sql_time > y.sql_time`)에 사용 |

- 지속시간은 `TI_INTERVAL(time)`(ms)으로. **점 이벤트**(드롭콜 · 시도 실패 · 셀 재선택)는 지속시간
  **0**, Rx level · Ec/N0 · throughput · BLER 등은 지속시간이 있음.
- `T_(time)`도 실제 시각이지만 **인덱스를 못 써서 느리므로** 조건에는 `sql_time`.

> **우리와 대조.** 우리는 `ts`(TIMESTAMPTZ) 하나이고 표본이 1 Hz 균일이라 지속시간 열이 필요
> 없습니다. `network_event`와 `signaling_message`가 `seq` 없이 `ts`만 갖는 것이 그들의 "지속시간 0인
> 점 이벤트"에 해당합니다.

## 5. 로그 파일 필터 — `MEAS()` 힌트 (p326–327)

질의는 보통 DB 전체가 아니라 파일 부분집합에 걸립니다. 최적 성능은 `WHERE`에 Nemo 고유 함수:

```
MEAS1({file_name}:{device_extension})
MEAS({file_1}:{ext}|{file_2}:{ext}|...)
WHERE file_id = ANY(MEAS('name_1:1|name_2:1'))
```

Nemo Analyze용 커스텀 질의에서는 **`file_id = {!file}`** 이라고만 쓰면 실행 시 선택된 파일들의
`MEAS()`로 **자동 치환**됩니다. 즉 질의를 특정 파일에 고정하지 않습니다.

## 6. 값 열거와 Connection 테이블 (p327–330)

**값 열거.** 이산 텍스트 값(system, handover type, call disconnect status, failure cause …)은 DB에
**숫자**로 저장되고 텍스트는 `ValueEnum` 테이블에. `VAL_TO_STRING(<param>, <column>)`으로 변환하되,
Nemo Analyze 안에서 쓰는 질의라면 **자동 변환되므로 불필요**.

**Connection 테이블.** 드라이브 중의 접속 세션이 별도 테이블로 저장됩니다:

| 번호 | 타입 | | 번호 | 타입 |
|---|---|---|---|---|
| 0 | Unknown | | 7 | Data transfer |
| 1 | Voice | | 8 | MMS |
| 2 | Handover | | 9 | SMS |
| 3 | Attach | | 10 | POC |
| 4 | PDP context activation | | 11 | LAU |
| 5 | Data | | 12 | RAU |
| 6 | RRC | | 13 | Ping |

- **계층**: `DataTransfer` → 부모 `Data` → 부모 `PDPContextActivation` → 부모 `Attach`.
- 세션 중에만 기록되는 데이터(Tx power, application throughput, BLER)는 `the_connection`으로 해당
  Connection 행을 가리킴. Connection 테이블은 세션의 **시작·끝 이벤트**(예 Attach의 `GAA` attempt ·
  `GAC` connected · `CAD` disconnected · `CAF` failure)와도 관계를 가짐.
- 용도: 세션별 그룹핑(`SELECT the_connection, AVG(app_throughput_downlink) FROM "Nemo"."DAS+"
  WHERE throughput_status=1 GROUP BY the_connection`), 데이터 전송 중 표본만 필터, PDP 활성 + APN
  조건 필터. 스칼라 `CONN_IS_SHARED(conn1.lr_id, conn2.lr_id)`(같은 세션이거나 부모·자식) ·
  `CONN_IS_TYPE(conn.lr_id, n)`.

> **우리와 대조 — 결정 사항.** 우리 계층은 **세션 → 표본**뿐이고 "호(call)"나 "데이터 전송"이라는
> 중간 개체가 없습니다. 그래서 "호당 평균 throughput", "통화 중 표본만"이 지금은 이벤트 쌍(시작·끝)을
> 시간으로 다시 묶어야 나옵니다. `query-api.md` §6이 "결정 필요"로 남긴 항목이 이것이며, 도입한다면
> 위 13종 중 우리 데이터에 있는 Voice · Data transfer · RRC · Handover 넷이 출발점입니다.

## 7. 관계 없는 테이블의 시간 상관 (p330–331)

**표본 기반 상관** — 두 테이블을 `FROM x, y` + `WHERE x.time = y.time` + `x.file_id = y.file_id` +
힌트 `/* OPTIONS(USE_TIME_SCOPE) */`. `FROM` 순서가 결정적입니다: 앞 테이블 x의 표본이 뒤 테이블 y
표본의 **유효 시간 구간 안에 들면** 매칭. **양방향이 아니므로** 표본 주기가 짧은 테이블을 **뒤(y)**에
둬야 해상도가 최대. 예: `"Nemo.UMTS"."TXPC"`(Tx power)와 `"Nemo.UMTS.ECNO"."Cell"`(RSCP)을 이어
RSCP < −95인 구간의 Tx power.

**시간 범위 상관** — 시작·끝 이벤트가 있는 세션(예 데이터 전송)에 Ec/N0 같은 항상 기록되는
파라미터를 붙일 때. `WHERE`의 시간 조건은 **`sql_time`**으로, 시작·끝은 조인해야 함.

**Nemo Analyze SQL 인터페이스의 고유 규칙 요약** (p332–333):

| 항목 | Nemo Analyze용 질의 | 제3자 도구용 질의 |
|---|---|---|
| 타임스탬프 | 이진 `time` 그대로(자동 변환·지속시간 활용) | `sql_time` + `TI_INTERVAL(time)` |
| 파일 제한 | 질의에 넣지 **않음**(실행 시 힌트로 자동) | `MEAS()` 힌트 권장 |
| 값 열거 | 자동 변환 | `VAL_TO_STRING` |
| 정렬 | 파일별 시간순 자동. `GROUP BY` · `UNION` 뒤에는 **`ORDER BY sql_time` 필수** | 동일 |

**개발 절차** (p331–332): 스키마 PDF에서 파라미터 검색 → 기존 질의를 뷰에서 실행하고 **Log 창의 SQL
출력**(Logging 대화상자에서 `SQL` 체크)에서 실행된 SQL을 복사 → Database Browser에 붙여 수정 →
Query Manager에 등록 → Parameters의 `User` 아래에 나타남.

## 8. Query Manager — 워크벤치 없이 커스텀 파라미터 만들기 (p333–344)

`Tools | Query Manager` → `User` 선택 → `Add`. 질의를 특정 파일에 **고정하지 말 것**(실행 시 자동
제한). 네 종류:

| 종류 | 절차 | 특기 |
|---|---|---|
| **Pick Measurement Parameter** (p334–337) | 파라미터 선택(필터 칸) → `Fill Parameters`(Area · Time 등 필터, 우클릭 Add/Modify/Delete) → 숫자 파라미터면 **`Statistics`**(`Statistics type` · `Percentile value` · **`Group by`** 예 SC별 Ec/N0) → `Properties`(이름·제목·설명, **SQL 수동 편집 가능**) → `Column Aliases`(선택) → `Finish` | 가장 쉬움. Query Manager에서 `Modify`로 필터·통계·별칭 재편집, `Copy`로 복제. 상관 질의는 필터 수정 불가 |
| **Generic Query Wizard** (p337–341) | `Select Tables`(스키마의 전체 테이블) → 파라미터 이동(단일/전체 화살표) → `Select Columns` → `Sort Columns`(시간 정렬 권장; 테이블 하나면 기본 시간순) → `Filters`(예 `< 0`, 또는 **`{?Threshold}`** 같은 텍스트 필터 → 실행 때 값 입력) → `Properties` → `Fill Parameters` → `Column Aliases` | 테이블 단위 선택 |
| **Manual query** (p342–343) | 이름 + `Edit SQL manually` → SQL 입력 → `Finish` | SQL과 스키마 지식 필요 |
| **Correlate parameters** (p83–87, p343) | 파라미터 2개 이상 + 모드(left outer / outer / inner join) | 브리프 ②에 정리됨 |

**Database Browser** (`Tools | Database Browser`, p344): 테이블 구조 열람 + 커스텀 질의 작성·테스트.

> **우리와 대조.** 우리는 사용자가 SQL을 쓰지 않는 구조이고 커스텀 KPI 경로는 워크벤치 하나입니다.
> Pick Measurement Parameter의 **`Statistics` 단계**(통계 종류 · 백분위 · Group by)가 우리 워크벤치에
> 없는 **집계 노드**의 가장 단순한 형태이고, `{?Threshold}` **실행 시 변수**는 UC26·부록에서도 나오는
> 개념으로 우리 `FILTER`에 없습니다.

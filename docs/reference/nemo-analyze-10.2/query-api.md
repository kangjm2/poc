# Nemo Analyze의 질의 API — Appendix 5·6·7 전사

출처: Nemo Analyze User Guide `NTN00000A-90013`, 인쇄면 **p479–p504**.

> **이 문서는 요약이 아니라 전사(轉寫)입니다.** 스칼라 함수 **46개**, 저장 프로시저 **16개**의
> `Type` / `Input` / `Return` / `Usage`를 원문 표기 그대로 옮겼습니다 — SQL 타입 이름도
> 손대지 않았습니다(`SMALL INT`, `BINARY TIME`, `SQL TIMESTAMP`).
>
> 이렇게 만든 이유가 있습니다. 이 범위를 처음 추출했을 때는 "발견" 형식으로 요약했고,
> 그 결과 **46개 함수가 13개 항목으로 뭉개져 signature가 통째로 사라졌습니다.**
> 열거형 자료는 요약하면 없어집니다.

전수 확인: 원문 표제에서 기계적으로 뽑은 이름 62개와 전사 결과 62개가 **정확히 일치**합니다
(누락 0, 초과 0).

| | |
|---|---|
| 스칼라 함수 | **46개** / 9개 범주 (p479–494) |
| 저장 프로시저 | **16개** / 5개 범주 (p495–502) |
| `T_FORMAT` 서식 코드 | 21개 (p484) |
| 레지스트리 키 | 2개 (p503) |
| 원문 결함(errata) | 17건 |

---

## 0. 두 부록이 스스로 밝히는 분류 체계

- Appendix 5 opening framing, p479: "These Scalar functions are Keysight proprietary additions to OpenAccess SQL reference. Scalar functions are used in SQL strings to perform actions on a row by row basis. There are currently two different types of functions. • First are functions that execute only once per query, these perform static operations that return constant values that can be used throughout the query execution. • Second are functions that execute on each row of a given result set as it is added to its result set." The per-entry template is then fixed: "• Type: Lists above mentioned type (either const or runtime). • Input: Lists the different input values need for this function. • Return: Lists the data type to be returned from this function. • Usage: Example of syntax • Notes: Provides description of function and other need information".

- Which functions are actually Constant: exactly one in the whole of Appendix 5 — STRING_TO_VAL (p487), "Type: o Constant", Input STRING + STRING, Return INT, Usage "STRING_TO_VAL ("systems", '1')", Notes "Takes a string and converts it into the number used to represent that string in the database." Every other entry in Appendix 5 that carries a Type line is marked Runtime: T_2_TIME, T_MIDNIGHT, T_GMT_OFFSET, T_GMT, T_VALID, T_DIFFERENCE, T_WITH_MILLISEC_OFFSET, T_MIN, T_MAX, T_FORMAT, TI_INTERVAL, TI_2_TIME, TI_2_T, TIME_2_T, TIME_PLUS_SECS, TIME_PLUS_MILLISECS, TIME_DIFF_SECS, TIME_DIFF_MILLISECS, VAL_TO_STRING, TO_STRING, TO_FLOAT, TO_REAL, BIT_TEST, IS_FLOAT_EQUAL, the MSG_* decoder group, MSG_VALUE, BSIC_BCC, BSIC_NCC, BSIC_BCCNCC, CI_16, CI_28, CONN_IS_SHARED, CONN_IS_TYPE, lr_id_HEAD, lr_id_PATH and lr_id_ADDRESS. Note the asymmetry this creates: VAL_TO_STRING is Runtime while its inverse STRING_TO_VAL is Constant — consistent with

- What FREEZE_FRAME exists for, p479: "FREEZE_FRAME scalar function returns a value from subquery for a given time instant of the parent query. It can be used to correlate values based on time column across tables and queries that do not have logical link in the database schema structure." It is a family of three typed variants — "INTEGER_FREEZE_FRAME returns ints / REAL_FREEZE_FRAME returns doubles / STRING_FREEZE_FRAME returns strings" — and "They take seven input variables": ordinal, correlation type, lr_id, time, sub query time column name, value name, sub query. The remaining six are: "• Correlation type (-1, 0, 1)" where "-1 (previous): In reference to the timestamp of the parent query row, returns the previous value from the subquery", "0 (current): ... returns the current value from the subquery based on the validity time interval of the sub query. That is, parent query timestamp is within the time range of the subquery row's time

- What FREEZE_FRAME's ordinal argument does, p479 (verbatim, typos included): "Ordinal, running number (1,2,3,…). When multiple FREEZE_FRAME functions of same type are used in same parent query, the oridinal input controls the caching of the subquery results. If same oridinal number is used for all FREEZE_FRAME scalars of the parent query, the query is executed only once at the first time when the function is called, and the same cache is used in other calls. This speeds up the query execution when the save value is needed in multiple columns of the parent query. If different subqueries are used in the multiple FREEZE_FRAME functions, the oridinal number must be different for each of the functions." So the ordinal is a subquery-result cache slot identifier, not an index into anything: sharing a number across calls shares one cached execution (correct and faster only when the subqueries are identical), and distinct subqueries MUST take dis

---

## 1. 스칼라 함수 — 46개 (p479–494)

매뉴얼의 자체 분류 9개입니다. **`lr_id functions`(p493–494)는 목차에서 빠져 있습니다** —
본문에는 표제가 있고 함수 3개가 실려 있는데 TOC에는 페이지 번호만 남아 있어,
목차를 따라간 추출은 이 범주를 통째로 놓칩니다.

### Freeze frame — 시간으로 테이블을 잇는 스칼라 — 3개

| 함수 | Type | Input | Return | Usage |
|---|---|---|---|---|
| **`INTEGER_FREEZE_FRAME`** | not printed (no "Type:" bullet is given for the FREEZE_… | They take seven input variables: · Ordinal, running number (1,2,3,…). When multiple FREEZE_FRAME functions of same type are used in same parent query, the oridinal input controls the caching of the subquery res… | returns ints (printed as "INTEGER_FREEZE_FRAME returns ints"; no separate "Return:" bullet block is… | not printed (the group's only example, on p480, calls REAL_FREEZE_FRAME) |
| **`REAL_FREEZE_FRAME`** | not printed (no "Type:" bullet is given for the FREEZE_… | They take seven input variables: · Ordinal, running number (1,2,3,…). When multiple FREEZE_FRAME functions of same type are used in same parent query, the oridinal input controls the caching of the subquery res… | returns doubles (printed as "REAL_FREEZE_FRAME returns doubles"; no separate "Return:" bullet block… | SELECT "time", "channel_number", "scrambling_code", "ec/no", REAL_FREEZE_FRAME(1, 0, x.lr_id, x.time, 'time', 'tx_power_umts', 'SELECT "time… |
| **`STRING_FREEZE_FRAME`** | not printed (no "Type:" bullet is given for the FREEZE_… | They take seven input variables: · Ordinal, running number (1,2,3,…). When multiple FREEZE_FRAME functions of same type are used in same parent query, the oridinal input controls the caching of the subquery res… | returns strings (printed as "STRING_FREEZE_FRAME returns strings."; no separate "Return:" bullet blo… | not printed (the group's only example, on p480, calls REAL_FREEZE_FRAME) |

<details><summary>Notes 원문</summary>

- **`INTEGER_FREEZE_FRAME`** — The manual documents INTEGER_FREEZE_FRAME, REAL_FREEZE_FRAME and STRING_FREEZE_FRAME as a group, in one prose block with a shared input list and a shared example, rather than with the usual Type:/Input:/Return:/Usage:/Notes: bullets. FREEZE_FRAME scalar function returns a value from subquery for a given time instant of the parent query. It can be used to correlate values based on time column across tables and queries that do not have logical link in the database schema structure. FREEZE_FRAME has three variants, one for string, real, and integer datatypes values to be returned: INTEGER_FREEZE_FRAME returns ints, REAL_FREEZE_FRAME returns doubles, STRING_FREEZE_FRAME returns strings. Caching 
- **`REAL_FREEZE_FRAME`** — The manual documents INTEGER_FREEZE_FRAME, REAL_FREEZE_FRAME and STRING_FREEZE_FRAME as a group, in one prose block with a shared input list and a shared example, rather than with the usual Type:/Input:/Return:/Usage:/Notes: bullets; the example is introduced as "Example query below correlates Tx power and BLER to the Ec/N0 serving cell query based on time" and uses two REAL_FREEZE_FRAME calls with different ordinals (1 and 2) because they carry different subqueries. FREEZE_FRAME scalar function returns a value from subquery for a given time instant of the parent query. It can be used to correlate values based on time column across tables and queries that do not have logical link in the data
- **`STRING_FREEZE_FRAME`** — The manual documents INTEGER_FREEZE_FRAME, REAL_FREEZE_FRAME and STRING_FREEZE_FRAME as a group, in one prose block with a shared input list and a shared example, rather than with the usual Type:/Input:/Return:/Usage:/Notes: bullets. FREEZE_FRAME scalar function returns a value from subquery for a given time instant of the parent query. It can be used to correlate values based on time column across tables and queries that do not have logical link in the database schema structure. Three variants: INTEGER_FREEZE_FRAME returns ints, REAL_FREEZE_FRAME returns doubles, STRING_FREEZE_FRAME returns strings. Caching contract: when multiple FREEZE_FRAME functions of the same type are used in the same

</details>

### Binary Time Interval functions — 3개

| 함수 | Type | Input | Return | Usage |
|---|---|---|---|---|
| **`TI_INTERVAL`** | Runtime | binary time stamp | INT | TI_INTERVAL (“time”) |
| **`TI_2_TIME`** | Runtime | binary time stamp | SQL TIMESTAMP | TI_2_TIME (“time”) |
| **`TI_2_T`** | Runtime | binary time stamp | binary time stamp | TI_2_T (“time”) |

<details><summary>Notes 원문</summary>

- **`TI_INTERVAL`** — Returns millisecond range between binary time and binary time interval as milliseconds. Section note: all functions that take binary time but work on interval as primary input begin with TI_. The manual documents this function with its own Type/Input/Return block, not as part of a shared group.
- **`TI_2_TIME`** — Returns time offset by its interval as a SQL TIMESTAMP. Section note: all functions that take binary time but work on interval as primary input begin with TI_. The manual documents this function with its own Type/Input/Return block, not as part of a shared group.
- **`TI_2_T`** — Returns time offset by its interval as a binary time. Interval on return time will be 0. Section note: all functions that take binary time but work on interval as primary input begin with TI_. The manual documents this function with its own Type/Input/Return block, not as part of a shared group.

</details>

### SQL Time functions — 5개

| 함수 | Type | Input | Return | Usage |
|---|---|---|---|---|
| **`TIME_2_T`** | Runtime | SQL TIMESTAMP | binary time stamp | TIME_2_T (“sql_time”) |
| **`TIME_PLUS_SECS`** | Runtime | SQL TIMESTAMP | SQL TIMESTAMP | TIME_PLUS_SECS (“sql_time”) |
| **`TIME_PLUS_MILLISECS`** | Runtime | SQL TIMESTAMP | SQL TIMESTAMP | TIME_PLUS_MILLISECS(“sql_time”) |
| **`TIME_DIFF_SECS`** | Runtime | SQL TIMESTAMP · SQL TIMESTAMP | INT | TIME_DIFF_SECS(“sql_time”, “sql_time”) |
| **`TIME_DIFF_MILLISECS`** | Runtime | SQL TIMESTAMP · SQL TIMESTAMP | INT | TIME_DIFF_MILLISECS(“sql_time”, “sql_time”) |

<details><summary>Notes 원문</summary>

- **`TIME_2_T`** — Returns binary time stamp set to time defined by SQL TIMESTAMP input. Interval will be set to 0. GMT data will also not be set. Section note: all functions that take SQL TIMESTAMP as primary input begin with TIME_. The manual documents this function with its own Type/Input/Return block, not as part of a shared group.
- **`TIME_PLUS_SECS`** — Returns new SQL TIMESTAMP offset by a given number of seconds. Manual quirk: the Notes refer to "a given number of seconds" but the printed Input list and Usage example show only the single SQL TIMESTAMP argument — transcribed as printed. Section note: all functions that take SQL TIMESTAMP as primary input begin with TIME_. The manual documents this function with its own Type/Input/Return block, not as part of a shared group.
- **`TIME_PLUS_MILLISECS`** — Returns new SQL TIMESTAMP offset by a given number of milliseconds. Manual quirk: the Notes refer to "a given number of milliseconds" but the printed Input list and Usage example show only the single SQL TIMESTAMP argument, and the Usage example is printed with no space before the opening parenthesis — transcribed as printed. Section note: all functions that take SQL TIMESTAMP as primary input begin with TIME_. The manual documents this function with its own Type/Input/Return block, not as part of a shared group.
- **`TIME_DIFF_SECS`** — Returns difference between two SQL TIMESTAMPS in seconds. Usage example is printed with no space before the opening parenthesis. Section note: all functions that take SQL TIMESTAMP as primary input begin with TIME_. The manual documents this function with its own Type/Input/Return block, not as part of a shared group.
- **`TIME_DIFF_MILLISECS`** — Returns difference between two SQL TIMESTAMPS in milliseconds. Usage example is printed with no space before the opening parenthesis. Section note: all functions that take SQL TIMESTAMP as primary input begin with TIME_. The manual documents this function with its own Type/Input/Return block, not as part of a shared group.

</details>

### Time / Binary Time functions — 10개

| 함수 | Type | Input | Return | Usage |
|---|---|---|---|---|
| **`T_2_TIME`** | Runtime | binary time stamp | SQL TIMESTAMP | T_2_TIME(“time”) AS sqltime |
| **`T_MIDNIGHT`** | Runtime | binary time stamp | INT | T_MIDNIGHT (“time”) |
| **`T_GMT_OFFSET`** | Runtime | binary time stamp | INT | T_GMT_OFFSET (“time”) |
| **`T_GMT`** | Runtime | binary time stamp | STRING | T_GMT (“time”) |
| **`T_VALID`** | Runtime | binary time stamp | STRING | T_VALID (“time”) |
| **`T_DIFFERENCE`** | Runtime | binary time stamp · binary time stamp | INT | T_DIFFERENCE (“time”, “time”) |
| **`T_WITH_MILLISEC_OFFSET`** | Runtime | binary time stamp · INT | binary time stamp | T_WITH_MILLISEC_OFFSET (“time”, -42) |
| **`T_MIN`** | Runtime | binary time stamp · binary time stamp | binary time stamp | T_MIN (“time”, “time”) |
| **`T_MAX`** | Runtime | binary time stamp · binary time stamp | binary time stamp | T_MAX (“time”, “time”) |
| **`T_FORMAT`** | Runtime | binary time stamp · STRING | STRING | T_FORMAT (“time”, “%#c”) |

<details><summary>Notes 원문</summary>

- **`T_2_TIME`** — Notes printed as "None". Section note covering all of these: "All functions that take binary time as the primary input being with T_" (printed with "being" where "begin" is meant).
- **`T_MIDNIGHT`** — Returns number of milliseconds from midnight. Can be used to compare time versus different dates, etc. Section note covering all of these: "All functions that take binary time as the primary input being with T_" (printed with "being" where "begin" is meant).
- **`T_GMT_OFFSET`** — Returns +/- 12 based on GMT offset. Not all files contain GMT information when being parsed, will return NULL if no GMT information present. Section note covering all of these: "All functions that take binary time as the primary input being with T_" (printed with "being" where "begin" is meant).
- **`T_GMT`** — Returns "TRUE" if time set in GMT and "FALSE" if time set in local. Not all files contain GMT information when being parsed, local is assumed when GMT information is not preset ("preset" as printed, for "present"). Section note covering all of these: "All functions that take binary time as the primary input being with T_" (printed with "being" where "begin" is meant).
- **`T_VALID`** — Returns "TRUE" if time is valid and "FALSE" is time has not been set ("is" as printed, for "if"). Section note covering all of these: "All functions that take binary time as the primary input being with T_" (printed with "being" where "begin" is meant).
- **`T_DIFFERENCE`** — Returns difference in ticks between two timestamps, is limited to narrow time ranges not exceeding a few days. Section note covering all of these: "All functions that take binary time as the primary input being with T_" (printed with "being" where "begin" is meant).
- **`T_WITH_MILLISEC_OFFSET`** — Returns a new timestamp that has been offset from the original by a given number of milliseconds. (The offset may be negative, as in the printed example -42.) Section note covering all of these: "All functions that take binary time as the primary input being with T_" (printed with "being" where "begin" is meant).
- **`T_MIN`** — Returns the lesser of two binary timestamps. Section note covering all of these: "All functions that take binary time as the primary input being with T_" (printed with "being" where "begin" is meant).
- **`T_MAX`** — Returns the greater of two binary timestamps. Section note covering all of these: "All functions that take binary time as the primary input being with T_" (printed with "being" where "begin" is meant).
- **`T_FORMAT`** — Returns time written as formatted string. Format specifiers listed in the manual: %a Abbreviated weekday name; %A Full weekday name; %b Abbreviated month name; %B Full month name; %c Date and time representation appropriate for locale; %d Day of month as decimal number (01 – 31); %H Hour in 24-hour format (00 – 23); %I Hour in 12-hour format (01 – 12); %j Day of year as decimal number (001 – 366); %m Month as decimal number (01 – 12); %M Minute as decimal number (00 – 59); %p Current locale's A.M./P.M. indicator for 12-hour clock; %S Second as decimal number (00 – 59); %U Week of year as decimal number, with Sunday as first day of week (00 – 53); %w Weekday as decimal number (0 – 6; Sunday i

</details>

### Translator functions — 2개

| 함수 | Type | Input | Return | Usage |
|---|---|---|---|---|
| **`VAL_TO_STRING`** | Runtime | STRING · INT | STRING | VAL_TO_STRING (“systems”, “the_measured_system”) |
| **`STRING_TO_VAL`** | Constant | STRING · STRING | INT | STRING_TO_VAL (“systems”, ‘1’) |

<details><summary>Notes 원문</summary>

- **`VAL_TO_STRING`** — Takes integer value and applies it to an array of strings to get a user friend description for the value. Documented individually, not as part of a shared Type/Input/Return block; it sits under the manual's "Translator functions" section, described as changing numeric values stored in the database to user friendly descriptions.
- **`STRING_TO_VAL`** — Takes a string and converts it into the number used to represent that string in the database. Documented individually, not as part of a shared Type/Input/Return block; it sits under the manual's "Translator functions" section, described as changing numeric values stored in the database to user friendly descriptions.

</details>

### Datatype functions — 5개

| 함수 | Type | Input | Return | Usage |
|---|---|---|---|---|
| **`TO_STRING`** | Runtime | Numeric data types. | STRING | TO_STRING (“value”) |
| **`TO_FLOAT`** | Runtime | Numeric data types. | DOUBLE | TO_FLOAT (“value”) |
| **`TO_REAL`** | Runtime | Numeric data types. | REAL | TO_REAL (“value”) |
| **`BIT_TEST`** | Runtime | INT · INT | INT | BIT_TEST (“value”, ‘0x0004’) |
| **`IS_FLOAT_EQUAL`** | Runtime | DOUBLE · DOUBLE · INT | INT | IS_FLOAT_EQUAL (“value”, “value”, ‘6’) |

<details><summary>Notes 원문</summary>

- **`TO_STRING`** — Takes numeric data type and returns it as a string. Documented individually, not as part of a shared Type/Input/Return block; it sits under the manual's "Datatype functions" section, described as performing basic operations to change type, check type, etc.
- **`TO_FLOAT`** — Takes numeric data type and returns it as a floating point number. 8 bytes. Documented individually, not as part of a shared Type/Input/Return block; it sits under the manual's "Datatype functions" section, described as performing basic operations to change type, check type, etc.
- **`TO_REAL`** — Takes numeric data type and returns it as a floating point number. 4 bytes. Documented individually, not as part of a shared Type/Input/Return block; it sits under the manual's "Datatype functions" section, described as performing basic operations to change type, check type, etc.
- **`BIT_TEST`** — Does AND comparison between two values. Returns 1 if true and 0 if false. Documented individually, not as part of a shared Type/Input/Return block; it sits under the manual's "Datatype functions" section, described as performing basic operations to change type, check type, etc.
- **`IS_FLOAT_EQUAL`** — Compares two floating point values for equal. 3rd input defines precision to be used. Documented individually, not as part of a shared Type/Input/Return block; it sits under the manual's "Datatype functions" section, described as performing basic operations to change type, check type, etc.

</details>

### Decoder functions — 13개

| 함수 | Type | Input | Return | Usage |
|---|---|---|---|---|
| **`MSG_L3`** | Runtime | INT (System) · INT (Band) · INT (Protocol revision) · SMALL INT (Direction, 1 or 0) · STRING (Sub Channel Type) · STRING (Message Name) · STRING (Message Data) | STRING | MSG_L3 (‘1’, ‘1900’, ‘1’, ‘0’, ‘DCCH’, ‘ACTIVATE_PDP_CONTEXT_ACCEPT’, ‘8A 42 03’) |
| **`MSG_L2`** | Runtime | INT (System) · INT (Band) · INT (Protocol revision) · SMALL INT (Direction, 1 or 0) · STRING (Sub Channel Type) · STRING (Message Name) · STRING (Message Data) | STRING | MSG_L3 (‘1’, ‘1900’, ‘1’, ‘0’, ‘DCCH’, ‘ACTIVATE_PDP_CONTEXT_ACCEPT’, ‘8A 42 03’) |
| **`MSG_MAC`** | Runtime | INT (System) · INT (Band) · INT (Protocol revision) · SMALL INT (Direction, 1 or 0) · STRING (Sub Channel Type) · STRING (Message Name) · STRING (Message Data) | STRING | MSG_L3 (‘1’, ‘1900’, ‘1’, ‘0’, ‘DCCH’, ‘ACTIVATE_PDP_CONTEXT_ACCEPT’, ‘8A 42 03’) |
| **`MSG_LLC`** | Runtime | INT (System) · INT (Band) · INT (Protocol revision) · SMALL INT (Direction, 1 or 0) · STRING (Sub Channel Type) · STRING (Message Name) · STRING (Message Data) | STRING | MSG_L3 (‘1’, ‘1900’, ‘1’, ‘0’, ‘DCCH’, ‘ACTIVATE_PDP_CONTEXT_ACCEPT’, ‘8A 42 03’) |
| **`MSG_RRLP`** | Runtime | INT (System) · INT (Band) · INT (Protocol revision) · SMALL INT (Direction, 1 or 0) · STRING (Sub Channel Type) · STRING (Message Name) · STRING (Message Data) | STRING | MSG_L3 (‘1’, ‘1900’, ‘1’, ‘0’, ‘DCCH’, ‘ACTIVATE_PDP_CONTEXT_ACCEPT’, ‘8A 42 03’) |
| **`MSG_RRC`** | Runtime | INT (System) · INT (Band) · INT (Protocol revision) · SMALL INT (Direction, 1 or 0) · STRING (Sub Channel Type) · STRING (Message Name) · STRING (Message Data) | STRING | MSG_L3 (‘1’, ‘1900’, ‘1’, ‘0’, ‘DCCH’, ‘ACTIVATE_PDP_CONTEXT_ACCEPT’, ‘8A 42 03’) |
| **`MSG_RTP`** | Runtime | INT (System) · INT (Band) · INT (Protocol revision) · SMALL INT (Direction, 1 or 0) · STRING (Sub Channel Type) · STRING (Message Name) · STRING (Message Data) | STRING | MSG_L3 (‘1’, ‘1900’, ‘1’, ‘0’, ‘DCCH’, ‘ACTIVATE_PDP_CONTEXT_ACCEPT’, ‘8A 42 03’) |
| **`MSG_VALUE`** | Runtime | STRING · STRING | STRING | MSG_VALUE (MSG_L3(values), ‘FIND THIS’) |
| **`BSIC_BCC`** | Runtime | INT | INT | BSIC_BCC (‘87’) |
| **`BSIC_NCC`** | Runtime | INT | INT | BSIC_NCC(‘87’) |
| **`BSIC_BCCNCC`** | Runtime | INT | INT | BSIC_NCC(‘87’) |
| **`CI_16`** | Runtime | INT | INT | CI_16(‘32287’) |
| **`CI_28`** | Runtime | INT | INT | CI_28(‘32287’) |

<details><summary>Notes 원문</summary>

- **`MSG_L3`** — Takes message coding information and returns decoded message. The manual documents MSG_L3, MSG_L2, MSG_MAC, MSG_LLC, MSG_RRLP, MSG_RRC and MSG_RTP as a group under one shared Type/Input/Return/Usage/Notes block: message decoder functions take a series of inputs and return textual string descriptions of data contained within the messages; they are listed together because the inputs and function are generally the same between all of them — only the type of message they decode differs. The single Usage example printed for the whole group uses MSG_L3.
- **`MSG_L2`** — Takes message coding information and returns decoded message. The manual documents MSG_L3, MSG_L2, MSG_MAC, MSG_LLC, MSG_RRLP, MSG_RRC and MSG_RTP as a group under one shared Type/Input/Return/Usage/Notes block: message decoder functions take a series of inputs and return textual string descriptions of data contained within the messages; they are listed together because the inputs and function are generally the same between all of them — only the type of message they decode differs. No Usage example specific to MSG_L2 is printed; the group's only example uses MSG_L3.
- **`MSG_MAC`** — Takes message coding information and returns decoded message. The manual documents MSG_L3, MSG_L2, MSG_MAC, MSG_LLC, MSG_RRLP, MSG_RRC and MSG_RTP as a group under one shared Type/Input/Return/Usage/Notes block: message decoder functions take a series of inputs and return textual string descriptions of data contained within the messages; they are listed together because the inputs and function are generally the same between all of them — only the type of message they decode differs. No Usage example specific to MSG_MAC is printed; the group's only example uses MSG_L3.
- **`MSG_LLC`** — Takes message coding information and returns decoded message. The manual documents MSG_L3, MSG_L2, MSG_MAC, MSG_LLC, MSG_RRLP, MSG_RRC and MSG_RTP as a group under one shared Type/Input/Return/Usage/Notes block: message decoder functions take a series of inputs and return textual string descriptions of data contained within the messages; they are listed together because the inputs and function are generally the same between all of them — only the type of message they decode differs. No Usage example specific to MSG_LLC is printed; the group's only example uses MSG_L3.
- **`MSG_RRLP`** — Takes message coding information and returns decoded message. The manual documents MSG_L3, MSG_L2, MSG_MAC, MSG_LLC, MSG_RRLP, MSG_RRC and MSG_RTP as a group under one shared Type/Input/Return/Usage/Notes block: message decoder functions take a series of inputs and return textual string descriptions of data contained within the messages; they are listed together because the inputs and function are generally the same between all of them — only the type of message they decode differs. No Usage example specific to MSG_RRLP is printed; the group's only example uses MSG_L3.
- **`MSG_RRC`** — Takes message coding information and returns decoded message. The manual documents MSG_L3, MSG_L2, MSG_MAC, MSG_LLC, MSG_RRLP, MSG_RRC and MSG_RTP as a group under one shared Type/Input/Return/Usage/Notes block: message decoder functions take a series of inputs and return textual string descriptions of data contained within the messages; they are listed together because the inputs and function are generally the same between all of them — only the type of message they decode differs. No Usage example specific to MSG_RRC is printed; the group's only example uses MSG_L3.
- **`MSG_RTP`** — Takes message coding information and returns decoded message. The manual documents MSG_L3, MSG_L2, MSG_MAC, MSG_LLC, MSG_RRLP, MSG_RRC and MSG_RTP as a group under one shared Type/Input/Return/Usage/Notes block: message decoder functions take a series of inputs and return textual string descriptions of data contained within the messages; they are listed together because the inputs and function are generally the same between all of them — only the type of message they decode differs. No Usage example specific to MSG_RTP is printed; the group's only example uses MSG_L3.
- **`MSG_VALUE`** — Returns copies of the first column where a given sub string is found. If no sub string is found NULL is returned. Documented with its own Type/Input/Return/Usage/Notes block, not as part of the decoder group.
- **`BSIC_BCC`** — Returns BCC part of BSIC.
- **`BSIC_NCC`** — Returns NCC part of BSIC.
- **`BSIC_BCCNCC`** — Returns BSIC formatted as BCCNCC. The Usage example printed in the manual under BSIC_BCCNCC reads BSIC_NCC(‘87’) — it names the wrong function; transcribed verbatim as printed.
- **`CI_16`** — Returns CI as 16 bit number.
- **`CI_28`** — Returns CI as 28 bit number.

</details>

### Connection functions — 2개

| 함수 | Type | Input | Return | Usage |
|---|---|---|---|---|
| **`CONN_IS_SHARED`** | Runtime | BINARY lr_id · BINARY lr_id | INT | CONN_IS_SHARED(“the_connection”, “the_connection”) |
| **`CONN_IS_TYPE`** | Runtime | BINARY lr_id · INT | INT | CONN_IS_TYPE(“the_connection”, ‘1’) |

<details><summary>Notes 원문</summary>

- **`CONN_IS_SHARED`** — Returns 1 if one connection is a sub connection of the other. Returns 0 if the connections are not related. Documented under the manual's "Connection functions" heading, which states that connection functions compare a special schema relationship to see if a given set of conditions exist; this function has its own Type/Input/Return block, it is not part of a shared signature block.
- **`CONN_IS_TYPE`** — Returns 1 if connection is of a given type, this included any parent connections that the supplied connection might belong to. Returns 0 if connection is not of the given type. Documented under the manual's "Connection functions" heading, which states that connection functions compare a special schema relationship to see if a given set of conditions exist; this function has its own Type/Input/Return block, it is not part of a shared signature block.

</details>

### lr_id functions — 3개

| 함수 | Type | Input | Return | Usage |
|---|---|---|---|---|
| **`lr_id_HEAD`** | Runtime | BINARY lr_id | INT | lr_id_HEAD(“lr_id”) |
| **`lr_id_PATH`** | Runtime | BINARY lr_id | STRING | lr_id_PATH(“lr_id”) |
| **`lr_id_ADDRESS`** | Runtime | BINARY lr_id | STRING | lr_id_ADDRESS(“lr_id”) |

<details><summary>Notes 원문</summary>

- **`lr_id_HEAD`** — lr_ids are unique within a single measurement loaded into the database; this returns the ordinal count of that lr_id, for a given measurement. These are not unique values, only when a HINT is used to define a single measurement, will these values be truly unique. In that case however they can be used to order arrival from the measurement log. Documented under the manual's "lr_id functions" heading, which states that lr_id functions supply additional information about lr_id BINARY columns; this function has its own Type/Input/Return block, it is not part of a shared signature block.
- **`lr_id_PATH`** — Returns a string describing the lr_ids location in the database. This is truly unique; however, lr_id_ADDRESS should be used for performance reasons. Documented under the manual's "lr_id functions" heading, which states that lr_id functions supply additional information about lr_id BINARY columns; this function has its own Type/Input/Return block, it is not part of a shared signature block.
- **`lr_id_ADDRESS`** — Returns a string describing the lr_ids location in the database. It is however more performance designed than lr_id_PATH, in that it uses a much short string that is generally not readable, but truly unique all the same. Documented under the manual's "lr_id functions" heading, which states that lr_id functions supply additional information about lr_id BINARY columns; this function has its own Type/Input/Return block, it is not part of a shared signature block.

</details>

---

## 2. `T_FORMAT` 서식 지정자 — 21개 (p484)

| 코드 | 뜻 |
|---|---|
| `%a` | "Abbreviated weekday name" (p484) |
| `%A` | "Full weekday name" (p484) |
| `%b` | "Abbreviated month name" (p484) |
| `%B` | "Full month name" (p484) |
| `%c` | "Date and time representation appropriate for locale" (p484) |
| `%d` | "Day of month as decimal number (01 – 31)" (p484) |
| `%H` | "Hour in 24-hour format (00 – 23)" (p484) |
| `%I` | "Hour in 12-hour format (01 – 12)" (p484) — capital letter I, not digit 1 or lowercase L |
| `%j` | "Day of year as decimal number (001 – 366)" (p484) |
| `%m` | "Month as decimal number (01 – 12)" (p484) |
| `%M` | "Minute as decimal number (00 – 59)" (p484) — case-sensitive pair with %m |
| `%p` | "Current locale's A.M./P.M. indicator for 12-hour clock" (p484) |
| `%S` | "Second as decimal number (00 – 59)" (p484) — no lowercase %s is documented |
| `%U` | "Week of year as decimal number, with Sunday as first day of week (00 – 53)" (p484) |
| `%w` | "Weekday as decimal number (0 – 6; Sunday is 0)" (p484) |
| `%W` | "Week of year as decimal number, with Monday as first day of week (00 – 53)" (p484) — differs from %U only in which day starts the… |
| `%x` | "Date representation for current locale" (p484) |
| `%X` | "Time representation for current locale" (p484) |
| `%y` | "Year without century, as decimal number (00 – 99)" (p484) |
| `%Y` | "Year with century, as decimal number" (p484) |
| `%%` | "Percent sign" (p484) — the escape for a literal %; 21 specifiers in total |

---

## 3. 저장 프로시저 — 16개 (p495–502)

### QSR procedures — 3개

| 프로시저 | Type | Input | Return | Usage |
|---|---|---|---|---|
| **`QSR_DISTANCE`** | Fixed Result Set | direction STRING · min DOUBLE · max DOUBLE · interval DOUBLE · units STRING · threshold DOUBLE · threshold_condition STRING · statement STRING | range STRING · cumulation DOUBLE · cumulation_sampled DOUBLE · density DOUBLE · density_sampled DOUBLE | CALL QSR_DISTANCE(“UP”, 0, 100, 1, “db”, “ -2”, “<”, “SELECT value, length FROM SomeTable”) |
| **`SR_SAMPLE`** | Fixed Result Set | direction STRING · min DOUBLE · max DOUBLE · interval DOUBLE · units STRING · threshold DOUBLE · threshold_condition STRING · statement STRING | range STRING · cumulation DOUBLE · cumulation_sampled DOUBLE · density DOUBLE · density_sampled DOUBLE | CALL QSR_SAMPLE(“UP”, 0, 100, 1, “db”, “ -2”, “<”, “SELECT value, length FROM SomeTable”) |
| **`QSR_TIME`** | Fixed Result Set | direction STRING · min DOUBLE · max DOUBLE · interval DOUBLE · units STRING · threshold DOUBLE · threshold_condition STRING · statement STRING | range STRING · cumulation DOUBLE · cumulation_sampled DOUBLE · density DOUBLE · density_sampled DOUBLE | CALL QSR_TIME(“UP”, 0, 100, 1, “db”, “ -2”, “<”, “SELECT value, length FROM SomeTable”) |

<details><summary>Notes 원문</summary>

- **`QSR_DISTANCE`** — Notes open with a bare bullet reading "Log". The basic function of this procedure is the figure weighted averages based on two column input, firstly a value to be averaged and secondly a weight that is defined as the distance (meters for example) that the value was valid. Qsr distance takes several different inputs that define a set of rules to figure a set of averages from based on the values returned from the last input parameter (a SQL statement). The output consists of a result set that defines a range of different averages based on the input limits. Each range is derived as steps between the min and max inputs based on the interval of each step.
- **`SR_SAMPLE`** — The basic function of this procedure is the figure simple averages based on a single input. The SQL statement should contain on a single column that defines a result set that is a list of values. These values are figured using simple averaging math. The output consists of a result set that defines a range of different averages based on the input limits. Each range is derived as steps between the min and max inputs based on the interval of each step. Manual quirk preserved: the procedure is headed SR_SAMPLE but its Usage example calls QSR_SAMPLE, and the example SQL selects two columns (value, length) even though the Notes require a single column.
- **`QSR_TIME`** — The basic function of this procedure is the figure weighted averages based on two column input, firstly a value to be averaged and secondly a weight that is defined as the time (milliseconds for example) that the value was valid. Manual quirk preserved: the next bullet still says "Qsr distance takes several different inputs that define a set of rules to figure a set of averages from based on the values returned from the last input parameter (a SQL statement)." The output consists of a result set that defines a range of different averages based on the input limits. Each range is derived as steps between the min and max inputs based on the interval of each step.

</details>

### GPS procedures — 2개

| 프로시저 | Type | Input | Return | Usage |
|---|---|---|---|---|
| **`GPS_MEAS_DATA`** | Fixed Result Set | measurement STRING | distance INT · height INT · quality INT · velocity INT · number_of_satellites INT · longitude DOUBLE · latitude DOUBLE · time BINARY TIME | CALL GPS_MEAS_DATA(“SomeMeasurementName”) |
| **`GPS_MEAS_DATA_WITH_SQL_TIME`** | Fixed Result Set | measurement STRING | distance INT · height INT · quality INT · velocity INT · number_of_satellites INT · longitude DOUBLE · latitude DOUBLE · time SQL TIMESTAMP | CALL GPS_MEAS_DATA_WITH_SQL_TIME(“SomeMeasurementName”) |

<details><summary>Notes 원문</summary>

- **`GPS_MEAS_DATA`** — This procedure takes as input a single measurement name; it then returns a complete list of all GPS locations reported during that measurement. The time is defined as the point of appearance for the location. Binary time also contains the interval of time at each location.
- **`GPS_MEAS_DATA_WITH_SQL_TIME`** — This procedure takes as input a single measurement name; it then returns a complete list of all GPS locations reported during that measurement. The time is defined as the point of appearance for the location. (Unlike GPS_MEAS_DATA, no note about the time value carrying the interval at each location — its time column is SQL TIMESTAMP.)

</details>

### BTS procedures — 1개

| 프로시저 | Type | Input | Return | Usage |
|---|---|---|---|---|
| **`BTS_QUEST`** | Fixed Result Set | measurement STRING (HINT SYNTAX FOR MEAS HINT) · bts_list STRING | time SQL TIMESTAMP · sid INT (SITE ID VALUE) · cid INT (CELL ID VALUE) · type INT ( 1 for serving, 0 for neighbor) | CALL BTS_QUEST(“SomeMeasurementName:dt\|dt2”, “btsfile”) |

<details><summary>Notes 원문</summary>

- **`BTS_QUEST`** — Procedure returns a result set using measurement and BTS information to construct a list of when the measurement device was locked to a given site and cell at a given time. The measurement input uses hint syntax for a meas hint (example shows name:dt|dt2); the type column distinguishes serving (1) from neighbor (0).

</details>

### Decoder procedures — 8개

| 프로시저 | Type | Input | Return | Usage |
|---|---|---|---|---|
| **`MSG_DECODER_LAYER3`** | Fixed Result Set | system INT · frequency INT (also known as band) · protocol INT (revision number) · direction INT (1 up, 2 down) · sub_channel STRING · msg_name STRING · msg_data STRING | decoded_string STRING | CALL MSG_DECODER_LAYER3(‘1’, ‘1900’, ‘1’, ‘2’, ‘DCCH’, ‘ACTIVATE_PDP_CONTEXT_ACCEPT’, ‘8A 42 03’) |
| **`MSG_DECODER_LAYER2`** | Fixed Result Set | system INT · frequency INT (also known as band) · protocol INT (revision number) · direction INT (1 up, 2 down) · sub_channel STRING · msg_name STRING · msg_data STRING | decoded_string STRING | — |
| **`MSG_DECODER_LLC`** | Fixed Result Set | system INT · frequency INT (also known as band) · protocol INT (revision number) · direction INT (1 up, 2 down) · sub_channel STRING · msg_name STRING · msg_data STRING | decoded_string STRING | — |
| **`MSG_DECODER_MAC`** | Fixed Result Set | system INT · frequency INT (also known as band) · protocol INT (revision number) · direction INT (1 up, 2 down) · sub_channel STRING · msg_name STRING · msg_data STRING | decoded_string STRING | — |
| **`MSG_DECODER_RRC`** | Fixed Result Set | system INT · frequency INT (also known as band) · protocol INT (revision number) · direction INT (1 up, 2 down) · sub_channel STRING · msg_name STRING · msg_data STRING | decoded_string STRING | — |
| **`MSG_DECODER_RRLP`** | Fixed Result Set | system INT · frequency INT (also known as band) · protocol INT (revision number) · direction INT (1 up, 2 down) · sub_channel STRING · msg_name STRING · msg_data STRING | decoded_string STRING | — |
| **`MSG_DECODER_RTP`** | Fixed Result Set | system INT · frequency INT (also known as band) · protocol INT (revision number) · direction INT (1 up, 2 down) · sub_channel STRING · msg_name STRING · msg_data STRING | decoded_string STRING | — |
| **`MSG_DECODER`** | Fixed Result Set | type STRING · system INT · frequency INT (also known as band) · protocol INT (revision number) · direction INT (1 up, 2 down) · sub_channel STRING · msg_name STRING · msg_data STRING | decoded_string STRING | CALL MSG_DECODER(‘L3D’, ‘1’, ‘1900’, ‘1’, ‘2’, ‘DCCH’, ‘ACTIVATE_PDP_CONTEXT_ACCEPT’, ‘8A 42 03’) |

<details><summary>Notes 원문</summary>

- **`MSG_DECODER_LAYER3`** — The manual documents MSG_DECODER_LAYER3, MSG_DECODER_LAYER2, MSG_DECODER_LLC, MSG_DECODER_MAC, MSG_DECODER_RRC, MSG_DECODER_RRLP and MSG_DECODER_RTP as a group under one shared Type/Input/Return/Usage/Notes block, with the preamble: "Several of the decoders are basically just the same except that they decode different message types based on their name. So they will be listed together." Procedure returns a result set with a single column and row that is the decoded string based on the input. The single printed Usage example is the MSG_DECODER_LAYER3 one.
- **`MSG_DECODER_LAYER2`** — The manual documents MSG_DECODER_LAYER3, MSG_DECODER_LAYER2, MSG_DECODER_LLC, MSG_DECODER_MAC, MSG_DECODER_RRC, MSG_DECODER_RRLP and MSG_DECODER_RTP as a group under one shared Type/Input/Return/Usage/Notes block, with the preamble: "Several of the decoders are basically just the same except that they decode different message types based on their name. So they will be listed together." Procedure returns a result set with a single column and row that is the decoded string based on the input. No Usage example is printed for this name — the group's only example calls MSG_DECODER_LAYER3.
- **`MSG_DECODER_LLC`** — The manual documents MSG_DECODER_LAYER3, MSG_DECODER_LAYER2, MSG_DECODER_LLC, MSG_DECODER_MAC, MSG_DECODER_RRC, MSG_DECODER_RRLP and MSG_DECODER_RTP as a group under one shared Type/Input/Return/Usage/Notes block, with the preamble: "Several of the decoders are basically just the same except that they decode different message types based on their name. So they will be listed together." Procedure returns a result set with a single column and row that is the decoded string based on the input. No Usage example is printed for this name — the group's only example calls MSG_DECODER_LAYER3.
- **`MSG_DECODER_MAC`** — The manual documents MSG_DECODER_LAYER3, MSG_DECODER_LAYER2, MSG_DECODER_LLC, MSG_DECODER_MAC, MSG_DECODER_RRC, MSG_DECODER_RRLP and MSG_DECODER_RTP as a group under one shared Type/Input/Return/Usage/Notes block, with the preamble: "Several of the decoders are basically just the same except that they decode different message types based on their name. So they will be listed together." Procedure returns a result set with a single column and row that is the decoded string based on the input. No Usage example is printed for this name — the group's only example calls MSG_DECODER_LAYER3.
- **`MSG_DECODER_RRC`** — The manual documents MSG_DECODER_LAYER3, MSG_DECODER_LAYER2, MSG_DECODER_LLC, MSG_DECODER_MAC, MSG_DECODER_RRC, MSG_DECODER_RRLP and MSG_DECODER_RTP as a group under one shared Type/Input/Return/Usage/Notes block, with the preamble: "Several of the decoders are basically just the same except that they decode different message types based on their name. So they will be listed together." Procedure returns a result set with a single column and row that is the decoded string based on the input. No Usage example is printed for this name — the group's only example calls MSG_DECODER_LAYER3.
- **`MSG_DECODER_RRLP`** — The manual documents MSG_DECODER_LAYER3, MSG_DECODER_LAYER2, MSG_DECODER_LLC, MSG_DECODER_MAC, MSG_DECODER_RRC, MSG_DECODER_RRLP and MSG_DECODER_RTP as a group under one shared Type/Input/Return/Usage/Notes block, with the preamble: "Several of the decoders are basically just the same except that they decode different message types based on their name. So they will be listed together." Procedure returns a result set with a single column and row that is the decoded string based on the input. No Usage example is printed for this name — the group's only example calls MSG_DECODER_LAYER3.
- **`MSG_DECODER_RTP`** — The manual documents MSG_DECODER_LAYER3, MSG_DECODER_LAYER2, MSG_DECODER_LLC, MSG_DECODER_MAC, MSG_DECODER_RRC, MSG_DECODER_RRLP and MSG_DECODER_RTP as a group under one shared Type/Input/Return/Usage/Notes block, with the preamble: "Several of the decoders are basically just the same except that they decode different message types based on their name. So they will be listed together." Procedure returns a result set with a single column and row that is the decoded string based on the input. No Usage example is printed for this name — the group's only example calls MSG_DECODER_LAYER3.
- **`MSG_DECODER`** — Documented separately from the grouped decoders, with its own Type/Input/Return/Usage/Notes block. This procedure is basically just like the other decoder procedures except that it takes 1 additionally input parameter which is a string that defines what actual decoder to use, rather than have a locked function for each different message type. Procedure returns a result set with a single column and row that is the decoded string based on the input.

</details>

### Dynamic procedures — 2개

| 프로시저 | Type | Input | Return | Usage |
|---|---|---|---|---|
| **`Nth_BEST`** | Dynamic Result Set | nth INT · include_group INT · include_value INT · reverse INT · statement STRING | In dynamic result sets the output varies based on input in the case of this procedure the out is basically a copy of the SQL statement columns after filtering and additional processing is done. · The two inputs… | CALL Nth_BEST (‘3’, ‘1’, ‘1’, ‘0’, “SELECT group, value, time FROM SomeTable”) Example: 5, 3 / 5, 2 / 5, 23 / 1, 2 / 1, 3, / 9, 44 / 9, 44 / 9, 6 / 3, 1 If you assum… |
| **`MATH_TWO_COLUMN`** | Dynamic Result Set | mfunction INT · singleavg INT · outputcolumn STRING · statement STRING | In dynamic result sets the output varies based on input in the case of this procedure the out is basically a copy of the SQL statement columns after filtering and additional processing is done. | CALL MATH_TWO_COLUMN (‘1’, ‘1’, “ADDITION”, “SELECT value1, value2, time FROM SomeTable”) |

<details><summary>Notes 원문</summary>

- **`Nth_BEST`** — The purpose of the Nth_BEST procedure is to except a SQL statement as input and return the nth best value based on the group id. The first column in the SQL statement result set must be a group id in the form of an integer. The second column is the value to be compared based on the grouping of the first column. Setting reverse to 1 will return the nth based on ordinal from lowest value rather than ordinal from high value. include_group and include_value set to 0 remove those columns from the final output. The printed worked example is reproduced verbatim, including its stray trailing comma on "1, 3," and the wording "If you assume reverse is not select and an nth of 2".
- **`MATH_TWO_COLUMN`** — MATH_TWO_COLUMN takes the first two values from the SQL input statement and performs various math functions on them based on the selected function variable. The resulting output removes the two columns from the query and replaces them with a single column named from the output column variable. The following functions apply: Addition, Subtraction, Multiplication, Division, Modulus Division, Max, Min, Power (second column is applied as a power for the first column).

</details>

---

## 4. Appendix 7 — 레지스트리 키 (p503)

**`Computer\HKEY_LOCAL_MACHINE\SOFTWARE\Anite\Nemo Analyze\ServerSettings\DB.Compress.Tasks`**

> p503. Description (verbatim): "Number of threads used for data compression by database system". Type: "DWORD, decimal value range 1-8". Default value: "tbd" — the manual ships with an unresolved placeholder instead of a real default. Effect: raising it gives the database system more parallel threads for data compression during load; the stated Note is "Use a lower number of threads in case reports and workbooks are ran simultaneously with the loading of measurement files". Editing requires Registry Editor and administrator rights ("Note that you need to have administrator rights to edit registry keys"). Note the vendor key is \SOFTWARE\Anite\ (the pre-Keysight brand), not \Keysight\.

**`Computer\HKEY_LOCAL_MACHINE\SOFTWARE\Anite\Nemo Analyze\ServerSettings\Parser\Parallel.Count`**

> p503. Description (verbatim): "Number of parallel measurement loading threads". Type: "DWORD, decimal value range 1- up to reasonable number of CPU cores available on the computer" — i.e. the upper bound is not a fixed integer but a soft, machine-dependent limit. Default value: 2. Effect: controls how many measurement files are parsed/loaded in parallel; the section exists so that "To optimize performance, you can define the number of threads when parsing measurement files in parallel." Stated Note: "Use a lower number of threads in case other applications are actively used on the same computer". Lives under an extra \Parser\ subkey that DB.Compress.Tasks does not have.

---

## 5. 원문 자체의 결함 (errata) — 17건

재구현하는 쪽이 **조용히 정규화하면 안 되는** 모순들입니다. 매뉴얼이 스스로 어긋나므로
어느 쪽을 따를지는 판단이 필요하고, 판단했다는 사실이 기록에 남아야 합니다.

1. DIRECTION ENCODING CONTRADICTION (the important one). The Appendix 5 scalar decoders and the Appendix 6 decoder procedures decode the same messages with incompatible direction encodings. p490, MSG_L3/MSG_L2/MSG_MAC/MSG_LLC/MSG_RRLP/MSG_RRC/MSG_RTP declare: "SMALL INT (Direction, 1 or 0)" — a two-valued 0/1 domain with no stated meaning for either value — and the Usage passes 0: "MSG_L3 ('1', '1900', '1', '0', 'DCCH', 'ACTIVATE_PDP_CONTEXT_ACCEPT', '8A 42 03')". p499, MSG_DECODER_LAYER3/LAYER2/LLC/MAC/RRC/RRLP/RTP declare: "direction INT (1 up, 2 down)" — a 1/2 domain — and p500's Usage passes 2: "CALL MSG_DECODER_LAYER3('1', '1900', '1', '2', 'DCCH', 'ACTIVATE_PDP_CONTEXT_ACCEPT', '8A 42 03')". Every other argument in the two examples is byte-identical ('1', '1900', '1', 'DCCH', 'ACTIVATE_PDP_CONTEXT_ACCEPT', '8A 42 03'), so the examples are plainly the same call written twice, yet one passes 0 and the other passes 2 for direction. Consequences for a reimplementer: (a) the value 0 is legal for the scalar and out of range for the procedure; (b) the value 2 is legal for the procedure a

2. p496, SR_SAMPLE: the heading disagrees with its own Usage line. The procedure is headed "SR_SAMPLE" but the Usage reads "CALL QSR_SAMPLE("UP", 0, 100, 1, "db", " -2", "<", "SELECT value, length FROM SomeTable")". One of the two names is wrong and the manual gives no way to tell which; it is additionally filed under the " QSR procedures" heading (p495) alongside QSR_DISTANCE and QSR_TIME, which weakly favours QSR_SAMPLE, while the heading itself is the only place the SR_ prefix appears in either appendix.

3. p497, QSR_TIME Notes are copy-pasted from QSR_DISTANCE and still name the sibling: "Qsr distance takes several different inputs that define a set of rules to figure a set of averages from based on the values returned from the last input parameter (a SQL statement)." This bullet appears verbatim in QSR_DISTANCE's own Notes on p496. QSR_TIME's first bullet was correctly re-worded ("a weight that is defined as the time (milliseconds for example)" vs distance's "the distance (meters for example)"), so the stale sibling name in the second bullet is a missed edit, not a deliberate cross-reference.

4. p496, QSR_DISTANCE Notes open with a stray orphan bullet: "• Notes: / o Log / o The basic function of this procedure is...". The bare word "Log" is an editing leftover — no other procedure in Appendix 6 has such a bullet, and nothing else in the QSR_DISTANCE entry (input list, return list, usage) refers to logarithms, log scaling, or a log file. Whether QSR_DISTANCE has some log-scale behaviour the other two lack is therefore undocumented.

5. p491-492, BSIC_BCCNCC: heading disagrees with its own Usage line, which is copy-pasted from the sibling above it. The entry is headed "BSIC_BCCNCC" and its Notes say "Returns BSIC formatted as BCCNCC", but the Usage reads "BSIC_NCC('87')" — identical to the Usage of the preceding BSIC_NCC entry on p491, down to the argument and the missing space before the parenthesis. As printed, the example calls a different function from the one it documents.

6. p486, TIME_PLUS_SECS: Input list omits the offset argument the Notes require. Input is only "o SQL TIMESTAMP"; Usage is "TIME_PLUS_SECS ("sql_time")" — one argument; yet the Notes say "Returns new SQL TIMESTAMP offset by a given number of seconds." The number of seconds is neither declared nor passed. Contrast the correctly documented analogue T_WITH_MILLISEC_OFFSET on p482, which lists "binary time stamp" plus "INT" and passes both: "T_WITH_MILLISEC_OFFSET ("time", -42)".

7. p486, TIME_PLUS_MILLISECS: identical defect. Input is only "SQL TIMESTAMP", Usage is "TIME_PLUS_MILLISECS("sql_time")", but Notes say "Returns new SQL TIMESTAMP offset by a given number of milliseconds." The millisecond count is missing from both the Input list and the example. (Both TIME_PLUS_* entries appear to have been derived from the neighbouring TIME_DIFF_* pair, which correctly list two arguments each.)

8. p496, SR_SAMPLE contradicts itself on the shape of its statement argument. Its Notes say "The SQL statement should contain on a single column that defines a result set that is a list of values", but its Usage passes a two-column query copied from QSR_DISTANCE: "..."SELECT value, length FROM SomeTable")". The whole 8-argument Input block and the whole 5-column Return block are also byte-identical to QSR_DISTANCE's, despite the Notes saying this procedure does "simple averages based on a single input" — so the sampled/weighted columns (cumulation_sampled, density_sampled) and the weight column are documented for a procedure that by its own description takes no weight.

9. p483 vs p484, T_FORMAT: the Usage example uses a format flag that the specifier list does not document. Usage is "T_FORMAT ("time", "%#c")", but the list on p484 documents only "%c Date and time representation appropriate for locale" — the '#' flag (which in the underlying C runtime requests the long form) is never mentioned, nor is any other flag, width, or the %Z/timezone specifier.

10. p495, Appendix 6 preamble is copy-pasted from Appendix 5 and describes the wrong thing: "In this appendix each scalar function will be described as follows". Appendix 6 documents stored procedures, not scalar functions; the very next line correctly gives the procedure type domain ("either dynamic or fixed") rather than the scalar one ("either const or runtime", p479), which shows the sentence was adapted only in part. The p479 original also ends its Usage bullet without a period while p495's does not, confirming the duplication.

11. p501-502, Nth_BEST: the worked example contradicts both its own Usage line and its own rule. The Usage passes nth = 3 — "CALL Nth_BEST ('3', '1', '1', '0', "SELECT group, value, time FROM SomeTable")" — but the walkthrough immediately below says "If you assume reverse is not select and an nth of 2, then the output would be", switching the parameter value mid-example. Worse, the stated output is wrong for nth = 2: input group 1 has values 2 and 3, so the 2nd-best (reverse not set, i.e. ordinal from high value) is 2, yet the manual prints "1, 3" — the 1st-best. (Groups 5 and 9 do come out right: "5, 3" from 3/2/23 and "9, 44" from 44/44/6, the latter only if duplicate values each consume an ordinal — itself undocumented.) Group 3, which has a single row "3, 1", silently vanishes from the output, so the behaviour when a group has fewer than n members is shown but never stated. The example row "1, 3," is also printed with a trailing comma.

12. p502, MATH_TWO_COLUMN: the Usage example's arguments do not line up with the declared Input names. Input is "mfunction INT / singleavg INT / outputcolumn STRING / statement STRING", but Usage is "CALL MATH_TWO_COLUMN ('1', '1', "ADDITION", "SELECT value1, value2, time FROM SomeTable")" — "ADDITION" is passed in the outputcolumn position, where the Notes say the value becomes the name of the result column ("replaces them with a single column named from the output column variable"), while the actual operation is selected by mfunction, declared INT and passed as '1'. The Notes then list the operations by name only — "Addition, Subtraction, Multiplication, Division, Modulus Division, Max, Min, Power (second column is applied as a power for the first column)" — and never give the integer that selects each, so the mfunction encoding is undocumented and the example reads as if the name selected the function. The parameter "singleavg" is declared and passed ('1') but never explained anywhere.

13. p495-497, QSR family: threshold is declared "threshold DOUBLE" but all three Usage examples pass it as a quoted string with a leading space — "CALL QSR_DISTANCE("UP", 0, 100, 1, "db", " -2", "<", ...)". min/max/interval on the same line are passed as bare numerics (0, 100, 1), so the quoting of the one DOUBLE that happens to be negative is inconsistent within a single example.

14. p479-480, FREEZE_FRAME entries do not follow the appendix's own documentation template. p479 promises every scalar function will be described with "Type / Input / Return / Usage / Notes", but INTEGER_FREEZE_FRAME, REAL_FREEZE_FRAME and STRING_FREEZE_FRAME are given as prose with no Type line at all — so whether they are const or runtime, the one classification the appendix is built around, is never stated for them.

15. p479 vs p488-489, naming inconsistency in the FREEZE_FRAME variants: "REAL_FREEZE_FRAME returns doubles" (p479), while the datatype section distinguishes TO_REAL as "REAL ... 4 bytes" (p489) from TO_FLOAT as "DOUBLE ... 8 bytes" (p488). The REAL-named freeze-frame therefore returns the type the manual elsewhere calls FLOAT/DOUBLE.

16. p503, Appendix 7: DB.Compress.Tasks ships with "Default value: tbd" — an unfilled authoring placeholder in a released manual. The sibling key states a real default (2), so there is no way to infer the intended value.

17. Typos and wording defects (recorded because they affect anyone parsing the text literally): p480 "Note: All functions that take binary time as the primary input being with T_" — "being" for "begin" (compare the correct "begin with TI_" on p484 and "begin with TIME_" on p485). p479 "oridinal" for "ordinal", three times in one bullet, alongside one correct "Ordinal". p479 "when the save value is needed in multiple columns" — "save" for "same". p487 "to get a user friend description" — "friend" for "friendly". p496/p497 "The basic function of this procedure is the figure weighted averages" — "the" for "to", repeated in all three QSR entries. p496 "The SQL statement should contain on a single column" — "on" for "only". p501 "The purpose of the Nth_BEST procedure is to except a SQL statement as input" — "except" for "accept". p495 "to perform more complex functions that normally allowed by queries" — missing "are". p502 "Setting reverse to 1 will return the nth based on ordinal from lowest value rather than ordinal from high value" is the only statement of reverse's semantics, and the Usa


---

## 6. 우리와의 대조 — 이 46+16개가 실제로 뜻하는 것

숫자를 그대로 격차로 읽으면 안 됩니다. **46개 중 상당수는 Nemo 파일 형식의 부산물**이고,
우리에게는 대응물이 필요 없습니다. 범주별로 갈라 보면 이렇습니다.

| 범주 | 개수 | 우리에게 | 왜 |
|---|---|---|---|
| **Freeze frame** | 3 | ⛔ 불필요 | 스키마에 관계가 없는 테이블을 시간으로 잇는 우회로입니다. 우리는 `(session_id, seq)` 키 조인입니다. **다만 `Correlation type (-1, 0, 1)`이 곧 Previous / Current / Next** 이고, `0`의 정의가 *"parent query timestamp is within the time range of the subquery row's time interval"* 라는 점은 우리가 그 노드를 만들 때 쓸 정의입니다 |
| **Time · Binary Time · Binary Time Interval · SQL Time** | 18 | ⛔ 불필요 | 전부 **binary time**이라는 그들 고유 표현을 다루는 함수입니다(`T_*`는 binary time, `TI_*`는 interval, `TIME_*`는 SQL timestamp). 우리는 `TIMESTAMPTZ` 하나뿐이라 변환할 표현이 없습니다. `T_FORMAT`의 21개 서식 코드도 마찬가지 |
| **Translator** | 2 | ⚠ **필요** | `VAL_TO_STRING` / `STRING_TO_VAL` — 숫자 코드와 사람이 읽는 라벨 사이의 **코드북**입니다. 우리 `STATE_MACHINE`은 상태를 **맨 정수**로 내보내고 이름은 그래프 JSON에만 있습니다. 값 도메인을 1급으로 만들 자리 |
| **Datatype** | 5 | ◐ 일부 | `IS_FLOAT_EQUAL`이 **정밀도 인자를 받는** 점이 눈에 띕니다. 우리 `FILTER`는 `double`에 맨 `=`를 허용합니다 — 부동소수 동등 비교라 사실상 항상 거짓일 수 있습니다 |
| **Decoder** | 13 | ⛔ 데이터 없음 | 시그널링 메시지 **본문**을 질의로 끌어들이는 함수들입니다. 우리 `signaling_message`는 본문이 구조화돼 있지 않아 시작점이 없습니다 |
| **Connection** | 2 | ❓ 결정 필요 | `CONN_IS_SHARED` / `CONN_IS_TYPE`은 **호(connection)라는 개체**와 그 부모-자식 관계를 전제합니다. 우리 계층은 세션(주행 전체) → 표본(1초)뿐이고 **중간 구간 개체가 없습니다** |
| **lr_id** | 3 | ⛔ 불필요 | 그들의 행 식별자입니다. 우리는 `(session_id, seq)` |

프로시저 쪽:

| 프로시저 | 우리에게 |
|---|---|
| `QSR_DISTANCE` / `QSR_TIME` / `SR_SAMPLE` | ⚠ **거리 가중이 격차입니다.** C7 참조 — 이 셋이 별개 프로시저라는 사실이 근거 |
| `GPS_MEAS_DATA` | ◐ 반환에 `quality` · `number_of_satellites` · `height`가 있습니다. **우리 `sample`에는 없습니다** — GPS 품질을 모르니 이상 좌표를 걸러낼 근거도 없습니다 |
| `BTS_QUEST` | ✅ 반환의 `type INT (1 for serving, 0 for neighbor)`가 우리 `sample` + `sample_neighbour` 구분과 같습니다 |
| `MSG_DECODER_*` (8) | ⛔ 위 Decoder와 같은 이유 |
| `Nth_BEST` · `MATH_TWO_COLUMN` | ⚠ **Dynamic Result Set** — 행 수와 열 수를 바꿉니다. `corrections.md` C9의 핵심 |

### 진짜 격차는 개수가 아니라 **확장점이 0개**라는 것입니다

우리 식 언어(`KpiExpression` · `ColumnExpression`)의 문법은 `+ - * /`, 괄호, 숫자, 단항 마이너스,
KPI 이름이 전부입니다. **함수 호출 생산 규칙 자체가 없습니다.**

그래서 위 표에서 "필요"로 표시한 것들 — 코드북, 정밀도 있는 동등 비교, 그리고
`log10`/`power` 같은 dB↔선형 변환 — 을 사용자가 **우회할 방법도 없습니다.**

> 파서는 이미 **허용 목록 설계**입니다(연산자를 하드코딩 목록과 대조해 매칭된 상수를 출력).
> 함수 하나를 여는 것은 `factor()`에 분기 하나를 더하고 이름 허용 목록을 두는 일이지
> 보안 모델을 바꾸는 일이 아닙니다. **작업 규모가 작고, 이 표의 여러 칸을 한꺼번에 엽니다.**

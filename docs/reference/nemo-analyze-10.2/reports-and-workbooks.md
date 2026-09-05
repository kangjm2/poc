# 워크북과 리포트 — 9장 · 10장 (p215–292)

레퍼런스가 **결과를 문서로 내는 층**입니다. 브리프 ④가 구조를 요약했고, 이 문서는 그 아래의
**요소 인벤토리**를 옮깁니다 — 리포트에 무엇을 넣을 수 있고 각 요소에 어떤 옵션이 있는가.
백로그의 "리포트 구성 선택"이 고를 목록이 §3입니다.

| | |
|---|---|
| 출처 | User Guide ch.9 Workbooks (p215–230) · ch.10 Reports (p231–292) |
| 관련 문서 | 브리프 ④, [`use-cases.md`](use-cases.md) UC25(자동화) |

---

## 1. 워크북 — 페이지 · 데이터 뷰 (p215–230)

**열기.** `View | Workbook`(빈 워크북) · `View | Workbook Layout`(미리 정의된 배치, 예 2×2) · 측정
우클릭 `Analyses`(전체 목록) · `System | [폴더] | [워크북]`(기성, 예 `UMTS | UMTS full details`).
실행 중 `Executing Queries`의 `Cancel` / `Cancel All`.

**데이터 뷰 추가.** 우클릭 `Page | Add Data View | [종류]` → 측정을 드래그하거나 `Pick Parameter`
(그래프면 종류 먼저). `Data View | Insert | [종류]`는 **기존 뷰를 교체**.

**페이지.** `Page | Add Page` 또는 **`Page | Add Page Layout | [배치]`**(여러 뷰가 든 페이지 한 번에).
하단 탭으로 전환. `Page | Properties`: 제목 · `Fit to window` / `Fixed size`(px) · (실내 옵션)
`Copy page for each device` · `Copy page for each inbuilding floor`.

**저장.** `Workbook | Save` → `Folder`(하위 폴더 가능, **Workspace의 메뉴 구조로 그대로 나타남**) ·
`Filename` · **`Shared (with server connection)`**(`Options | Environment | Default Paths | Shared path`의
네트워크 드라이브 — 다른 사용자도 봄).

**내보내기.** `File | Workbook to File` → PDF · Word · PowerPoint. `File | Page Image to clipboard` →
`Page image to clipboard` / `Page image to file` / `Workbook images to file`(페이지별 이미지) ·
`Export ratio`(% 또는 640×480 고정).

**복사.** `Workbook | Create Copy for Measurement`(Layout 탭의 버튼) — 같은 워크북을 **다른 측정**으로.
`Workbook | Properties`로 제목 변경.

**예제 워크북 `GSM`** (p227–229): ① RF 파라미터 3개 라인 그래프 stacked + Numerical data 표, ② 서빙·
이웃 셀 라인/바, ③ L3 그리드 + 디코딩 Info view, ④ RX level 색상셋 경로 지도. 기성 워크북이 "이
기술에서는 이것들을 같이 본다"를 담는 형태입니다.

**공유.** 네트워크 폴더가 리포트·워크북의 추가 소스가 됨(p230).

## 2. 리포트 형식과 실행 (p231–235, p281–283)

| 형식 | 상태 |
|---|---|
| **`.srt` Spreadsheet Report Template** | **권장.** Spreadsheet Report Designer로 제작, Excel 호환 |
| `.rpt` Crystal Reports | legacy. 자체 템플릿을 만들려면 Crystal Reports Professional 필요 |
| `.axt` Analyze Excel Template | legacy (p271–280: Excel 통합문서를 대상으로 질의 결과를 시트·셀에 쓰는 방식, `Run macro on finish`) |
| 워크북 템플릿 | PDF로만 내보냄 |
| PowerPoint / Word (p284–292) | Office 애드인 `Analyze Reporting` 탭에서 워크북 이미지를 가져와 채움. 2007+ |

화면 해상도 제약: **최대 1920×1080, 배율 100%**(화면을 그려 문서로 만들기 때문).

**실행.** 측정(또는 다중 측정 · 폴더) 우클릭 `Report | [템플릿]` → **`Scope Filter`**: `System` · `Band` ·
`Begin time` · `End time` · `Area`(저장된 폴리곤 또는 지도에서 그림) → 새 워크북으로 열림 → `Save as
Excel Workbook` / `Save as PDF`. (`Options | Database | Queries | Scope filtering for reports and
workbooks`가 이 대화상자를 매번 띄울지 정함.)

**Crystal 리포트 설정** (p282–283): Reports 페이지에서 템플릿 우클릭 `Configure` — `General`에
표시할 통계 · 제목 · 설명 · `Show bins`(cumulation/density 히스토그램에 수치 표시), 파라미터별
하한·상한·임계·채널 번호, 벤치마킹 리포트의 **`Benchmark by`**(그룹 기준).

## 3. Spreadsheet Report Designer — 요소 인벤토리 (p235–270)

`Tools | Spreadsheet` → 새 템플릿, 또는 Excel에서 만든 `.xlsx`를 열어 바탕으로. 저장 위치
`C:\Nemo Tools\Nemo Analyze\Reports`. **원칙**: *"The data should be processed as much as possible
beforehand in Nemo Analyze"* — 원시 Ec/N0 수만 행을 Excel로 보내 평균 내지 말고 평균을 보낼 것.
성공률(시도 수 / 실패 수) 같은 계산은 Excel에 맡겨도 됨.

### 3.1 파라미터 셀

셀 선택 → Parameters 뷰의 파라미터를 **드래그** 또는 좌클릭 → 표시 형식 대화상자(**원시값** / 평균 등
**사전 계산 통계**) → `Add Parameter to [셀]`. 복사·붙여넣기 가능. BTS 파일을 목록 또는 **와일드카드**로
제한.

### 3.2 삽입 요소 (`Insert`)

| 요소 | 옵션 |
|---|---|
| **Workbook Image** | 워크북 페이지를 이미지로. 기본 치수 / 자리표시자 치수(`Set`) · `Snap to nearest cell` · MapX: `Keep aspect ratio` / `Fit to placeholder dimension` |
| **Map Image** | §3.3 |
| **Statistics Table** | §3.4 |
| **Manual SQL Query** | 질의를 직접 |
| **Dynamic Image** | 파일명 또는 **와일드카드**로 외부 이미지(로컬 · Nemo Cloud) — 측정 파일명에 든 사이트 이름으로 사진을 찾는 사이트 검증 리포트용 |
| Rows · Columns · Worksheet · Chart(SpreadsheetGear Chart Explorer) · Picture · Text Box · Auto Shape · Line | |

### 3.3 Map Image 옵션 (p238–243)

- `Map type`: Google Street / OpenStreetMap(기본) / **WMS 서버**(`New WMS Server` → URL → `Get Layers`).
- 파라미터 드래그 — **지도당 최대 3개**. 파라미터별 `edit`(필터) · `delete` · **`Select Image`**(커스텀
  이벤트 KPI의 심볼) · **색상셋**(커스텀 파라미터는 반드시 수동 지정).
- `Edit Cache`: 타일 캐시(기기별, 템플릿에 저장 안 됨) · `Limit cache size`.
- `Event icon size factor`. **BTS**: `BTS source`(BTS 파일 / Nemo Cloud) · 파일명 와일드카드 · `Show
  BTS`(기본 초록) · `Show BTS color legend` · `BTS size factor` · **`BTS column`**(섹터를 칠할 BTS 파일
  열) · `BTS colorset` · `Site label`(표시 · 강조 · 크기) · `BTS filter`(채널·시스템).
- 배치: `Copy Image` · `Delete Image` · `Move and resize` · `Snap to nearest cell`.
- `Map presentation`: `Maintain aspect ratio` / `Stretch to placeholder` / `Fill to placeholder`.
- **`Map area`**: `Measurement route`(기본) / `BTS sites` / `Polygon` + **`Map area offset (m)`**.
- 분할: `Parameters on separate maps` · `Measurements on separate maps` · **`Create separate map for
  each parameter value`**(단일 KPI만; 가로·세로로 반복할 차원 선택 — 층 × 채널 같은 2차원 격자).
- 범례: `Hide unused color legend ranges` · `Sort by color counts` · **`Legend stats`**(sample / time /
  distance).
- 경로: `Interpolate route`(점 대신 연속선) · `Draw GPS route`(결과 없는 구간도 그림, 기본 켜짐) ·
  `Route width` · **`Limit data sample intervals`**(ms 초과 표본 버림).
- `Scale bar`: 표시 · 위치(top/bottom/left/right) · 크기(px).
- **`Draw polygons dynamically`**: 측정 이름을 구분자로 쪼개 폴리곤 이름과 맞으면 그림
  (`text1_text2_text3`, `_` → 셋; 인덱스 `1,3` → `text1_text3`). `Show polygon label`.

### 3.4 Statistics Table (p244–249, p264)

- 파라미터를 더하면 표가 **아래로** 자람(7.10부터 행을 자동 삽입하지 않고 아래 행을 덮음 — 미리
  행을 비워 둘 것).
- **`Column group`**: 같은 그룹의 표들은 **열 구성과 순서가 항상 같음**(데이터 없으면 0) — 사업자별
  표와 장치별 표를 정렬해 놓을 때.
- `Insert columns`: 켜면 열이 늘 때 셀을 삽입(옆 서식이 밀릴 수 있어 기본 꺼짐).
- **Cumulation and density**: `Serving system and band` · `Packet technology`에 대해 행·열 그룹을 가진
  **통계 행렬**. 결과셋 열: `Lowerbound` · `Upperbound` · `Cumulation`(%) · `Cumulation sample` ·
  `Density`(%) · `Density sample` · `Group`.
- **색상셋별 통계** (p245): 색상셋 구간마다 통계를 따로 계산해 Excel 차트에 넘김. **범위형 색상셋만**
  (RSRP · RSRQ), PCI 같은 동적 색상셋은 불가.
- 표 단위 복사·붙여넣기.

### 3.5 Report Configuration Editor (p250–252, p254)

- **입력 변수**: `Add group` / `Add parameter`(`Identifier` · `Name` · `Default value`) → 템플릿 안에서
  **`{?identifier?}`**로 참조(예 `{?nth?}`). 스캐너 채널 필터, Ec/N0 Nth best의 N 같은 값을 템플릿을
  열지 않고 Reports 탭 우클릭 `Configure`로 바꿈.
- **`MapFilter`** 식별자: 값이 모든 지도 질의의 `WHERE`에 들어가는 **전역 지도 필터**.
- **Script 탭**: **Python** 스크립트로 리포트 동작 커스터마이즈 — 예: 워크북 페이지를 이미지로
  내보내기, 생성 후 Excel에서 자동 열기.
- `Run Report` → 측정·폴더 선택(`Select all`) → 테스트 실행. `File | Save as` → `.srt`.
- `Protection settings | Never allow editing of the report` — 공식본 잠금.
- 시트 삭제·이름 변경 감지 → `Update Worksheet References` / `Undo Excel Changes`.

### 3.6 PDF/CDF 차트를 넣는 두 방법 (p258–265)

1. Nemo Analyze에서 `Statistics By`로 분포 워크북을 만들어 저장 → Designer에서 `Insert | Workbook
   image`.
2. 워크북 페이지에 `Copy page for each device` / `…floor` / `Copy device to same page`를 켜 저장 →
   Designer에 페이지별 삽입 → 실행 시 장치·층마다 이미지가 연속으로 채워짐(**아래에 빈 공간을 둘 것**).
   드라이브 측정에도 쓸 수 있음.

또는 통계표의 cumulation/density 결과를 `Edit in Microsoft Excel`로 열어 Excel 차트로.

## 우리와의 관계

| 레퍼런스 | 우리 | 남는 것 |
|---|---|---|
| 템플릿 4형식 + 디자이너 | 고정 HTML 리포트 1종(`report.html`), 브라우저 인쇄로 PDF | **포함 섹션 선택**(백로그 "리포트 구성 선택"). §3.2의 요소 중 파라미터 셀 · 통계표 · 지도 이미지 · 워크북 이미지가 후보 |
| Scope Filter(시스템 · 밴드 · 시간 · 폴리곤) | 세션 단위 | 시간 범위와 폴리곤으로 리포트 범위 제한 |
| 통계표의 색상셋별 통계, Legend stats | `[Distance]` / `[Sample]` 기준 | 구간별 통계는 CDF에 있음 |
| `{?identifier?}` 입력 변수, `MapFilter` | 없음 | 리포트 파라미터화 |
| `Create separate map for each parameter value` | 없음 | 셀별 · 채널별 지도 격자 |
| 워크북 `Create Copy for Measurement`, 레이아웃 프리셋, 공유 경로 | 서버 저장 워크북 | 복사해 고치기 · 프리셋(브리프 ④ 남은 일) |
| **`File | Workbook to File`(PDF·Word·PowerPoint)** · **`File | Page Image to clipboard | Workbook images to file`**(페이지별 이미지) · `Export ratio`(% 또는 640×480) | **2026-09-05**: 워크북 헤더의 `Export document`(인쇄용 HTML 한 장, 브라우저 인쇄로 PDF)와 `pane N`(페인별 SVG) | **세 오피스 포맷 자체** · **`Export ratio`와 페이지 `Fixed size`** — 우리 그림은 페인 종류마다 고정 치수(차트 1000×200, 지도 1000×560)이고 고르는 자리가 없습니다 · **페이지 단위**(우리 워크북에 페이지가 없어 페인으로 냄) |
| 해상도 1920×1080 제약 | 없음 | — |

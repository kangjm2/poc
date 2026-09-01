# 화면·뷰 인벤토리

출처: User Guide ch.6 (Workspace), ch.8 (Viewing Measurement Data), ch.9 (Workbooks),
ch.10 (Reports). 페이지 번호는 원문 기준입니다.

우리 화면과 대응되는 것만 추렸습니다. 전체 목차는 `toc.json`에 있습니다.

---

## 1. Workspace — 좌측 도크 (p24)

*"The Workspace forms the basis of the user interface."* 기본 위치는 좌측이고, 떼어냈다
더블클릭하면 다시 붙습니다.

**하단 아이콘 탭으로 9개 페이지를 전환합니다**: Measurements · IP Traces · Binary Logs ·
Base Stations · Maps · Polygons · Data Source Files · Macros · Reports.

`Measurements` 페이지는 **3단**입니다: **Folders**(All Measurements + 사용자 폴더, 현재 DB
연결명 표시) · **Measurements** · **Parameters**.

> **우리**: Parameters 트리 + 검색창만 있고, 세션은 상단 드롭다운입니다. Folders 개념
> 없음, 나머지 8개 페이지 없음. Base Stations · Maps · Polygons는 우리가 다루지 않는
> 자산 종류라 페이지가 없는 것이 자연스럽지만, **Folders(측정 파일 정리)는 세션이
> 수십 개가 되면 필요해집니다.**

> **2026-09-01 정정 — `Polygons`는 자산이 아니라 분석 도구이기도 합니다.** 위에서
> Base Stations · Maps · Polygons를 묶어 "우리가 다루지 않는 자산 종류"로 적었는데, 폴리곤은
> 절반이 틀렸습니다. `.TAB` 임포트(p462)는 자산이지만, Map 메뉴의 **`Polygon region`은
> *"specify an area of any shape, and run statistics over that area"*** 입니다(p468).
> `Folder from area`는 그 영역을 지속되는 측정 부분집합으로 만들고, `Global Filters`는
> 폴리곤 영역을 전역 필터로 받습니다(p467).
> **우리에겐 임의 영역 선택이 없습니다** — 영역 비닝은 고정 격자입니다.

---

## 2. Parameters 뷰에서 바로 나오는 것들 (p48–p60)

파라미터를 우클릭·더블클릭해서 여는 것들입니다. **뷰가 아니라 "질의 진입점"** 이라는 점이
우리와 구조적으로 다릅니다.

| 항목 | 하는 일 | 우리 |
|---|---|---|
| **Statistics / with filters over parameter** (p50) | 파라미터 하나에 대한 통계 | ✅ Statistics 탭 |
| **Statistics by: No Grouping** (p51) | 그룹핑 없는 집계 | ✅ |
| **Statistics by: Fixed Geographical Bin Area** (p52) | **고정 지리 빈** 집계 | ✅ Area bins |
| **Lee's criteria sampling** (p55) | 스캐너 데이터의 **거리 기반** 집계 — §5 참조 | ◐ 아래 |
| **Parameter launchpad** (p57) | Cumulation & density · Count · Average · Min · Max · Std dev · Variance · Mode · Median · Midrange · **Histogram** | ◐ 일부 |
| **Distance binning** (p59) | `Open Distance Bin In` → map / graph / grid / text | ✅ 거리 프로파일 |
| **Change defaults** (p59) | 파라미터별 **기본 색상셋 · 그래프 축 상하한 · 기본 뷰 · 기본 통계 · 기본 드릴다운 워크북** | ◐ 색상 스케일만 |

`Change defaults`의 Statistics 탭에는 CDF/PDF 계산용 **Threshold·Condition·Minimum·Maximum·
Interval·Direction**과, 구간 경계의 어느 쪽을 포함할지 정하는 **Up/Down** 설정이 있습니다
(`>0 and <=25` 대 `>=0 and <25`). 포함되는 쪽이 X축에 인쇄됩니다.

> 우리 임계 편집기는 경계만 편집하고 **포함 방향을 사용자가 고르지 못합니다.** 우리는
> "하한 포함, 상한 배제"로 고정입니다.

---

## 3. Data views — 뷰 종류 (p94–p214)

| 뷰 | 페이지 | 우리 |
|---|---|---|
| **Graphs** (line / bar / scatter / **color grid** / **surface**) | 94–111 | ◐ 라인·바·파이. color grid·surface 없음 |
| **Grids** (+ Side panel, Row details, Export) | 112–121 | ✅ 표 |
| **Maps / Live Maps** (+ **Google Street View**) | 122–131 | ◐ Street View 없음 |
| **MapX** (Map/Route/BTS properties, 심볼 경로) | 132–146 | ⛔ MapInfo 자산 계열 |
| **Spreadsheet grid** (셀 서식·필터·**수식**·함수) | 180–189 | ⛔ |
| **Indoor / IBWC maps** | 192–199 | ⬛ 범위 외(실내) |
| **Numerical data views** | 200 | ✅ 우측 Numerical Data |
| **Info views** | 202 | ⛔ |
| **Timeline view** (+ Highlight Parameter, Notifications, **Range selection**) | 203–208 | ◐ 진행 바가 부분 대응 |
| **Network Parameters** | 209 | ⛔ |
| **Measurement Settings** | 210 | ⛔ |
| **Properties** | 211 | ⛔ |
| **Query clipboard** | 212 | ⛔ |
| **Activity** | 213 | ◐ Import history |
| **Log window** | 213 | ⛔ |

**Activity** (p213)는 파일 업로드·변환·업로드 큐의 진행을 보여주고 **Cancel All**과 개별
취소를 제공합니다. **Log window**는 프로그램·오류 메시지와 **처리 중인 SQL 문**을 보여줍니다.

> 우리 Import history는 Activity의 절반(이력)이고 **진행 중인 큐와 취소가 없습니다.**
> Log window의 SQL 표시는 우리에게 없고, 사실 우리는 사용자가 SQL을 볼 일이 없는 구조입니다
> — 다만 **KPI 그래프가 만든 SQL을 보여주는 것**은 같은 값어치가 있습니다(현재 validate
> 응답에 `sql`이 있으나 화면에 노출하지 않습니다).

---

## 4. Drilldown (p87) — 우리 구현과 조작이 다릅니다

Troubleshooting toolkit의 **선택 구성요소**입니다.

- 파이 차트에서 **조각 또는 범례 색을 더블클릭** → 그 원인의 이벤트 전체를 담은 그리드가 열림
- *"Each drill-down from the same chart will open a **new tab** in the same window. These tabs
  are displayed on the **left side of the window with the colors of the corresponding
  sectors**."*

> **우리**: 조각·행 **한 번 클릭**으로 드릴다운하고, 복귀는 `Back to all categories`
> 한 단계입니다. 레퍼런스는 **더블클릭**이고, 드릴다운마다 **좌측에 조각 색과 같은 색의
> 탭이 쌓입니다.** 즉 여러 원인을 나란히 열어 놓고 오갈 수 있습니다 — 우리는 한 번에
> 하나뿐입니다. 우리 격차표의 "breadcrumb 좌측 세로 탭"이 바로 이것이고,
> **단순 스타일 문제가 아니라 동시에 여러 드릴다운을 유지하는 기능**이었습니다.

---

## 5. Lee's criteria (p55) — 우리가 근거로 댔지만 구현하지 않은 것

> *"Define the distance in meters … Note that distance **40λ** should be used when running a
> query for the band. The formula for wave length = v/f … The average of the selected
> parameter is calculated for each aggregated distance bin. Each bin receives a time stamp
> and location based on the **first event's** time stamp and latitude/longitude of the bin."*

적용 대상: 스캐너의 Ec/N0 · RSCP · RX-level(RSSI) · RSRP · RSRQ. **별도 라이선스 옵션**입니다.

40λ를 계산하면:

| 대역 | λ | 40λ |
|---|---|---|
| n78 (3.5 GHz) | 8.6 cm | **3.4 m** |
| LTE 1800 | 16.6 cm | **6.7 m** |
| LTE 800 | 37.5 cm | **15 m** |

> **우리 거리 빈은 50 / 100 / 250 m입니다.** 두 자릿수 큽니다. 즉 우리는 "Lee's criteria를
> 근거로" 거리 비닝을 만들었다고 gap 문서에 적었지만, **실제로는 Lee's criteria를 구현하지
> 않았습니다.** 진짜로 하려면 캐리어 주파수에서 40λ를 계산해 빈 크기로 쓰는 선택지를
> 줘야 합니다 — 데이터는 이미 있습니다(`cell_ref.arfcn` → 중심주파수 변환이
> `FieldToLabService.centreFreqMhz`에 있음).
>
> 빈의 위치를 **첫 이벤트**의 좌표로 잡는 것도 다릅니다. 우리는 빈 내 평균 좌표를 씁니다.

---

## 6. Workbooks (p215–p230)

- **미리 만들어진 워크북 모음**이 있고(`System | UMTS | UMTS full details` 식), 측정 파일을
  우클릭 → `Analyses`로 목록을 봄
- `View | Workbook Layout`으로 **미리 정의된 배치**(예: 2×2 그리드)로 열기
- 워크북 실행 중 질의를 **Cancel / Cancel All** 가능
- 페이지 추가, 저장, **PDF / MS Word / MS PowerPoint / 이미지로 내보내기**, 복사, 속성

> **우리**: 사용자 구성 워크북은 만들었지만 **레이아웃 프리셋(2×2 등)과 기성 워크북
> 라이브러리가 없습니다.** 내보내기는 리포트 HTML 하나뿐입니다.

---

## 7. Reports (p231–p318)

템플릿 형식 3종:

| 형식 | 상태 |
|---|---|
| **`.srt` Spreadsheet Report Template** | **권장** |
| `.rpt` Crystal Reports | legacy, 更新 중단 |
| `.axt` Analyze Excel Template | legacy, 更新 중단 |

워크북 템플릿도 리포팅에 쓸 수 있으나 **내보내기는 PDF만** 가능합니다.
`Spreadsheet Report Designer`(p235)로 커스텀 리포트를 만듭니다.

> **우리**: 고정 레이아웃 HTML 리포트 1종. 템플릿 디자이너 없음. 화면 해상도 제약
> (max 1920×1080, 배율 100%)이 걸린 그들의 리포트 렌더링 방식과 달리, 우리 HTML은
> 브라우저에서 PDF로 인쇄하면 되므로 이 제약이 없습니다.

# 측정 파일의 적재와 정리 — 7장 Creating the Database · Workspace filters (p27–47)

측정 파일이 DB에 들어오는 규칙과, 파일이 수천 개일 때 그것을 **폴더 4종**으로 정리하는 방법을
옮겼습니다. 우리 세션 찾기(브리프 ⑧)의 확장 사양이 되는 곳은 §3의 Search 폴더 조건 목록입니다.

| | |
|---|---|
| 출처 | User Guide ch.6 끝(p27–29) · ch.7 (p30–47) |
| 관련 문서 | [`data-views.md` §1](data-views.md)(Workspace 3단), 브리프 ①·⑧ |

---

## 1. 파일 적재 규칙 (p30–31)

- `File | Measurement | Open [Measurement / Map / BTS / Report / Data Source File]`, 또는 Workspace로
  **드래그 앤 드롭**. Shift로 여러 파일. 진행은 `Activity`.
- **파일명 규칙**: `filename.device number.nmf` (예 `t5gsm.1.nmf`). 장치 번호는 **다중 단말 동시
  측정**의 번호이며 **반드시 점 하나를 더 찍어** 구분. 단말 하나면 `1`.
- 모든 파일명은 **고유**해야 함. SQL 예약어(`BTS`, `DATE` 대문자)와 일부 특수문자는 파일명에
  못 씀 — 파라미터·리포트에서 오류.
- 5G · IoT 파일은 해당 **라이선스 옵션** 필요. 대량 적재는 수 분.
- Handy 실내 파일은 마커 파일과 지도가 자동 로드.
- **DB 이전**: `C:\Nemo Tools\Nemo Analyze`와 `…\Nemo Analyze Datastore` 두 폴더 복사. **`Logs`
  폴더는 복사하지 말 것**(DB 손상).
- **이미지를 지도로**: `File | Import | Image as map` → 폭·길이(m) 또는 두 모서리 GPS 좌표. 우클릭
  `Create Black & White Copy`로 흑백 사본(`BW` 접미사).
- **GPS 좌표 교체**: 같은 폴더·같은 이름의 **`.gpxmod`** 파일이 있으면 적재(파싱) 단계에서 좌표를
  교체. 타임스탬프 비교 기반(UTC), 교체 뒤 설명 필드에 파일명 기록.

## 2. 폴더 4종 (p32–45)

`File | Organize` 또는 `All Measurements` 우클릭 → `Organize` / `Add Folder`. 모든 파일은 기본으로
`All Measurements`에 들어가고, 하위 폴더로는 **복사**(두 곳에 보임)됩니다.

| 폴더 | 채우는 방식 | 특기 |
|---|---|---|
| **Drag & Drop** | 사용자가 끌어다 놓음 (기술 · 시기 · 장소별) | 다른 PC로 내보내면 어떤 폴더든 Drag & Drop으로 들어옴 |
| **Search** | 사용자 정의 **검색 조건**(§3) | 새 파일이 들어오면 우클릭 `Refresh` 필요. 검색 칸에 여러 단어 가능 |
| **Query** | 미리 정의된 질의 (예 `Last Year`, 기술별 `Edge`) | 이름 자동. `Refresh` 필요 |
| **Voice Quality** | 선택한 단말 로그의 **서버 측 음성 품질 로그**를 자동으로 찾음 | UL MOS 표시 자체는 자동이라 그 목적에는 불필요(UC2) |

그 밖에:

- **Server Folders** — 서버 연결 시 모든 사용자에게 보이는 폴더. Nemo Cloud에서 받은 측정은 파일명
  기준으로 자동 정리. 만든 뒤 **측정을 넣기 전에 새로 고치면 폴더가 지워짐**.
- **Subsets** (Enterprise) — 서버에서 설정하는 동적 폴더. 하나의 설정이 **여러 버킷 하위 폴더**를
  만듦. 기본 숨김, 서버 이름 우클릭 `Show Subsets`.
- **Joined measurements** (p46) — 여러 파일을 **하나의 측정으로** 합침(`Add Joined Measurement` → 이름
  → 드래그). 시간이 겹치는 파일을 합치려면 `Options | Database | Queries | Allow overlapping when
  joining measurements`(TEMS 로그가 여러 조각으로 잘린 경우).
- **Descriptions** (p46) — 파일·폴더 우클릭 `Set Description`. 툴팁으로 표시되고 **Search 폴더의
  조건으로 검색 가능**. Shift로 여러 개에 한 번에. 측정 파일에 `#DL` 헤더가 있으면 장치 라벨도
  툴팁에.
- **Hiding** (p42) — **파일 2만 개 이상**이면 `Hide Measurements`로 UI 응답성 확보.
- **Delete Folder Contents** · **Retrieve Original Files**(Enterprise) · **Clean Up**(기간 지정 삭제) (p47).

## 3. Search 폴더의 조건 — 전체 목록 (p35–42)

`Add Folder | Search…` → `Search Folder Properties`. 탭별 조건이며 **조합 가능**합니다(예: 특정
날짜의 WiMAX 스캐너 측정 중 특정 폴리곤 영역 안의 것).

| 탭 | 조건 |
|---|---|
| **Measurement** | `Title` · `Extension` · `Description`(파일명 · 확장자 · 설명 문자열) · `Device type`(mobile / scanner) · **`Area`**(`Define Area` → 저장된 폴리곤 선택 또는 지도에서 그림; Pan · Reset · 줌) · `Size of measured area`(km²) · **`Has BTS loaded`** |
| **Date** | `Start date` · `End date` · **`Search last`** N `Days` / `Weeks` / `Months` / `Measurements`(최근 N개 세션) · `Duration` · **`Hour from N to N`**(기록된 시간대) |
| **Notifications** | 포함할 **이벤트** 선택 |
| **Parameters** | **파라미터와 값** |
| **Network** | `Mobile country code` · `Mobile network code` |
| **System** | 시스템 + 밴드(`Add`로 여러 개) |
| **Applications** | 로그에 수행된 **테스트** 종류 |
| **Packet technologies** | 패킷 기술 |
| **LTE** | LTE 관련 이벤트 |
| **System lock** | 시스템 락 |
| **Inbuilding** | 층 도면(venue · building · floor) |

## 4. Workspace 필터와 즐겨찾기 (p27–29)

- 측정 목록 위·Parameters 위·Base Stations 페이지에 각각 **필터 칸**. BTS 필터는 BTS 파일의 **어떤
  내용으로든**(예 채널 번호) 검색.
- ★ 즐겨찾기 파라미터는 `File | Settings (Export/Import)`(`.aex`)로 옮김. 가져올 때 **기존 즐겨찾기를
  교체할지 합칠지** 물음.

## 우리와의 관계

| 레퍼런스 | 우리 | 남는 것 |
|---|---|---|
| 파일명에 장치 번호, 다중 단말 = 세션 1 + 파일 N | CSV 1 = 세션 1 | 한 드라이브의 **여러 단말**을 한 세션으로 묶는 개념이 없음(브리프 ①) |
| Search 폴더 조건 11탭 | 세션 찾기 — 이름 · 기간 · 장비 · 사업자 · 기술 | **폴리곤 영역 · 지속시간 · 시간대 · 이벤트 포함 여부 · 파라미터 값 · BTS 유무**가 없음. 값 후보를 데이터에서 뽑는 방식은 우리가 이미 함 |
| 폴더(복사) + Refresh | 없음 | "정리"는 여전히 없음. Search 폴더 = **저장된 찾기 조건**으로 보면 우리 찾기에 저장 기능만 붙이면 됨 |
| Description · `#DL` 라벨 | 세션 메타(장비·사업자) | 자유 텍스트 설명과 그것으로 검색 |
| Joined measurements | 없음 | 잘린 로그를 한 세션으로 |
| `.gpxmod` 좌표 교체 | GPS 결측 처리(브리프 ②) | 외부 GPS 트랙으로 교체하는 입력 경로 |

# 레퍼런스 자료 매니페스트

기존 Keysight 솔루션의 요구사항 분석 및 UI/UX 모사를 위해 수집한 참고 자료입니다.
모든 파일은 **2026-08-30**에 아래 출처에서 직접 내려받아 무결성을 확인했습니다.

> 저작권 고지는 [`NOTICE.md`](./NOTICE.md)를 참조하십시오.

## 1. 공식 PDF (`reference-pdfs/`)

| 파일 | 리터러처 번호 | 종류 | 출처 URL |
|---|---|---|---|
| `3120-1513_S8709A-VDT-Technical-Overview.pdf` | 3120-1513 | Technical Overview (8p) | `https://www.keysight.com/content/dam/keysight/en/doc/ungate/technical-overviews/S8709A-Virtual-Drive-Test-Toolset.pdf` |
| `5992-2005EN_Nemo-Analyze-Technical-Overview.pdf` | 5992-2005EN | Technical Overview (21p) | `https://www.avantec2.cl/imagenes/pdf/5992-2005EN_Nemo_Analyze_TE.pdf` (제3자 미러 — 원문은 Keysight 발행, 2020-02-20) |
| `5992-2057_Nemo-Outdoor-Flyer.pdf` | 5992-2057 | Flyer (4p) | `https://www.keysight.com/content/dam/keysight/en/doc/ungate/flyers/5992-2057.pdf` |
| `5992-2047_Nemo-Analyze-Flyer.pdf` | 5992-2047 | Flyer (3p) | `https://www.keysight.com/content/dam/keysight/en/doc/ungate/flyers/5992-2047.pdf` |
| `5992-2050_Nemo-Handy-Flyer.pdf` | 5992-2050 | Flyer (4p) | `https://www.keysight.com/content/dam/keysight/en/doc/ungate/flyers/5992-2050.pdf` |
| `5992-2774_Nemo-Handy-IoT-Brochure.pdf` | 5992-2774 | Brochure (2p) | `https://www.keysight.com/content/dam/keysight/en/doc/ungate/brochures/5992-2774.pdf` |
| `5992-2268_Nemo-Global-License-Server.pdf` | 5992-2268 | Brochure (2p) | `https://www.keysight.com/content/dam/keysight/en/doc/ungate/brochures/5992-2268.pdf` |
| `NTC00000A-900005_Nemo-Firmware-Manager-User-Guide-2.51.pdf` | 매뉴얼 부품번호 NTC00000A-900005 | **정식 User Guide** (35p, Edition 3.00, 2022-01) | `https://update.nemo.fi/updates/Nemo_Firmware_Manager_User_Guide_2.51.pdf` |

### 내려받기 방법 (재현용)

Keysight의 자료 **페이지**(`/us/en/assets/...`)는 봇에 403을 반환하지만, **원본 바이트**는 다음 경로에서 받을 수 있습니다.

```
https://www.keysight.com/content/dam/keysight/en/doc/ungate/<type>/<파일명>.pdf
```

- `<type>`: `flyers`, `brochures`, `data-sheets`, `technical-overviews`, `solution-briefs`
- **주의**: 파일명이 항상 리터러처 번호는 아닙니다. flyer/brochure는 번호(`5992-2057`)를 쓰지만,
  S8709A 기술개요는 **제목 기반 파일명**(`S8709A-Virtual-Drive-Test-Toolset`)을 씁니다.
- 404 시 PDF가 아니라 HTML을 반환하므로 **매직 바이트(`%PDF`) 검증이 필수**입니다.

## 2. 스크린샷 (`screenshots/`)

전부 위 PDF 내부에 임베드된 원본 이미지를 손실 없이 추출한 것입니다(재촬영·재압축 없음).

### Nemo Outdoor — 드라이브 테스트 측정 도구

| 파일 | 해상도 | 내용 |
|---|---|---|
| `nemo-outdoor_5g-nr_main-window_2560x1440.png` | 2560×1440 | **핵심 레퍼런스.** 5G NR 측정 중 메인 윈도우. 리본, 도킹 패널, 공유 시간 커서, 임계 강조, 워크북 탭, 상태 바 전부 판독 가능 |
| `nemo-outdoor_laptop-composite.jpeg` | 610×422 | 랩탑 목업 위 4분할 그래프 화면 |

### Nemo Analyze — 사후 분석 도구

| 파일 | 해상도 | 내용 |
|---|---|---|
| `nemo-analyze_workbook_line-and-bar.png` | 1918×1040 | **핵심 레퍼런스.** 워크북 메인 화면. 리본, Workspace 도크(Folders/Measurements/Parameters 트리), 라인 그래프 + 바 차트, 우측 Tools/Layers/Numerical Data/Color Legends 도크, 보라색 상태 바 |
| `nemo-analyze_live-map_route-coloring_color-legend.jpeg` | 1490×824 | **핵심 레퍼런스.** Figure 6 "Live Google Map". 경로 색상 코딩 + **Color Legends 패널의 실제 구간·건수·비율** 판독 가능. LiveMaps 목록(Google 5종 + OpenStreetMap), Loaded MapX Maps(.TAB/.GST) |
| `nemo-analyze_basestation-map-synchronized-views.png` | 1025×806 | Figure 7. 기지국 맵과 타 데이터 뷰의 동기화 |
| `nemo-analyze_area-binning.png` | 1327×813 | Figure 8. Area binning |
| `nemo-analyze_troubleshooting.jpeg` | 1210×1190 | 트러블슈팅 KPI 화면 |
| `nemo-analyze_kpi-workbench.png` | 774×717 | KPI Workbench (SQL 없이 커스텀 KPI 생성) |
| `nemo-analyze_benchmarking.png` | 1265×899 | 벤치마킹 비교 화면 |
| `nemo-analyze_spreadsheet-report-summary.jpeg` | 1267×686 | Figure 12. Spreadsheet Report Designer 요약 페이지 |
| `nemo-analyze_excel-export.jpeg` | 1270×905 | Excel 내보내기 템플릿 |
| `nemo-analyze_database-concept-diagram.png` | 2095×735 | Figure 4. 데이터베이스 개념도 |
| `nemo-analyze_fig1-qos-qoe-analysis.png` | 753×1005 | Figure 1. QoS/QoE 분석 |
| `nemo-analyze_fig2-data-views.jpeg` | 1995×1091 | 데이터 뷰 모음 |
| `nemo-3d-visualizer_ss-rsrp.jpeg` | 1995×1091 | **Nemo 3D Visualizer v1.2** (© 2019). SS-RSRP 3D 시각화, 좌측 다크 사이드바(Options/Map Settings/Import Settings/Building Settings/Legends/Base Stations) |

### Nemo Handy — 모바일 측정 앱

| 파일 | 해상도 | 내용 |
|---|---|---|
| `nemo-handy_iot_parameters-and-measurements.jpeg` | 2000×1520 | **핵심 레퍼런스.** `IoT Parameters` / `IoT Measurements` 두 화면. 다크 테마, 파라미터 목록, 범례 헤더 + 미니 차트 카드, 파란 하단 상태 바 |
| `nemo-handy_mobile-screen.png` | 929×1014 | 모바일 화면 |

### S8709A VDT — 가상 드라이브 테스트 툴셋

| 파일 | 해상도 | 내용 |
|---|---|---|
| `s8709a-vdt_fig2-architecture.png` | 1502×754 | **Figure 2.** UXM 5G Network Emulation + PROPSIM 5G Channel Emulation + Nemo Tools 통합 구조도 |
| `s8709a-vdt_fig3-single-interface.png` | 1565×715 | **Figure 3.** 테스트 케이스 실행·분석·리포팅 단일 인터페이스 |
| `s8709a-vdt_p7-figure.jpeg` | 1468×846 | 네트워크 사업자 테스트 플랜 관련 도해 |

### 기타

| 파일 | 내용 |
|---|---|
| `nemo-firmware-manager_main-window.jpeg` | Nemo Firmware Manager 메인 윈도우 (다크 테마, 육각형 모티프). **정식 매뉴얼에서 추출** |
| `keysight-logo-official.png` | 공식 Keysight 로고 PNG (201×50). 브랜드 색상 추출 근거 |

## 3. 추출 재현 방법

```bash
pip install pymupdf pillow
python3 -c "
import pymupdf
d = pymupdf.open('reference-pdfs/5992-2005EN_Nemo-Analyze-Technical-Overview.pdf')
for i in range(d.page_count):
    for im in d[i].get_images(full=True):
        xref, w, h = im[0], im[2], im[3]
        if w*h > 120000:
            info = d.extract_image(xref)
            open(f'p{i+1}_{xref}.{info[\"ext\"]}','wb').write(info['image'])
"
```

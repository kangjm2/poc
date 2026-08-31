/**
 * Drives the built UI in a real browser and asserts the behaviours the
 * requirements analysis calls non-negotiable: the shared time cursor, workbook
 * tabs, threshold highlighting, the legend-as-distribution, degradation
 * detection and session comparison.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173'
const OUT = process.env.OUT ?? '/tmp/shots2'
mkdirSync(OUT, { recursive: true })

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

// Map tiles are fetched by the browser itself, so it needs the same egress proxy
// the rest of the toolchain uses; without it the basemap silently fails to load.
const PROXY = process.env.HTTPS_PROXY ?? process.env.https_proxy
  ?? (process.env.CLOUDSDK_PROXY_PORT ? `http://127.0.0.1:${process.env.CLOUDSDK_PROXY_PORT}` : undefined)

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ...(PROXY ? { proxy: { server: PROXY, bypass: 'localhost,127.0.0.1,::1' } } : {}),
  args: ['--ignore-certificate-errors'],
})
const page = await browser.newPage({
  viewport: { width: 1680, height: 1000 },
  ignoreHTTPSErrors: true,
})
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.statusbar', { timeout: 15000 })
await page.waitForTimeout(2500) // let map tiles settle

// 1. session list populated
const sessionCount = await page.locator('.toolbar select').first().locator('option').count()
check('세션 목록 로드', sessionCount >= 3, `${sessionCount} sessions`)

// 2. legend carries counts and percentages, not just colours
const legendRows = await page.locator('.dock.right .legend-row').count()
// Assert a per-bin count AND percentage on a DATA row, not just that '%' appears
// somewhere: the header alone contains '%', so the looser check passed against a
// legend whose statistics columns had been removed entirely.
const legendStats = await page.locator('.dock.right .legend-row')
  .filter({ has: page.locator('.swatch') })
  .evaluateAll((rows) => rows.map((r) => ({
    count: r.querySelector('.count')?.textContent?.trim() ?? '',
    pct: r.querySelector('.pct')?.textContent?.trim() ?? '',
  })).filter((x) => /^\d+$/.test(x.count) && /^\d+(\.\d+)?%$/.test(x.pct)))
check('색상 범례에 건수·비율 포함', legendRows >= 5 && legendStats.length >= 4,
  `${legendRows} rows, ${legendStats.length} with count+pct`)

// 3. route is drawn as coloured segments
const segments = await page.locator('path.leaflet-interactive').count()
check('지도 경로 색상 세그먼트 렌더링', segments > 100, `${segments} segments`)

await page.screenshot({ path: `${OUT}/01-overview.png`, fullPage: false })

// 4. shared time cursor: moving it must change the readout AND the grid
const before = await page.locator('.statusbar b').nth(2).innerText()
const beforeGrid = await page.locator('.dock.right table.grid').first().innerText()
const bar = await page.locator('.statusbar .progress').boundingBox()
await page.mouse.click(bar.x + bar.width * 0.5, bar.y + bar.height / 2)
await page.waitForTimeout(900)
const after = await page.locator('.statusbar b').nth(2).innerText()
const afterGrid = await page.locator('.dock.right table.grid').first().innerText()
check('공유 시간 커서 — CURRENT 갱신', before !== after, `${before} -> ${after}`)
check('공유 시간 커서 — 값 패널 동기화', beforeGrid !== afterGrid)
await page.screenshot({ path: `${OUT}/02-cursor-moved.png` })

// 5. threshold highlighting paints whole cells
await page.locator('.workbook-tabs button', { hasText: 'Radio Quality' }).click()
await page.waitForTimeout(600)
// park the cursor inside the seeded deep-fade stretch
await page.mouse.click(bar.x + bar.width * 0.46, bar.y + bar.height / 2)
await page.waitForTimeout(900)
const severeCells = await page.locator('td.sev-CRITICAL, td.sev-WARNING').count()
check('임계 초과 셀 강조', severeCells > 0, `${severeCells} highlighted cells`)
await page.screenshot({ path: `${OUT}/03-radio-thresholds.png` })

// 6. workbook tabs switch the panel set
await page.locator('.workbook-tabs button', { hasText: 'Throughput' }).click()
await page.waitForTimeout(700)
const thrTitles = await page.locator('.panel > header .title').allInnerTexts()
check('워크북 탭 전환', thrTitles.some((t) => /throughput/i.test(t)), thrTitles.join(' | '))
await page.screenshot({ path: `${OUT}/04-throughput.png` })

await page.locator('.workbook-tabs button', { hasText: 'L3 Signalling' }).click()
await page.waitForTimeout(600)
const msgRows = await page.locator('.panel table.grid tbody tr').count()
check('L3 시그널링 메시지 뷰어', msgRows > 0, `${msgRows} messages`)
await page.screenshot({ path: `${OUT}/05-signaling.png` })

// 7. automatic degradation detection
await page.locator('.workbook-tabs button', { hasText: 'Degradation' }).click()
await page.waitForTimeout(900)
const degRows = await page.locator('.panel table.grid tbody tr').count()
const degText = await page.locator('.panel').first().innerText()
check('자동 열화 구간 탐지', degRows > 0, `${degRows} stretches`)
check('열화 구간에 CRITICAL 포함', /CRITICAL/.test(degText))
await page.screenshot({ path: `${OUT}/06-degradations.png` })

// clicking a degradation jumps the cursor there
const seqBefore = await page.locator('.statusbar .dim').first().innerText()
await page.locator('.panel table.grid tbody tr').first().click()
await page.waitForTimeout(700)
const seqAfter = await page.locator('.statusbar .dim').first().innerText()
check('열화 구간 클릭 시 커서 이동', seqBefore !== seqAfter, `${seqBefore} -> ${seqAfter}`)

// 8. KPI switch re-colours the map and legend
await page.locator('.workbook-tabs button', { hasText: 'Overview' }).click()
await page.waitForTimeout(500)
const legendBefore = await page.locator('.dock.right').first().innerText()
await page.locator('.tree .kpi', { hasText: 'SS-SINR' }).click()
await page.waitForTimeout(1400)
const legendAfter = await page.locator('.dock.right').first().innerText()
check('파라미터 트리에서 KPI 전환', legendBefore !== legendAfter)
await page.screenshot({ path: `${OUT}/07-sinr.png` })

// 9. session comparison
await page.locator('.mode-tabs button', { hasText: 'Compare' }).click()
await page.waitForTimeout(1800)
const verdicts = await page.locator('[class^="verdict-"]').allInnerTexts()
check('세션 비교 결과 렌더링', verdicts.length >= 5, `${verdicts.length} rows`)
check('비교 판정 산출', verdicts.some((v) => v === 'BETTER' || v === 'WORSE'),
  verdicts.join(','))
await page.screenshot({ path: `${OUT}/08-compare.png`, fullPage: true })

const appErrors = errors.filter((e) => !/tile\.openstreetmap\.org|ERR_CONNECTION|Failed to load resource/.test(e))
// 16. network-side KPIs are present alongside UE-side ones
await page.locator('.mode-tabs button', { hasText: 'Analysis' }).click()
await page.waitForTimeout(700)
const treeText = await page.locator('.dock .tree').innerText()
check('네트워크(DU) 측 KPI 노출', /Network Side/.test(treeText) && /PRB utilisation/.test(treeText))

// 17. area binning replaces the raw route with tiles
const segBefore = await page.locator('path.leaflet-interactive').count()
await page.locator('.toolbar select').nth(2).selectOption('150')
await page.waitForTimeout(1600)
const rects = await page.locator('.leaflet-overlay-pane path').count()
const mapTitle = await page.locator('.panel > header .title').first().innerText()
check('영역 비닝(area binning) 렌더링', /area bins/.test(mapTitle) && rects > 0,
  `${segBefore} segments -> ${rects} shapes, title="${mapTitle}"`)
await page.screenshot({ path: `${OUT}/09-area-bins.png` })
await page.locator('.toolbar select').nth(2).selectOption('0')
await page.waitForTimeout(900)

// 18. coverage issue detection
await page.locator('.workbook-tabs button', { hasText: 'Coverage Issues' }).click()
await page.waitForTimeout(1400)
const issueRows = await page.locator('.panel table.grid tbody tr').count()
const issueText = await page.locator('.panels').innerText()
check('커버리지 문제 자동 탐지', issueRows > 0 && /WEAK COVERAGE|INTERFERENCE|OVERSHOOT/.test(issueText),
  `${issueRows} issues`)
await page.screenshot({ path: `${OUT}/10-coverage-issues.png` })

// 19. export links are wired
const csvHref = await page.locator('.toolbar a', { hasText: 'CSV' }).getAttribute('href')
const geoHref = await page.locator('.toolbar a', { hasText: 'GeoJSON' }).getAttribute('href')
check('CSV / GeoJSON 내보내기 링크', /export\.csv/.test(csvHref ?? '') && /export\.geojson/.test(geoHref ?? ''))

// 20. lab campaign view shows the emulated-vs-real configuration
await page.locator('.mode-tabs button', { hasText: 'Lab Campaigns' }).click()
await page.waitForTimeout(1600)
const labText = await page.locator('.panels').innerText()
check('랩 캠페인 구성 표시',
  /Channel model \(emulated\)/.test(labText) && /DU under test \(real\)/.test(labText)
  && /UE profile \(emulated\)/.test(labText))
check('필드 리플레이 채널 모델', /FIELD_REPLAY/.test(labText))
check('O-RAN 프론트홀 연결 표기', /FRONTHAUL_ORAN_7_2X/.test(labText))

// 21. evaluating a run produces a verdict from its criteria
await page.locator('.panel button', { hasText: 'Evaluate' }).first().click()
await page.waitForTimeout(1800)
const afterEval = await page.locator('.panels').innerText()
check('합불 판정(verdict) 산출', /PASS|FAIL/.test(afterEval))
await page.screenshot({ path: `${OUT}/11-lab-campaign.png`, fullPage: true })

// 22. import screen documents the recognised columns
await page.locator('.mode-tabs button', { hasText: 'Import' }).click()
await page.waitForTimeout(1200)
const importText = await page.locator('.panels').innerText()
check('CSV 임포트 화면', /Recognised KPI columns/.test(importText) && /RSRP/.test(importText))
await page.screenshot({ path: `${OUT}/12-import.png` })

// 23-25. fronthaul injection scenario: a transport fault the radio view cannot see
await page.locator('.mode-tabs button', { hasText: 'Analysis' }).click()
await page.waitForTimeout(600)
const sessionOpts = await page.locator('.toolbar select').first().locator('option').allInnerTexts()
const fh = sessionOpts.find((o) => /fronthaul/i.test(o))
check('프론트홀 주입 세션 존재', Boolean(fh), fh ?? 'not found')
if (fh) {
  await page.locator('.toolbar select').first().selectOption({ label: fh })
  await page.waitForTimeout(2500)
  const tree = await page.locator('.dock .tree').innerText()
  check('O-RAN 프론트홀 KPI 계열', /Fronthaul/.test(tree) && /CUS RX late/.test(tree))

  await page.locator('.tree .kpi', { hasText: 'CUS RX late' }).click()
  await page.waitForTimeout(1500)
  await page.locator('.workbook-tabs button', { hasText: 'Degradation' }).click()
  await page.waitForTimeout(1500)
  const degText = await page.locator('.panels').innerText()
  check('프론트홀 타이밍 결함 탐지', /CRITICAL/.test(degText),
    (degText.match(/\d+s/) ?? ['?'])[0] + ' fault window')
  await page.screenshot({ path: `${OUT}/15-fronthaul-fault.png` })

  // the radio side stays healthy through the same window - the whole point
  await page.locator('.panel table.grid tbody tr').first().click()
  await page.waitForTimeout(1200)
  const grid = await page.locator('.dock.right table.grid').first().innerText()
  const radioOk = /RSRP/.test(grid)
  check('결함 구간에서 무선 KPI 조회 가능', radioOk)
}

// 26. L3 message log follows the cursor and expands
await page.locator('.toolbar select').first().selectOption({ index: 0 })
await page.waitForTimeout(1500)
await page.locator('.workbook-tabs button', { hasText: 'L3 Signalling' }).click()
await page.waitForTimeout(1200)
const sigHeader = await page.locator('.panel > header .meta').first().innerText()
check('L3 로그가 커서를 따라감', /following cursor/.test(sigHeader), sigHeader)
const rowsBefore = await page.locator('.panel table.grid tbody tr').count()
await page.locator('.panel table.grid tbody tr').first().click()
await page.waitForTimeout(500)
const rowsAfter = await page.locator('.panel table.grid tbody tr').count()
check('L3 메시지 상세 펼치기', rowsAfter > rowsBefore, `${rowsBefore} -> ${rowsAfter} rows`)
await page.screenshot({ path: `${OUT}/16-l3-drilldown.png` })

// 27. the parameter tree can be searched - the reference puts a search box above it
//     because the catalogue is far too large to browse.
await page.locator('.workbook-tabs button', { hasText: 'Overview' }).click()
await page.waitForTimeout(600)
const kpisAll = await page.locator('.tree .kpi').count()
await page.locator('.tree-search input').fill('throughput')
await page.waitForTimeout(300)
const kpisFiltered = await page.locator('.tree .kpi').count()
check('파라미터 검색', kpisFiltered > 0 && kpisFiltered < kpisAll,
  `${kpisAll} -> ${kpisFiltered}`)
await page.locator('.tree-search input').fill('FH_RX')
await page.waitForTimeout(300)
check('파라미터 검색 - 내부명 매칭', (await page.locator('.tree .kpi').count()) > 0)
await page.locator('.tree-search input').fill('')
await page.waitForTimeout(300)

// 27b. bar chart per serving cell - the reference workbook's second pane is a bar
//      chart, and it was the one chart type we had no equivalent of.
await page.locator('.workbook-tabs button', { hasText: 'Cells' }).click()
await page.waitForSelector('.cell-bar')
const bars = await page.locator('.cell-bar rect').count()
check('셀별 바 차트', bars >= 3, `${bars} bars`)
const barRows = await page.locator('.panel:has-text("Serving cell breakdown") tbody tr').count()
check('셀 분해 표', barRows === bars, `${barRows} rows vs ${bars} bars`)
const shares = await page.locator('.panel:has-text("Serving cell breakdown") tbody tr td:nth-child(6)')
  .allInnerTexts()
const shareSum = shares.reduce((a, t) => a + parseFloat(t), 0)
check('셀별 비율 합계 100%', Math.abs(shareSum - 100) < 0.5, `${shareSum.toFixed(1)}%`)
await page.screenshot({ path: `${OUT}/26-cells.png`, fullPage: true })

// 28. lab bring-up: the instrument chain, its steps, and the attach detail. A virtual
//     drive test is a chain of instruments, and which link stopped a run is the first
//     thing a lab engineer needs; a run that jumps QUEUED -> COMPLETED hides all of it.
await page.getByRole('button', { name: 'Lab Campaigns' }).click()
await page.waitForSelector('.chain-node')
const chainRoles = await page.locator('.chain-role').allInnerTexts()
check('장비 체인 표시', chainRoles.length === 4, chainRoles.join(' -> '))
const stepRows = await page.locator('.panel:has-text("Bring-up sequence") tbody tr').count()
check('브링업 시퀀스 표시', stepRows >= 10, `${stepRows} steps`)
const phases = await page.locator('.panel:has-text("Bring-up sequence") tbody tr td:nth-child(2)')
  .allInnerTexts()
check('접속 절차 단계 포함', phases.includes('Attach'),
  [...new Set(phases)].join(','))
const rachRows = await page.locator('.panel:has-text("5G NR RACH metrics") tbody tr').count()
check('RACH 지표 패널', rachRows >= 15, `${rachRows} rows`)
const cellCells = await page.locator('.panel:has-text("Serving cell") tbody td').allInnerTexts()
check('서빙 셀 식별 (PCI 외 band/ARFCN/GSCN)',
  cellCells.length === 6 && cellCells.some((c) => /^\d{6}$/.test(c)), cellCells.join(' | '))
await page.screenshot({ path: `${OUT}/25-lab-bringup.png`, fullPage: true })

check('앱 코드 콘솔 오류 없음', appErrors.length === 0, appErrors.slice(0, 3).join(' | '))
const tileFailures = errors.length - appErrors.length
if (tileFailures > 0) console.log(`  (note: ${tileFailures} basemap tile fetches failed - network egress, not app code)`)

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)

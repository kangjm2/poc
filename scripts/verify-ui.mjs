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
const legendText = await page.locator('.dock.right').first().innerText()
check('색상 범례에 건수·비율 포함', legendRows >= 5 && /%/.test(legendText),
  `${legendRows} rows`)

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
await page.locator('.workbook-tabs button', { hasText: '무선 품질' }).click()
await page.waitForTimeout(600)
// park the cursor inside the seeded deep-fade stretch
await page.mouse.click(bar.x + bar.width * 0.46, bar.y + bar.height / 2)
await page.waitForTimeout(900)
const severeCells = await page.locator('td.sev-CRITICAL, td.sev-WARNING').count()
check('임계 초과 셀 강조', severeCells > 0, `${severeCells} highlighted cells`)
await page.screenshot({ path: `${OUT}/03-radio-thresholds.png` })

// 6. workbook tabs switch the panel set
await page.locator('.workbook-tabs button', { hasText: '처리량' }).click()
await page.waitForTimeout(700)
const thrTitles = await page.locator('.panel > header .title').allInnerTexts()
check('워크북 탭 전환', thrTitles.some((t) => /throughput/i.test(t)), thrTitles.join(' | '))
await page.screenshot({ path: `${OUT}/04-throughput.png` })

await page.locator('.workbook-tabs button', { hasText: 'L3 시그널링' }).click()
await page.waitForTimeout(600)
const msgRows = await page.locator('.panel table.grid tbody tr').count()
check('L3 시그널링 메시지 뷰어', msgRows > 0, `${msgRows} messages`)
await page.screenshot({ path: `${OUT}/05-signaling.png` })

// 7. automatic degradation detection
await page.locator('.workbook-tabs button', { hasText: '열화 구간' }).click()
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
await page.locator('.workbook-tabs button', { hasText: '개요' }).click()
await page.waitForTimeout(500)
const legendBefore = await page.locator('.dock.right').first().innerText()
await page.locator('.tree .kpi', { hasText: 'SS-SINR' }).click()
await page.waitForTimeout(1400)
const legendAfter = await page.locator('.dock.right').first().innerText()
check('파라미터 트리에서 KPI 전환', legendBefore !== legendAfter)
await page.screenshot({ path: `${OUT}/07-sinr.png` })

// 9. session comparison
await page.locator('.mode-tabs button', { hasText: '세션 비교' }).click()
await page.waitForTimeout(1800)
const verdicts = await page.locator('[class^="verdict-"]').allInnerTexts()
check('세션 비교 결과 렌더링', verdicts.length >= 5, `${verdicts.length} rows`)
check('비교 판정 산출', verdicts.some((v) => v === 'BETTER' || v === 'WORSE'),
  verdicts.join(','))
await page.screenshot({ path: `${OUT}/08-compare.png`, fullPage: true })

const appErrors = errors.filter((e) => !/tile\.openstreetmap\.org|ERR_CONNECTION|Failed to load resource/.test(e))
check('앱 코드 콘솔 오류 없음', appErrors.length === 0, appErrors.slice(0, 3).join(' | '))
const tileFailures = errors.length - appErrors.length
if (tileFailures > 0) console.log(`  (note: ${tileFailures} basemap tile fetches failed - network egress, not app code)`)

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)

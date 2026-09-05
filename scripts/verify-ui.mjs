/**
 * Drives the built UI in a real browser and asserts the behaviours the
 * requirements analysis calls non-negotiable: the shared time cursor, workbook
 * tabs, threshold highlighting, the legend-as-distribution, degradation
 * detection and session comparison.
 */
import { chromium } from 'playwright'
import { chromiumPath } from '../tools/uxtest/browser.mjs'
import { mkdirSync, readFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173'
const OUT = process.env.OUT ?? '/tmp/shots2'
const API_BASE = process.env.API ?? 'http://127.0.0.1:8080'
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
  executablePath: chromiumPath(),
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

// Not networkidle: the blocked basemap keeps fetches pending, so the wait is at the
// mercy of how long the proxy takes to give up - it timed out outright during repeated
// container rebuilds. The explicit waits below are what this actually depends on.
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.statusbar', { timeout: 15000 })
await page.waitForTimeout(2500) // let map tiles settle

// 1. session list populated
const sessionCount = await page.locator('.toolbar select[aria-label="Measurement"]').locator('option').count()
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

// 3b. the route must not assert coverage it does not have.
//
// Session 1 carries a 26 s stretch with no position fix and one implausible fix;
// session 2 is the same route with neither. Asserting only "a gap path exists" would
// pass on a build that drew a break everywhere, so both halves are checked: the
// session WITH the defects shows them, the session WITHOUT shows none. The pair is
// what makes this discriminating rather than decorative.
const breakPaths = () => page.evaluate(() => ({
  gap: document.querySelectorAll('path.route-gap').length,
  glitch: document.querySelectorAll('path.route-glitch').length,
}))
const brk1 = await breakPaths()
check('결측 구간을 이어 그리지 않음', brk1.gap >= 1, `${brk1.gap} gap paths`)
check('신뢰할 수 없는 위치 고정을 경로에서 분리', brk1.glitch >= 1, `${brk1.glitch} glitch paths`)

// The rejected fix must not frame the map either: with it in fitBounds the whole real
// drive collapses to a few pixels. The route bbox has to stay a sane fraction of the
// map, which it cannot be if an 8 km outlier is inside the bounds.
const framing = await page.evaluate(() => {
  // The app's own .map div, not Leaflet's .leaflet-container: that class is not
  // present in this build at all (the basemap is blocked here and the panel renders
  // as .map.no-basemap), so keying on it made this check fail on healthy code.
  const paths = [...document.querySelectorAll('.leaflet-overlay-pane path.route-run')]
  if (!paths.length) return null
  const container = paths[0].closest('.map')
  if (!container) return null
  const box = container.getBoundingClientRect()
  const rects = paths.map((p) => p.getBoundingClientRect())
  const w = Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left))
  const h = Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top))
  // fitBounds fills the LIMITING axis and leaves slack on the other, so the larger
  // ratio is the one that says whether the route was framed. Taking the smaller one
  // measures the panel's aspect ratio instead of the framing (this panel is wide, so
  // a correctly framed route still only spans ~17% of its width).
  return { fill: Math.max(w / box.width, h / box.height) }
})
check('경로가 이상치에 눌려 찌그러지지 않음', framing != null && framing.fill > 0.4,
  framing ? `route fills ${(framing.fill * 100).toFixed(0)}% of the map` : 'no route')

// Restore by VALUE, not by index 0: the picker is ordered newest-first, so index 0 is
// the most recent session rather than the one that was loaded. Getting this wrong left
// every later check running against a different drive than it was written for.
const sessionPicker = page.locator('.toolbar select[aria-label="Measurement"]')
const sessionBefore = await sessionPicker.inputValue()
await sessionPicker.selectOption({ index: 1 })
await page.waitForTimeout(2200)
const brk2 = await breakPaths()
check('결함 없는 세션에는 끊김을 그리지 않음', brk2.gap === 0 && brk2.glitch === 0,
  `clean session: ${brk2.gap} gaps, ${brk2.glitch} glitches`)
await sessionPicker.selectOption(sessionBefore)
await page.waitForTimeout(2200)

// 3c. and the same judgement must reach the distance axis. A single bad fix adds an
// out-and-back excursion; unguarded it inflated this 4.4 km drive to 17.8 km, so the
// two same-route sessions are compared against each other rather than against a
// hardcoded number.
const distOf = async (id) => {
  const r = await page.request.get(`${API_BASE}/api/sessions/${id}/distance-bins?kpi=RSRP&stepMeters=250`)
  const bins = await r.json()
  return Math.max(...bins.map((b) => b.toMetres))
}
const [d1, d2] = [await distOf(1), await distOf(2)]
check('이상치가 주행 거리를 부풀리지 않음', Math.abs(d1 - d2) / d2 < 0.15,
  `${(d1 / 1000).toFixed(2)} km vs ${(d2 / 1000).toFixed(2)} km on the same route`)

// 3d. events must exist as a VISUAL channel, not only as rows in a table.
//
// All three counts are compared against each other rather than against a constant: a
// build that drew markers for a stale event list, or dropped the ones without a fix,
// would still satisfy "some markers exist".
const evDock = await page.locator(
  '.dock.right .dock-section:has(h3:text("Events")) table.grid tbody tr').count()
const evMap = await page.locator('.event-marker .ev-dot').count()
const evChart = await page.locator('.panel.chart-panel').first().locator('g.chart-event').count()
check('이벤트가 지도에 타입별 심볼로 표시', evMap > 0, `${evMap} map symbols`)
check('이벤트가 차트에 시각으로 표시', evChart > 0, `${evChart} chart marks`)
check('지도·차트·목록이 같은 이벤트 집합을 그림', evMap === evDock && evChart === evDock,
  `dock ${evDock}, map ${evMap}, chart ${evChart}`)

// And they must all speak the same language. This is the defect the registry exists to
// kill: the same failure read as RADIO_LINK_FAILURE in the dock and "Radio link failure"
// in the pie, and a user comparing the two screens had to work out they were one thing.
const evTypes = await (await page.request.get(`${API_BASE}/api/event-types`)).json()
// Only the cell that renders the type. Scanning the whole row picks up the Detail
// text, which legitimately mentions RACH, and the check then fails on correct code.
const dockText = (await page.locator(
  '.dock.right .dock-section:has(h3:text("Events")) table.grid tbody tr td:nth-child(2)')
  .allInnerTexts()).join(' | ')
const rawShown = evTypes.filter((t) => dockText.includes(t.name)).map((t) => t.name)
const labelled = evTypes.filter((t) => dockText.includes(t.displayName)).map((t) => t.name)
check('이벤트 목록이 원시 타입명 대신 등록된 표시명을 씀',
  rawShown.length === 0 && labelled.length >= 2,
  `raw: ${rawShown.join(',') || 'none'} · labelled: ${labelled.join(',')}`)

await page.screenshot({ path: `${OUT}/01-overview.png`, fullPage: false })

// 3e. the interaction surface: a cursor you can step, a frame you own, keys with one owner.
//
// The map framing checks measure the route bbox only while the WHOLE route is inside the
// panel. Leaflet clips every polyline to the renderer's padded bounds and re-clips on
// remount, writing `d="M0 0"` for anything fully outside - so a zoomed-in route's bbox
// moves even when the viewport is byte-identical, and it would report a difference the
// user cannot see. Zooming OUT changes the viewport just as well and clips nothing.
const routeFrame = () => page.evaluate(() => {
  const paths = [...document.querySelectorAll('.leaflet-overlay-pane path.route-run')]
    .filter((p) => p.getAttribute('d') !== 'M0 0')
  if (!paths.length) return null
  const r = paths.map((p) => p.getBoundingClientRect())
  return {
    x: Math.min(...r.map((b) => b.left)),
    w: Math.max(...r.map((b) => b.right)) - Math.min(...r.map((b) => b.left)),
    n: paths.length,
  }
})

const seqNow = async () =>
  Number((await page.locator('.statusbar .dim').first().innerText()).match(/seq (\d+)/)[1])

// Restored by VALUE at the end, the same way the session picker is restored above: the
// options are keyed on the KPI name and labelled with its display name, and the two are
// different strings (SINR / "SS-SINR"), so a label round-trip does not close.
// Addressed by name, not by position. These used to be `.nth(1)` / `.nth(2)`, so adding
// one control to the toolbar silently re-pointed four call sites at the wrong select and
// the run died on "did not find some options" - a failure that says nothing about the
// feature under test.
const kpiPicker = page.locator('.toolbar select[aria-label="KPI"]')
const kpiBefore = await kpiPicker.inputValue()

await page.locator('.leaflet-control-zoom-out').click()
await page.locator('.leaflet-control-zoom-out').click()
await page.waitForTimeout(700)
const zoomed = await routeFrame()
await kpiPicker.selectOption('SINR')
await page.waitForTimeout(1800)
const afterKpi = await routeFrame()
// Two clauses, because "the frame did not move" is also true of a map that stopped
// drawing entirely. The KPI change re-partitions the colour runs, so the path count is an
// independent witness that the route was genuinely redrawn in the frame the user set.
check('지도 프레임이 KPI 변경을 견딤',
  zoomed != null && afterKpi != null
    && Math.abs(afterKpi.w - zoomed.w) < 2 && Math.abs(afterKpi.x - zoomed.x) < 2
    && afterKpi.n !== zoomed.n,
  zoomed && afterKpi
    ? `w ${zoomed.w.toFixed(0)}->${afterKpi.w.toFixed(0)}, paths ${zoomed.n}->${afterKpi.n}`
    : 'no route')

// Stopping the automatic fit removes the only way back to the whole drive, so one is put
// back deliberately. Without this the previous check would be satisfied by a map that can
// never be re-framed at all.
await page.locator('.map').first().click({ position: { x: 5, y: 5 } })
await page.keyboard.press('f')
await page.waitForTimeout(900)
const refit = await routeFrame()
check('F 키가 주행 전체로 다시 맞춤', refit != null && refit.w > zoomed.w * 1.5,
  refit ? `w ${zoomed.w.toFixed(0)} -> ${refit.w.toFixed(0)}` : 'no route')

const seqA = await seqNow()
for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
await page.waitForTimeout(500)
const seqB = await seqNow()
check('화살표 키가 정확히 한 표본씩 움직임', seqB - seqA === 5, `seq ${seqA} -> ${seqB}`)

// The item's actual defect. Playback used to divide the drive into 240 steps whatever its
// length, so on a long drive it advanced dozens of samples a tick and most samples could
// not be reached by playing at all. At the slowest rate the step is now one sample a
// second, so ~2.4 s of playback is a couple of samples - the old loop would be at ~48.
await page.keyboard.press('Home')
await page.waitForTimeout(400)
await page.locator('.statusbar .rate').selectOption('1')
await page.keyboard.press(' ')
await page.waitForTimeout(2400)
await page.keyboard.press(' ')
await page.waitForTimeout(400)
const played = await seqNow()
check('재생이 표본을 건너뛰지 않음', played >= 1 && played <= 6,
  `${played} samples in 2.4 s at 1/s`)

// Keys must not fire while the user is writing. The parameter search is the field they
// are most likely to be in, and `]` would silently narrow every statistic on the page.
await page.locator('.dock .tree-search input').first().fill('thr')
await page.keyboard.press(']')
await page.waitForTimeout(500)
check('타이핑 중에는 단축키가 죽음',
  (await page.locator('.filter-chip').count()) === 0,
  `${await page.locator('.filter-chip').count()} filter chips after ] in a text field`)
await page.locator('.dock .tree-search input').first().fill('')

// Escape has one owner and a written-down order, so the modal wins over the panel behind it.
await page.locator('.legend-row').first().click({ button: 'left' })
await page.locator('button', { hasText: 'Edit scale' }).first().click()
await page.waitForTimeout(700)
const modalUp = await page.locator('.modal').count()
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
check('Esc가 열린 모달을 닫음',
  modalUp === 1 && (await page.locator('.modal').count()) === 0,
  `modal ${modalUp} -> ${await page.locator('.modal').count()}`)

// The sheet is rendered from the same table that binds the keys, so a key it lists is a
// key that works. Checking a listed key BEHAVES is what makes that claim testable - a
// count of rows would pass on a sheet listing keys nobody bound.
await page.keyboard.press('?')
await page.waitForTimeout(500)
const sheetKeys = await page.locator('.key-sheet kbd').allTextContents()
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await page.keyboard.press('End')
await page.waitForTimeout(600)
const atEnd = await seqNow()
const maxOfDrive = Number((await page.locator('.statusbar .dim').first().innerText()).match(/\/ (\d+)/)[1])
check('단축키 시트가 실제로 동작하는 키를 적음',
  sheetKeys.includes('End') && atEnd === maxOfDrive,
  `sheet lists ${sheetKeys.length} keys; End -> ${atEnd}/${maxOfDrive}`)

await kpiPicker.selectOption(kpiBefore)
await page.waitForTimeout(1200)

// 3f. colour that answers a question, and colour that says which one.
//
// Isolating a bin MUTES the rest rather than hiding it, so the witness is not "fewer runs
// exist" - it is that the muted colour appears where it did not before while the route
// still spans the same ground. Counting runs alone would pass on a map that had simply
// stopped drawing.
const strokeCensus = () => page.evaluate(() => {
  const paths = [...document.querySelectorAll('.leaflet-overlay-pane path.route-run')]
    .filter((p) => p.getAttribute('d') !== 'M0 0')
  const by = {}
  for (const p of paths) {
    const c = (p.getAttribute('stroke') ?? '').toLowerCase()
    by[c] = (by[c] ?? 0) + 1
  }
  return { total: paths.length, colors: Object.keys(by).length, by }
})

const beforeIso = await strokeCensus()
await page.locator('.dock.right .legend-row').filter({ has: page.locator('.swatch') })
  .nth(1).click()
await page.waitForTimeout(1200)
const afterIso = await strokeCensus()
check('범례 구간을 누르면 그 구간만 강조', 
  (afterIso.by['#c9c9d0'] ?? 0) > 0 && (beforeIso.by['#c9c9d0'] ?? 0) === 0
  && afterIso.total > 0,
  `muted runs ${beforeIso.by['#c9c9d0'] ?? 0} -> ${afterIso.by['#c9c9d0'] ?? 0}`)

// Muting must be a display choice, not a filter: the route still has to cover the same
// ground, or the user has lost the ability to see WHERE the isolated samples are. Both
// frames are measured with the same selector - the first version of this compared an
// isolated frame that counted only the highlighted runs against a full one, and reported
// a difference that was entirely its own.
const isoFrame = await routeFrame()
await page.locator('.legend-note.isolating button').click()
await page.waitForTimeout(1200)
const allFrame = await routeFrame()
check('격리는 숨기기가 아니라 문맥 유지',
  isoFrame != null && allFrame != null && Math.abs(isoFrame.w - allFrame.w) < 3,
  `route spans ${isoFrame?.w.toFixed(0)} isolated, ${allFrame?.w.toFixed(0)} whole`)

// The Layers dock must describe the MAP, not a record of what was switched on. Its rows
// are derived from the same object spread into RouteMap, so the witness is that the count
// it prints matches what is actually drawn: turn the route into tiles and the dock has to
// stop saying "Route" and start saying "Area bins" with the tile count.
const layerRow = (name) => page
  .locator('.dock-section:has(h3:text-matches("^Layers")) .map-layer')
  .filter({ hasText: name })
// Compared against the map's OWN sample count, not merely "greater than zero": a dock
// that printed a constant would satisfy a positivity test while describing nothing.
const routeRow = await layerRow('Route').innerText().catch(() => '')
const dockCount = Number(routeRow.replace(/\D/g, ''))
const mapMeta = await page.locator('.map-panel header .meta').innerText()
const mapCount = Number((mapMeta.match(/(\d+)\s+samples/) ?? [])[1])
check('Layers 도크가 지도가 그린 것과 같은 수를 셈',
  /Route/.test(routeRow) && mapCount > 0 && dockCount === mapCount,
  `dock ${dockCount} vs map ${mapCount} samples`)

// Switching a layer off must take it off the map AND leave its row, unticked - a control
// that deletes itself when used has one usable state.
const eventsBefore = await page.locator('.event-marker').count()
await layerRow('Events').locator('input[type=checkbox]').click()
await page.waitForTimeout(1200)
const eventsAfter = await page.locator('.event-marker').count()
const eventsRowStill = await layerRow('Events').count()
const eventsTicked = await layerRow('Events').locator('input:checked').count()
check('레이어를 끄면 지도에서 사라지고 행은 남음',
  eventsBefore > 0 && eventsAfter === 0 && eventsRowStill === 1 && eventsTicked === 0,
  `${eventsBefore} -> ${eventsAfter} marks, row ${eventsRowStill}, ticked ${eventsTicked}`)
await layerRow('Events').locator('input[type=checkbox]').click()
await page.waitForTimeout(1200)

// ------------------------------------------- colour set types (P3-3)
//
// The reference distinguishes a NUMERICAL colour set - one colour per value band - from a
// GRADIENT, which interpolates between them, and we only drew the first. For a field that
// really is smooth, bands quantise away the shape the map is being read for: a street
// fading from -85 to -95 dBm is one flat colour and then a step.
//
// The witness is deliberately two-sided. Many distinct strokes alone would also be
// produced by a map that had lost its scale entirely, so the check also requires the
// LEGEND to be unchanged - a gradient built from the bands must not move the bands.
const legendText = () => page.locator('.dock.right .legend-row').allTextContents()
const bandedCensus = await strokeCensus()
const bandedLegend = await legendText()

await page.locator('.legend-row').first().click({ button: 'left' })
await page.locator('button', { hasText: 'Edit scale' }).first().click()
await page.waitForTimeout(800)
await page.locator('.modal select[aria-label="Scale type"]').selectOption('GRADIENT')
await page.locator('.modal button', { hasText: /^Save$/ }).click()
await page.waitForTimeout(2600)
const rampCensus = await strokeCensus()
const rampLegend = await legendText()
check('그라디언트 색상 집합이 구간 사이를 보간',
  rampCensus.colors > bandedCensus.colors * 3 && rampCensus.total > 0
  && JSON.stringify(rampLegend) === JSON.stringify(bandedLegend),
  `${bandedCensus.colors} -> ${rampCensus.colors} distinct strokes, legend `
  + `${JSON.stringify(rampLegend) === JSON.stringify(bandedLegend) ? 'unchanged' : 'MOVED'}`)

await page.locator('.legend-row').first().click({ button: 'left' })
await page.locator('button', { hasText: 'Edit scale' }).first().click()
await page.waitForTimeout(800)
await page.locator('.modal select[aria-label="Scale type"]').selectOption('NUMERICAL')
await page.locator('.modal button', { hasText: /^Save$/ }).click()
await page.waitForTimeout(2600)
check('구간으로 되돌리면 다시 구간 색',
  (await strokeCensus()).colors === bandedCensus.colors,
  `${(await strokeCensus()).colors} distinct strokes, was ${bandedCensus.colors}`)

// The string colour set: one colour per event NAME. The claim that makes it worth having
// is that ONE registry feeds the map marker, the chart tick and the dock, so the witness
// is two surfaces moving together - a colour that only changed on the panel it was set in
// would be a preference, not a colour set.
// The type recoloured is one that is ACTUALLY on this map, read off the markers rather
// than assumed: the registry lists types this drive may not contain, and recolouring one
// of those would leave the map unchanged for an honest reason and fail for a dishonest
// one.
const dotColours = () => page.locator('.event-marker .ev-dot')
  .evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).color))])
const drawnGlyphs = await page.locator('.event-marker .ev-dot')
  .evaluateAll((els) => [...new Set(els.map((e) => e.textContent.trim()))])
const registry = await (await page.request.get(`${API_BASE}/api/event-types`)).json()
const victim = registry.find((t) => t.symbol === drawnGlyphs[0])
// The override is stored, so a fixed target colour would already be in place on a second
// run and the "before" half of the witness would be vacuous. The probe colour is derived
// from the current one instead, and put back at the end.
const PROBE_COLOUR = victim?.color === '#123456' ? '#654321' : '#123456'
const probeRgb = new RegExp(
  PROBE_COLOUR.slice(1).match(/../g).map((h) => parseInt(h, 16)).join(',\\s*'))
const coloursBefore = await dotColours()

await page.locator('.dock-section:has(h3:text-matches("^Events")) button[aria-label="Edit event colours"]')
  .click()
await page.waitForTimeout(500)
const wellRow = page.locator('.event-colours tbody tr')
  .filter({ has: page.locator('.ev-symbol', { hasText: drawnGlyphs[0] }) }).first()
await wellRow.locator('input[type=color]').fill(PROBE_COLOUR)
await page.waitForTimeout(1800)
const coloursAfter = await dotColours()
const dockSymbolColour = await wellRow.locator('.ev-symbol')
  .evaluate((el) => getComputedStyle(el).color)
check('이벤트 색을 바꾸면 지도와 도크가 함께 바뀜',
  Boolean(victim)
  && coloursAfter.some((c) => probeRgb.test(c))
  && !coloursBefore.some((c) => probeRgb.test(c))
  && probeRgb.test(dockSymbolColour),
  `${victim?.displayName}: map ${coloursBefore.join(' ')} -> ${coloursAfter.join(' ')}, `
  + `dock ${dockSymbolColour}`)

// It is stored, not held in the page - the registry is fetched once per load, so a colour
// that did not survive a reload would be a preference on one screen rather than a colour
// set the tool has.
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
check('바뀐 이벤트 색이 저장됨',
  (await dotColours()).some((c) => probeRgb.test(c)), (await dotColours()).join(' '))

// Put the seeded colour back, so a second run starts where the first did.
await page.request.put(`${API_BASE}/api/event-types/${victim.name}/color`,
  { data: { color: victim.color } })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2800)

// The legend may only OFFER isolation where something honours it. The dock renders on
// every tab, so before this the band was clickable on all fourteen and the notice claimed
// "the rest is drawn grey" over screens with no route on them.
//
// Asserted on the cursor rather than on the notice: the notice is absent when nothing is
// isolated, which would make an "is the notice gone" check pass on a screen where the
// control still works. The pointer is present exactly when the click is wired.
const isoCursorOn = async () => page
  .locator('.dock.right .legend-row').filter({ has: page.locator('.swatch') })
  .nth(1).evaluate((el) => getComputedStyle(el).cursor)

await page.locator('.workbook-tabs button', { hasText: 'Overview' }).click()
await page.waitForTimeout(900)
const cursorWithMap = await isoCursorOn()
await page.locator('.workbook-tabs button', { hasText: 'Statistics' }).click()
await page.waitForTimeout(900)
const cursorNoMap = await isoCursorOn()
check('격리는 그것을 반영하는 화면에서만 제안됨',
  cursorWithMap === 'pointer' && cursorNoMap !== 'pointer',
  `overview ${cursorWithMap}, statistics ${cursorNoMap}`)

// And the bars on the Cells page paint from the same scale, so they honour it too - the
// legend now tells the truth there rather than the control being withdrawn.
await page.locator('.workbook-tabs button', { hasText: 'Cells' }).click()
await page.waitForTimeout(1400)
const barFill = () => page.locator('.panel svg rect[fill]').evaluateAll(
  (rs) => rs.filter((r) => (r.getAttribute('fill') ?? '').toLowerCase() === '#c9c9d0').length)
const barsBefore = await barFill()
await page.locator('.dock.right .legend-row').filter({ has: page.locator('.swatch') })
  .nth(1).click()
await page.waitForTimeout(1200)
const barsAfter = await barFill()
check('셀 막대도 범례 격리를 반영',
  barsBefore === 0 && barsAfter > 0, `muted bars ${barsBefore} -> ${barsAfter}`)
await page.locator('.legend-note.isolating button').click()
await page.waitForTimeout(800)
await page.locator('.workbook-tabs button', { hasText: 'Overview' }).click()
await page.waitForTimeout(900)

// Identity colouring. The witness is the SERVING CELL count from the API, not the number
// of colours drawn - a palette bug that gave every cell the same colour would still draw
// "some colours".
await page.locator('.toolbar select[aria-label="Colour by"]').selectOption('pci')
await page.waitForTimeout(1800)
const pciCensus = await strokeCensus()
const bd = await (await page.request.get(
  `${API_BASE}/api/sessions/${await sessionPicker.inputValue()}/neighbour-breakdown`)).json()
// The API's own count of cells that actually served, so a palette bug that painted every
// cell the same colour, or one that invented colours for cells that never served, both
// fail here. Counting "how many colours are on the map" alone would pass on either.
const servingCells = bd.bars.filter((b) => b.samplesServing > 0).length
check('서빙 셀별로 경로선이 나뉨',
  pciCensus.colors === servingCells && servingCells > 1,
  `${pciCensus.colors} route colours, ${servingCells} cells served in this drive`)

const pciLegend = await page.locator('.dock.right .legend-row .label').allInnerTexts()
check('PCI 범례가 서빙 셀을 나열',
  pciLegend.filter((t) => /^PCI \d+$/.test(t)).length === servingCells,
  `${pciLegend.filter((t) => /^PCI \d+$/.test(t)).length} PCI rows`)

// Identity is not a verdict, and the colours are per-drive. Saying so is the same debt
// the derived KPI scale already pays for its quartiles.
check('정체성 색임을 명시',
  /no pass\/fail implied/.test(await page.locator('.dock.right .legend-note').first().innerText()))

await page.locator('.toolbar select[aria-label="Colour by"]').selectOption('kpi')
await page.waitForTimeout(1500)

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

// 16. network-side KPIs are present alongside UE-side ones
await page.locator('.mode-tabs button', { hasText: 'Analysis' }).click()
await page.waitForTimeout(700)
const treeText = await page.locator('.dock .tree').innerText()
check('네트워크(DU) 측 KPI 노출', /Network Side/.test(treeText) && /PRB utilisation/.test(treeText))

// 17. area binning replaces the raw route with tiles
const segBefore = await page.locator('path.leaflet-interactive').count()
await page.locator('.toolbar select[aria-label="Area bins"]').selectOption('150')
await page.waitForTimeout(1600)
const rects = await page.locator('.leaflet-overlay-pane path').count()
const mapTitle = await page.locator('.panel > header .title').first().innerText()
check('영역 비닝(area binning) 렌더링', /area bins/.test(mapTitle) && rects > 0,
  `${segBefore} segments -> ${rects} shapes, title="${mapTitle}"`)
await page.screenshot({ path: `${OUT}/09-area-bins.png` })
await page.locator('.toolbar select[aria-label="Area bins"]').selectOption('0')
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
// Joined across every .panels row rather than read from "the" one: the import screen
// grew a second row when the KPI Workbench landed there, and a locator that assumes a
// single match fails on the page being correct rather than on it being wrong.
const importText = (await page.locator('.panels').allInnerTexts()).join('\n')
check('CSV 임포트 화면', /Recognised KPI columns/.test(importText) && /RSRP/.test(importText))
await page.screenshot({ path: `${OUT}/12-import.png` })

// 23-25. fronthaul injection scenario: a transport fault the radio view cannot see
await page.locator('.mode-tabs button', { hasText: 'Analysis' }).click()
await page.waitForTimeout(600)
const sessionOpts = await page.locator('.toolbar select[aria-label="Measurement"]').locator('option').allInnerTexts()
const fh = sessionOpts.find((o) => /fronthaul/i.test(o))
check('프론트홀 주입 세션 존재', Boolean(fh), fh ?? 'not found')
if (fh) {
  await page.locator('.toolbar select[aria-label="Measurement"]').selectOption({ label: fh })
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

  // The radio side stays healthy through the same window - which is the whole point of
  // this scenario, and which the check did not test. `/RSRP/.test(grid)` matched the ROW
  // LABEL, present at every cursor position on every drive, so the assertion was true
  // independently of the radio being healthy, of the fault window, and of the drive.
  await page.locator('.panel table.grid tbody tr').first().click()
  await page.waitForTimeout(1200)
  const grid = await page.locator('.dock.right table.grid').first().innerText()
  const radioRsrp = Number(grid.match(/RSRP[^\n]*?(-?\d+(?:\.\d+)?)/)?.[1] ?? NaN)
  check('프론트홀 결함 구간에서도 무선은 멀쩡함',
    Number.isFinite(radioRsrp) && radioRsrp > -100,
    `RSRP ${Number.isFinite(radioRsrp) ? radioRsrp : 'not found'} dBm`)
}

// 26. L3 message log follows the cursor and expands
await page.locator('.toolbar select[aria-label="Measurement"]').selectOption({ index: 0 })
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

// 27c. problem survey: aggregate by cause, drill to cases, drill to the moment. The
//      reference's survey is that chain, and we had none of it.
await page.locator('.workbook-tabs button', { hasText: 'Problem Survey' }).click()
await page.waitForSelector('.panel:has-text("Problem survey per category") svg path')
const slices = await page.locator('.panel:has-text("Problem survey per category") svg path').count()
check('원인별 파이 차트', slices >= 3, `${slices} slices`)
const shareTexts = await page.locator('.panel:has-text("Problem survey per category") tbody tr td:nth-child(2)')
  .allInnerTexts()
const pieSum = shareTexts.reduce((a, t) => a + parseFloat(t), 0)
check('원인 비율 합계 100%', Math.abs(pieSum - 100) < 0.5, `${pieSum.toFixed(1)}%`)
const allCases = await page.locator('.panel:has-text("All cases") tbody tr').count()
// drill into the largest slice; the case list must shrink to that category alone
await page.locator('.panel:has-text("Problem survey per category") tbody tr').first().click()
await page.waitForTimeout(300)
const drilled = await page.locator('.panel table.grid tbody tr').last().isVisible()
const drilledRows = await page.locator('.panel:has-text("cases") tbody tr').count()
check('슬라이스 드릴다운', drilledRows > 0 && drilledRows < allCases && drilled,
  `${allCases} -> ${drilledRows}`)
const cats = await page.locator('.panel:has-text("cases") tbody tr td:first-child').allInnerTexts()
check('드릴다운 후 단일 원인만', new Set(cats).size === 1, [...new Set(cats)].join(','))
// drill to the moment: clicking a case moves the shared cursor
const beforeCur = await page.locator('.statusbar').first().innerText()
await page.locator('.panel:has-text("cases") tbody tr').first().click()
await page.waitForTimeout(900)
const afterCur = await page.locator('.statusbar').first().innerText()
check('사례 → 시각 이동', beforeCur !== afterCur, 'cursor moved')
await page.screenshot({ path: `${OUT}/27-problem-survey.png`, fullPage: true })

// 27d. the printable session report - what a drive test is commissioned to produce.
const report = await page.request.get(`${API_BASE}/api/sessions/1/report.html`)
const reportBody = await report.text()
check('세션 리포트 생성', report.status() === 200
  && /Problem survey/.test(reportBody)
  && /KPI summary/.test(reportBody)
  && /Distribution by colour bin/.test(reportBody),
  `${report.status()}, ${reportBody.length} bytes`)
check('리포트가 실제 수치를 담음',
  /<td class="num">\d/.test(reportBody) && !/NaN|undefined|null<\/td>/.test(reportBody))

// 27e. derived KPI - the honest subset of the reference's KPI Workbench. A formula over
//      existing KPIs, materialised so it behaves like any measured KPI downstream.
await page.getByRole('button', { name: 'Import' }).click()
await page.waitForSelector('.panel:has-text("Derived KPIs")')
const DKPI = 'VERIFY_DL_PER_PRB'
// The checker must be re-runnable: a KPI left behind by an earlier run would make the
// create fail with "already exists" and report a defect that is not one.
await page.request.delete(`${API_BASE}/api/kpi-definitions/${DKPI}`)
await page.locator('.panel:has-text("Derived KPIs") input').nth(0).fill(DKPI)
await page.locator('.panel:has-text("Derived KPIs") input').nth(2).fill('Mbps/%')
await page.locator('input[placeholder*="MAC_DL_THROUGHPUT"]')
  .fill('MAC_DL_THROUGHPUT / DU_PRB_UTILISATION')
await page.locator('.panel:has-text("Derived KPIs") button', { hasText: 'Create and compute' })
  .click()
await page.waitForTimeout(2500)
const derivedMsg = await page.locator('.panel:has-text("Derived KPIs")').innerText()
check('파생 KPI 생성', /values from/.test(derivedMsg), derivedMsg.split('\n').slice(-2)[0])

// a formula the parser must refuse - nothing but arithmetic over known KPIs is expressible
await page.locator('.panel:has-text("Derived KPIs") input').nth(0).fill('VERIFY_BAD')
await page.locator('input[placeholder*="MAC_DL_THROUGHPUT"]').fill('(SELECT 1)')
await page.locator('.panel:has-text("Derived KPIs") button', { hasText: 'Create and compute' })
  .click()
await page.waitForTimeout(1200)
const badMsg = await page.locator('.panel:has-text("Derived KPIs") .error').innerText()
check('잘못된 수식 거부', /Unknown KPI/.test(badMsg), badMsg)

// the derived KPI must be a first-class KPI everywhere: it appears in the tree and paints
await page.getByRole('button', { name: 'Analysis' }).click()
await page.waitForSelector('.tree .kpi')
await page.locator('.tree-search input').fill(DKPI)
await page.waitForTimeout(400)
const derivedInTree = await page.locator('.tree .kpi').count()
check('파생 KPI가 파라미터 트리에 등장', derivedInTree === 1, `${derivedInTree}`)
await page.locator('.tree .kpi').first().click()
// The map only exists on a workbook page that has one; an earlier check left a
// different tab active, which is why this counted zero rather than failing to paint.
await page.locator('.workbook-tabs button', { hasText: 'Overview' }).click()
await page.waitForTimeout(2000)
const segs = await page.locator('path.leaflet-interactive').count()
check('파생 KPI가 지도를 칠함', segs > 100, `${segs} segments`)
await page.locator('.tree-search input').fill('')
// leave the catalogue as it was found
await page.request.delete(`${API_BASE}/api/kpi-definitions/${DKPI}`)

// 27f. field-to-lab conversion - the step the whole virtual drive test rests on.
await page.locator('.workbook-tabs button', { hasText: 'Field-to-Lab' }).click()
await page.waitForSelector('.panel:has-text("Extracted channel model")')
const f2lCarriers = await page.locator('.panel:has-text("Detected carriers") tbody tr').count()
check('검출 캐리어 표', f2lCarriers >= 1, `${f2lCarriers} carriers`)
const f2lText = await page.locator('.panel:has-text("Extracted channel model")').innerText()
check('도플러가 반송파에서 유도됨', /\d+ Hz/.test(f2lText) && /3\d{3}\.\d+ MHz/.test(f2lText),
  (f2lText.match(/\d+ Hz/) ?? [''])[0] + ' @ ' + (f2lText.match(/3\d{3}\.\d+ MHz/) ?? [''])[0])
check('추정과 측정을 구분해 표기', /Suggestion, not a measurement/.test(f2lText))
// distance and speed must agree: the seed used to generate speed independently of the
// route, so a 4.4 km loop driven in 20 minutes reported 28 km/h.
const logText = await page.locator('.panel:has-text("Field log")').innerText()
const km = Number((logText.match(/([\d.]+) km/) ?? [])[1])
const mins = Number((logText.match(/(\d+) min/) ?? [])[1])
const avg = Number((logText.match(/([\d.]+) km\/h/) ?? [])[1])
check('거리와 속도가 서로 일치', Math.abs(km / (mins / 60) - avg) < 1.5,
  `${km} km / ${mins} min implies ${(km / (mins / 60)).toFixed(1)}, recorded ${avg}`)
await page.screenshot({ path: `${OUT}/30-field-to-lab.png`, fullPage: true })

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
// per-cell status strip: the reference keeps one on screen permanently, because a
// cell's state is a condition rather than an event in a sequence.
const cellCards = await page.locator('.cell-card').count()
check('셀 상태 스트립', cellCards >= 3, `${cellCards} cells`)
const states = await page.locator('.cell-state').allInnerTexts()
check('셀별 CONNECTED/OFF 상태', states.includes('CONNECTED') && states.includes('OFF'),
  states.join(','))
// Duration must measure the run, not the wall clock since the data was seeded. It was
// read from test_run.ended_at, which evaluate() re-stamps, giving a 54-hour "duration"
// for a three-minute bring-up; it now comes from the step timeline.
const durText = String(await page.locator('.gauge:has-text("Duration") svg text')
  .evaluate((t) => t.textContent))
const durMin = Number(durText.split(':')[0])
check('실행 시간이 브링업 시간과 일치', Number.isFinite(durMin) && durMin < 60, durText)

const gaugeLabels = await page.locator('.gauge-label').allInnerTexts()
check('실행 게이지 3종', gaugeLabels.length === 3, gaugeLabels.join(','))
// SVG <text> is not an HTMLElement, so innerText throws on it; read textContent.
// The invariant, which holds whether or not this run has been evaluated yet: the gauge
// reads n/a exactly when the note says the run is unevaluated, and otherwise matches the
// criteria it claims to summarise. An earlier check evaluates this run, so asserting a
// fixed value here would only be asserting the order of the checks.
const passGauge = String(await page.locator('.gauge:has-text("Pass rate") svg text')
  .evaluate((t) => t.textContent))
const passNote = await page.locator('.gauge-note').innerText()
const m = passNote.match(/(\d+) of (\d+) acceptance criteria passed/)
const consistent = m
  ? passGauge === `${Math.round((100 * Number(m[1])) / Number(m[2]))} %`
  : passGauge === 'n/a' && /Not evaluated yet/.test(passNote)
check('합격률 게이지가 판정 근거와 일치', consistent, `${passGauge} | ${passNote}`)

const rachRows = await page.locator('.panel:has-text("5G NR RACH metrics") tbody tr').count()
check('RACH 지표 패널', rachRows >= 15, `${rachRows} rows`)
const cellCells = await page.locator('.panel:has-text("Serving cell") tbody td').allInnerTexts()
check('서빙 셀 식별 (PCI 외 band/ARFCN/GSCN)',
  cellCells.length === 6 && cellCells.some((c) => /^\d{6}$/.test(c)), cellCells.join(' | '))
await page.screenshot({ path: `${OUT}/25-lab-bringup.png`, fullPage: true })

// ---------------------------------------------------------------- monitored set
// The measurement V7 added, and the four screens that were blocked without it.
await page.locator('.mode-tabs button', { hasText: 'Analysis' }).click()
await page.waitForTimeout(800)
// Explicitly the baseline city run, because it is the session that drives through the
// underpass. Selecting whatever happens to be first picked the lab replay, which has no
// deep fade - so the coverage-hole check below was asserting against data that could not
// exhibit the defect it exists to catch, and passed for that reason rather than on merit.
const msOpts = await page.locator('.toolbar select[aria-label="Measurement"]').locator('option').allInnerTexts()
const fadeSession = msOpts.find((o) => /1\.4\.2/.test(o))
check('깊은 페이드 구간이 있는 세션 확보', Boolean(fadeSession), fadeSession ?? 'not found')
await page.locator('.toolbar select[aria-label="Measurement"]').selectOption({ label: fadeSession })
await page.waitForTimeout(2000)

// The dock the reference keeps permanently on screen.
const msDock = page.locator('.dock.right .dock-section')
  .filter({ has: page.locator('h3:text-is("Monitored Set")') })
const msRows = await msDock.locator('tbody tr').count()
check('모니터드 셋 도크', msRows >= 3, `${msRows} cells`)

// Exactly one row is the serving cell, and it is the first. Asserting only "a row is
// marked" would pass on a table that marked every row, or none.
const msMarks = await msDock.locator('tbody tr td:nth-child(2)').allInnerTexts()
const servingAt = msMarks.map((t, i) => (/•/.test(t) ? i : -1)).filter((i) => i >= 0)
check('서빙 셀이 정확히 하나, 맨 위',
  servingAt.length === 1 && servingAt[0] === 0, `marked rows: [${servingAt}]`)

// The dock must agree with the serving RSRP the Numerical Data panel reports. Two panels
// reading the same instant that disagree is the failure this guards.
const numData = await page.locator('.dock.right table.grid').first().innerText()
const servingRsrpCell = (await msDock.locator('tbody tr').first()
  .locator('td').nth(2).innerText()).trim()
// The needle has to look like a measurement first. `''.includes` is true of everything, so
// an empty dock cell - or one rendering '-' - made this assert agreement between a panel and
// nothing. Numeric shape rather than mere non-emptiness, for the same reason.
check('도크 서빙 RSRP가 수치 패널과 일치',
  /-?\d/.test(servingRsrpCell) && numData.includes(servingRsrpCell),
  `dock "${servingRsrpCell}"`)

await page.locator('.workbook-tabs button', { hasText: 'Monitored Set' }).click()
await page.waitForTimeout(2000)
const msBars = await page.locator('svg[aria-label="Monitored set at the cursor"] rect').count()
check('모니터드 셋 막대 차트', msBars >= 3, `${msBars} bars`)

// The bars and the dock read the same instant, so they must report the same numbers.
// An earlier version of this check only asserted that the bar tooltips CHANGED when the
// cursor moved, which a chart showing wrong-but-varying values still satisfies - PCI and
// RSRQ vary on their own. Comparing the two panels is the invariant that actually holds.
const barLevels = async () =>
  (await page.locator('svg[aria-label="Monitored set at the cursor"] title').allTextContents())
    .map((t) => (/RSRP (-?[\d.]+) dBm/.exec(t) ?? [])[1])
    .filter(Boolean)
const dockLevels = async () =>
  (await page.locator('.dock.right .dock-section')
    .filter({ has: page.locator('h3:text-is("Monitored Set")') })
    .locator('tbody tr td:nth-child(3)').allInnerTexts()).map((t) => t.trim())

const bars1 = await barLevels()
const dock1 = await dockLevels()
check('막대와 도크가 같은 값을 보고',
  bars1.length > 0 && JSON.stringify([...bars1].sort()) === JSON.stringify([...dock1].sort()),
  `bars ${bars1.join(',')} vs dock ${dock1.join(',')}`)

// And both must move together when the cursor does.
await page.evaluate(() => {
  const el = document.querySelector('.progress')
  const r = el.getBoundingClientRect()
  el.dispatchEvent(new MouseEvent('mousedown',
    { clientX: r.left + r.width * 0.75, clientY: r.top + r.height / 2, bubbles: true }))
})
await page.waitForTimeout(1800)
const bars2 = await barLevels()
const dock2 = await dockLevels()
check('막대가 시간 커서를 따라감',
  JSON.stringify(bars1) !== JSON.stringify(bars2)
  && JSON.stringify([...bars2].sort()) === JSON.stringify([...dock2].sort()),
  `${bars1.join(',')} -> ${bars2.join(',')}`)

const nbrRows = await page.locator('.panel:has(.title:text-is("Across the whole drive")) tbody tr')
  .count()
check('드라이브 전체 셀 검출 표', nbrRows >= 3, `${nbrRows} cells`)

// Pilot pollution must not fire on a coverage hole: every reported stretch needs a
// usable best cell. This is the specific defect that was found by reading the screen.
const pollBest = await page
  .locator('.panel:has(.title:text-is("Pilot pollution")) tbody tr td:nth-child(4)')
  .allInnerTexts()
// Non-empty first: `.every()` is true of an empty list, so the original form of this check
// passed both when every stretch had a usable best cell and when the detector had gone
// silent. Those are opposite outcomes and only one of them is the feature working.
check('파일럿 오염 구간이 실제로 보고됨', pollBest.length > 0, `${pollBest.length} stretches`)
check('파일럿 오염이 커버리지 홀을 오탐하지 않음',
  pollBest.length > 0 && pollBest.every((v) => Number(v) >= -110),
  pollBest.length ? `best RSRP: ${pollBest.join(', ')}` : 'no stretches')
await page.screenshot({ path: `${OUT}/26-monitored-set.png`, fullPage: true })

// Lines from the terminal to the cells it can see - the pilot-pollution picture on the map.
await page.locator('.workbook-tabs button', { hasText: 'Mobility' }).click()
await page.waitForTimeout(2500)
// By class, not by dash pattern: the rejected-fix break polyline also carried
// dashArray '2 4', so this selector was counting two unrelated things and would have
// been satisfied by breaks alone.
const nbrLines = await page.locator('.leaflet-overlay-pane path.neighbour-line').count()
check('지도에 모니터드 셀 연결선', nbrLines >= 2, `${nbrLines} lines`)

// ---------------------------------------------------------------- KPI Workbench
await page.locator('.mode-tabs button', { hasText: 'Import' }).click()
await page.waitForSelector('svg[aria-label="KPI graph canvas"]', { timeout: 10000 })
await page.waitForTimeout(600)

await page.locator('button', { hasText: '+ KPI source' }).click()
await page.locator('button', { hasText: '+ Output' }).click()
await page.waitForTimeout(600)
const wbCanvas = page.locator('svg[aria-label="KPI graph canvas"]')
check('워크벤치 캔버스에 노드 배치', await wbCanvas.locator('g rect').count() === 2)

// An unwired graph must SAY why it is invalid rather than failing silently at save.
const wbReport = () => page.locator('.panel:has(.title:text-is("KPI Workbench")) > div')
  .last().innerText()
const unwired = await wbReport()
check('미연결 그래프가 이유를 표시', /takes 1 input/.test(unwired), unwired.trim().slice(0, 60))

// Wire them by dragging port to port, the way a user does.
// Scrolled into view first: sources sit on the top row and the output four rows down, so
// on this viewport the output starts below the fold and a mouse drag to its coordinates
// would land on whatever is there instead.
await wbCanvas.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
const wbSrc = await wbCanvas.locator('g').nth(0).locator('rect').boundingBox()
const wbOut = await wbCanvas.locator('g').nth(1).locator('rect').boundingBox()
await page.mouse.move(wbSrc.x + wbSrc.width / 2, wbSrc.y + wbSrc.height)
await page.mouse.down()
await page.mouse.move(wbOut.x + wbOut.width / 2, wbOut.y, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(1200)
check('포트 드래그로 노드 연결', await wbCanvas.locator('path[marker-end]').count() === 1)
const wired = await wbReport()
check('연결된 그래프가 유효 판정', /^Valid\./.test(wired.trim()), wired.trim().slice(0, 70))

// Sources sit above the output: the reference's graphs read top-down, and a layout that
// did not would make an edge double back on itself.
const wbPos = await wbCanvas.locator('g[transform]').evaluateAll((gs) => gs.map((g) => {
  const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g.getAttribute('transform'))
  return { y: Number(m[2]), label: g.querySelector('text')?.textContent }
}))
const srcNode = wbPos.find((n) => /source/i.test(n.label ?? ''))
const outNode = wbPos.find((n) => n.label === 'Output')
check('그래프가 위에서 아래로 흐름', srcNode.y < outNode.y, `${srcNode.y} < ${outNode.y}`)
await page.screenshot({ path: `${OUT}/27-kpi-workbench.png`, fullPage: true })

// ------------------------------------------------- distance bins / footprints
await page.locator('.mode-tabs button', { hasText: 'Analysis' }).click()
await page.waitForTimeout(800)
await page.locator('.toolbar select[aria-label="Measurement"]').selectOption({ label: fadeSession })
await page.locator('.workbook-tabs button', { hasText: 'Overview' }).click()
await page.waitForTimeout(1200)
// Sets its own KPI rather than inheriting whatever an earlier check left selected. The
// fronthaul section selects a CUS counter, and this session carries none - so the profile
// correctly showed zero bins and the check failed on its own setup, not on the feature.
await page.locator('.tree .kpi', { hasText: 'RSRP (NR SpCell)' }).click()
await page.waitForTimeout(1800)

await page.selectOption('.toolbar .group:has(label:text-is("Distance bins")) select', '100')
await page.waitForTimeout(2000)
const distBars = await page.locator('.panel:has(.title:text-matches("Distance profile")) svg rect')
  .count()
check('거리 구간 프로파일', distBars >= 10, `${distBars} bins`)

// The bins must cover the route the field-to-lab screen measured. A profile that stopped
// short would be averaging over a drive it had silently truncated.
const distMeta = await page.locator('.panel:has(.title:text-matches("Distance profile")) .meta')
  .innerText()
const profileKm = Number((distMeta.match(/([\d.]+) km/) ?? [])[1])
const f2l = await (await page.request.get(`${API_BASE}/api/sessions/1/field-to-lab`)).json()
check('거리 축이 실제 주행거리와 일치',
  Math.abs(profileKm - f2l.route.distanceKm) < 0.15,
  `profile ${profileKm} km vs route ${f2l.route.distanceKm.toFixed(2)} km`)

await page.selectOption('.toolbar .group:has(label:text-is("Distance bins")) select', '0')
await page.waitForTimeout(800)
check('거리 비닝을 끄면 패널이 사라짐',
  await page.locator('.panel:has(.title:text-matches("Distance profile"))').count() === 0)

// A tile's colour comes from a statistic, and until now that statistic was always the
// mean with nothing on screen saying so. Switching to the minimum must repaint AND the
// header must say which - a switch that changed the colours while the caption still read
// "[Average]" would be the same defect the P0 round removed six times.
await page.locator('.toolbar select[aria-label="Area bins"]').selectOption('150')
await page.waitForTimeout(2500)
const tileColours = () => page.locator('.leaflet-overlay-pane path[fill-opacity="0.65"]')
  .evaluateAll((ps) => ps.map((p) => (p.getAttribute('fill') ?? '').toLowerCase()).join(','))
const binTitle = () => page.locator('.map-panel header .title').innerText()
const avgColours = await tileColours()
const avgTitle = await binTitle()
await page.locator('.toolbar select[aria-label="Bin statistic"]').selectOption('MINIMUM')
await page.waitForTimeout(2500)
const minColours = await tileColours()
const minTitle = await binTitle()
check('타일을 칠하는 통계를 고를 수 있음',
  avgColours.length > 0 && minColours.length > 0 && avgColours !== minColours,
  `${avgColours.split(',').length} tiles, colours ${avgColours === minColours ? 'IDENTICAL' : 'differ'}`)
check('그리고 화면이 어느 통계인지 말함',
  /\[Average\]/.test(avgTitle) && /\[Minimum\]/.test(minTitle),
  `"${avgTitle.trim()}"`)
await page.locator('.toolbar select[aria-label="Bin statistic"]').selectOption('AVERAGE')
await page.locator('.toolbar select[aria-label="Area bins"]').selectOption('0')
await page.waitForTimeout(1500)

await page.locator('.toolbar .group:has(label:text-is("Footprints")) button').click()
await page.waitForTimeout(2500)
const polys = await page.locator('.leaflet-overlay-pane path[fill-opacity="0.1"]').count()
check('셀 커버리지 폴리곤', polys >= 3, `${polys} polygons`)
await page.screenshot({ path: `${OUT}/28-footprints.png` })

// Where a cell SERVED and where it was among the three strongest are different shapes,
// and the second is the one that makes overspill visible. The witness is the hulls' total
// area, not the polygon count: both bases return the same cells, so counting them would
// pass whichever rule ran. Area cannot - a cell measured beyond where it won encloses
// more ground.
const hullArea = () => page.locator('.leaflet-overlay-pane path[fill-opacity="0.1"]')
  .evaluateAll((ps) => ps.reduce((sum, p) => {
    const b = p.getBBox(); return sum + b.width * b.height
  }, 0))
const servingArea = await hullArea()
await page.locator('.toolbar select[aria-label="Footprint basis"]').selectOption('TOP3')
await page.waitForTimeout(2500)
const topArea = await hullArea()
check('세 번째로 강했던 곳까지 포함하면 푸트프린트가 넓어짐',
  servingArea > 0 && topArea > servingArea * 1.05,
  `serving ${servingArea.toFixed(0)} -> top3 ${topArea.toFixed(0)}`)
await page.locator('.toolbar select[aria-label="Footprint basis"]').selectOption('SERVING')
await page.waitForTimeout(2000)
await page.locator('.toolbar .group:has(label:text-is("Footprints")) button').click()
await page.waitForTimeout(1200)
check('푸트프린트를 끄면 폴리곤이 사라짐',
  await page.locator('.leaflet-overlay-pane path[fill-opacity="0.1"]').count() === 0)

// ------------------------------------------------------- composed workbooks
//
// Cleared FIRST, not only at the end. The cleanup at the bottom of this block runs only if
// the block finishes, so one crashed run left three workbooks called 'UI check workbook'
// behind and every following run failed '구성한 워크북이 새로고침을 견딤' - a check about
// persistence going red because of the run before it. Worse than a false red: the tab
// selector then matched three buttons and the checks after it drove whichever one Playwright
// picked. A suite whose colour depends on how the last run ended is not reporting on the code.
for (const b of await (await page.request.get(`${API_BASE}/api/workbooks`)).json()) {
  await page.request.delete(`${API_BASE}/api/workbooks/${b.id}`)
}
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)

const tabsBefore = await page.locator('.workbook-tabs button').count()
await page.locator('.workbook-tabs button', { hasText: /^\+$/ }).click()
await page.waitForTimeout(2000)
check('워크북 탭 추가(+)',
  await page.locator('.workbook-tabs button').count() === tabsBefore + 1)

const PROBE = 'UI check workbook'
await page.locator('.panel header input').first().fill(PROBE)
await page.locator('button', { hasText: '+ Chart pane' }).click()
await page.waitForTimeout(800)

const layerSelect = page.locator('.dock-section:has(h3:text-is("Layers")) select').first()
await layerSelect.selectOption({ label: 'RSRP (NR SpCell)' })
await page.waitForTimeout(1500)
await layerSelect.selectOption({ label: 'SS-SINR' })
await page.waitForTimeout(2000)
const traces = await page.locator('svg[aria-label^="Composed pane"] path').count()
check('페인에 여러 KPI를 겹쳐 그림', traces === 2, `${traces} traces`)

// Unticking hides the trace WITHOUT forgetting the layer. Asserting both halves: a
// checkbox that removed the layer would also have dropped the trace count.
await page.locator('.dock-section:has(h3:text-is("Layers")) input[type=checkbox]').first()
  .click()
await page.waitForTimeout(1200)
const tracesAfter = await page.locator('svg[aria-label^="Composed pane"] path').count()
const layersAfter = await page.locator('.dock-section:has(h3:text-is("Layers")) input[type=checkbox]')
  .count()
check('레이어 체크 해제는 숨기기이지 삭제가 아님',
  tracesAfter === 1 && layersAfter === 2, `${tracesAfter} traces, ${layersAfter} layers`)

await page.locator('button', { hasText: /^Save$/ }).click()
await page.waitForTimeout(2000)
await page.screenshot({ path: `${OUT}/29-composed-workbook.png`, fullPage: true })

// Server-side, so it must survive a reload - that is the whole reason it is not in
// localStorage.
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
check('구성한 워크북이 새로고침을 견딤',
  await page.locator(`.workbook-tabs button:text-is("${PROBE}")`).count() === 1)

// The name surviving proves only that a row was written. What the user actually composed
// is the panes and their layers, so those are what this has to look for - a save that
// stored the workbook and silently dropped every pane still passed the name check.
await page.locator('.workbook-tabs button', { hasText: PROBE }).click()
await page.waitForTimeout(2000)
const panesBack = await page.locator('.dock-section:has(h3:text-is("Layers"))').count()
const layersBack = await page.locator('.dock-section:has(h3:text-is("Layers")) input[type=checkbox]')
  .count()
const hiddenBack = await page.locator('.dock-section:has(h3:text-is("Layers")) input[type=checkbox]:not(:checked)')
  .count()
check('페인·레이어·표시여부가 함께 살아남음',
  panesBack === 1 && layersBack === 2 && hiddenBack === 1,
  `${panesBack} pane, ${layersBack} layers, ${hiddenBack} hidden`)

// A MAP pane must draw the layer its own dock names. It used to be handed App's track,
// painted for App's globally selected KPI, so the dock said one thing and the map drew
// another - and the caption was written FROM the dock, which made the disagreement
// invisible. The witness is the route's stroke colours: two different KPIs bin the same
// drive differently, so a map that ignored its layer would paint identically for both.
await page.locator('button', { hasText: '+ Map pane' }).click()
await page.waitForTimeout(900)
const mapDock = page.locator('.dock-section:has(h3:text-is("Layers"))').last()
await mapDock.locator('select[aria-label="Add a layer to this pane"]')
  .selectOption({ label: 'RSRP (NR SpCell)' })
await page.waitForTimeout(2500)
// The witness is the ORDER of colours along the route, not the set of them. The first
// version of this check compared distinct-colour sets and failed honestly: every KPI is
// painted from the same four severity colours, so the set is identical whichever KPI the
// map drew, and the check could not have distinguished the fix either way. Where each
// colour falls IS the KPI - the fade that makes RSRP red is not where SINR bottoms out.
const paneStrokes = () => page.locator('.leaflet-overlay-pane path.route-run')
  .evaluateAll((ps) => ps.map((x) => (x.getAttribute('stroke') ?? '').toLowerCase()).join(','))
const strokesRsrp = await paneStrokes()
await mapDock.locator('select[aria-label="Add a layer to this pane"]')
  .selectOption({ label: 'SS-SINR' })
await page.waitForTimeout(2500)
const strokesSinr = await paneStrokes()
check('지도 페인이 자기 레이어를 그림',
  strokesRsrp.length > 0 && strokesSinr.length > 0 && strokesRsrp !== strokesSinr,
  `${strokesRsrp.split(',').length} runs, sequences ${strokesRsrp === strokesSinr ? 'IDENTICAL' : 'differ'}`)

// A map layer may name ANOTHER measurement, which is what makes a workbook a comparison
// rather than a view of one drive. The witness is not the dropdown - a select that
// remembers a value it never acts on looks identical - but the request the pane makes and
// the geometry it then draws.
const otherSession = (await (await page.request.get(`${API_BASE}/api/sessions`)).json())
  .find((x) => x.name.includes('highway'))
const drawnGeometry = () => page.locator('.leaflet-overlay-pane path.route-run')
  .evaluateAll((ps) => ps.map((x) => x.getAttribute('d')).join('|'))
// Aimed at the layer the map is actually DRAWING. A map pane draws one layer at a time,
// so pointing a hidden layer at another drive changes nothing and would fail this check
// for a reason that is not a defect - the first version of it did exactly that.
await mapDock.locator('input[type=checkbox]').first().check()
await page.waitForTimeout(2200)
const geometryBefore = await drawnGeometry()
const trackCalls = []
const recordTrack = (r) => {
  const m = new URL(r.url()).pathname.match(/^\/api\/sessions\/(\d+)\/track$/)
  if (m) trackCalls.push(Number(m[1]))
}
page.on('request', recordTrack)
await mapDock.locator('select[aria-label="Measurement for RSRP"]')
  .selectOption({ label: otherSession.name })
await page.waitForTimeout(2800)
page.off('request', recordTrack)
const geometryAfter = await drawnGeometry()
check('레이어가 다른 측정을 지목하면 그 주행을 가져와 그림',
  trackCalls.includes(otherSession.id) && geometryBefore !== geometryAfter
  && geometryAfter.length > 0,
  `fetched ${[...new Set(trackCalls)].join(',')} (other is ${otherSession.id}), `
  + `geometry ${geometryBefore === geometryAfter ? 'IDENTICAL' : 'changed'}`)

// And it is part of the saved arrangement, not of this session's screen. Stored in
// workbook_layer.session_id by V12 for exactly this: a workbook that reopens onto one
// drive after being composed across two is a different workbook.
await page.locator('button', { hasText: /^Save$/ }).click()
await page.waitForTimeout(2000)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.locator('.workbook-tabs button', { hasText: PROBE }).click()
await page.waitForTimeout(2500)
const savedFor = await page
  .locator('.dock-section:has(h3:text-is("Layers")) select[aria-label="Measurement for RSRP"]')
  .inputValue()
check('레이어가 지목한 측정이 워크북과 함께 저장됨',
  savedFor === String(otherSession.id), `reopened on ${savedFor || 'the open measurement'}`)
// Put it back, so the checks after this one are about the drive they think they are.
await page.locator('.dock-section:has(h3:text-is("Layers")) select[aria-label="Measurement for RSRP"]')
  .selectOption('')
await page.waitForTimeout(2000)

// A map paints one scale, so ticking is exclusive there. Asserted on the checkbox state
// rather than on the drawing: two KPIs could coincidentally bin alike, but only one box
// can be ticked if the rule is applied.
const mapChecked = await mapDock.locator('input[type=checkbox]:checked').count()
const mapTotal = await mapDock.locator('input[type=checkbox]').count()
check('지도 페인은 한 번에 한 레이어',
  mapTotal === 2 && mapChecked === 1, `${mapChecked} of ${mapTotal} ticked`)

// ------------------------------------------- the workbook leaves the tool (2026-09-05)
//
// A workbook export is the first artifact this application builds in the BROWSER, so the
// usual trick - read the anchor's href and trust the server - is gone. These checks take
// the actual download and read what is in it.
//
// The reading rule lives in one function for the same reason `csvParts` does in the
// scenario suite: three call sites each splitting the file their own way is three chances
// to assert against the wrong half of it.
const docParts = (html) => {
  const pre = html.slice(0, html.indexOf('-->'))
  const sections = [...html.matchAll(/<section class="wb-pane"[^>]*>([\s\S]*?)<\/section>/g)]
    .map((m) => m[1])
  return {
    preamble: Object.fromEntries(
      [...pre.matchAll(/^# ([a-z_]+): (.*)$/gm)].map((m) => [m[1], m[2]])),
    sections,
    // Every trace in the document, in order, per pane.
    traces: sections.map((sec) =>
      [...sec.matchAll(/<path class="trace" d="([^"]*)"/g)].map((m) => m[1])),
    runs: sections.map((sec) =>
      [...sec.matchAll(/<path class="route-run"[^>]*stroke="([^"]*)"/g)].map((m) => m[1])),
    factsRows: sections.map((sec) =>
      [...sec.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)]
        .flatMap((m) => [...m[1].matchAll(/<tr>/g)]).length),
  }
}

const takeDownload = async (clickTarget) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), clickTarget.click()])
  const at = await dl.path()
  return { name: dl.suggestedFilename(), text: readFileSync(at, 'utf8') }
}

// The module a checker can import is the point of the whole design: without it "the export
// is the same arithmetic as the screen" is a promise. Node runs the repo's TypeScript with
// no build step from 22.18; on an older Node the import throws, and a probe that could not
// run is a FAILED check rather than a silently skipped one.
let panegeom = null
try {
  panegeom = await import('../frontend/src/view/geom/panegeom.ts')
} catch (e) {
  check('페인 기하 모듈을 Node가 읽음', false, String(e).slice(0, 120))
}

if (panegeom) {
  // The chart pane on screen right now: RSRP hidden, SS-SINR drawn.
  const sid = Number(await page.locator('.toolbar select[aria-label="Measurement"]').inputValue())
  const seriesPayload = await (await page.request.get(
    `${API_BASE}/api/sessions/${sid}/series?kpis=SINR&maxPoints=2000`)).json()
  const cursor = Number(await page.locator('svg[aria-label^="Composed pane"] line')
    .last().getAttribute('x1').catch(() => 0))
  const domDs = await page.locator('svg[aria-label^="Composed pane"] path.trace')
    .evaluateAll((ps) => ps.map((x) => x.getAttribute('d')))
  const geom = panegeom.composeChartPane({
    traces: [{ key: 'SINR', color: '#000', series: seriesPayload[0] }],
    cursorSeq: 0,
  })
  const moduleDs = geom.traces.map((t) => t.d)
  // Character for character. The pane draws in viewBox units, so the string does not
  // depend on how wide the browser rendered it - which is what makes an exact comparison
  // legitimate here and not merely convenient.
  check('화면의 페인이 기하 모듈 그대로를 그림',
    domDs.length === 1 && moduleDs.length === 1 && domDs[0] === moduleDs[0],
    `${domDs.length} on screen, ${moduleDs.length} from the module,`
    + ` ${domDs[0] === moduleDs[0] ? 'identical' : 'DIFFER'} (cursor x1=${cursor})`)
}

// The click-to-cursor mapping is the FORWARD scale inverted, which it was not: the handler
// divided by the full SVG width while the plot is inset by the left pad, so on a
// single-layer pane - where that pad is 44 of 1000 - clicking on a point moved the shared
// cursor about 4.6% of the drive away from it. This check fails on the code that shipped
// before today, which is the strongest form of proving a check can fail.
const paneSvg = page.locator('svg[aria-label^="Composed pane"]').first()
const svgBox = await paneSvg.boundingBox()
await paneSvg.click({ position: { x: svgBox.width / 2, y: svgBox.height / 2 } })
await page.waitForTimeout(900)
const cursorX = Number(await paneSvg.locator('line').last().getAttribute('x1'))
check('페인의 커서 역변환이 정변환과 맞음',
  Math.abs(cursorX - 500) <= 2, `clicked mid-pane, cursor at viewBox x=${cursorX} (want 500)`)

const doc = await takeDownload(
  page.locator('.workbook-export button', { hasText: 'Export document' }))
const parts = docParts(doc.text)

// Exact counts, both sides. '>0' would pass on a document that dropped a pane, which is
// the defect a well-formed file hides best.
const panesOnScreen = await page.locator('.dock-section:has(h3:text-is("Layers"))').count()
// Indexed defensively, because a document that DROPPED a pane is exactly the defect this
// check is aimed at - and `parts.runs[1].length` on a one-section file throws rather than
// returning false. A thrown check aborts the whole run, and the run then reports zero
// failures, which reads precisely like green. Measured: injecting the dropped pane made
// this script exit mid-way with no FAIL line at all.
const at = (rows, i) => rows[i] ?? (typeof rows[0] === 'number' ? -1 : [])
check('문서가 화면의 페인 수와 트레이스를 그대로 실음',
  parts.sections.length === panesOnScreen
  && at(parts.traces, 0).length === 1 && at(parts.runs, 1).length > 0,
  `${parts.sections.length} sections vs ${panesOnScreen} panes,`
  + ` ${at(parts.traces, 0).length} trace, ${at(parts.runs, 1).length} route runs`)

// The document's trace must be the SCREEN's trace, not a redraw that happens to look the
// same. Same string, or the document is a second plotter.
const screenDs = await page.locator('svg[aria-label^="Composed pane"] path.trace')
  .evaluateAll((ps) => ps.map((x) => x.getAttribute('d')))
check('문서의 트레이스가 화면의 트레이스와 문자까지 같음',
  at(parts.traces, 0).length === screenDs.length
  && at(parts.traces, 0).every((d, i) => d === screenDs[i]),
  `${at(parts.traces, 0).length} in file, ${screenDs.length} on screen`)

// A hidden layer is absent from the picture AND named as absent. Both halves: counts alone
// pass on a file that leaked one and dropped another, and a colour ban alone passes on a
// file with no traces at all.
const hiddenName = 'RSRP (NR SpCell)'
const beforeOmitted = doc.text.split('class="omitted"')[0]
check('숨긴 레이어는 그림에 없고, 없다고 적힘',
  !beforeOmitted.includes(hiddenName) && doc.text.includes(`class="omitted"`)
  && doc.text.includes(hiddenName),
  `named in the omitted note: ${doc.text.includes('class="omitted"')}`)

// Every provenance key, in the preamble AND on every pane. A preamble is lost the moment a
// pane is dragged into a deck, which is the same argument ExportScope makes about forty
// rows pasted into a sheet.
const wantKeys = ['format', 'workbook', 'measurement', 'condition', 'generated', 'saved',
  'contains', 'not_included']
const missingKeys = wantKeys.filter((k) => !(k in parts.preamble))
// Two carriers, asserted separately, because they leave by different doors and a section
// containing the words proves neither. The first version searched the whole section for
// 'measurement:' and passed when the <figcaption> was deleted outright - the picture's own
// <desc> carries the same sentence, so the check could not tell which one it had found.
// The caption is for a reader of the document; the desc travels with a picture pulled out
// of it. Losing either is a real loss and only one assertion each can see it.
const carriers = (sec) => ({
  caption: /<figcaption>[^<]*measurement:[^<]*condition:/.test(sec),
  desc: /<desc>[^<]*measurement:[^<]*condition:/.test(sec),
})
const captioned = parts.sections.filter((sec) => carriers(sec).caption).length
const described = parts.sections.filter((sec) => carriers(sec).desc).length
check('출처가 서두와 페인 양쪽에 있음',
  missingKeys.length === 0 && captioned === parts.sections.length
  && described === parts.sections.length,
  `${missingKeys.length ? `missing ${missingKeys.join(',')}` : 'all keys'},`
  + ` ${captioned}/${parts.sections.length} captions, ${described}/${parts.sections.length}`
  + ' picture descriptions')

// It says what it is NOT. The reference's own title for p223 is 'Exporting workbooks as
// PDF/MS Word/MS PowerPoint files', and this file is none of them.
check('파일이 자기가 무엇이 아닌지 적음',
  /PDF/.test(parts.preamble.format) && /none of those/.test(parts.preamble.format),
  parts.preamble.format?.slice(0, 60))

// The tokens, written in. A serialised fragment with no :root resolves var(--cursor) to
// nothing, so the traces are right and the shared time cursor - the workbook's organising
// idea - is silently gone. Nothing visual would catch it.
const varsResolved = (text) => {
  const used = [...text.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1])
  return used.every((v) => new RegExp(`${v}\\s*:`).test(text))
}
check('그림이 자기 색을 안고 나감',
  /--cursor\s*:\s*#[0-9a-f]{6}/i.test(doc.text) && varsResolved(doc.text),
  `${[...doc.text.matchAll(/var\((--[a-z-]+)\)/g)].length} var() uses, all defined:`
  + ` ${varsResolved(doc.text)}`)

// The per-pane picture is half the deliverable, so it is opened and parsed rather than
// regexed: an SVG without xmlns does not render at all, and one with a frame and no traces
// opens blank - the 'plausible empty file' this project refuses PNG over.
const paneFile = await takeDownload(
  page.locator('.workbook-export button', { hasText: 'pane 1' }))
const svgFacts = await page.evaluate((text) => {
  const doc2 = new DOMParser().parseFromString(text, 'image/svg+xml')
  const err = doc2.querySelector('parsererror')
  const root = doc2.documentElement
  return {
    parsed: !err,
    ns: root.getAttribute('xmlns'),
    w: Number(root.getAttribute('width')), h: Number(root.getAttribute('height')),
    traces: [...doc2.querySelectorAll('path.trace')].map((p) => p.getAttribute('d')),
    hasTitle: !!doc2.querySelector('title')?.textContent,
    desc: doc2.querySelector('desc')?.textContent ?? '',
  }
}, paneFile.text)
check('페인 그림이 홀로 열리는 SVG',
  svgFacts.parsed && svgFacts.ns === 'http://www.w3.org/2000/svg'
  && svgFacts.w > 0 && svgFacts.h > 0 && svgFacts.hasTitle
  && /measurement:/.test(svgFacts.desc),
  `parsed=${svgFacts.parsed} ns=${!!svgFacts.ns} ${svgFacts.w}x${svgFacts.h}`
  + ` title=${svgFacts.hasTitle}`)
check('페인 그림과 문서 속 그림이 같은 기하',
  svgFacts.traces.length === at(parts.traces, 0).length
  && svgFacts.traces.every((d, i) => d === at(parts.traces, 0)[i]),
  `${svgFacts.traces.length} in the .svg, ${at(parts.traces, 0).length} in the document`)

// The map picture drops every hover, and the hover is the only place a run's time, value,
// bin and sample count are ever stated. A table row per run is what keeps them.
// The screen's own runs, minus the ones Leaflet clipped to nothing - it writes a literal
// `d="M0 0"` for a polyline entirely outside the padded bounds, which the route checks
// above already work around.
const domRuns = await page.locator('.leaflet-overlay-pane path.route-run')
  .evaluateAll((ps) => ps.filter((x) => (x.getAttribute('d') ?? '').trim() !== 'M0 0').length)
// Three counts, all three load-bearing. `domRuns` was computed here and used ONLY inside
// the failure message: the file was compared against itself and the screen rode along as
// decoration, which is §1.5.1 in the check that was supposed to be about the map.
check('지도 그림이 사실을 조용히 삼키지 않음',
  at(parts.factsRows, 1) === at(parts.runs, 1).length
  && at(parts.runs, 1).length === domRuns && domRuns > 0,
  `${at(parts.factsRows, 1)} table rows, ${at(parts.runs, 1).length} runs in the file,`
  + ` ${domRuns} on screen`)

// The filename carries the workbook id, and the measurement's slug is the SERVER's slug -
// the one rule this design writes in two languages, bound here rather than trusted. A CSV
// of the same drive is named by AnalyticsController.fileName; if Java and TypeScript ever
// disagree about what a measurement is called, this goes red.
const csvHead = await page.request.get(`${API_BASE}/api/sessions/${
  await page.locator('.toolbar select[aria-label="Measurement"]').inputValue()}/export.csv`)
const serverName = /filename="([^"]+)"/.exec(csvHead.headers()['content-disposition'])?.[1] ?? ''
const serverSlug = serverName.replace(/\.csv$/, '')
// The whole name, not a pattern. The workbook id is in it because `+` names every new
// workbook 'New workbook' and `workbook.name` has no unique constraint - so without the id
// two downloads arrive under one filename and the second replaces the first.
const bookNow = (await (await page.request.get(`${API_BASE}/api/workbooks`)).json())
  .find((b) => b.name === PROBE)
const wantName = `${PROBE.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  + `-${bookNow.id}-${serverSlug}.html`
check('문서 이름이 서버의 측정 슬러그와 같은 규칙', doc.name === wantName,
  `document "${doc.name}" vs expected "${wantName}" (server said "${serverName}")`)

// An export control on a screen that cannot export is a promise with nothing behind it -
// the cheap negative half of the same check.
await page.locator('.workbook-tabs button', { hasText: 'Overview' }).click()
await page.waitForTimeout(1200)
const controlsOnBuiltIn = await page.locator('.workbook-export button').count()
await page.locator('.workbook-tabs button', { hasText: PROBE }).click()
await page.waitForTimeout(2000)
const controlsOnWorkbook = await page.locator('.workbook-export button').count()
check('내보내기는 워크북에만 있음',
  controlsOnBuiltIn === 0 && controlsOnWorkbook >= 2,
  `${controlsOnBuiltIn} on a built-in tab, ${controlsOnWorkbook} on the workbook`)

// Exported from an UNSAVED edit, which is the case only a browser-built document can
// answer honestly: the file carries the pane that was added and says it was not saved. A
// server-rendered export would draw the last SAVED arrangement and say nothing.
await page.locator('button', { hasText: '+ Chart pane' }).click()
await page.waitForTimeout(900)
const dirtyDoc = await takeDownload(
  page.locator('.workbook-export button', { hasText: 'Export document' }))
const dirtyParts = docParts(dirtyDoc.text)
const panesNow = await page.locator('.dock-section:has(h3:text-is("Layers"))').count()
check('저장 안 한 편집분도 나가고, 안 했다고 적힘',
  dirtyParts.sections.length === panesNow && /^no\b/.test(dirtyParts.preamble.saved ?? ''),
  `${dirtyParts.sections.length} panes vs ${panesNow} on screen, saved="${dirtyParts.preamble.saved}"`)

// The cap is the server's, so the editor asks for it. A dock that kept its own number
// would keep offering a ninth layer and let the user find the limit by pressing Save.
const limits = await (await page.request.get(`${API_BASE}/api/workbooks/limits`)).json()
const chartDock = page.locator('.dock-section:has(h3:text-is("Layers"))').first()
const named = await page.locator('.dock.right .parameter-tree, body').first().isVisible()
for (let i = 0; i < limits.maxLayersPerPane + 2; i++) {
  const opts = await chartDock.locator('select option').count()
  if (opts <= 1) break
  await chartDock.locator('select').selectOption({ index: 1 }).catch(() => {})
  await page.waitForTimeout(250)
}
const chartLayers = await chartDock.locator('input[type=checkbox]').count()
const addDisabled = await chartDock.locator('select').isDisabled()
check('레이어 상한을 서버에서 받아 UI가 막음',
  chartLayers === limits.maxLayersPerPane && addDisabled,
  `${chartLayers}/${limits.maxLayersPerPane} layers, add disabled ${addDisabled} (named=${named})`)

// Destroying a workbook asks first. Answering no must leave it there - a dialog that
// appeared and deleted anyway would pass a check that only looked for the dialog.
page.once('dialog', (d) => d.dismiss())
await page.locator('button', { hasText: 'Delete workbook' }).click()
await page.waitForTimeout(1200)
check('워크북 삭제는 확인을 받고, 취소하면 남음',
  await page.locator(`.workbook-tabs button:text-is("${PROBE}")`).count() === 1)

// Cleaned up so a second run starts where the first did.
const books = await (await page.request.get(`${API_BASE}/api/workbooks`)).json()
for (const b of books) await page.request.delete(`${API_BASE}/api/workbooks/${b.id}`)
// Read back. The assertion was `books.length >= 1` - that there had been something to
// delete - which is a fact about the state BEFORE the loop and stays true whether or not a
// single DELETE succeeded. A cleanup check that cannot notice a failed cleanup leaves the
// next run starting somewhere else.
const booksLeft = await (await page.request.get(`${API_BASE}/api/workbooks`)).json()
check('체크가 만든 워크북을 정리', books.length >= 1 && booksLeft.length === 0,
  `removed ${books.length}, ${booksLeft.length} left`)

// Filtered HERE, not where it used to be - 533 lines earlier, just after the compare
// screenshot. `errors.filter(...)` copies the array at the call site, so every console
// error raised by the checks in between was invisible to this assertion: the tripwire
// was armed for the first third of the run and disarmed for the rest.
const appErrors = errors.filter((e) => !/tile\.openstreetmap\.org|ERR_CONNECTION|Failed to load resource/.test(e))
check('앱 코드 콘솔 오류 없음', appErrors.length === 0, appErrors.slice(0, 3).join(' | '))
const tileFailures = errors.length - appErrors.length
if (tileFailures > 0) console.log(`  (note: ${tileFailures} basemap tile fetches failed - network egress, not app code)`)

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)

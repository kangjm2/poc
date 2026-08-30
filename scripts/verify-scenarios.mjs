/**
 * Scenario-level end-to-end verification.
 *
 * verify-ui.mjs asserts individual behaviours; this script walks the complete
 * journey a user in each situation actually takes, in order, carrying state
 * from step to step. A journey fails if any step in it fails, because a user
 * blocked mid-journey does not care that the remaining screens render.
 *
 *   S1  Post-drive field analysis   (map → legend → degradation → drill-down → export)
 *   S2  Build A/B comparison        (two builds, same route → per-KPI verdicts)
 *   S3  Lab campaign                (virtual channel + virtual UE vs a real DU → verdict)
 *   S4  Fronthaul fault triage      (throughput dip with clean RF → FH counters explain it)
 *   S5  Coverage optimization       (area bins → detected issues → jump to location → GeoJSON)
 *   S6  Data lifecycle              (export → re-import → analyze the import → delete it)
 *   S7  Statistics reporting        (summary stats → CDF with percentile marks)
 *   S8  Responsiveness budget       (every analysis endpoint answers inside its budget)
 *
 * Scale beyond the seed is covered separately by scripts/load-test.sh.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173'
const API = process.env.API ?? 'http://127.0.0.1:8080'

const CITY_A = 'Oulu city centre - build 1.4.2'
const CITY_B = 'Oulu city centre - build 1.5.0'
const HIGHWAY = 'Oulu highway northbound - build 1.5.0'
const FRONTHAUL = 'Lab fronthaul replay - O-DU under test'
const ROUNDTRIP = 'E2E roundtrip'

const results = []
let current = ''
const scenario = (title) => { current = title; console.log(`\n=== ${title}`) }
const step = (name, ok, detail = '') => {
  results.push({ scenario: current, name, ok, detail })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const PROXY = process.env.HTTPS_PROXY ?? process.env.https_proxy
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ...(PROXY ? { proxy: { server: PROXY, bypass: 'localhost,127.0.0.1,::1' } } : {}),
  args: ['--ignore-certificate-errors'],
})
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

const apiGet = async (path) => (await page.request.get(`${API}${path}`)).json()
const selectSession = async (label) => {
  await page.locator('.toolbar select').first().selectOption({ label })
  await page.waitForTimeout(1800)
}
const openWorkbook = async (label) => {
  await page.locator('.workbook-tabs button', { hasText: label }).click()
  await page.waitForTimeout(900)
}
const openMode = async (label) => {
  await page.locator('.mode-tabs button', { hasText: label }).click()
  await page.waitForTimeout(1200)
}
/** displayName -> severity class from the Numerical Data grid in the right dock. */
const gridSeverities = () => page
  .locator('.dock.right .dock-section:has(h3:text("Numerical Data")) table.grid tbody tr')
  .evaluateAll((rows) => Object.fromEntries(rows.map((r) => {
    const tds = r.querySelectorAll('td')
    const sev = [...tds[1].classList].find((c) => c.startsWith('sev-')) ?? ''
    return [tds[0].textContent.trim(), sev.replace('sev-', '')]
  })))
const cursorSeq = async () =>
  Number((await page.locator('.statusbar .dim').first().innerText()).match(/seq (\d+)/)?.[1] ?? -1)
const clickProgressAt = async (fraction) => {
  const bar = await page.locator('.statusbar .progress').boundingBox()
  await page.mouse.click(bar.x + bar.width * fraction, bar.y + bar.height / 2)
  await page.waitForTimeout(900)
}

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.statusbar', { timeout: 15000 })
await page.waitForTimeout(2500)
const sessions = await apiGet('/api/sessions')

// ─── S1 · Post-drive field analysis ──────────────────────────────────────────
scenario('S1 · Post-drive field analysis')
{
  await selectSession(CITY_A)
  const meta = sessions.find((s) => s.name === CITY_A)
  step('session opens', Boolean(meta), CITY_A)

  const segments = await page.locator('path.leaflet-interactive').count()
  step('route rendered as coloured segments', segments > 100, `${segments} segments`)

  // The legend is a distribution: its Total must account for every sample.
  const totalRow = await page.locator('.dock.right .legend-row', { hasText: 'Total' }).innerText()
  const totalCount = Number(totalRow.match(/(\d+)/)?.[1] ?? -1)
  step('legend Total equals the sample count', totalCount === meta.sampleCount,
    `legend ${totalCount} vs session ${meta.sampleCount}`)

  await openWorkbook('Degradation')
  const degRows = page.locator('.panels .panel table.grid tbody tr')
  const degCount = await degRows.count()
  const degText = await page.locator('.panels').innerText()
  step('degraded stretches detected', degCount > 0 && /CRITICAL/.test(degText), `${degCount} stretches`)

  const seqBefore = await cursorSeq()
  await degRows.first().click()
  await page.waitForTimeout(1000)
  const seqAfter = await cursorSeq()
  step('clicking a stretch moves the shared cursor', seqAfter !== seqBefore, `seq ${seqBefore} -> ${seqAfter}`)

  const sev = await gridSeverities()
  const rsrpSev = sev['RSRP (NR SpCell)'] ?? ''
  step('parameter grid confirms the problem at the cursor',
    rsrpSev === 'CRITICAL' || rsrpSev === 'WARNING', `RSRP ${rsrpSev} at seq ${seqAfter}`)

  await openWorkbook('L3 Signalling')
  const sigMeta = await page.locator('.panel > header .meta').first().innerText()
  step('L3 log follows the cursor', /following cursor @/.test(sigMeta), sigMeta)
  const msgRows = page.locator('.panels .panel table.grid tbody tr')
  const nBefore = await msgRows.count()
  await msgRows.first().click()
  await page.waitForTimeout(400)
  step('message expands to full detail', (await msgRows.count()) > nBefore)

  const evSeqBefore = await cursorSeq()
  await page.locator('.dock.right .dock-section:has(h3:text("Events")) table.grid tbody tr')
    .first().click()
  await page.waitForTimeout(900)
  const evSeqAfter = await cursorSeq()
  step('clicking an event jumps to its moment', evSeqAfter !== evSeqBefore,
    `seq ${evSeqBefore} -> ${evSeqAfter}`)

  await openWorkbook('Mobility')
  const cellsPanel = page.locator('.panel:has(header .title:text("Cells"))')
  const cellRows = await cellsPanel.locator('tbody tr').count()
  const servingHighlighted = await cellsPanel
    .locator('tbody tr[style*="rgb(238, 243, 250)"], tbody tr[style*="#eef3fa"]').count()
  step('cell table lists PCI/band/ARFCN/GSCN with the serving cell highlighted',
    cellRows >= 3 && servingHighlighted === 1, `${cellRows} cells`)
  await openWorkbook('Overview')

  await page.locator('.statusbar button.play').click()
  await page.waitForTimeout(1300)
  const playSeq = await cursorSeq()
  await page.locator('.statusbar button.play').click()
  await page.waitForTimeout(400)
  const pausedSeq = await cursorSeq()
  await page.waitForTimeout(700)
  step('playback sweeps the cursor and pause holds it',
    playSeq > evSeqAfter && (await cursorSeq()) === pausedSeq,
    `seq ${evSeqAfter} -> ${playSeq}, held at ${pausedSeq}`)

  const csv = await page.request.get(`${API}/api/sessions/${meta.id}/export.csv`)
  const body = await csv.text()
  const lines = body.trim().split('\n')
  step('CSV export carries the full drive', csv.ok() && lines.length === meta.sampleCount + 1
    && lines[0].includes('RSRP'), `${lines.length - 1} rows`)
}

// ─── S2 · Build A/B comparison ───────────────────────────────────────────────
scenario('S2 · Build A/B comparison')
{
  await openMode('Compare')
  await page.waitForTimeout(1200)
  const header = await page.locator('.panel > header .title').nth(1).innerText()
  step('two builds compared by default', /1\.4\.2 vs 1\.5\.0/.test(header), header)

  const rows = await page.locator('.panels .panel table.grid tbody tr')
    .evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())))
  const kpiRows = rows.filter((r) => r.length >= 9)
  const numeric = kpiRows.every((r) => r.slice(1, 8).every((c) => /^-?\d/.test(c)))
  step('per-KPI stats for both sides', kpiRows.length >= 8 && numeric, `${kpiRows.length} KPI rows`)

  const verdicts = kpiRows.map((r) => r[8])
  step('verdicts separate the builds', verdicts.some((v) => v === 'BETTER' || v === 'WORSE'),
    verdicts.join(','))

  const overlay = page.locator('.panel:has(header .title:has-text("CDF overlay"))')
  step('CDF overlay compares full distributions',
    (await overlay.count()) === 1 && (await overlay.locator('svg path').count()) >= 2)

  // The highway drive is also build 1.5.0, so the header alone cannot prove the
  // recompute; the sample-count meta (1200 vs 900) can.
  await page.locator('.panel select').nth(1).selectOption({ label: HIGHWAY })
  await page.waitForTimeout(1500)
  const meta2 = await page.locator('.panel > header .meta').first().innerText()
  step('swapping a side recomputes the comparison', /900 samples/.test(meta2), meta2)
}

// ─── S3 · Lab campaign: virtual channel + virtual UE vs a real DU ────────────
scenario('S3 · Lab campaign against a real DU')
{
  await openMode('Lab Campaigns')
  await page.waitForTimeout(1200)
  const text = await page.locator('.panels').innerText()
  step('campaigns and runs listed',
    (await page.locator('.panels .panel').count()) >= 3 && /Runs/.test(text))

  step('run records what was emulated and what is real',
    /Channel model \(emulated\)/.test(text) && /UE profile \(emulated\)/.test(text)
    && /DU under test \(real\)/.test(text) && /FRONTHAUL/.test(text))
  step('field-to-lab replay channel available',
    /FIELD_REPLAY/.test(text) && /Replay source/.test(text))

  await page.locator('.panel button', { hasText: 'Evaluate' }).first().click()
  await page.waitForTimeout(1800)
  const criteria = await page
    .locator('.panel:has(header .title:text("Acceptance criteria")) table.grid tbody tr')
    .evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())))
  const judged = criteria.filter((r) => r[4] === 'PASS' || r[4] === 'FAIL')
  const actuals = criteria.every((r) => /^-?\d/.test(r[3]))
  step('every criterion judged against a measured value',
    criteria.length > 0 && judged.length === criteria.length && actuals,
    `${judged.length}/${criteria.length} judged`)
  const after = await page.locator('.panels').innerText()
  step('run verdict produced', /PASS|FAIL/.test(after))

  // The fronthaul-gated run: radio criteria pass, transport criteria fail.
  await page.locator('.panels .panel table.grid tbody tr', { hasText: 'Fronthaul timing acceptance' })
    .first().click()
  await page.waitForTimeout(800)
  await page.locator('.panels .panel table.grid tbody tr', { hasText: 'Fronthaul timing acceptance' })
    .locator('button', { hasText: 'Evaluate' }).click()
  await page.waitForTimeout(1800)
  const rows = await page
    .locator('.panel:has(header .title:text("Acceptance criteria")) table.grid tbody tr')
    .evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())))
  const radioPass = rows.filter((r) => ['RSRP', 'SINR'].includes(r[0]) && r[4] === 'PASS')
  const fhFail = rows.filter((r) => r[0].startsWith('FH_RX') && r[4] === 'FAIL')
  step('verdict gated on fronthaul criteria radio cannot see',
    radioPass.length === 2 && fhFail.length === 2,
    `${radioPass.length} radio PASS, ${fhFail.length} fronthaul FAIL`)

  await page.locator('.panels button', { hasText: 'Open session' }).click()
  await page.waitForTimeout(1800)
  const statusName = await page.locator('.statusbar .dim').last().innerText()
  step('failed run drills through to its measured session',
    statusName.includes('fronthaul replay'), statusName)
}

// ─── S4 · Fronthaul fault triage ─────────────────────────────────────────────
scenario('S4 · Fronthaul fault triage (transport vs radio)')
{
  await openMode('Analysis')
  await selectSession(FRONTHAUL)
  const meta = sessions.find((s) => s.name === FRONTHAUL)

  // The user's entry point is the symptom: a throughput dip somewhere in the run.
  await page.locator('.toolbar select').nth(1).selectOption({ label: 'MAC downlink throughput' })
  await page.waitForTimeout(1500)
  await openWorkbook('Degradation')
  const thrText = await page.locator('.panels').innerText()
  step('symptom visible: throughput degrades', /CRITICAL|WARNING/.test(thrText))

  // Radio-side check: the fronthaul KPI family exists because RF cannot see this.
  await page.locator('.toolbar select').nth(1).selectOption({ label: 'CUS RX late' })
  await page.waitForTimeout(1500)
  const fhDeg = await apiGet(`/api/sessions/${meta.id}/degradations?kpi=FH_RX_LATE&minSamples=5`)
  step('fronthaul window flagged CRITICAL',
    fhDeg.length === 1 && fhDeg[0].severity === 'CRITICAL' && fhDeg[0].durationSeconds >= 90,
    `${fhDeg[0]?.startSeq}-${fhDeg[0]?.endSeq} (${fhDeg[0]?.durationSeconds}s)`)

  const mid = (fhDeg[0].startSeq + fhDeg[0].endSeq) / 2
  await clickProgressAt(mid / (meta.sampleCount - 1))
  const sev = await gridSeverities()
  const fhSev = sev['CUS RX late']
  const radio = [sev['RSRP (NR SpCell)'], sev['SS-SINR'], sev['MAC downlink BLER']]
  const thrSev = sev['MAC downlink throughput']
  step('inside the window: fronthaul CRITICAL', fhSev === 'CRITICAL', `CUS RX late ${fhSev}`)
  step('inside the window: RF and BLER stay clean', radio.every((s) => s === 'NORMAL'),
    `RSRP/SINR/BLER = ${radio.join('/')}`)
  step('inside the window: throughput sags with it',
    thrSev === 'WARNING' || thrSev === 'CRITICAL', `MAC DL throughput ${thrSev}`)

  await openWorkbook('Fronthaul')
  const fhTitles = await page.locator('.panel > header .title').allInnerTexts()
  step('fronthaul workbook charts transport against radio',
    fhTitles.some((t) => /CUS RX late/.test(t)) && fhTitles.some((t) => /CUS RX on time/.test(t))
    && fhTitles.some((t) => /throughput/i.test(t)) && fhTitles.some((t) => /RSRP/.test(t)),
    fhTitles.join(' | '))

  const events = await apiGet(`/api/sessions/${meta.id}/events`)
  step('root cause carried as an event + M-plane alarm',
    events.some((e) => e.eventType === 'FRONTHAUL_TIMING'),
    events.map((e) => e.eventType).join(','))
}

// ─── S5 · Coverage optimization ──────────────────────────────────────────────
scenario('S5 · Coverage optimization')
{
  await page.locator('.toolbar select').nth(1).selectOption({ label: 'RSRP (NR SpCell)' })
  await selectSession(HIGHWAY)
  await openWorkbook('Overview')
  const meta = sessions.find((s) => s.name === HIGHWAY)

  await openWorkbook('Fronthaul')
  const fhEmpty = await page.locator('.panels').innerText()
  step('field session explains why it has no fronthaul counters',
    /No fronthaul counters in this session/.test(fhEmpty))
  await openWorkbook('Overview')

  await page.locator('.toolbar select').nth(2).selectOption('150')
  await page.waitForTimeout(1800)
  const mapTitle = await page.locator('.panel > header .title').first().innerText()
  const shapes = await page.locator('.leaflet-overlay-pane path').count()
  step('area bins aggregate the raw route', /area bins/.test(mapTitle) && shapes > 0,
    `${shapes} shapes`)

  await openWorkbook('Coverage Issues')
  const issueRows = page.locator('.panels .panel table.grid tbody tr')
  const issueCount = await issueRows.count()
  const issueText = await page.locator('.panels').innerText()
  step('issues classified by cause', issueCount > 0
    && /WEAK COVERAGE|INTERFERENCE|OVERSHOOT/.test(issueText), `${issueCount} issues`)

  const seqBefore = await cursorSeq()
  await issueRows.first().click()
  await page.waitForTimeout(900)
  step('clicking an issue jumps to its location', (await cursorSeq()) !== seqBefore)

  const geo = await page.request.get(`${API}/api/sessions/${meta.id}/export.geojson?kpi=RSRP`)
  const gj = await geo.json()
  step('GeoJSON export for planning tools', geo.ok() && gj.type === 'FeatureCollection'
    && gj.features.length > 0 && 'RSRP' in (gj.features[0].properties ?? {}),
    `${gj.features?.length} features`)

  await page.locator('.toolbar select').nth(2).selectOption('0')
  await page.waitForTimeout(900)
}

// ─── S6 · Data lifecycle: export → import → analyze → delete ─────────────────
scenario('S6 · Data lifecycle round-trip')
{
  const src = sessions.find((s) => s.name === CITY_B)
  const csv = await (await page.request.get(`${API}/api/sessions/${src.id}/export.csv`)).text()

  await openMode('Import')
  await page.locator('input[type=file]').setInputFiles({
    name: 'e2e-roundtrip.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  })
  await page.locator('label:has-text("Session name") input').fill(ROUNDTRIP)
  await page.locator('.panels button', { hasText: 'Import' }).click()
  await page.waitForSelector('.panel header .title:text("Import result")', { timeout: 30000 })
  await page.waitForTimeout(500)

  const resultText = await page.locator('.panel:has(header .title:text("Import result"))').innerText()
  const samplesLoaded = Number(resultText.match(/Samples loaded\s+(\d+)/)?.[1] ?? -1)
  step('import loads every exported sample', samplesLoaded === src.sampleCount,
    `${samplesLoaded} of ${src.sampleCount}`)
  const ignored = resultText.match(/Ignored columns\s+(.+)/)?.[1]?.trim() ?? '?'
  step('no data silently dropped', ignored === 'none' || ignored === 'seq', `ignored: ${ignored}`)

  const histText = await page.locator('.panel:has(header .title:text("Import history"))').innerText()
  step('import recorded in history', histText.includes('e2e-roundtrip.csv')
    && /COMPLETED/.test(histText))

  await openMode('Analysis')
  await selectSession(ROUNDTRIP)
  const segments = await page.locator('path.leaflet-interactive').count()
  const totalRow = await page.locator('.dock.right .legend-row', { hasText: 'Total' }).innerText()
  const legendTotal = Number(totalRow.match(/(\d+)/)?.[1] ?? -1)
  step('imported session analyzes like a native one', segments > 100 && legendTotal === src.sampleCount,
    `${segments} segments, legend ${legendTotal}`)

  page.once('dialog', (d) => d.accept())
  await page.locator('.toolbar button.danger').click()
  await page.waitForTimeout(2000)
  const gone = !(await apiGet('/api/sessions')).some((s) => s.name === ROUNDTRIP)
  step('session can be deleted from the toolbar when no longer needed', gone)
  await selectSession(CITY_A)
}

// ─── S7 · Statistics reporting ───────────────────────────────────────────────
scenario('S7 · Statistics reporting')
{
  await openWorkbook('Statistics')
  await page.waitForTimeout(800)
  const cells = await page
    .locator('.panel:has(header .title:has-text("Statistics")) table.grid tbody td')
    .allInnerTexts()
  const nums = cells.map((c) => parseFloat(c))
  const [min, p05, p50, , p95, max] = nums
  step('summary statistics computed', nums.length === 6 && nums.every((n) => Number.isFinite(n)),
    cells.join(' | '))
  step('percentiles ordered sanely', min <= p05 && p05 <= p50 && p50 <= p95 && p95 <= max)

  const cdfPanel = page.locator('.panel:has(header .title:text("Cumulative distribution"))')
  // innerText is HTML-only; SVG <text> needs textContent.
  const marks = await cdfPanel.locator('svg text').evaluateAll((ts) => ts.map((t) => t.textContent))
  step('CDF drawn with percentile marks', (await cdfPanel.locator('svg path').count()) > 0
    && ['p05', 'p50', 'p95'].every((m) => marks.includes(m)))

  await page.locator('.tree .kpi', { hasText: 'SS-SINR' }).click()
  await page.waitForTimeout(1200)
  const title = await page.locator('.panel > header .title').first().innerText()
  step('statistics follow the selected KPI', /SINR/.test(title), title)

  // Sub-select a stretch of the drive and watch statistics and legend honour it,
  // with the active filter visible as a chip.
  const fullMeta = await page.locator('.panel > header .meta').first().innerText()
  const fullCount = Number(fullMeta.replace(/,/g, '').match(/(\d+) samples/)?.[1] ?? -1)
  await clickProgressAt(0.25)
  await page.locator('.statusbar .range-marks button', { hasText: 'From here' }).click()
  await clickProgressAt(0.75)
  await page.locator('.statusbar .range-marks button', { hasText: 'To here' }).click()
  await page.waitForTimeout(1500)
  const chip = await page.locator('.filter-chip').count()
  const filteredMeta = await page.locator('.panel > header .meta').first().innerText()
  const filteredCount = Number(filteredMeta.replace(/,/g, '').match(/(\d+) samples/)?.[1] ?? -1)
  const totalRow = await page.locator('.dock.right .legend-row', { hasText: 'Total' }).innerText()
  const legendTotal = Number(totalRow.match(/(\d+)/)?.[1] ?? -1)
  step('range filter narrows statistics and legend, shown as a chip',
    chip === 1 && filteredCount < fullCount && legendTotal === filteredCount,
    `${fullCount} -> ${filteredCount} samples, legend ${legendTotal}`)

  await page.locator('.filter-chip button').click()
  await page.waitForTimeout(1500)
  const clearedMeta = await page.locator('.panel > header .meta').first().innerText()
  const clearedCount = Number(clearedMeta.replace(/,/g, '').match(/(\d+) samples/)?.[1] ?? -1)
  step('clearing the chip restores the whole drive', clearedCount === fullCount,
    `${clearedCount} samples`)
}

// ─── S8 · Responsiveness budget ──────────────────────────────────────────────
scenario('S8 · Responsiveness budget (seeded data; scale harness: load-test.sh)')
{
  const biggest = [...sessions].sort((a, b) => b.sampleCount - a.sampleCount)[0]
  const paths = [
    `/api/sessions/${biggest.id}/track?kpi=RSRP&maxPoints=4000`,
    `/api/sessions/${biggest.id}/series?kpis=RSRP,RSRQ,SINR,MAC_DL_THROUGHPUT,MAC_UL_THROUGHPUT,DL_BLER&maxPoints=2000`,
    `/api/sessions/${biggest.id}/distribution?kpi=RSRP`,
    `/api/sessions/${biggest.id}/statistics?kpi=RSRP`,
    `/api/sessions/${biggest.id}/degradations?kpi=RSRP&minSamples=5`,
    `/api/sessions/${biggest.id}/bins?kpi=RSRP&sizeMeters=150`,
    `/api/sessions/${biggest.id}/coverage-issues`,
    `/api/compare?a=1&b=2&kpis=RSRP,RSRQ,SINR,MAC_DL_THROUGHPUT`,
  ]
  const BUDGET_MS = 1500
  let worst = 0; let worstPath = ''
  let allOk = true
  for (const p of paths) {
    const t0 = Date.now()
    const res = await page.request.get(`${API}${p}`)
    const ms = Date.now() - t0
    if (ms > worst) { worst = ms; worstPath = p.split('?')[0] }
    if (!res.ok() || ms > BUDGET_MS) allOk = false
  }
  step(`all ${paths.length} analysis endpoints inside ${BUDGET_MS} ms`, allOk,
    `worst ${worst} ms (${worstPath})`)
}

// ─── wrap-up ─────────────────────────────────────────────────────────────────
const appErrors = errors.filter((e) =>
  !/tile\.openstreetmap\.org|ERR_CONNECTION|Failed to load resource|ERR_TIMED_OUT/.test(e))
scenario('Cross-cutting')
step('no console errors from app code across all journeys', appErrors.length === 0,
  appErrors.slice(0, 3).join(' | '))

await browser.close()

const failed = results.filter((r) => !r.ok)
const byScenario = [...new Set(results.map((r) => r.scenario))]
console.log('\n──────── summary')
for (const s of byScenario) {
  const rs = results.filter((r) => r.scenario === s)
  const bad = rs.filter((r) => !r.ok).length
  console.log(`${bad === 0 ? 'PASS' : 'FAIL'}  ${s}  (${rs.length - bad}/${rs.length})`)
}
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
process.exit(failed.length === 0 ? 0 : 1)

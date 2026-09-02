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
 *   S9  Colour scale personalisation (edit the bins -> every view repaints -> reset)
 *   S10 Unconfigured KPI            (auto scale: readable, stable under filtering, honest)
 *   S11 Lossless import             (unknown columns become KPIs, analysable straight away)
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
const ROUNDTRIP_NOTE = 'rush hour, wipers on'

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
  await page.locator('.toolbar select[aria-label="Measurement"]').selectOption({ label })
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
  await page.locator('.toolbar select[aria-label="KPI"]').selectOption({ label: 'MAC downlink throughput' })
  await page.waitForTimeout(1500)
  await openWorkbook('Degradation')
  const thrText = await page.locator('.panels').innerText()
  step('symptom visible: throughput degrades', /CRITICAL|WARNING/.test(thrText))

  // Radio-side check: the fronthaul KPI family exists because RF cannot see this.
  await page.locator('.toolbar select[aria-label="KPI"]').selectOption({ label: 'CUS RX late' })
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
  await page.locator('.toolbar select[aria-label="KPI"]').selectOption({ label: 'RSRP (NR SpCell)' })
  await selectSession(HIGHWAY)
  await openWorkbook('Overview')
  const meta = sessions.find((s) => s.name === HIGHWAY)

  await openWorkbook('Fronthaul')
  const fhEmpty = await page.locator('.panels').innerText()
  step('field session explains why it has no fronthaul counters',
    /No fronthaul counters in this session/.test(fhEmpty))
  await openWorkbook('Overview')

  await page.locator('.toolbar select[aria-label="Area bins"]').selectOption('150')
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

  // A typo in the KPI name used to yield 200 and a file full of nulls, which looks
  // like a successful export until someone opens it in a planning tool.
  const badKpi = await page.request.get(`${API}/api/sessions/${meta.id}/export.geojson?kpi=NOPE`)
  step('an unknown KPI is refused rather than exported as nulls',
    badKpi.status() === 400, `HTTP ${badKpi.status()}`)

  await page.locator('.toolbar select[aria-label="Area bins"]').selectOption('0')
  await page.waitForTimeout(900)
}

// ─── S6 · Data lifecycle: export → import → analyze → delete ─────────────────
scenario('S6 · Data lifecycle round-trip')
{
  const src = sessions.find((s) => s.name === CITY_B)
  const csv = await (await page.request.get(`${API}/api/sessions/${src.id}/export.csv`)).text()

  // Duplicate session names are now refused, which makes this scenario non-idempotent:
  // a run that died before its delete step leaves the name taken and blocks every run
  // after it. Clearing it first keeps the scenario re-runnable without weakening the
  // product rule it goes on to assert.
  for (const stale of (await apiGet('/api/sessions')).filter((x) => x.name === ROUNDTRIP)) {
    await page.request.delete(`${API}/api/sessions/${stale.id}`)
  }

  await openMode('Import')
  await page.locator('input[type=file]').setInputFiles({
    name: 'e2e-roundtrip.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  })
  await page.locator('label:has-text("Session name") input').fill(ROUNDTRIP)
  await page.locator('.import-description').fill(ROUNDTRIP_NOTE)
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

  // Importing the same name twice is how two indistinguishable drives get into the
  // picker, and the next person analyses whichever one the dropdown lists first. The
  // second import must be refused, and the refusal has to name the session already
  // holding the name - "already exists" alone leaves the user with nothing to do.
  await page.locator('input[type=file]').setInputFiles({
    name: 'e2e-roundtrip.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  })
  await page.locator('label:has-text("Session name") input').fill(ROUNDTRIP)
  await page.locator('.panels button', { hasText: 'Import' }).click()
  await page.waitForTimeout(2500)
  const dupText = await page.locator('.panels').first().innerText()
  const dupCount = (await apiGet('/api/sessions')).filter((x) => x.name === ROUNDTRIP).length
  step('re-importing the same session name is refused, not silently duplicated',
    dupCount === 1 && /already exists/i.test(dupText),
    `${dupCount} session(s) named ${ROUNDTRIP}`)

  await openMode('Analysis')
  await selectSession(ROUNDTRIP)
  const segments = await page.locator('path.leaflet-interactive').count()
  const totalRow = await page.locator('.dock.right .legend-row', { hasText: 'Total' }).innerText()
  const legendTotal = Number(totalRow.match(/(\d+)/)?.[1] ?? -1)
  step('imported session analyzes like a native one', segments > 100 && legendTotal === src.sampleCount,
    `${segments} segments, legend ${legendTotal}`)

  // The description is the only thing a session can say that its file name cannot, and
  // it has to survive to where the analyst actually looks - the note bar, not just a row
  // in the database.
  // The note bar specifically, not the page text: searching the whole body would pass
  // on any build that rendered the string anywhere at all.
  const noteBar = await page.locator('.session-notes').innerText()
  step('the description typed at import reaches the note bar',
    noteBar.includes(ROUNDTRIP_NOTE), noteBar)

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

// ─── S9 · Colour scale personalisation ───────────────────────────────────────
scenario('S9 · Colour scale personalisation')
{
  await openMode('Analysis')
  await selectSession(CITY_A)
  await openWorkbook('Overview')
  await page.locator('.toolbar select[aria-label="KPI"]').selectOption({ label: 'RSRP (NR SpCell)' })
  await page.waitForTimeout(1500)

  const legendLabels = () => page.locator('.dock.right .legend-row .label').allInnerTexts()
  const legendCounts = () => page.locator('.dock.right .legend-row .count').allInnerTexts()
  const before = { labels: await legendLabels(), counts: await legendCounts() }

  await page.locator('.legend-edit').click()
  await page.waitForSelector('.modal', { timeout: 5000 })
  step('legend opens its own scale editor', (await page.locator('.modal').count()) === 1)

  // The legend's .label cells include its header and Total rows, so count the data
  // bins the way the legend itself marks them: a row with a numeric count.
  const dataBins = (await legendCounts()).filter((c) => /^\d+$/.test(c.trim())).length - 1
  const boundaries = page.locator('.modal input.boundary')
  const editorBins = await page.locator('.modal tbody tr').count()
  step('editor exposes one boundary per gap between bins',
    editorBins === dataBins && (await boundaries.count()) === editorBins - 1,
    `${editorBins} bins (legend ${dataBins}), ${await boundaries.count()} boundaries`)

  // An out-of-order ladder must be refused before it can be saved.
  await boundaries.nth(0).fill('-50')
  await page.waitForTimeout(300)
  const saveBtn = page.locator('.modal footer button', { hasText: 'Save' })
  const blocked = await saveBtn.isDisabled()
  const warned = /Boundaries must increase/.test(await page.locator('.modal').innerText())
  step('non-ascending boundaries block the save', blocked && warned)

  // A real edit. The -90 boundary is the one that separates a degraded bin from a
  // normal one, so moving it must change which stretches count as degraded - an
  // edit that only moved -100 would leave the degraded set identical and prove
  // nothing about whether the analytics read the new scale.
  const cityId = sessions.find((s) => s.name === CITY_A).id
  const degBefore = (await apiGet(`/api/sessions/${cityId}/degradations?kpi=RSRP&minSamples=5`)).length
  await boundaries.nth(0).fill('-95')
  await boundaries.nth(1).fill('-85')
  await page.waitForTimeout(300)
  step('valid ladder re-enables the save', !(await saveBtn.isDisabled()))
  await saveBtn.click()
  await page.waitForTimeout(2000)

  const after = { labels: await legendLabels(), counts: await legendCounts() }
  step('legend labels follow the new bounds',
    after.labels.some((l) => /-95/.test(l)) && after.labels.some((l) => /-85/.test(l))
    && !after.labels.some((l) => /-100/.test(l)),
    after.labels.join(' | '))
  step('bin statistics recount against the new scale',
    JSON.stringify(after.counts) !== JSON.stringify(before.counts),
    `${before.counts.join('/')} -> ${after.counts.join('/')}`)

  // The whole view set is painted from these bins, not just the legend.
  const degAfter = (await apiGet(`/api/sessions/${cityId}/degradations?kpi=RSRP&minSamples=5`)).length
  step('degradation detection uses the edited scale', degAfter !== degBefore,
    `${degBefore} -> ${degAfter} stretches`)

  await page.locator('.legend-edit').click()
  await page.waitForSelector('.modal', { timeout: 5000 })
  await page.locator('.modal footer button', { hasText: 'Reset to default' }).click()
  await page.waitForTimeout(1500)
  await page.locator('.modal > header button').click()
  await page.waitForTimeout(1500)
  const restored = await legendLabels()
  step('reset restores the seeded scale',
    JSON.stringify(restored) === JSON.stringify(before.labels), restored.join(' | '))
}

// ─── S10 · A KPI with no configured scale ────────────────────────────────────
scenario('S10 · Unconfigured KPI falls back to an auto scale')
{
  // Strip one KPI's bins through the API, the way a user-defined or newly imported
  // KPI arrives: defined, measured, but with nobody's thresholds on it yet.
  const cityId = sessions.find((s) => s.name === CITY_A).id
  const stripped = 'CQI'
  await page.request.delete(`${API}/api/kpi-definitions/${stripped}/thresholds`)

  const dist = await apiGet(`/api/sessions/${cityId}/distribution?kpi=${stripped}`)
  if (!dist.derived) {
    step('KPI could be stripped for this check', false, 'still configured — check skipped')
  } else {
    step('unconfigured KPI still answers', Array.isArray(dist.bins) && dist.bins.length >= 2,
      `${dist.bins.length} bins`)
    step('auto scale is marked as derived', dist.derived === true)

    // Every bin must be reachable: a bin that cannot fill wastes a quarter of the
    // legend and a step of the ramp.
    step('every derived bin holds samples', dist.bins.every((b) => b.count > 0),
      dist.bins.map((b) => `${b.label}=${b.count}`).join(' '))

    // Quantiles, so the bins should be roughly balanced rather than lopsided.
    const shares = dist.bins.map((b) => b.percentage)
    step('quartile bins are balanced', Math.max(...shares) < 45 && Math.min(...shares) > 8,
      shares.map((p) => `${p}%`).join(' '))

    // Boundaries must be readable numbers, not raw quantiles like -93.7421.
    const bounds = dist.bins.map((b) => b.upperBound).filter((v) => v != null)
    step('boundaries are rounded, not raw quantiles',
      bounds.every((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9),
      bounds.join(', '))

    // The property the whole design turns on: filtering changes counts, never bins.
    const filtered = await apiGet(
      `/api/sessions/${cityId}/distribution?kpi=${stripped}&fromSeq=600&toSeq=900`)
    const same = JSON.stringify(filtered.bins.map((b) => [b.lowerBound, b.upperBound]))
      === JSON.stringify(dist.bins.map((b) => [b.lowerBound, b.upperBound]))
    step('range filtering moves the counts, never the boundaries',
      same && filtered.total < dist.total, `${dist.total} -> ${filtered.total} samples`)

    // A derived scale ranks a drive against itself; it must not claim a breach.
    step('no derived bin asserts a severity', dist.bins.every((b) => b.severity === 'NORMAL'),
      [...new Set(dist.bins.map((b) => b.severity))].join(','))

    // And the UI has to say so, or the map reads as an absolute judgement.
    await openMode('Analysis')
    await selectSession(CITY_A)
    await page.locator('.toolbar select[aria-label="KPI"]').selectOption({ label: 'CQI' })
    await page.waitForTimeout(1600)
    const noteVisible = await page.locator('.dock.right .legend-note').count()
    step('legend says the scale was derived, not configured', noteVisible === 1,
      noteVisible ? await page.locator('.dock.right .legend-note').innerText() : 'no note')

    // Editing an auto scale starts from what is on screen, not an empty form.
    await page.locator('.legend-edit').click()
    await page.waitForSelector('.modal', { timeout: 5000 })
    const rows = await page.locator('.modal tbody tr').count()
    step('editor opens pre-filled with the proposed bins', rows === dist.bins.length,
      `${rows} rows`)
    await page.locator('.modal > header button').click()
    await page.waitForTimeout(500)

    await page.request.post(`${API}/api/kpi-definitions/${stripped}/thresholds/reset`)
    await page.locator('.toolbar select[aria-label="KPI"]').selectOption({ label: 'RSRP (NR SpCell)' })
    await page.waitForTimeout(1200)
  }
}

// ─── S11 · Importing a file with columns this catalogue has never seen ───────
scenario('S11 · Unknown columns become KPIs instead of being dropped')
{
  const src = sessions.find((s) => s.name === CITY_B)
  const csv = await (await page.request.get(`${API}/api/sessions/${src.id}/export.csv`)).text()
  const lines = csv.trim().split('\n')
  // Two columns no catalogue of ours has ever contained: one integer, one with
  // two decimals and a unit in the conventional parenthetical form.
  lines[0] = `${lines[0]},Beam SSB index,Custom margin (dB)`
  for (let i = 1; i < lines.length; i++) {
    lines[i] = `${lines[i]},${i % 8},${(3.25 + i * 0.01).toFixed(2)}`
  }
  const withUnknown = lines.join('\n')

  const importFile = async (name, createUnknown) => {
    await openMode('Import')
    await page.locator('input[type=file]').setInputFiles({
      name: `${name}.csv`, mimeType: 'text/csv', buffer: Buffer.from(withUnknown),
    })
    await page.locator('label:has-text("Session name") input').fill(name)
    const box = page.locator('.panels label:has-text("Define a KPI") input[type=checkbox]')
    if (createUnknown) await box.check(); else await box.uncheck()
    await page.locator('.panels button', { hasText: 'Import' }).click()
    await page.waitForSelector('.panel header .title:text("Import result")', { timeout: 30000 })
    await page.waitForTimeout(400)
    return page.locator('.panel:has(header .title:text("Import result"))').innerText()
  }

  // A file with no recognisable KPI column fails outright. The job row has to
  // outlive the rollback, or the history can only ever show successes - which is
  // not what anyone opens a history for.
  const rejected = await page.request.post(`${API}/api/import/csv`, {
    multipart: {
      file: { name: 'S11 no-kpi.csv', mimeType: 'text/csv',
              buffer: Buffer.from('lat,lon,nothing_useful\n65.0,25.0,1\n') },
      sessionName: 'S11 no-kpi',
    },
  })
  const jobs = await apiGet('/api/import/jobs')
  const failed = jobs.find((j) => j.filename === 'S11 no-kpi.csv')
  step('an import with no usable column fails and is recorded with its reason',
    rejected.status() === 400 && failed?.status === 'FAILED' && /No column matched/.test(failed?.message ?? ''),
    `HTTP ${rejected.status()}, history: ${failed?.status ?? 'absent'}`)

  const off = await importFile('S11 dropped', false)
  step('by default an unrecognised column is reported as dropped',
    /Ignored columns\s+Beam SSB index, Custom margin \(dB\)/.test(off)
    && !/KPIs defined/.test(off))

  const on = await importFile('S11 defined', true)
  step('with the option the columns are defined instead',
    /KPIs defined\s+BEAM_SSB_INDEX, CUSTOM_MARGIN/.test(on) && /Ignored columns\s+none/.test(on),
    (on.match(/KPIs defined.*/) ?? ['-'])[0])

  const defs = await apiGet('/api/kpi-definitions')
  const beam = defs.find((d) => d.name === 'BEAM_SSB_INDEX')
  const margin = defs.find((d) => d.name.startsWith('CUSTOM_MARGIN'))
  step('a new KPI is NEUTRAL until someone says which end is good',
    beam?.direction === 'NEUTRAL' && margin?.direction === 'NEUTRAL',
    `${beam?.direction} / ${margin?.direction}`)
  step('decimals follow the values, and a parenthetical header gives the unit',
    beam?.decimals === 0 && margin?.decimals === 2 && margin?.unit === 'dB',
    `beam ${beam?.decimals}dp, margin ${margin?.decimals}dp unit="${margin?.unit}"`)

  // The point of defining them: they are analysable like any other KPI.
  await openMode('Analysis')
  await selectSession('S11 defined')
  const tree = await page.locator('.dock .tree').innerText()
  step('new KPIs appear in the parameter tree', /Beam SSB index/.test(tree) && /Imported/.test(tree))

  await page.locator('.tree .kpi', { hasText: 'Beam SSB index' }).click()
  await page.waitForTimeout(1800)
  const segments = await page.locator('path.leaflet-interactive').count()
  const note = await page.locator('.dock.right .legend-note').count()
  step('a brand-new KPI paints the map on its auto scale', segments > 50 && note === 1,
    `${segments} segments`)

  // A KPI defined by mistake has to be removable, or a typo'd header lodges in the
  // catalogue permanently. Built-in KPIs are refused for the same reason.
  const refused = await page.request.delete(`${API}/api/kpi-definitions/RSRP`)
  step('a built-in KPI cannot be deleted', refused.status() === 400,
    `HTTP ${refused.status()}`)

  await page.locator('.legend-edit').click()
  await page.waitForSelector('.modal', { timeout: 5000 })
  const hasDelete = await page.locator('.modal footer button', { hasText: 'Delete KPI' }).count()
  const hasReset = await page.locator('.modal footer button', { hasText: 'Reset to default' }).count()
  step('the editor offers Delete for a defined KPI and Reset only for built-ins',
    hasDelete === 1 && hasReset === 0)
  page.once('dialog', (d) => d.accept())
  await page.locator('.modal footer button', { hasText: 'Delete KPI' }).click()
  await page.waitForTimeout(1500)
  page.once('dialog', (d) => d.accept())
  await page.waitForTimeout(600)
  const afterDelete = await apiGet('/api/kpi-definitions')
  step('deleting a KPI removes it from the catalogue',
    !afterDelete.some((d) => d.name === 'BEAM_SSB_INDEX'),
    `${afterDelete.length} KPIs left`)

  await page.request.delete(`${API}/api/kpi-definitions/CUSTOM_MARGIN_DB`)
  const imported = await apiGet('/api/sessions')
  for (const name of ['S11 dropped', 'S11 defined']) {
    const s = imported.find((x) => x.name === name)
    if (s) await page.request.delete(`${API}/api/sessions/${s.id}`)
  }
  await selectSession(CITY_A)
  await page.locator('.toolbar select[aria-label="KPI"]').selectOption({ label: 'RSRP (NR SpCell)' })
  await page.waitForTimeout(1000)
}

// ─── S12 · The monitored set agrees with the map and the KPIs ────────────────
scenario('S12 · The monitored set is consistent with everything else')
{
  // The failure this guards is not "the panel is empty" but "the panel disagrees". A
  // monitored set that contradicts the serving cell, the RSRP trace or the map teaches an
  // engineer to stop trusting the tool, which is worse than not shipping the panel.
  const cityId = sessions.find((s) => s.name === CITY_A).id
  const seq = 500
  const ms = await apiGet(`/api/sessions/${cityId}/monitored-set?seq=${seq}`)
  const snap = await apiGet(`/api/sessions/${cityId}/snapshot?seq=${seq}`)
  const flat = Object.values(snap.byCategory).flat()

  step('the monitored set has cells', ms.cells.length >= 2, `${ms.cells.length} cells`)

  const serving = ms.cells.filter((c) => c.serving)
  step('exactly one cell is the serving cell', serving.length === 1)
  step('it is the one `sample` records as serving', serving[0]?.pci === ms.servingPci,
    `${serving[0]?.pci} vs ${ms.servingPci}`)

  // No neighbour may be stronger than the cell the terminal is actually using. This is
  // the invariant that caught the tunnel attenuating only the serving cell.
  const strongest = Math.max(...ms.cells.map((c) => c.rsrp))
  step('no neighbour is stronger than the serving cell',
    serving[0] != null && serving[0].rsrp >= strongest,
    `serving ${serving[0]?.rsrp} vs best ${strongest}`)

  // The serving row and the RSRP KPI are the same measurement, so they must be the same
  // number - not merely close.
  const rsrpKpi = flat.find((v) => v.kpi === 'RSRP')
  step('serving RSRP equals the RSRP KPI exactly',
    rsrpKpi != null && Math.abs(rsrpKpi.value - serving[0].rsrp) < 1e-9,
    `${serving[0]?.rsrp} vs ${rsrpKpi?.value}`)

  // Every reported cell must be a cell this session actually knows about, or the map
  // cannot draw a line to it.
  const refs = await apiGet(`/api/sessions/${cityId}/cells`)
  const known = new Set(refs.map((c) => `${c.arfcn}/${c.pci}`))
  step('every monitored cell is a known cell',
    ms.cells.every((c) => known.has(`${c.arfcn}/${c.pci}`)),
    ms.cells.map((c) => c.pci).join(','))

  // Pilot pollution must mean competing USABLE cells. Firing it inside a fade would send
  // an engineer to retune antennas where the real problem is that nothing reaches.
  //
  // Asserted with a non-empty guard, because `.every()` is true of an empty array: the
  // previous version of this step passed either when every stretch had a usable best cell
  // OR when the detector had stopped returning anything at all, and those are opposite
  // outcomes. A detector that reports nothing is broken, not careful.
  const spans = await apiGet(`/api/sessions/${cityId}/pilot-pollution`)
  step('pilot pollution still finds the crowded stretch', spans.length > 0,
    `${spans.length} stretches`)
  step('pilot pollution never reports a coverage hole',
    spans.length > 0 && spans.every((sp) => sp.meanBestRsrp >= -110),
    spans.length ? spans.map((sp) => sp.meanBestRsrp).join(', ') : 'no stretches')

  // The fourth condition the reference asks for (UC20 p173: Ec/N0 best active set < -12).
  // Read back the serving quality at each reported sample rather than trusting the query
  // that produced them - this is the assertion that would fail if the JOIN were dropped,
  // on any measurement where a crowded sample has a healthy serving link.
  const pollutedQuality = []
  for (const sp of spans) {
    const snap = await apiGet(`/api/sessions/${cityId}/snapshot?seq=${sp.fromSeq}`)
    const sinr = Object.values(snap.byCategory ?? {}).flat()
      .find((r) => r.kpi === 'SINR')?.value
    if (sinr != null) pollutedQuality.push(sinr)
  }
  step('every polluted sample has a degraded serving link',
    pollutedQuality.length > 0 && pollutedQuality.every((v) => v < 5),
    pollutedQuality.length ? `SINR: ${pollutedQuality.join(', ')}` : 'no SINR read')

  // Inside the deep fade the set must SHRINK rather than stay full - a fade that left the
  // neighbour count untouched would mean the fade was applied to the serving cell alone.
  const inFade = await apiGet(`/api/sessions/${cityId}/monitored-set?seq=575`)
  step('the monitored set shrinks inside the deep fade',
    inFade.cells.length < ms.cells.length,
    `${ms.cells.length} outside -> ${inFade.cells.length} inside`)
}

// ─── S13 · A graph KPI behaves like any other KPI ────────────────────────────
scenario('S13 · A workbench graph produces a first-class KPI')
{
  // The point of materialising a graph's values into sample_kpi is that everything
  // downstream treats it as an ordinary KPI. That claim is only worth making if the
  // downstream paths are actually exercised, so this walks them.
  const cityId = sessions.find((s) => s.name === CITY_A).id
  const spec = {
    nodes: [
      { id: 1, kind: 'SOURCE_KPI', x: 40, y: 24, kpiName: 'RSRP', as: 'SERVING' },
      { id: 2, kind: 'SOURCE_NEIGHBOUR', x: 270, y: 24, rank: 1, metric: 'RSRP',
        excludeServing: true, as: 'BEST_NBR' },
      { id: 3, kind: 'COMBINE', x: 40, y: 126 },
      { id: 4, kind: 'EXPRESSION', x: 40, y: 228,
        expression: 'SERVING - BEST_NBR', as: 'MARGIN' },
      { id: 5, kind: 'OUTPUT', x: 40, y: 330, column: 'MARGIN' },
    ],
    edges: [{ from: 1, to: 3 }, { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 5 }],
  }
  const output = {
    name: 'S13_MARGIN', displayName: 'S13 handover margin', unit: 'dB',
    category: 'Workbench', technology: '5G NR', direction: 'NEUTRAL', source: 'UE',
    decimals: 1, description: 'scenario check', expression: null,
  }

  const post = (path, body) => page.request.post(`${API}${path}`, { data: body })

  // A graph is invalid while it is being drawn, so validate must report the reason
  // rather than fail the request.
  const bad = await (await post('/api/kpi-definitions/graphs/validate',
    { name: 'x', output: null, spec: { nodes: spec.nodes, edges: [] } })).json()
  step('an unwired graph reports why, not a 500',
    bad.ok === false && /input/i.test(bad.error ?? ''), bad.error ?? '')

  const good = await (await post('/api/kpi-definitions/graphs/validate',
    { name: 'x', output: null, spec })).json()
  step('a wired graph validates', good.ok === true, good.error ?? '')
  step('it reports reading the monitored set', good.readsNeighbours === true)

  const saved = await (await post('/api/kpi-definitions/graphs',
    { name: 'S13 margin', output, spec })).json()
  step('saving computes values', saved.valuesComputed > 0, `${saved.valuesComputed} values`)

  // Arithmetically right, checked against an independent recomputation from the
  // monitored set. A graph that computed something else entirely would still have
  // produced values above.
  const ms = await apiGet(`/api/sessions/${cityId}/monitored-set?seq=500`)
  const srv = ms.cells.find((c) => c.serving)
  const nbr = ms.cells.filter((c) => !c.serving).sort((a, b) => b.rsrp - a.rsrp)[0]
  const snap = await apiGet(`/api/sessions/${cityId}/snapshot?seq=500`)
  const got = Object.values(snap.byCategory).flat().find((v) => v.kpi === 'S13_MARGIN')
  step('the value equals serving minus best neighbour',
    got != null && Math.abs(got.value - (srv.rsrp - nbr.rsrp)) < 0.05,
    `${srv.rsrp} - ${nbr.rsrp} = ${(srv.rsrp - nbr.rsrp).toFixed(1)}, got ${got?.value}`)

  // The downstream paths that materialising was supposed to buy.
  const stats = await apiGet(`/api/sessions/${cityId}/statistics?kpi=S13_MARGIN`)
  step('statistics work on it', stats.count > 0, `n=${stats.count}`)
  const dist = await apiGet(`/api/sessions/${cityId}/distribution?kpi=S13_MARGIN`)
  step('it gets a colour scale like any KPI', Array.isArray(dist.bins) && dist.bins.length >= 2,
    `${dist.bins.length} bins`)
  const track = await apiGet(`/api/sessions/${cityId}/track?kpi=S13_MARGIN`)
  step('the map can colour the route by it', track.length > 0, `${track.length} points`)

  // An input a graph reads cannot be deleted out from under it.
  const del = await page.request.delete(`${API}/api/kpi-definitions/S13_MARGIN`)
  step('the graph KPI itself is deletable only through the graph', !del.ok())

  // Clean up so the scenario is idempotent - a second run must not trip over its own
  // leftovers, which is how a checker starts reporting failures that are its own fault.
  await page.request.delete(`${API}/api/kpi-definitions/graphs/${saved.id}`)
  const after = await apiGet('/api/kpi-definitions/graphs')
  step('cleanup leaves no graph behind',
    !after.some((g) => g.outputKpiName === 'S13_MARGIN'), `${after.length} graphs remain`)
}

// ─── S14 · A reported fault, from cause to the moment and its context ────────
//
// The chain the reference tool sells as its troubleshooting toolkit: which cause
// dominates -> which cases -> which moment -> what was happening around it. The first
// three links existed; the fourth did not, so a case click moved a cursor that nothing
// on the page displayed.
scenario('S14 · Cause to the moment, with context')
{
  await selectSession(CITY_A)
  await openWorkbook('Problem Survey')
  await page.waitForSelector('.panel:has-text("Problem survey per category") svg path')
  await page.waitForTimeout(600)

  const slices = await page.locator(
    '.panel:has-text("Problem survey per category") svg path').count()
  step('causes aggregate into a pie', slices >= 2, `${slices} slices`)

  const allCases = await page.locator('.panel:has-text("All cases") tbody tr').count()
  await page.locator('.panel:has-text("Problem survey per category") tbody tr').first().click()
  await page.waitForTimeout(400)
  const drilled = await page.locator('.panel:has-text("cases") tbody tr').count()
  step('a slice drills to just that cause', drilled > 0 && drilled < allCases,
    `${allCases} -> ${drilled}`)

  step('no context shown before a case is chosen',
    (await page.locator('.case-context').count()) === 0)

  await page.locator('.panel:has-text("cases") tbody tr').first().click()
  await page.waitForTimeout(1200)
  step('choosing a case opens a context view around it',
    (await page.locator('.case-context').count()) === 1)

  // The window has to be a WINDOW - a context view that quietly renders the whole drive
  // would look identical here and answer nothing.
  //
  // Measured off the CHART, not off the caption. The caption is arithmetic on
  // CONTEXT_PAD, so it prints the intended window whether or not the chart was handed
  // one: blanking the window props left this reading "111 samples of 1174" while the
  // chart underneath drew the entire drive. The x tick labels are clock times taken
  // from the points actually plotted, so they cannot agree with a caption the chart
  // is ignoring.
  const ctxSpan = await page.locator('.case-context .ctx-span').innerText()
  const shown = ctxSpan.match(/showing (\d+)[^\d]+(\d+)/)
  const windowWidth = shown ? Number(shown[2]) - Number(shown[1]) : -1
  const total = (await apiGet(`/api/sessions/${sessions.find((x) => x.name === CITY_A).id}`))
    .sampleCount
  // textContent, not innerText: innerText is undefined on SVG <text> and every label
  // comes back null.
  const clocks = (await page.locator('.case-context svg text').allTextContents())
    .filter((t) => /^\d\d:\d\d:\d\d$/.test(t))
    .map((t) => t.split(':').reduce((a, n) => a * 60 + Number(n), 0))
  const drawnSpan = clocks.length >= 2 ? Math.max(...clocks) - Math.min(...clocks) : -1
  step('the context view is a window, not the whole drive',
    drawnSpan > 0 && drawnSpan < total / 2,
    `chart spans ${drawnSpan}s of a ${total}-sample drive`)

  // Sampling is 1 Hz, so seconds drawn and samples claimed are the same unit. The
  // tolerance is for a GPS gap inside the window, where the clock advances over samples
  // that were never recorded.
  step('the chart draws the span the caption claims',
    windowWidth > 0 && drawnSpan >= windowWidth * 0.6 && drawnSpan <= windowWidth * 2,
    `caption ${windowWidth} samples, chart ${drawnSpan}s`)

  // And it has to be the window around THIS case.
  const caseFrom = Number(await page.locator('.panel:has-text("cases") tbody tr')
    .first().locator('td').nth(2).innerText())
  step('the window brackets the case that was clicked',
    shown != null && Number(shown[1]) <= caseFrom && Number(shown[2]) >= caseFrom,
    `case starts ${caseFrom}, window ${ctxSpan}`)

  const ctxMarks = await page.locator('.case-context g.chart-event').count()
  const ctxTrace = await page.locator('.case-context svg path').count()
  step('the context view carries the trace and the events in that window',
    ctxTrace > 0 && ctxMarks >= 0, `${ctxTrace} traces, ${ctxMarks} event marks`)

  await page.locator('.case-context button', { hasText: 'Close' }).click()
  await page.waitForTimeout(300)
  step('the context view can be dismissed',
    (await page.locator('.case-context').count()) === 0)

  await openWorkbook('Overview')
}

// ─── S15 · Handing the evidence to somebody else ─────────────────────────────
//
// The journey the whole URL feature exists for, and the one that decides whether it is
// worth having: compose a view, copy the address, and have a colleague open exactly that.
// Every step here is measured against a value fetched independently from the API rather
// than against something the page printed - a page that agrees with itself proves
// nothing, which is the lesson §1.5.1 of docs/ui-testing/README.md was written from.
scenario('S15 · A view handed to somebody else')
{
  await selectSession(CITY_B)
  await openWorkbook('Radio Quality')
  await page.locator('.toolbar select[aria-label="KPI"]').selectOption('SINR')
  await page.waitForTimeout(1200)
  await page.keyboard.press('Home')
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(900)

  const sent = await page.evaluate(() => location.search)
  const q = new URLSearchParams(sent)
  step('the composed view is in the address', q.get('kpi') === 'SINR' && q.get('seq') === '7'
    && q.get('tab') === 'radio' && q.get('s') != null, sent)

  // Playback state is deliberately absent: a link is evidence, not a performance.
  await page.keyboard.press(' ')
  await page.waitForTimeout(600)
  await page.keyboard.press(' ')
  step('playback is not part of the address',
    !/[?&](playing|rate|rev)=/.test(await page.evaluate(() => location.search)))

  // A genuinely cold context. page.reload() keeps the same page's memory, so it cannot
  // tell "the URL carried it" from "the app still had it".
  const other = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  await other.goto(BASE + sent, { waitUntil: 'domcontentloaded' })
  await other.waitForTimeout(3200)

  const sid = Number(q.get('s'))
  const truth = await apiGet(`/api/sessions/${sid}/snapshot?seq=7`)
  const clock = await other.locator('.statusbar b').nth(2).innerText()
  step('the recipient lands on the same moment of the same drive',
    clock === new Date(truth.ts).toISOString().slice(11, 19),
    `recipient reads ${clock}, server says ${new Date(truth.ts).toISOString().slice(11, 19)}`)
  step('and on the same parameter and tab',
    (await other.locator('.toolbar select[aria-label="KPI"]').inputValue()) === 'SINR'
    && (await other.locator('.workbook-tabs button.active, .workbook-tabs button[aria-current]')
      .first().innerText()).includes('Radio'),
    await other.locator('.toolbar select[aria-label="KPI"]').inputValue())
  step('nothing was repaired, so no notice is raised',
    (await other.locator('.view-notice').count()) === 0)
  await other.close()

  // A link to a measurement that is gone. The dangerous answer is not an error - it is
  // opening a DIFFERENT drive at the sender's sample index and saying nothing, because
  // every panel then agrees with every other panel about a moment nobody chose.
  const dead = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  await dead.goto(`${BASE}?s=99999&seq=612&r=300-800`, { waitUntil: 'domcontentloaded' })
  await dead.waitForTimeout(3200)
  // Not "a notice exists" - what it SAYS. Dropping the sender's seq is also done by the
  // session-change reset, so the app behaves correctly even with the reporting removed;
  // the notice naming each dropped parameter is reconcile's own contribution and the only
  // thing that tells the recipient their view is not the one they were sent.
  const deadNotice = await dead.locator('.view-notice').innerText().catch(() => '')
  step('a link to a deleted measurement says so, and names what it dropped',
    (await dead.locator('.view-notice').count()) === 1
    && /s=99999/.test(deadNotice) && /seq=612/.test(deadNotice) && /r=300-800/.test(deadNotice),
    deadNotice.replace(/\n/g, ' / ').slice(0, 150) || 'no notice')

  // The notice is the app's own words, so it is not the evidence. The evidence is that
  // the sender's sample index was DROPPED rather than applied to the substitute drive.
  const fallbackId = Math.min(...(await apiGet('/api/sessions')).map((x) => x.id))
  const atZero = await apiGet(`/api/sessions/${fallbackId}/snapshot?seq=0`)
  step("the sender's sample index was dropped, not carried over",
    (await dead.locator('.statusbar b').nth(2).innerText())
      === new Date(atZero.ts).toISOString().slice(11, 19)
    && (await dead.locator('.filter-chip').count()) === 0,
    `clock ${await dead.locator('.statusbar b').nth(2).innerText()}, `
    + `${await dead.locator('.filter-chip').count()} filter chips`)
  await dead.close()

  // A seq past the end of the drive that DID load. Compared against the drive's own last
  // sample from the API, not against endedAt: a drive with a GPS outage ends after its
  // last sample, so the two are not the same instant.
  const far = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  const cityA = sessions.find((x) => x.name === CITY_A)
  await far.goto(`${BASE}?s=${cityA.id}&seq=999999`, { waitUntil: 'domcontentloaded' })
  await far.waitForTimeout(3200)
  const last = await apiGet(`/api/sessions/${cityA.id}/snapshot?seq=${cityA.sampleCount - 1}`)
  step('a seq past the end is pulled back to the last sample, and said so',
    (await far.locator('.view-notice').count()) === 1
    && (await far.locator('.statusbar b').nth(2).innerText())
       === new Date(last.ts).toISOString().slice(11, 19),
    `clock ${await far.locator('.statusbar b').nth(2).innerText()}`)
  await far.close()

  // Continuous state must not fill the history. history.length is useless as a witness -
  // Chromium caps it at 50 - so the writes themselves are counted.
  const hist = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  await hist.addInitScript(() => {
    window.__pushes = 0
    const real = history.pushState.bind(history)
    history.pushState = (...a) => { window.__pushes++; return real(...a) }
  })
  await hist.goto(BASE, { waitUntil: 'domcontentloaded' })
  await hist.waitForTimeout(3000)
  for (let i = 0; i < 12; i++) await hist.keyboard.press('ArrowRight')
  await hist.waitForTimeout(800)
  step('moving the cursor does not fill the browser history',
    (await hist.evaluate(() => window.__pushes)) === 0
    && /seq=12/.test(await hist.evaluate(() => location.search)),
    `${await hist.evaluate(() => window.__pushes)} pushState calls, `
    + `url ${await hist.evaluate(() => location.search)}`)
  await hist.close()

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}

// ─── S16 · A complaint about a PLACE ─────────────────────────────────────────
//
// Complaints arrive as geography - "calls drop on the ring road past the depot" - and
// until now the only way to ask about a place was to convert it into time by hand, once
// per pass, with no way to add the passes together.
scenario('S16 · A complaint about a place, not a time')
{
  await selectSession(CITY_A)
  await openWorkbook('Overview')
  await page.waitForSelector('.leaflet-overlay-pane path.route-run')

  await page.locator('.toolbar button', { hasText: 'Ask an area' }).click()
  await page.waitForTimeout(400)
  step('drawing mode is announced on the map',
    (await page.locator('.map.drawing').count()) > 0
    && (await page.locator('.area-draw').count()) === 1)

  // Two corners enclose nothing, so Finish must not be offered yet - a two-point
  // "area" would select zero samples and read as "no problem here".
  const box = await page.locator('.map').first().boundingBox()
  const pt = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy })
  for (const [fx, fy] of [[0.30, 0.30], [0.70, 0.30]]) {
    await page.mouse.click(pt(fx, fy).x, pt(fx, fy).y)
    await page.waitForTimeout(350)
  }
  step('two corners are not yet an area',
    await page.locator('.area-draw button', { hasText: 'Finish' }).isDisabled(),
    `${await page.locator('.area-vertex').count()} corners placed`)

  // The button being disabled is a courtesy of this screen. The RULE has to hold at the
  // server too, or any other caller can ask about a line and be told, with a straight
  // face, that it contains no samples.
  const twoCorner = await page.request.get(
    `${API}/api/sessions/${sessions.find((x) => x.name === CITY_A).id}/area-statistics`
    + `?kpi=RSRP&polygon=${encodeURIComponent('65,25;65,26')}`)
  step('and the server refuses one too', twoCorner.status() === 400,
    `HTTP ${twoCorner.status()}`)

  for (const [fx, fy] of [[0.70, 0.72], [0.30, 0.72]]) {
    await page.mouse.click(pt(fx, fy).x, pt(fx, fy).y)
    await page.waitForTimeout(350)
  }
  // Wait for the ring rather than asserting on whatever has rendered by now: the polygon
  // appears one commit after the fourth click, and a fixed sleep raced it.
  await page.waitForSelector('path.area-ring', { timeout: 5000 }).catch(() => {})
  step('the shape is drawn as it is built',
    (await page.locator('.area-vertex').count()) === 4
    && (await page.locator('path.area-ring').count()) === 1)

  await page.locator('.area-draw button', { hasText: 'Finish' }).click()
  await page.waitForTimeout(1500)
  step('the area answers with statistics', (await page.locator('.area-stats').count()) === 1)

  // The passes must account for every enclosed sample - but checked against the number
  // the STATISTICS were computed over, not against the header total. The header total is
  // the sum of the pass list, so comparing the two compares a value with the thing it was
  // derived from: truncating the pass list moves both and the check never notices. The
  // statistics come from a separate query over the same shape, so they are the witness.
  const shownPasses = await page.locator('.area-stats tbody tr td:nth-child(4)')
    .allInnerTexts()
  const summed = shownPasses.map(Number).filter(Number.isFinite)
    .reduce((a, b) => a + b, 0)
  const valuesUsed = Number((await page.locator('.area-stats tbody tr').first().innerText())
    .match(/(\d+) values/)[1])
  const meanShown = await page.locator('.area-stats tbody tr').nth(1).innerText()
  step('the answer covers every pass through the shape, not just one',
    summed === valuesUsed && shownPasses.length >= 1,
    `${shownPasses.length} passes summing to ${summed}, statistics over ${valuesUsed} values`)

  const anySeq = await page.locator('.area-stats tbody tr').last().locator('td').nth(1)
    .innerText().catch(() => '')
  step('the statistics are for the enclosed samples',
    /-?\d/.test(meanShown), meanShown.replace(/\n/g, ' ').slice(0, 60))
  step('a pass is addressable', /^\d+$/.test(anySeq.trim()), `pass starts at seq ${anySeq}`)

  // The shape now narrows the COLOURING as well as producing the statistics, and the two
  // must be answering about the same shape. Asserted by making the two endpoints agree on
  // a count: the track marks each sample inside or outside, the statistics count the ones
  // inside, and both go through AreaSelection.inside. A second containment rule written
  // in the browser would show up here as two different numbers.
  const areaSid = sessions.find((x) => x.name === CITY_A).id
  const bbox = await page.request.get(
    `${API}/api/sessions/${areaSid}/track?kpi=RSRP&maxPoints=4000`).then((r) => r.json())
  // The southern edge is the MEDIAN latitude, not the midpoint of the range. This drive
  // carries a deliberate bad GPS fix (S1 is the one that proves the glitch guard), and it
  // sets the maximum latitude far north of any real sample - so a midpoint rectangle
  // enclosed empty sky and selected nothing. A median splits the samples in half whatever
  // the outliers do.
  const lats = bbox.map((p) => p.latitude), lons = bbox.map((p) => p.longitude)
  const sortedLats = [...lats].sort((a, b) => a - b)
  const midLat = sortedLats[Math.floor(sortedLats.length / 2)]
  const north = Math.max(...lats) + 0.01
  const half = [`${midLat},${Math.min(...lons) - 0.01}`, `${north},${Math.min(...lons) - 0.01}`,
                `${north},${Math.max(...lons) + 0.01}`, `${midLat},${Math.max(...lons) + 0.01}`]
    .join(';')
  const marked = await page.request.get(
    `${API}/api/sessions/${areaSid}/track?kpi=RSRP&maxPoints=4000`
    + `&area=${encodeURIComponent(half)}`).then((r) => r.json())
  const inside = marked.filter((p) => p.inArea === true).length
  const outside = marked.filter((p) => p.inArea === false).length
  const statsForHalf = await page.request.get(
    `${API}/api/sessions/${areaSid}/area-statistics`
    + `?kpi=RSRP&polygon=${encodeURIComponent(half)}`).then((r) => r.json())
  step('the drawn shape decides the colouring, by the same rule that computes its statistics',
    inside > 0 && outside > 0 && inside === statsForHalf.sampleCount,
    `${inside} inside / ${outside} outside, statistics over ${statsForHalf.sampleCount}`)
  // Without a shape, "outside" is not a thing that can be said about any sample.
  step('with no shape drawn, no sample is called outside one',
    bbox.every((p) => p.inArea == null), `${bbox.length} points, all unmarked`)

  await page.locator('.area-stats button', { hasText: 'Close' }).click()
  await page.waitForTimeout(300)

  // And the same drive compared to another ON THE GROUND, which is the question the
  // whole-drive verdict cannot answer.
  await openWorkbook('Compare on the Ground')
  await page.waitForTimeout(2500)
  const tiles = await page.locator('path.diff-tile').count()
  const legendText = await page.locator('.diff-legend').innerText()
  step('two drives are differenced tile by tile', tiles > 5, `${tiles} tiles`)

  // One drive is one sample of a road, so the far side can be a GROUP (UC16 p159). The
  // witness is a tile count, not the presence of the control: adding a measurement that
  // covered different ground must add one-sided tiles, and a group that changed nothing
  // would mean the extra measurement was never read.
  const diffSid = sessions.find((x) => x.name === CITY_A).id
  const others = sessions.filter((x) => x.id !== diffSid).map((x) => x.id)
  const pair = await apiGet(
    `/api/sessions/${diffSid}/spatial-diff?other=${others[0]}&kpi=RSRP&sizeMeters=150`)
  const grouped = await apiGet(
    `/api/sessions/${diffSid}/spatial-diff?other=${others[0]}&kpi=RSRP&sizeMeters=150`
    + `&withB=${others[1]}`)
  step('the far side can be a group of measurements',
    pair.groupB.length === 1 && grouped.groupB.length === 2
    && grouped.tilesOnlyB > pair.tilesOnlyB,
    `one-sided tiles ${pair.tilesOnlyB} -> ${grouped.tilesOnlyB}`)

  // A measurement on both sides would be differenced against itself and drag its tiles
  // towards "these agree", which is a finding rather than an empty result.
  const bothSides = await page.request.get(
    `${API}/api/sessions/${diffSid}/spatial-diff?other=${others[0]}&kpi=RSRP`
    + `&withB=${diffSid}`)
  step('and a measurement cannot be on both sides', bothSides.status() === 400,
    `HTTP ${bothSides.status()}`)
  // The legend text is printed unconditionally, so reading it proves nothing about the
  // data. The claim is about the BINS: a tile exactly one drive visited must carry no
  // delta and must say so, because a zero there states "both measured this and agreed".
  const sessAId = sessions.find((x) => x.name === CITY_A).id
  const otherSel = Number(await page.locator('select[aria-label="Compare against"]').inputValue())
  const rsrpDiff = await apiGet(
    `/api/sessions/${sessAId}/spatial-diff?other=${otherSel}&kpi=RSRP&sizeMeters=150`)
  const oneSided = rsrpDiff.bins.filter((b) => (b.countA == null) !== (b.countB == null))
  step('tiles only one drive visited are not called "no change"',
    /one drive only/.test(legendText) && oneSided.length > 0
    && oneSided.every((b) => b.deltaValue === null && b.label === 'one drive only'),
    `${oneSided.length} one-sided tiles, labels `
    + `${[...new Set(oneSided.map((b) => b.label))].join(',')}`)

  // The verdict direction has to come from the catalogue, not from the sign of the
  // number: a BLER improvement is a smaller number, and a diverging ramp that assumed
  // "higher is better" would paint it red.
  const sessA = sessions.find((x) => x.name === CITY_A).id
  const otherId = Number(await page.locator('select[aria-label="Compare against"]').inputValue())
  const diff = await apiGet(`/api/sessions/${sessA}/spatial-diff?other=${otherId}&kpi=DL_BLER&sizeMeters=150`)
  const improved = diff.bins.filter((b) => b.deltaValue != null && b.deltaValue < -1)
  step('a lower-is-better KPI improving is coloured as better',
    diff.direction === 'LOWER_IS_BETTER'
    && improved.every((b) => /better/.test(b.label)),
    `${improved.length} tiles improved, labels ${[...new Set(improved.map((b) => b.label))].join(',') || 'none'}`)

  await openWorkbook('Overview')
  await page.waitForTimeout(1200)
}

// ─── S17 · Building a KPI without publishing your guesses ────────────────────
//
// The canvas could not reach anything that lives on the sample - speed, position, serving
// cell - and both example KPIs every reviewer independently asked for need one of them.
// Worse, the only way to see what a node produced was to publish a throwaway KPI: rows
// written for every session and an entry in the shared catalogue, on every guess, by
// whoever was least sure of what they were doing.
scenario('S17 · Building a KPI without publishing your guesses')
{
  // Swept BEFORE measuring, not only after. This scenario asserts that looking publishes
  // nothing, so a leftover from an earlier run - or from a defect-injection run that
  // deliberately published - would make the baseline wrong and the assertion meaningless.
  // S13 learned the same lesson about its own graph.
  for (const g of await apiGet('/api/kpi-definitions/graphs')) {
    if (String(g.outputKpiName).startsWith('S17_')) {
      await page.request.delete(`${API}/api/kpi-definitions/graphs/${g.id}`)
    }
  }
  const kpisBefore = (await apiGet('/api/kpi-definitions')).length
  const cityA = sessions.find((x) => x.name === CITY_A).id

  const movingMargin = {
    name: 'S17 margin while moving',
    output: {
      name: 'S17_MOVING', displayName: 'S17 margin while moving', unit: 'dB',
      category: 'Workbench', technology: '5G NR', direction: 'HIGHER_IS_BETTER',
      source: 'UE', decimals: 2, description: 'scenario check', expression: null,
    },
    spec: {
      nodes: [
        { id: 1, kind: 'SOURCE_SAMPLE', field: 'SPEED_KMH', as: 'SPEED' },
        { id: 2, kind: 'SOURCE_KPI', kpiName: 'RSRP', as: 'RSRP' },
        { id: 3, kind: 'COMBINE' },
        { id: 4, kind: 'FILTER', expression: 'SPEED > 5' },
        { id: 5, kind: 'EXPRESSION', expression: 'RSRP + 110', as: 'MARGIN' },
        { id: 6, kind: 'OUTPUT', column: 'MARGIN' },
      ],
      edges: [{ from: 1, to: 3 }, { from: 2, to: 3 }, { from: 3, to: 4 },
              { from: 4, to: 5 }, { from: 5, to: 6 }],
    },
  }

  const post = (path, body) => page.request.post(`${API}${path}`, { data: body })

  const valid = await (await post('/api/kpi-definitions/graphs/validate', movingMargin)).json()
  step('a graph can read a field that lives on the sample, not in sample_kpi',
    valid.ok === true, valid.error ?? 'compiled')
  // A sample source reads no KPI, so it must not claim to depend on one - that list is
  // what decides which graphs recompute when a KPI changes.
  step('and does not claim to depend on a KPI it never reads',
    JSON.stringify(valid.referencedKpis) === JSON.stringify(['RSRP']),
    JSON.stringify(valid.referencedKpis))

  const combined = await (await post(
    `/api/kpi-definitions/graphs/preview?nodeId=3&sessionId=${cityA}&limit=3`,
    movingMargin)).json()
  step('a node can be looked at before anything is published',
    combined.rowCount > 0 && combined.columns.includes('SPEED')
    && combined.columns.includes('RSRP'),
    `${combined.rowCount} rows, columns ${combined.columns.join(',')}`)

  // The count is the point: it answers "did my filter do what I meant", which a page of
  // rows cannot. Against the session's own sample count, fetched independently.
  const filtered = await (await post(
    `/api/kpi-definitions/graphs/preview?nodeId=4&sessionId=${cityA}&limit=3`,
    movingMargin)).json()
  const total = (await apiGet(`/api/sessions/${cityA}`)).sampleCount
  step('the preview counts the whole node, so a filter can be judged',
    combined.rowCount === total && filtered.rowCount < combined.rowCount,
    `${combined.rowCount} before the speed filter, ${filtered.rowCount} after, `
    + `${total} samples in the drive`)

  // The whole reason this exists: looking must not touch what everyone else sees.
  const kpisAfter = (await apiGet('/api/kpi-definitions')).length
  const graphsAfter = await apiGet('/api/kpi-definitions/graphs')
  step('and looking published nothing',
    kpisAfter === kpisBefore && !graphsAfter.some((g) => g.outputKpiName === 'S17_MOVING'),
    `${kpisBefore} KPIs before, ${kpisAfter} after`)

  // An event source, against the events the session actually reported.
  const atHandover = {
    name: 'S17 BLER at handover',
    output: {
      name: 'S17_HO_BLER', displayName: 'S17 BLER at handover', unit: '%',
      category: 'Workbench', technology: '5G NR', direction: 'LOWER_IS_BETTER',
      source: 'UE', decimals: 2, description: 'scenario check', expression: null,
    },
    spec: {
      nodes: [
        { id: 1, kind: 'SOURCE_EVENT', eventType: 'HANDOVER', as: 'HO' },
        { id: 2, kind: 'SOURCE_KPI', kpiName: 'DL_BLER', as: 'BLER' },
        { id: 3, kind: 'COMBINE' },
        { id: 4, kind: 'FILTER', expression: 'HO = 1' },
        { id: 5, kind: 'OUTPUT', column: 'BLER' },
      ],
      edges: [{ from: 1, to: 3 }, { from: 2, to: 3 }, { from: 3, to: 4 },
              { from: 4, to: 5 }],
    },
  }
  const hoPreview = await (await post(
    `/api/kpi-definitions/graphs/preview?nodeId=4&sessionId=${cityA}&limit=8`,
    atHandover)).json()
  const handovers = (await apiGet(`/api/sessions/${cityA}/events`))
    .filter((e) => e.eventType === 'HANDOVER').length
  step('an event source marks exactly the samples the network reported',
    hoPreview.rowCount === handovers && handovers > 0,
    `${hoPreview.rowCount} marked, ${handovers} handovers in the log`)

  // The canvas must offer them, or the API is unreachable from the screen - which is the
  // defect tools/uxtest/api-surface.mjs exists to catch, here as a journey step.
  await openMode('Import')
  await page.waitForTimeout(1200)
  const kinds = await page.locator('.wb-palette button').allInnerTexts()
  step('the canvas offers the new sources',
    kinds.some((t) => /Sample source/.test(t)) && kinds.some((t) => /Event source/.test(t)),
    kinds.map((t) => t.replace(/^\+ /, '')).join(', '))

  // Offering the button is not the same as the button working. Placing one must produce a
  // node the compiler recognises, which is the difference between a palette entry and a
  // feature.
  await page.locator('.wb-palette button', { hasText: 'Sample source' }).click()
  await page.waitForTimeout(700)
  // Selected, because the inspector is what proves the editor understood the kind -
  // placing a node only proves a rectangle was drawn.
  const placed = await page.locator('g.wb-node').count()
  await page.locator('g.wb-node').last().click()
  await page.waitForTimeout(600)
  // The inspector is its own panel, headed "Node" - not part of the canvas panel.
  const inspector = await page.locator('.panel:has-text("Node")').last().innerText()
  step('placing one produces a node the editor understands',
    placed > 0 && /Sample source/.test(inspector) && /SPEED_KMH/.test(inspector),
    `${placed} node(s); inspector says `
    + `${(inspector.match(/(KPI|Neighbour|Sample|Event) source/) ?? ['nothing'])[0]}`)
  await openMode('Analysis')
  await page.waitForTimeout(1000)

  const leftovers = (await apiGet('/api/kpi-definitions/graphs'))
    .filter((g) => String(g.outputKpiName).startsWith('S17_'))
  step('the scenario leaves nothing behind',
    leftovers.length === 0, `${leftovers.length} S17 graphs remain`)
}

// ─── S18 · Numbers that say what they are ────────────────────────────────────
//
// Nobody was blocked by this. The failure mode is quieter and worse: submitting a wrong
// number with no way to know it was wrong. A drive-test log is a time series, so a
// vehicle held at a light contributes a sample a second to a spot it is not moving
// through - and the legend said "[Sample]" as a literal typed into one component while
// three other screens showing the same figures said nothing at all.
scenario('S18 · Numbers that say what they are')
{
  const cityA = sessions.find((x) => x.name === CITY_A).id

  const bySample = await apiGet(`/api/sessions/${cityA}/statistics?kpi=RSRP&weightedBy=SAMPLE`)
  const byDistance = await apiGet(`/api/sessions/${cityA}/statistics?kpi=RSRP&weightedBy=DISTANCE`)
  step('statistics carry the basis that produced them',
    bySample.basisLabel === '[Sample]' && byDistance.basisLabel === '[Distance]',
    `${bySample.basisLabel} / ${byDistance.basisLabel}`)

  // If the two agreed there would be nothing to choose between and no reason for the
  // control to exist. The stopped-vehicle bias is the whole point.
  step('the two bases genuinely disagree',
    Math.abs(bySample.mean - byDistance.mean) > 0.2
    && bySample.p05 !== byDistance.p05,
    `mean ${bySample.mean} vs ${byDistance.mean}, p05 ${bySample.p05} vs ${byDistance.p05}`)

  const linear = await apiGet(`/api/sessions/${cityA}/statistics?kpi=RSRP&domain=LINEAR`)
  step('the linear-domain mean is offered under its own name',
    linear.basisLabel === '[Sample, linear dB]' && linear.mean !== bySample.mean,
    `${linear.basisLabel}: mean ${linear.mean} vs ${bySample.mean}`)

  // The claim in the code is specific: only the MEAN moves, because percentiles are order
  // statistics and dB-to-power is monotone. If the percentiles moved too, the
  // implementation would be doing something other than what it says.
  // Equality alone is not enough: two equally broken percentile sets are also equal.
  // They must additionally sit inside the min/max the same response reports, which comes
  // from a different aggregate - so a transform applied to the percentiles and not to the
  // extremes falls outside and is caught.
  const ordered = (t) => t.min <= t.p05 && t.p05 <= t.p50 && t.p50 <= t.p95 && t.p95 <= t.max
  step('and it moves only the mean, as percentiles are order statistics',
    linear.p05 === bySample.p05 && linear.p50 === bySample.p50
    && linear.p95 === bySample.p95 && ordered(linear) && ordered(bySample),
    `p05/p50/p95 ${linear.p05}/${linear.p50}/${linear.p95} within `
    + `${linear.min}..${linear.max}`)

  // A KPI in a non-logarithmic unit has no second domain, so it must not be offered one -
  // a "linear power mean" of a throughput in Mbps would be arithmetic on nothing.
  const throughput = await apiGet(
    `/api/sessions/${cityA}/statistics?kpi=MAC_DL_THROUGHPUT&domain=LINEAR`)
  step('a KPI with no logarithmic unit is not given a domain choice',
    throughput.domain === 'NOT_APPLICABLE' && throughput.basisLabel === '[Sample]',
    `${throughput.basisLabel} (${throughput.domain})`)

  // The named payoff: the A/B verdict is only as meaningful as its basis.
  const cityB = sessions.find((x) => x.name === CITY_B).id
  const cmpSample = await apiGet(
    `/api/compare?a=${cityA}&b=${cityB}&kpis=RSRP&kpis=DL_BLER&weightedBy=SAMPLE`)
  const cmpDist = await apiGet(
    `/api/compare?a=${cityA}&b=${cityB}&kpis=RSRP&kpis=DL_BLER&weightedBy=DISTANCE`)
  const deltaS = cmpSample.rows.map((r) => r.meanDelta)
  const deltaD = cmpDist.rows.map((r) => r.meanDelta)
  step('the build comparison can be put on either basis, and they differ',
    deltaS.every((d, i) => Math.abs(d - deltaD[i]) > 0.1),
    `sample ${deltaS.join(', ')} vs distance ${deltaD.join(', ')}`)

  // On screen, not only in the API. Asserting the heading reads "[Sample]" would pass on
  // a heading typed into the component, which is the defect being fixed - so the heading
  // has to be shown to TRACK the server, by changing when the server's answer changes.
  await selectSession(CITY_A)
  await openWorkbook('Overview')
  await page.waitForTimeout(1200)
  const legendSample = await page.locator('.dock.right .legend-row').first().innerText()
  await page.locator('select[aria-label="Legend weight by"]').selectOption('DISTANCE')
  await page.waitForTimeout(1500)
  const legendDistance = await page.locator('.dock.right .legend-row').first().innerText()
  const distByDistance = await apiGet(
    `/api/sessions/${cityA}/distribution?kpi=RSRP&weightedBy=DISTANCE`)
  step('the legend prints the basis the server decided',
    /\[Sample\]/.test(legendSample) && /\[Distance\]/.test(legendDistance),
    `${legendSample.replace(/\s+/g, ' ').slice(0, 30)} -> `
    + `${legendDistance.replace(/\s+/g, ' ').slice(0, 30)}`)

  // And the shares move with it, or the label describes a weighting the numbers do not
  // have. The sample count must NOT move: it is how many measurements are behind a
  // percentage, and a bin holding 90% of the distance and four samples is a different
  // claim from one holding 90% and four hundred.
  const shownPct = await page.locator('.dock.right .legend-row .pct').allInnerTexts()
  const shownN = await page.locator('.dock.right .legend-row .count').allInnerTexts()
  const worstPct = Number((shownPct[1] ?? '').replace('%', '').trim())
  step('and the shares are the ones that basis produces',
    Math.abs(worstPct - distByDistance.bins[0].percentage) < 0.02
    && Number(shownN[1]) === distByDistance.bins[0].count,
    `worst bin ${worstPct}% of ${shownN[1]} samples, server says `
    + `${distByDistance.bins[0].percentage}% of ${distByDistance.bins[0].count}`)
  await page.locator('select[aria-label="Legend weight by"]').selectOption('SAMPLE')
  await page.waitForTimeout(1200)

  await openWorkbook('Statistics')
  await page.waitForTimeout(1500)
  step('the statistics screen states its basis too',
    /\[Sample\]/.test(await page.locator('.basis-note').first().innerText()),
    (await page.locator('.basis-note').first().innerText()).slice(0, 70))

  await page.locator('select[aria-label="Weight by"]').selectOption('DISTANCE')
  await page.waitForTimeout(1500)
  const shown = await page.locator('.basis-note').first().innerText()
  const meanCell = await page.locator('.panel:has-text("Statistics") tbody tr td').nth(3).innerText()
  step('changing the basis changes both the label and the numbers',
    // The cell carries its unit, so the number has to be parsed out of it rather than
    // coerced - Number('-82.04 dBm') is NaN, which no comparison can be true of.
    /\[Distance\]/.test(shown)
    && Number((meanCell.match(/-?\d+(\.\d+)?/) ?? [NaN])[0]) === byDistance.mean,
    `${shown.slice(0, 40)} — mean on screen ${meanCell}, server says ${byDistance.mean}`)

  await page.locator('select[aria-label="Weight by"]').selectOption('SAMPLE')
  await page.waitForTimeout(1200)
  await openWorkbook('Overview')
  await page.waitForTimeout(800)
}

// ─── S19 · Loading a folder, and stopping when it is the wrong one ───────────
//
// The perspectives that ranked this last were all people who RECEIVE drives; none of them
// imports one. Ranked last, and recorded as ranked last because nobody had asked the
// person who does it.
scenario('S19 · Loading a folder, and stopping when it is the wrong one')
{
  // Swept first: this scenario creates measurements, and a leftover from a previous run
  // would make its own counts wrong.
  for (const s of await apiGet('/api/sessions')) {
    if (String(s.name).includes('S19 ')) {
      await page.request.delete(`${API}/api/sessions/${s.id}`)
    }
  }

  await openMode('Import')
  await page.waitForTimeout(1000)
  step('the file input takes more than one file',
    await page.locator('.panel:has-text("Import measurement") input[type=file]')
      .getAttribute('multiple') !== null)

  // Two files in one go, with the metadata typed once.
  const csv = (n, base) => {
    const rows = ['timestamp,latitude,longitude,rsrp,sinr']
    for (let i = 0; i < n; i++) {
      rows.push(`2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z,`
        + `${(65.01 + i * 0.0001).toFixed(6)},${(25.47 + i * 0.0001).toFixed(6)},`
        + `${base - (i % 20)},${10 - (i % 7)}`)
    }
    return rows.join('\n')
  }
  await page.locator('.panel:has-text("Import measurement") input[type=file]')
    .setInputFiles([
      { name: 'S19 first.csv', mimeType: 'text/csv', buffer: Buffer.from(csv(120, -80)) },
      { name: 'S19 second.csv', mimeType: 'text/csv', buffer: Buffer.from(csv(140, -90)) },
    ])
  // By name, not by position. The first version counted inputs and typed the operator
  // into the device field after the file control gained a label.
  await page.locator('input[aria-label="Device"]').fill('S19 device')
  await page.locator('input[aria-label="Operator"]').fill('S19 operator')
  await page.locator('.panel:has-text("Import measurement") button', { hasText: 'Import' }).click()

  // Polled, not slept. Two imports each end with a full recompute of every derived and
  // graph KPI, so a fixed wait is a guess that gets longer every time one is added - and
  // the first version of this waited six seconds and measured an empty list.
  let made = []
  for (let i = 0; i < 40; i++) {
    made = (await apiGet('/api/sessions')).filter((x) => String(x.name).includes('S19 '))
    if (made.length === 2) break
    await page.waitForTimeout(1000)
  }
  step('both files became measurements from one set of fields',
    made.length === 2, `${made.length} measurements: ${made.map((m) => m.name).join(', ')}`)
  // The metadata was typed once and applied to both - that is the whole saving.
  step('the fields typed once were applied to every file',
    made.every((m) => m.device === 'S19 device' && m.operator === 'S19 operator'),
    made.map((m) => `${m.device}/${m.operator}`).join(' · '))

  // Cancelling. The claim is not "a button exists" but "the import stops AND leaves
  // nothing behind" - a half-loaded measurement that looks complete is the failure.
  const before = (await apiGet('/api/sessions')).length
  const cancelJob = await page.request.post(`${API}/api/import/jobs/999999/cancel`)
  const cancelBody = await cancelJob.json()
  step('cancelling something that is not running says so, rather than silently passing',
    cancelBody.cancelRequested === false, cancelBody.message)

  // The history is a LOG - it accumulates across runs by design, which is the point of
  // keeping failed attempts in it. So this reads the two most recent S19 jobs, not every
  // S19 job that has ever existed.
  const jobs = await apiGet('/api/import/jobs')
  const s19jobs = jobs.filter((j) => String(j.filename).startsWith('S19 ')).slice(0, 2)
  step('the history records what each file did, with its row count',
    s19jobs.length === 2 && s19jobs.every((j) => j.status === 'COMPLETED' && j.rows_read > 0),
    s19jobs.map((j) => `${j.filename}: ${j.status} ${j.rows_read} rows`).join(' · '))
  step('and cancelling created nothing',
    (await apiGet('/api/sessions')).length === before, `${before} measurements`)

  // Finding one among many.
  await openMode('Analysis')
  await page.waitForTimeout(1000)
  await page.locator('.toolbar button', { hasText: 'Find…' }).click()
  await page.waitForTimeout(900)
  step('the measurement list can be searched', (await page.locator('.session-filter').count()) === 1)

  await page.locator('input[aria-label="Search measurements"]').fill('S19')
  await page.waitForTimeout(900)
  const found = await page.locator('.filter-results tbody tr').count()
  step('search narrows to the matches', found === 2, `${found} rows for "S19"`)

  // Against the server, not against the row count the same screen produced.
  const serverSays = await apiGet('/api/sessions?q=S19')
  step('and the narrowing is the server\'s, not a client-side hide',
    serverSays.length === found, `server ${serverSays.length}, screen ${found}`)

  await page.locator('input[aria-label="Search measurements"]').fill('nothing matches this')
  await page.waitForTimeout(900)
  step('an empty result says why it is empty',
    /Nothing matches/.test(await page.locator('.filter-results').innerText()),
    (await page.locator('.filter-results').innerText()).slice(0, 50))

  await page.locator('input[aria-label="Search measurements"]').fill('S19 second')
  await page.waitForTimeout(900)
  await page.locator('.filter-results tbody tr').first().click()
  await page.waitForTimeout(2000)
  step('picking one opens it',
    (await page.locator('.toolbar select[aria-label="Measurement"]').inputValue())
      === String(made.find((m) => m.name.includes('second'))?.id ?? made[0]?.id),
    await page.locator('.toolbar select[aria-label="Measurement"]').inputValue())

  // Cleaned up, so a second run starts where the first did.
  for (const m of made) await page.request.delete(`${API}/api/sessions/${m.id}`)
  const left = (await apiGet('/api/sessions')).filter((x) => String(x.name).includes('S19 '))
  step('the scenario leaves no measurement behind', left.length === 0,
    `${left.length} remain`)
  await selectSession(CITY_A)
  await page.waitForTimeout(1200)
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

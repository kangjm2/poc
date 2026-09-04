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
import { chromiumPath } from '../tools/uxtest/browser.mjs'

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
  executablePath: chromiumPath(),
  ...(PROXY ? { proxy: { server: PROXY, bypass: 'localhost,127.0.0.1,::1' } } : {}),
  args: ['--ignore-certificate-errors'],
})
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

const apiGet = async (path) => (await page.request.get(`${API}${path}`)).json()

/**
 * An exported CSV split into what it says about itself and what it contains.
 *
 * Three separate steps used to treat line 0 as the header. Once an export opens with
 * '# key: value' provenance lines, `lines[0]` is a comment, and S11 was the sharp case -
 * it EDITED line 0 to add two unknown columns and then appended a value pair to every
 * line after it.
 *
 * Run against a file with six preamble lines that does something quietly absurd, which was
 * measured rather than guessed: the two column NAMES land on a comment, and the header -
 * now line 5 - receives the value pair meant for the fifth data row. The file that gets
 * imported has two extra columns called `6` and `3.31`, its rows and header agree on the
 * count, and the two named columns the scenario is about never exist. It would have gone
 * red, but with a message about missing KPI definitions rather than about the header -
 * which is the kind of red somebody fixes by loosening the assertion.
 *
 * So the rule lives here once. `preamble` is asserted on directly by the export steps -
 * a file that stops saying what condition made it is a regression this suite must see.
 */
/**
 * One CSV line into its cells, honouring quotes.
 *
 * `split(',')` was wrong here and passed anyway, which is the worse kind of wrong: the
 * provenance columns hold sentences, several of them with commas ("yes - bins are
 * quartiles of this measurement, no pass/fail implied"), so a naive split returned a
 * fragment and the assertions that matched a prefix still went green. A checker that reads
 * the file differently from the way the file is written is not reading the file.
 */
const csvCells = (line) => {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
    } else if (ch === ',' && !quoted) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out
}

const csvParts = (text) => {
  const lines = text.trim().split('\n')
  const headerAt = lines.findIndex((l) => !l.startsWith('#'))
  return {
    preamble: lines.slice(0, headerAt === -1 ? lines.length : headerAt),
    header: headerAt === -1 ? '' : lines[headerAt],
    rows: headerAt === -1 ? [] : lines.slice(headerAt + 1),
  }
}
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
// A run starts from the seeded four drives, whatever an aborted previous run left behind.
//
// Not tidiness: a scenario here imports a drive with NO build label and no scenario, and one
// such drive left in the database makes the cohort screen's hold-constant guard refuse
// outright - so a leftover does not linger quietly, it changes what an EARLIER scenario
// measures on the next run. The clean-up at the end of each scenario cannot cover the case
// where the run died before reaching it, so the baseline is established here instead.
for (const stale of await apiGet('/api/sessions')) {
  if (/^S\d+ /.test(stale.name)) await page.request.delete(`${API}/api/sessions/${stale.id}`)
}
await page.request.delete(`${API}/api/kpi-definitions/S24_MARGIN_DB`)

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
  const parts = csvParts(await csv.text())
  step('CSV export carries the full drive', csv.ok()
    && parts.rows.length === meta.sampleCount && parts.header.includes('RSRP'),
    `${parts.rows.length} rows`)

  // The file has to say what made it. Unfiltered, that is still a claim - 'none' is the
  // difference between a file that was not narrowed and a file written before anyone
  // thought to say. Both halves are checked because either alone survives the other's
  // removal: the preamble is lost when rows are pasted elsewhere, the column is all the
  // reader has then.
  step('and says what condition made it, above the header and in every row',
    parts.preamble.some((l) => l.startsWith('# measurement:'))
    && parts.header.split(',').includes('global_filter')
    && parts.rows.length > 0
    && parts.rows.every((r) => csvCells(r).slice(-1)[0] === 'none'),
    `${parts.preamble.length} preamble lines, last column ${
      csvCells(parts.header).slice(-1)[0]}`)
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
  // Waits for the recompute, not for the clock. At a fixed 1500 ms this read the PRE-swap
  // meta on a loaded machine and failed while the application was behaving correctly - and
  // an intermittent step is one nobody trusts when it finally catches something. It still
  // fails if the swap never recomputes; it just stops failing because the box was busy.
  let meta2 = ''
  for (let i = 0; i < 25 && !/900 samples/.test(meta2); i++) {
    await page.waitForTimeout(400)
    meta2 = await page.locator('.panel > header .meta').first().innerText()
  }
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
  const parts = csvParts(csv)
  // Two columns no catalogue of ours has ever contained: one integer, one with
  // two decimals and a unit in the conventional parenthetical form. Appended to the
  // HEADER - it used to be `lines[0]`, which is a provenance comment now, and appending
  // them there would have imported a file with neither column while still passing.
  const withUnknown = [
    ...parts.preamble,
    `${parts.header},Beam SSB index,Custom margin (dB)`,
    ...parts.rows.map((r, i) => `${r},${(i + 1) % 8},${(3.25 + (i + 1) * 0.01).toFixed(2)}`),
  ].join('\n')

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

  // A real log need not carry a serving-cell column, and every seeded drive does - so this
  // is the shape of defect no checker over the seed can see. `serving_pci` is nullable, the
  // row mapper hands back a list whose first element is null, and `Stream.findFirst()` throws
  // NPE on a null element rather than returning empty: 500 on every cursor move, and the
  // Monitored Set and Mobility overlay simply blank with nothing on screen to say why.
  const noPci = await page.request.post(`${API}/api/import/csv`, {
    multipart: {
      file: { name: 'S11 no-pci.csv', mimeType: 'text/csv',
              buffer: Buffer.from('lat,lon,rsrp\n65.01,25.47,-88\n65.02,25.48,-91\n') },
      sessionName: 'S11 no serving cell',
    },
  })
  const noPciId = noPci.ok() ? (await noPci.json()).sessionId : null
  const mon = noPciId == null ? null
    : await page.request.get(`${API}/api/sessions/${noPciId}/monitored-set?seq=0`)
  step('a drive with no serving-cell column still answers the neighbour panel',
    noPci.ok() && mon?.ok() === true,
    noPciId == null ? `import ${noPci.status()}` : `import 200, monitored-set ${mon.status()}`)
  if (noPciId != null) await page.request.delete(`${API}/api/sessions/${noPciId}`)

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
  // Read from the track, which AnalysisService builds from `sample.serving_pci`, rather
  // than from the monitored-set response again: MonitoredSetService sets the `serving`
  // flag BY comparing to `servingPci`, so the two fields of one response agreed by
  // construction and the check could not have failed.
  const trackAt = (await apiGet(`/api/sessions/${cityId}/track?kpi=RSRP`))
    .find((p) => p.seq === seq)
  step('it is the one `sample` records as serving',
    serving[0]?.pci != null && serving[0].pci === trackAt?.servingPci,
    `monitored set says ${serving[0]?.pci}, the track says ${trackAt?.servingPci}`)

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
  // RSRQ, and the rule's own threshold. This read SINR against `< 5`, which is a
  // different KPI and a number from nowhere: MonitoredSetService binds
  // QUALITY_KPI = "RSRQ" against POLLUTION_MAX_SERVING_RSRQ_DB = -15, and documents at
  // length why not SINR (it carries the receiver's performance, so the same road and the
  // same pilots give a different verdict on a different modem).
  //
  // §1.5.12 - THIS STEP HAS NO WITNESS ON SEEDED DATA, and saying so is the point.
  // Removing the RSRQ join entirely was tried and this suite stayed green at 1 span: the
  // generator derives each cell's rsrq from the same per-cell powers the window test
  // reads, so a crowded sample here is always also a low-RSRQ one and the gate excludes
  // nothing to observe. The service's own comment predicts exactly that. What the step
  // does buy is that the reported spans really are on a degraded link, read back from the
  // snapshot rather than from the query that produced them - it would catch a rule
  // inverted or bound to the wrong column. It would not catch the rule being deleted.
  // A real witness needs a measurement where quality arrives independently of the
  // neighbour powers, which is an imported drive with neighbour rows - something the
  // importer does not yet load.
  const pollutedQuality = []
  for (const sp of spans) {
    const snap = await apiGet(`/api/sessions/${cityId}/snapshot?seq=${sp.fromSeq}`)
    const rsrq = Object.values(snap.byCategory ?? {}).flat()
      .find((r) => r.kpi === 'RSRQ')?.value
    if (rsrq != null) pollutedQuality.push(rsrq)
  }
  step('every polluted sample has a degraded serving link',
    pollutedQuality.length > 0 && pollutedQuality.every((v) => v < -15),
    pollutedQuality.length ? `RSRQ: ${pollutedQuality.join(', ')}` : 'no RSRQ read')

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
  // `ctxMarks >= 0` is a tautology on a Playwright count, so the step named two things and
  // asserted one. The window is chosen to bracket a problem case, and every seeded case has
  // at least one event in it, so the honest assertion is that both are there.
  step('the context view carries the trace and the events in that window',
    ctxTrace > 0 && ctxMarks > 0, `${ctxTrace} traces, ${ctxMarks} event marks`)

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
    // `improved.length > 0 &&` first: `every` is true of an empty array, so without it a
    // change that stopped producing improved tiles at all would read as a pass. The same
    // guard sits fourteen lines above on `oneSided`; this one was missed.
    diff.direction === 'LOWER_IS_BETTER' && improved.length > 0
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

  // And now a REAL one. Everything above this exercises the "that import is not running"
  // branch: the loading loop, the flag read at the batch boundary, the rollback and the
  // CANCELLED row were all untested, which is the entire claim the step above makes.
  //
  // 40,000 rows because the flag is only read every 5,000 (ImportService.BATCH) and the
  // load has to still be running when the cancel arrives - measured at ~7 s here, against
  // a poll that finds the job inside a second.
  const rows = ['ts,latitude,longitude,rsrp']
  const t0 = Date.parse('2026-01-01T00:00:00Z')
  for (let i = 0; i < 40000; i++) {
    rows.push(`${new Date(t0 + i * 1000).toISOString()},65.0${String(i % 900).padStart(3, '0')}`
              + `,25.47${String(i % 900).padStart(3, '0')},${-70 - (i % 40)}`)
  }
  const bigName = 'S19 cancel me.csv'
  // Not awaited: the endpoint is synchronous, so awaiting it here would mean waiting for
  // the very load we intend to interrupt.
  const running = page.request.post(`${API}/api/import/csv`, {
    multipart: {
      file: { name: bigName, mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) },
      sessionName: 'S19 cancelled measurement',
    },
    timeout: 120000,
  })
  let liveJob = null
  for (let i = 0; i < 60 && liveJob == null; i++) {
    await page.waitForTimeout(150)
    liveJob = (await apiGet('/api/import/jobs'))
      .find((j) => j.filename === bigName && j.status === 'RUNNING') ?? null
  }
  const asked = liveJob
    ? await (await page.request.post(`${API}/api/import/jobs/${liveJob.id}/cancel`)).json()
    : { cancelRequested: false, message: 'never saw it running' }
  step('a running import can be found and asked to stop',
    liveJob != null && asked.cancelRequested === true,
    `${liveJob ? `job ${liveJob.id}` : 'no RUNNING job seen'} - ${asked.message}`)

  const stoppedResp = await running
  // 409, which is what ImportStopped exists to produce. It answered 500 until the handler
  // that reads it was written - the type carried a comment promising 409 and no
  // @ExceptionHandler named it, and no check had ever taken this path.
  step('the interrupted request answers 409, not a fault',
    stoppedResp.status() === 409,
    `HTTP ${stoppedResp.status()} ${JSON.stringify(await stoppedResp.json()).slice(0, 80)}`)

  const cancelledJob = (await apiGet('/api/import/jobs')).find((j) => j.filename === bigName)
  step('the history records it as CANCELLED, with how far it got',
    cancelledJob?.status === 'CANCELLED'
    && cancelledJob.rows_read > 0 && cancelledJob.rows_read < 40000,
    `${cancelledJob?.status} after ${cancelledJob?.rows_read} of 40000 rows`)

  // The point of the whole exercise: a cancelled import is not a small measurement, it is
  // no measurement.
  const leftBehind = (await apiGet('/api/sessions'))
    .find((x) => x.name === 'S19 cancelled measurement')
  step('and the stopped import left no measurement behind, not even a short one',
    leftBehind == null,
    leftBehind ? `session ${leftBehind.id} survived with ${leftBehind.sampleCount} samples`
      : 'nothing was created')

  // The history is a LOG - it accumulates across runs by design, which is the point of
  // keeping failed attempts in it. So this reads the two most recent S19 jobs, not every
  // S19 job that has ever existed.
  const jobs = await apiGet('/api/import/jobs')
  // The two uploaded files by name, not "the two most recent S19 jobs" - the cancelled
  // one above is also an S19 job and is more recent than both.
  const s19jobs = jobs
    .filter((j) => j.filename === 'S19 first.csv' || j.filename === 'S19 second.csv')
    .slice(0, 2)
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

// ─── S20 · One condition, every screen ───────────────────────────────────────
//
// UC5's claim is the whole point and the whole risk: "all operations performed with Nemo
// Analyze" answer through one condition. A filter that nine screens honour and four
// ignore is worse than none, because the four look exactly like the nine. So this
// scenario does not check that filtering "works" - it checks the word GLOBAL, twice
// over: that the requests the app actually issues carry it wherever the server says they
// must, and that the endpoints then agree on ONE number rather than each returning its
// own plausible one.
scenario('S20 · One condition, every screen')
{
  const SPEC = 'kpi:RSRQ:>=:-12'
  const enc = encodeURIComponent(SPEC)
  const coverage = await apiGet('/api/global-filter/coverage')
  const honoured = coverage.filter((c) => c.honoured)
  const exempt = coverage.filter((c) => !c.honoured)
  step('the server publishes what the filter reaches and what it does not',
    honoured.length >= 10 && exempt.length >= 5,
    `${honoured.length} honoured, ${exempt.length} exempt`)

  // Every exemption carries a reason. An unexplained one is indistinguishable from a
  // screen that simply forgot, which is the failure this list exists to prevent.
  step('every exemption says why', exempt.every((c) => (c.note ?? '').length > 20),
    exempt.filter((c) => (c.note ?? '').length <= 20).map((c) => c.path).join(', ') || 'all explained')

  // ── the numbers. One drive, one condition, one count - from twelve different queries.
  const sid = sessions.find((s) => s.name === CITY_A).id
  const csvRows = async (qs) =>
    csvParts(await (await page.request.get(`${API}/api/sessions/${sid}/export.csv${qs}`)).text())
      .rows.length
  // One column of an exported result, by name off its own header - never by position,
  // because a column added in the middle would silently move every assertion one over.
  const csvValues = async (qs, column) => {
    const p = csvParts(await (await page.request
      .get(`${API}/api/sessions/${sid}/export.csv${qs}`)).text())
    const at = csvCells(p.header).indexOf(column)
    if (at < 0) return []
    return p.rows.map((r) => csvCells(r)[at])
  }
  const numbers = async (qs, amp) => ({
    statistics: (await apiGet(`/api/sessions/${sid}/statistics?kpi=RSRP${amp}`)).count,
    distribution: (await apiGet(`/api/sessions/${sid}/distribution?kpi=RSRP${amp}`)).total,
    track: (await apiGet(`/api/sessions/${sid}/track?kpi=RSRP&maxPoints=100000${amp}`)).length,
    cellBreakdown: (await apiGet(`/api/sessions/${sid}/cell-breakdown?kpi=RSRP${amp}`)).total,
    series: (await apiGet(`/api/sessions/${sid}/series?kpis=RSRP&maxPoints=100000${amp}`))[0]
      .points.length,
    bins: (await apiGet(`/api/sessions/${sid}/bins?kpi=RSRP&sizeMeters=150${amp}`))
      .reduce((a, b) => a + b.sampleCount, 0),
    footprints: (await apiGet(
      `/api/sessions/${sid}/cell-footprints?minSamples=10&basis=SERVING${amp}`))
      .reduce((a, b) => a + b.sampleCount, 0),
    geojson: (await apiGet(`/api/sessions/${sid}/export.geojson?kpi=RSRP${amp}`)).features.length,
    csv: await csvRows(qs),
    // The RESULT exports, reduced to the same number. A tile export that forgot to pass
    // the condition down to /bins would answer with the whole drive's tiles, and per-file
    // "it got smaller" assertions would pass it - both files DO get smaller when the tile
    // count drops. Only the shared number catches a file that narrowed differently from
    // the screen it came from. §1.5.10.
    binsCsv: (await csvValues(`?result=bins&kpi=RSRP&sizeMeters=150${amp}`, 'samples'))
      .reduce((a, b) => a + Number(b), 0),
    binsGeo: (await apiGet(
      `/api/sessions/${sid}/export.geojson?result=bins&kpi=RSRP&sizeMeters=150${amp}`))
      .features.reduce((a, f) => a + Number(f.properties.samples), 0),
    distributionCsv: (await csvValues(`?result=distribution&kpi=RSRP${amp}`, 'count'))
      .reduce((a, b) => a + Number(b), 0),
  })
  const whole = await numbers('', '')
  const narrowed = await numbers(`?filter=${enc}`, `&filter=${enc}`)

  const wholeSet = [...new Set(Object.values(whole))]
  step('unfiltered, every analytic reads the same whole drive',
    wholeSet.length === 1, JSON.stringify(whole))

  // The witness that matters. Twelve independent queries - six of them writing files
  // rather than JSON - reduced to ONE number, so an endpoint that quietly skipped the
  // filter shows up as a second number rather than as a plausible screen.
  const narrowSet = [...new Set(Object.values(narrowed))]
  step('filtered, they all read the same narrower drive - one number, twelve queries',
    narrowSet.length === 1 && narrowSet[0] < wholeSet[0] && narrowSet[0] > 0,
    JSON.stringify(narrowed))

  // Degradation and area statistics answer a different shape, so they are witnessed
  // separately rather than folded into the count above.
  const degWhole = (await apiGet(
    `/api/sessions/${sid}/degradations?kpi=RSRP&minSamples=5`)).length
  const degNarrow = (await apiGet(
    `/api/sessions/${sid}/degradations?kpi=RSRP&minSamples=5&filter=${enc}`)).length
  step('the degradation list is narrowed too', degNarrow < degWhole,
    `${degWhole} stretches whole, ${degNarrow} filtered`)

  // A shape and a filter are two different narrowings and both must apply: the polygon
  // says where to look, the filter says which samples count anywhere.
  const trackPts = await apiGet(`/api/sessions/${sid}/track?kpi=RSRP&maxPoints=100000`)
  const mid = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  // The MEDIAN, not the range midpoint: this drive carries a deliberate GPS glitch, and a
  // box centred on the midpoint of the latitude RANGE lands on empty ground.
  const mLat = mid(trackPts.map((p) => p.latitude))
  const mLon = mid(trackPts.map((p) => p.longitude))
  const d = 0.01
  const ring = encodeURIComponent([
    [mLat - d, mLon - d], [mLat - d, mLon + d], [mLat + d, mLon + d], [mLat + d, mLon - d],
  ].map(([a, b]) => `${a},${b}`).join(';'))
  const areaWhole = await apiGet(
    `/api/sessions/${sid}/area-statistics?kpi=RSRP&polygon=${ring}`)
  const areaNarrow = await apiGet(
    `/api/sessions/${sid}/area-statistics?kpi=RSRP&polygon=${ring}&filter=${enc}`)
  step('a drawn shape and the filter both apply, not one or the other',
    areaWhole.sampleCount > 0 && areaNarrow.sampleCount > 0
    && areaNarrow.sampleCount < areaWhole.sampleCount
    && areaNarrow.statistics.count === areaNarrow.sampleCount,
    `${areaWhole.sampleCount} in shape, ${areaNarrow.sampleCount} in shape and filter`)

  // The report is the artefact read furthest from the screen that made it, so it is the
  // one that must SAY the condition as well as apply it.
  const reportOn = await (await page.request.get(
    `${API}/api/sessions/${sid}/report.html?filter=${enc}`)).text()
  const reportOff = await (await page.request.get(
    `${API}/api/sessions/${sid}/report.html`)).text()
  step('the report applies the filter and prints it in its own metadata',
    /Global filter/.test(reportOn) && /RSRQ &gt;= -12/.test(reportOn)
    && !/Global filter/.test(reportOff),
    reportOn.match(/Global filter<\/th><td>[^<]*/)?.[0] ?? 'not named')

  // ── the app. Not "does the server filter" but "does the SCREEN ask it to", on every
  //    request it issues, which is the half a server-side check cannot see.
  const asked = []
  const record = (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/api/')) asked.push({ path: u.pathname, search: u.search })
  }
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await selectSession(CITY_A)

  const bar = page.locator('.globalfilter')
  step('with nothing set, the bar says so in the reference\'s own words',
    /No global filters/.test(await bar.innerText()), (await bar.innerText()).slice(0, 60))

  await page.locator('#gf-spec').fill(SPEC)
  page.on('request', record)
  await bar.locator('button', { hasText: 'Apply' }).click()
  await page.waitForTimeout(2000)

  step('the bar states the filter in force, in the server\'s words',
    /In force/.test(await bar.innerText()) && /RSRQ >= -12/.test(await bar.innerText()),
    (await bar.innerText()).replace(/\n/g, ' / ').slice(0, 90))

  // Walk the screens that fetch, so the recording covers more than one endpoint.
  await page.locator('.toolbar select[aria-label="Area bins"]').selectOption('150')
  await page.waitForTimeout(1400)
  await page.locator('.toolbar select[aria-label="Area bins"]').selectOption('0')
  await page.waitForTimeout(900)
  await page.locator('.toolbar .group:has(label:text("Footprints")) button').click()
  await page.waitForTimeout(1400)
  await openWorkbook('Cells')
  await page.waitForTimeout(900)
  await openWorkbook('Statistics')
  await page.waitForTimeout(900)
  await openWorkbook('Overview')
  await page.waitForTimeout(900)
  page.off('request', record)

  const rx = (tpl) => new RegExp('^' + tpl.replace(/\{id\}/g, '\\d+') + '$')
  const carried = (r) => /[?&]filter=/.test(r.search)
  const hitHonoured = asked.filter((r) => honoured.some((c) => rx(c.path).test(r.path)))
  const hitExempt = asked.filter((r) => exempt.some((c) => rx(c.path).test(r.path)))
  const distinct = new Set(hitHonoured.map((r) => r.path.replace(/\d+/g, '{id}'))).size

  // The guard that keeps this check from passing on nothing: a walk that fetched two
  // endpoints would satisfy "every one carried it" and prove almost nothing.
  step('the walk actually exercised most of the honoured analytics',
    distinct >= 6, `${distinct} distinct honoured endpoints requested`)
  step('every honoured request the app made carried the filter',
    hitHonoured.length > 0 && hitHonoured.every(carried),
    hitHonoured.filter((r) => !carried(r)).map((r) => r.path).join(', ') || 'all carried it')
  // Over-application is the other half. Sending it to an endpoint the server lists as
  // exempt would either 400 or - worse - be ignored, and the screen would then be
  // filtered in name only.
  step('and no exempt request carried it',
    hitExempt.length > 0 && !hitExempt.some(carried),
    hitExempt.filter(carried).map((r) => r.path).join(', ') || `${hitExempt.length} exempt calls, none filtered`)

  // ── the footprint tooltip must never render absence as a level. Under the three-strongest
  //    basis a cell can shape a hull it never served, and its mean used to fall back to 0 -
  //    a value about 80 dB above anything this catalogue can report, printed where "none"
  //    belongs. Checked on the response rather than the pixel: the tooltip formats what
  //    arrives, so a null here is what makes the em dash possible.
  const serving = await apiGet(`/api/sessions/${sid}/cell-footprints?minSamples=10&basis=SERVING`)
  const tops = await apiGet(`/api/sessions/${sid}/cell-footprints?minSamples=10&basis=TOP3`)
  const servingBy = Object.fromEntries(serving.map((f) => [f.pci, f]))
  // The count and the mean must describe ONE set. Under the three-strongest basis the count
  // grew to the contended samples while the mean stayed the serving one, so the tooltip
  // paired a number from each. It is also physically checkable: a cell is weaker where it
  // merely competes than where it wins, so the wider set's mean must be the lower one.
  const paired = tops.filter((f) => servingBy[f.pci])
  const mismatched = paired.filter((f) =>
    f.sampleCount <= servingBy[f.pci].sampleCount
    || f.avgRsrp == null || f.avgRsrp >= servingBy[f.pci].avgRsrp)
  step('a footprint\u2019s level is the mean of the samples it counted, not of another set',
    paired.length > 0 && mismatched.length === 0
    && !tops.some((f) => f.avgRsrp === 0),
    paired.map((f) => `PCI ${f.pci}: ${f.sampleCount}@${f.avgRsrp} vs serving `
      + `${servingBy[f.pci].sampleCount}@${servingBy[f.pci].avgRsrp}`).slice(0, 2).join(' \u00b7 '))

  // ── the distance profile. It was in NEITHER list, which is the sharpest shape this
  //    mechanism can fail in: S20 checks that honoured paths carry the filter and exempt
  //    paths do not, so a path in neither list passes whatever it does. The reader saw the
  //    whole drive's profile beside six filtered panels with no exemption note anywhere.
  //
  //    Two numbers, opposite directions: the VALUES narrow, and the AXIS does not - a
  //    filtered profile that also shortened the road would make two profiles of one drive
  //    incomparable, which is the reason the `travelled` CTE stays unfiltered.
  const profile = async (amp) => {
    const bins = await apiGet(`/api/sessions/${sid}/distance-bins?kpi=RSRP&stepMeters=250${amp}`)
    return {
      bins: bins.length,
      samples: bins.reduce((a, b) => a + b.sampleCount, 0),
      road: Math.max(...bins.map((b) => b.toMetres)),
    }
  }
  const wholeRoad = await profile('')
  const narrowedRoad = await profile(`&filter=${enc}`)
  step('the distance profile joins the same one number the other nine agree on',
    wholeRoad.samples === wholeSet[0] && narrowedRoad.samples === narrowSet[0],
    `${wholeRoad.samples} whole (others ${wholeSet[0]}),`
    + ` ${narrowedRoad.samples} filtered (others ${narrowSet[0]})`)
  // The AXIS, not the bin list. A bin no longer holding a passing sample drops out of the
  // result - it has nothing to plot - but every remaining bin keeps its true road distance,
  // so the profile still runs the length of the drive and two profiles of it stay
  // comparable. Narrowing the `travelled` CTE instead would shorten the road itself, which
  // is the failure this distinguishes from.
  step('and its axis still measures the whole road, so two profiles stay comparable',
    narrowedRoad.road === wholeRoad.road && wholeRoad.road > 0
    && narrowedRoad.bins <= wholeRoad.bins,
    `${wholeRoad.road} m of road either way; `
    + `${wholeRoad.bins} bins whole, ${narrowedRoad.bins} filtered`)
  step('and the coverage list says so, so a later drift fails a check instead of a screen',
    coverage.some((c) => c.path === '/api/sessions/{id}/distance-bins' && c.honoured),
    coverage.find((c) => c.path.endsWith('/distance-bins'))?.note ?? 'not listed')

  // The downloads are links, not fetches, so they are checked as links.
  const hrefs = await page.locator('.toolbar .group:has(label:text("Export")) a')
    .evaluateAll((as) => as.map((a) => a.getAttribute('href')))
  step('the export and report links carry it too',
    hrefs.length === 3 && hrefs.every((h) => /[?&]filter=/.test(h)),
    hrefs.map((h) => h.split('?')[0].split('/').pop()).join(', '))

  // What the screen shows, against what the server says - the legend's Total is the app's
  // own arithmetic over the payload it received.
  const legendTotal = Number((await page.locator('.dock.right .legend-row', { hasText: 'Total' })
    .innerText()).match(/(\d+)/)?.[1] ?? -1)
  step('the legend on screen counts the filtered drive, not the whole one',
    legendTotal === narrowSet[0], `legend ${legendTotal}, server ${narrowSet[0]}`)

  // The reach list is where an exemption stops being a hidden limit and becomes a stated
  // one, so it has to be reachable from the bar rather than only from the API.
  await bar.locator('button', { hasText: 'Reach' }).click()
  await page.waitForTimeout(400)
  const reachText = await bar.locator('.gf-reach-list').innerText()
  step('the bar can name the analytics the filter does not reach, with reasons',
    exempt.every((c) => reachText.includes(c.path))
    && /events/.test(reachText) && /keyed by time/.test(reachText),
    reachText.replace(/\n/g, ' / ').slice(0, 100))
  await bar.locator('button', { hasText: 'Reach' }).click()

  // ── the link. A filter changes what every number means, so a view sent without it
  //    arrives self-consistent and not the thing that was sent.
  step('the filter is in the address', /[?&]gf=/.test(await page.evaluate(() => location.search)),
    await page.evaluate(() => location.search))

  const cold = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  const firstCalls = []
  cold.on('request', (r) => {
    const u = new URL(r.url())
    if (/\/track$/.test(u.pathname)) firstCalls.push(u.search)
  })
  await cold.goto(`${BASE}?s=${sid}&gf=${enc}`, { waitUntil: 'domcontentloaded' })
  await cold.waitForTimeout(3200)
  const coldTotal = Number((await cold.locator('.dock.right .legend-row', { hasText: 'Total' })
    .innerText()).match(/(\d+)/)?.[1] ?? -1)
  step('a recipient opens the filtered view, not the whole drive',
    coldTotal === narrowSet[0], `recipient legend ${coldTotal}, server ${narrowSet[0]}`)
  // Not one unfiltered round first. A page that fetches the whole drive and then corrects
  // itself shows the recipient a screen nobody sent them, briefly but visibly.
  step('and never fetched the unfiltered drive on the way',
    firstCalls.length > 0 && firstCalls.every((q) => /[?&]filter=/.test(q)),
    `${firstCalls.length} track calls, ${firstCalls.filter((q) => !/filter=/.test(q)).length} unfiltered`)
  await cold.close()

  // ── refusal. A spec that means nothing must not become a filter, or every panel
  //    answers 400 at once and the screen has no way back.
  await page.locator('#gf-spec').fill('kpi:RSRP:~:-100')
  await bar.locator('button', { hasText: 'Apply' }).click()
  await page.waitForTimeout(1200)
  const stillTotal = Number((await page.locator('.dock.right .legend-row', { hasText: 'Total' })
    .innerText()).match(/(\d+)/)?.[1] ?? -1)
  step('an unparseable condition is refused, and the one in force is untouched',
    (await bar.locator('.gf-error').count()) === 1 && stillTotal === narrowSet[0],
    `${await bar.locator('.gf-error').innerText().catch(() => 'no error shown')}, `
    + `legend still ${stillTotal}`)

  const bad = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  await bad.goto(`${BASE}?s=${sid}&gf=${encodeURIComponent('kpi:RSRP:~:-100')}`,
    { waitUntil: 'domcontentloaded' })
  await bad.waitForTimeout(3200)
  const badNotice = await bad.locator('.view-notice').innerText().catch(() => '')
  step('a link carrying a nonsense filter is repaired and says so',
    /gf=/.test(badNotice)
    && Number((await bad.locator('.dock.right .legend-row', { hasText: 'Total' })
      .innerText()).match(/(\d+)/)?.[1] ?? -1) === wholeSet[0],
    badNotice.replace(/\n/g, ' / ').slice(0, 110) || 'no notice')
  await bad.close()

  // Clearing puts the whole drive back, so the filter is a lens and not a one-way door.
  await page.locator('#gf-spec').fill('')
  await bar.locator('button', { hasText: 'Apply' }).click()
  await page.waitForTimeout(1800)
  const back = Number((await page.locator('.dock.right .legend-row', { hasText: 'Total' })
    .innerText()).match(/(\d+)/)?.[1] ?? -1)
  step('clearing it puts the whole drive back',
    back === wholeSet[0] && /No global filters/.test(await bar.innerText()),
    `legend ${back} of ${wholeSet[0]}`)

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}

// ─── S21 · A state machine that measures time it actually measured ───────────
//
// The reference's State Machine emits one row per state occupancy carrying start_time and
// time_interval, and the whole point of it is procedure delay: "how many milliseconds did
// this take". Ours was a per-sample CASE wearing that name, which the repo's own reference
// notes call a Classifier. The rename freed the name for a real latching ladder.
//
// Two claims are worth checking and they pull in opposite directions: that the machine
// REMEMBERS (so a run is one row, not one per sample), and that it REFUSES to measure
// across ground nobody drove. The seed happens to be able to witness both at once.
scenario('S21 · A state machine that measures time it actually measured')
{
  const post = (path, body) => page.request.post(`${API}${path}`, { data: body })
  const ladder = (states) => ({
    version: 2,
    nodes: [
      { id: 1, kind: 'SOURCE_KPI', x: 40, y: 24, kpiName: 'RSRP', as: 'RSRP' },
      { id: 2, kind: 'STATE_MACHINE', x: 40, y: 150, states },
      { id: 3, kind: 'OUTPUT', x: 40, y: 280, column: states[states.length - 1].state },
    ],
    edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }],
  })
  const FADE = [{ state: 'RECOVERED', condition: 'RSRP > -100' },
                { state: 'FADED', condition: 'RSRP < -110' }]
  const outputFor = (name) => ({
    name, displayName: 'S21 fade dwell',
    // Deliberately wrong, to prove the server does not take it.
    unit: 'dB', category: 'Workbench', technology: '5G NR',
    direction: 'LOWER_IS_BETTER', source: 'UE', decimals: 2,
    description: null, expression: null,
  })

  // A document with no version used the name STATE_MACHINE for the per-sample classifier.
  // Compiling it as a ladder would answer 200 and change every value the KPI ever had.
  const noVersion = ladder(FADE)
  delete noVersion.version
  const old = await (await post('/api/kpi-definitions/graphs/validate',
    { name: 'x', output: null, spec: noVersion })).json()
  step('a graph saved before the ladder existed is refused, and says why',
    old.ok === false && /Classifier/.test(old.error ?? '') && /State machine/.test(old.error ?? ''),
    old.error ?? 'accepted')

  const ok = await (await post('/api/kpi-definitions/graphs/validate',
    { name: 'x', output: null, spec: ladder(FADE) })).json()
  step('with a version it validates, and says it publishes a duration',
    ok.ok === true && ok.outputIsDuration === true && ok.outputColumn === 'FADED',
    ok.error ?? `${ok.outputColumn} duration=${ok.outputIsDuration}`)

  const saved = await (await post('/api/kpi-definitions/graphs',
    { name: 'S21 fade', output: outputFor('S21_FADE_MS'), spec: ladder(FADE) })).json()
  step('saving computes dwell values', saved.valuesComputed > 0,
    `${saved.valuesComputed} occupancies across every drive`)

  // ── memory, witnessed against a latch implemented independently in the generator.
  //
  // The seed raises a RADIO_LINK_FAILURE from a Java boolean that arms below -110 dBm and
  // disarms above -100 - the same latch this node compiles to SQL. Two implementations of
  // one rule, so their counts must agree; and where they DON'T, the disagreement has to be
  // explainable by the second claim rather than by a bug.
  const dwellSeqs = async (id, kpi) =>
    (await apiGet(`/api/sessions/${id}/series?kpis=${kpi}&maxPoints=100000`))[0]
      .points.filter((p) => p.value != null).map((p) => p.seq)
  const rlfSeqs = async (id) =>
    (await apiGet(`/api/sessions/${id}/events`))
      .filter((e) => e.eventType === 'RADIO_LINK_FAILURE').map((e) => e.seq)

  const cityB = sessions.find((s) => s.name === CITY_B).id
  const hwy = sessions.find((s) => s.name === HIGHWAY).id
  const cityA = sessions.find((s) => s.name === CITY_A).id

  const bDwell = await dwellSeqs(cityB, 'S21_FADE_MS')
  const bRlf = await rlfSeqs(cityB)
  const hDwell = await dwellSeqs(hwy, 'S21_FADE_MS')
  const hRlf = await rlfSeqs(hwy)
  step('one occupancy per fade, not one per sample of it — on the drives with no gaps',
    bDwell.length === bRlf.length && hDwell.length === hRlf.length && bDwell.length > 0
    && bDwell.every((q, i) => q === bRlf[i]) && hDwell.every((q, i) => q === hRlf[i]),
    `1.5.0 dwells [${bDwell}] vs RLF [${bRlf}]; highway [${hDwell}] vs [${hRlf}]`)

  // ── the same rule, one screen over: a DEGRADATION must not count unlogged time either.
  //
  // The island key was `seq - row_number()` alone, so a bad stretch stayed one row however
  // much of it was never recorded - and `avg(latitude)` then put the row's map marker inside
  // the hole. The witness is arithmetic rather than a threshold: the stretches the list
  // reports across the gap must sum to LESS wall clock than the span from the first to the
  // last of their samples, and the shortfall must be exactly the unlogged seconds.
  const cityDeg = (await apiGet(`/api/sessions/${cityA}/degradations?kpi=RSRP&minSamples=5`))
    .sort((a, b) => a.startSeq - b.startSeq)
  const gapTrack = await apiGet(`/api/sessions/${cityA}/track?kpi=RSRP&maxPoints=100000`)
  const tsOf = Object.fromEntries(gapTrack.map((p) => [p.seq, Date.parse(p.ts) / 1000]))
  // The pair either side of the drive's logger gap: consecutive rows whose seq are adjacent
  // (one ends where the next begins) but which the list nevertheless reports separately.
  const split = cityDeg.find((d, i) => i > 0 && cityDeg[i - 1].endSeq + 1 === d.startSeq)
  const before = split ? cityDeg[cityDeg.indexOf(split) - 1] : null
  const spanned = split ? tsOf[split.endSeq] - tsOf[before.startSeq] : 0
  const reported = split ? before.durationSeconds + split.durationSeconds : 0
  step('a bad stretch is cut where the log stops, not carried across the hole',
    Boolean(split) && spanned > reported && spanned - reported >= 5,
    split
      ? `seq ${before.startSeq}-${split.endSeq} spans ${spanned}s, reported as`
        + ` ${before.durationSeconds}s + ${split.durationSeconds}s = ${reported}s,`
        + ` so ${spanned - reported}s of unlogged time is excluded`
      : 'no adjacent pair found')

  // ── and the refusal, on the one drive that has a logger gap inside a fade.
  const aDwell = await dwellSeqs(cityA, 'S21_FADE_MS')
  const aRlf = await rlfSeqs(cityA)
  const aTrack = await apiGet(`/api/sessions/${cityA}/track?kpi=RSRP&maxPoints=100000`)
  const breaks = aTrack.filter((p) => p.breakBefore > 0).map((p) => Date.parse(p.ts))
  const missing = aRlf.filter((q) => !aDwell.includes(q))
  step('a fade that straddles a logger gap is not measured at all',
    aDwell.length === aRlf.length - 1 && missing.length === 1,
    `RLF at [${aRlf}], measured [${aDwell}]`)

  // The load-bearing assertion: not "one row fewer" - which a drive with its break
  // elsewhere would not show - but that no published interval CONTAINS a break.
  const series = (await apiGet(
    `/api/sessions/${cityA}/series?kpis=S21_FADE_MS&maxPoints=100000`))[0].points
    .filter((p) => p.value != null)
  const spans = series.map((p) => [Date.parse(p.ts), Date.parse(p.ts) + p.value])
  step('and no interval that IS published contains one',
    spans.length > 0 && !spans.some(([a, b]) => breaks.some((t) => t > a && t <= b)),
    `${spans.length} intervals, ${breaks.length} breaks in the drive`)

  // ── a duration is never longer than the drive it is in.
  //
  // A BOUND, not a witness, and labelled as one. The defect it would catch - an episode
  // closing on the next drive because a window lost its PARTITION BY session_id - cannot
  // be produced on this corpus: seq numbers repeat across drives, so an unpartitioned
  // window scrambles into publishing NOTHING rather than publishing something too long.
  // Dropping the partition IS caught, by KpiGraphTest.everyWindowInTheLadderIsPartitioned-
  // ByDrive, which reads the compiled SQL. Recorded so nobody reads this step as the guard.
  const drives = await apiGet('/api/sessions')
  let worst = null
  for (const d of drives) {
    const pts = (await apiGet(
      `/api/sessions/${d.id}/series?kpis=S21_FADE_MS&maxPoints=100000`))[0].points
      .filter((p) => p.value != null)
    const span = Date.parse(d.endedAt) - Date.parse(d.startedAt)
    for (const p of pts) if (p.value > span) worst = `${d.name}: ${p.value} ms of ${span} ms`
  }
  step('no occupancy is longer than the drive it sits in (a bound, not a witness)',
    worst === null, worst ?? 'every dwell fits inside its own drive')

  // ── every state is measured until it was LEFT, including one that was left without the
  //    ladder advancing. Witnessed against the same latch computed here, in the checker,
  //    from the drive's own RSRP - so a machine that only measured states it later
  //    deepened out of would disagree seq for seq rather than merely count differently.
  const three = [{ state: 'OK', condition: 'RSRP > -100' },
                 { state: 'DIPPED', condition: 'RSRP < -105' },
                 { state: 'FADED', condition: 'RSRP < -115' }]
  const dipSpec = ladder(three)
  dipSpec.nodes[2].column = 'DIPPED'
  const dip = await (await post('/api/kpi-definitions/graphs',
    { name: 'S21 dip', output: outputFor('S21_DIP_MS'), spec: dipSpec })).json()
  const deepSpec = ladder(three)
  const deep = await (await post('/api/kpi-definitions/graphs',
    { name: 'S21 deep', output: outputFor('S21_DEEP_MS'), spec: deepSpec })).json()

  /** The ladder's latch, run here over one drive's values: arm below `enter`, disarm above `back`. */
  const latchEntries = async (id, enter, back) => {
    const pts = (await apiGet(`/api/sessions/${id}/series?kpis=RSRP&maxPoints=100000`))[0].points
    const out = []
    let armed = false
    for (const p of pts.slice().sort((a, b) => a.seq - b.seq)) {
      if (p.value == null) continue
      if (!armed && p.value < enter) { armed = true; out.push(p.seq) }
      else if (armed && p.value > back) armed = false
    }
    return out
  }
  // Both drives have no logger gap, so nothing is legitimately withheld and the two
  // implementations must agree exactly.
  const dipB = await dwellSeqs(cityB, 'S21_DIP_MS')
  const dipH = await dwellSeqs(hwy, 'S21_DIP_MS')
  const expB = await latchEntries(cityB, -105, -100)
  const expH = await latchEntries(hwy, -105, -100)
  step('every state is measured until it was left, not only when the ladder advanced',
    dipB.length > 0 && JSON.stringify(dipB) === JSON.stringify(expB)
    && JSON.stringify(dipH) === JSON.stringify(expH),
    `1.5.0 published [${dipB}] vs latch [${expB}]; highway [${dipH}] vs [${expH}]`)
  step('and a deeper state is entered less often than the one above it',
    dip.valuesComputed > deep.valuesComputed && deep.valuesComputed > 0,
    `${dip.valuesComputed} dips vs ${deep.valuesComputed} deep fades`)

  // ── a duration is not labelled in the author's unit.
  const defs = await apiGet('/api/kpi-definitions')
  const def = defs.find((d) => d.name === 'S21_FADE_MS')
  step('the author asked for dB and got ms, because a duration is not theirs to label',
    def != null && def.unit === 'ms' && def.decimals === 0
    && /Milliseconds the state FADED was held/.test(def.description ?? ''),
    `${def?.unit} / ${def?.decimals} decimals`)

  // ── the preview still works inside a ladder graph. Its CTE contains the same text the
  //    preview used to split the whole statement on, several times over.
  const prev = await (await post(
    `/api/kpi-definitions/graphs/preview?nodeId=2&sessionId=${cityB}&limit=5`,
    { name: 'x', output: null, spec: ladder(FADE) })).json()
  step('a node inside a ladder graph can still be previewed',
    prev.rowCount > 0 && (prev.columns ?? []).includes('FADED'),
    `${prev.rowCount} rows, columns ${(prev.columns ?? []).join(', ')}`)

  // ── and the screen shows the ladder as a ladder.
  await openMode('Import')
  await page.waitForTimeout(1500)
  const stored = page.locator('.panels table.grid tbody tr', { hasText: 'S21 fade' })
  await stored.locator('button', { hasText: 'Open' }).click()
  await page.waitForTimeout(1500)
  // textContent, not innerText: an SVG <g> has no innerText, and allInnerTexts() hands
  // back undefined for each one rather than failing.
  const cardText = await page.locator('g.wb-node')
    .evaluateAll((gs) => gs.map((g) => g.textContent ?? ''))
  step('the canvas prints the ladder in the order that IS its meaning',
    cardText.some((t) => t.includes('RECOVERED → FADED')), cardText.join(' | '))

  await page.locator('g.wb-node', { hasText: 'RECOVERED → FADED' }).click()
  await page.waitForTimeout(600)
  // The panel headed "Node", not the first panel whose text happens to contain the word -
  // the canvas panel says "3 nodes . 2 edges" and would match that.
  const inspector = await page.locator('.panel:has(header .title:text-is("Node"))').innerText()
  step('and the inspector states the limits rather than hiding them',
    /only from the one above it/.test(inspector) && /no time trigger/.test(inspector)
    && /logger gap/.test(inspector), inspector.replace(/\n/g, ' / ').slice(0, 120))

  for (const g of [saved.id, dip.id, deep.id]) {
    await page.request.delete(`${API}/api/kpi-definitions/graphs/${g}`)
  }
  const after = await apiGet('/api/kpi-definitions/graphs')
  step('the scenario leaves no graph behind',
    !after.some((g) => String(g.outputKpiName).startsWith('S21_')),
    `${after.length} graphs remain`)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}

// ─── S22 · What was happening just before this ───────────────────────────────
//
// "What was RSRP just before the drop" is the shape root-cause analysis is made of, and
// the canvas could not express it: Combine relates values on the SAME sample, which is the
// only relation it knew. The reference has a family of five for this, all built on one
// rule - the PRIMARY input decides when there is an output at all.
scenario('S22 · What was happening just before this')
{
  const post = (path, body) => page.request.post(`${API}${path}`, { data: body })
  const cityA = sessions.find((s) => s.name === CITY_A).id

  const spec = (how, primary, within) => ({
    version: 2,
    nodes: [
      { id: 1, kind: 'SOURCE_EVENT', x: 40, y: 24, eventType: 'HANDOVER', as: 'HO' },
      { id: 2, kind: 'SOURCE_KPI', x: 280, y: 24, kpiName: 'RSRP', as: 'RSRP' },
      { id: 3, kind: 'CORRELATE', x: 40, y: 140, primary, correlation: how,
        column: primary === 1 ? 'RSRP' : 'HO', withinMs: within ?? null },
      { id: 4, kind: 'OUTPUT', x: 40, y: 260,
        column: `${{ PREVIOUS: 'PREV', CURRENT: 'CURR', NEXT: 'NEXT',
                     PREVIOUS_OR_CURRENT: 'PREV_OR_CURR' }[how]}_${primary === 1 ? 'RSRP' : 'HO'}` },
    ],
    edges: [{ from: 1, to: 3 }, { from: 2, to: 3 }, { from: 3, to: 4 }],
  })
  const output = (name) => ({
    name, displayName: `S22 ${name}`, unit: 'dB', category: 'Workbench',
    technology: '5G NR', direction: 'HIGHER_IS_BETTER', source: 'UE', decimals: 1,
    description: null, expression: null,
  })
  const made = []
  const build = async (name, how, primary, within) => {
    const g = await (await post('/api/kpi-definitions/graphs',
      { name, output: output(name), spec: spec(how, primary, within) })).json()
    made.push(g)
    return g
  }

  const prev = await build('S22_PREV', 'PREVIOUS', 1)
  const curr = await build('S22_CURR', 'CURRENT', 1)
  const next = await build('S22_NEXT', 'NEXT', 1)

  // ── the gate. The output exists at the primary's moments and nowhere else, witnessed
  //    against the event list rather than against the node's own idea of them.
  const handovers = (await apiGet(`/api/sessions/${cityA}/events`))
    .filter((e) => e.eventType === 'HANDOVER').map((e) => e.seq).sort((a, b) => a - b)
  const at = async (kpi) =>
    (await apiGet(`/api/sessions/${cityA}/series?kpis=${kpi}&maxPoints=100000`))[0].points
      .filter((p) => p.value != null).map((p) => p.seq).sort((a, b) => a - b)
  const prevSeqs = await at('S22_PREV')
  step('the primary decides when there is an output, and there is one at each of its moments',
    handovers.length > 0 && JSON.stringify(prevSeqs) === JSON.stringify(handovers),
    `handovers [${handovers}], output at [${prevSeqs}]`)

  // ── and the three fetch three different samples, checked against the drive's own RSRP.
  //    The sample before a handover has no event row, so a window that could only see the
  //    primary's rows could not reach it - which is the whole difficulty of this node.
  const rsrp = Object.fromEntries(
    (await apiGet(`/api/sessions/${cityA}/series?kpis=RSRP&maxPoints=100000`))[0].points
      .map((p) => [p.seq, p.value]))
  const valuesOf = async (kpi) => Object.fromEntries(
    (await apiGet(`/api/sessions/${cityA}/series?kpis=${kpi}&maxPoints=100000`))[0].points
      .filter((p) => p.value != null).map((p) => [p.seq, p.value]))
  const vPrev = await valuesOf('S22_PREV')
  const vCurr = await valuesOf('S22_CURR')
  const vNext = await valuesOf('S22_NEXT')
  const near = (a, b) => a != null && b != null && Math.abs(a - b) < 0.05
  const wrong = handovers.filter((q) => !(near(vPrev[q], rsrp[q - 1])
    && near(vCurr[q], rsrp[q]) && near(vNext[q], rsrp[q + 1])))
  step('previous, current and next are the samples before, at and after the moment',
    wrong.length === 0 && handovers.length > 0,
    wrong.length === 0
      ? `at seq ${handovers[0]}: ${vPrev[handovers[0]]} / ${vCurr[handovers[0]]}`
        + ` / ${vNext[handovers[0]]} against ${rsrp[handovers[0] - 1]} /`
        + ` ${rsrp[handovers[0]]} / ${rsrp[handovers[0] + 1]}`
      : `wrong at seq ${wrong}`)

  // ── the bound is ours, not the reference's, and it drops rather than reports late.
  //    Samples are one second apart, so 500 ms reaches nothing and 1500 ms reaches
  //    exactly the neighbouring sample.
  const tight = await build('S22_TIGHT', 'PREVIOUS', 1, 500)
  const loose = await build('S22_LOOSE', 'PREVIOUS', 1, 1500)
  step('a value further away than the bound is dropped, not reported as if it were near',
    tight.valuesComputed === 0 && loose.valuesComputed === prev.valuesComputed
    && prev.valuesComputed > 0,
    `500 ms reaches ${tight.valuesComputed}, 1500 ms reaches ${loose.valuesComputed},`
    + ` unbounded ${prev.valuesComputed}`)

  // ── "previous or current" falls back rather than replacing. Witnessed by making
  //    PREVIOUS unreachable with the bound: what is left must be the current value.
  const orCurr = await build('S22_OR_CURR', 'PREVIOUS_OR_CURRENT', 1, 500)
  const vOr = await valuesOf('S22_OR_CURR')
  step('previous-or-current uses the current value only when there is no previous one',
    orCurr.valuesComputed === curr.valuesComputed && handovers.length > 0
    && handovers.every((q) => near(vOr[q], vCurr[q])),
    `${orCurr.valuesComputed} values, all equal to the current one`)

  // ── swapping the primary changes what the question is about.
  //
  // Measured on the NODE, through the preview, not on the published KPI: the graph's tail
  // drops NULL values, so publishing the sparse event column either way would answer 15
  // both times and prove nothing. The first version of this step did exactly that.
  const rowsAt = async (primary) => (await (await post(
    `/api/kpi-definitions/graphs/preview?nodeId=3&sessionId=${cityA}&limit=1`,
    { name: 'x', output: null, spec: spec('CURRENT', primary) })).json()).rowCount
  const atEvents = await rowsAt(1)
  const atSamples = await rowsAt(2)
  const drive = (await apiGet(`/api/sessions/${cityA}`)).sampleCount
  step('naming the other input as primary answers at every sample instead of at the events',
    atEvents === handovers.length && atSamples === drive,
    `${atEvents} rows with the event as primary, ${atSamples} with the KPI,`
    + ` ${handovers.length} handovers and ${drive} samples in the drive`)

  // ── the canvas offers it, and its inspector names the primary rather than implying it
  //    from a layout the compiler never reads.
  await openMode('Import')
  await page.waitForTimeout(1500)
  const stored = page.locator('.panels table.grid tbody tr', { hasText: 'S22_PREV' })
  await stored.locator('button', { hasText: 'Open' }).click()
  await page.waitForTimeout(1800)
  await page.locator('g.wb-node', { hasText: 'previous' }).click()
  await page.waitForTimeout(700)
  const inspector = await page.locator('.panel:has(header .title:text-is("Node"))').innerText()
  step('the inspector names which input decides the moments',
    /Primary/.test(inspector) && /no row/.test(inspector),
    inspector.replace(/\n/g, ' / ').slice(0, 130))
  const primaryPicked = await page.locator('select[aria-label="Primary input"]').inputValue()
  step('and it is a control, not a convention about which node sits on the left',
    primaryPicked === '1', `primary reads ${primaryPicked}`)

  for (const g of made) await page.request.delete(`${API}/api/kpi-definitions/graphs/${g.id}`)
  const after = await apiGet('/api/kpi-definitions/graphs')
  step('the scenario leaves no graph behind',
    !after.some((g) => String(g.outputKpiName).startsWith('S22_')),
    `${after.length} graphs remain`)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}

// ─── S23 · Is this build better, over every drive we have ────────────────────
//
// The question `/compare` cannot answer. Two drives differ for a hundred reasons that are
// not the build, so "is 1.5.0 better" has to pool every drive of each build - and the
// moment it pools, three claims start being made that the screen has to earn:
//
//   the pooled number really is pooled (not an average of averages, and not a percentile
//   borrowed from one member); the groups really are comparable (the confound guard, and
//   what it removed, by name); and the picture really says what the vertical axis is.
//
// Every step below is written so that removing the thing it names changes the number it
// reads - see docs/ui-testing/README.md §1.5. Each was run against a deliberately broken
// build before being kept.
scenario('S23 · Is this build better, over every drive we have')
{
  const cohorts = (qs) => apiGet(`/api/cohorts?kpi=RSRP&${qs}`)
  const raw = (qs) => page.request.get(`${API}/api/cohorts?kpi=RSRP&${qs}`)
  const round2 = (v) => Math.round(v * 100) / 100

  // ── C1. The pooled mean is POOLED, witnessed against the members it was pooled from.
  //
  // Two numbers computed here in the checker from the member list the same response
  // carries: the count-weighted combination, which the server must equal, and the naive
  // average of the members' means, which it must NOT - that second one is what a pooling
  // bug produces, and it is a plausible number sitting a few tenths away.
  const open = await cohorts('holdConstant=NONE')
  const big = open.cohorts.find((c) => c.driveCount > 1)
  step('a cohort spanning several drives exists to test against',
    Boolean(big) && big.members.length === big.driveCount,
    big ? `${big.value}: ${big.driveCount} drives` : 'no multi-drive cohort')
  const n = big.members.reduce((a, m) => a + m.sampleCount, 0)
  const weighted = round2(
    big.members.reduce((a, m) => a + m.mean * m.sampleCount, 0) / n)
  const naive = round2(
    big.members.reduce((a, m) => a + m.mean, 0) / big.members.length)
  step('the group mean is the samples pooled, not the members’ means averaged',
    Math.abs(big.stats.mean - weighted) < 0.02 && Math.abs(big.stats.mean - naive) > 0.05,
    `pooled ${big.stats.mean}, weighted ${weighted}, average-of-averages ${naive}`)

  // ── C2. The percentiles are pooled too, which is the reason this is one query.
  //
  // A group's median is not recoverable from its members' medians under any weighting, so
  // a client-side implementation would have had to leave it out or invent it. Checked two
  // ways that a borrowed or interpolated percentile fails: the pooled extremes must be the
  // members' extremes exactly, and the pooled median must sit inside the members' spread
  // without being the weighted average of them.
  const stats = await Promise.all(big.members.map((m) =>
    apiGet(`/api/sessions/${m.sessionId}/statistics?kpi=RSRP`)))
  const p50s = stats.map((x) => x.p50)
  const avgP50 = round2(
    stats.reduce((a, x, i) => a + x.p50 * big.members[i].sampleCount, 0) / n)
  step('the group’s min and max are its members’ min and max',
    big.stats.min === Math.min(...stats.map((x) => x.min))
    && big.stats.max === Math.max(...stats.map((x) => x.max)),
    `pooled ${big.stats.min}..${big.stats.max}, members`
    + ` ${Math.min(...stats.map((x) => x.min))}..${Math.max(...stats.map((x) => x.max))}`)
  step('and its median is a real pooled median, not one of theirs and not their average',
    big.stats.p50 > Math.min(...p50s) && big.stats.p50 < Math.max(...p50s)
    && Math.abs(big.stats.p50 - avgP50) > 0.05,
    `pooled p50 ${big.stats.p50}, members [${p50s}], weighted average of those ${avgP50}`)

  // ── C3. The sample count is the sum, exactly. The cheapest way to be wrong here is a
  //    join that multiplies rows, and it shows up nowhere else on the screen.
  step('the group counts every member’s samples once',
    big.stats.count === n && n === big.sampleCount,
    `${big.stats.count} pooled, ${n} summed over ${big.members.length} drives`)

  // ── C4. The confound guard, and the drives it removed - by name, with the value that
  //    got them removed, checked against what those drives actually are.
  const held = await cohorts('')
  const byId = Object.fromEntries(sessions.map((x) => [x.id, x]))
  step('holding a dimension constant is the default when the axis is the build',
    held.holdConstant === 'SCENARIO' && held.excluded.length > 0,
    `holding ${held.holdConstant}, ${held.excluded.length} measurements left out`)
  const keptScenarios = new Set(held.cohorts.flatMap((c) => c.members.map((m) => m.heldValue)))
  const wronglyNamed = held.excluded.filter((e) => keptScenarios.has(byId[e.sessionId]?.scenario))
  step('each excluded measurement is named, and really does have the odd value',
    wronglyNamed.length === 0
    && held.excluded.every((e) => e.why.includes(byId[e.sessionId].scenario)),
    held.excluded.map((e) => `${byId[e.sessionId].name} (${byId[e.sessionId].scenario})`).join('; '))

  // ── C5. Turning the guard OFF has to change the answer, or it was never on.
  //
  // The one-number reduction: the same cohort, the same KPI, two guards, and the drive
  // count and the mean both move. A guard that silently did nothing would pass every
  // step above and fail this one.
  const guarded = held.cohorts.find((c) => c.value === big.value)
  step('with the guard on, the group is a different set of drives and a different number',
    guarded != null && guarded.driveCount < big.driveCount
    && Math.abs(guarded.stats.mean - big.stats.mean) > 0.05,
    guarded == null
      ? `no ${big.value} group survived the guard - ${held.cohorts.length} groups held`
      : `${big.value}: ${big.driveCount} drives ${big.stats.mean} unguarded,`
        + ` ${guarded.driveCount} drives ${guarded.stats.mean} guarded`)

  // ── C6/C7. What the screen refuses to say. Three silences, all different:
  //    no dimension held -> a delta and NO verdict; the first group -> nothing to compare
  //    against, so no verdict either, and NOT "NO DATA", which is a claim about the data.
  step('without a held dimension there is a delta but no verdict, and the screen says why',
    open.cohorts.every((c) => c.verdict === null)
    && open.cohorts.some((c) => c.deltaVsPrevious !== null)
    && /may differ by more than/.test(open.verdictNote ?? ''),
    (open.verdictNote ?? 'no note').slice(0, 90))
  step('with one held, a verdict appears - but never on the first group',
    held.cohorts[0].verdict === null && held.cohorts[0].deltaVsPrevious === null
    && held.cohorts.slice(1).every((c) => c.verdict !== null)
    && held.cohorts.slice(1).some((c) => ['BETTER', 'WORSE'].includes(c.verdict)),
    held.cohorts.map((c) => `${c.value}=${c.verdict ?? 'none'}`).join(', '))

  // ── C8. The three refusals, each of which has to name what to do instead. A 500, or a
  //    200 with an empty chart, would each be a screen that looks like an answer.
  const refusals = await Promise.all([
    raw('groupBy=SCENARIO&holdConstant=SCENARIO'),
    raw('weightedBy=DISTANCE'),
    raw('groupBy=notes'),
  ])
  const bodies = await Promise.all(refusals.map((r) => r.text()))
  step('asking an unanswerable question is a refusal that says what to ask instead',
    refusals.every((r) => r.status() === 400)
    && /both the axis and held constant/.test(bodies[0])
    && /logger gap|unmeasured stretch/.test(bodies[1])
    && /Build label|BUILD_LABEL/.test(bodies[2]),
    refusals.map((r) => r.status()).join('/'))

  // ── C9. The global filter reaches this screen too, which the server's own coverage list
  //    now claims. Checked as a number that moves, on the group AND on every member -
  //    a filter threaded into the pooled query but not the per-drive one would leave a
  //    screen whose members no longer add up to their group.
  const coverage = await apiGet('/api/global-filter/coverage')
  step('the coverage list claims the cohort screen honours the filter',
    coverage.some((c) => c.path === '/api/cohorts' && c.honoured),
    coverage.find((c) => c.path === '/api/cohorts')?.note ?? 'not listed')
  const narrowed = await cohorts(
    `holdConstant=NONE&filter=${encodeURIComponent('kpi:RSRP:>=:-100')}`)
  const nBig = narrowed.cohorts.find((c) => c.value === big.value)
  const nSum = nBig.members.reduce((a, m) => a + m.sampleCount, 0)
  step('the condition narrows the group and each of its drives, and they still add up',
    nBig.stats.count < big.stats.count && nSum === nBig.stats.count
    && nBig.members.every((m, i) => m.sampleCount < big.members[i].sampleCount)
    && nBig.stats.mean > big.stats.mean,
    `${big.stats.count} -> ${nBig.stats.count} samples, mean ${big.stats.mean} ->`
    + ` ${nBig.stats.mean}`)

  // ── C10. The strip. Every member is drawn, not only the group's mark - a chart of three
  //    means says "this group is -81.8" and hides that one drive of the three is at -86.6.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await openMode('Compare')
  await page.locator('.scope-switch button', { hasText: 'Cohorts' }).click()
  await page.waitForTimeout(2200)
  await page.locator('select[aria-label="Hold constant"]').selectOption('NONE')
  await page.waitForTimeout(2200)

  const rows = await page.locator('.cohort-strip .cohort-row').count()
  const marks = await page.locator('.cohort-strip .cohort-member').count()
  const drivesOnScreen = open.cohorts.reduce((a, c) => a + c.members.length, 0)
  step('every group is a row and every drive in it is a mark of its own',
    rows === open.cohorts.length && marks === drivesOnScreen,
    `${rows} rows for ${open.cohorts.length} groups, ${marks} marks for ${drivesOnScreen} drives`)

  // The axis is published in the DOM rather than left to be measured off pixels: a check
  // that reads a pixel is checking the renderer. Every mark has to be inside it, or the
  // strip is drawing values it has clipped.
  // textContent, not innerText: <desc> is an SVGElement, and innerText is not defined on
  // one - the same trap S21 hit reading node cards.
  const desc = await page.locator('.cohort-strip desc')
    .evaluate((d) => d.textContent ?? '')
  const axis = Object.fromEntries(desc.split(' ').map((kv) => kv.split('=')))
  const drawn = await page.locator('.cohort-strip [data-mean]')
    .evaluateAll((es) => es.map((e) => Number(e.getAttribute('data-mean'))))
  step('the strip states its own axis, and every mark it drew is inside it',
    drawn.length > 0 && drawn.every((v) => v >= Number(axis.axisLo) && v <= Number(axis.axisHi)),
    `${drawn.length} marks within [${axis.axisLo}, ${axis.axisHi}]`)

  // ── C11. The vertical is a sequence, not a timeline - so the connector between two rows
  //    is never a diagonal. A diagonal claims the KPI moved smoothly between two builds
  //    that were tested a month apart, which nothing measured.
  const elbows = await page.locator('.cohort-strip path.cohort-elbow')
    .evaluateAll((ps) => ps.map((p) => p.getAttribute('d')))
  const diagonal = elbows.filter((d) => {
    const pts = d.split(/[ML]\s*/).filter(Boolean).map((q) => q.trim().split(/\s+/).map(Number))
    return pts.some((p, i) => i > 0 && p[0] !== pts[i - 1][0] && p[1] !== pts[i - 1][1])
  })
  step('the connector between two groups is axis-aligned, never a diagonal',
    elbows.length === open.cohorts.length - 1 && diagonal.length === 0,
    `${elbows.length} connectors, ${diagonal.length} with a diagonal segment`)
  const footer = await page.locator('.cohort-footer').innerText()
  step('and the chart says the spacing is not time',
    /spacing is not time/.test(footer), footer.replace(/\n/g, ' ').slice(0, 80))

  // ── C12. The link. Which axis and which guard are the question itself, so a cohort view
  //    handed to somebody else has to arrive as the same question - and `by === hold`,
  //    which is not a question at all, has to arrive repaired and SAID.
  await page.locator('select[aria-label="Group by"]').selectOption('SCENARIO')
  await page.waitForTimeout(1800)
  const url = new URL(page.url())
  step('the axis and the guard are in the address bar',
    url.searchParams.get('by') === 'SCENARIO' && url.searchParams.get('hold') === 'NONE',
    url.search || 'nothing in the query')
  await page.goto(`${BASE}${url.search}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  step('and the link reopens on the same question rather than on the default one',
    await page.locator('select[aria-label="Group by"]').inputValue() === 'SCENARIO',
    await page.locator('select[aria-label="Group by"]').inputValue())

  // ── C13. A group that measured NOTHING is still a group.
  //
  // The strip filtered those out, and the failure was invisible from inside the strip: the
  // header above said "2 groups", the table below printed a row of em dashes, and the CDF
  // legend named it - three surfaces disagreeing about how many groups there are, with the
  // missing one being exactly the group whose emptiness is the answer. `FH_RX_LATE` is the
  // witness because only the lab drive measures it, so the 1.4.2 build cohort has one drive
  // and no values.
  const sparse = await apiGet('/api/cohorts?kpi=FH_RX_LATE&holdConstant=NONE')
  const valueless = sparse.cohorts.filter((c) => c.stats.mean == null)
  step('a parameter one build never measured still gives that build a group',
    sparse.cohorts.length > 1 && valueless.length === 1 && valueless[0].sampleCount === 0,
    sparse.cohorts.map((c) => `${c.value}=${c.stats.mean ?? 'none'}`).join(', '))

  await page.goto(`${BASE}?mode=compare&by=BUILD_LABEL&hold=NONE&kpi=FH_RX_LATE`,
    { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const sparseRows = await page.locator('.cohort-strip .cohort-row').count()
  const sparseTable = await page.locator('.cohort-table tbody tr').count()
  const headerGroups = Number(
    (await page.locator('.panels.cohorts .panel:has(.cohort-strip) header .meta').innerText())
      .match(/(\d+)/)?.[1] ?? -1)
  const noData = await page.locator('.cohort-strip .cohort-nodata').count()
  step('and the strip, the table and the header all count it',
    sparseRows === sparse.cohorts.length && sparseTable === sparse.cohorts.length
    && headerGroups === sparse.cohorts.length && noData === valueless.length,
    `${sparseRows} strip rows, ${sparseTable} table rows, header says ${headerGroups},`
    + ` ${noData} marked as having no value`)

  await page.goto(`${BASE}?mode=compare&by=SCENARIO&hold=SCENARIO`,
    { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const notice = await page.locator('.view-notice').innerText().catch(() => '')
  step('a link that holds its own axis constant is repaired, and the repair is stated',
    /both the axis and the thing held constant/.test(notice),
    notice.replace(/\n/g, ' / ').slice(0, 120))

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}

// ─── S24 · The half-built things, finished ───────────────────────────────────
//
// Nine capabilities the server computed, carried and typed all the way to the browser, and
// that no screen reached. An audit proposed deleting them; the reason on offer was "the
// reference tool has no such control", which is not a reason this product can use - it
// promises parity PLUS added insight, and deleting the plus half to save a few lines is a
// permanent decision made for a temporary saving.
//
// So each is wired, and each is checked HERE rather than trusted, because a control that is
// present and inert looks exactly like a control that works.
scenario('S24 · The half-built things, finished')
{
  const made = []
  const cityA = sessions.find((x) => x.name === CITY_A).id


  // ── the separator. Two-sided: the same bytes must load with it and fail without it, or
  //    the control is decoration and the failure was never about the separator.
  const semi = 'lat;lon;rsrp\n65.01;25.47;-88\n65.02;25.48;-91\n65.03;25.49;-84\n'
  const post = (name, extra) => page.request.post(`${API}/api/import/csv`, {
    multipart: {
      file: { name: `${name}.csv`, mimeType: 'text/csv', buffer: Buffer.from(semi) },
      sessionName: name, ...extra,
    },
  })
  const withoutSep = await post('S24 semicolon rejected', {})
  const withSep = await post('S24 semicolon', { delimiter: ';' })
  if (withSep.ok()) made.push((await withSep.json()).sessionId)
  step('a semicolon export loads with the separator set, and only with it',
    withoutSep.status() === 400 && withSep.ok(),
    `default separator ${withoutSep.status()}, semicolon ${withSep.status()}`)

  // Through the SCREEN, not the API. The first draft of this step read the option list and
  // passed with the form's `delimiter` append deleted - a control that exists and sends
  // nothing looks exactly like one that works, which is section 1.5.1 in this project's own
  // words. So the file goes in through the file input and the separator through the select.
  await openMode('Import')
  await page.waitForTimeout(1200)
  const uiImport = async (name, sep) => {
    await page.locator('.panel:has(select[aria-label="Column separator"]) input[type=file]')
      .setInputFiles({ name: `${name}.csv`, mimeType: 'text/csv', buffer: Buffer.from(semi) })
    await page.locator('input[aria-label="Session name"]').fill(name)
    await page.locator('select[aria-label="Column separator"]').selectOption(sep)
    await page.locator('.panel:has(select[aria-label="Column separator"]) button',
      { hasText: 'Import' }).click()
    await page.waitForTimeout(2500)
    return (await apiGet('/api/sessions')).find((x) => x.name === name) ?? null
  }
  const uiComma = await uiImport('S24 ui comma', ',')
  const uiSemi = await uiImport('S24 ui semicolon', ';')
  if (uiSemi) made.push(uiSemi.id)
  if (uiComma) made.push(uiComma.id)
  step('and the screen sends it, not merely offers it',
    uiComma === null && uiSemi !== null && uiSemi.sampleCount === 3,
    `comma: ${uiComma ? 'loaded (should not have)' : 'refused'},`
    + ` semicolon: ${uiSemi ? `${uiSemi.sampleCount} samples` : 'refused (should have loaded)'}`)

  // ── the linear-power mean. The claim is exact and falsifiable in two directions at once:
  //    averaging dB arithmetically is not the same quantity, so the MEAN must move - and
  //    percentiles are order statistics under a monotone map, so the MEDIAN must not.
  const asRec = await apiGet(`/api/cohorts?kpi=RSRP&holdConstant=NONE&domain=AS_RECORDED`)
  const linear = await apiGet(`/api/cohorts?kpi=RSRP&holdConstant=NONE&domain=LINEAR`)
  const pairs = asRec.cohorts.map((c, i) => [c, linear.cohorts[i]])
  step('a cohort mean in linear power differs from the mean of the dB readings',
    pairs.length > 0 && pairs.every(([a, b]) => Math.abs(a.stats.mean - b.stats.mean) > 0.2),
    pairs.map(([a, b]) => `${a.value}: ${a.stats.mean} -> ${b.stats.mean}`).join(' · '))
  step('and the median does not move, because dB-to-linear preserves order',
    pairs.every(([a, b]) => a.stats.p50 === b.stats.p50),
    pairs.map(([a, b]) => `${a.value}: p50 ${a.stats.p50}/${b.stats.p50}`).join(' · '))

  // Again through the screen: counting the select proved nothing, because a select whose
  // value never reaches the request looks identical. The witness is the NUMBER on screen
  // moving when the control is used.
  const meanCell = (row) => page.locator('.cohort-table tbody tr', { hasText: row })
    .locator('td').nth(3).innerText()
  await page.goto(`${BASE}?mode=compare&by=BUILD_LABEL&hold=NONE`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const cohortAsRec = await meanCell('1.4.2')
  await page.locator('select[aria-label="Cohort mean in"]').selectOption('LINEAR')
  await page.waitForTimeout(2500)
  const cohortLinear = await meanCell('1.4.2')
  step('choosing linear power on the cohort screen changes the number on it',
    cohortAsRec !== cohortLinear && Math.abs(Number(cohortAsRec) - Number(cohortLinear)) > 0.2,
    `1.4.2 mean ${cohortAsRec} -> ${cohortLinear}`)

  await openMode('Compare')
  await page.locator('.scope-switch button', { hasText: 'Two drives' }).click()
  await page.waitForTimeout(2500)
  const compareRow = () => page.locator('table.grid tbody tr').first().locator('td').nth(1).innerText()
  const compAsRec = await compareRow()
  await page.locator('select[aria-label="Compare mean in"]').selectOption('LINEAR')
  await page.waitForTimeout(2500)
  const compLinear = await compareRow()
  step('and so does the two-drive comparison, which answered AS_RECORDED silently',
    compAsRec !== compLinear,
    `A mean ${compAsRec} -> ${compLinear}`)

  // ── the group that has no build label. The import above filled no Build, so the axis now
  //    has an `(unset)` bucket - and the picker has to say so, because "Build (3)" meaning
  //    two builds and a junk drawer is a different answer from three builds.
  const dims = (await apiGet('/api/cohorts?kpi=RSRP&holdConstant=NONE')).dimensions
  const build = dims.find((d) => d.key === 'BUILD_LABEL')
  await page.goto(`${BASE}?mode=compare&by=BUILD_LABEL&hold=NONE`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const groupLabels = await page.locator('select[aria-label="Group by"] option')
    .evaluateAll((os) => os.map((o) => o.textContent ?? ''))
  step('an axis with an unfilled group says so before the chart is drawn',
    build.hasUnset === true
    && groupLabels.some((t) => /Build/.test(t) && /incl\. unset/.test(t)),
    groupLabels.find((t) => /Build/.test(t)) ?? 'no Build option')

  // ── when each group was measured. The one confound hold-constant cannot pin: builds are
  //    sequential, so no held dimension will ever make two builds share a time.
  const tested = await page.locator('.cohort-table thead th')
    .evaluateAll((ths) => ths.map((t) => t.textContent ?? ''))
  const firstRow = await page.locator('.cohort-table tbody tr').first().innerText()
  step('and the table says when each group was measured',
    tested.includes('Tested') && /\d{4}-\d{2}-\d{2}/.test(firstRow),
    `${tested.join('|')} — ${firstRow.replace(/\n|\t/g, ' ').slice(0, 60)}`)

  // ── the contended count. It must carry information the other columns cannot: a cell 25 dB
  //    down is "detected" exactly as much as one 1 dB down, so a contended count equal to
  //    either neighbour column would be a column that says nothing.
  const bars = (await apiGet(`/api/sessions/${cityA}/neighbour-breakdown`)).bars
  const informative = bars.filter((b) =>
    b.samplesStrong !== b.samplesSeen && b.samplesStrong !== b.samplesServing)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await selectSession(CITY_A)
  await openWorkbook('Monitored Set')
  await page.waitForTimeout(1400)
  // The NUMBERS, not the heading. A header cell is there whether or not the column beside
  // it is filled from `samplesStrong`, and `informative` was read from the API - so the
  // screen contributed nothing to a step whose whole subject is what the screen shows.
  // The panel asks with its own default window of 6 dB, which is the service's default
  // too, so the parameterless read above is the same answer in the same row order.
  // Scoped to the one panel. `table.grid` matches the pollution table on the same page
  // too, so an unscoped `tbody tr` gathers rows from both and the comparison below is
  // against a list that is not the neighbour table.
  const monTable = page.locator('.panel:has(header .title:text-is("Across the whole drive"))'
                                + ' table.grid')
  const monHeads = await monTable.locator('thead th')
    .evaluateAll((ths) => ths.map((t) => (t.textContent ?? '').trim()))
  const contendedCol = monHeads.indexOf('Contended')
  const onScreen = await monTable.locator('tbody tr').evaluateAll(
    (rows, col) => rows.map((r) => (r.children[col]?.textContent ?? '').trim()), contendedCol)
  const expected = bars.map((b) => String(b.samplesStrong))
  step('the neighbour table shows how often a cell CONTENDED, not only that it was seen',
    contendedCol > 0 && informative.length > 0
    && onScreen.length === expected.length
    && onScreen.every((v, i) => v === expected[i]),
    `${informative.length} of ${bars.length} bars differ from both neighbours;`
    + ` column ${contendedCol} reads ${onScreen.slice(0, 4).join(',')}`
    + ` against ${expected.slice(0, 4).join(',')}`)

  // ── was the car moving. Already on every track point, rendered nowhere.
  await openWorkbook('Overview')
  await page.waitForTimeout(1400)
  // Hovered, not permanent: a label pinned to the map would clutter every screenshot, and
  // the reading is only wanted when the reader asks for it.
  // dispatchEvent rather than hover(): an event dot sits over the cursor marker on this
  // drive and intercepts the pointer, which is correct behaviour for the map and merely
  // inconvenient for a check. Leaflet opens the tooltip on 'mouseover' either way.
  await page.locator('path.cursor-marker').dispatchEvent('mouseover')
  await page.waitForTimeout(700)
  const tip = await page.locator('.leaflet-tooltip.cursor-tip').innerText().catch(() => '')
  const cursorSpeed = (await apiGet(`/api/sessions/${cityA}/track?kpi=RSRP&maxPoints=100000`))[0]
  step('the cursor says whether the vehicle was moving there',
    /km\/h/.test(tip) && cursorSpeed.speedKmh != null,
    tip.replace(/\n/g, ' ').slice(0, 48) || 'no cursor tooltip')

  // ── which physical unit produced a lab result.
  await openMode('Lab Campaigns')
  await page.waitForTimeout(1800)
  const chain = await page.locator('.chain-meta').allInnerTexts().catch(() => [])
  step('the lab chain names the unit, not only its model',
    chain.some((t) => /s\/n/.test(t)), chain.filter((t) => /s\/n/.test(t))[0] ?? chain.join(' | ').slice(0, 60))

  // ── a campaign is something you can open, not a name and a count.
  //
  // The seed has ONE campaign holding every run, so a click cannot be shown to NARROW here -
  // 3 of 3 is 3 either way. Rather than invent a second campaign, the two halves are
  // witnessed apart: the server's filter is shown to discriminate, and the click is shown to
  // reach it. Named so nobody later reads this as end-to-end proof of narrowing.
  const campaigns = await apiGet('/api/lab/campaigns')
  const target = campaigns[0]
  const runsAll = (await apiGet('/api/lab/runs')).length
  const runsIn = (await apiGet(`/api/lab/runs?campaignId=${target.id}`)).length
  const runsNone = (await apiGet('/api/lab/runs?campaignId=999999')).length
  step('the server really scopes runs to a campaign (a bound: the seed has only one)',
    runsIn === target.runCount && runsAll === runsIn && runsNone === 0,
    `${runsAll} in all, ${runsIn} in campaign ${target.id}, ${runsNone} in a campaign that does not exist`)

  await page.locator('.panel:has(header .title:text-is("Campaigns")) tbody tr',
    { hasText: target.name }).click()
  await page.waitForTimeout(1500)
  const runsHeader = await page.locator('.panel:has(header .title:text-is("Runs")) header .meta')
    .innerText()
  const scopedRuns = await page.locator('.panel:has(header .title:text-is("Runs")) tbody tr').count()
  step('and the click reaches it, with a way back',
    scopedRuns === target.runCount && runsHeader.includes(target.name)
    && await page.locator('.panel:has(header .title:text-is("Runs")) header button',
      { hasText: 'show all' }).count() === 1,
    `header reads "${runsHeader.replace(/\n/g, ' ')}", ${scopedRuns} rows`)

  // ── a measured column can be given its meaning BEFORE the file arrives. The import can
  //    define unknown columns, but with nothing to go on it stamps NEUTRAL - which tells the
  //    ramp there is no bad end and tells the verdict to withhold, permanently, because no
  //    endpoint edits a definition afterwards.
  await openMode('Import')
  await page.waitForTimeout(1500)
  await page.locator('input[aria-label="Measured KPI name"]').fill('S24_MARGIN_DB')
  await page.locator('input[aria-label="Measured KPI unit"]').fill('dB')
  await page.locator('select[aria-label="Measured KPI direction"]').selectOption('LOWER_IS_BETTER')
  await page.locator('.panel:has(input[aria-label="Measured KPI name"]) button',
    { hasText: 'Define' }).click()
  await page.waitForTimeout(1500)
  const defined = (await apiGet('/api/kpi-definitions')).find((d) => d.name === 'S24_MARGIN_DB')
  step('a measured column can be declared with a real direction instead of NEUTRAL',
    defined?.direction === 'LOWER_IS_BETTER' && defined?.unit === 'dB',
    defined ? `${defined.name}: ${defined.direction}, ${defined.unit}` : 'not defined')

  for (const id of made) await page.request.delete(`${API}/api/sessions/${id}`)
  await page.request.delete(`${API}/api/kpi-definitions/S24_MARGIN_DB`)
  const leftKpi = (await apiGet('/api/kpi-definitions')).some((d) => d.name === 'S24_MARGIN_DB')
  const leftSession = (await apiGet('/api/sessions')).some((x) => x.name.startsWith('S24 '))
  step('the scenario leaves nothing behind', !leftKpi && !leftSession,
    `${leftKpi ? 'kpi remains ' : ''}${leftSession ? 'session remains' : 'clean'}`)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}

// ─── S25 · Four things the manual asks for before it draws ───────────────────
//
// The only four items of this whole audit that are new capability rather than repair, and
// the only four with a page number: each was confirmed verbatim against the transcription
// before a line was written, because this project has been wrong about what the reference
// has - dashboards, NPS and trend analysis all traced to a marketing flyer.
//
// Three of the four are questions the reference asks BEFORE it draws anything: which cells,
// how close counts as competing, how many competitors. Ours drew first and answered with
// defaults nobody chose.
scenario('S25 · Four things the manual asks for before it draws')
{
  const cityA = sessions.find((x) => x.name === CITY_A).id

  // ── UC20 p173. The filter dialog's own two rows: `Polluter level window from the best
  //    active set` = -6 and `Pilot count threshold` = 3. Both were server parameters no
  //    screen sent, so the caption asserted "≥3" as a property of the tool.
  const pollution = async (qs) => (await apiGet(`/api/sessions/${cityA}/pilot-pollution${qs}`)).length
  const atDefault = await pollution('')
  const atWide = await pollution('?windowDb=12&minCells=2')
  const atStrict = await pollution('?windowDb=3&minCells=5')
  step('how close counts as competing, and how many competitors, change the verdict',
    atWide > atDefault && atStrict < atDefault,
    `${atStrict} stretches at 3 dB/5 cells, ${atDefault} at the default, ${atWide} at 12 dB/2 cells`)

  await selectSession(CITY_A)
  await openWorkbook('Monitored Set')
  await page.waitForTimeout(1600)
  const spanCount = () => page.locator('.panel:has(header .title:text-is("Pilot pollution")) header .meta')
    .innerText()
  const uiDefault = await spanCount()
  await page.locator('input[aria-label="Pollution cell count"]').fill('2')
  await page.locator('input[aria-label="Pollution window dB"]').fill('12')
  await page.waitForTimeout(2000)
  const uiWide = await spanCount()
  const caption = await page.locator('.panel:has(header .title:text-is("Pilot pollution")) div')
    .first().innerText()
  step('the screen asks them too, and its caption reports what it asked',
    uiDefault !== uiWide && /≥\s*2 cells/.test(caption) && /12 dB/.test(caption),
    `${uiDefault} -> ${uiWide}; caption "${caption.split('\n')[0].slice(0, 70)}"`)

  // ── UC1 p67. The dialog's own help gives the grammar: `3,10-30,42,100-`. The manual also
  //    gives the reason - "Analysis will not work properly if there will be hundreds of
  //    pages in the results" - which is ours too: overlapping every hull at once is how the
  //    layer stops answering.
  // Coverage Issues, not Overview: the footprint layer draws on the maps where cell
  // identity is the question, and asking for hulls on a map that never draws them would
  // have made this check pass on a route polyline count.
  await openWorkbook('Coverage Issues')
  await page.waitForTimeout(1200)
  await page.locator('.toolbar .group:has(label:text("Footprints")) button').click()
  await page.waitForTimeout(1800)
  const hulls = () => page.locator('path.footprint-hull').count()
  const allCells = (await apiGet(`/api/sessions/${cityA}/cell-footprints?basis=SERVING`))
    .map((f) => f.pci).sort((a, b) => a - b)
  const before = await hulls()
  const keep = `${allCells[0]},${allCells[1]}`
  await page.locator('input[aria-label="Footprint cells"]').fill(keep)
  await page.waitForTimeout(1200)
  const after = await hulls()
  const note = await page.locator('.map-panel header .title').innerText()
  // WHICH cells, not only how many. An exact count still passes on a filter that keeps
  // the right NUMBER of the wrong hulls, and the header is not an independent witness -
  // App derives the caption and the drawing from one expression. So the check names the
  // survivors: each kept PCI has its hull, and a PCI that was filtered out has none.
  const flat = note.replace(/\n/g, ' ')
  const drawn = (pci) => page.locator(`path.footprint-hull.pci-${pci}`).count()
  const dropped = allCells[allCells.length - 1]
  const keptA = await drawn(allCells[0])
  const keptB = await drawn(allCells[1])
  const goneC = await drawn(dropped)
  step('the cell filter narrows what is drawn, and the map says what it left out',
    before - after === allCells.length - 2 && keptA === 1 && keptB === 1 && goneC === 0
    && new RegExp(`2 of ${allCells.length} cells`).test(flat),
    `${before} shapes -> ${after} for "${keep}" of ${allCells.length} cells;`
    + ` kept ${allCells[0]}:${keptA} ${allCells[1]}:${keptB}, dropped ${dropped}:${goneC};`
    + ` header says "${flat.slice(0, 90)}"`)

  // A range and an open range, the two forms a bare list cannot express. `100-` is how an
  // operator says "the small-cell layer" without knowing where it ends.
  const lo = allCells[0]
  const hi = allCells[allCells.length - 1]
  await page.locator('input[aria-label="Footprint cells"]').fill(`${lo}-${lo}`)
  await page.waitForTimeout(1000)
  const single = await hulls()
  await page.locator('input[aria-label="Footprint cells"]').fill(`${hi}-`)
  await page.waitForTimeout(1000)
  const openEnded = await hulls()
  await page.locator('input[aria-label="Footprint cells"]').fill('not a cell')
  await page.waitForTimeout(1000)
  const badNote = await page.locator('.map-panel header .title').innerText()
  // One, not "fewer than before": `lo-lo` and `hi-` each select exactly one of these
  // cells, and that number is derivable two lines above. `<` would pass on a range that
  // matched everything but one.
  step('ranges and open ranges parse, and a typo is refused rather than silently obeyed',
    single === 1 && openEnded === 1 && /ignored/.test(badNote),
    `${lo}-${lo} -> ${single}, ${hi}- -> ${openEnded}, typo -> `
    + `"${badNote.replace(/\n/g, ' ').match(/ignored[^—]*/)?.[0]?.slice(0, 40) ?? 'no notice'}"`)
  await page.locator('input[aria-label="Footprint cells"]').fill('')
  await page.locator('.toolbar .group:has(label:text("Footprints")) button').click()
  await page.waitForTimeout(800)

  // ── UC16 p158-162. `Measurement Group 1` AND `Measurement Group 2`, each with its own
  //    list. The service was symmetric from the first commit; only this screen was not, so
  //    "the evening runs against the morning runs" could be asked one way round.
  const others = sessions.filter((x) => x.id !== cityA).map((x) => x.id)
  const oneSide = await apiGet(
    `/api/sessions/${cityA}/spatial-diff?other=${others[0]}&kpi=RSRP&sizeMeters=150`)
  const bothSides = await apiGet(
    `/api/sessions/${cityA}/spatial-diff?other=${others[0]}&kpi=RSRP&sizeMeters=150`
    + `&withA=${others[1]}`)
  step('the NEAR side can be a group too, and adding to it changes the ground covered',
    oneSide.groupA.length === 1 && bothSides.groupA.length === 2
    && bothSides.tilesOnlyA > oneSide.tilesOnlyA,
    `near side ${oneSide.groupA.length} -> ${bothSides.groupA.length} drives,`
    + ` one-sided tiles ${oneSide.tilesOnlyA} -> ${bothSides.tilesOnlyA}`)

  await openWorkbook('Compare on the Ground')
  await page.waitForTimeout(1800)
  const nearAdd = page.locator('select[aria-label="Add to the near side"]')
  const nearOptions = await nearAdd.locator('option').count()
  await nearAdd.selectOption({ index: 1 })
  await page.waitForTimeout(2000)
  const nearBanner = await page.locator('.diff-group').first().innerText()
  step('and the screen offers it symmetrically, saying which drives each side holds',
    nearOptions > 1 && /Near side is a group of 2/.test(nearBanner),
    nearBanner.replace(/\n/g, ' ').slice(0, 90))

  // ── p87, quoted verbatim in two of our own reference files: "Each drill-down from the
  //    same chart will open a NEW TAB in the same window... with the colors of the
  //    corresponding sectors." The workflow is holding two causes open at once; with one
  //    slot, comparing them is done from memory.
  await openWorkbook('Problem Survey')
  await page.waitForTimeout(1800)
  const causeRows = page.locator('.panels table.grid tbody tr')
  const firstTwo = Math.min(2, await causeRows.count())
  for (let i = 0; i < firstTwo; i++) {
    await causeRows.nth(i).click()
    await page.waitForTimeout(700)
  }
  const tabs = await page.locator('.cause-tabs button').count()
  const swatches = await page.locator('.cause-tabs button .swatch')
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor))
  step('two causes stay open at once, each tab in its own sector colour',
    tabs === firstTwo && firstTwo === 2 && new Set(swatches).size === 2,
    `${tabs} tabs, colours ${JSON.stringify(swatches)}`)

  // The tab has to SELECT, not merely exist: switching must change the case grid under it.
  const casesHeader = () => page.locator('.panels .panel:has(header .title:text("cases")) header .title')
    .innerText()
  const onSecond = await casesHeader()
  await page.locator('.cause-tabs button').first().click()
  await page.waitForTimeout(900)
  const onFirst = await casesHeader()
  step('and switching tabs changes the cases underneath, which is the point of keeping both',
    onFirst !== onSecond && /cases/.test(onFirst),
    `"${onSecond.trim()}" -> "${onFirst.trim()}"`)

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}

// ─── S26 · A control is offered only where something answers it ──────────────
//
// The negative check §1.5.17 asks for. Every other step in this file drives a control on a
// screen that consumes it, which is exactly how five toolbar groups came to be live on
// fourteen tabs while three tabs read them: each check drove the one tab where its control
// worked, and all of them passed.
//
// Cheaper than driving fourteen tabs, and it goes red the moment the WORKBOOKS table and
// the toolbar disagree - which is the failure this is really guarding.
scenario('S26 · A control is offered only where something answers it')
{
  const GROUPS = [
    ['Colour by', 'colour'],
    ['Area bins', 'areaBins'],
    ['Distance bins', 'distanceBins'],
    ['Footprint basis', 'footprints'],
  ]
  const shown = async () => {
    const out = []
    for (const [label] of GROUPS) {
      out.push(await page.locator(`.toolbar [aria-label="${label}"]`).count() > 0)
    }
    return out
  }
  const areaShown = () => page.locator('.toolbar button', { hasText: /Ask an area|Drawing/ })
    .count()

  await selectSession(CITY_A)
  await openWorkbook('Overview')
  await page.waitForTimeout(1400)
  // Footprints has to be ON for its basis select to exist, so the group is read through a
  // control that is present whenever the group is.
  await page.locator('.toolbar .group:has(label:text("Footprints")) button').click()
  await page.waitForTimeout(1200)
  const onOverview = await shown()
  step('Overview offers all four of the groups its own row claims',
    onOverview.every(Boolean) && await areaShown() === 1,
    `${GROUPS.map(([l], i) => `${l}:${onOverview[i] ? 'yes' : 'no'}`).join(' ')}`
    + ` · area:${await areaShown()}`)

  // Statistics has a table and no map. Nothing here can answer any of them.
  await openWorkbook('Statistics')
  await page.waitForTimeout(1400)
  const onStats = await shown()
  step('a screen with no map offers none of them, rather than latching a dead button',
    onStats.every((v) => v === false) && await areaShown() === 0,
    `${GROUPS.map(([l], i) => `${l}:${onStats[i] ? 'yes' : 'no'}`).join(' ')}`
    + ` · area:${await areaShown()}`)

  // Mobility is the interesting row: it paints the toolbar's colour scale and draws
  // footprints, and deliberately does NOT take area bins - tiles replace the route the
  // monitored-set fan is anchored to. A blanket "map tabs get everything" would pass the
  // two steps above and fail this one.
  await openWorkbook('Mobility')
  await page.waitForTimeout(1600)
  const onMobility = await shown()
  step('and a map screen offers exactly its own row, not every group a map could take',
    onMobility[0] === true && onMobility[3] === true
    && onMobility[1] === false && onMobility[2] === false
    && await areaShown() === 0,
    `${GROUPS.map(([l], i) => `${l}:${onMobility[i] ? 'yes' : 'no'}`).join(' ')}`
    + ` · area:${await areaShown()}`)

  // ── the same rule one level down, in the Layers dock.
  //
  // The toolbar answers "does this SCREEN take the group". The dock answers "does this MAP
  // draw the layer", and they are not the same question: the Cells map is a map, and it
  // draws neither footprints nor event pins. The dock listed "Cell footprints - off"
  // there anyway, because the switch is application-wide, so ticking it drew nothing and
  // then deleted the row that had been ticked.
  //
  // Driven with footprints SWITCHED OFF, because that is the only state in which the bug
  // is visible - a check run in the default state passes over it. §1.5.11.
  await openWorkbook('Overview')
  await page.waitForTimeout(1400)
  const footprintBox = page.locator('.dock.right .map-layer', { hasText: 'Cell footprints' })
    .locator('input[type=checkbox]')
  if (await footprintBox.isChecked()) { await footprintBox.click(); await page.waitForTimeout(900) }
  const overviewRows = await page.locator('.dock.right .map-layer').allInnerTexts()

  await openWorkbook('Cells')
  await page.waitForTimeout(2000)
  const cellsRows = await page.locator('.dock.right .map-layer').allInnerTexts()
  const names = (rows) => rows.map((t) => t.replace(/\s+/g, ' ').trim())
  step('a map lists the layers IT draws, not every layer the application can switch',
    names(overviewRows).some((t) => /^Cell footprints/.test(t))
    && cellsRows.length > 0
    && !names(cellsRows).some((t) => /^Cell footprints/.test(t)),
    `Overview: ${names(overviewRows).join(' | ')} || Cells: ${names(cellsRows).join(' | ')}`)

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}

// ─── S27 · The two causes a Nemo user looks for first ────────────────────────
//
// `Missing handover` and `Missing neighbour` are the reference's best-known verdicts, and
// this project carried them for weeks on a reason that was wrong - "a missing neighbour is
// the measured set minus the CONFIGURED list and we have no configured list". UC27 p404
// judges from measurements alone: "if Ec/N0 1. best is better than Ec/N0 best active set,
// the handover has not occurred".
//
// What actually blocked them was the seed. The generator picked the strongest cell as
// serving at every sample, so "a neighbour stronger than serving" existed in 0 of 21,070
// neighbour rows and both detectors would have found nothing while looking correct.
scenario('S27 · The two causes a Nemo user looks for first')
{
  const hw = sessions.find((x) => x.name === HIGHWAY).id
  const survey = await apiGet(`/api/sessions/${hw}/problem-survey`)
  const mob = survey.instances.filter((i) => i.category.startsWith('MISSING_'))
  const late = mob.filter((i) => i.category === 'MISSING_HANDOVER')
  const norel = mob.filter((i) => i.category === 'MISSING_NEIGHBOUR')

  step('the drive has late handovers, and each names the cell that was better',
    late.length > 0 && late.every((i) => /PCI \d+ was up to [\d.]+ dB stronger/.test(i.detail)),
    `${late.length} instances, e.g. "${late[0]?.detail?.slice(0, 72) ?? 'none'}"`)

  // The margin is the whole judgement: below the hysteresis a real network is configured
  // with, staying put is correct behaviour and reporting it would fill the pie with the
  // ordinary flutter of two cells crossing over.
  const margins = late.map((i) => Number(/up to ([\d.]+) dB/.exec(i.detail)?.[1]))
  step('and every one of them clears the handover margin, not merely a crossover',
    margins.length > 0 && margins.every((m) => m >= 3),
    `margins ${margins.join(', ')} dB`)

  // The two causes are told apart by whether the better cell EVER serves on this drive -
  // an inference, so it has to be checkable against the samples rather than trusted.
  const track = await apiGet(`/api/sessions/${hw}/track?kpi=RSRP`)
  const everServes = new Set(track.map((p) => p.servingPci).filter((p) => p != null))
  const latePcis = late.map((i) => Number(/PCI (\d+)/.exec(i.detail)?.[1]))
  const norelPcis = norel.map((i) => Number(/PCI (\d+)/.exec(i.detail)?.[1]))
  step('a LATE handover names a cell the drive really does camp on somewhere',
    latePcis.length > 0 && latePcis.every((p) => everServes.has(p)),
    `${latePcis.join(', ')} against serving set ${[...everServes].sort((a, b) => a - b).join(', ')}`)
  step('and a MISSING RELATION names one it never camps on, anywhere',
    norelPcis.length > 0 && norelPcis.every((p) => !everServes.has(p)),
    `${norelPcis.join(', ')} never serve`)

  // The distinction has to be visible, not only computed: the two faults want different
  // work - retune a threshold, or provision a relation that does not exist.
  const slices = survey.categories.map((c) => c.label)
  step('both appear as their own slices, so the pie separates them',
    slices.includes('Missing handover') && slices.includes('Missing neighbour'),
    slices.join(' · '))

  await selectSession(HIGHWAY)
  await openWorkbook('Problem Survey')
  await page.waitForTimeout(1800)
  // Scoped to the causes panel. The case list under it carries the cause name in every
  // row too, so an unscoped `table.grid tbody tr` counts one slice plus all its cases.
  const rows = await page
    .locator('.panel:has(header .title:text-is("Problem survey per category")) tbody tr')
    .allTextContents()
  const shown = rows.filter((r) => /Missing/.test(r))
  step('and the screen shows them, with counts that match the survey',
    shown.length === 2
    && shown.some((r) => r.includes(String(late.length)))
    && shown.some((r) => r.includes(String(norel.length))),
    shown.map((r) => r.replace(/\s+/g, ' ').trim()).join(' | ').slice(0, 110))

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}

// ─── S28 · Where the cells really are, and whether the record agrees ─────────
//
// UC21 p174-176. The first scoping of this called it a demo - we hold `cell_ref`, so
// estimating a position we already know looked like arithmetic with the answer alongside.
// The manual's own figure settles it the other way: p175 draws the REAL site in green and
// the ESTIMATED one in purple on one map, because having the record is the CONDITION for
// using this. What an operator is asking is whether the record is still true.
scenario('S28 · Where the cells really are, and whether the record agrees')
{
  const cityA = sessions.find((x) => x.name === CITY_A).id
  const est = await apiGet(`/api/sessions/${cityA}/cell-locator`)
  const withRef = est.filter((e) => e.errorMetres != null)

  step('every cell the drive measured gets a position estimated from measurement alone',
    est.length > 0 && est.every((e) =>
      Number.isFinite(e.latitude) && Number.isFinite(e.longitude) && e.samplesUsed > 0),
    `${est.length} cells, ${withRef.length} with a record to compare against`)

  // The reference attaches "<100 m" to a score, so ours has to mean the same thing or the
  // column is decoration. This is the assertion the confidence formula must satisfy - if a
  // future drive puts a high-confidence estimate past 100 m, the weights were wrong.
  // It has already caught exactly that: the weights were chosen on three drives and this
  // step went red on the fourth (198 m at 6). See ui-testing/README.md 1.5.19 - a check
  // that restated the formula would have stayed green, because the formula had not
  // changed; what broke was what the formula PROMISED.
  const good = withRef.filter((e) => e.confidence >= 6)
  const worst = good.length ? Math.max(...good.map((e) => e.errorMetres)) : null
  step('and a confidence of 6 or more means inside 100 m, the accuracy the manual claims',
    good.length > 0 && worst < 100,
    `${good.length} of ${withRef.length} at 6+, worst ${worst?.toFixed(0)} m`)

  // A number that does not track the thing it describes is worse than no number: it is
  // read as a judgement. Low-confidence estimates have to be measurably worse.
  const poor = withRef.filter((e) => e.confidence < 6)
  const medianOf = (a) => a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null
  const gm = medianOf(good.map((e) => e.errorMetres))
  step('and the number is honest: the low-confidence ones really are further out',
    poor.length === 0 || medianOf(poor.map((e) => e.errorMetres)) > gm,
    poor.length === 0 ? `every cell scored 6+ on this drive (median ${gm?.toFixed(0)} m)`
      : `median ${gm?.toFixed(0)} m at 6+ against `
        + `${medianOf(poor.map((e) => e.errorMetres))?.toFixed(0)} m below`)

  // The reference's `Minimum accuracy score` - and its own warning that a high one can
  // filter everything out.
  const strict = await apiGet(`/api/sessions/${cityA}/cell-locator?minScore=10`)
  step('the minimum accuracy score drops the estimates that do not reach it',
    strict.length < est.length && strict.every((e) => e.confidence >= 10),
    `${est.length} cells at any score, ${strict.length} at 10`)

  await selectSession(CITY_A)
  await openWorkbook('Cells')
  await page.waitForTimeout(2200)

  // Both positions on one map, which is the reference's own picture.
  const drawn = await page.locator('path.cell-estimate').count()
  step('the screen draws the estimate beside the recorded position, as the manual does',
    drawn === est.length && drawn > 0,
    `${drawn} estimated positions drawn against ${est.length} estimated`)

  // The dock names what the map is drawing, and it could not see this layer at all: the
  // estimates reached RouteMap as a prop of their own instead of through `MapContents`,
  // which is the one thing view/maplayers.ts exists to forbid. A map with an overlay the
  // Layers list cannot account for is the defect that file was written for, and the change
  // that added this overlay committed it.
  const layerRows = await page.locator('.dock.right .map-layer').allInnerTexts()
  const locatorRow = layerRows.find((t) => /Estimated cell positions/.test(t))
  step('and the Layers dock accounts for the overlay, by name and by count',
    locatorRow != null && locatorRow.trim().endsWith(String(est.length)),
    locatorRow ? locatorRow.replace(/\s+/g, ' ').trim() : `no such row in [${layerRows.join(' | ')}]`)

  const rows = await page
    .locator('.panel:has(header .title:text-is("Cell locator")) tbody tr').count()
  const firstRow = await page
    .locator('.panel:has(header .title:text-is("Cell locator")) tbody tr').first().innerText()
  step('and the table gives the distance, because a line on a map has no scale to read',
    rows === est.length && /\d+ m/.test(firstRow),
    `${rows} rows, first "${firstRow.replace(/\s+/g, ' ').trim().slice(0, 60)}"`)

  // ── UC18 p171: "the map zooms to the cell chosen in the grid". The Cells page had no
  //    map until now, which is why this row click had nothing to do.
  // What framing has to put in the middle is the PAIR, not one of them: the two points are
  // hundreds of metres apart, so centring either one pushes the other toward the edge, and
  // the gap between them is the thing this screen is for.
  const mapBox = await page.locator('.map').first().boundingBox()
  const mapCentre = { x: mapBox.x + mapBox.width / 2, y: mapBox.y + mapBox.height / 2 }
  const midOf = async (pci) => {
    const a = await page.locator(`path.cell-estimate.pci-${pci}`).first().boundingBox()
    const b = await page.locator(`path.cell-site.pci-${pci}`).first().boundingBox()
    if (!a || !b) return null
    return { x: (a.x + a.width / 2 + b.x + b.width / 2) / 2,
             y: (a.y + a.height / 2 + b.y + b.height / 2) / 2 }
  }
  const distTo = (p) => (p == null ? Infinity : Math.hypot(p.x - mapCentre.x, p.y - mapCentre.y))
  const far = [...est].sort((a, b) => (b.errorMetres ?? 0) - (a.errorMetres ?? 0))[0].pci
  const beforePos = await midOf(far)
  await page.locator('.panel:has(header .title:text-is("Serving cell breakdown")) tbody tr')
    .filter({ hasText: String(far) }).first().click()
  await page.waitForTimeout(1600)
  const afterPos = await midOf(far)
  // The attribute says the row reached the map; the geometry says the map then acted on
  // it. Two failures that look the same from outside and want different fixes.
  const asked = await page.locator('.map').first().getAttribute('data-focus-pci')
  step('picking a cell in the grid frames that cell and its estimate together',
    asked === String(far) && distTo(afterPos) < distTo(beforePos)
    && distTo(afterPos) < mapBox.width * 0.12,
    `PCI ${far}: map asked for "${asked}", pair was ${distTo(beforePos).toFixed(0)} px from`
    + ` centre, now ${distTo(afterPos).toFixed(0)} px (map ${mapBox.width.toFixed(0)} px)`)

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}

// ─── S29 · A graph that asks its question at run time ────────────────────────
//
// p398: writing `{?threshold}` where a number goes makes a KPI ask for one every time it
// runs. Our model materialises a published graph into `sample_kpi` under ONE name, so two
// thresholds cannot both be stored - and the obvious workaround, cloning the graph, leaves
// two documents that drift. The variable keeps one document and moves the question to the
// run.
scenario('S29 · A graph that asks its question at run time')
{
  const cityA = sessions.find((x) => x.name === CITY_A).id
  const askingSpec = {
    version: 1,
    nodes: [
      { id: 1, kind: 'SOURCE_KPI', x: 40, y: 24, kpiName: 'RSRP' },
      { id: 2, kind: 'FILTER', x: 40, y: 126, expression: 'RSRP < {?threshold}' },
      { id: 3, kind: 'OUTPUT', x: 40, y: 228, column: 'RSRP' },
    ],
    edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }],
  }
  const post = (path, body) => page.request.post(`${API}${path}`, { data: body })

  // Reported even without values, so the editor can put the form up rather than answer
  // "a condition is required" at someone who was never asked.
  const shape = await (await post('/api/kpi-definitions/graphs/validate',
    { name: 'x', output: null, spec: askingSpec })).json()
  step('the graph names the value it wants, and still compiles without one',
    shape.ok === true && shape.variables?.length === 1 && shape.variables[0] === 'threshold',
    `variables ${JSON.stringify(shape.variables)}, ok ${shape.ok}`)

  // The point of the whole feature: ONE document, two answers.
  const rowsAt = async (v) => {
    const r = await post(
      `/api/kpi-definitions/graphs/preview?nodeId=2&sessionId=${cityA}&limit=1`,
      { name: 'x', output: null, vars: { threshold: String(v) }, spec: askingSpec })
    return (await r.json()).rowCount
  }
  const at100 = await rowsAt(-100)
  const at110 = await rowsAt(-110)
  step('one graph answers differently for two values, without being cloned',
    at100 > at110 && at110 > 0,
    `${at100} samples below -100 dBm, ${at110} below -110`)

  // The compiler's safety rule is that no span of user input reaches the SQL. A variable
  // is the one place a caller hands over something to put INSIDE an expression, so it has
  // to be a number or nothing - refused, not quoted.
  const injected = await post(
    `/api/kpi-definitions/graphs/preview?nodeId=2&sessionId=${cityA}&limit=1`,
    { name: 'x', output: null, vars: { threshold: '0 OR 1=1' }, spec: askingSpec })
  const missing = await post(
    `/api/kpi-definitions/graphs/preview?nodeId=2&sessionId=${cityA}&limit=1`,
    { name: 'x', output: null, spec: askingSpec })
  step('a value that is not a number is refused rather than quoted into the query',
    injected.status() === 400 && missing.status() === 400
    && /number/i.test(JSON.stringify(await injected.json())),
    `injection ${injected.status()}, missing value ${missing.status()}`)

  // ── and the screen asks. Driven, not counted: the form has to appear because the
  //    EXPRESSION contains a variable, and filling it has to change what the graph says.
  // The workbench lives on the Import screen, beside the other things that DEFINE data
  // rather than read it - not on a workbook tab.
  await openMode('Import')
  await page.waitForTimeout(1600)
  const varRow = page.locator('.graph-vars')
  step('a graph with no variables asks nothing',
    (await varRow.count()) === 0, `${await varRow.count()} variable rows on an empty canvas`)

  // A round trip, not a presence count: the form exists because the SERVER parsed the
  // condition this typing produced and reported the name back. Typing a different name has
  // to move the form with it, which a rendered-from-a-constant form could not do.
  await page.locator('.wb-palette button').filter({ hasText: 'Filter' }).first().click()
  await page.waitForTimeout(600)
  await page.locator('input[aria-label="Condition"]').fill('RSRP < {?threshold}')
  await page.waitForTimeout(1400)
  const asked = await page.locator('.graph-vars input').getAttribute('aria-label')
  step('typing a variable into a condition makes the screen ask for it, by name',
    asked === 'Variable threshold', `the form offers "${asked}"`)

  await page.locator('input[aria-label="Condition"]').fill('RSRP < {?floor} AND SINR > {?snr}')
  await page.waitForTimeout(1400)
  const both = await page.locator('.graph-vars input')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  step('and renaming them moves the form, because the server is reading what was typed',
    both.length === 2 && both.join(',') === 'Variable floor,Variable snr',
    `now asks ${JSON.stringify(both)}`)

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}

// ─── wrap-up ─────────────────────────────────────────────────────────────────
// ─── S30 · The analysis leaves the tool, saying what it is ───────────────────
//
// UC15 step 4 (p156), UC21's two routes (p176) and the legend's `Export To Text File`
// (p429-432). What the reference exports from these objects is the ANALYSIS - the tiles
// with the statistic that painted them, the estimated positions with their confidence, the
// legend with its bins - not the samples underneath. Exporting only samples leaves the
// reader to re-derive the analysis in a spreadsheet, from a thousand rows, with no way to
// check the result against the screen.
scenario('S30 · The analysis leaves the tool, saying what it is')
{
  const sid = sessions.find((x) => x.name === CITY_A).id
  const url = (kind, qs) => `${API}/api/sessions/${sid}/export.${kind}?${qs}`
  const getCsv = async (qs) => csvParts(await (await page.request.get(url('csv', qs))).text())
  const getGeo = async (qs) => (await page.request.get(url('geojson', qs))).json()

  // ── the exact count, not "> 0". A writer that drops the last row passes any
  //    non-emptiness check, and the file it produces looks complete. §1.5.16.
  const bins = await apiGet(`/api/sessions/${sid}/bins?kpi=RSRP&sizeMeters=150`)
  const binsCsv = await getCsv('result=bins&kpi=RSRP&sizeMeters=150')
  const binsGeo = await getGeo('result=bins&kpi=RSRP&sizeMeters=150')
  const dist = await apiGet(`/api/sessions/${sid}/distribution?kpi=RSRP`)
  const distCsv = await getCsv('result=distribution&kpi=RSRP')
  const est = await apiGet(`/api/sessions/${sid}/cell-locator`)
  const estGeo = await getGeo('result=cell-locator')
  const withRef = est.filter((e) => e.refLatitude != null)

  step('every row of the analysis reaches the file, counted exactly',
    bins.length > 0 && binsCsv.rows.length === bins.length
    && binsGeo.features.length === bins.length
    && dist.bins.length > 0 && distCsv.rows.length === dist.bins.length
    // Two features per cell where there is a record to disagree with: the estimate, and
    // the line to where the record puts it.
    && est.length > 0 && estGeo.features.length === est.length + withRef.length,
    `bins ${binsCsv.rows.length}/${bins.length} csv, ${binsGeo.features.length} geo · `
    + `legend ${distCsv.rows.length}/${dist.bins.length} · `
    + `locator ${estGeo.features.length} features from ${est.length} cells (${withRef.length} with a record)`)

  // ── the tile is the tile the map drew. Recomputing the corners in the writer would give
  //    a third answer: the grid is cut on the measurement's centre latitude, and until
  //    today the browser drew each tile from its own with no floor on the cosine.
  //
  //    EVERY tile, not the first. The tiles near the measurement's centre latitude are
  //    exactly the ones where a per-tile cosine and a centre-latitude cosine agree, so a
  //    step that sampled one could sample the one that cannot show the difference - and
  //    when this was first written it did, and the injection passed. Measured on this
  //    drive the two conventions differ by up to 5.3e-6 degrees; the tolerance below is
  //    2e-6, which is the most that six-decimal printing can account for.
  let worstLat = 0
  let worstLon = 0
  let ringsOk = binsGeo.features.length === bins.length
  for (const f of binsGeo.features) {
    const r = f.geometry.coordinates[0]
    if (r.length !== 5 || r[0][0] !== r[4][0] || r[0][1] !== r[4][1]) { ringsOk = false; continue }
    const b = bins.find((x) => Math.abs(x.centerLat - (r[0][1] + r[2][1]) / 2) < 1e-6
                            && Math.abs(x.centerLon - (r[0][0] + r[2][0]) / 2) < 1e-6)
    if (!b) { ringsOk = false; continue }
    worstLat = Math.max(worstLat, Math.abs((r[2][1] - r[0][1]) - b.latSpan))
    worstLon = Math.max(worstLon, Math.abs((r[2][0] - r[0][0]) - b.lonSpan))
  }
  step('every tile is exported as the rectangle the grid was cut on, closed',
    ringsOk && worstLat < 2e-6 && worstLon < 2e-6,
    `${binsGeo.features.length} rings, worst deviation ${worstLat.toExponential(2)} lat `
    + `${worstLon.toExponential(2)} lon`)

  // ── what the screen states around the number travels with it. Read off the RESULT: the
  //    file has to say [Minimum] because the tiles were painted from their minimum, not
  //    because the request said so - those come apart the moment a value is defaulted.
  const minCsv = await getCsv('result=bins&kpi=RSRP&sizeMeters=150&statistic=MINIMUM')
  const avgCsv = await getCsv('result=bins&kpi=RSRP&sizeMeters=150')
  const col = (p, name) => {
    const at = csvCells(p.header).indexOf(name)
    return at < 0 ? [] : p.rows.map((r) => csvCells(r)[at])
  }
  step('the statistic that painted the tiles is in the file, and it is the one used',
    minCsv.preamble.some((l) => /^# statistic: \[Minimum\]/.test(l))
    && avgCsv.preamble.some((l) => /^# statistic: \[Average\]/.test(l))
    && col(minCsv, 'statistic').every((v) => v === '[Minimum]')
    // The painted value must actually differ, or the label is decoration on identical files.
    && JSON.stringify(col(minCsv, 'painted_value')) !== JSON.stringify(col(avgCsv, 'painted_value')),
    `minimum: ${col(minCsv, 'painted_value').slice(0, 3).join(',')} · `
    + `average: ${col(avgCsv, 'painted_value').slice(0, 3).join(',')}`)

  // ── derived is a column, because a legend built from this drive's own quartiles is
  //    indistinguishable from a configured one and reads as a pass/fail nobody made.
  //    Made here rather than looked for: every KPI in the seed is configured, so a check
  //    that hunted for an unconfigured one would find none and pass on an empty set. Strip
  //    one the way a newly imported KPI arrives, export, put it back - the same technique
  //    S10 uses for the same reason.
  const stripped = 'CQI'
  await page.request.delete(`${API}/api/kpi-definitions/${stripped}/thresholds`)
  const derivedDist = await apiGet(`/api/sessions/${sid}/distribution?kpi=${stripped}`)
  const derivedCsv = await getCsv(`result=distribution&kpi=${stripped}`)
  await page.request.post(`${API}/api/kpi-definitions/${stripped}/thresholds/reset`)

  step('a legend says whether its colours are a judgement or this drive ranked against itself',
    derivedDist.derived === true && derivedCsv.rows.length > 0
    && col(derivedCsv, 'derived').every((v) => v.startsWith('yes'))
    && distCsv.rows.length > 0
    && col(distCsv, 'derived').every((v) => v.startsWith('no')),
    `${stripped}: ${col(derivedCsv, 'derived')[0]} · RSRP: ${col(distCsv, 'derived')[0]}`)

  // ── the condition, from what the SOURCE does rather than from a second list. An exempt
  //    result must not print a blank: a file that drops the condition silently is read as a
  //    file the condition did not change.
  const enc = encodeURIComponent('kpi:RSRQ:>=:-12')
  const binsFiltered = await getCsv(`result=bins&kpi=RSRP&sizeMeters=150&filter=${enc}`)
  const locFiltered = await getCsv(`result=cell-locator&filter=${enc}`)
  step('an honoured result narrows and says so; an exempt one says it did NOT',
    binsFiltered.rows.length > 0 && binsFiltered.rows.length < bins.length
    && col(binsFiltered, 'global_filter').every((v) => /RSRQ/.test(v) && !/not applied/.test(v))
    && locFiltered.rows.length === est.length
    && col(locFiltered, 'global_filter').every((v) => v.startsWith('not applied')),
    `bins ${bins.length} -> ${binsFiltered.rows.length} · locator stays ${locFiltered.rows.length}`
    + `, saying "${col(locFiltered, 'global_filter')[0]?.slice(0, 40)}…"`)

  // ── UC23. The line is only worth exporting if it IS the line: the geometry's two ends
  //    have to be the sample and the recorded cell, and `metres` has to describe that same
  //    pair. A column of plausible distances beside geometry computed some other way is
  //    the failure this pins down - both look right on their own.
  const lines = await apiGet(`/api/sessions/${sid}/serving-lines`)
  const linesCsv = await getCsv('result=serving-lines')
  const linesGeo = await getGeo('result=serving-lines')
  const metresApart = (a, b) => {
    const R = 6371000
    const dLat = (b[1] - a[1]) * Math.PI / 180
    const dLon = (b[0] - a[0]) * Math.PI / 180
    const la1 = a[1] * Math.PI / 180
    const la2 = b[1] * Math.PI / 180
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(h))
  }
  const stated = col(linesCsv, 'metres').map(Number)
  const drawnLen = linesGeo.features.map((f) => metresApart(...f.geometry.coordinates))
  // A metre of slack: both ends are printed at six decimals before this recomputes them.
  const worstMetres = drawnLen.length === stated.length && stated.length > 0
    ? Math.max(...drawnLen.map((m, i) => Math.abs(m - stated[i]))) : Infinity
  step('a serving cell line is the line it says it is, and its length describes that line',
    lines.length > 0 && linesCsv.rows.length === lines.length
    && linesGeo.features.length === lines.length
    && linesGeo.features.every((f) => f.geometry.type === 'LineString'
                                   && f.geometry.coordinates.length === 2)
    && worstMetres < 1,
    `${lines.length} lines, worst length disagreement ${worstMetres.toFixed(3)} m`)

  // ── a request that cannot mean anything is refused rather than answered with a file that
  //    looks like the one that was asked for.
  const status = async (kind, qs) => (await page.request.get(url(kind, qs))).status()
  const refusals = {
    unknownResult: await status('csv', 'result=nope&kpi=RSRP'),
    unreadParam: await status('csv', 'result=distribution&kpi=RSRP&sizeMeters=500'),
    noGeometry: await status('geojson', 'result=distribution&kpi=RSRP'),
    missingKpi: await status('csv', 'result=bins&sizeMeters=150'),
  }
  step('a request the result cannot answer is refused, not filled in',
    Object.values(refusals).every((v) => v === 400), JSON.stringify(refusals))

  // ── the link on the screen, read as rendered. Calling the server directly proves the
  //    server; it says nothing about whether the screen would ask it the right question,
  //    which is where §1.5.15 says the defect actually lives.
  await selectSession(CITY_A)
  await openWorkbook('Overview')
  await page.locator('.toolbar select[aria-label="Area bins"]').selectOption('150')
  await page.waitForTimeout(1500)
  const statSelect = page.locator('.toolbar select[aria-label="Bin statistic"]')
  if (await statSelect.count() > 0) {
    await statSelect.selectOption('MINIMUM')
    await page.waitForTimeout(1500)
  }
  const binHref = await page.locator('.dock.right .map-layer', { hasText: 'Area bins' })
    .locator('a[download]').first().getAttribute('href')

  // ── the fan is a layer you turn ON, and the link exists only once it is drawn.
  //    Exporting a layer the map is not showing hands over a file the reader has never
  //    seen, which is the same rule the dock follows for the tiles.
  const fanRow = page.locator('.dock.right .map-layer', { hasText: 'Serving cell lines' })
  const linkWhileOff = await fanRow.locator('a[download]').count()
  const pathsBefore = await page.locator('.leaflet-overlay-pane path').count()
  await fanRow.locator('input[type=checkbox]').click()
  await page.waitForTimeout(5000)
  const pathsAfter = await page.locator('.leaflet-overlay-pane path').count()
  const fanHref = await fanRow.locator('a[download]').first().getAttribute('href')
  step('UC23 draws before it exports, and offers no link for a layer it is not drawing',
    linkWhileOff === 0 && pathsAfter - pathsBefore === lines.length
    && fanHref != null && /result=serving-lines/.test(fanHref),
    `${linkWhileOff} links while off · ${pathsBefore} -> ${pathsAfter} paths for `
    + `${lines.length} lines · ${fanHref}`)
  await fanRow.locator('input[type=checkbox]').click()
  await page.waitForTimeout(1200)
  step('the link on the layer asks for what the screen is showing, not for the defaults',
    binHref != null && /result=bins/.test(binHref) && /kpi=RSRP/.test(binHref)
    && /sizeMeters=150/.test(binHref)
    && (await statSelect.count() === 0 || /statistic=MINIMUM/.test(binHref)),
    binHref ?? 'no link on the Area bins row')

  // And the condition rides along, because the link is built through the same `filtered`
  // as every fetch - the reason `result=` is a parameter rather than a path of its own.
  await page.locator('#gf-spec').fill('kpi:RSRQ:>=:-12')
  await page.locator('.globalfilter button', { hasText: 'Apply' }).click()
  await page.waitForTimeout(1800)
  const filteredHref = await page.locator('.dock.right .map-layer', { hasText: 'Area bins' })
    .locator('a[download]').first().getAttribute('href')
  step('and it carries the condition in force, without a line of its own to maintain',
    filteredHref != null && /filter=/.test(filteredHref) && /RSRQ/.test(filteredHref),
    filteredHref ?? 'no link')

  // ── every attachment point, not the two that were convenient.
  //
  //    There are five: three Layers rows, the legend's controls, the Cell locator table.
  //    The steps above drive two of them, which is the sampling bias §1.5.17 is about - a
  //    link that stopped carrying the condition on the legend would pass every check here
  //    while the two it does drive stayed green. So this reads EVERY rendered href on the
  //    two screens that hold them and holds all of them to the same rule.
  const allLinks = async () => page.locator('.dock.right .export-links a, .panels .export-links a')
    .evaluateAll((as) => as.map((a) => a.getAttribute('href')))
  const onOverview = await allLinks()
  await openWorkbook('Cells')
  await page.waitForTimeout(2500)
  const onCells = await allLinks()
  const every = [...onOverview, ...onCells]
  step('every export link on screen names a result and carries the condition',
    every.length >= 4
    && every.every((h) => /[?&]result=/.test(h) && /[?&]filter=/.test(h)),
    `${every.length} links: ${every.map((h) => h.replace(/^.*result=/, '')
      .replace(/&filter=.*/, '+filter')).join(' | ')}`)

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}

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

import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { MonitoredSet, NeighbourBreakdown, PollutionSpan } from '../api/types'

/**
 * The monitored set - which cells the terminal could see at the cursor.
 *
 * The reference tool keeps this docked permanently beside its charts, as two tables:
 * `RSCP monitored set` (Ch / SC / RSCP) and `Ec/N0 monitored set` (Ch / SC / Ec/N0). The
 * 5G NR reading of those columns is NR-ARFCN, PCI, RSRP and RSRQ, and both are shown in
 * one table here because a user reading them side by side was always comparing the same
 * two rows in two places.
 *
 * The serving cell is listed first and marked, not sorted in blind by level. Levels are
 * reported to a tenth of a dB, so two cells can tie, and a table that puts a cell the
 * terminal was not using at the top - because of a rounding tie - teaches the reader to
 * distrust it.
 */
export function MonitoredSetDock({ data }: { data: MonitoredSet | null }) {
  if (!data) return <div className="dim" style={{ padding: 6 }}>-</div>

  return (
    <>
      <table className="grid">
        <thead>
          <tr>
            <th className="num">Ch</th>
            <th className="num">PCI</th>
            <th className="num">RSRP</th>
            <th className="num">RSRQ</th>
            <th className="num">Δ</th>
          </tr>
        </thead>
        <tbody>
          {data.cells.map((c) => (
            <tr key={`${c.arfcn}-${c.pci}`}
                style={c.serving ? { background: '#eef3fa', fontWeight: 600 } : undefined}
                title={c.serving ? 'Serving cell' : 'Detected, not in use'}>
              <td className="num" style={{ color: '#666' }}>{c.arfcn}</td>
              <td className="num">{c.pci}{c.serving ? ' •' : ''}</td>
              <td className="num">{c.rsrp.toFixed(1)}</td>
              <td className="num">{c.rsrq.toFixed(1)}</td>
              <td className="num" style={{ color: '#666' }}>
                {c.deltaDb == null || c.serving ? '' : c.deltaDb.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.note && (
        <div style={{ padding: '4px 6px', color: '#666', whiteSpace: 'normal' }}>
          {data.note}
        </div>
      )}
    </>
  )
}

/**
 * The monitored set at the cursor, drawn as bars.
 *
 * This is the reference's `RSCP monitored set` pane, and it plots the CURSOR INSTANT, not
 * an aggregate over the drive - in the reference screenshot its bars match the monitored-set
 * table docked beside it value for value. Keeping that means the bars move with the shared
 * time cursor like every other pane, and they are drawn from the same response the dock
 * table uses, so the two cannot disagree.
 *
 * An aggregate was tried first and was wrong twice over: it plots a question the reference
 * does not ask, and because levels are held to a -55 dBm ceiling, every cell the route
 * passes closely saturated against it and the chart came out as a row of identical bars.
 *
 * The x axis carries PCI over channel on two lines, as the reference's `SC / Ch` axis does.
 */
function MonitoredBars({ set }: { set: MonitoredSet }) {
  const bars = set.cells
  if (bars.length === 0) {
    return <div style={{ padding: 10, color: '#666' }}>No cell was detectable here.</div>
  }

  // Bars widen when there are few cells so the chart fills its pane rather than huddling
  // in the left quarter of it, and narrow back down when a dense carrier reports many.
  // A monitored set is small by nature - eight cells at most - so a fixed bar width left
  // most of the pane empty and made the chart read as broken.
  const PAD_L = 52, PAD_R = 12, PAD_T = 14, H = 230, AXIS_H = 34
  const SLOT = Math.max(40, Math.min(120, Math.floor(820 / bars.length)))
  const W = Math.round(SLOT * 0.6), GAP = SLOT - W
  const width = PAD_L + bars.length * (W + GAP) + PAD_R
  // RSRP is negative, so the axis runs from the strongest at the top down to a floor a
  // little below the weakest bar - never from zero, which would flatten every bar.
  const top = Math.ceil(Math.max(...bars.map((b) => b.rsrp)) / 5) * 5
  const bottom = Math.floor(Math.min(...bars.map((b) => b.rsrp)) / 5) * 5 - 5
  const span = Math.max(1, top - bottom)
  const y = (v: number) => PAD_T + (1 - (v - bottom) / span) * (H - PAD_T)

  const ticks: number[] = []
  for (let v = top; v >= bottom; v -= 10) ticks.push(v)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={H + AXIS_H} role="img"
           aria-label="Monitored set at the cursor">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={width - PAD_R} y1={y(t)} y2={y(t)}
                  stroke="#e6e6e6" />
            <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end"
                  fontSize="10" fill="#666">{t}</text>
          </g>
        ))}
        <text x={12} y={PAD_T + 40} fontSize="10" fill="#666"
              transform={`rotate(-90 12 ${PAD_T + 40})`}>RSRP (dBm)</text>

        {bars.map((b, i) => {
          const x = PAD_L + i * (W + GAP)
          const h = Math.max(1, H - y(b.rsrp))
          return (
            <g key={`${b.arfcn}-${b.pci}`}>
              {/* Formatted to one decimal, matching the dock table exactly. Rendering the
                  raw number here spelled -82 where the dock said -82.0, which is the same
                  measurement written two ways on one screen. */}
              <title>
                {`PCI ${b.pci} on ${b.arfcn}: RSRP ${b.rsrp.toFixed(1)} dBm, `
                 + `RSRQ ${b.rsrq.toFixed(1)} dB`
                 + (b.serving ? ' - serving'
                    : `, ${(b.deltaDb ?? 0).toFixed(1)} dB below the strongest`)}
              </title>
              {/* Serving vs merely-detected, not a decorative palette: the reference splits
                  its bars into the active set and the monitored-only cells, and that split
                  is the one an engineer reads first. */}
              <rect x={x} y={y(b.rsrp)} width={W} height={h}
                    fill={b.serving ? '#2e7d5b' : '#d4783c'} />
              <text x={x + W / 2} y={H + 12} textAnchor="middle" fontSize="10">
                {b.pci}
              </text>
              <text x={x + W / 2} y={H + 23} textAnchor="middle" fontSize="9" fill="#666">
                {b.arfcn}
              </text>
            </g>
          )
        })}
        <text x={PAD_L + (width - PAD_L - PAD_R) / 2} y={H + AXIS_H - 1}
              textAnchor="middle" fontSize="10" fill="#666">PCI / Ch</text>
      </svg>
    </div>
  )
}

/**
 * The neighbour workbook page: the detection bar chart, the per-cell table behind it, and
 * the pilot-pollution spans the same measurement makes computable.
 */
export function MonitoredSetPage({ sessionId, set, onJump }: {
  sessionId: number | null
  /** The cursor-instant set, fetched once by App and shared with the dock and the map. */
  set: MonitoredSet | null
  onJump: (seq: number) => void
}) {
  const [data, setData] = useState<NeighbourBreakdown | null>(null)
  const [spans, setSpans] = useState<PollutionSpan[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * What counts as competing, and how many competitors make it pollution.
   *
   * The reference asks for exactly these two by name before it draws the map (UC20 p173:
   * `Polluter level window from the best active set` = -6, `Pilot count threshold` = 3),
   * and our server has accepted both since the analytic was written. Only the screen never
   * sent them, so every reader got 6 dB and 3 cells whether or not that suited the network
   * they were looking at - and the caption below asserted "≥3" as a fact of the tool.
   *
   * Held HERE rather than in the two panels because ONE value has to reach both endpoints:
   * a table counting contention at 6 dB beside a span list computed at 9 dB would be two
   * answers to one question, printed side by side.
   */
  const [windowDb, setWindowDb] = useState(6)
  const [minCells, setMinCells] = useState(3)

  // The two session-wide fetches are owned here and run once per session, so the table and
  // the pollution list cannot disagree about what they are showing.
  useEffect(() => {
    if (sessionId == null) return
    setData(null); setSpans(null); setError(null)
    api.neighbourBreakdown(sessionId, null, null, windowDb)
      .then(setData).catch((e) => setError(String(e)))
    api.pilotPollution(sessionId, windowDb, minCells).then(setSpans).catch(() => setSpans([]))
  }, [sessionId, windowDb, minCells])

  if (error) return <div className="error">{error}</div>
  if (!data) return <div className="loading">Loading…</div>

  return (
    <>
      <div className="panel">
        <header>
          <span className="title">RSRP monitored set</span>
          <span className="meta">
            {set ? `${set.cells.length} cells detected` : '…'}
            {set?.ts ? ` @ ${set.ts.slice(11, 19)}` : ''}
          </span>
        </header>
        {set ? <MonitoredBars set={set} />
             : <div style={{ padding: 10, color: '#666' }}>Loading…</div>}
        <div style={{ padding: '0 10px 8px', color: '#666', whiteSpace: 'normal' }}>
          The cells detectable <b>at the cursor</b>, so this pane moves with the time
          cursor like the charts.
          <span style={{ color: '#2e7d5b', fontWeight: 600 }}> Green</span> is the serving
          cell;
          <span style={{ color: '#d4783c', fontWeight: 600 }}> orange</span> cells were
          detected but not in use.
          {set?.note ? ` ${set.note}` : ''}
        </div>
      </div>

      <div className="panels">
        <div className="panel">
          <header>
            <span className="title">Across the whole drive</span>
            <span className="meta">{data.bars.length} cells · {data.totalSamples} samples</span>
          </header>
          <table className="grid">
            <thead>
              <tr>
                <th className="num">Ch</th><th className="num">PCI</th><th>Band</th>
                <th className="num">Detected</th><th className="num">Seen</th>
                {/* Between "detected" and "served" because that is where it sits in
                    meaning: a cell 25 dB down is detected exactly as much as one 1 dB
                    down, and neither p95 nor mean can separate them because both are
                    absolute levels with the sample's own fading in them. A cell that
                    CONTENDED on 1900 samples and served 40 is a missing neighbour
                    relation, a bad handover threshold or an overshooter - the SQL has
                    counted it all along and the table dropped it. */}
                <th className="num"
                    title={`samples within ${data.strongWithinDb} dB of the strongest cell`}>
                  Contended</th>
                <th className="num">Served</th>
                <th className="num" title="95th percentile - the peak is pinned to the
                     -55 dBm measurement ceiling wherever the route passes a site">
                  p95</th>
                <th className="num">Mean</th>
              </tr>
            </thead>
            <tbody>
              {data.bars.map((b) => (
                <tr key={`${b.arfcn}-${b.pci}`}>
                  <td className="num" style={{ color: '#666' }}>{b.arfcn}</td>
                  <td className="num">{b.pci}</td>
                  <td>{b.band ?? '-'}</td>
                  <td className="num">{b.samplesSeen}</td>
                  <td className="num">{b.seenPct}%</td>
                  <td className="num">{b.samplesStrong}</td>
                  <td className="num">{b.samplesServing}</td>
                  <td className="num">{b.p95Rsrp}</td>
                  <td className="num">{b.meanRsrp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <header>
            <span className="title">Pilot pollution</span>
            <span className="meta">{spans == null ? '…' : `${spans.length} stretches`}</span>
          </header>
          {/* Both numbers read from the state that produced the answer. The cell count was
              hardcoded as "≥3" beside a dB figure taken from the OTHER endpoint's response,
              so a caption that looked like one statement was half assertion and half
              measurement - and would have gone on saying 3 at any threshold. */}
          <div style={{ padding: '6px 10px', color: '#666', whiteSpace: 'normal' }}>
            Stretches where {'≥'}{minCells} cells sit within {data.strongWithinDb} dB of the
            best, so the terminal has no clean choice. Computable only now that the
            monitored set is recorded &mdash; with one serving cell per sample there was
            nothing to count.
          </div>
          <div className="pollution-controls">
            <label>Window&nbsp;
              <input type="number" min={1} max={20} step={0.5} value={windowDb}
                     aria-label="Pollution window dB"
                     onChange={(e) => setWindowDb(Number(e.target.value))} /> dB
            </label>
            <label>Competing cells&nbsp;
              <input type="number" min={2} max={8} value={minCells}
                     aria-label="Pollution cell count"
                     onChange={(e) => setMinCells(Number(e.target.value))} />
            </label>
            <span className="dim">
              asked before the map is drawn in the reference too (UC20 p173)
            </span>
          </div>
          {spans != null && spans.length === 0 && (
            <div style={{ padding: '0 10px 10px', color: '#666' }}>
              None found in this session.
            </div>
          )}
          {spans != null && spans.length > 0 && (
            <table className="grid">
              <thead>
                <tr><th>From</th><th className="num">Samples</th>
                  <th className="num">Cells</th><th className="num">Best RSRP</th>
                  <th>PCIs</th></tr>
              </thead>
              <tbody>
                {spans.map((s) => (
                  <tr key={s.fromSeq} className="deg-row"
                      onClick={() => onJump(s.fromSeq)}
                      title="Move the cursor to this stretch">
                    <td>{s.fromTs.slice(11, 19)}</td>
                    <td className="num">{s.toSeq - s.fromSeq + 1}</td>
                    <td className="num">{s.maxCells}</td>
                    <td className="num">{s.meanBestRsrp}</td>
                    <td>{s.pcis.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

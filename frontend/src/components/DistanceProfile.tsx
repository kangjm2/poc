import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { DistanceBin } from '../api/types'
import { paintBar } from '../view/paint'

/**
 * The drive laid out along DISTANCE rather than time.
 *
 * The reference puts Distance binning on the same ribbon as Area binning, and the two
 * answer different questions. Area binning asks "what is the signal at this place" and
 * belongs on the map. This asks "what did the drive see per unit of road", which has no
 * place on a map at all - its x axis is metres travelled, and every bin is the same width
 * however long the vehicle spent in it.
 *
 * That last part is the whole point. A car stopped at a light keeps producing samples from
 * one spot, so a time axis stretches that spot across the chart and any average over time
 * is dragged towards wherever the drive waited longest. Here the stop is one bar.
 *
 * Given its own panel rather than a second aggregation on the map: the map already offers
 * area bins, and two different aggregations of the same route drawn the same way would
 * leave a user unable to tell which one they were reading.
 */
export function DistanceProfile({
  sessionId, kpiName, stepMeters, cursorSeq, isolate, filterSpec, onJump,
}: {
  sessionId: number | null
  kpiName: string
  stepMeters: number
  cursorSeq: number
  isolate?: string | null
  /**
   * The global filter, taken as a prop and not read from a module, for the one reason it
   * has to be here at all: it belongs in the dependency array. The endpoint honours the
   * condition and the client attaches it, so the request narrowed correctly - and the
   * effect never re-ran, so the panel went on drawing the answer from before the filter
   * while every panel beside it narrowed.
   */
  filterSpec?: string | null
  onJump: (seq: number) => void
}) {
  const [bins, setBins] = useState<DistanceBin[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionId == null || stepMeters <= 0) { setBins(null); return }
    let live = true
    setError(null)
    api.distanceBins(sessionId, kpiName, stepMeters)
      .then((b) => { if (live) setBins(b) })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)) })
    return () => { live = false }
  }, [sessionId, kpiName, stepMeters, filterSpec])

  if (error) return <div className="error">{error}</div>
  if (!bins) return null
  if (bins.length === 0) {
    return (
      <div className="panel">
        <header><span className="title">Distance profile</span></header>
        <div style={{ padding: 12, color: '#666' }}>
          No samples carry this KPI, so there is nothing to bin.
        </div>
      </div>
    )
  }

  const H = 150, PAD_T = 10, PAD_B = 26, PAD_L = 46, PAD_R = 10
  const SLOT = Math.max(6, Math.min(40, Math.floor(900 / bins.length)))
  const W = PAD_L + bins.length * SLOT + PAD_R
  const values = bins.map((b) => b.avgValue)
  const hi = Math.ceil(Math.max(...values) / 5) * 5
  const lo = Math.floor(Math.min(...values) / 5) * 5
  const span = Math.max(1, hi - lo)
  const y = (v: number) => PAD_T + (1 - (v - lo) / span) * (H - PAD_T - PAD_B)

  const total = bins[bins.length - 1].toMetres
  const cursorBin = bins.find((b) => cursorSeq >= b.fromSeq && cursorSeq <= b.toSeq)

  const ticks: number[] = []
  for (let v = hi; v >= lo; v -= Math.max(5, Math.round(span / 4 / 5) * 5)) ticks.push(v)

  return (
    <div className="panel">
      <header>
        <span className="title">Distance profile &mdash; {kpiName}</span>
        <span className="meta">
          {bins.length} bins of {stepMeters} m · {(total / 1000).toFixed(2)} km driven
        </span>
      </header>
      <div style={{ overflowX: 'auto' }}>
        <svg width={W} height={H} role="img"
             aria-label={`${kpiName} averaged per ${stepMeters} m of road`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="#ececf0" />
              <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#666">
                {t}
              </text>
            </g>
          ))}
          {bins.map((b, i) => {
            const x = PAD_L + i * SLOT
            const h = Math.max(1, H - PAD_B - y(b.avgValue))
            const isCursor = cursorBin === b
            return (
              <g key={b.fromMetres} style={{ cursor: 'pointer' }}
                 onClick={() => onJump(b.fromSeq)}>
                <title>
                  {`${b.fromMetres}–${b.toMetres} m · ${b.sampleCount} samples · `
                   + `avg ${b.avgValue} (${b.minValue}…${b.maxValue}) · ${b.binLabel}`}
                </title>
                <rect x={x} y={y(b.avgValue)} width={Math.max(2, SLOT - 2)} height={h}
                      fill={paintBar(b.binLabel, b.color, isolate ?? null)}
                      stroke={isCursor ? 'var(--cursor)' : 'none'}
                      strokeWidth={isCursor ? 2 : 0} />
              </g>
            )
          })}
          {/* Axis labelled in kilometres travelled, which is the coordinate this whole
              panel is organised by - not time, and not sample number. */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <text key={f} x={PAD_L + f * (W - PAD_L - PAD_R)} y={H - 8}
                  textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}
                  fontSize="10" fill="#666">
              {((total * f) / 1000).toFixed(1)} km
            </text>
          ))}
        </svg>
      </div>
      <div style={{ padding: '0 10px 8px', color: '#666', whiteSpace: 'normal' }}>
        Each bar is {stepMeters} m of road, however long the vehicle took over it &mdash; so
        a stop at a light is one bar rather than a stretch that drags the average. Click a
        bar to move the cursor there.
      </div>
    </div>
  )
}

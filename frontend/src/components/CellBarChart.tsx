import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { CellBreakdown, SeqRange } from '../api/types'
import { paintBar } from '../view/paint'

/**
 * A KPI as one bar per serving cell.
 *
 * The reference workbook puts exactly this beside the time series, and it is the one
 * chart type we had no equivalent of: everything else here was a line. A degraded
 * stretch is not actionable until you know which cell was serving it, and a ranking of
 * cells answers that in one glance where a time series cannot.
 *
 * Bars are drawn in SVG for the same reason as the other charts in this app - no chart
 * library, so the marks stay under our own control and the colours can come from the
 * KPI's own scale rather than from a palette that knows nothing about thresholds.
 */

const PAD = { left: 46, right: 12, top: 10, bottom: 34 }
const BAR_H = 18
const GAP = 6

function BarChart({ data, isolate, onPickCell }: {
  data: CellBreakdown
  isolate?: string | null
  onPickCell?: (pci: number) => void
}) {
  if (data.cells.length === 0) {
    return <div className="loading">No serving-cell information in this range.</div>
  }

  const vals = data.cells.map((c) => c.meanValue).filter((v): v is number => v != null)
  // The axis spans the observed range with a small margin, NOT zero. Anchoring a
  // dBm-style KPI at zero would squash every bar to almost the same length and hide the
  // differences the chart exists to show. The trade-off is that bar length is not
  // proportional to absolute value, so the value is printed at the end of every bar.
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const span = hi - lo || 1
  const axisLo = lo - span * 0.08
  const axisHi = hi + span * 0.08
  const W = 720
  const innerW = W - PAD.left - PAD.right
  const H = PAD.top + PAD.bottom + data.cells.length * (BAR_H + GAP)
  const x = (v: number) => PAD.left + ((v - axisLo) / (axisHi - axisLo)) * innerW

  const ticks = [axisLo, (axisLo + axisHi) / 2, axisHi]

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} role="img"
           aria-label={`${data.displayName} per serving cell`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={x(t)} x2={x(t)} y1={PAD.top} y2={H - PAD.bottom}
                  stroke="#e2e2e8" />
            <text x={x(t)} y={H - PAD.bottom + 14} fontSize={10} fill="#666"
                  textAnchor="middle">{t.toFixed(data.decimals)}</text>
          </g>
        ))}
        {data.cells.map((c, i) => {
          const y = PAD.top + i * (BAR_H + GAP)
          const v = c.meanValue
          if (v == null) return null
          const w = Math.max(1, x(v) - PAD.left)
          return (
            <g key={c.pci} className="cell-bar"
               onClick={() => onPickCell?.(c.pci)}
               style={onPickCell ? { cursor: 'pointer' } : undefined}>
              <title>
                {`PCI ${c.pci}${c.band ? ` · ${c.band}` : ''}`
                 + `${c.arfcn != null ? ` · ARFCN ${c.arfcn}` : ''}\n`
                 + `${data.displayName}: mean ${v.toFixed(data.decimals)} ${data.unit}`
                 + `  (min ${c.minValue?.toFixed(data.decimals)},`
                 + ` max ${c.maxValue?.toFixed(data.decimals)})\n`
                 + `${c.sampleCount} samples · ${c.share.toFixed(1)}% of the range\n`
                 + `${c.binLabel}`}
              </title>
              <rect x={PAD.left} y={y} width={w} height={BAR_H}
                    fill={paintBar(c.binLabel, c.color, isolate ?? null)}
                    stroke="#00000022" />
              <text x={PAD.left - 5} y={y + BAR_H - 5} fontSize={10} fill="#262626"
                    textAnchor="end">{c.pci}</text>
              <text x={PAD.left + w + 5} y={y + BAR_H - 5} fontSize={10} fill="#444">
                {v.toFixed(data.decimals)}
                <tspan fill="#888">{`  ${c.share.toFixed(0)}%`}</tspan>
              </text>
            </g>
          )
        })}
        <text x={PAD.left} y={H - 4} fontSize={10} fill="#666">
          PCI &middot; {data.displayName}{data.unit ? ` (${data.unit})` : ''} mean
        </text>
        <desc>{`axis ${axisLo.toFixed(2)} to ${axisHi.toFixed(2)}`}</desc>
      </svg>
    </div>
  )
}

/** The same breakdown as numbers, because a bar chart is not a table. */
function BreakdownTable({ data }: { data: CellBreakdown }) {
  const d = data.decimals
  return (
    <table className="grid">
      <thead>
        <tr><th className="num">PCI</th><th>Band</th><th className="num">ARFCN</th>
          <th>Cell type</th><th className="num">Samples</th><th className="num">Share</th>
          <th className="num">Mean</th><th className="num">P05</th>
          <th className="num">Min</th><th className="num">Max</th><th>Bin</th></tr>
      </thead>
      <tbody>
        {data.cells.map((c) => (
          <tr key={c.pci}>
            <td className="num">{c.pci}</td>
            <td>{c.band ?? '-'}</td>
            <td className="num">{c.arfcn ?? '-'}</td>
            <td>{c.cellType ?? '-'}</td>
            <td className="num">{c.sampleCount}</td>
            <td className="num">{c.share.toFixed(1)}%</td>
            <td className="num">{c.meanValue?.toFixed(d) ?? '-'}</td>
            <td className="num">{c.p05Value?.toFixed(d) ?? '-'}</td>
            <td className="num">{c.minValue?.toFixed(d) ?? '-'}</td>
            <td className="num">{c.maxValue?.toFixed(d) ?? '-'}</td>
            <td style={{ color: '#666' }}>
              <span className="swatch" style={{ background: c.color }} /> {c.binLabel}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * The Cells page: one fetch, two views of it.
 *
 * The chart and the table say the same thing in different registers, so they must never
 * disagree - and fetching twice would let them, besides doubling the query. The page owns
 * the request; the views are pure.
 */
export function CellsPage({ sessionId, kpi, range, scaleVersion, isolate, onPickCell }: {
  sessionId: number | null
  kpi: string
  range?: SeqRange | null
  scaleVersion?: number
  isolate?: string | null
  onPickCell?: (pci: number) => void
}) {
  const [data, setData] = useState<CellBreakdown | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionId == null) return
    setError(null)
    api.cellBreakdown(sessionId, kpi, range).then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [sessionId, kpi, range?.from, range?.to, scaleVersion])

  if (error) return <div className="error">{error}</div>
  if (!data) return <div className="loading">Loading…</div>

  return (
    <>
      <div className="panel">
        <header>
          <span className="title">{data.displayName} per serving cell</span>
          <span className="meta">ranked by mean, best first</span>
        </header>
        <div style={{ padding: 10 }}>
          <BarChart data={data} isolate={isolate} onPickCell={onPickCell} />
        </div>
      </div>
      <div className="panel">
        <header>
          <span className="title">Serving cell breakdown</span>
          <span className="meta">{data.cells.length} cells &middot; {data.total} samples</span>
        </header>
        <BreakdownTable data={data} />
      </div>
    </>
  )
}

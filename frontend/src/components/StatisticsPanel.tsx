import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { SeqRange, Statistics } from '../api/types'

/**
 * Distribution view: summary statistics and the CDF.
 *
 * The backend already computed both, and nothing rendered them - the gap an API
 * surface check found. A CDF answers "what does the worst 5% of the drive look
 * like", which a mean cannot.
 */
export function StatisticsPanel({
  sessionId, kpi, unit, range,
}: { sessionId: number | null; kpi: string; unit: string; range?: SeqRange | null }) {
  const [stats, setStats] = useState<Statistics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionId == null) return
    setError(null)
    api.statistics(sessionId, kpi, range).then(setStats).catch((e) => setError(String(e)))
  }, [sessionId, kpi, range])

  if (error) return <div className="error">{error}</div>
  if (!stats) return <div className="panel"><div className="loading">Loading…</div></div>
  if (stats.count === 0) {
    return <div className="panel"><div className="loading">No samples for this KPI.</div></div>
  }

  const W = 1000
  const H = 220
  const PAD = { top: 10, right: 12, bottom: 22, left: 52 }
  const values = stats.cdf.map((p) => p.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const x = (v: number) => PAD.left + ((v - lo) / span) * (W - PAD.left - PAD.right)
  const y = (pct: number) => PAD.top + (1 - pct / 100) * (H - PAD.top - PAD.bottom)
  const path = stats.cdf
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.value).toFixed(1)} ${y(p.percentile).toFixed(1)}`)
    .join(' ')

  const marks: Array<[string, number | null]> = [['p05', stats.p05], ['p50', stats.p50], ['p95', stats.p95]]

  return (
    <>
      <div className="panel">
        <header>
          <span className="title">Statistics &mdash; {stats.displayName}</span>
          <span className="meta">
            {stats.count.toLocaleString()} samples
            {range && (range.from != null || range.to != null) ? ' (filtered range)' : ''}
          </span>
        </header>
        <table className="grid">
          <thead><tr><th>Min</th><th>p05</th><th>p50</th><th>Mean</th><th>p95</th><th>Max</th></tr></thead>
          <tbody>
            <tr>
              {[stats.min, stats.p05, stats.p50, stats.mean, stats.p95, stats.max].map((v, i) => (
                <td key={i} className="num">{v == null ? '-' : `${v} ${unit}`}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <header>
          <span className="title">Cumulative distribution</span>
          <span className="meta">{stats.cdf.length} points</span>
        </header>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
             style={{ width: '100%', height: H, display: 'block' }}>
          <rect x={PAD.left} y={PAD.top} width={W - PAD.left - PAD.right}
                height={H - PAD.top - PAD.bottom} fill="#fff" stroke="#d4d4dc" />
          {[0, 25, 50, 75, 100].map((p) => (
            <g key={p}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(p)} y2={y(p)}
                    stroke="#eeeef2" strokeDasharray="2 2" />
              <text x={PAD.left - 5} y={y(p) + 3} textAnchor="end" fontSize="9" fill="#666">{p}%</text>
            </g>
          ))}
          {marks.map(([label, v]) => v == null ? null : (
            <g key={label}>
              <line x1={x(v)} x2={x(v)} y1={PAD.top} y2={H - PAD.bottom}
                    stroke="var(--cursor)" strokeDasharray="3 3" opacity={0.7} />
              <text x={x(v) + 3} y={PAD.top + 10} fontSize="9" fill="var(--cursor)">{label}</text>
            </g>
          ))}
          <path d={path} fill="none" stroke="var(--trace)" strokeWidth={1.5}
                vectorEffect="non-scaling-stroke" />
          {[lo, lo + span / 2, hi].map((v, i) => (
            <text key={i} x={x(v)} y={H - 6} textAnchor="middle" fontSize="9" fill="#666">
              {v.toFixed(1)}
            </text>
          ))}
        </svg>
      </div>
    </>
  )
}

import type { CdfPoint } from '../api/types'

/**
 * One curve on the overlay: what to call it, what to draw, and where its median is.
 *
 * `p50` is passed rather than derived from the points because the server computed it over
 * every sample under the chosen weighting, while `cdf` is a sampled curve - reading the
 * median off the curve would put the dashed line a step away from the number printed in
 * the table beside it, on the one screen whose whole job is comparing those numbers.
 */
export interface CdfSeries {
  label: string
  cdf: CdfPoint[]
  p50: number | null
  color: string
}

/**
 * Several distributions on one axis.
 *
 * Curves rather than bars because a shift is a shape: a build that helps the median and
 * hurts the tail shows as curves that cross, which no pair of means can express and no
 * histogram makes obvious. All series share ONE x axis computed over all of them, so the
 * horizontal distance between two curves is the difference in the KPI and not an artefact
 * of two independently scaled panels.
 *
 * Extracted from CompareView when cohorts arrived: two drives and eight cohorts want
 * exactly this picture, and the alternative was a second implementation that would have
 * drawn the same data slightly differently. The two-series case is unchanged - the caller
 * still chooses the colours, so Compare keeps the blue and purple it always had.
 */
export function CdfOverlay({ title, series, meta }: {
  title: string
  series: CdfSeries[]
  /** Trailing note in the header, e.g. what clicking a row does. */
  meta?: string
}) {
  const W = 1000
  const H = 220
  const PAD = { top: 10, right: 12, bottom: 22, left: 52 }
  const values = series.flatMap((s) => s.cdf.map((p) => p.value))
  // An empty overlay is a real state - a KPI no cohort measured - and Math.min() of
  // nothing is Infinity, which would render a panel of NaN paths rather than say so.
  if (values.length === 0) {
    return (
      <div className="panel">
        <header><span className="title">CDF overlay &mdash; {title}</span></header>
        <div className="empty-note">No distribution to draw: nothing on screen measured this.</div>
      </div>
    )
  }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const x = (v: number) => PAD.left + ((v - lo) / span) * (W - PAD.left - PAD.right)
  const y = (pct: number) => PAD.top + (1 - pct / 100) * (H - PAD.top - PAD.bottom)
  const path = (cdf: CdfPoint[]) => cdf
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.value).toFixed(1)} ${y(p.percentile).toFixed(1)}`)
    .join(' ')

  return (
    <div className="panel">
      <header>
        <span className="title">CDF overlay &mdash; {title}</span>
        <span className="meta">
          {series.map((s) => (
            <span key={s.label} style={{ color: s.color, marginRight: 10 }}>&mdash; {s.label}</span>
          ))}
          {meta ? `  ·  ${meta}` : ''}
        </span>
      </header>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
           className="cdf-overlay"
           style={{ width: '100%', height: H, display: 'block' }}>
        {/* The axis span, in the DOM rather than only in the picture: a checker that has
            to read a pixel to know what the chart says is checking the renderer. */}
        <desc>{`axisLo=${lo} axisHi=${hi} series=${series.length}`}</desc>
        <rect x={PAD.left} y={PAD.top} width={W - PAD.left - PAD.right}
              height={H - PAD.top - PAD.bottom} fill="#fff" stroke="#d4d4dc" />
        {[0, 25, 50, 75, 100].map((p) => (
          <g key={p}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(p)} y2={y(p)}
                  stroke="#eeeef2" strokeDasharray="2 2" />
            <text x={PAD.left - 5} y={y(p) + 3} textAnchor="end" fontSize="9" fill="#666">{p}%</text>
          </g>
        ))}
        {series.map((s) => s.p50 == null ? null : (
          <line key={`m${s.label}`} x1={x(s.p50)} x2={x(s.p50)} y1={PAD.top} y2={H - PAD.bottom}
                stroke={s.color} strokeDasharray="3 3" opacity={0.5} />
        ))}
        {series.map((s) => (
          <path key={`p${s.label}`} d={path(s.cdf)} fill="none" stroke={s.color} strokeWidth={1.5}
                data-series={s.label} vectorEffect="non-scaling-stroke" />
        ))}
        {[lo, lo + span / 2, hi].map((v, i) => (
          <text key={i} x={x(v)} y={H - 6} textAnchor="middle" fontSize="9" fill="#666">
            {v.toFixed(1)}
          </text>
        ))}
      </svg>
    </div>
  )
}

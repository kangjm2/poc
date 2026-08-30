import { useMemo, useRef } from 'react'
import type { Series } from '../api/types'

interface Props {
  series: Series
  cursorSeq: number
  onCursorChange: (seq: number) => void
  /** Fill under the trace, the way throughput is drawn in the reference tool. */
  filled?: boolean
  color?: string
  height?: number
}

const PAD = { top: 8, right: 10, bottom: 18, left: 52 }

/**
 * Step-line time series. Discrete scheduling values genuinely are steps, and the
 * reference tool draws them that way, so interpolating would misrepresent them.
 */
export function TimeSeriesChart({
  series, cursorSeq, onCursorChange, filled = false,
  color = 'var(--trace)', height = 150,
}: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const width = 1000 // viewBox units; the SVG scales to its container

  const { path, area, yTicks, xTicks, min, max, seqMin, seqMax } = useMemo(() => {
    const pts = series.points.filter((p) => p.value !== null)
    if (pts.length === 0) {
      return { path: '', area: '', yTicks: [], xTicks: [], min: 0, max: 1, seqMin: 0, seqMax: 1 }
    }
    const values = pts.map((p) => p.value as number)
    let lo = Math.min(...values)
    let hi = Math.max(...values)
    if (lo === hi) { lo -= 1; hi += 1 }
    const span = hi - lo
    lo -= span * 0.08
    hi += span * 0.08

    const sMin = series.points[0].seq
    const sMax = series.points[series.points.length - 1].seq
    const x = (seq: number) =>
      PAD.left + ((seq - sMin) / Math.max(1, sMax - sMin)) * (width - PAD.left - PAD.right)
    const y = (v: number) =>
      PAD.top + (1 - (v - lo) / (hi - lo)) * (height - PAD.top - PAD.bottom)

    let d = ''
    let prevY: number | null = null
    for (const p of pts) {
      const px = x(p.seq)
      const py = y(p.value as number)
      if (d === '') d = `M ${px.toFixed(2)} ${py.toFixed(2)}`
      else d += ` L ${px.toFixed(2)} ${(prevY as number).toFixed(2)} L ${px.toFixed(2)} ${py.toFixed(2)}`
      prevY = py
    }
    const baseline = y(lo)
    const a = d === '' ? '' :
      `${d} L ${x(pts[pts.length - 1].seq).toFixed(2)} ${baseline.toFixed(2)} ` +
      `L ${x(pts[0].seq).toFixed(2)} ${baseline.toFixed(2)} Z`

    const yt = Array.from({ length: 5 }, (_, i) => {
      const v = lo + ((hi - lo) * i) / 4
      return { v, y: y(v) }
    })
    const xt = Array.from({ length: 6 }, (_, i) => {
      const seq = sMin + ((sMax - sMin) * i) / 5
      const p = series.points[Math.min(series.points.length - 1, Math.round(seq - sMin))]
      return { x: x(seq), label: p ? new Date(p.ts).toISOString().slice(11, 19) : '' }
    })
    return { path: d, area: a, yTicks: yt, xTicks: xt, min: lo, max: hi, seqMin: sMin, seqMax: sMax }
  }, [series, height])

  const cursorX =
    PAD.left + ((cursorSeq - seqMin) / Math.max(1, seqMax - seqMin)) * (width - PAD.left - PAD.right)

  const pick = (clientX: number) => {
    const svg = ref.current
    if (!svg) return
    const box = svg.getBoundingClientRect()
    const rel = ((clientX - box.left) / box.width) * width
    const frac = (rel - PAD.left) / (width - PAD.left - PAD.right)
    const seq = Math.round(seqMin + frac * (seqMax - seqMin))
    onCursorChange(Math.max(seqMin, Math.min(seqMax, seq)))
  }

  // Decimated payloads do not carry every seq, so the readout shows the nearest
  // point at or before the cursor rather than 'no data' between kept samples.
  const current = useMemo(() => {
    let best: (typeof series.points)[number] | undefined
    for (const p of series.points) {
      if (p.seq > cursorSeq) break
      best = p
    }
    return best ?? series.points[0]
  }, [series, cursorSeq])

  return (
    <div className="panel chart-panel">
      <header>
        <span className="title">Line Graph &mdash; {series.displayName}</span>
        <span className="meta">
          {current?.value != null ? `${current.value} ${series.unit}` : 'no data'}
        </span>
      </header>
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: height, display: 'block', cursor: 'crosshair' }}
        onMouseDown={(e) => pick(e.clientX)}
        onMouseMove={(e) => { if (e.buttons === 1) pick(e.clientX) }}
      >
        <rect x={PAD.left} y={PAD.top} width={width - PAD.left - PAD.right}
              height={height - PAD.top - PAD.bottom} fill="#fff" stroke="#d4d4dc" />
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={width - PAD.right} y1={t.y} y2={t.y}
                  stroke="#eeeef2" strokeDasharray="2 2" />
            <text x={PAD.left - 5} y={t.y + 3} textAnchor="end" fontSize="9" fill="#666">
              {t.v.toFixed(Math.abs(max - min) < 5 ? 1 : 0)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={t.x} y={height - 5} textAnchor="middle" fontSize="9" fill="#666">
            {t.label}
          </text>
        ))}
        {filled && area && <path d={area} fill="var(--area-fill)" opacity={0.85} />}
        {path && (
          <path d={path} fill="none" stroke={filled ? 'var(--area-line)' : color}
                strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        )}
        <line x1={cursorX} x2={cursorX} y1={PAD.top} y2={height - PAD.bottom}
              stroke="var(--cursor)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

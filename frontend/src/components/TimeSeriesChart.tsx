import { useMemo, useRef } from 'react'
import type { EventType, NetworkEvent, Series } from '../api/types'

interface Props {
  series: Series
  cursorSeq: number
  onCursorChange: (seq: number) => void
  /** Fill under the trace, the way throughput is drawn in the reference tool. */
  filled?: boolean
  color?: string
  height?: number
  /**
   * Events to mark on the time axis. "Did the link failure come before the throughput
   * collapse or six seconds after it" is the causal question this chart exists to answer,
   * and until now it could only be answered by reading timestamps out of a table and
   * matching them against the trace by eye.
   */
  events?: NetworkEvent[]
  eventTypes?: Map<string, EventType>
  /** Narrow the x domain to a span, for a context view around one moment. */
  fromSeq?: number | null
  toSeq?: number | null
}

// top leaves room for the event glyphs, which sit above the plot so they never
// cover the trace they are explaining.
const PAD = { top: 12, right: 10, bottom: 18, left: 52 }

/**
 * Step-line time series. Discrete scheduling values genuinely are steps, and the
 * reference tool draws them that way, so interpolating would misrepresent them.
 */
export function TimeSeriesChart({
  series, cursorSeq, onCursorChange, filled = false,
  color = 'var(--trace)', height = 150,
  events = [], eventTypes, fromSeq = null, toSeq = null,
}: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const width = 1000 // viewBox units; the SVG scales to its container

  const { path, area, yTicks, xTicks, min, max, seqMin, seqMax, x } = useMemo(() => {
    const noScale = (seq: number) => seq
    // Windowed views keep only the points inside the window, so the y domain zooms with
    // the x domain. Auto-ranging over the whole drive would leave a context view of one
    // 80-sample stretch squashed into the top third of a chart scaled for the worst fade
    // of the entire session - technically correct and useless for reading the moment.
    const inWindow = (seq: number) =>
      (fromSeq == null || seq >= fromSeq) && (toSeq == null || seq <= toSeq)
    const pts = series.points.filter((p) => p.value !== null && inWindow(p.seq))
    if (pts.length === 0) {
      return {
        path: '', area: '', yTicks: [], xTicks: [], min: 0, max: 1,
        seqMin: 0, seqMax: 1, x: noScale,
      }
    }
    const values = pts.map((p) => p.value as number)
    let lo = Math.min(...values)
    let hi = Math.max(...values)
    if (lo === hi) { lo -= 1; hi += 1 }
    const span = hi - lo
    lo -= span * 0.08
    hi += span * 0.08

    // The window, when one is given, overrides the series extent - that is what turns
    // this into a context view around a single moment without a second chart component.
    const sMin = fromSeq ?? series.points[0].seq
    const sMax = toSeq ?? series.points[series.points.length - 1].seq
    const axisPts = fromSeq == null && toSeq == null ? series.points : pts
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
      // Nearest kept point to this tick, rather than positional indexing: the payload is
      // decimated, and in a window the array no longer starts at sMin.
      let p = axisPts[0]
      for (const q of axisPts) { if (q.seq > seq) break; p = q }
      return { x: x(seq), label: p ? new Date(p.ts).toISOString().slice(11, 19) : '' }
    })
    // x is returned rather than left as a local: cursorX below used to re-derive the same
    // formula by hand, and the event markers need it too. Three copies of one mapping is
    // three chances for the cursor, the trace and a marker to disagree about where a seq
    // sits.
    return {
      path: d, area: a, yTicks: yt, xTicks: xt, min: lo, max: hi,
      seqMin: sMin, seqMax: sMax, x,
    }
  }, [series, height, fromSeq, toSeq])

  const cursorX = x(cursorSeq)

  // Only the events inside the drawn domain; a marker for a seq outside it would be
  // clamped onto the frame edge and read as an event that happened at the boundary.
  const marks = useMemo(
    () => events.filter((e) => e.seq >= seqMin && e.seq <= seqMax),
    [events, seqMin, seqMax],
  )

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
        {marks.map((e) => {
          const t = eventTypes?.get(e.eventType)
          const ex = x(e.seq)
          return (
            <g key={e.id} className="chart-event" onMouseDown={(ev) => {
              ev.stopPropagation()
              onCursorChange(e.seq)
            }}>
              <title>
                {`${new Date(e.ts).toISOString().slice(11, 19)} · `
                 + `${t?.displayName ?? e.eventType}${e.detail ? ` — ${e.detail}` : ''}`}
              </title>
              <line x1={ex} x2={ex} y1={PAD.top} y2={height - PAD.bottom}
                    stroke={t?.color ?? '#8a8a95'} strokeWidth={1} strokeDasharray="2 3"
                    opacity={0.65} vectorEffect="non-scaling-stroke" />
              {/* The glyph sits in the top margin so it never covers the trace it is
                  explaining. */}
              <text x={ex} y={PAD.top - 3} textAnchor="middle" fontSize="9"
                    fill={t?.color ?? '#8a8a95'}>{t?.symbol ?? '?'}</text>
            </g>
          )
        })}
        <line x1={cursorX} x2={cursorX} y1={PAD.top} y2={height - PAD.bottom}
              stroke="var(--cursor)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

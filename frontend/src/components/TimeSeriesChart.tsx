import { useMemo, useRef, useState } from 'react'
import type { EventType, NetworkEvent, Series, Threshold } from '../api/types'

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
  /**
   * The KPI's own threshold ladder, for the reference lines.
   *
   * The reference has `Add Reference Line` in the graph's tool menu (p96-97): the reader
   * types a value and gets a horizontal rule to read crossings against. We draw the
   * CATALOGUE's boundaries instead of asking for a number, and the reason is the one this
   * project keeps arriving at - a typed line is a second opinion about a threshold that
   * already exists. The map, the legend, the area bins and the printed report all colour
   * from this ladder; a hand-typed rule beside them can disagree with every one of them,
   * and the chart is exactly where someone would notice the disagreement and believe the
   * chart.
   *
   * Only the boundaries where SEVERITY changes are drawn. RSRP's ladder has three
   * boundaries and only two of them mean anything to a reader - the third divides two
   * shades of NORMAL, and drawing it would put a rule across a healthy trace with no
   * verdict behind it.
   */
  thresholds?: Threshold[]
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
  events = [], eventTypes, fromSeq = null, toSeq = null, thresholds = [],
}: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const width = 1000 // viewBox units; the SVG scales to its container

  /**
   * A span the reader magnified, and the drag that is choosing one.
   *
   * The reference puts Scroll/Zoom in the graph's `Tool` menu (p97) - an explicit mode,
   * not a modifier - and that is the shape taken here, because this chart's plain drag
   * already means something: it scrubs the shared cursor. A gesture that zoomed on drag
   * would take the scrub away, and one on shift-drag would be undiscoverable.
   *
   * Only offered when the PARENT has not already windowed the chart. Problem Survey's
   * context view sets fromSeq/toSeq to frame one case; a zoom inside that would be a
   * second owner of the same domain, and the two would fight over which span is showing.
   */
  const [zoom, setZoom] = useState<{ from: number; to: number } | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null)
  const ownsDomain = fromSeq == null && toSeq == null
  const winFrom = fromSeq ?? (ownsDomain ? zoom?.from ?? null : null)
  const winTo = toSeq ?? (ownsDomain ? zoom?.to ?? null : null)

  const { path, area, yTicks, xTicks, min, max, seqMin, seqMax, x, y } = useMemo(() => {
    const noScale = (seq: number) => seq
    // Windowed views keep only the points inside the window, so the y domain zooms with
    // the x domain. Auto-ranging over the whole drive would leave a context view of one
    // 80-sample stretch squashed into the top third of a chart scaled for the worst fade
    // of the entire session - technically correct and useless for reading the moment.
    const inWindow = (seq: number) =>
      (winFrom == null || seq >= winFrom) && (winTo == null || seq <= winTo)
    const pts = series.points.filter((p) => p.value !== null && inWindow(p.seq))
    if (pts.length === 0) {
      return {
        path: '', area: '', yTicks: [], xTicks: [], min: 0, max: 1,
        seqMin: 0, seqMax: 1, x: noScale, y: noScale,
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
    const sMin = winFrom ?? series.points[0].seq
    const sMax = winTo ?? series.points[series.points.length - 1].seq
    const axisPts = winFrom == null && winTo == null ? series.points : pts
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
      seqMin: sMin, seqMax: sMax, x, y,
    }
  }, [series, height, winFrom, winTo])

  /**
   * The reference lines, and whether any of them is on screen.
   *
   * `y` comes from the same memo that drew the trace rather than being re-derived here,
   * for the reason the comment on `x` gives: two copies of one mapping is two chances for
   * the rule and the trace to disagree about where a value sits.
   */
  const rules = useMemo(() => {
    const sorted = [...thresholds].sort((a, b) => a.ordinal - b.ordinal)
    const out = []
    for (let i = 1; i < sorted.length; i++) {
      const below = sorted[i - 1]
      const at = sorted[i].lowerBound
      // A boundary is worth a rule only where the verdict changes across it.
      if (at == null || below.severity === sorted[i].severity) continue
      // The colour of the WORSE side: the rule marks where the trace stops being
      // acceptable, so it should read as the warning, not as the band above it.
      const worse = below.severity === 'NORMAL' ? sorted[i] : below
      out.push({ value: at, color: worse.color, label: worse.severity.toLowerCase() })
    }
    return out
  }, [thresholds])
  const visibleRules = rules.filter((r) => r.value > min && r.value < max)

  const cursorX = x(cursorSeq)

  // Only the events inside the drawn domain; a marker for a seq outside it would be
  // clamped onto the frame edge and read as an event that happened at the boundary.
  const marks = useMemo(
    () => events.filter((e) => e.seq >= seqMin && e.seq <= seqMax),
    [events, seqMin, seqMax],
  )

  /** Client x to a seq in the drawn domain. One mapping, used by scrub and by select. */
  const seqAt = (clientX: number) => {
    const svg = ref.current
    if (!svg) return null
    const box = svg.getBoundingClientRect()
    const rel = ((clientX - box.left) / box.width) * width
    const frac = (rel - PAD.left) / (width - PAD.left - PAD.right)
    const seq = Math.round(seqMin + frac * (seqMax - seqMin))
    return Math.max(seqMin, Math.min(seqMax, seq))
  }

  const pick = (clientX: number) => {
    const seq = seqAt(clientX)
    if (seq != null) onCursorChange(seq)
  }

  const down = (clientX: number) => {
    if (!selecting) { pick(clientX); return }
    const seq = seqAt(clientX)
    if (seq != null) setDrag({ a: seq, b: seq })
  }
  const move = (clientX: number, held: boolean) => {
    if (!held) return
    if (!selecting) { pick(clientX); return }
    const seq = seqAt(clientX)
    if (seq != null) setDrag((d) => (d ? { ...d, b: seq } : d))
  }
  const up = () => {
    if (!selecting || !drag) return
    const from = Math.min(drag.a, drag.b)
    const to = Math.max(drag.a, drag.b)
    setDrag(null)
    // A span of nothing is a click that missed, not a request to magnify one sample.
    // Two samples is the smallest window with a slope in it.
    if (to - from >= 2) { setZoom({ from, to }); setSelecting(false) }
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
          {/* Offered only where this chart owns its own x domain - see the zoom comment.
              In the header's right-hand group with the readout rather than as a third
              item, because the header is space-between and a third child would push the
              title, the tools and the value to three corners. */}
          {ownsDomain && (
            <span className="chart-tools">
              {zoom ? (
                <>
                  <b>{zoom.to - zoom.from + 1}</b> samples
                  <button onClick={() => { setZoom(null); setSelecting(false) }}
                          aria-label="Whole drive">whole drive</button>
                </>
              ) : (
                <button className={selecting ? 'on' : undefined}
                        aria-label="Zoom to a span"
                        title="Drag across the chart to magnify that stretch"
                        onClick={() => setSelecting((v) => !v)}>
                  {selecting ? 'drag a span…' : 'zoom'}
                </button>
              )}
            </span>
          )}
          {/* Said when the ladder has a boundary and none of them is inside this view.
              Drawing nothing would read as "this chart has no thresholds", which is a
              different fact from "the whole window is on one side of them" - and the
              second one is the answer the reader wanted. */}
          {rules.length > 0 && visibleRules.length === 0 && (
            <span style={{ color: '#888', marginRight: 8 }}>
              thresholds outside this range
            </span>
          )}
          {current?.value != null ? `${current.value} ${series.unit}` : 'no data'}
        </span>
      </header>
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{
          width: '100%', height: height, display: 'block',
          cursor: selecting ? 'col-resize' : 'crosshair',
        }}
        onMouseDown={(e) => down(e.clientX)}
        onMouseMove={(e) => move(e.clientX, e.buttons === 1)}
        onMouseUp={up}
        onMouseLeave={() => setDrag(null)}
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
        {/* Under the trace, so a rule never hides the values it is there to judge. */}
        {visibleRules.map((r) => (
          <g key={r.value} className="chart-rule">
            <line x1={PAD.left} x2={width - PAD.right} y1={y(r.value)} y2={y(r.value)}
                  stroke={r.color} strokeWidth={1} strokeDasharray="5 4" opacity={0.75}
                  vectorEffect="non-scaling-stroke" />
            <text x={width - PAD.right - 2} y={y(r.value) - 3} textAnchor="end"
                  fontSize="9" fill={r.color}>
              {r.label} {series.unit ? `${r.value} ${series.unit}` : r.value}
            </text>
          </g>
        ))}
        {drag && Math.abs(drag.b - drag.a) > 0 && (
          <rect x={Math.min(x(drag.a), x(drag.b))} y={PAD.top}
                width={Math.abs(x(drag.b) - x(drag.a))}
                height={height - PAD.top - PAD.bottom}
                fill="#30578d" opacity={0.16} />
        )}
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

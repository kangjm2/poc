import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type {
  EventType, NetworkEvent, ProblemInstance, ProblemSurvey, Series,
  Threshold,
} from '../api/types'
import { TimeSeriesChart } from './TimeSeriesChart'
import { PRIORITY, useDismissable } from '../view/dismiss'

/**
 * Problems classified by cause, as a pie you can drill through.
 *
 * The reference tool's problem survey is a chain, not a list: an aggregated pie is the
 * entry point, a slice drills to the individual cases, and a case drills to the moment.
 * Reproducing only the list would lose the question the pie answers - which problem
 * dominates this drive - and reproducing only the pie would leave it untraceable.
 *
 * The categories are derived from detectors this tool already runs, so a cause it cannot
 * substantiate simply does not appear. That is deliberate: the reference can report a
 * dropped call because it decodes call state, and we cannot, so we do not pretend to.
 */

const R = 78
const CX = 96
const CY = 96

/** SVG arc path for one slice, from a fraction of the circle. */
function slicePath(from: number, to: number) {
  // A slice covering the whole circle cannot be drawn as an arc - start and end points
  // coincide and the path collapses. Two half-arcs draw it correctly.
  if (to - from >= 1) {
    return `M ${CX} ${CY - R} A ${R} ${R} 0 1 1 ${CX} ${CY + R}`
         + ` A ${R} ${R} 0 1 1 ${CX} ${CY - R} Z`
  }
  const a0 = from * 2 * Math.PI - Math.PI / 2
  const a1 = to * 2 * Math.PI - Math.PI / 2
  const x0 = CX + R * Math.cos(a0)
  const y0 = CY + R * Math.sin(a0)
  const x1 = CX + R * Math.cos(a1)
  const y1 = CY + R * Math.sin(a1)
  const large = to - from > 0.5 ? 1 : 0
  return `M ${CX} ${CY} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`
}

/** Samples either side of a case that the context view shows. 1 Hz, so 30 s each way. */
const CONTEXT_PAD = 30

export function ProblemSurveyPanel({
  sessionId, onPick, events = [], eventTypes, rsrpThresholds = [],
}: {
  sessionId: number | null
  onPick: (seq: number) => void
  events?: NetworkEvent[]
  eventTypes?: Map<string, EventType>
  /**
   * RSRP's threshold ladder, for the context chart's reference lines.
   *
   * Named for the KPI rather than passed as a generic `thresholds`, because the context
   * chart is not generic: it plots RSRP and nothing else (see the fetch below), so a prop
   * that said "thresholds" would invite a caller to pass another KPI's ladder and draw
   * rules that belong to a different scale.
   */
  rsrpThresholds?: Threshold[]
}) {
  const [data, setData] = useState<ProblemSurvey | null>(null)
  const [error, setError] = useState<string | null>(null)
  /**
   * Which causes are open, in the order they were opened.
   *
   * A list rather than one nullable string, because the reference opens a TAB per
   * drill-down and keeps them: *"Each drill-down from the same chart will open a new tab in
   * the same window. These tabs are displayed on the left side of the window with the
   * colors of the corresponding sectors"* (p87, quoted in `data-views.md` and
   * `corrections.md` C5).
   *
   * The workflow that needs it is comparing two causes - open both, flip between their case
   * grids, notice that the overshoot cases and the interference cases are the same three
   * streets. With one slot that costs a round trip through the pie every time, and the
   * comparison is done from memory.
   *
   * This project sized it 작음 as a styling difference once, and corrected itself after
   * reading p87: the tabs are the feature, not the decoration.
   */
  const [open, setOpen] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)
  const drill = active
  // Which case the context view is showing. Clicking a case used to only move a cursor
  // that nothing on this page displays - the pie and the case list were all the user
  // could see, so "what was RSRP doing in the ten seconds before it" meant leaving the
  // page, finding a thin red stretch on another tab, and coming back.
  const [selected, setSelected] = useState<ProblemInstance | null>(null)
  const [context, setContext] = useState<Series | null>(null)

  useEffect(() => {
    if (sessionId == null) return
    setError(null); setOpen([]); setActive(null); setSelected(null)
    api.problemSurvey(sessionId).then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
    // One fetch per session, not per case: the window is applied to the x domain, so
    // clicking through cases costs nothing.
    // Unfiltered on purpose - see api.seriesUnfiltered. This page is exempt from the
    // global filter, so its context chart has to be exempt with it.
    api.seriesUnfiltered(sessionId, ['RSRP']).then((all) => setContext(all[0] ?? null))
      .catch(() => setContext(null))
  }, [sessionId])

  // The context panel is a drill-down, not a modal: if the scale editor is open over it,
  // Escape means the editor first.
  useDismissable(selected != null, PRIORITY.DRILLDOWN, () => setSelected(null))

  if (error) return <div className="error">{error}</div>
  if (!data) return <div className="loading">Loading…</div>
  if (data.total === 0) {
    return <div className="loading">No problems detected in this session.</div>
  }

  const shown: ProblemInstance[] = drill
    ? data.instances.filter((i) => i.category === drill)
    : data.instances

  /**
   * Clicking a cause opens its tab and makes it the one being read; clicking the cause
   * that is already active closes it, which is how the single-slot version behaved and is
   * still the shortest way back to everything.
   */
  const openCause = (category: string) => {
    if (active === category) {
      setOpen((v) => v.filter((c) => c !== category))
      setActive(null)
      return
    }
    setOpen((v) => (v.includes(category) ? v : [...v, category]))
    setActive(category)
  }

  let acc = 0
  const arcs = data.categories.map((c) => {
    const from = acc
    acc += c.count / data.total
    return { ...c, from, to: acc }
  })

  return (
    <>
      <div className="panel">
        <header>
          <span className="title">Problem survey per category</span>
          <span className="meta" style={{ marginLeft: 'auto' }}>
            {data.total} problems
          </span>
          {open.length > 0 && (
            <button style={{ marginLeft: 8 }}
                    onClick={() => { setOpen([]); setActive(null) }}>
              Close all
            </button>
          )}
        </header>
        <div style={{ display: 'flex', gap: 16, padding: 10, alignItems: 'center',
                      flexWrap: 'wrap' }}>
          <svg width={CX * 2} height={CY * 2} role="img"
               aria-label="Problems by category">
            {arcs.map((a) => (
              <path key={a.category} d={slicePath(a.from, a.to)}
                    fill={a.color}
                    stroke="#fff" strokeWidth={1}
                    opacity={drill && drill !== a.category ? 0.25 : 1}
                    style={{ cursor: 'pointer' }}
                    onClick={() => openCause(a.category)}>
                <title>{`${a.label}: ${a.count} (${a.share.toFixed(2)}%)`}</title>
              </path>
            ))}
          </svg>
          <table className="grid" style={{ width: 'auto', minWidth: 320 }}>
            <tbody>
              {arcs.map((a) => (
                <tr key={a.category} className="deg-row"
                    onClick={() => openCause(a.category)}
                    style={drill === a.category ? { background: '#eef3fa' } : undefined}>
                  <td style={{ width: 22 }}>
                    <span className="swatch" style={{ background: a.color }} />
                  </td>
                  <td className="num" style={{ width: 64 }}>{a.share.toFixed(2)} %</td>
                  <td>{a.label}</td>
                  <td className="num" style={{ width: 44 }}>{a.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* The tabs, on the left and in each sector's own colour, as p87 specifies. The
          colour is what makes a tab findable without reading it: the reader picked the
          slice by its colour a moment ago, and the tab is the same colour. */}
      {open.length > 0 && (
        <div className="cause-tabs" role="tablist" aria-label="Open causes">
          {open.map((category) => {
            const arc = arcs.find((a) => a.category === category)
            return (
              <button key={category} role="tab" data-cause={category}
                      aria-selected={active === category}
                      className={active === category ? 'active' : ''}
                      style={{ borderLeftColor: arc?.color ?? '#999' }}
                      onClick={() => setActive(category)}>
                <span className="swatch" style={{ background: arc?.color ?? '#999' }} />
                {arc?.label ?? category}
                <span className="dim">{arc?.count ?? 0}</span>
                <span className="close" role="presentation" title="Close this cause"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpen((v) => v.filter((c) => c !== category))
                        // Fall back to whatever is still open rather than to nothing: the
                        // reader closed one tab, not the comparison they were making.
                        setActive((cur) => {
                          if (cur !== category) return cur
                          const left = open.filter((c) => c !== category)
                          return left.length > 0 ? left[left.length - 1] : null
                        })
                      }}>×</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="panel">
        <header>
          <span className="title">
            {drill
              ? `${arcs.find((a) => a.category === drill)?.label} — cases`
              : 'All cases'}
          </span>
          <span className="meta">{shown.length}</span>
        </header>
        <div style={{ maxHeight: 360, overflow: 'auto' }}>
          <table className="grid">
            <thead>
              <tr><th>Category</th><th>Severity</th><th className="num">From seq</th>
                <th className="num">To seq</th><th>Detail</th><th>Detected by</th></tr>
            </thead>
            <tbody>
              {shown.map((i, n) => (
                <tr key={`${i.category}-${i.startSeq}-${n}`} className="deg-row"
                    onClick={() => { setSelected(i); onPick(i.startSeq) }}
                    title="Move the cursor to this problem">
                  <td>{i.categoryLabel}</td>
                  <td className={`sev-${i.severity}`}>{i.severity}</td>
                  <td className="num">{i.startSeq}</td>
                  <td className="num">{i.endSeq}</td>
                  <td style={{ whiteSpace: 'normal' }}>{i.detail}</td>
                  <td style={{ color: '#666' }}>{i.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="panel case-context">
          <header>
            <span className="title">Around this problem</span>
            <span className="meta" style={{ marginLeft: 'auto' }}>
              {selected.categoryLabel}
            </span>
            <button style={{ marginLeft: 8 }} onClick={() => setSelected(null)}>
              Close
            </button>
          </header>
          <div style={{ padding: '6px 10px 0' }}>
            <div className="ctx-span">
              {selected.startSeq === selected.endSeq
                ? `seq ${selected.startSeq}`
                : `seq ${selected.startSeq}–${selected.endSeq} `
                  + `(${selected.endSeq - selected.startSeq + 1} samples)`}
              {' · showing '}
              {Math.max(0, selected.startSeq - CONTEXT_PAD)}–
              {selected.endSeq + CONTEXT_PAD}
            </div>
          </div>
          {context ? (
            // The same chart component the analysis pages use, windowed. A second
            // implementation would be a second place for the seq-to-x mapping to drift.
            <TimeSeriesChart
              series={context}
              cursorSeq={selected.startSeq}
              onCursorChange={onPick}
              events={events}
              eventTypes={eventTypes}
              fromSeq={Math.max(0, selected.startSeq - CONTEXT_PAD)}
              toSeq={selected.endSeq + CONTEXT_PAD}
              thresholds={rsrpThresholds}
              height={130}
            />
          ) : (
            <div className="loading">No RSRP trace for this session.</div>
          )}
        </div>
      )}
    </>
  )
}

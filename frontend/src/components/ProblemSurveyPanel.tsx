import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type {
  EventType, NetworkEvent, ProblemInstance, ProblemSurvey, Series,
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

export function ProblemSurveyPanel({ sessionId, onPick, events = [], eventTypes }: {
  sessionId: number | null
  onPick: (seq: number) => void
  events?: NetworkEvent[]
  eventTypes?: Map<string, EventType>
}) {
  const [data, setData] = useState<ProblemSurvey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drill, setDrill] = useState<string | null>(null)
  // Which case the context view is showing. Clicking a case used to only move a cursor
  // that nothing on this page displays - the pie and the case list were all the user
  // could see, so "what was RSRP doing in the ten seconds before it" meant leaving the
  // page, finding a thin red stretch on another tab, and coming back.
  const [selected, setSelected] = useState<ProblemInstance | null>(null)
  const [context, setContext] = useState<Series | null>(null)

  useEffect(() => {
    if (sessionId == null) return
    setError(null); setDrill(null); setSelected(null)
    api.problemSurvey(sessionId).then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
    // One fetch per session, not per case: the window is applied to the x domain, so
    // clicking through cases costs nothing.
    api.series(sessionId, ['RSRP']).then((all) => setContext(all[0] ?? null))
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
          {drill && (
            <button style={{ marginLeft: 8 }} onClick={() => setDrill(null)}>
              Back to all categories
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
                    onClick={() => setDrill(drill === a.category ? null : a.category)}>
                <title>{`${a.label}: ${a.count} (${a.share.toFixed(2)}%)`}</title>
              </path>
            ))}
          </svg>
          <table className="grid" style={{ width: 'auto', minWidth: 320 }}>
            <tbody>
              {arcs.map((a) => (
                <tr key={a.category} className="deg-row"
                    onClick={() => setDrill(drill === a.category ? null : a.category)}
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

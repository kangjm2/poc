import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ProblemInstance, ProblemSurvey } from '../api/types'

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

export function ProblemSurveyPanel({ sessionId, onPick }: {
  sessionId: number | null
  onPick: (seq: number) => void
}) {
  const [data, setData] = useState<ProblemSurvey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drill, setDrill] = useState<string | null>(null)

  useEffect(() => {
    if (sessionId == null) return
    setError(null); setDrill(null)
    api.problemSurvey(sessionId).then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [sessionId])

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
                    onClick={() => onPick(i.startSeq)}
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
    </>
  )
}

import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { RouteMap } from './RouteMap'
import type {
  CellRef, KpiDefinition, Series, SeriesPoint, TrackPoint, Workbook, WorkbookPane,
} from '../api/types'

/**
 * A workbook the user composed, and the Layers dock that decides what is on each pane.
 *
 * This is the half of the reference tool we did not have. Its workbooks are a vertical
 * stack of panes, each with a Layers dock listing what is drawn there, and a `+` on the tab
 * strip for making another. Ours had a fixed set of screens, so every KPI was recorded and
 * chartable but no two could be put together unless someone had thought of that pairing in
 * advance - an engineer chasing a fronthaul fault could not add PRB utilisation beside the
 * radio traces without editing code.
 *
 * A layer is a KPI ON the pane; `visible` is whether it is currently drawn. Those are
 * deliberately two different things, because unticking a layer in the reference hides the
 * trace without forgetting it - so flicking a comparison series on and off costs a tick,
 * not a re-add.
 */

/** Trace colours, distinct at a glance and stable per layer position. */
const TRACE = ['#30578d', '#c0392b', '#1f7a1f', '#8a2be2', '#d4783c', '#0080c0',
               '#7a6000', '#b5179e']

function LayersDock({ pane, defs, onChange, onRemove }: {
  pane: WorkbookPane
  defs: KpiDefinition[]
  onChange: (p: WorkbookPane) => void
  onRemove: () => void
}) {
  const [adding, setAdding] = useState('')
  const used = new Set(pane.layers.map((l) => l.kpiName))

  return (
    <div className="dock-section" style={{ minWidth: 210, maxWidth: 210 }}>
      <h3>Layers</h3>
      <div className="content" style={{ padding: 6 }}>
        {pane.layers.length === 0 && (
          <div style={{ color: '#666', whiteSpace: 'normal' }}>
            Nothing on this pane yet.
          </div>
        )}
        {pane.layers.map((l, i) => {
          const def = defs.find((d) => d.name === l.kpiName)
          return (
            <div key={l.kpiName}
                 style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0' }}>
              <input type="checkbox" checked={l.visible}
                     title={l.visible ? 'Hide this trace' : 'Show this trace'}
                     onChange={(e) => onChange({
                       ...pane,
                       layers: pane.layers.map((x, j) =>
                         j === i ? { ...x, visible: e.target.checked } : x),
                     })} />
              <span style={{
                width: 9, height: 9, borderRadius: 2, flex: '0 0 auto',
                background: pane.kind === 'CHART' ? TRACE[i % TRACE.length] : '#999',
                opacity: l.visible ? 1 : 0.25,
              }} />
              <span style={{ flex: 1, opacity: l.visible ? 1 : 0.5 }}>
                {def?.displayName ?? l.kpiName}
              </span>
              <button title="Remove this layer from the pane"
                      onClick={() => onChange({
                        ...pane, layers: pane.layers.filter((_, j) => j !== i),
                      })}>&times;</button>
            </div>
          )
        })}

        <select value={adding} style={{ width: '100%', marginTop: 6 }}
                onChange={(e) => {
                  if (!e.target.value) return
                  onChange({
                    ...pane,
                    layers: [...pane.layers, { kpiName: e.target.value, visible: true }],
                  })
                  setAdding('')
                }}>
          <option value="">+ add layer…</option>
          {defs.filter((d) => !used.has(d.name)).map((d) => (
            <option key={d.name} value={d.name}>{d.displayName}</option>
          ))}
        </select>

        <div style={{ marginTop: 8, borderTop: '1px solid #e0e0e6', paddingTop: 6 }}>
          <button onClick={onRemove}>Remove pane</button>
        </div>
      </div>
    </div>
  )
}

export function ComposedWorkbook({
  workbook, sessionId, defs, track, cells, cursorSeq, onCursorChange, onSaved, onDeleted,
}: {
  workbook: Workbook
  sessionId: number | null
  defs: KpiDefinition[]
  track: TrackPoint[]
  cells: CellRef[]
  cursorSeq: number
  onCursorChange: (seq: number) => void
  onSaved: (w: Workbook) => void
  onDeleted: (id: number) => void
}) {
  const [draft, setDraft] = useState<Workbook>(workbook)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [series, setSeries] = useState<Series[]>([])

  // The workbook fetches its own series rather than taking App's.
  //
  // App loads a fixed list chosen when the built-in screens were written, and a composed
  // pane can carry ANY KPI - including one defined this morning in the workbench. Asking
  // App for it would mean App knowing what is on every pane, which is exactly the coupling
  // that made the tabs un-composable in the first place.
  const wanted = draft.panes.flatMap((p) => p.layers.map((l) => l.kpiName))
  const wantedKey = [...new Set(wanted)].sort().join(',')
  useEffect(() => {
    if (sessionId == null || wantedKey === '') { setSeries([]); return }
    let live = true
    api.series(sessionId, wantedKey.split(','))
      .then((s) => { if (live) setSeries(s) })
      .catch(() => { if (live) setSeries([]) })
    return () => { live = false }
  }, [sessionId, wantedKey])

  // Reset when the user switches tabs, or an edit to one workbook would appear to
  // follow them onto the next.
  useEffect(() => { setDraft(workbook); setDirty(false); setError(null) }, [workbook])

  const edit = (panes: WorkbookPane[]) => { setDraft({ ...draft, panes }); setDirty(true) }

  const save = async () => {
    setBusy(true); setError(null)
    try {
      const saved = await api.saveWorkbook({
        id: draft.id, name: draft.name, panes: draft.panes,
      })
      setDraft(saved); setDirty(false); onSaved(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const remove = async () => {
    setBusy(true)
    try { await api.deleteWorkbook(draft.id); onDeleted(draft.id) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const addPane = (kind: 'CHART' | 'MAP') =>
    edit([...draft.panes, { kind, title: null, layers: [] }])

  return (
    <>
      <div className="panel">
        <header>
          <input value={draft.name} style={{ fontWeight: 600, width: 220 }}
                 onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setDirty(true) }} />
          <span className="meta">
            {draft.panes.length} pane{draft.panes.length === 1 ? '' : 's'}
            {dirty ? ' · unsaved' : ''}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={() => addPane('CHART')}>+ Chart pane</button>
            <button onClick={() => addPane('MAP')}>+ Map pane</button>
            <button onClick={save} disabled={busy || !dirty}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button onClick={remove} disabled={busy}>Delete workbook</button>
          </span>
        </header>
        {error && <div className="error">{error}</div>}
        {draft.panes.length === 0 && (
          <div style={{ padding: 12, color: '#666', whiteSpace: 'normal' }}>
            An empty workbook. Add a chart pane, then use its <b>Layers</b> dock to put the
            parameters you are chasing on it &mdash; several on one pane if you want them on
            the same axis. Panes stack top to bottom and all of them follow the shared time
            cursor.
          </div>
        )}
      </div>

      {draft.panes.map((pane, i) => {
        const visible = pane.layers.filter((l) => l.visible)
        const setPane = (p: WorkbookPane) =>
          edit(draft.panes.map((x, j) => (j === i ? p : x)))
        return (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {pane.kind === 'MAP' ? (
                <RouteMap track={track} cells={cells} cursorSeq={cursorSeq}
                          onCursorChange={onCursorChange}
                          kpiName={visible[0]
                            ? (defs.find((d) => d.name === visible[0].kpiName)?.displayName
                               ?? visible[0].kpiName)
                            : 'nothing selected'} />
              ) : visible.length === 0 ? (
                <div className="panel">
                  <header><span className="title">{pane.title ?? 'Chart'}</span></header>
                  <div style={{ padding: 12, color: '#666' }}>
                    No visible layer. Tick one in the Layers dock.
                  </div>
                </div>
              ) : (
                <MultiSeriesChart
                  title={pane.title ?? visible.map((l) =>
                    defs.find((d) => d.name === l.kpiName)?.displayName ?? l.kpiName).join(' · ')}
                  series={visible.map((l) => ({
                    s: series.find((x) => x.kpi === l.kpiName),
                    color: TRACE[pane.layers.findIndex((p) => p.kpiName === l.kpiName)
                                 % TRACE.length],
                    key: l.kpiName,
                  })).filter((x) => x.s)}
                  cursorSeq={cursorSeq} onCursorChange={onCursorChange} />
              )}
            </div>
            <LayersDock pane={pane} defs={defs} onChange={setPane}
                        onRemove={() => edit(draft.panes.filter((_, j) => j !== i))} />
          </div>
        )
      })}
    </>
  )
}

/**
 * Several KPIs on one pane.
 *
 * The existing TimeSeriesChart draws one KPI against its own colour scale, which is right
 * for the built-in screens where each chart IS one parameter. A composed pane is the other
 * case: the user put these traces together precisely to compare them, so they share an axis
 * and are told apart by colour rather than by being in different boxes.
 *
 * Each trace is normalised to the pane's shared axis by its own min/max. That is the honest
 * way to put RSRP in dBm beside a percentage - the alternative is a second axis, which
 * invites reading a crossing point as meaningful when it is an artefact of two scales. The
 * axis therefore shows no numbers, and each layer's real range is printed in the legend.
 */
function MultiSeriesChart({ title, series, cursorSeq, onCursorChange }: {
  title: string
  series: Array<{ s?: Series; color: string; key: string }>
  cursorSeq: number
  onCursorChange: (seq: number) => void
}) {
  const W = 1000, H = 200, PAD_R = 8, PAD_T = 10, PAD_B = 18
  // A null value means the KPI had no reading at that sample. Dropped rather than drawn:
  // plotting it as zero would put a fabricated dip in the trace.
  const withData = series
    .map((x) => ({ ...x, pts: (x.s?.points ?? []).filter(hasValue) }))
    .filter((x) => x.s && x.pts.length > 0)
  if (withData.length === 0) {
    return (
      <div className="panel">
        <header><span className="title">{title}</span></header>
        <div style={{ padding: 12, color: '#666' }}>No samples for these layers.</div>
      </div>
    )
  }
  // With one trace the pane can carry a real axis, because there is only one unit on it.
  // With several there is no honest shared axis - RSRP in dBm beside a percentage - so each
  // is normalised to its own range and the axis carries no numbers at all. A second y axis
  // was the alternative and is worse: it invites reading a crossing point as meaningful
  // when it is an artefact of two scales chosen independently.
  const single = withData.length === 1
  const soleLo = single ? Math.min(...withData[0].pts.map((p) => p.value)) : 0
  const soleHi = single ? Math.max(...withData[0].pts.map((p) => p.value)) : 0

  const maxSeq = Math.max(...withData.map((x) => x.pts[x.pts.length - 1].seq))
  // Room for tick labels only when there is an axis worth labelling.
  const PAD_L = single ? 44 : 8
  const x = (seq: number) => PAD_L + (seq / Math.max(1, maxSeq)) * (W - PAD_L - PAD_R)

  return (
    <div className="panel">
      <header>
        <span className="title">{title}</span>
        <span className="meta" style={{ marginLeft: 'auto' }}>
          {single ? `single layer — ${withData[0].s!.unit || 'true'} scale`
                  : `${withData.length} layers — each normalised to its own range`}
        </span>
      </header>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
           style={{ width: '100%', height: 200, display: 'block', cursor: 'crosshair' }}
           role="img" aria-label={`Composed pane: ${title}`}
           onClick={(e) => {
             const r = (e.target as SVGElement).ownerSVGElement!.getBoundingClientRect()
             const frac = (e.clientX - r.left) / r.width
             onCursorChange(Math.round(Math.max(0, Math.min(1, frac)) * maxSeq))
           }}>
        {single && [soleHi, (soleHi + soleLo) / 2, soleLo].map((v, i) => {
          const yy = PAD_T + (1 - (v - soleLo) / Math.max(1e-9, soleHi - soleLo))
                     * (H - PAD_T - PAD_B)
          return (
            <g key={i}>
              <line x1={PAD_L} x2={W - PAD_R} y1={yy} y2={yy} stroke="#ececf0"
                    vectorEffect="non-scaling-stroke" />
              <text x={PAD_L - 5} y={yy + 3} textAnchor="end" fontSize="9" fill="#666"
                    style={{ fontVariantNumeric: 'tabular-nums' }}>
                {v.toFixed(1)}
              </text>
            </g>
          )
        })}
        {withData.map(({ pts, color, key }) => {
          const lo = Math.min(...pts.map((p) => p.value))
          const hi = Math.max(...pts.map((p) => p.value))
          const span = Math.max(1e-9, hi - lo)
          const y = (v: number) => PAD_T + (1 - (v - lo) / span) * (H - PAD_T - PAD_B)
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.seq)} ${y(p.value)}`).join(' ')
          return <path key={key} d={d} fill="none" stroke={color} strokeWidth={1.2}
                       vectorEffect="non-scaling-stroke" />
        })}
        <line x1={x(cursorSeq)} x2={x(cursorSeq)} y1={0} y2={H}
              stroke="var(--cursor)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '4px 10px 8px' }}>
        {withData.map(({ s, pts, color, key }) => {
          const lo = Math.min(...pts.map((p) => p.value))
          const hi = Math.max(...pts.map((p) => p.value))
          const at = pts.find((p) => p.seq >= cursorSeq) ?? pts[pts.length - 1]
          return (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 3, background: color }} />
              <b>{s!.displayName}</b>
              <span style={{ color: '#666' }}>
                {at.value.toFixed(1)}{s!.unit ? ` ${s!.unit}` : ''}
                {' '}(range {lo.toFixed(1)}…{hi.toFixed(1)})
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** A sample that actually carries a reading. */
type Reading = SeriesPoint & { value: number }
function hasValue(p: SeriesPoint): p is Reading { return p.value != null }

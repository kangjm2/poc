import { Fragment, useEffect, useState } from 'react'
import { api } from '../api/client'
import { RouteMap } from './RouteMap'
import { SERIES_PALETTE } from '../view/paint'
import type {
  CellRef, KpiDefinition, Series, SeriesPoint, SessionSummary, TrackPoint, Workbook,
  WorkbookLimits, WorkbookPane,
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

/**
 * Trace colours, distinct at a glance and stable per layer position.
 *
 * Read from `view/paint` rather than declared here since the cohort strip and the CDF
 * overlay paint ordered series too: three copies of one list would have drifted the first
 * time somebody added a ninth colour to whichever one they were looking at.
 */
const TRACE = SERIES_PALETTE

function LayersDock({ pane, defs, sessions, maxLayers, onChange, onRemove }: {
  pane: WorkbookPane
  defs: KpiDefinition[]
  sessions: SessionSummary[]
  maxLayers: number | null
  onChange: (p: WorkbookPane) => void
  onRemove: () => void
}) {
  const [adding, setAdding] = useState('')
  const used = new Set(pane.layers.map((l) => l.kpiName))
  // Null while the limit is still being fetched: better to allow the add and let the
  // server answer than to block a control on a request the user cannot see.
  const full = maxLayers != null && pane.layers.length >= maxLayers

  return (
    <div className="dock-section" style={{ minWidth: 210, maxWidth: 210 }}>
      <h3>Layers</h3>
      <div className="content" style={{ padding: 6 }}>
        {pane.layers.length === 0 && (
          <div style={{ color: '#666', whiteSpace: 'normal' }}>
            Nothing on this pane yet.
          </div>
        )}
        {pane.kind === 'MAP' && pane.layers.length > 1 && (
          <div style={{ color: '#666', whiteSpace: 'normal', paddingBottom: 4 }}>
            A map draws one layer at a time.
          </div>
        )}
        {pane.layers.map((l, i) => {
          const def = defs.find((d) => d.name === l.kpiName)
          return (
            <Fragment key={l.kpiName}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0' }}>
              {/* A map paints ONE colour scale, so ticking on a map pane is exclusive:
                  showing a layer hides the others rather than stacking something the map
                  cannot draw. Chart panes stack, which is the whole point of them. */}
              <input type="checkbox" checked={l.visible}
                     title={l.visible
                       ? (pane.kind === 'MAP' ? 'Stop drawing this layer' : 'Hide this trace')
                       : (pane.kind === 'MAP' ? 'Draw this layer instead' : 'Show this trace')}
                     onChange={(e) => onChange({
                       ...pane,
                       layers: pane.layers.map((x, j) => (
                         j === i
                           ? { ...x, visible: e.target.checked }
                           : (pane.kind === 'MAP' && e.target.checked
                             ? { ...x, visible: false }
                             : x)
                       )),
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
            {/* Which MEASUREMENT this layer draws. Map panes only: a chart pane already
                puts several traces of one drive together, and letting a trace come from
                another drive would put two time axes on one x axis.
                "the open one" is the default and the reason a saved workbook still
                applies to a drive it has never seen. */}
            {pane.kind === 'MAP' && (
              <select value={l.sessionId ?? ''} aria-label={`Measurement for ${l.kpiName}`}
                      style={{ width: '100%', marginBottom: 4, fontSize: 11 }}
                      title="Which measurement this layer draws"
                      onChange={(e) => onChange({
                        ...pane,
                        layers: pane.layers.map((x, j) => (j === i
                          ? { ...x, sessionId: e.target.value ? Number(e.target.value) : null }
                          : x)),
                      })}>
                <option value="">the open measurement</option>
                {sessions.map((sess) => (
                  <option key={sess.id} value={sess.id}>{sess.name}</option>
                ))}
              </select>
            )}
            </Fragment>
          )
        })}

        {full && (
          <div style={{ color: '#666', whiteSpace: 'normal', marginTop: 6 }}>
            {`This pane is full at ${maxLayers} layers. Remove one to add another.`}
          </div>
        )}
        {/* Named, because a per-layer measurement picker now sits above it and "the
            select in the Layers dock" stopped identifying one control. */}
        <select value={adding} aria-label="Add a layer to this pane"
                style={{ width: '100%', marginTop: 6 }} disabled={full}
                onChange={(e) => {
                  if (!e.target.value) return
                  onChange({
                    ...pane,
                    layers: [
                      // Same exclusivity as the checkbox: adding to a map pane draws the
                      // new layer, so the previous one stops being drawn.
                      ...(pane.kind === 'MAP'
                        ? pane.layers.map((x) => ({ ...x, visible: false }))
                        : pane.layers),
                      { kpiName: e.target.value, visible: true },
                    ],
                  })
                  setAdding('')
                }}>
          <option value="">{full ? 'Pane full' : '+ add layer…'}</option>
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
  workbook, sessionId, sessions, defs, cells, cursorSeq, onCursorChange, onSaved, onDeleted,
  filterSpec,
}: {
  workbook: Workbook
  sessionId: number | null
  sessions: SessionSummary[]
  /**
   * A refetch trigger, not a request parameter. A composed workbook is the screen where a
   * stale pane hides best - panes are user-arranged, so nothing looks out of place - so
   * both of its fetches depend on it.
   */
  filterSpec?: string | null
  defs: KpiDefinition[]
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
  // See WorkbookService.Limits: the server rejects an over-full workbook, so the server is
  // asked how full is full rather than the editor keeping a second copy of the number.
  const [limits, setLimits] = useState<WorkbookLimits | null>(null)
  useEffect(() => { api.workbookLimits().then(setLimits).catch(() => {}) }, [])

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
  }, [sessionId, wantedKey, filterSpec])

  /**
   * Map panes fetch their own track, for the same reason the pane fetches its own series.
   *
   * A track carries the COLOUR of every sample, computed on the server against one KPI's
   * scale. App's track is painted for App's globally selected KPI, so handing it to a pane
   * meant the pane's Layers dock named one KPI while the map drew another - and because the
   * caption was written from the dock, the two disagreed silently and the caption was the
   * one that looked authoritative.
   */
  // A map layer names a KPI and, optionally, a MEASUREMENT. `null` session means the one
  // that is open, which is what every layer meant before drives were nameable - and what
  // keeps a saved workbook a reusable arrangement rather than a snapshot of one drive.
  const sessionName = (id: number) => sessions.find((x) => x.id === id)?.name ?? `#${id}`
  const trackKey = (kpiName: string, sid: number | null | undefined) =>
    `${sid ?? sessionId ?? 0}|${kpiName}`
  const mapWants = draft.panes
    .filter((p) => p.kind === 'MAP')
    .flatMap((p) => p.layers.filter((l) => l.visible)
      .map((l) => ({ kpiName: l.kpiName, sid: l.sessionId ?? sessionId })))
    .filter((w): w is { kpiName: string; sid: number } => w.sid != null)
  const mapKey = [...new Set(mapWants.map((w) => `${w.sid}|${w.kpiName}`))].sort().join(',')
  const [tracks, setTracks] = useState<Record<string, TrackPoint[]>>({})
  useEffect(() => {
    if (sessionId == null || mapKey === '') { setTracks({}); return }
    let live = true
    const keys = mapKey.split(',')
    Promise.all(keys.map((k) => {
      const [sid, name] = [Number(k.split('|')[0]), k.split('|').slice(1).join('|')]
      return api.track(sid, name).catch(() => [] as TrackPoint[])
    })).then((rows) => {
      if (!live) return
      setTracks(Object.fromEntries(keys.map((k, i) => [k, rows[i]])))
    })
    return () => { live = false }
  }, [sessionId, mapKey, filterSpec])

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

  // Deleting takes the panes and their layers with it, and a workbook is the one thing here
  // the user ASSEMBLED - everything else on screen can be re-derived from the measurement.
  // Deleting a measurement and resetting a scale both ask first; this was the only
  // destructive action that did not, and it destroyed the most work.
  const remove = async () => {
    const panes = draft.panes.length
    const layers = draft.panes.reduce((n, p) => n + p.layers.length, 0)
    if (!window.confirm(
      `Delete the workbook "${draft.name}" with its ${panes} pane${panes === 1 ? '' : 's'}`
      + ` and ${layers} layer${layers === 1 ? '' : 's'}?`)) return
    setBusy(true)
    try { await api.deleteWorkbook(draft.id); onDeleted(draft.id) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const panesFull = limits != null && draft.panes.length >= limits.maxPanes

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
            <button onClick={() => addPane('CHART')} disabled={panesFull}
                    title={panesFull ? `A workbook holds at most ${limits?.maxPanes} panes`
                                     : undefined}>+ Chart pane</button>
            <button onClick={() => addPane('MAP')} disabled={panesFull}
                    title={panesFull ? `A workbook holds at most ${limits?.maxPanes} panes`
                                     : undefined}>+ Map pane</button>
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
                visible.length === 0 ? (
                  // The same answer a chart pane gives, for the same reason: with nothing
                  // ticked there is no KPI to colour by, and drawing the route in some
                  // other KPI's colours would answer a question nobody asked.
                  <div className="panel">
                    <header><span className="title">{pane.title ?? 'Map'}</span></header>
                    <div style={{ padding: 12, color: '#666' }}>
                      No visible layer. Tick one in the Layers dock.
                    </div>
                  </div>
                ) : (
                  <RouteMap
                    track={tracks[trackKey(visible[0].kpiName, visible[0].sessionId)] ?? []}
                    cells={cells}
                    cursorSeq={cursorSeq}
                    frameKey={trackKey(visible[0].kpiName, visible[0].sessionId)}
                    onCursorChange={onCursorChange}
                    // The measurement is named on the map when it is NOT the open one.
                    // Without that a pane pinned to last month looks like this month, and
                    // the only difference is that the numbers are wrong.
                    // ... and when a global filter is in force, the map also says WHICH
                    // drive the condition was applied to. One condition over two drives
                    // selects two different sample sets - each drive filtered against
                    // itself - which is the right answer and an invisible one: the map
                    // would otherwise show a pinned drive, narrowed by a condition the
                    // user set while looking at a different one, and say nothing.
                    kpiName={(defs.find((d) => d.name === visible[0].kpiName)?.displayName
                              ?? visible[0].kpiName)
                             + (visible[0].sessionId && visible[0].sessionId !== sessionId
                               ? ` · ${sessionName(visible[0].sessionId)}`
                                 + (filterSpec ? ' · filtered against its own measurement' : '')
                               : '')} />
                )
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
            <LayersDock pane={pane} defs={defs} sessions={sessions}
                        maxLayers={limits?.maxLayersPerPane ?? null} onChange={setPane}
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

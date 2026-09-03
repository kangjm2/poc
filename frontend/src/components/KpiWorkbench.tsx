import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import type {
  EventType, GraphEdge, GraphNode, GraphNodeKind, GraphNodePreview, GraphSpec,
  GraphStateRule, GraphValidation, KpiDefinition, StoredGraph,
} from '../api/types'
import { CORRELATIONS, SAMPLE_FIELDS } from '../api/types'

/**
 * The KPI Workbench: a KPI built by wiring nodes rather than by typing one formula.
 *
 * Drawn to match the reference tool's own workbench, which was read off a screenshot of it
 * rather than inferred from a manual. That screen is a top-down graph of bordered boxes,
 * each with a bold title and an optional detail line under it, joined by ORTHOGONAL
 * right-angle edges - down, across, down - with a small arrowhead entering the top of the
 * target. Sources sit at the top and the output at the bottom. All of that is reproduced
 * here, because an engineer who has used that screen should recognise this one.
 *
 * What is NOT reproduced is anything that identifies the product: no logo, no wordmark, no
 * brand colour. Mirroring a layout idiom is how you avoid making an existing user relearn
 * their tool; copying an identity is a different thing entirely.
 *
 * There is no library. The whole editor is SVG and pointer events, which is the same
 * standing constraint the charts are built under - and the reason the charts are all
 * hand-written too.
 */

const NODE_W = 190
const NODE_H = 46
const PORT_R = 4

/** What each node kind is for, and what it needs, shown in the inspector. */
const KIND_INFO: Record<GraphNodeKind, { label: string; hint: string; inputs: string }> = {
  SOURCE_KPI: {
    label: 'KPI source',
    hint: 'Reads one measured or derived KPI as a column.',
    inputs: 'no inputs',
  },
  SOURCE_NEIGHBOUR: {
    label: 'Neighbour source',
    hint: 'Reads the Nth strongest cell in the monitored set — the equivalent of the '
        + 'reference tool’s “1. best” sources.',
    inputs: 'no inputs',
  },
  SOURCE_SAMPLE: {
    label: 'Sample source',
    hint: 'Reads a field recorded on the sample itself — speed, position, serving cell. '
        + 'These are not KPIs, so they were previously unreachable from the canvas.',
    inputs: 'no inputs',
  },
  SOURCE_EVENT: {
    label: 'Event source',
    hint: 'Marks the samples where an event was reported. 1 at that sample and nothing '
        + 'elsewhere, so a filter on it selects the moments the event happened.',
    inputs: 'no inputs',
  },
  COMBINE: {
    label: 'Combine',
    hint: 'Aligns several inputs onto the same samples, keeping a sample when only some '
        + 'of them have a value.',
    inputs: '1–8 inputs',
  },
  CORRELATE: {
    label: 'Correlate',
    hint: 'Fetches one value of one input relative to the moments of the other — the '
        + 'value just before an event, at it, or just after. The primary input decides '
        + 'when there is an output at all; where it has no value, there is no row.',
    inputs: '2 inputs',
  },
  EXPRESSION: {
    label: 'Expression',
    hint: 'Arithmetic over the columns reaching it, named by the alias.',
    inputs: '1 input',
  },
  FILTER: {
    label: 'Filter',
    hint: 'Keeps only the samples where the condition holds.',
    inputs: '1 input',
  },
  CLASSIFIER: {
    label: 'Classifier',
    hint: 'Labels each sample with the first state whose condition holds. States become '
        + 'the numbers 1, 2, 3… in this order, because the result becomes a KPI value. '
        + 'It has no memory: every sample is judged on its own.',
    inputs: '1 input',
  },
  STATE_MACHINE: {
    label: 'State machine',
    hint: 'Measures how long the machine held each state, in milliseconds, recorded at '
        + 'the sample where the state began. A state can be entered only from the one '
        + 'above it; the first state is the idle state, and its condition is the only '
        + 'way back.',
    inputs: '1 input',
  },
  OUTPUT: {
    label: 'Output',
    hint: 'The column that becomes the KPI.',
    inputs: '1 input',
  },
}

/** The detail line under a node's title, mirroring the reference's second line. */
function detailOf(n: GraphNode): string {
  switch (n.kind) {
    case 'SOURCE_KPI': return n.kpiName ?? '(pick a KPI)'
    case 'SOURCE_NEIGHBOUR':
      return `${n.metric ?? 'RSRP'} ${n.rank ?? 1}. best`
    case 'EXPRESSION': return n.expression ? `${n.expression} AS ${n.as ?? 'VALUE'}` : '(formula)'
    case 'FILTER': return n.expression ?? '(condition)'
    case 'CLASSIFIER':
      return (n.states ?? []).map((s) => s.state).join(', ') || '(no states)'
    // The arrow is the semantics: a ladder's order IS what it means, so the card shows
    // the order rather than a set that happens to be stored in one.
    case 'STATE_MACHINE':
      return (n.states ?? []).map((s) => s.state).join(' → ') || '(no states)'
    case 'OUTPUT': return n.column ? `Column: ${n.column}` : 'Column: (pick one)'
    case 'COMBINE': return 'All values within time range'
    case 'CORRELATE':
      return `${(n.correlation ?? 'PREVIOUS').replace(/_/g, ' ').toLowerCase()}`
           + (n.column ? ` ${n.column}` : '')
    default: return ''
  }
}

/**
 * Which row a kind belongs on, so a new node lands where the reference would put it.
 *
 * The reference's graphs read strictly top-down - sources along the top, the output at the
 * bottom - and that is not decoration: it is how you see at a glance which way the data
 * flows. Placing new nodes in the order they were added instead put a source beside its own
 * output, which made the connecting edge double back on itself and the graph unreadable.
 */
const TIER: Record<GraphNodeKind, number> = {
  SOURCE_KPI: 0, SOURCE_NEIGHBOUR: 0, SOURCE_SAMPLE: 0, SOURCE_EVENT: 0,
  COMBINE: 1, CORRELATE: 1,
  EXPRESSION: 2, FILTER: 2, CLASSIFIER: 3, STATE_MACHINE: 3, OUTPUT: 4,
}

/**
 * An orthogonal edge: down out of the source, across, then down into the target.
 *
 * When the target is NOT below the source - which a user can always arrange by dragging -
 * the path drops into a lane below both boxes and comes up into the target, rather than
 * cutting straight through whatever sits between them.
 */
function edgePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H
  const x2 = b.x + NODE_W / 2, y2 = b.y
  const lane = y2 > y1 + 24
    ? y1 + (y2 - y1) / 2
    : Math.max(y1, b.y + NODE_H) + 22
  return `M ${x1} ${y1} L ${x1} ${lane} L ${x2} ${lane} L ${x2} ${y2}`
}

let nextId = 1
const freshId = (nodes: GraphNode[]) => {
  nextId = Math.max(nextId, ...nodes.map((n) => n.id), 0) + 1
  return nextId
}

/**
 * The Correlate node's inspector.
 *
 * Three questions, and the first is the one the reference answers with geometry: WHICH
 * INPUT decides the moments. Their rule is "the leftmost input is primary", which is a
 * layout convention nothing enforces and which our compiler could not read even if it
 * wanted to - a node's inputs arrive as edges and are ordered by node id so the same
 * drawing always compiles the same way. So it is a control, and the control says what it
 * decides rather than leaving the author to infer it from the picture.
 */
function CorrelateEditor({ node, patch, nodes, edges, columnsOf }: {
  node: GraphNode
  patch: (id: number, p: Partial<GraphNode>) => void
  nodes: GraphNode[]
  edges: GraphEdge[]
  columnsOf: (id: number) => string[]
}) {
  const inputs = edges.filter((e) => e.to === node.id).map((e) => e.from).sort((a, b) => a - b)
  const nameOf = (id: number) => {
    const n = nodes.find((x) => x.id === id)
    return n ? `${n.label ?? KIND_INFO[n.kind].label}${detailOf(n) ? ` — ${detailOf(n)}` : ''}`
             : `#${id}`
  }
  const primary = node.primary ?? inputs[0] ?? null
  const secondary = inputs.find((i) => i !== primary) ?? null
  const secCols = secondary == null ? [] : columnsOf(secondary)

  if (inputs.length !== 2) {
    return (
      <div style={{ color: '#666', whiteSpace: 'normal' }}>
        Wire exactly two inputs. One decides the moments; the other supplies the value.
        This node has {inputs.length}.
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <label>Primary — the input that decides when there is an output<br />
        <select value={String(primary)} aria-label="Primary input"
                onChange={(e) => patch(node.id, { primary: Number(e.target.value) })}
                style={{ width: '100%' }}>
          {inputs.map((i) => <option key={i} value={i}>{nameOf(i)}</option>)}
        </select></label>
      <div style={{ color: '#666', whiteSpace: 'normal', fontSize: 11 }}>
        Where the primary has no value there is no row at all. That is the opposite of
        Combine, which keeps a sample when only some inputs have a value — and it is the
        point: the primary is the thing being asked about.
      </div>

      <label>Fetch<br />
        <select value={node.correlation ?? 'PREVIOUS'} aria-label="Correlation"
                onChange={(e) => patch(node.id, { correlation: e.target.value })}
                style={{ width: '100%' }}>
          {CORRELATIONS.map((c) => (
            <option key={c} value={c}>{c.replace(/_/g, ' ').toLowerCase()}</option>
          ))}
        </select></label>

      <label>…of this column of {secondary == null ? 'the other input' : nameOf(secondary)}<br />
        <select value={node.column ?? ''} aria-label="Column to fetch"
                onChange={(e) => patch(node.id, { column: e.target.value || null })}
                style={{ width: '100%', fontFamily: 'monospace' }}>
          <option value="">{secCols.length === 1 ? secCols[0] : '(pick one)'}</option>
          {secCols.map((c) => <option key={c} value={c}>{c}</option>)}
        </select></label>

      <label>Within (ms) — optional<br />
        <input value={node.withinMs ?? ''} inputMode="numeric"
               aria-label="Within milliseconds"
               placeholder="no bound"
               onChange={(e) => patch(node.id, {
                 withinMs: e.target.value.trim() === '' ? null : Number(e.target.value),
               })}
               style={{ width: '100%', fontFamily: 'monospace' }} /></label>
      <div style={{ color: '#666', whiteSpace: 'normal', fontSize: 11 }}>
        Ours, not the reference&rsquo;s. Left empty, &ldquo;just before&rdquo; can reach
        back across a whole drive and answer with a value from twenty minutes earlier —
        true, and useless. With a bound, a value further away than that is dropped rather
        than reported as if it were near.
      </div>

      <label>Output column name (AS)<br />
        <input value={node.as ?? ''}
               onChange={(e) => patch(node.id, { as: e.target.value.toUpperCase() || null })}
               placeholder={`${(node.correlation ?? 'PREVIOUS') === 'PREVIOUS' ? 'PREV'
                 : (node.correlation ?? '') === 'CURRENT' ? 'CURR'
                 : (node.correlation ?? '') === 'NEXT' ? 'NEXT'
                 : (node.correlation ?? '') === 'PREVIOUS_OR_CURRENT' ? 'PREV_OR_CURR'
                 : 'NEXT_OR_CURR'}_${node.column ?? secCols[0] ?? 'VALUE'}`}
               style={{ width: '100%', fontFamily: 'monospace' }} /></label>
    </div>
  )
}

/** The ladder cap, matching KpiGraph.MAX_LADDER_STATES. */
const MAX_LADDER_STATES = 4

/** Matches KpiGraph.LADDER_VERSION: the version in which State machine became a ladder. */
const GRAPH_VERSION = 2

/**
 * The state machine's inspector: an ordered ladder, edited as one.
 *
 * The order IS the semantics - state k can be entered only from state k-1 - so it has to
 * be visible and movable rather than implied by the order rows happened to be added in.
 * The three sentences under the list are the node's real limits, and they are always on
 * screen rather than in a tooltip, because each one is a case where a user would
 * otherwise read an absent value as a bug.
 */
function LadderEditor({ node, patch }: {
  node: GraphNode
  patch: (id: number, p: Partial<GraphNode>) => void
}) {
  const states = node.states ?? []
  const set = (next: typeof states) => patch(node.id, { states: next })
  const edit = (i: number, p: Partial<GraphStateRule>) =>
    set(states.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const move = (i: number, by: number) => {
    const j = i + by
    if (j < 1 || j >= states.length) return   // row 0 is the initial state and stays
    const next = [...states]
    ;[next[i], next[j]] = [next[j], next[i]]
    set(next)
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {states.map((st, i) => (
        <div key={i} style={{ display: 'grid', gap: 3 }}>
          <div style={{ color: '#666', fontSize: 11 }}>
            {i === 0 ? 'Initial state — return here when:' : 'Then enter when:'}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={st.state} placeholder={i === 0 ? 'IDLE' : 'STATE_NAME'}
                   aria-label={`State ${i + 1} name`}
                   onChange={(e) => edit(i, { state: e.target.value.toUpperCase() })}
                   style={{ width: 140, fontFamily: 'monospace' }} />
            <input value={st.condition} placeholder="DL_BLER > 10"
                   aria-label={`State ${i + 1} condition`}
                   onChange={(e) => edit(i, { condition: e.target.value })}
                   style={{ flex: 1, fontFamily: 'monospace' }} />
            {i > 0 && (
              <>
                <button title="Earlier in the ladder" aria-label={`Move ${st.state} up`}
                        disabled={i <= 1} onClick={() => move(i, -1)}>↑</button>
                <button title="Later in the ladder" aria-label={`Move ${st.state} down`}
                        disabled={i >= states.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button aria-label={`Remove ${st.state}`}
                        disabled={states.length <= 2}
                        onClick={() => set(states.filter((_, j) => j !== i))}>&times;</button>
              </>
            )}
          </div>
          {i === 0 && (
            <div style={{ color: '#666', whiteSpace: 'normal', fontSize: 11 }}>
              This is the only way back, and it is what ends a measurement.
            </div>
          )}
          {i > 0 && (
            <div style={{ color: '#888', fontSize: 11 }}>
              publishes the column <code>{st.state || '…'}</code>
            </div>
          )}
        </div>
      ))}
      <div>
        <button disabled={states.length >= MAX_LADDER_STATES}
                title={states.length >= MAX_LADDER_STATES
                  ? 'Four states is the cap: each one adds two levels to the compiled query.'
                  : 'Add a state below the last one'}
                onClick={() => set([...states, { state: '', condition: '' }])}>+ state</button>
      </div>
      <div style={{ color: '#666', whiteSpace: 'normal' }}>
        Each state can be entered only from the one above it. There is no transition that
        skips one, and no way back other than the initial state&rsquo;s condition.
        There is no time trigger: a transition fires on a condition, never on a condition
        failing to hold for N milliseconds.
      </div>
      <div style={{ color: '#666', whiteSpace: 'normal' }}>
        A state entered and left within one sample is not measured. A state whose end falls
        after a logger gap, a bad position fix, or the end of the drive is not measured
        either &mdash; it contributes no value rather than a shortened one.
      </div>
    </div>
  )
}

export function KpiWorkbench({ defs, onChanged, eventTypes = [], sessionId = null }: {
  defs: KpiDefinition[]
  onChanged: () => void
  /** The event registry, so the canvas names an event the way every other screen does. */
  eventTypes?: EventType[]
  /** Which measurement a preview reads. Null previews across every session. */
  sessionId?: number | null
}) {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [wiringFrom, setWiringFrom] = useState<number | null>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [validation, setValidation] = useState<GraphValidation | null>(null)
  const [stored, setStored] = useState<StoredGraph[]>([])
  const [preview, setPreview] = useState<GraphNodePreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const [kpiName, setKpiName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [unit, setUnit] = useState('')

  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null)

  // Always the current version. A document the editor produced is by definition one the
  // editor's own meanings apply to; the number exists to refuse the ones it did not.
  const spec: GraphSpec = useMemo(
    () => ({ version: GRAPH_VERSION, nodes, edges }), [nodes, edges])

  const reloadStored = useCallback(() => {
    api.kpiGraphs().then(setStored).catch(() => setStored([]))
  }, [])
  useEffect(reloadStored, [reloadStored])

  // Validated on every change, so the editor reports a cycle or a missing input while the
  // graph is being drawn rather than when the author finally tries to save it. The backend
  // answers a failed compile with the reason rather than an error status, because during
  // editing an invalid graph is the normal state.
  useEffect(() => {
    if (nodes.length === 0) { setValidation(null); return }
    let live = true
    const t = setTimeout(() => {
      api.validateKpiGraph({ name: kpiName, output: null, spec })
        .then((v) => { if (live) setValidation(v) })
        .catch(() => { if (live) setValidation(null) })
    }, 200)
    return () => { live = false; clearTimeout(t) }
  }, [spec, nodes.length, kpiName])

  const addNode = (kind: GraphNodeKind) => {
    const id = freshId(nodes)
    // Placed on its kind's row, beside whatever is already there, so a graph assembled by
    // clicking the palette in any order still comes out reading top-down.
    const tier = TIER[kind]
    const onTier = nodes.filter((n) => TIER[n.kind] === tier).length
    setNodes((ns) => [...ns, {
      id, kind, label: KIND_INFO[kind].label,
      x: 40 + onTier * (NODE_W + 40),
      y: 24 + tier * (NODE_H + 56),
      kpiName: kind === 'SOURCE_KPI' ? (defs[0]?.name ?? null) : null,
      rank: kind === 'SOURCE_NEIGHBOUR' ? 1 : null,
      field: kind === 'SOURCE_SAMPLE' ? 'SPEED_KMH' : null,
      eventType: kind === 'SOURCE_EVENT' ? 'HANDOVER' : null,
      metric: kind === 'SOURCE_NEIGHBOUR' ? 'RSRP' : null,
      excludeServing: kind === 'SOURCE_NEIGHBOUR' ? true : null,
      expression: null, as: null,
      // A ladder opens with its two mandatory rows rather than an empty list: an empty
      // one would put the author in front of a node whose first error is that it has no
      // states, when what it actually needs is an idle state and one to measure.
      states: kind === 'CLASSIFIER' ? []
        : kind === 'STATE_MACHINE' ? [{ state: 'IDLE', condition: '' },
                                      { state: '', condition: '' }]
        : null,
      column: null,
    }])
    setSelected(id)
  }

  const patch = (id: number, p: Partial<GraphNode>) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...p } : n)))

  const removeNode = (id: number) => {
    setNodes((ns) => ns.filter((n) => n.id !== id))
    setEdges((es) => es.filter((e) => e.from !== id && e.to !== id))
    setSelected((s) => (s === id ? null : s))
  }

  const toLocal = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toLocal(e)
    if (wiringFrom != null) setPointer(p)
    if (drag.current) {
      const { id, dx, dy } = drag.current
      patch(id, { x: Math.max(0, p.x - dx), y: Math.max(0, p.y - dy) })
    }
  }

  const startWire = (from: number) => { setWiringFrom(from); setSelected(from) }

  const finishWire = (to: number) => {
    if (wiringFrom == null || wiringFrom === to) { setWiringFrom(null); return }
    setEdges((es) => (es.some((e) => e.from === wiringFrom && e.to === to)
      ? es : [...es, { from: wiringFrom, to }]))
    setWiringFrom(null)
    setPointer(null)
  }

  const save = async () => {
    setBusy(true); setSaveError(null); setResult(null)
    try {
      const g = await api.saveKpiGraph({
        name: displayName || kpiName,
        output: {
          name: kpiName, displayName: displayName || kpiName, unit,
          category: 'Workbench', technology: '5G NR',
          // NEUTRAL because a graph's direction is the author's to state, and guessing it
          // would make the tool assert good and bad about a quantity it cannot judge.
          direction: 'NEUTRAL', source: 'UE', decimals: 2,
          description: `KPI Workbench graph: ${nodes.length} nodes`,
          // Null on purpose: a graph KPI is defined by its document, not by a formula.
          // Filling both would leave two definitions of one KPI that could disagree.
          expression: null,
        },
        spec,
      })
      setResult(`${g.outputKpiName}: ${g.valuesComputed} values computed`)
      reloadStored(); onChanged()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const load = (g: StoredGraph) => {
    setNodes(g.spec.nodes); setEdges(g.spec.edges ?? [])
    setKpiName(g.outputKpiName); setDisplayName(g.name); setSelected(null)
    setResult(null); setSaveError(null)
  }

  /**
   * Recompute one saved graph against the data as it is now.
   *
   * A graph KPI's values are a SNAPSHOT - computed when the graph is saved, and again
   * when an import brings in a drive - and this screen says so. Saying so without
   * offering a way to refresh one made the statement a dead end: the only way to
   * recompute a graph you had not edited was to open it and press Save, which also
   * rewrites the stored document. The endpoint existed all along and nothing called it.
   */
  const recompute = async (g: StoredGraph) => {
    setBusy(true); setSaveError(null)
    try {
      const r = await api.recomputeKpiGraph(g.id)
      setResult(`${g.outputKpiName}: ${r.valuesComputed} values computed`)
      reloadStored(); onChanged()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const remove = async (g: StoredGraph) => {
    setBusy(true)
    try { await api.deleteKpiGraph(g.id); reloadStored(); onChanged() }
    catch (e) { setSaveError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const sel = nodes.find((n) => n.id === selected) ?? null
  const canvasH = Math.max(360, ...nodes.map((n) => n.y + NODE_H + 60))
  const canvasW = Math.max(760, ...nodes.map((n) => n.x + NODE_W + 40))

  return (
    <>
      <div className="panel">
        <header>
          <span className="title">KPI Workbench</span>
          <span className="meta">{nodes.length} nodes · {edges.length} edges</span>
          <span className="wb-palette" style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {(Object.keys(KIND_INFO) as GraphNodeKind[]).map((k) => (
              <button key={k} onClick={() => addNode(k)} title={KIND_INFO[k].hint}>
                + {KIND_INFO[k].label}
              </button>
            ))}
          </span>
        </header>

        <div style={{ padding: '8px 10px', color: '#666', whiteSpace: 'normal' }}>
          A KPI built by wiring nodes: sources feed a combine, arithmetic and a state
          machine, and one output column becomes the KPI. Drag a node to move it; drag from
          the dot on its <b>bottom</b> edge to the dot on another node&rsquo;s <b>top</b>{' '}
          edge to wire them. Rows are ordered by sample throughout, so there is no sort
          node &mdash; a control that did nothing would be worse than its absence.
        </div>

        <div style={{ overflow: 'auto', background: '#fff', borderTop: '1px solid #e0e0e6' }}>
          <svg ref={svgRef} width={canvasW} height={canvasH}
               style={{ userSelect: 'none' }}
               role="application" aria-label="KPI graph canvas"
               onPointerMove={onPointerMove}
               onPointerUp={() => { drag.current = null }}
               onPointerLeave={() => { drag.current = null }}
               onClick={(e) => { if (e.target === svgRef.current) { setSelected(null); setWiringFrom(null) } }}>
            <defs>
              <marker id="wb-arrow" viewBox="0 0 8 8" refX="7" refY="4"
                      markerWidth="7" markerHeight="7" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="#1f7a1f" />
              </marker>
            </defs>

            {edges.map((e) => {
              const a = nodes.find((n) => n.id === e.from)
              const b = nodes.find((n) => n.id === e.to)
              if (!a || !b) return null
              return (
                <path key={`${e.from}-${e.to}`} d={edgePath(a, b)}
                      fill="none" stroke="#1f7a1f" strokeWidth={1.5}
                      markerEnd="url(#wb-arrow)"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setEdges((es) =>
                        es.filter((x) => !(x.from === e.from && x.to === e.to)))}>
                  <title>Click to remove this connection</title>
                </path>
              )
            })}

            {wiringFrom != null && pointer && (() => {
              const a = nodes.find((n) => n.id === wiringFrom)
              if (!a) return null
              return <line x1={a.x + NODE_W / 2} y1={a.y + NODE_H}
                           x2={pointer.x} y2={pointer.y}
                           stroke="#1f7a1f" strokeWidth={1.5} strokeDasharray="4 3" />
            })()}

            {nodes.map((n) => (
              <g key={n.id} className="wb-node" transform={`translate(${n.x} ${n.y})`}>
                <rect width={NODE_W} height={NODE_H} rx={2}
                      fill={n.id === selected ? '#eef7ee' : '#f6f6f4'}
                      stroke="#1f7a1f" strokeWidth={n.id === selected ? 2 : 1.5}
                      style={{ cursor: 'move' }}
                      onPointerDown={(e) => {
                        const p = toLocal(e)
                        drag.current = { id: n.id, dx: p.x - n.x, dy: p.y - n.y }
                        setSelected(n.id)
                      }} />
                <text x={7} y={17} fontSize="11" fontWeight={600}
                      style={{ pointerEvents: 'none' }}>
                  {KIND_INFO[n.kind].label}
                </text>
                <text x={7} y={32} fontSize="10" fill="#555"
                      style={{ pointerEvents: 'none' }}>
                  {detailOf(n).slice(0, 30)}
                </text>

                {/* Input port on the top edge, output on the bottom - the reference's
                    layout, and the reason its graphs read top-down. */}
                {n.kind !== 'SOURCE_KPI' && n.kind !== 'SOURCE_NEIGHBOUR' && (
                  <circle cx={NODE_W / 2} cy={0} r={PORT_R} fill="#1f7a1f"
                          style={{ cursor: 'crosshair' }}
                          onPointerUp={() => finishWire(n.id)}>
                    <title>Input — drop a connection here</title>
                  </circle>
                )}
                {n.kind !== 'OUTPUT' && (
                  <circle cx={NODE_W / 2} cy={NODE_H} r={PORT_R} fill="#1f7a1f"
                          style={{ cursor: 'crosshair' }}
                          onPointerDown={(e) => { e.stopPropagation(); startWire(n.id) }}>
                    <title>Output — drag from here to wire</title>
                  </circle>
                )}
              </g>
            ))}
          </svg>
        </div>

        {/* The validation report is always visible rather than appearing only on failure:
            a graph that is silently invalid until save is a graph the author debugs by
            guessing. */}
        <div style={{
          padding: '6px 10px', borderTop: '1px solid #e0e0e6',
          background: validation?.ok ? '#f2f8f2' : '#fdf4f4', whiteSpace: 'normal',
        }}>
          {validation == null ? <span style={{ color: '#666' }}>Add a node to begin.</span>
            : validation.ok ? (
              <span style={{ color: '#147a14' }}>
                Valid. {validation.outputIsDuration
                  ? <>Publishes <b>{validation.outputColumn}</b> as a duration in
                      milliseconds, one value at the sample where the state began</>
                  : <>Output column <b>{validation.outputColumn}</b></>}
                {validation.referencedKpis.length > 0
                  && ` · reads ${validation.referencedKpis.join(', ')}`}
                {validation.readsNeighbours && ' · reads the monitored set'}
              </span>
            ) : <span style={{ color: '#b00020' }}>{validation.error}</span>}
        </div>
      </div>

      <div className="panels">
        <div className="panel">
          <header><span className="title">Node</span></header>
          {!sel ? (
            <div style={{ padding: 10, color: '#666' }}>Select a node to edit it.</div>
          ) : (
            <div style={{ padding: 10, display: 'grid', gap: 8 }}>
              <div style={{ color: '#666', whiteSpace: 'normal' }}>
                <b>{KIND_INFO[sel.kind].label}</b> — {KIND_INFO[sel.kind].hint}{' '}
                <span style={{ color: '#999' }}>({KIND_INFO[sel.kind].inputs})</span>
              </div>

              {sel.kind === 'SOURCE_KPI' && (
                <label>KPI<br />
                  <select value={sel.kpiName ?? ''}
                          onChange={(e) => patch(sel.id, { kpiName: e.target.value })}
                          style={{ width: '100%' }}>
                    <option value="">(pick one)</option>
                    {defs.map((d) => (
                      <option key={d.name} value={d.name}>{d.displayName}</option>
                    ))}
                  </select></label>
              )}

              {sel.kind === 'SOURCE_NEIGHBOUR' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ flex: 1 }}>Quantity<br />
                    <select value={sel.metric ?? 'RSRP'}
                            onChange={(e) => patch(sel.id, { metric: e.target.value })}
                            style={{ width: '100%' }}>
                      <option value="RSRP">RSRP</option>
                      <option value="RSRQ">RSRQ</option>
                    </select></label>
                  <label style={{ width: 90 }}>Rank<br />
                    <input type="number" min={1} max={8} value={sel.rank ?? 1}
                           onChange={(e) => patch(sel.id, { rank: Number(e.target.value) })}
                           style={{ width: '100%' }} /></label>
                  <label style={{ flex: 1, alignSelf: 'end' }}>
                    <input type="checkbox" checked={sel.excludeServing ?? true}
                           onChange={(e) => patch(sel.id, { excludeServing: e.target.checked })} />
                    {' '}exclude serving</label>
                </div>
              )}

              {sel.kind === 'SOURCE_SAMPLE' && (
                <label>Field<br />
                  <select value={sel.field ?? 'SPEED_KMH'}
                          onChange={(e) => patch(sel.id, { field: e.target.value })}
                          style={{ width: '100%' }}>
                    {SAMPLE_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select></label>
              )}

              {sel.kind === 'SOURCE_EVENT' && (
                <label>Event type<br />
                  {/* From the registry, so the canvas and the map cannot disagree about
                      what an event type is called. Blank means any type. */}
                  <select value={sel.eventType ?? ''}
                          onChange={(e) => patch(sel.id, { eventType: e.target.value || null })}
                          style={{ width: '100%' }}>
                    <option value="">(any event)</option>
                    {eventTypes.map((t) => (
                      <option key={t.name} value={t.name}>{t.displayName}</option>
                    ))}
                  </select></label>
              )}

              {(sel.kind === 'EXPRESSION' || sel.kind === 'FILTER') && (
                <label>{sel.kind === 'FILTER' ? 'Condition' : 'Formula'}<br />
                  <input value={sel.expression ?? ''}
                         onChange={(e) => patch(sel.id, { expression: e.target.value })}
                         placeholder={sel.kind === 'FILTER'
                           ? 'RSRP >= -110 AND SINR > 0' : 'RSRP - SINR'}
                         style={{ width: '100%', fontFamily: 'monospace' }} /></label>
              )}

              {(sel.kind === 'EXPRESSION' || sel.kind === 'SOURCE_KPI'
                || sel.kind === 'SOURCE_NEIGHBOUR' || sel.kind === 'SOURCE_SAMPLE'
                || sel.kind === 'SOURCE_EVENT' || sel.kind === 'CLASSIFIER') && (
                <label>Output column name (AS)<br />
                  <input value={sel.as ?? ''}
                         onChange={(e) => patch(sel.id, { as: e.target.value.toUpperCase() })}
                         placeholder="defaults from the node"
                         style={{ width: '100%', fontFamily: 'monospace' }} /></label>
              )}

              {/* Look at what this node produces, publishing nothing.
                  The alternative was: invent a KPI name, publish it - which writes rows
                  for every session and adds an entry everyone sees to the shared
                  catalogue - look at it on another screen, come back, delete it. Done on
                  every guess, by whoever was least sure. */}
              <div className="node-preview">
                <button disabled={previewing} onClick={async () => {
                  setPreviewing(true); setPreviewError(null); setPreview(null)
                  try {
                    setPreview(await api.previewGraphNode({
                      name: displayName || kpiName,
                      output: {
                        name: kpiName, displayName: displayName || kpiName, unit,
                        category: 'Workbench', technology: '5G NR',
                        direction: 'HIGHER_IS_BETTER', source: 'UE', decimals: 2,
                        description: null, expression: null,
                      },
                      spec,
                    }, sel.id, sessionId))
                  } catch (e) {
                    setPreviewError(e instanceof Error ? e.message : String(e))
                  } finally { setPreviewing(false) }
                }}>{previewing ? 'Running…' : 'Preview this node'}</button>
                {previewError && <div className="error">{previewError}</div>}
                {preview && preview.nodeId === sel.id && (
                  <>
                    {/* The count is over the whole node. "3 rows" and "the first 3 of
                        41 000" are different answers to "did my join do what I meant",
                        and the page alone cannot tell them apart. */}
                    <div className="preview-count">
                      <b>{preview.rowCount.toLocaleString()}</b> rows
                      {sessionId != null && ' in this measurement'}
                      {preview.rowCount === 0 && ' — this node produces nothing'}
                    </div>
                    {preview.rows.length > 0 && (
                      <table className="grid">
                        <thead>
                          <tr><th className="num">seq</th>
                            {preview.columns.map((c) => <th key={c} className="num">{c}</th>)}</tr>
                        </thead>
                        <tbody>
                          {preview.rows.map((r) => (
                            <tr key={`${r.sessionId}-${r.seq}`}>
                              <td className="num">{r.seq}</td>
                              {preview.columns.map((c) => (
                                <td key={c} className="num">
                                  {r.values[c] == null ? '—' : String(r.values[c])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>

              {sel.kind === 'CLASSIFIER' && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ color: '#666', whiteSpace: 'normal' }}>
                    The first state whose condition holds wins. States become the numbers
                    1, 2, 3&hellip; in this order, because a KPI value is a number. The
                    names stay here on the canvas &mdash; a published classifier charts
                    as 1, 2, 3, so note which is which before you leave this pane.
                    A sample no condition claims &mdash; including one where a condition
                    reads a column that has no value there, such as an event column
                    between events &mdash; gets no state and drops out of the result.
                  </div>
                  {(sel.states ?? []).map((st, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6 }}>
                      <input value={st.state} placeholder="STATE_NAME"
                             onChange={(e) => patch(sel.id, {
                               states: (sel.states ?? []).map((x, j) =>
                                 j === i ? { ...x, state: e.target.value.toUpperCase() } : x),
                             })}
                             style={{ width: 150, fontFamily: 'monospace' }} />
                      <input value={st.condition} placeholder="DL_BLER > 10"
                             onChange={(e) => patch(sel.id, {
                               states: (sel.states ?? []).map((x, j) =>
                                 j === i ? { ...x, condition: e.target.value } : x),
                             })}
                             style={{ flex: 1, fontFamily: 'monospace' }} />
                      <button onClick={() => patch(sel.id, {
                        states: (sel.states ?? []).filter((_, j) => j !== i),
                      })}>&times;</button>
                    </div>
                  ))}
                  <div>
                    <button onClick={() => patch(sel.id, {
                      states: [...(sel.states ?? []), { state: '', condition: '' }],
                    })}>+ state</button>
                  </div>
                </div>
              )}

              {sel.kind === 'STATE_MACHINE' && <LadderEditor node={sel} patch={patch} />}

              {sel.kind === 'CORRELATE' && (
                <CorrelateEditor node={sel} patch={patch} nodes={nodes} edges={edges}
                                 columnsOf={(id) => validation?.columnsByNode?.[String(id)] ?? []} />
              )}

              {sel.kind === 'OUTPUT' && (
                <label>Column to publish<br />
                  <input value={sel.column ?? ''}
                         onChange={(e) => patch(sel.id, { column: e.target.value.toUpperCase() })}
                         placeholder="required when the input has more than one column"
                         style={{ width: '100%', fontFamily: 'monospace' }} /></label>
              )}

              <div><button onClick={() => removeNode(sel.id)}>Delete node</button></div>
            </div>
          )}
        </div>

        <div className="panel">
          <header><span className="title">Publish as a KPI</span></header>
          <div style={{ padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1 }}>KPI name<br />
                <input value={kpiName}
                       onChange={(e) => setKpiName(e.target.value.toUpperCase())}
                       placeholder="RSRP_MARGIN" style={{ width: '100%' }} /></label>
              <label style={{ flex: 1 }}>Display name<br />
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                       placeholder="defaults to the name" style={{ width: '100%' }} /></label>
              <label style={{ width: 90 }}>Unit<br />
                {/* A duration's unit is not the author's to choose. Left editable, a
                    dwell could be published as "dB" and every screen would then colour
                    milliseconds on a signal-level scale. */}
                {validation?.outputIsDuration
                  ? <div title="A duration's unit is not the author's to choose."
                         style={{ padding: '3px 0', fontFamily: 'monospace' }}>ms</div>
                  : <input value={unit} onChange={(e) => setUnit(e.target.value)}
                           placeholder="dB" style={{ width: '100%' }} />}</label>
            </div>
            <div style={{ color: '#666', whiteSpace: 'normal' }}>
              Values are computed now and again on import, not on every read, so a graph
              KPI behaves like every other KPI everywhere else in the tool &mdash; coloured,
              binned, exported and reported by the same code.
              {validation?.outputIsDuration && ' Values are milliseconds at the sample where'
                + ' the state began, so this KPI is sparse: most samples have no value, and'
                + ' a mean over it is a mean of durations, not of samples.'}
            </div>
            <div>
              <button onClick={save}
                      disabled={busy || !kpiName || !validation?.ok}>
                {busy ? 'Computing…' : 'Save and compute'}
              </button>
            </div>
            {saveError && <div className="error">{saveError}</div>}
            {result && <div style={{ color: '#147a14' }}>{result}</div>}
          </div>

          {stored.length > 0 && (
            <table className="grid">
              <thead>
                <tr><th>Graph</th><th>KPI</th><th className="num">Nodes</th>
                  <th className="num">Values</th><th /></tr>
              </thead>
              <tbody>
                {stored.map((g) => (
                  <tr key={g.id}>
                    <td>{g.name}</td>
                    <td style={{ fontFamily: 'monospace' }}>{g.outputKpiName}</td>
                    <td className="num">{g.spec.nodes.length}</td>
                    <td className="num">{g.valuesComputed}</td>
                    <td>
                      <button disabled={busy} onClick={() => load(g)}>Open</button>{' '}
                      <button disabled={busy} onClick={() => recompute(g)}
                              title="Recompute this KPI against the measurements as they are now"
                      >Recompute</button>{' '}
                      <button disabled={busy} onClick={() => remove(g)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

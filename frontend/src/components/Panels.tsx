import { Fragment, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type {
  Degradation, Distribution, EventType, KpiDefinition, NetworkEvent, SignalingMessage, Snapshot,
} from '../api/types'
import type { LayerToggle, MapLayer } from '../view/maplayers'
import { UNIDENTIFIED } from '../view/paint'

/** Parameter grid: every KPI at the cursor, grouped by category. */
export function ParameterGrid({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot) return <div className="panel"><div className="loading">Loading…</div></div>
  return (
    <div className="panel grid-panel">
      <header>
        <span className="title">Parameters</span>
        <span className="meta">
          seq {snapshot.seq} · {new Date(snapshot.ts).toISOString().slice(11, 19)}
          {snapshot.servingPci != null && ` · PCI ${snapshot.servingPci}`}
        </span>
      </header>
      <table className="grid">
        <thead>
          <tr><th style={{ width: '46%' }}>Parameter</th><th className="num">Value</th>
            <th>Unit</th><th>Bin</th></tr>
        </thead>
        <tbody>
          {Object.entries(snapshot.byCategory).map(([cat, rows]) => (
            <Fragment key={cat}>
              <tr><td colSpan={4} style={{ background: '#f7f7fa', fontWeight: 600 }}>{cat}</td></tr>
              {rows.map((r) => (
                <tr key={r.kpi}>
                  <td>{r.displayName}</td>
                  <td className={`num sev-${r.severity}`}>
                    {r.value == null ? '-' : r.value.toFixed(r.decimals)}
                  </td>
                  <td>{r.unit}</td>
                  <td style={{ color: '#666' }}>{r.binLabel ?? '-'}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Colour legend. It carries sample count and share per bin, because in the
 * reference tool the legend is how you read the coverage distribution, not just
 * a key to the colours.
 *
 * The heading follows the reference tool's confirmed three-part form,
 * "RSCP (dBm) [Time]" - KPI, unit, and the basis the shares are weighted by.
 * Ours are weighted by sample, so it says so rather than borrowing "[Time]":
 * with an irregular log the two do differ, and the reader has to know which.
 */
export function LegendPanel({ dist, onEdit, isolate, onIsolate, weightedBy, onWeightedBy }: {
  dist: Distribution | null
  onEdit?: () => void
  /** The bin currently shown alone on the map, if any. */
  isolate?: string | null
  onIsolate?: (binLabel: string | null) => void
  /** What the shares are weighted by. The heading always says which. */
  weightedBy?: string
  onWeightedBy?: (v: string) => void
}) {
  if (!dist) return <div className="loading">Loading…</div>
  return (
    <div>
      {onEdit && (
        <button className="legend-edit" onClick={onEdit}
                title="Edit this KPI's colour scale">Edit scale</button>
      )}
      {onWeightedBy && (
        // The legend is where the stopped-vehicle bias is least suspected: a car held
        // ninety seconds in one bad spot puts ninety samples in the worst bin, and the
        // share reads as ninety samples' worth of bad coverage rather than one spot.
        <select className="legend-basis" value={weightedBy ?? 'SAMPLE'}
                aria-label="Legend weight by"
                title="Share of samples, or share of the ground covered"
                onChange={(e) => { onWeightedBy(e.target.value); e.currentTarget.blur() }}>
          <option value="SAMPLE">by sample</option>
          <option value="DISTANCE">by distance</option>
        </select>
      )}
      <div className="legend-row" style={{ fontWeight: 600, borderBottom: '1px solid #e2e2e8' }}>
        <span className="swatch" style={{ visibility: 'hidden' }} />
        <span className="label">
          {/* From the server, not typed here. The literal "[Sample]" lived in this one
              component while the statistics panel, the report and the CSV export - the
              same numbers, three more screens - explained nothing at all. */}
          {dist.displayName}{dist.unit ? ` (${dist.unit})` : ''} {dist.basisLabel}
        </span>
        <span className="count">n</span><span className="pct">%</span>
      </div>
      {dist.derived && (
        // An auto scale looks exactly like a configured one but means something
        // different: the colours rank this drive against itself, so the same value
        // in another drive can be a different colour. Say so, or the map is read as
        // an absolute judgement it is not making.
        <div className="legend-note" title="Quartiles of this session, rounded. Set fixed bins with Edit scale.">
          Auto scale &mdash; quartiles of this session, no pass/fail implied
        </div>
      )}
      {/* Clicking a bin shows it alone on the map. The legend was already the thing the
          user was reading the distribution off; making it the control as well removes the
          workaround this replaces - open the colour editor, paint every other bin grey,
          look, undo - which mutated the KPI's shared scale to ask a private question. */}
      {dist.bins.map((b) => (
        <div className={`legend-row${isolate === b.label ? ' isolated' : ''}`} key={b.label}
             onClick={onIsolate ? () => onIsolate(isolate === b.label ? null : b.label) : undefined}
             style={onIsolate ? { cursor: 'pointer' } : undefined}
             title={onIsolate
               ? (isolate === b.label ? 'Show the whole route again' : 'Show only this bin on the map')
               : undefined}>
          <span className="swatch" style={{ background: b.color }} />
          <span className="label">{b.label}</span>
          <span className="count">{b.count}</span>
          <span className="pct">{b.percentage.toFixed(2)}%</span>
        </div>
      ))}
      {/* Gated on onIsolate, not on isolate alone. The isolation survives a tab switch on
          purpose, so without this the notice followed the user onto screens that draw no
          route and told them the rest of it was greyed - over a table. The sentence is a
          claim about a picture, so it may only appear where the picture is. */}
      {isolate != null && onIsolate && (
        <div className="legend-note isolating">
          Showing <b>{isolate}</b> only &mdash; the rest is drawn grey for context, not
          hidden.
          <button onClick={() => onIsolate(null)}>Show all</button>
        </div>
      )}
      <div className="legend-row" style={{ borderTop: '1px solid #e2e2e8', color: '#666' }}>
        <span className="swatch" style={{ visibility: 'hidden' }} />
        <span className="label">Total</span>
        <span className="count">{dist.total}</span><span className="pct">100.00%</span>
      </div>
    </div>
  )
}

/**
 * The legend for identity colouring: which colour is which serving cell.
 *
 * Counts come from the server's own per-cell totals, not from the track this map drew.
 * The track is decimated above a few thousand points, so counting it would quietly report
 * a share of the DRAWN route as though it were a share of the drive - a number that is
 * wrong by more the longer the measurement, which is the worst direction for an error to
 * scale.
 */
export function PciLegend({ colors, bars, total }: {
  colors: Map<number, string>
  bars: { pci: number; samplesServing: number }[]
  total: number
}) {
  const rows = [...colors.entries()]
    .map(([pci, color]) => ({
      pci, color,
      serving: bars.find((b) => b.pci === pci)?.samplesServing ?? 0,
    }))
  const uncoloured = rows.filter((r) => r.color === UNIDENTIFIED).length
  return (
    <div>
      <div className="legend-row" style={{ fontWeight: 600, borderBottom: '1px solid #e2e2e8' }}>
        <span className="swatch" style={{ visibility: 'hidden' }} />
        <span className="label">Serving cell [Sample]</span>{/* sample-weighted by construction: one row per sample */}
        <span className="count">n</span><span className="pct">%</span>
      </div>
      {/* The same honesty the derived colour scale already owes: these colours are
          assigned in order of first appearance in THIS drive, so they identify cells
          within it and mean nothing across measurements. And unlike the KPI ramp they
          carry no verdict - a colour here is a name, not a grade. */}
      <div className="legend-note" title="Assigned in order of first appearance in this drive.">
        Identity colours &mdash; no pass/fail implied, and not comparable between drives
      </div>
      {rows.map((r) => (
        <div className="legend-row" key={r.pci}>
          <span className="swatch" style={{ background: r.color }} />
          <span className="label">PCI {r.pci}</span>
          <span className="count">{r.serving}</span>
          <span className="pct">
            {total > 0 ? ((100 * r.serving) / total).toFixed(2) : '0.00'}%
          </span>
        </div>
      ))}
      {uncoloured > 0 && (
        <div className="legend-note">
          {uncoloured} more cell{uncoloured === 1 ? '' : 's'} than the palette has colours
          &mdash; drawn grey rather than sharing a colour with another cell.
        </div>
      )}
    </div>
  )
}

/**
 * The string colour set: one colour per event NAME, edited where the events are read.
 *
 * The reference calls a scale keyed by a value RANGE a numerical colour set and one keyed
 * by a NAME a string colour set, and we only had the first. An event type's colour was
 * seeded and unchangeable, which matters more than it sounds: a team that has agreed
 * handovers are blue cannot make this tool agree, and every screenshot they paste into a
 * report then disagrees with every other tool they use.
 *
 * Placed in the Events dock rather than in a settings screen because the registry is the
 * one thing that reaches the map marker, the chart tick, this list and the problem pie at
 * once - so the change has to be made where its effect is visible, or a user cannot tell
 * whether it took.
 */
export function EventColourEditor({
  types, onRecoloured,
}: {
  types: Map<string, EventType>
  onRecoloured: (t: EventType) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="event-colours">
      {error && <div className="error" style={{ margin: '2px 0' }}>{error}</div>}
      <table className="grid">
        <tbody>
          {[...types.values()].map((t) => (
            <tr key={t.name}>
              <td style={{ width: 22 }}>
                <span className="ev-symbol" style={{ color: t.color }}>{t.symbol}</span>
              </td>
              <td>{t.displayName}</td>
              <td style={{ width: 34 }}>
                <input type="color" value={t.color} aria-label={`Colour for ${t.displayName}`}
                       disabled={busy === t.name}
                       // On change rather than on a Save button: there is one value, it is
                       // valid by construction, and a form around a single colour well is
                       // ceremony the reference does not ask for either.
                       onChange={(e) => {
                         const color = e.target.value
                         setBusy(t.name); setError(null)
                         api.recolourEventType(t.name, color)
                           .then(onRecoloured)
                           .catch((err: Error) => setError(err.message))
                           .finally(() => setBusy(null))
                       }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EventList({
  events, types, onPick,
}: {
  events: NetworkEvent[]
  types: Map<string, EventType>
  onPick: (seq: number) => void
}) {
  return (
    <table className="grid">
      <thead><tr><th>Time</th><th>Event</th><th>Detail</th></tr></thead>
      <tbody>
        {events.map((e) => {
          // Same glyph and same words as the map marker, the chart tick and the pie
          // slice. This row used to print the raw column, so one failure read as
          // RADIO_LINK_FAILURE here and "Radio link failure" two panels away.
          const t = types.get(e.eventType)
          return (
            <tr key={e.id} className="deg-row" onClick={() => onPick(e.seq)}>
              <td>{new Date(e.ts).toISOString().slice(11, 19)}</td>
              <td className={e.severity === 'CRITICAL' ? 'sev-CRITICAL'
                : e.severity === 'WARNING' ? 'sev-WARNING' : ''}>
                <span className="ev-symbol" style={{ color: t?.color }}>
                  {t?.symbol ?? '?'}
                </span>
                {t?.displayName ?? e.eventType}
              </td>
              <td style={{ whiteSpace: 'normal' }}>{e.detail}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/**
 * L3 / RRC message log, time-aligned to the shared cursor.
 *
 * The documented workflow in tools of this class is: find a failed KPI, then jump to
 * the signalling message that explains it. That only works if the message list follows
 * the cursor, so the row nearest the cursor is highlighted and scrolled into view, and
 * rows expand to show the message body.
 */
export function MessageList({
  messages, cursorTs,
}: { messages: SignalingMessage[]; cursorTs?: string | null }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const activeRef = useRef<HTMLTableRowElement>(null)

  // Nearest message at or before the cursor - what was last said on the link.
  let activeId: number | null = null
  if (cursorTs) {
    for (const m of messages) {
      if (m.ts <= cursorTs) activeId = m.id
      else break
    }
  }

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  if (messages.length === 0) {
    return <div className="loading">No signalling messages in this session.</div>
  }

  return (
    <table className="grid">
      <thead><tr><th>Time</th><th>Dir</th><th>Protocol</th><th>Message</th></tr></thead>
      <tbody>
        {messages.map((m) => (
          <Fragment key={m.id}>
            <tr ref={m.id === activeId ? activeRef : undefined}
                className="deg-row"
                style={m.id === activeId ? { background: '#fff3cd' } : undefined}
                onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
              <td>{new Date(m.ts).toISOString().slice(11, 23)}</td>
              <td>{m.direction}</td>
              <td>{m.protocol}{m.channel ? ` / ${m.channel}` : ''}</td>
              <td style={{ fontWeight: 600 }}>
                {expanded === m.id ? '▾' : '▸'} {m.messageName}
              </td>
            </tr>
            {expanded === m.id && (
              <tr>
                <td colSpan={4} style={{ background: '#fafafc', whiteSpace: 'pre-wrap',
                                         fontFamily: 'monospace', fontSize: 11, padding: 8 }}>
                  {m.body ?? '(no decoded content)'}
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

/** Degraded stretches found automatically, replacing a manual scan of the graph. */
export function DegradationPanel({
  items, unit, onPick,
}: { items: Degradation[]; unit: string; onPick: (seq: number) => void }) {
  if (items.length === 0) return <div className="loading">No degraded stretches found.</div>
  return (
    <table className="grid">
      <thead>
        <tr><th>Range</th><th className="num">Duration</th><th className="num">Worst</th>
          <th className="num">Mean</th><th>Severity</th><th className="num">Samples</th></tr>
      </thead>
      <tbody>
        {items.map((d, i) => (
          <tr key={i} className="deg-row" onClick={() => onPick(d.startSeq)}>
            <td>{new Date(d.startTs).toISOString().slice(11, 19)} –{' '}
              {new Date(d.endTs).toISOString().slice(11, 19)}</td>
            <td className="num">{d.durationSeconds}s</td>
            <td className={`num sev-${d.severity}`}>{d.worstValue} {unit}</td>
            <td className="num">{d.meanValue}</td>
            <td>{d.severity}</td>
            <td className="num">{d.sampleCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Parameter tree, with the search box the reference tool puts above it.
 *
 * The search is not a nicety at this scale. The reference documents 4000+ L1-L3 KPI
 * statistics and puts a search field at the top of the Parameters dock for exactly that
 * reason; a user who arrives knowing the parameter's name should never have to expand
 * categories to find it. Matching covers the display name, the internal name and the
 * category, because a user coming from the reference tool may know any of the three.
 */
export function ParameterTree({
  defs, active, onSelect,
}: { defs: KpiDefinition[]; active: string; onSelect: (name: string) => void }) {
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const matches = q
    ? defs.filter((d) =>
        d.displayName.toLowerCase().includes(q)
        || d.name.toLowerCase().includes(q)
        || d.category.toLowerCase().includes(q))
    : defs

  const byCat = matches.reduce<Record<string, KpiDefinition[]>>((acc, d) => {
    (acc[d.category] ??= []).push(d)
    return acc
  }, {})

  return (
    <div className="tree">
      <div className="tree-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search parameters"
          aria-label="Search parameters"
        />
        {q && (
          <button onClick={() => setQuery('')} title="Clear search" aria-label="Clear search">
            &times;
          </button>
        )}
      </div>
      {q && (
        <div className="tree-count">
          {matches.length} of {defs.length} parameters
        </div>
      )}
      {matches.length === 0
        ? <div className="tree-empty">No parameter matches &ldquo;{query}&rdquo;.</div>
        : Object.entries(byCat).map(([cat, list]) => (
          <div key={cat}>
            <div className="cat">{cat}</div>
            {list.map((d) => (
              <div key={d.name}
                   className={`kpi${d.name === active ? ' active' : ''}`}
                   onClick={() => onSelect(d.name)}
                   title={d.description ?? undefined}>
                <span>{d.displayName}</span>
                <span className="unit">{d.unit}</span>
              </div>
            ))}
          </div>
        ))}
    </div>
  )
}

/**
 * The Layers dock for a map: what is being drawn, and what can be taken away.
 *
 * Reads `describeLayers`, which reads the map's own contents - so a row here exists
 * because something is on the picture, not because a switch is set. Layers marked as
 * coming with the data have no checkbox: they are listed anyway, because the question this
 * dock exists to answer is "what am I looking at", and the overlays with no control were
 * exactly the ones nobody could account for.
 */
export function MapLayerDock({ layers, onToggle }: {
  layers: MapLayer[]
  onToggle: (t: LayerToggle) => void
}) {
  if (layers.length === 0) {
    return <div style={{ padding: 8, color: '#666' }}>Nothing drawn on the map.</div>
  }
  return (
    <div className="map-layers" style={{ padding: 6 }}>
      {layers.map((l) => (
        <div key={l.id} className="map-layer"
             style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
          <input type="checkbox" checked={l.drawn} readOnly={!l.toggle}
                 disabled={!l.toggle}
                 title={l.toggle
                   ? (l.drawn ? `Stop drawing ${l.label.toLowerCase()}`
                              : `Draw ${l.label.toLowerCase()} again`)
                   : 'Drawn because the measurement has it'}
                 onChange={() => l.toggle && onToggle(l.toggle)} />
          <span style={{
            width: 9, height: 9, borderRadius: 2, flex: '0 0 auto',
            background: l.swatch ?? 'transparent',
            border: l.swatch ? 'none' : '1px solid #c8c8d0',
            opacity: l.drawn ? 1 : 0.25,
          }} />
          <span style={{ flex: 1, opacity: l.drawn ? 1 : 0.5 }}>{l.label}</span>
          <span style={{ color: '#666' }}>{l.drawn ? l.count : 'off'}</span>
        </div>
      ))}
    </div>
  )
}

import { Fragment, useEffect, useRef, useState } from 'react'
import type {
  Degradation, Distribution, KpiDefinition, NetworkEvent, SignalingMessage, Snapshot,
} from '../api/types'

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
export function LegendPanel({ dist, onEdit }: {
  dist: Distribution | null
  onEdit?: () => void
}) {
  if (!dist) return <div className="loading">Loading…</div>
  return (
    <div>
      {onEdit && (
        <button className="legend-edit" onClick={onEdit}
                title="Edit this KPI's colour scale">Edit scale</button>
      )}
      <div className="legend-row" style={{ fontWeight: 600, borderBottom: '1px solid #e2e2e8' }}>
        <span className="swatch" style={{ visibility: 'hidden' }} />
        <span className="label">
          {dist.displayName}{dist.unit ? ` (${dist.unit})` : ''} [Sample]
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
      {dist.bins.map((b) => (
        <div className="legend-row" key={b.label}>
          <span className="swatch" style={{ background: b.color }} />
          <span className="label">{b.label}</span>
          <span className="count">{b.count}</span>
          <span className="pct">{b.percentage.toFixed(2)}%</span>
        </div>
      ))}
      <div className="legend-row" style={{ borderTop: '1px solid #e2e2e8', color: '#666' }}>
        <span className="swatch" style={{ visibility: 'hidden' }} />
        <span className="label">Total</span>
        <span className="count">{dist.total}</span><span className="pct">100.00%</span>
      </div>
    </div>
  )
}

export function EventList({
  events, onPick,
}: { events: NetworkEvent[]; onPick: (ts: string) => void }) {
  return (
    <table className="grid">
      <thead><tr><th>Time</th><th>Event</th><th>Detail</th></tr></thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id} className="deg-row" onClick={() => onPick(e.ts)}>
            <td>{new Date(e.ts).toISOString().slice(11, 19)}</td>
            <td className={e.severity === 'CRITICAL' ? 'sev-CRITICAL'
              : e.severity === 'WARNING' ? 'sev-WARNING' : ''}>{e.eventType}</td>
            <td style={{ whiteSpace: 'normal' }}>{e.detail}</td>
          </tr>
        ))}
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

export function ParameterTree({
  defs, active, onSelect,
}: { defs: KpiDefinition[]; active: string; onSelect: (name: string) => void }) {
  const byCat = defs.reduce<Record<string, KpiDefinition[]>>((acc, d) => {
    (acc[d.category] ??= []).push(d)
    return acc
  }, {})
  return (
    <div className="tree">
      {Object.entries(byCat).map(([cat, list]) => (
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

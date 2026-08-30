import { Fragment } from 'react'
import type {
  Degradation, Distribution, KpiDefinition, NetworkEvent, SignalingMessage, Snapshot,
} from '../api/types'

/** Parameter grid: every KPI at the cursor, grouped by category. */
export function ParameterGrid({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot) return <div className="panel"><div className="loading">불러오는 중…</div></div>
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
 */
export function LegendPanel({ dist }: { dist: Distribution | null }) {
  if (!dist) return <div className="loading">불러오는 중…</div>
  return (
    <div>
      <div className="legend-row" style={{ fontWeight: 600, borderBottom: '1px solid #e2e2e8' }}>
        <span className="swatch" style={{ visibility: 'hidden' }} />
        <span className="label">{dist.displayName} [{dist.unit}]</span>
        <span className="count">n</span><span className="pct">%</span>
      </div>
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
        <span className="label">합계</span>
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

export function MessageList({ messages }: { messages: SignalingMessage[] }) {
  return (
    <table className="grid">
      <thead><tr><th>Time</th><th>Dir</th><th>Protocol</th><th>Message</th><th>Body</th></tr></thead>
      <tbody>
        {messages.map((m) => (
          <tr key={m.id}>
            <td>{new Date(m.ts).toISOString().slice(11, 23)}</td>
            <td>{m.direction}</td>
            <td>{m.protocol}{m.channel ? ` / ${m.channel}` : ''}</td>
            <td style={{ fontWeight: 600 }}>{m.messageName}</td>
            <td style={{ whiteSpace: 'normal', color: '#666' }}>{m.body}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Degraded stretches found automatically, replacing a manual scan of the graph. */
export function DegradationPanel({
  items, unit, onPick,
}: { items: Degradation[]; unit: string; onPick: (seq: number) => void }) {
  if (items.length === 0) return <div className="loading">열화 구간이 없습니다.</div>
  return (
    <table className="grid">
      <thead>
        <tr><th>구간</th><th className="num">지속</th><th className="num">최악</th>
          <th className="num">평균</th><th>등급</th><th className="num">샘플</th></tr>
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

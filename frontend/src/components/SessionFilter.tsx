import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { SessionSummary } from '../api/types'

/**
 * Narrowing the measurement list.
 *
 * The picker is a flat dropdown of every measurement on the server, which is fine at four
 * and useless at four hundred - and a team doing weekly drives reaches four hundred inside
 * a year. This is the one screen whose content grows without bound.
 *
 * A dialog rather than more toolbar controls: the toolbar is a non-wrapping row with no
 * slack left at the viewport the checkers use, so adding five inputs there would push the
 * trailing ones off screen.
 *
 * Filtering is done by the server. "Fetch everything and hide most of it" stops working
 * long before the screen that shows it does.
 */
export function SessionFilter({ onPick, onClose }: {
  onPick: (id: number) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [device, setDevice] = useState('')
  const [operator, setOperator] = useState('')
  const [technology, setTechnology] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [facets, setFacets] = useState<{ device: string[]; operator: string[]; technology: string[] }>(
    { device: [], operator: [], technology: [] })
  const [rows, setRows] = useState<SessionSummary[] | null>(null)

  // The choices come from the data, so a filter can never offer a value that matches
  // nothing - which is the fastest way to make a user believe the search is broken.
  useEffect(() => { api.sessionFacets().then(setFacets).catch(() => {}) }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      api.sessionsFiltered({ q, device, operator, technology, from, to })
        .then(setRows).catch(() => setRows([]))
    }, 200)
    return () => clearTimeout(t)
  }, [q, device, operator, technology, from, to])

  const clear = () => {
    setQ(''); setDevice(''); setOperator(''); setTechnology(''); setFrom(''); setTo('')
  }
  const active = [q, device, operator, technology, from, to].filter(Boolean).length

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal session-filter" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <span className="title">Find a measurement</span>
          <button onClick={onClose}>Close</button>
        </header>
        <div className="filter-grid">
          <label>Search<br />
            <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search measurements"
                   placeholder="name, build or notes" /></label>
          <label>Device<br />
            <select value={device} aria-label="Filter device"
                    onChange={(e) => setDevice(e.target.value)}>
              <option value="">any</option>
              {facets.device.map((d) => <option key={d} value={d}>{d}</option>)}
            </select></label>
          <label>Operator<br />
            <select value={operator} aria-label="Filter operator"
                    onChange={(e) => setOperator(e.target.value)}>
              <option value="">any</option>
              {facets.operator.map((d) => <option key={d} value={d}>{d}</option>)}
            </select></label>
          <label>Technology<br />
            <select value={technology} aria-label="Filter technology"
                    onChange={(e) => setTechnology(e.target.value)}>
              <option value="">any</option>
              {facets.technology.map((d) => <option key={d} value={d}>{d}</option>)}
            </select></label>
          <label>From<br />
            <input type="date" value={from} aria-label="Filter from date"
                   onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<br />
            <input type="date" value={to} aria-label="Filter to date"
                   onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <div className="filter-summary">
          {rows == null ? 'Searching…' : (
            <>
              <b>{rows.length}</b> measurement{rows.length === 1 ? '' : 's'}
              {active > 0 && <> matching {active} filter{active === 1 ? '' : 's'}</>}
            </>
          )}
          {active > 0 && <button style={{ marginLeft: 'auto' }} onClick={clear}>Clear</button>}
        </div>
        <div className="filter-results">
          <table className="grid">
            <thead>
              <tr><th>Measurement</th><th>Build</th><th>Device</th><th>Started</th>
                <th className="num">Samples</th></tr>
            </thead>
            <tbody>
              {(rows ?? []).map((s) => (
                <tr key={s.id} className="deg-row" onClick={() => { onPick(s.id); onClose() }}>
                  <td>{s.name}</td>
                  <td>{s.buildLabel ?? '—'}</td>
                  <td>{s.device}</td>
                  <td>{new Date(s.startedAt).toISOString().slice(0, 10)}</td>
                  <td className="num">{s.sampleCount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows != null && rows.length === 0 && (
            // Named, not blank: an empty list under a filter the user has forgotten
            // setting reads as "there are no measurements".
            <div className="loading">
              Nothing matches those filters. {active > 0 && 'Clear them to see everything.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { CohortSet, KpiDefinition } from '../api/types'
import { CdfOverlay } from './CdfOverlay'
import { CohortStrip } from './CohortStrip'
import { seriesColor } from '../view/paint'

/**
 * One KPI over every drive in scope, grouped by a property the drives carry.
 *
 * The question `/compare` cannot answer. "Is 1.5.0 better than 1.4.2" is not about two
 * drives - a single pair could differ because one of them met a closed lane - so it has to
 * pool every drive of each build and it has to say what else varied. Both of those are
 * server-side (`CohortService`), for a reason worth stating here: a group's median cannot
 * be recomputed from its members' medians under any weighting, so a client that fetched
 * per-drive statistics and averaged them would print a defensible mean beside an invented
 * percentile.
 *
 * The scope is the measurement list's own narrowing, passed straight through, so "the
 * drives on screen" means the same thing on both tabs.
 */
export function CohortView({ defs, kpi, groupBy, holdConstant, onDimension, onKpi }: {
  defs: KpiDefinition[]
  kpi: string
  groupBy: string
  holdConstant: string | null
  /** Writes the axis and the held dimension back into the address bar. */
  onDimension: (by: string, hold: string | null) => void
  /** The KPI is shared view state that App owns, so a cohort link carries it like any other. */
  onKpi: (kpi: string) => void
}) {
  const [data, setData] = useState<CohortSet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  /**
   * Which measurements are in scope, with the measurement list's own vocabulary.
   *
   * Its own state rather than the `SessionFilter` modal's, because the two do different
   * jobs with the same words: that dialog finds ONE drive to open, and closing it is the
   * end of it. This shapes a SET and every number on the screen is read through it, so it
   * has to stay visible while the answer is being read - and it has to be here when the
   * server refuses nine groups and tells the reader to narrow.
   */
  const [narrowing, setNarrowing] = useState<{
    q: string; device: string; operator: string; technology: string; from: string; to: string
  }>({ q: '', device: '', operator: '', technology: '', from: '', to: '' })
  const [facets, setFacets] = useState<{ device: string[]; operator: string[]; technology: string[] }>(
    { device: [], operator: [], technology: [] })
  useEffect(() => { api.sessionFacets().then(setFacets).catch(() => {}) }, [])
  const narrow = (k: keyof typeof narrowing, v: string) =>
    setNarrowing((n) => ({ ...n, [k]: v }))
  /**
   * Sample weighting, with no control to change it.
   *
   * Not an oversight and not a simplification: distance weighting gives the sample after
   * a logger gap the whole unmeasured stretch's weight, which is a fair trade inside one
   * drive and a bias between two - the drive with the flakier logger wins. The server
   * refuses it here for that reason, so offering the choice would be offering an error.
   */
  const weightedBy = 'SAMPLE'

  useEffect(() => {
    setBusy(true); setError(null)
    // holdConstant null is "the server's choice", not "hold nothing" - the explicit
    // no-hold is the literal 'NONE', which is what the picker writes. A link that omits
    // it therefore arrives with the guard the server thinks that axis needs.
    api.cohorts({ kpi, groupBy, holdConstant: holdConstant ?? undefined,
                  weightedBy, ...narrowing })
      .then((d) => { setData(d); setError(null) })
      // The refusals this endpoint raises are the interesting part of it - "9 values are
      // in scope and at most 8 can be compared", "holding Scenario constant leaves no
      // value common to every group". Showing them verbatim rather than "failed to load"
      // is the difference between a screen that tells you how to ask a better question
      // and one that tells you it is broken.
      .catch((e) => { setError(String(e).replace(/^Error: \d+: /, '')); setData(null) })
      .finally(() => setBusy(false))
  }, [kpi, groupBy, holdConstant, weightedBy,
      narrowing.q, narrowing.device, narrowing.operator, narrowing.technology,
      narrowing.from, narrowing.to])

  const dims = data?.dimensions ?? []
  // What the server actually held, which is the honest thing to show selected: an absent
  // `hold` in the URL means "your choice", and the picker should say which choice that was.
  const resolvedHold = data?.holdConstant ?? (holdConstant ?? 'NONE')
  const shown = data?.cohorts ?? []
  const pickedCohort = shown.find((c) => c.value === picked) ?? null

  return (
    <div className="panels cohorts">
      <div className="panel">
        <header>
          <span className="title">Cohorts</span>
          <span className="meta">{data ? data.scopeNote : busy ? 'Loading…' : ''}</span>
        </header>
        <div className="cohort-controls">
          <label>Parameter&nbsp;
            <select value={kpi} aria-label="Cohort parameter"
                    onChange={(e) => { setPicked(null); onKpi(e.target.value) }}>
              {defs.map((d) => <option key={d.name} value={d.name}>{d.displayName}</option>)}
            </select>
          </label>
          <label>Group by&nbsp;
            <select value={groupBy} aria-label="Group by"
                    onChange={(e) => onDimension(e.target.value,
                      e.target.value === resolvedHold ? 'NONE' : resolvedHold)}>
              {(dims.length > 0 ? dims : FALLBACK_DIMS).map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}{'valueCount' in d ? ` (${d.valueCount})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>Hold constant&nbsp;
            <select value={resolvedHold} aria-label="Hold constant"
                    title="Without this there is a delta but no verdict: the groups may differ by more than the axis"
                    onChange={(e) => onDimension(groupBy, e.target.value)}>
              <option value="NONE">nothing (no verdict)</option>
              {(dims.length > 0 ? dims : FALLBACK_DIMS)
                .filter((d) => d.key !== groupBy)
                .map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </label>
        </div>
        {/* The scope, in the words the refusal uses. Nine groups on screen is an error
            that names these six parameters; they are here so that instruction is
            something the reader can carry out rather than something to read. */}
        <div className="cohort-scope">
          <label>Search&nbsp;
            <input value={narrowing.q} aria-label="Cohort search"
                   placeholder="name, build or notes"
                   onChange={(e) => narrow('q', e.target.value)} /></label>
          <label>Device&nbsp;
            <select value={narrowing.device} aria-label="Cohort device"
                    onChange={(e) => narrow('device', e.target.value)}>
              <option value="">any</option>
              {facets.device.map((d) => <option key={d} value={d}>{d}</option>)}
            </select></label>
          <label>Operator&nbsp;
            <select value={narrowing.operator} aria-label="Cohort operator"
                    onChange={(e) => narrow('operator', e.target.value)}>
              <option value="">any</option>
              {facets.operator.map((d) => <option key={d} value={d}>{d}</option>)}
            </select></label>
          <label>Technology&nbsp;
            <select value={narrowing.technology} aria-label="Cohort technology"
                    onChange={(e) => narrow('technology', e.target.value)}>
              <option value="">any</option>
              {facets.technology.map((d) => <option key={d} value={d}>{d}</option>)}
            </select></label>
          <label>From&nbsp;
            <input type="date" value={narrowing.from} aria-label="Cohort from date"
                   onChange={(e) => narrow('from', e.target.value)} /></label>
          <label>To&nbsp;
            <input type="date" value={narrowing.to} aria-label="Cohort to date"
                   onChange={(e) => narrow('to', e.target.value)} /></label>
        </div>
        {data?.verdictNote && <div className="basis-note">{data.verdictNote}</div>}
        {data && !data.verdictNote && (
          <div className="basis-note">
            Means and percentiles <b>{data.basisLabel}</b>. Better and worse are read
            against this parameter&rsquo;s own direction.
          </div>
        )}
      </div>

      {error && <div className="error cohort-error">{error}</div>}

      {data && shown.length > 0 && (
        <div className="panel">
          <header>
            <span className="title">{data.displayName} by {labelOf(dims, data.groupBy)}</span>
            <span className="meta">{shown.length} groups</span>
          </header>
          <CohortStrip cohorts={shown} unit={data.unit} decimals={data.decimals}
                       picked={picked} onPick={(v) => setPicked(v === picked ? null : v)} />
        </div>
      )}

      {data && shown.length > 0 && (
        <div className="panel">
          <header><span className="title">Groups</span></header>
          <table className="grid cohort-table">
            <thead>
              <tr>
                <th>{labelOf(dims, data.groupBy)}</th>
                <th className="num">Drives</th><th className="num">Samples</th>
                <th className="num">Mean</th><th className="num">p05</th>
                <th className="num">p50</th><th className="num">p95</th>
                <th className="num">Δ vs previous</th><th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.value} className="deg-row" data-bucket={c.value}
                    onClick={() => setPicked(c.value === picked ? null : c.value)}
                    style={c.value === picked ? { background: '#eef3fa' } : undefined}>
                  <td>{c.value}</td>
                  <td className="num">{c.driveCount}</td>
                  <td className="num">{c.sampleCount}</td>
                  <td className="num">{c.stats.mean ?? '—'}</td>
                  <td className="num">{c.stats.p05 ?? '—'}</td>
                  <td className="num">{c.stats.p50 ?? '—'}</td>
                  <td className="num">{c.stats.p95 ?? '—'}</td>
                  <td className="num">{c.deltaVsPrevious ?? '—'}</td>
                  {/* Blank rather than "SAME" when nothing is held: an absent verdict and
                      a verdict of no-difference are different answers. */}
                  <td className={`verdict-${(c.verdict ?? 'NO-VERDICT').replace(/ /g, '-')}`}>
                    {c.verdict ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pickedCohort && (
        <div className="panel">
          <header>
            <span className="title">Drives in {pickedCohort.value}</span>
            <span className="meta">
              each drive&rsquo;s own mean — the group&rsquo;s {pickedCohort.stats.mean ?? '—'} is
              none of them
            </span>
          </header>
          <table className="grid cohort-members">
            <thead>
              <tr>
                <th>Measurement</th><th>Started</th>
                {data?.holdConstant && <th>{labelOf(dims, data.holdConstant)}</th>}
                <th className="num">Mean</th><th className="num">Samples</th>
                <th className="num">Share</th>
              </tr>
            </thead>
            <tbody>
              {pickedCohort.members.map((m) => (
                <tr key={m.sessionId} data-session={m.sessionId}>
                  <td>{m.name}</td>
                  <td>{m.startedAt.slice(0, 10)}</td>
                  {data?.holdConstant && <td>{m.heldValue ?? '—'}</td>}
                  <td className="num">{m.mean ?? '—'}</td>
                  <td className="num">{m.sampleCount}</td>
                  <td className="num">{m.sharePct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && shown.length > 1 && (
        <CdfOverlay title={`${data.displayName} by ${labelOf(dims, data.groupBy)}`}
                    meta="one curve per group"
                    series={shown.map((c, i) => ({
                      label: c.value, cdf: c.stats.cdf, p50: c.stats.p50,
                      color: seriesColor(i),
                    }))} />
      )}

      {data && data.excluded.length > 0 && (
        <div className="panel">
          <header>
            <span className="title">Left out by the hold-constant guard</span>
            <span className="meta">{data.excluded.length} measurements</span>
          </header>
          {/* Named, never counted. A screen that says "3 excluded" has told the reader
              that its answer is incomplete and given them no way to judge how. */}
          <table className="grid cohort-excluded">
            <tbody>
              {data.excluded.map((e) => (
                <tr key={e.sessionId} data-session={e.sessionId}>
                  <td>{e.name}</td><td>{e.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Offered before the first response arrives, so the picker is never an empty list. */
const FALLBACK_DIMS = [
  { key: 'BUILD_LABEL', label: 'Build' },
  { key: 'SCENARIO', label: 'Scenario' },
  { key: 'DEVICE', label: 'Device' },
  { key: 'OPERATOR', label: 'Operator' },
  { key: 'TECHNOLOGY', label: 'Technology' },
  { key: 'LOCATION_NAME', label: 'Location' },
]

function labelOf(dims: Array<{ key: string; label: string }>, key: string | null): string {
  if (!key) return '—'
  return dims.find((d) => d.key === key)?.label
      ?? FALLBACK_DIMS.find((d) => d.key === key)?.label
      ?? key
}

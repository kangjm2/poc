import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { KpiDefinition, Threshold } from '../api/types'

/** The reference tool's four-colour ramp, measured from its own legend. */
const PALETTE = ['#009300', '#FFFF00', '#FF6820', '#FF0000', '#00FFFF', '#0000FF', '#B7B7B7']
const SEVERITIES = ['NORMAL', 'WARNING', 'CRITICAL'] as const

/**
 * Edits a KPI's colour scale.
 *
 * The scale is edited as a ladder of BOUNDARIES rather than as a list of intervals:
 * a bin's lower edge is the previous bin's upper edge, so the two can never drift
 * apart and no measured value can land outside every bin. The user changes the
 * numbers between the colours; the ends stay open at -infinity and +infinity.
 *
 * Labels are not edited here. The server derives them from the bounds in the
 * reference tool's own phrasing, which keeps an edited bin reading exactly like a
 * seeded one.
 */
export function LegendEditor({ def, proposed, onClose, onSaved }: {
  def: KpiDefinition
  /**
   * The bins currently painting the map when the KPI has none configured. Opening
   * the editor on an auto scale starts from what the user is already looking at,
   * so "Edit scale" means "pin these and adjust" rather than facing an empty form.
   */
  proposed?: Threshold[]
  onClose: () => void
  onSaved: (updated: KpiDefinition) => void
}) {
  const start = () => (def.thresholds.length ? def.thresholds : proposed ?? []).map((t) => ({ ...t }))
  const [bins, setBins] = useState<Threshold[]>(start)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setBins(start()) }, [def])

  // Boundaries are the editable numbers: bins.length - 1 of them, ascending.
  const boundaries = useMemo(
    () => bins.slice(0, -1).map((b) => b.upperBound as number),
    [bins],
  )

  const ascending = boundaries.every((v, i) => i === 0 || (v > boundaries[i - 1]))
  const complete = boundaries.every((v) => Number.isFinite(v))

  const setBoundary = (i: number, raw: string) => {
    const v = raw.trim() === '' ? Number.NaN : Number(raw)
    setBins((prev) => prev.map((b, j) => {
      if (j === i) return { ...b, upperBound: v }
      if (j === i + 1) return { ...b, lowerBound: v }
      return b
    }))
  }

  const setField = (i: number, patch: Partial<Threshold>) =>
    setBins((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)))

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      // Labels are left blank on purpose: the server regenerates them from the bounds.
      const updated = await api.saveThresholds(def.name, bins.map((b) => ({ ...b, label: '' })))
      onSaved(updated)
      onClose()
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    setError(null)
    try {
      const updated = await api.clearThresholds(def.name)
      onSaved(updated)
      onClose()
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    setBusy(true)
    setError(null)
    try {
      const updated = await api.resetThresholds(def.name)
      setBins(updated.thresholds.map((t) => ({ ...t })))
      onSaved(updated)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <span className="title">
            Colour scale &mdash; {def.displayName}{def.unit ? ` (${def.unit})` : ''}
          </span>
          <button onClick={onClose} aria-label="Close">✕</button>
        </header>

        <p className="modal-hint">
          Each row is one bin. The number between two rows is the boundary they share,
          so the scale always covers every value. Labels follow from the bounds.
          {def.thresholds.length === 0 && (
            <> <b>These start from the auto scale</b> &mdash; saving pins them, so the
            colours stop depending on this session&rsquo;s own distribution.</>
          )}
        </p>

        <table className="grid legend-editor">
          <thead>
            <tr><th>Colour</th><th>Severity</th><th className="num">Boundary{def.unit ? ` (${def.unit})` : ''}</th></tr>
          </thead>
          <tbody>
            {bins.map((b, i) => (
              <tr key={i}>
                <td>
                  <div className="swatch-row">
                    <input type="color" value={b.color}
                           aria-label={`Bin ${i + 1} colour`}
                           onChange={(e) => setField(i, { color: e.target.value.toUpperCase() })} />
                    {PALETTE.map((c) => (
                      <button key={c} className="swatch-pick" style={{ background: c }}
                              title={c} aria-label={`Set bin ${i + 1} to ${c}`}
                              onClick={() => setField(i, { color: c })} />
                    ))}
                  </div>
                </td>
                <td>
                  <select value={b.severity}
                          aria-label={`Bin ${i + 1} severity`}
                          onChange={(e) => setField(i, { severity: e.target.value })}>
                    {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="num">
                  {i < bins.length - 1 ? (
                    <input type="number" className="boundary"
                           aria-label={`Boundary below bin ${i + 1}`}
                           value={Number.isFinite(b.upperBound as number) ? String(b.upperBound) : ''}
                           onChange={(e) => setBoundary(i, e.target.value)} />
                  ) : <span className="dim">&mdash;</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="modal-preview">
          <b>Preview</b>
          {bins.map((b, i) => (
            <div className="legend-row" key={i}>
              <span className="swatch" style={{ background: b.color }} />
              <span className="label">{previewLabel(b, def.decimals)}</span>
              <span className="pct dim">{b.severity}</span>
            </div>
          ))}
        </div>

        {!ascending && <div className="error">Boundaries must increase down the list.</div>}
        {!complete && <div className="error">Every boundary needs a number.</div>}
        {error && <div className="error">{error}</div>}

        <footer>
          <button onClick={reset} disabled={busy}>Reset to default</button>
          {def.thresholds.length > 0 && (
            <button onClick={clear} disabled={busy}
                    title="Drop the fixed bins and colour by each session's own distribution">
              Use auto scale
            </button>
          )}
          <span className="spacer" />
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={save} disabled={busy || !ascending || !complete}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  )
}

/** Mirrors the server's label derivation so the preview matches what gets stored. */
function previewLabel(b: Threshold, decimals: number) {
  const n = (v: number) => {
    const s = v.toFixed(Math.max(0, decimals))
    return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
  }
  const lo = b.lowerBound
  const hi = b.upperBound
  if (lo == null && hi == null) return 'all'
  if (lo == null) return `< ${Number.isFinite(hi as number) ? n(hi as number) : '?'}`
  if (hi == null) return `>= ${Number.isFinite(lo) ? n(lo) : '?'}`
  return `< ${Number.isFinite(hi) ? n(hi) : '?'} and >= ${Number.isFinite(lo) ? n(lo) : '?'}`
}

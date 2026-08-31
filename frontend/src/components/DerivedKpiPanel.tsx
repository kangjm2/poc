import { useState } from 'react'
import { api } from '../api/client'
import type { KpiDefinition } from '../api/types'

/**
 * Define a KPI as a formula over other KPIs.
 *
 * This is NOT the reference tool's KPI Workbench, and the panel says so. The workbench is
 * a node-graph editor - sources, unions, sorts, a state machine feeding an output - and
 * this is arithmetic. Naming it a derived KPI keeps the claim honest while still covering
 * the case an engineer hits constantly: a ratio or a sum they want beside the measured
 * KPIs without writing SQL.
 *
 * The values are computed when the KPI is defined and again on import, not on every read,
 * so the panel says that too and offers Recompute rather than leaving a user to wonder
 * why a new session has no values for their formula.
 */
export function DerivedKpiPanel({ defs, onChanged }: {
  defs: KpiDefinition[]
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [unit, setUnit] = useState('')
  const [expression, setExpression] = useState('')
  const [decimals, setDecimals] = useState(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const derived = defs.filter((d) => d.expression)

  const submit = async () => {
    setBusy(true); setError(null); setResult(null)
    try {
      const r = await api.createDerivedKpi({
        name, displayName: displayName || name, unit,
        category: 'Derived', technology: '5G NR',
        // NEUTRAL because a formula's direction is the author's to state, and guessing
        // it would make the tool assert good and bad about a quantity it cannot judge.
        direction: 'NEUTRAL', source: 'UE', decimals,
        description: `Derived: ${expression}`, expression,
      })
      setResult(`${r.kpi.name}: ${r.valuesComputed} values from ${r.referencedKpis.join(', ')}`)
      setName(''); setDisplayName(''); setUnit(''); setExpression('')
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const recompute = async (kpi: string) => {
    setBusy(true); setError(null); setResult(null)
    try {
      const r = await api.recomputeDerivedKpi(kpi)
      setResult(`${kpi}: ${r.valuesComputed} values recomputed`)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <header>
        <span className="title">Derived KPIs</span>
        <span className="meta">{derived.length} defined</span>
      </header>
      <div style={{ padding: 10, display: 'grid', gap: 8, maxWidth: 720 }}>
        <p style={{ margin: 0, color: '#666' }}>
          A KPI computed from others by an arithmetic formula &mdash; <code>+ - * / ( )</code>,
          numbers and KPI names. This is narrower than a full KPI workbench: there are no
          conditions, no state machines and no time windows, only arithmetic per sample.
          A sample gets a value only when every KPI the formula reads is present there and
          the result is defined, so dividing by zero produces no value rather than a wrong one.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1 }}>Name (A&ndash;Z, digits, underscore)<br />
            <input value={name} onChange={(e) => setName(e.target.value.toUpperCase())}
                   placeholder="DL_MBPS_PER_PRB" style={{ width: '100%' }} /></label>
          <label style={{ flex: 1 }}>Display name<br />
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                   placeholder="defaults to the name" style={{ width: '100%' }} /></label>
          <label style={{ width: 110 }}>Unit<br />
            <input value={unit} onChange={(e) => setUnit(e.target.value)}
                   placeholder="Mbps/%" style={{ width: '100%' }} /></label>
          <label style={{ width: 80 }}>Decimals<br />
            <input type="number" min={0} max={6} value={decimals}
                   onChange={(e) => setDecimals(Number(e.target.value))}
                   style={{ width: '100%' }} /></label>
        </div>
        <label>Formula<br />
          <input value={expression} onChange={(e) => setExpression(e.target.value)}
                 placeholder="MAC_DL_THROUGHPUT / DU_PRB_UTILISATION"
                 style={{ width: '100%', fontFamily: 'monospace' }} /></label>
        <div>
          <button onClick={submit} disabled={busy || !name || !expression}>
            {busy ? 'Computing…' : 'Create and compute'}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        {result && <div style={{ color: '#147a14' }}>{result}</div>}
      </div>

      {derived.length > 0 && (
        <table className="grid">
          <thead>
            <tr><th>KPI</th><th>Formula</th><th>Unit</th><th /></tr>
          </thead>
          <tbody>
            {derived.map((d) => (
              <tr key={d.name}>
                <td>{d.displayName}</td>
                <td style={{ fontFamily: 'monospace' }}>{d.expression}</td>
                <td>{d.unit}</td>
                <td>
                  <button disabled={busy} onClick={() => recompute(d.name)}
                          title="Values are a snapshot; recompute after importing sessions">
                    Recompute
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

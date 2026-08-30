import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { ImportResult } from '../api/types'

/**
 * CSV import.
 *
 * The result deliberately reports which columns were mapped to KPIs and which were
 * ignored: a header the tool does not recognise is the most common reason an import
 * looks like it worked but produced nothing useful.
 */
export function ImportView({ onImported }: { onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [device, setDevice] = useState('')
  const [operator, setOperator] = useState('')
  const [technology, setTechnology] = useState('5G NR SA')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [knownKpis, setKnownKpis] = useState<string[]>([])

  useEffect(() => {
    api.kpiDefinitions().then((d) => setKnownKpis(d.map((k) => k.name))).catch(() => {})
  }, [])

  const submit = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('Choose a CSV file first.'); return }
    setBusy(true); setError(null); setResult(null)
    const form = new FormData()
    form.append('file', file)
    if (name) form.append('sessionName', name)
    if (device) form.append('device', device)
    if (operator) form.append('operator', operator)
    if (technology) form.append('technology', technology)
    try {
      setResult(await api.importCsv(form))
      onImported()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panels">
      <div className="panel">
        <header><span className="title">Import measurement data (CSV)</span></header>
        <div style={{ padding: 10, display: 'grid', gap: 8, maxWidth: 620 }}>
          <label>File<br /><input ref={fileRef} type="file" accept=".csv,.txt,text/csv" /></label>
          <label>Session name<br />
            <input value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="defaults to the file name" style={{ width: '100%' }} /></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ flex: 1 }}>Device<br />
              <input value={device} onChange={(e) => setDevice(e.target.value)}
                     style={{ width: '100%' }} /></label>
            <label style={{ flex: 1 }}>Operator<br />
              <input value={operator} onChange={(e) => setOperator(e.target.value)}
                     style={{ width: '100%' }} /></label>
            <label style={{ flex: 1 }}>Technology<br />
              <input value={technology} onChange={(e) => setTechnology(e.target.value)}
                     style={{ width: '100%' }} /></label>
          </div>
          <div>
            <button onClick={submit} disabled={busy}>{busy ? 'Importing…' : 'Import'}</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <header><span className="title">Expected format</span></header>
        <div style={{ padding: 10, color: '#444' }}>
          <p style={{ marginTop: 0 }}>
            A header row, then one row per sample. Position columns are matched by name
            (<code>latitude/lat</code>, <code>longitude/lon</code>, <code>timestamp/time/ts</code>,
            <code>speed_kmh</code>, <code>serving_pci</code>). Every other column is treated as a
            KPI if its name matches a known KPI, and reported as ignored otherwise.
          </p>
          <p>
            Timestamps may be ISO-8601, epoch seconds or epoch milliseconds. A row without a
            usable position is skipped.
          </p>
          <p style={{ marginBottom: 0 }}>
            <b>Recognised KPI columns:</b>{' '}
            <code style={{ fontSize: 11 }}>{knownKpis.join(', ')}</code>
          </p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <div className="panel">
          <header>
            <span className="title">Import result</span>
            <span className="meta">{result.status}</span>
          </header>
          <table className="grid">
            <tbody>
              <tr><td>Session</td><td>{result.sessionId ?? '-'}</td></tr>
              <tr><td>Rows read</td><td className="num">{result.rowsRead}</td></tr>
              <tr><td>Samples loaded</td><td className="num">{result.samplesLoaded}</td></tr>
              <tr><td>KPI values loaded</td><td className="num">{result.kpisLoaded}</td></tr>
              <tr><td>Mapped KPI columns</td><td>{result.mappedKpis.join(', ') || '-'}</td></tr>
              <tr>
                <td>Ignored columns</td>
                <td className={result.ignoredColumns.length ? 'sev-WARNING' : ''}>
                  {result.ignoredColumns.join(', ') || 'none'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

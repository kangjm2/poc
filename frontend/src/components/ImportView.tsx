import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { EventType, ImportResult, KpiDefinition } from '../api/types'
import { DerivedKpiPanel } from './DerivedKpiPanel'
import { KpiWorkbench } from './KpiWorkbench'

/**
 * CSV import.
 *
 * The result deliberately reports which columns were mapped to KPIs and which were
 * ignored: a header the tool does not recognise is the most common reason an import
 * looks like it worked but produced nothing useful. The catalogue is no longer fixed,
 * so the same screen can define the missing KPIs instead of only naming them.
 */
export function ImportView({ onImported, eventTypes = [], sessionId = null }: {
  onImported: () => void
  /** Passed through to the workbench so its event source names types the shared way. */
  eventTypes?: EventType[]
  /** Which measurement a node preview reads. */
  sessionId?: number | null
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [device, setDevice] = useState('')
  const [operator, setOperator] = useState('')
  const [technology, setTechnology] = useState('5G NR SA')
  const [description, setDescription] = useState('')
  // The three cohort axes. Separate fields rather than words in the description,
  // because a free-text note cannot be grouped by.
  const [buildLabel, setBuildLabel] = useState('')
  const [scenario, setScenario] = useState('')
  const [locationName, setLocationName] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [defs, setDefs] = useState<KpiDefinition[]>([])
  const [createUnknown, setCreateUnknown] = useState(false)
  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([])
  /** Which file of how many, while a folder's worth is being loaded. */
  const [batch, setBatch] = useState<{ done: number; total: number; current: string | null } | null>(null)

  const reloadJobs = () => { api.importJobs().then(setJobs).catch(() => {}) }

  useEffect(() => {
    api.kpiDefinitions().then(setDefs).catch(() => {})
    reloadJobs()
  }, [])

  // Polled only while something is running. The import is one synchronous request, so
  // the only way to see inside it is to ask the job row, which it updates on each batch.
  useEffect(() => {
    if (!busy) return
    const t = setInterval(reloadJobs, 700)
    return () => clearInterval(t)
  }, [busy])

  const running = jobs.find((j) => j.status === 'RUNNING')

  /**
   * Import every chosen file, one after another.
   *
   * A drive produces a folder, not a file, and importing twelve of them meant filling the
   * same four fields twelve times. Sequentially rather than in parallel on purpose: each
   * import is one transaction over the same tables, and running them together would turn
   * a slow import into several slow imports contending with each other.
   */
  const submit = async () => {
    const files = [...(fileRef.current?.files ?? [])]
    if (files.length === 0) { setError('Choose at least one CSV file first.'); return }
    setBusy(true); setError(null); setResult(null); setBatch(null)
    const failures: string[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setBatch({ done: i, total: files.length, current: file.name })
      const form = new FormData()
      form.append('file', file)
      // With several files the typed name would name them all the same, and the import
      // refuses a duplicate - so the file names them, which is what the user meant.
      if (name && files.length === 1) form.append('sessionName', name)
      if (device) form.append('device', device)
      if (operator) form.append('operator', operator)
      if (technology) form.append('technology', technology)
      if (description) form.append('description', description)
      if (buildLabel) form.append('buildLabel', buildLabel)
      if (scenario) form.append('scenario', scenario)
      if (locationName) form.append('locationName', locationName)
      if (createUnknown) form.append('createUnknownColumns', 'true')
      try {
        setResult(await api.importCsv(form))
        onImported()
      } catch (e) {
        failures.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
      reloadJobs()
    }
    setBatch({ done: files.length, total: files.length, current: null })
    if (failures.length > 0) setError(failures.join(' · '))
    setBusy(false)
  }

  return (
    <div className="panels">
      <div className="panel">
        <header><span className="title">Import measurement data (CSV)</span></header>
        <div style={{ padding: 10, display: 'grid', gap: 8, maxWidth: 620 }}>
          {/* multiple, because a drive produces a folder. The four fields below are
              filled once and reused for all of them - typing them twelve times is what
              made a folder's worth of measurements a chore rather than a task. */}
          <label>Files<br />
            <input ref={fileRef} type="file" multiple accept=".csv,.txt,text/csv" /></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={createUnknown} style={{ marginTop: 2 }}
                   onChange={(e) => setCreateUnknown(e.target.checked)} />
            <span>
              <b>Define a KPI for every unrecognised column</b><br />
              <span style={{ color: '#666' }}>
                Otherwise those columns are dropped. New KPIs start with no
                thresholds, so they are coloured by each session&rsquo;s own
                distribution until you pin a scale.
              </span>
            </span>
          </label>
          <label>Session name<br />
            <input value={name} aria-label="Session name" onChange={(e) => setName(e.target.value)}
                   placeholder="defaults to the file name" style={{ width: '100%' }} /></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ flex: 1 }}>Device<br />
              <input value={device} aria-label="Device" onChange={(e) => setDevice(e.target.value)}
                     style={{ width: '100%' }} /></label>
            <label style={{ flex: 1 }}>Operator<br />
              <input value={operator} aria-label="Operator" onChange={(e) => setOperator(e.target.value)}
                     style={{ width: '100%' }} /></label>
            <label style={{ flex: 1 }}>Technology<br />
              <input value={technology} aria-label="Technology" onChange={(e) => setTechnology(e.target.value)}
                     style={{ width: '100%' }} /></label>
          </div>
          {/* What the cohort screen groups by. Filled once for a folder's worth of
              files, which is exactly the case where every drive shares a build and a
              route - and the case where typing it into each description would produce
              twelve spellings of one value. */}
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ flex: 1 }}>Build<br />
              <input value={buildLabel} aria-label="Build" onChange={(e) => setBuildLabel(e.target.value)}
                     placeholder="e.g. 1.5.0" style={{ width: '100%' }} /></label>
            <label style={{ flex: 1 }}>Scenario<br />
              <input value={scenario} aria-label="Scenario" onChange={(e) => setScenario(e.target.value)}
                     placeholder="e.g. Highway DL" style={{ width: '100%' }} /></label>
            <label style={{ flex: 1 }}>Location<br />
              <input value={locationName} aria-label="Location" onChange={(e) => setLocationName(e.target.value)}
                     placeholder="e.g. Gangnam" style={{ width: '100%' }} /></label>
          </div>
          <div style={{ color: '#666', fontSize: 12, marginTop: -4 }}>
            Left blank these group as <b>(unset)</b> on the Cohorts tab.
          </div>
          {/* Two weeks on, the file name is all that distinguishes four drives in the
              picker. This is the only place a session can say what it was. */}
          <label>Description<br />
            <input className="import-description" value={description}
                   onChange={(e) => setDescription(e.target.value)}
                   placeholder="what this drive was - build, route, conditions"
                   style={{ width: '100%' }} /></label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={submit} disabled={busy}>{busy ? 'Importing…' : 'Import'}</button>
            {/* A number, not a spinner. "Importing…" with nothing behind it is the state
                in which a user reaches for the browser's stop button - which abandons the
                response while the server carries on to completion. */}
            {busy && (
              <span className="import-progress">
                {batch && batch.total > 1 && (
                  <b>file {Math.min(batch.done + 1, batch.total)} of {batch.total}</b>
                )}
                {batch?.current && <span className="dim"> {batch.current}</span>}
                {running != null && (
                  <> · {Number(running.rows_read ?? 0).toLocaleString()} rows read</>
                )}
                {running != null && (
                  <button style={{ marginLeft: 8 }}
                          onClick={() => api.cancelImport(Number(running.id))
                            .then(reloadJobs).catch(() => {})}>
                    Stop
                  </button>
                )}
              </span>
            )}
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
            <code style={{ fontSize: 11 }}>{defs.map((k) => k.name).join(', ')}</code>
            {' '}&mdash; display names as exported by other analysis tools
            (e.g. <code style={{ fontSize: 11 }}>RSRP (NR SpCell)</code>) are
            matched too, ignoring case and punctuation.
          </p>
        </div>
      </div>

      <DerivedKpiPanel defs={defs}
                       onChanged={() => {
                         api.kpiDefinitions().then(setDefs).catch(() => {})
                         onImported()
                       }} />

      {/* The workbench sits beside the formula panel because they are the same job at two
          scales: one is arithmetic per sample, the other is a dataflow. Splitting them
          across screens would make an author choose between them before understanding
          the difference. */}
      <KpiWorkbench defs={defs} eventTypes={eventTypes} sessionId={sessionId}
                    onChanged={() => {
                      api.kpiDefinitions().then(setDefs).catch(() => {})
                      onImported()
                    }} />

      {error && <div className="error">{error}</div>}

      <div className="panel">
        <header>
          <span className="title">Import history</span>
          <span className="meta">{jobs.length}</span>
        </header>
        {jobs.length === 0
          ? <div className="loading">No imports yet.</div>
          : (
            <table className="grid">
              <thead><tr><th>File</th><th>Status</th><th className="num">Rows</th>
                <th className="num">Samples</th><th className="num">KPI values</th>
                <th>Session</th><th>Message</th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={String(j.id)}>
                    <td>{String(j.filename)}</td>
                    <td className={j.status === 'FAILED' ? 'sev-CRITICAL' : ''}>{String(j.status)}</td>
                    <td className="num">{String(j.rows_read)}</td>
                    <td className="num">{String(j.samples_loaded)}</td>
                    <td className="num">{String(j.kpis_loaded)}</td>
                    <td>{j.session_id == null ? '-' : String(j.session_id)}</td>
                    <td style={{ whiteSpace: 'normal', color: '#666' }}>
                      {j.message == null ? '' : String(j.message)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

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
              {result.createdKpis.length > 0 && (
                <tr>
                  <td>KPIs defined</td>
                  <td>{result.createdKpis.join(', ')}</td>
                </tr>
              )}
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

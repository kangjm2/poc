import { useState } from 'react'
import { api } from '../api/client'
import type { KpiDefinition } from '../api/types'

/**
 * Declare what a column in a log file MEANS, before the file arrives.
 *
 * The sibling of the derived-KPI panel, and the opposite direction: that one builds a value
 * out of parameters the tool already has, this one gives a measured column its semantics.
 *
 * Why it has to exist as its own screen. The import can define unknown columns, and that is
 * the right default - a column the user chose to bring is data, and dropping it silently is
 * not defensible. But the import has nothing to go on, so every column it defines gets
 * category "Imported", technology "Unknown" and direction NEUTRAL. NEUTRAL is not a cosmetic
 * default: it is the value that tells the colour ramp there is no bad end and tells the
 * comparison verdict to withhold BETTER and WORSE. There is no endpoint to correct a
 * definition afterwards, so a parameter born that way stays uncoloured and unjudged for as
 * long as it exists. Declaring it first is the only way to get it right, and the server has
 * accepted exactly this since the first commit - nothing ever called it.
 */
export function MeasuredKpiPanel({ defs, onChanged }: {
  defs: KpiDefinition[]
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [unit, setUnit] = useState('')
  const [category, setCategory] = useState('')
  const [technology, setTechnology] = useState('5G NR')
  const [direction, setDirection] = useState('HIGHER_IS_BETTER')
  const [source, setSource] = useState('UE')
  const [decimals, setDecimals] = useState(1)
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true); setError(null); setResult(null)
    try {
      const made = await api.createKpi({
        name, displayName: displayName || null, unit, category: category || 'Imported',
        technology, direction, source, decimals,
        description: description || null, expression: null,
      })
      setResult(`${made.name} is defined. A column of that name will now be imported`
        + ' with these semantics; until you pin a scale it is coloured by each drive’s own'
        + ' distribution.')
      setName(''); setDisplayName(''); setUnit(''); setCategory(''); setDescription('')
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const clash = defs.some((d) => d.name.toUpperCase() === name.trim().toUpperCase())

  return (
    <div className="panel">
      <header>
        <span className="title">Define a measured parameter</span>
        <span className="meta">for a column your log has and the catalogue does not</span>
      </header>
      <div style={{ padding: 10, display: 'grid', gap: 8, maxWidth: 620 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1 }}>Name<br />
            <input value={name} aria-label="Measured KPI name"
                   onChange={(e) => setName(e.target.value)}
                   placeholder="the column header, e.g. CUSTOM_MARGIN_DB"
                   style={{ width: '100%' }} /></label>
          <label style={{ width: 110 }}>Unit<br />
            <input value={unit} aria-label="Measured KPI unit"
                   onChange={(e) => setUnit(e.target.value)}
                   placeholder="dB" style={{ width: '100%' }} /></label>
          <label style={{ width: 80 }}>Decimals<br />
            <input type="number" min={0} max={4} value={decimals} aria-label="Measured KPI decimals"
                   onChange={(e) => setDecimals(Number(e.target.value))}
                   style={{ width: '100%' }} /></label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1 }}>Display name<br />
            <input value={displayName} aria-label="Measured KPI display name"
                   onChange={(e) => setDisplayName(e.target.value)}
                   placeholder="defaults to the name" style={{ width: '100%' }} /></label>
          <label style={{ flex: 1 }}>Category<br />
            <input value={category} aria-label="Measured KPI category"
                   onChange={(e) => setCategory(e.target.value)}
                   placeholder="Imported" style={{ width: '100%' }} /></label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1 }}>Direction<br />
            <select value={direction} aria-label="Measured KPI direction"
                    style={{ width: '100%' }}
                    onChange={(e) => setDirection(e.target.value)}>
              <option value="HIGHER_IS_BETTER">higher is better</option>
              <option value="LOWER_IS_BETTER">lower is better</option>
              <option value="NEUTRAL">neither (a counter)</option>
            </select></label>
          <label style={{ flex: 1 }}>Source<br />
            <select value={source} aria-label="Measured KPI source" style={{ width: '100%' }}
                    onChange={(e) => setSource(e.target.value)}>
              <option value="UE">UE</option><option value="DU">DU</option>
              <option value="FRONTHAUL">Fronthaul</option><option value="SCANNER">Scanner</option>
            </select></label>
          <label style={{ flex: 1 }}>Technology<br />
            <input value={technology} aria-label="Measured KPI technology"
                   onChange={(e) => setTechnology(e.target.value)}
                   style={{ width: '100%' }} /></label>
        </div>
        <label>Description<br />
          <input value={description} aria-label="Measured KPI description"
                 onChange={(e) => setDescription(e.target.value)}
                 placeholder="what this column measures" style={{ width: '100%' }} /></label>
        {/* Said before the request rather than after the 400: the catalogue is already in
            the browser, so "that name is taken" is answerable at the keystroke. */}
        {clash && <div className="basis-note">A parameter named {name} already exists.</div>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={submit} disabled={busy || !name.trim() || clash}>
            {busy ? 'Defining…' : 'Define'}
          </button>
          <span style={{ color: '#666', fontSize: 11 }}>
            Direction is the one that matters most: <b>neither</b> leaves the ramp with no bad
            end and withholds the comparison verdict.
          </span>
        </div>
        {error && <div className="error">{error}</div>}
        {result && <div className="basis-note">{result}</div>}
      </div>
    </div>
  )
}

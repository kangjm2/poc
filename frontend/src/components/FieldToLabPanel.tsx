import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { FieldToLab } from '../api/types'

/**
 * What this field measurement implies for a lab replay.
 *
 * The step the whole virtual drive test rests on, and the one the reference toolset gives
 * a screen of its own: summarise the field log, list its carriers, and extract a channel
 * model the emulator can replay.
 *
 * Only what our measurements actually support is shown. The reference screen also lists
 * the device's chipset, firmware and software build; we record a device name and nothing
 * more, so those rows are absent rather than filled with plausible-looking text. Where a
 * number is a suggestion rather than a measurement, it says so on the screen - a lab
 * engineer who cannot tell the two apart cannot trust either.
 */
export function FieldToLabPanel({ sessionId, onGenerated }: {
  sessionId: number | null
  onGenerated?: () => void
}) {
  const [data, setData] = useState<FieldToLab | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    if (sessionId == null) return
    api.fieldToLab(sessionId).then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }

  useEffect(() => { setData(null); setError(null); load() }, [sessionId])

  if (error) return <div className="error">{error}</div>
  if (!data) return <div className="loading">Loading…</div>

  const { session, route, carriers, derived } = data
  const n = (v: number | null | undefined, d = 1) => (v == null ? '-' : v.toFixed(d))
  // Whole km/h, because the rationale below is written by the server at whole km/h
  // ("Peak 15 km/h"), and a table beside it saying 14.7 reads as a second measurement of
  // the same drive. A one-fix-a-second GPS speed does not carry the tenth anyway.
  const kmh = (v: number | null) => `${n(v, 0)} km/h`

  const generate = async () => {
    if (sessionId == null) return
    setBusy(true); setError(null)
    try { await api.generateChannelModel(sessionId); load(); onGenerated?.() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return (
    <>
      <div className="panels">
        <div className="panel">
          <header><span className="title">Field log</span></header>
          <table className="grid">
            <tbody>
              <tr><th>Measurement</th><td>{session.name}</td></tr>
              <tr><th>Product used</th><td>{session.device}</td></tr>
              <tr><th>Operator</th><td>{session.operator}</td></tr>
              <tr><th>Technology</th><td>{session.technology}</td></tr>
              <tr><th>Measured at</th>
                <td>{new Date(session.startedAt).toISOString().replace('T', ' ').slice(0, 19)}</td></tr>
              <tr><th>Duration</th><td>{Math.round(route.sampleCount / 60)} min</td></tr>
              <tr><th>Distance</th><td>{n(route.distanceKm, 2)} km</td></tr>
              <tr><th>Average speed</th><td>{kmh(route.avgSpeedKmh)}</td></tr>
              <tr><th>Peak speed</th><td>{kmh(route.maxSpeedKmh)}</td></tr>
              <tr><th>Samples</th><td>{route.sampleCount}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="panel">
          <header>
            <span className="title">Detected carriers</span>
            <span className="meta">{carriers.length}</span>
          </header>
          <table className="grid">
            <thead>
              <tr><th>Band</th><th className="num">NR-ARFCN</th>
                <th className="num">Centre</th><th className="num">Cells</th><th>PCIs</th></tr>
            </thead>
            <tbody>
              {carriers.map((c) => (
                <tr key={`${c.band}-${c.arfcn}`}>
                  <td>{c.band}</td>
                  <td className="num">{c.arfcn}</td>
                  <td className="num">{n(c.centreFreqMhz, 2)} MHz</td>
                  <td className="num">{c.cellCount}</td>
                  <td>{c.pcis.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <header>
          <span className="title">Extracted channel model</span>
          <span className="meta" style={{ marginLeft: 'auto' }}>
            {data.existingChannelModelName
              ? `available — ${data.existingChannelModelName}`
              : 'not generated yet'}
          </span>
          <button style={{ marginLeft: 8 }} disabled={busy || sessionId == null}
                  onClick={generate}>
            {busy ? 'Generating…'
              : data.existingChannelModelId ? 'Regenerate' : 'Generate simulation'}
          </button>
        </header>
        <table className="grid">
          <tbody>
            <tr>
              <th style={{ width: 190 }}>Max Doppler shift</th>
              <td>{derived.maxDopplerHz == null ? '-' : `${derived.maxDopplerHz} Hz`}</td>
              <td style={{ color: '#666' }}>
                Computed: peak speed &times; carrier frequency &divide; c
              </td>
            </tr>
            <tr>
              <th>Carrier centre</th>
              <td>{n(derived.centreFreqMhz, 2)} MHz</td>
              <td style={{ color: '#666' }}>Computed from the NR-ARFCN raster</td>
            </tr>
            <tr>
              <th>Measured RSRP span</th>
              <td>{n(derived.rsrpMinDbm)} … {n(derived.rsrpMaxDbm)} dBm
                {' '}({n(derived.rsrpSpanDb)} dB)</td>
              <td style={{ color: '#666' }}>
                The fading depth the replay has to reproduce
              </td>
            </tr>
            <tr>
              <th>Suggested profile</th>
              <td>{derived.suggestedProfile}</td>
              <td className="sev-WARNING" style={{ background: 'none' }}>
                Suggestion, not a measurement
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ padding: 8, color: '#666', whiteSpace: 'normal' }}>
          {derived.rationale}
        </div>
      </div>
    </>
  )
}

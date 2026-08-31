import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { RachReport, RunBringUp, ServingCell } from '../api/types'

/**
 * How a lab run was brought up.
 *
 * A virtual drive test is a chain, not a box: a field capture is converted to a channel
 * model, a network emulator plays the cell, a channel emulator replays the measured
 * radio conditions, and the device under test sits at the end. Every link can stop the
 * run, and which one stopped it is the first thing a lab engineer asks - so the chain and
 * its steps are shown, not just the verdict at the end.
 *
 * The attach detail follows the reference measurement tool, which keeps a RACH dock and a
 * serving-cell identity table permanently on screen. Both are reproduced here: they are
 * how a user tells a device problem from a cell-configuration problem.
 */

const PHASE_LABEL: Record<string, string> = {
  CONVERT: 'Field-to-lab',
  INSTRUMENT: 'Instruments',
  RF: 'RF path',
  ATTACH: 'Attach',
  TRAFFIC: 'Traffic',
}

const ROLE_LABEL: Record<string, string> = {
  ANALYSIS_HOST: 'Capture / analysis',
  NETWORK_EMULATOR: 'Network emulator',
  CHANNEL_EMULATOR: 'Channel emulator',
  DUT_ENCLOSURE: 'Device under test',
}

const duration = (ms: number | null) => {
  if (ms == null) return ''
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`
}

const clock = (iso: string | null) =>
  iso ? new Date(iso).toISOString().slice(11, 19) : ''

/** The instrument chain, drawn in the order a signal actually travels it. */
function Chain({ data }: { data: RunBringUp }) {
  // A step that is running marks its instrument as the one currently in play, which is
  // what makes the diagram tell you where the run actually is.
  const activeId = data.steps.find((s) => s.status === 'RUNNING')?.instrumentId ?? null
  const failedId = data.steps.find((s) => s.status === 'FAILED')?.instrumentId ?? null

  return (
    <div className="chain">
      {data.chain.map((inst, i) => (
        <div key={inst.id} className="chain-node-wrap">
          <div className={'chain-node'
            + (inst.id === failedId ? ' failed' : '')
            + (inst.id === activeId ? ' active' : '')}>
            <div className="chain-role">{ROLE_LABEL[inst.role] ?? inst.role}</div>
            <div className="chain-name">{inst.name}</div>
            <div className="chain-meta">
              {inst.model}
              {inst.firmware && inst.firmware !== '-' ? ` · fw ${inst.firmware}` : ''}
            </div>
            <div className="chain-meta">{inst.address}</div>
          </div>
          {i < data.chain.length - 1 && <div className="chain-arrow">&rarr;</div>}
        </div>
      ))}
    </div>
  )
}

function RachPanel({ rach }: { rach: RachReport }) {
  const rows: Array<[string, string]> = [
    ['RACH type', rach.rachType ?? '-'],
    ['RACH reason', rach.rachReason ?? '-'],
    ['RACH result', rach.rachResult ?? '-'],
    ['RACH access delay', rach.accessDelayMs == null ? '-' : `${rach.accessDelayMs} ms`],
    ['RACH preamble format', rach.preambleFormat ?? '-'],
    ['RACH preamble index', String(rach.preambleIndex ?? '-')],
    ['RACH preamble count', String(rach.preambleCount ?? '-')],
    ['RACH preamble initial power',
      rach.preambleInitialPwrDbm == null ? '-' : `${rach.preambleInitialPwrDbm} dBm`],
    ['RACH preamble step', rach.preambleStepDb == null ? '-' : `${rach.preambleStepDb} dB`],
    ['RACH response window',
      rach.responseWindowSlots == null ? '-' : `${rach.responseWindowSlots} slot`],
    ['RACH RA-RNTI', String(rach.raRnti ?? '-')],
    ['RACH SSB ID', String(rach.ssbId ?? '-')],
    ['RACH timing advance', String(rach.timingAdvance ?? '-')],
    ['RACH pathloss', rach.pathlossDb == null ? '-' : `${rach.pathlossDb} dB`],
    ['RACH PUSCH power', rach.puschPowerDbm == null ? '-' : `${rach.puschPowerDbm} dBm`],
    ['RACH logical root sequence', String(rach.logicalRootSequence ?? '-')],
    ['RACH contention resolutions', String(rach.contentionResolutions ?? '-')],
  ]
  return (
    <table className="grid">
      <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td>{k}</td>
            <td className={k === 'RACH result' && v !== 'Succeeded' ? 'sev-CRITICAL' : ''}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ServingCellPanel({ cell }: { cell: ServingCell }) {
  return (
    <table className="grid">
      <thead>
        <tr><th>Cell type</th><th>SSB band</th><th className="num">SSB NR-ARFCN</th>
          <th className="num">SSB GSCN</th><th className="num">PCI</th>
          <th className="num">TA offset</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>{cell.cellType ?? '-'}</td>
          <td>{cell.ssbBand ?? '-'}</td>
          <td className="num">{cell.ssbArfcn ?? '-'}</td>
          <td className="num">{cell.ssbGscn ?? '-'}</td>
          <td className="num">{cell.pci ?? '-'}</td>
          <td className="num">{cell.taOffset ?? '-'}</td>
        </tr>
      </tbody>
    </table>
  )
}

export function BringUpPanel({ runId, onStarted }: {
  runId: number
  onStarted?: () => void
}) {
  const [data, setData] = useState<RunBringUp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => api.bringUp(runId).then(setData).catch((e) => setError(String(e)))

  useEffect(() => { setData(null); setError(null); load() }, [runId])

  // A run in flight is polled, because the chain comes up over a couple of minutes and
  // the point of the view is watching it. Nothing else polls: a settled run does not
  // change, so it is fetched once.
  useEffect(() => {
    if (data?.status !== 'RUNNING') return
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
  }, [data?.status, runId])

  if (error) return <div className="error">{error}</div>
  if (!data) return <div className="loading">Loading…</div>

  const done = data.steps.filter((s) => s.status === 'OK').length
  const failed = data.steps.some((s) => s.status === 'FAILED')
  const running = data.status === 'RUNNING'

  const start = async () => {
    setBusy(true)
    try { await api.startRun(runId); await load(); onStarted?.() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return (
    <>
      <div className="panel">
        <header>
          <span className="title">Instrument chain</span>
          <span className="meta">{data.chain.length} instruments</span>
        </header>
        <div style={{ padding: 10 }}><Chain data={data} /></div>
      </div>

      <div className="panel">
        <header>
          <span className="title">Bring-up sequence</span>
          <span className="meta" style={{ marginLeft: 'auto' }}>
            {done} / {data.steps.length} complete
            {running ? ' · running' : failed ? ' · failed' : ''}
          </span>
          {!running && (
            <button style={{ marginLeft: 8 }} disabled={busy} onClick={start}>
              {busy ? 'Starting…' : data.status === 'QUEUED' ? 'Start run' : 'Run again'}
            </button>
          )}
        </header>
        <table className="grid">
          <thead>
            <tr><th style={{ width: 28 }}>#</th><th style={{ width: 110 }}>Phase</th>
              <th>Step</th><th style={{ width: 150 }}>Instrument</th>
              <th style={{ width: 80 }}>Status</th>
              <th className="num" style={{ width: 70 }}>Duration</th>
              <th className="num" style={{ width: 70 }}>At</th></tr>
          </thead>
          <tbody>
            {data.steps.map((s) => (
              <tr key={s.id} className={s.status === 'RUNNING' ? 'step-running' : undefined}>
                <td className="num">{s.ordinal}</td>
                <td>{PHASE_LABEL[s.phase] ?? s.phase}</td>
                <td>
                  {s.name}
                  {s.detail && (
                    <div style={{ color: '#666', whiteSpace: 'normal' }}>{s.detail}</div>
                  )}
                </td>
                <td style={{ color: '#666' }}>{s.instrumentName ?? '-'}</td>
                <td className={
                  s.status === 'FAILED' ? 'sev-CRITICAL'
                    : s.status === 'OK' ? 'step-ok' : ''
                }>{s.status}</td>
                <td className="num">{duration(s.durationMs)}</td>
                <td className="num" style={{ color: '#666' }}>{clock(s.startedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.servingCell && (
        <div className="panel">
          <header><span className="title">Serving cell</span></header>
          <ServingCellPanel cell={data.servingCell} />
        </div>
      )}

      {data.rach ? (
        <div className="panel">
          <header>
            <span className="title">5G NR RACH metrics</span>
            <span className="meta">{data.rach.rachResult}</span>
          </header>
          <RachPanel rach={data.rach} />
        </div>
      ) : (
        <div className="panel">
          <header><span className="title">5G NR RACH metrics</span></header>
          <div className="loading">
            No attach yet — these appear once the device completes random access.
          </div>
        </div>
      )}
    </>
  )
}

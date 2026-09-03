import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { BringUpPanel } from './BringUpPanel'
import type {
  Campaign, CellConfig, ChannelModel, DuEndpoint, TestRun, UeProfile,
} from '../api/types'

/**
 * The lab side: what was emulated, what was real, and whether the run passed.
 *
 * A virtual drive test is only reproducible if the channel model, cell
 * configuration, UE profile and DU connection are recorded with the run, so they
 * are shown together rather than buried in settings.
 */
export function LabView({ onOpenSession }: { onOpenSession?: (id: number) => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [runs, setRuns] = useState<TestRun[]>([])
  const [channels, setChannels] = useState<ChannelModel[]>([])
  const [cells, setCells] = useState<CellConfig[]>([])
  const [ues, setUes] = useState<UeProfile[]>([])
  const [dus, setDus] = useState<DuEndpoint[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = () => {
    api.runs().then((r) => {
      setRuns(r)
      setSelected((cur) => cur ?? (r.length ? r[0].id : null))
    }).catch((e) => setError(String(e)))
  }

  useEffect(() => {
    api.campaigns().then(setCampaigns).catch((e) => setError(String(e)))
    api.channelModels().then(setChannels).catch(() => {})
    api.cellConfigs().then(setCells).catch(() => {})
    api.ueProfiles().then(setUes).catch(() => {})
    api.duEndpoints().then(setDus).catch(() => {})
    reload()
  }, [])

  const run = runs.find((r) => r.id === selected) ?? null

  const evaluate = async (id: number) => {
    setBusy(true)
    setError(null)
    try {
      await api.evaluateRun(id)
      reload()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panels">
      {error && <div className="error">{error}</div>}

      <div className="panel">
        <header>
          <span className="title">Campaigns</span>
          <span className="meta">{campaigns.length}</span>
        </header>
        <table className="grid">
          <thead><tr><th>Name</th><th>Owner</th><th className="num">Runs</th>
            <th>Description</th></tr></thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td><td>{c.owner}</td>
                <td className="num">{c.runCount}</td>
                <td style={{ whiteSpace: 'normal', color: '#666' }}>{c.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <header><span className="title">Runs</span><span className="meta">{runs.length}</span></header>
        <table className="grid">
          <thead><tr><th>Run</th><th>Channel model</th><th>DU connection</th>
            <th>Status</th><th>Verdict</th><th /></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="deg-row"
                  onClick={() => setSelected(r.id)}
                  style={r.id === selected ? { background: '#eef3fa' } : undefined}>
                <td>{r.name}</td>
                <td>{r.channelModel?.name ?? '-'}</td>
                <td>{r.duEndpoint?.connectionType ?? '-'}</td>
                <td>{r.status}</td>
                <td className={r.verdict === 'PASS' ? 'verdict-BETTER'
                  : r.verdict === 'FAIL' ? 'verdict-WORSE' : 'verdict-SAME'}>
                  {r.verdict ?? '-'}
                </td>
                <td>
                  <button disabled={busy}
                          onClick={(e) => { e.stopPropagation(); evaluate(r.id) }}>
                    Evaluate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {run && (
        <>
            <BringUpPanel runId={run.id as number} onStarted={reload} />
          <div className="panel">
            <header>
              <span className="title">Run configuration &mdash; {run.name}</span>
              <span className="meta">
                {run.status}
                {run.status === 'RUNNING' ? ` ${run.progressPct}%` : ''}
                {run.message ? ` — ${run.message}` : ''}
                {run.sessionId ? (
                  <button style={{ marginLeft: 10 }}
                          onClick={() => onOpenSession?.(run.sessionId as number)}>
                    Open session {run.sessionId} in Analysis
                  </button>
                ) : ' — no session attached'}
              </span>
            </header>
            {/* Every configured input, not a selection of them. A lab result is only
                reproducible if the screen that reports it names what produced it - path
                loss, AWGN, transmit power and layer cap were seeded, carried and typed all
                the way to the browser and then rendered nowhere. */}
            <div className="config-grid">
              <ConfigCard title="Channel model (emulated)" rows={run.channelModel ? [
                ['Name', run.channelModel.name],
                ['Type', run.channelModel.modelType],
                ['Profile', run.channelModel.profile ?? '-'],
                ['Delay spread', fmt(run.channelModel.delaySpreadNs, 'ns')],
                ['Max Doppler', fmt(run.channelModel.maxDopplerHz, 'Hz')],
                ['MIMO correlation', run.channelModel.mimoCorrelation ?? '-'],
                ['Path loss', fmt(run.channelModel.pathLossDb, 'dB')],
                ['AWGN SNR', fmt(run.channelModel.awgnSnrDb, 'dB')],
                ['Replay source', run.channelModel.sourceSessionId
                  ? `session ${run.channelModel.sourceSessionId}` : '-'],
              ] : []} />
              <ConfigCard title="Cell configuration (DU)" rows={run.cellConfig ? [
                ['Name', run.cellConfig.name],
                ['Band', run.cellConfig.band],
                ['Bandwidth', fmt(run.cellConfig.bandwidthMhz, 'MHz')],
                ['SCS', fmt(run.cellConfig.scsKhz, 'kHz')],
                ['Duplex', run.cellConfig.duplex
                  + (run.cellConfig.tddPattern ? ` (${run.cellConfig.tddPattern})` : '')],
                ['MIMO layers', String(run.cellConfig.mimoLayers ?? '-')],
                ['Antennas', `${run.cellConfig.txAntennas ?? '-'}T${run.cellConfig.rxAntennas ?? '-'}R`],
                ['Max power', fmt(run.cellConfig.maxPowerDbm, 'dBm')],
              ] : []} />
              <ConfigCard title="UE profile (emulated)" rows={run.ueProfile ? [
                ['Name', run.ueProfile.name],
                ['Release', run.ueProfile.release ?? '-'],
                ['UE count', String(run.ueProfile.ueCount ?? '-')],
                ['Traffic', run.ueProfile.trafficProfile],
                ['Target rate', fmt(run.ueProfile.targetMbps, 'Mbps')],
                ['Mobility', fmt(run.ueProfile.mobilityKmh, 'km/h')],
                ['Max MIMO layers', String(run.ueProfile.maxMimoLayers ?? '-')],
              ] : []} />
              <ConfigCard title="DU under test (real)" rows={run.duEndpoint ? [
                ['Name', run.duEndpoint.name],
                ['Vendor', run.duEndpoint.vendor ?? '-'],
                ['Connection', run.duEndpoint.connectionType],
                ['Split', run.duEndpoint.splitOption ?? '-'],
                ['Address', run.duEndpoint.address ?? '-'],
              ] : []} />
            </div>
          </div>

          <div className="panel">
            <header>
              <span className="title">Acceptance criteria</span>
              <span className="meta">{run.verdict ?? 'not evaluated'}</span>
            </header>
            <table className="grid">
              <thead><tr><th>KPI</th><th>Aggregate</th><th>Condition</th>
                <th className="num">Actual</th><th>Result</th></tr></thead>
              <tbody>
                {run.criteria.map((c) => (
                  <tr key={c.id}>
                    <td>{c.kpiName}</td>
                    <td>{c.aggregate}</td>
                    <td>{c.operator === 'GTE' ? '≥' : '≤'} {c.threshold}</td>
                    <td className="num">{c.actualValue == null ? '-' : c.actualValue.toFixed(2)}</td>
                    <td className={c.passed === true ? 'verdict-BETTER'
                      : c.passed === false ? 'verdict-WORSE' : 'verdict-SAME'}>
                      {c.passed == null ? '-' : c.passed ? 'PASS' : 'FAIL'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="panel">
        <header><span className="title">Available configurations</span></header>
        <div className="config-grid">
          <ListCard title={`Channel models (${channels.length})`}
                    items={channels.map((c) => `${c.name} — ${c.modelType}`)} />
          <ListCard title={`Cell configurations (${cells.length})`}
                    items={cells.map((c) => `${c.name} — ${c.band} ${c.bandwidthMhz} MHz`)} />
          <ListCard title={`UE profiles (${ues.length})`}
                    items={ues.map((u) => `${u.name} — ${u.ueCount} UE, ${u.trafficProfile}`)} />
          <ListCard title={`DU endpoints (${dus.length})`}
                    items={dus.map((d) => `${d.name} — ${d.connectionType}`)} />
        </div>
      </div>
    </div>
  )
}

function fmt(v: number | null | undefined, unit: string) {
  return v == null ? '-' : `${v} ${unit}`
}

function ConfigCard({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="config-card">
      <h4>{title}</h4>
      <table className="grid">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><td style={{ color: '#666' }}>{k}</td><td>{v}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="config-card">
      <h4>{title}</h4>
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {items.map((t) => <li key={t} style={{ padding: '1px 0' }}>{t}</li>)}
      </ul>
    </div>
  )
}

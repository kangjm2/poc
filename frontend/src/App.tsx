import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api/client'
import type {
  AreaBin, CellRef, CoverageIssue, Degradation, Distribution, KpiDefinition,
  NetworkEvent, Series, SessionSummary, SignalingMessage, Snapshot, TrackPoint,
} from './api/types'
import { RouteMap } from './components/RouteMap'
import { TimeSeriesChart } from './components/TimeSeriesChart'
import {
  DegradationPanel, EventList, LegendPanel, MessageList, ParameterGrid, ParameterTree,
} from './components/Panels'
import { CompareView } from './components/CompareView'
import { LabView } from './components/LabView'
import { ImportView } from './components/ImportView'

/**
 * Workbook pages. Existing users switch screen sets from a tab strip along the
 * bottom, so the same idea is kept here rather than a side navigation.
 */
const WORKBOOKS = [
  { id: 'overview', label: 'Overview' },
  { id: 'radio', label: 'Radio Quality' },
  { id: 'throughput', label: 'Throughput' },
  { id: 'mobility', label: 'Mobility' },
  { id: 'signaling', label: 'L3 Signalling' },
  { id: 'degradation', label: 'Degradation' },
  { id: 'coverage', label: 'Coverage Issues' },
] as const
type WorkbookId = (typeof WORKBOOKS)[number]['id']

export function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [defs, setDefs] = useState<KpiDefinition[]>([])
  const [kpi, setKpi] = useState('RSRP')
  const [workbook, setWorkbook] = useState<WorkbookId>('overview')
  const [mode, setMode] = useState<'analyze' | 'compare' | 'lab' | 'import'>('analyze')

  // Area binning replaces the raw route once a drive is too dense to read.
  const [binSize, setBinSize] = useState(0)
  const [bins, setBins] = useState<AreaBin[] | null>(null)
  const [issues, setIssues] = useState<CoverageIssue[]>([])

  const [track, setTrack] = useState<TrackPoint[]>([])
  const [cells, setCells] = useState<CellRef[]>([])
  const [series, setSeries] = useState<Series[]>([])
  const [dist, setDist] = useState<Distribution | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [events, setEvents] = useState<NetworkEvent[]>([])
  const [messages, setMessages] = useState<SignalingMessage[]>([])
  const [degradations, setDegradations] = useState<Degradation[]>([])

  // The single time cursor every panel reads from. This shared cursor is the
  // interaction existing users rely on most, so it lives at the top of the tree.
  const [cursorSeq, setCursorSeq] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const session = sessions.find((s) => s.id === sessionId) ?? null
  const activeDef = defs.find((d) => d.name === kpi) ?? null

  const fail = useCallback((e: unknown) => setError(String(e)), [])

  useEffect(() => {
    api.sessions().then((s) => {
      setSessions(s)
      if (s.length) setSessionId([...s].sort((a, b) => a.id - b.id)[0].id)
    }).catch(fail)
    api.kpiDefinitions().then(setDefs).catch(fail)
  }, [fail])

  const SERIES_KPIS = useMemo(() => [
    'RSRP', 'RSRQ', 'SINR', 'MAC_DL_THROUGHPUT', 'MAC_UL_THROUGHPUT', 'DL_BLER',
  ], [])

  useEffect(() => {
    if (sessionId == null) return
    setError(null)
    setCursorSeq(0)
    Promise.all([
      api.cells(sessionId).then(setCells),
      api.series(sessionId, SERIES_KPIS).then(setSeries),
      api.events(sessionId).then(setEvents),
      api.messages(sessionId).then(setMessages),
    ]).catch(fail)
  }, [sessionId, SERIES_KPIS, fail])

  useEffect(() => {
    if (sessionId == null) return
    api.track(sessionId, kpi).then(setTrack).catch(fail)
    api.distribution(sessionId, kpi).then(setDist).catch(fail)
    api.degradations(sessionId, kpi, 5).then(setDegradations).catch(fail)
  }, [sessionId, kpi, fail])

  useEffect(() => {
    if (sessionId == null) return
    api.snapshot(sessionId, cursorSeq).then(setSnapshot).catch(() => { /* seq may be out of range */ })
  }, [sessionId, cursorSeq])

  useEffect(() => {
    if (sessionId == null || binSize === 0) { setBins(null); return }
    api.bins(sessionId, kpi, binSize).then(setBins).catch(fail)
  }, [sessionId, kpi, binSize, fail])

  useEffect(() => {
    if (sessionId == null) return
    api.coverageIssues(sessionId).then(setIssues).catch(fail)
  }, [sessionId, fail])

  const seriesFor = (name: string) => series.find((s) => s.kpi === name) ?? null
  const maxSeq = Math.max(0, (session?.sampleCount ?? 1) - 1)

  const jumpToTime = (ts: string) => {
    const p = track.find((t) => t.ts >= ts)
    if (p) setCursorSeq(p.seq)
  }

  const chart = (name: string, filled = false) => {
    const s = seriesFor(name)
    return s ? (
      <TimeSeriesChart key={name} series={s} cursorSeq={cursorSeq}
                       onCursorChange={setCursorSeq} filled={filled} />
    ) : null
  }

  const renderWorkbook = () => {
    switch (workbook) {
      case 'overview':
        return (
          <>
            <RouteMap track={track} cells={cells} cursorSeq={cursorSeq}
                      onCursorChange={setCursorSeq} kpiName={activeDef?.displayName ?? kpi}
                      bins={bins} />
            {chart(kpi)}
            <ParameterGrid snapshot={snapshot} />
          </>
        )
      case 'radio':
        return <>{chart('RSRP')}{chart('RSRQ')}{chart('SINR')}<ParameterGrid snapshot={snapshot} /></>
      case 'throughput':
        return <>{chart('MAC_DL_THROUGHPUT', true)}{chart('MAC_UL_THROUGHPUT', true)}{chart('DL_BLER')}</>
      case 'mobility':
        return (
          <>
            <RouteMap track={track} cells={cells} cursorSeq={cursorSeq}
                      onCursorChange={setCursorSeq} kpiName={activeDef?.displayName ?? kpi} />
            <div className="panel">
              <header><span className="title">Events</span>
                <span className="meta">{events.length}</span></header>
              <div style={{ maxHeight: 260, overflow: 'auto' }}>
                <EventList events={events} onPick={jumpToTime} />
              </div>
            </div>
          </>
        )
      case 'signaling':
        return (
          <div className="panel">
            <header><span className="title">L3 / RRC signalling</span>
              <span className="meta">{messages.length} messages</span></header>
            <div style={{ maxHeight: 520, overflow: 'auto' }}>
              <MessageList messages={messages} />
            </div>
          </div>
        )
      case 'coverage':
        return (
          <>
            <RouteMap track={track} cells={cells} cursorSeq={cursorSeq}
                      onCursorChange={setCursorSeq} kpiName={activeDef?.displayName ?? kpi}
                      bins={bins} />
            <div className="panel">
              <header>
                <span className="title">Detected coverage issues</span>
                <span className="meta">{issues.length}</span>
              </header>
              <div style={{ maxHeight: 320, overflow: 'auto' }}>
                <table className="grid">
                  <thead><tr><th>Type</th><th>Severity</th><th className="num">Samples</th>
                    <th>Detail</th></tr></thead>
                  <tbody>
                    {issues.map((x, i) => (
                      <tr key={i} className={`deg-row issue-${x.type}`}
                          onClick={() => setCursorSeq(x.startSeq)}>
                        <td>{x.type.replace('_', ' ')}</td>
                        <td className={x.severity === 'CRITICAL' ? 'sev-CRITICAL' : 'sev-WARNING'}>
                          {x.severity}
                        </td>
                        <td className="num">{x.sampleCount}</td>
                        <td style={{ whiteSpace: 'normal' }}>{x.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      case 'degradation':
        return (
          <>
            <div className="panel">
              <header>
                <span className="title">Detected degradation &mdash; {activeDef?.displayName}</span>
                <span className="meta">{degradations.length}</span>
              </header>
              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                <DegradationPanel items={degradations} unit={activeDef?.unit ?? ''}
                                  onPick={setCursorSeq} />
              </div>
            </div>
            {chart(kpi)}
          </>
        )
    }
  }

  return (
    <div className="app">
      <div className="toolbar">
        <span className="brand">VDT Analyzer</span>
        <div className="mode-tabs">
          <button className={mode === 'analyze' ? 'active' : ''}
                  onClick={() => setMode('analyze')}>Analysis</button>
          <button className={mode === 'compare' ? 'active' : ''}
                  onClick={() => setMode('compare')}>Compare</button>
          <button className={mode === 'lab' ? 'active' : ''}
                  onClick={() => setMode('lab')}>Lab Campaigns</button>
          <button className={mode === 'import' ? 'active' : ''}
                  onClick={() => setMode('import')}>Import</button>
        </div>
        {mode === 'analyze' && (
          <>
            <div className="group">
              <label>Measurement</label>
              <select value={sessionId ?? ''}
                      onChange={(e) => setSessionId(Number(e.target.value))}>
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="group">
              <label>KPI</label>
              <select value={kpi} onChange={(e) => setKpi(e.target.value)}>
                {defs.map((d) => <option key={d.name} value={d.name}>{d.displayName}</option>)}
              </select>
            </div>
            <div className="group">
              <label>Area bins</label>
              <select value={binSize} onChange={(e) => setBinSize(Number(e.target.value))}>
                <option value={0}>off (raw route)</option>
                <option value={50}>50 m</option>
                <option value={150}>150 m</option>
                <option value={500}>500 m</option>
              </select>
            </div>
            <div className="group">
              <label>Export</label>
              {sessionId != null && (
                <>
                  <a href={api.exportUrl(sessionId, 'csv')} download>CSV</a>
                  <a href={api.exportUrl(sessionId, 'geojson', kpi)} download>GeoJSON</a>
                </>
              )}
            </div>
          </>
        )}
        <span className="spacer" />
        {session && <span className="dim">{session.device} · {session.technology}
          {session.scenario ? ` · ${session.scenario}` : ''}</span>}
      </div>

      {error && <div className="error">{error}</div>}

      {mode === 'compare' ? (
        <div className="body"><div className="center"><CompareView sessions={sessions} /></div></div>
      ) : mode === 'lab' ? (
        <div className="body"><div className="center"><LabView /></div></div>
      ) : mode === 'import' ? (
        <div className="body"><div className="center">
          <ImportView onImported={() => api.sessions().then(setSessions).catch(fail)} />
        </div></div>
      ) : (
        <>
          <div className="body">
            <div className="dock">
              <div className="dock-section" style={{ flex: 1 }}>
                <h3>Parameters</h3>
                <div className="content" style={{ flex: 1 }}>
                  <ParameterTree defs={defs} active={kpi} onSelect={setKpi} />
                </div>
              </div>
            </div>

            <div className="center">
              <div className="panels">{renderWorkbook()}</div>
              <div className="workbook-tabs">
                {WORKBOOKS.map((w) => (
                  <button key={w.id} className={workbook === w.id ? 'active' : ''}
                          onClick={() => setWorkbook(w.id)}>{w.label}</button>
                ))}
              </div>
            </div>

            <div className="dock right">
              <div className="dock-section">
                <h3>Color Legends</h3>
                <div className="content"><LegendPanel dist={dist} /></div>
              </div>
              <div className="dock-section" style={{ flex: 1, minHeight: 0 }}>
                <h3>Numerical Data</h3>
                <div className="content" style={{ flex: 1 }}>
                  <table className="grid">
                    <tbody>
                      {snapshot && Object.values(snapshot.byCategory).flat().map((v) => (
                        <tr key={v.kpi}>
                          <td>{v.displayName}</td>
                          <td className={`num sev-${v.severity}`}>
                            {v.value == null ? '-' : v.value.toFixed(v.decimals)}
                          </td>
                          <td style={{ color: '#666' }}>{v.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="dock-section" style={{ maxHeight: 190 }}>
                <h3>Events ({events.length})</h3>
                <div className="content" style={{ maxHeight: 160 }}>
                  <EventList events={events} onPick={jumpToTime} />
                </div>
              </div>
            </div>
          </div>

          <div className="statusbar">
            <span>START <b>{session ? new Date(session.startedAt).toISOString().slice(11, 19) : '-'}</b></span>
            <span>END <b>{session ? new Date(session.endedAt).toISOString().slice(11, 19) : '-'}</b></span>
            <span>CURRENT <b style={{ color: 'var(--cursor)' }}>
              {snapshot ? new Date(snapshot.ts).toISOString().slice(11, 19) : '-'}
            </b></span>
            <div className="progress"
                 onMouseDown={(e) => {
                   const box = e.currentTarget.getBoundingClientRect()
                   setCursorSeq(Math.round(((e.clientX - box.left) / box.width) * maxSeq))
                 }}>
              <div className="fill" style={{ width: `${(cursorSeq / Math.max(1, maxSeq)) * 100}%` }} />
              <div className="knob" style={{ left: `${(cursorSeq / Math.max(1, maxSeq)) * 100}%` }} />
            </div>
            <span className="dim">seq {cursorSeq} / {maxSeq}</span>
            <span className="dim">{session?.name}</span>
          </div>
        </>
      )}
    </div>
  )
}

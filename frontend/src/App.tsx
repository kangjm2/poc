import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api/client'
import type {
  AreaBin, CellRef, CoverageIssue, Degradation, Distribution, EventType, KpiDefinition,
  CellFootprint, MonitoredSet, NetworkEvent, SeqRange, Series, SessionSummary,
  SignalingMessage, Snapshot, TrackPoint, Workbook,
} from './api/types'
import { RouteMap } from './components/RouteMap'
import { TimeSeriesChart } from './components/TimeSeriesChart'
import {
  DegradationPanel, EventList, LegendPanel, MessageList, ParameterGrid, ParameterTree,
} from './components/Panels'
import { CompareView } from './components/CompareView'
import { CellsPage } from './components/CellBarChart'
import { MonitoredSetDock, MonitoredSetPage } from './components/MonitoredSetPanel'
import { ComposedWorkbook } from './components/ComposedWorkbook'
import { DistanceProfile } from './components/DistanceProfile'
import { ProblemSurveyPanel } from './components/ProblemSurveyPanel'
import { FieldToLabPanel } from './components/FieldToLabPanel'
import { StatisticsPanel } from './components/StatisticsPanel'
import { LabView } from './components/LabView'
import { ImportView } from './components/ImportView'
import { LegendEditor } from './components/LegendEditor'

/**
 * Workbook pages. Existing users switch screen sets from a tab strip along the
 * bottom, so the same idea is kept here rather than a side navigation.
 */
const WORKBOOKS = [
  { id: 'overview', label: 'Overview' },
  { id: 'radio', label: 'Radio Quality' },
  { id: 'throughput', label: 'Throughput' },
  { id: 'fronthaul', label: 'Fronthaul' },
  { id: 'cells', label: 'Cells' },
  { id: 'neighbours', label: 'Monitored Set' },
  { id: 'mobility', label: 'Mobility' },
  { id: 'signaling', label: 'L3 Signalling' },
  { id: 'problems', label: 'Problem Survey' },
  { id: 'degradation', label: 'Degradation' },
  { id: 'coverage', label: 'Coverage Issues' },
  { id: 'statistics', label: 'Statistics' },
  { id: 'fieldtolab', label: 'Field-to-Lab' },
] as const
type BuiltInId = (typeof WORKBOOKS)[number]['id']
/**
 * A tab is either one of the built-in screens or a composed workbook, addressed as
 * `wb:<id>`. Two kinds rather than one list because they really are different things: the
 * built-ins hold panels that are not panes - a bring-up sequence, an import form - and
 * flattening them into pane rows would have meant inventing a pane type per screen.
 */
type WorkbookId = BuiltInId | `wb:${number}`

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
  // Distance binning is a different question from area binning, not a different size of the
  // same one, so it gets its own control rather than sharing the tile selector.
  const [distanceStep, setDistanceStep] = useState(0)
  const [showFootprints, setShowFootprints] = useState(false)
  const [footprints, setFootprints] = useState<CellFootprint[] | null>(null)
  const [workbooks, setWorkbooks] = useState<Workbook[]>([])
  const [issues, setIssues] = useState<CoverageIssue[]>([])

  const [track, setTrack] = useState<TrackPoint[]>([])
  const [cells, setCells] = useState<CellRef[]>([])
  const [series, setSeries] = useState<Series[]>([])
  const [dist, setDist] = useState<Distribution | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  // Fetched once per cursor move and shared by the dock table, the map lines and the
  // monitored-set bars. Three components showing one instant must not each ask for it -
  // besides the wasted requests, they could render different answers mid-flight.
  const [monitored, setMonitored] = useState<MonitoredSet | null>(null)
  const [events, setEvents] = useState<NetworkEvent[]>([])
  const [messages, setMessages] = useState<SignalingMessage[]>([])
  const [degradations, setDegradations] = useState<Degradation[]>([])

  // The single time cursor every panel reads from. This shared cursor is the
  // interaction existing users rely on most, so it lives at the top of the tree.
  const [cursorSeq, setCursorSeq] = useState(0)
  // Session-independent, so it is fetched once rather than per drive.
  const [eventTypes, setEventTypes] = useState<Map<string, EventType>>(new Map())
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A sub-selection of the drive. Statistics, the legend and the degradation list
  // honour it; the map and charts keep the whole drive so the selection stays in
  // context. The active range is shown as a chip because a filter the user cannot
  // see is a filter they will forget is on.
  const [range, setRange] = useState<SeqRange | null>(null)

  // The selected KPI's own series, fetched on demand when it is not one of the
  // pre-fetched overview KPIs - otherwise 12 of the 18 KPIs would have no chart.
  const [extraSeries, setExtraSeries] = useState<Series | null>(null)
  const [fhSeries, setFhSeries] = useState<Series[]>([])

  // Editing a colour scale changes how every view paints, so a save bumps this and
  // the fetches that depend on the bins re-run.
  const [editingScale, setEditingScale] = useState(false)
  const [scaleVersion, setScaleVersion] = useState(0)

  const session = sessions.find((s) => s.id === sessionId) ?? null
  const activeDef = defs.find((d) => d.name === kpi) ?? null

  const fail = useCallback((e: unknown) => setError(String(e)), [])

  useEffect(() => {
    api.sessions().then((s) => {
      setSessions(s)
      if (s.length) setSessionId([...s].sort((a, b) => a.id - b.id)[0].id)
    }).catch(fail)
    api.kpiDefinitions().then(setDefs).catch(fail)
    api.eventTypes()
      .then((ts) => setEventTypes(new Map(ts.map((t) => [t.name, t]))))
      .catch(fail)
  }, [fail])

  const SERIES_KPIS = useMemo(() => [
    'RSRP', 'RSRQ', 'SINR', 'MAC_DL_THROUGHPUT', 'MAC_UL_THROUGHPUT', 'DL_BLER',
  ], [])

  useEffect(() => {
    if (sessionId == null) return
    setError(null)
    setCursorSeq(0)
    setPlaying(false)
    setRange(null)
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
  }, [sessionId, kpi, scaleVersion, fail])

  useEffect(() => {
    if (sessionId == null) return
    api.distribution(sessionId, kpi, range).then(setDist).catch(fail)
    api.degradations(sessionId, kpi, 5, range).then(setDegradations).catch(fail)
  }, [sessionId, kpi, range, scaleVersion, fail])

  useEffect(() => {
    if (sessionId == null || SERIES_KPIS.includes(kpi)) { setExtraSeries(null); return }
    api.series(sessionId, [kpi]).then((s) => setExtraSeries(s[0] ?? null)).catch(fail)
  }, [sessionId, kpi, SERIES_KPIS, fail])

  useEffect(() => {
    if (sessionId == null || workbook !== 'fronthaul') return
    api.series(sessionId, ['FH_RX_LATE', 'FH_RX_ON_TIME']).then(setFhSeries).catch(fail)
  }, [sessionId, workbook, fail])

  useEffect(() => {
    if (sessionId == null) return
    api.snapshot(sessionId, cursorSeq).then(setSnapshot).catch(() => { /* seq may be out of range */ })
  }, [sessionId, cursorSeq, scaleVersion])

  useEffect(() => {
    if (sessionId == null) { setMonitored(null); return }
    let live = true
    api.monitoredSet(sessionId, cursorSeq)
      .then((d) => { if (live) setMonitored(d) })
      .catch(() => { if (live) setMonitored(null) })
    return () => { live = false }
  }, [sessionId, cursorSeq])

  useEffect(() => {
    if (sessionId == null || binSize === 0) { setBins(null); return }
    api.bins(sessionId, kpi, binSize).then(setBins).catch(fail)
  }, [sessionId, kpi, binSize, scaleVersion, fail])

  // Footprints are fetched only when asked for. They are per-session and change with
  // neither the KPI nor the cursor, so refetching alongside those would be pure waste.
  useEffect(() => {
    if (sessionId == null || !showFootprints) { setFootprints(null); return }
    let live = true
    api.cellFootprints(sessionId)
      .then((f) => { if (live) setFootprints(f) })
      .catch(() => { if (live) setFootprints(null) })
    return () => { live = false }
  }, [sessionId, showFootprints])

  const reloadWorkbooks = useCallback(() => {
    api.workbooks().then(setWorkbooks).catch(() => setWorkbooks([]))
  }, [])
  useEffect(reloadWorkbooks, [reloadWorkbooks])

  useEffect(() => {
    if (sessionId == null) return
    api.coverageIssues(sessionId).then(setIssues).catch(fail)
  }, [sessionId, fail])

  const seriesFor = (name: string) =>
    series.find((s) => s.kpi === name)
    ?? (extraSeries?.kpi === name ? extraSeries : null)
  const maxSeq = Math.max(0, (session?.sampleCount ?? 1) - 1)

  // Playback: the cursor sweeps the drive so the engineer can watch the grid,
  // charts and map move together, the way the run originally unfolded.
  useEffect(() => {
    if (!playing) return
    const stepSize = Math.max(1, Math.round(maxSeq / 240))
    const timer = setInterval(() => {
      setCursorSeq((s) => {
        if (s + stepSize >= maxSeq) { setPlaying(false); return maxSeq }
        return s + stepSize
      })
    }, 250)
    return () => clearInterval(timer)
  }, [playing, maxSeq])

  const removeSession = async () => {
    if (!session) return
    if (!window.confirm(`Delete measurement "${session.name}" and all its data?`)) return
    try {
      await api.deleteSession(session.id)
      const s = await api.sessions()
      setSessions(s)
      setSessionId(s.length ? [...s].sort((a, b) => a.id - b.id)[0].id : null)
    } catch (e) {
      fail(e)
    }
  }

  const openSessionFromLab = (id: number) => {
    setMode('analyze')
    setSessionId(id)
  }

  // Events now arrive with the seq the server resolved against the FULL sample table.
  // This used to scan `track`, which is decimated, so on a long drive an event jumped to
  // whichever sample happened to survive thinning rather than to its own.
  const jumpToSeq = (seq: number) => setCursorSeq(seq)

  const chart = (name: string, filled = false) => {
    const s = seriesFor(name)
    return s ? (
      <TimeSeriesChart key={name} series={s} cursorSeq={cursorSeq}
                       onCursorChange={setCursorSeq} filled={filled}
                       events={events} eventTypes={eventTypes} />
    ) : null
  }

  const chartOf = (s: Series, filled = false) => (
    <TimeSeriesChart key={s.kpi} series={s} cursorSeq={cursorSeq}
                     onCursorChange={setCursorSeq} filled={filled}
                     events={events} eventTypes={eventTypes} />
  )

  const renderWorkbook = () => {
    // A composed workbook is addressed as `wb:<id>`, so it is matched before the switch
    // rather than added as a case: its id is not a literal.
    if (typeof workbook === 'string' && workbook.startsWith('wb:')) {
      const book = workbooks.find((w) => `wb:${w.id}` === workbook)
      if (!book) return <div className="loading">Loading…</div>
      return (
        <ComposedWorkbook
          key={book.id}
          workbook={book}
          sessionId={sessionId}
          defs={defs}
          track={track}
          cells={cells}
          cursorSeq={cursorSeq}
          onCursorChange={setCursorSeq}
          onSaved={(w) => setWorkbooks((ws) => ws.map((x) => (x.id === w.id ? w : x)))}
          onDeleted={(id) => {
            setWorkbooks((ws) => ws.filter((x) => x.id !== id))
            setWorkbook('overview')
          }}
        />
      )
    }
    switch (workbook) {
      case 'overview':
        return (
          <>
            <RouteMap track={track} cells={cells} cursorSeq={cursorSeq}
                      onCursorChange={setCursorSeq} kpiName={activeDef?.displayName ?? kpi}
                      bins={bins} footprints={footprints}
                      events={events} eventTypes={eventTypes} />
            {distanceStep > 0 && (
              <DistanceProfile sessionId={sessionId} kpiName={kpi} stepMeters={distanceStep}
                               cursorSeq={cursorSeq} onJump={setCursorSeq} />
            )}
            {chart(kpi)}
            <ParameterGrid snapshot={snapshot} />
          </>
        )
      case 'radio':
        return <>{chart('RSRP')}{chart('RSRQ')}{chart('SINR')}<ParameterGrid snapshot={snapshot} /></>
      case 'throughput':
        return <>{chart('MAC_DL_THROUGHPUT', true)}{chart('MAC_UL_THROUGHPUT', true)}{chart('DL_BLER')}</>
      case 'fronthaul': {
        // Transport counters above their radio-side consequences: a timing fault
        // shows as RX-late rising and throughput sagging while RSRP stays flat -
        // the separation this page exists to make visible.
        const fh = fhSeries.filter((s) => s.points.some((p) => p.value != null))
        if (fh.length === 0) {
          return (
            <div className="panel">
              <header><span className="title">Fronthaul (O-RAN 7.2x)</span></header>
              <div className="loading">
                No fronthaul counters in this session. They exist only for lab runs
                injected at the fronthaul; RF-connected and field measurements have none.
              </div>
            </div>
          )
        }
        return <>{fh.map((s) => chartOf(s))}{chart('MAC_DL_THROUGHPUT', true)}{chart('RSRP')}</>
      }
      case 'mobility':
        return (
          <>
            {/* The mobility page is where cell relationships are read, so this is the map
                that draws lines to the monitored cells as well as the serving one. The
                other maps stay uncluttered: a fan of lines is an investigation aid, not
                something every view needs. */}
            <RouteMap track={track} cells={cells} cursorSeq={cursorSeq}
                      onCursorChange={setCursorSeq} kpiName={activeDef?.displayName ?? kpi}
                      monitored={monitored?.cells ?? null} footprints={footprints}
                      events={events} eventTypes={eventTypes} />
            <div className="panel">
              <header>
                <span className="title">Cells</span>
                <span className="meta">
                  {cells.length} · serving PCI {snapshot?.servingPci ?? '-'}
                </span>
              </header>
              <table className="grid">
                <thead><tr><th>PCI</th><th>Cell type</th><th>Band</th>
                  <th className="num">ARFCN</th><th className="num">GSCN</th>
                  <th className="num">Azimuth</th></tr></thead>
                <tbody>
                  {cells.map((c) => (
                    <tr key={c.id}
                        style={c.pci === snapshot?.servingPci
                          ? { background: '#eef3fa', fontWeight: 600 } : undefined}>
                      <td>{c.pci}</td>
                      <td>{c.cellType ?? '-'}</td>
                      <td>{c.band ?? '-'}</td>
                      <td className="num">{c.arfcn}</td>
                      <td className="num">{c.gscn ?? '-'}</td>
                      <td className="num">{c.azimuthDeg == null ? '-' : `${c.azimuthDeg}°`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel">
              <header><span className="title">Events</span>
                <span className="meta">{events.length}</span></header>
              <div style={{ maxHeight: 260, overflow: 'auto' }}>
                <EventList events={events} types={eventTypes} onPick={jumpToSeq} />
              </div>
            </div>
          </>
        )
      case 'signaling':
        return (
          <div className="panel">
            <header>
              <span className="title">L3 / RRC signalling</span>
              <span className="meta">
                {messages.length} messages · following cursor
                {snapshot ? ` @ ${new Date(snapshot.ts).toISOString().slice(11, 19)}` : ''}
              </span>
            </header>
            <div style={{ maxHeight: 520, overflow: 'auto' }}>
              <MessageList messages={messages} cursorTs={snapshot?.ts ?? null} />
            </div>
          </div>
        )
      case 'fieldtolab':
        return <FieldToLabPanel sessionId={sessionId} />
      case 'problems':
        return <ProblemSurveyPanel sessionId={sessionId} onPick={setCursorSeq}
                                events={events} eventTypes={eventTypes} />
      case 'neighbours':
        return <MonitoredSetPage sessionId={sessionId} set={monitored}
                                 onJump={setCursorSeq} />
      case 'cells':
        return (
          <CellsPage sessionId={sessionId} kpi={kpi} range={range}
                     scaleVersion={scaleVersion} />
        )
      case 'statistics':
        return (
          <StatisticsPanel sessionId={sessionId} kpi={kpi} unit={activeDef?.unit ?? ''}
                           range={range} />
        )
      case 'coverage':
        return (
          <>
            <RouteMap track={track} cells={cells} cursorSeq={cursorSeq}
                      onCursorChange={setCursorSeq} kpiName={activeDef?.displayName ?? kpi}
                      bins={bins} footprints={footprints}
                      events={events} eventTypes={eventTypes} />
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
              <label title="Averages per unit of road travelled, so a stop at a light stops
                     dominating the average">Distance bins</label>
              <select value={distanceStep}
                      onChange={(e) => setDistanceStep(Number(e.target.value))}>
                <option value={0}>off</option>
                <option value={50}>50 m</option>
                <option value={100}>100 m</option>
                <option value={250}>250 m</option>
              </select>
            </div>
            <div className="group">
              <label title="The outline of where each cell was measured serving">
                Footprints</label>
              <button onClick={() => setShowFootprints((v) => !v)}
                      style={showFootprints ? { fontWeight: 600 } : undefined}>
                {showFootprints ? 'on' : 'off'}
              </button>
            </div>
            <div className="group">
              <label>Export</label>
              {sessionId != null && (
                <>
                  <a href={api.exportUrl(sessionId, 'csv')} download>CSV</a>
                  <a href={api.exportUrl(sessionId, 'geojson', kpi)} download>GeoJSON</a>
                  <a href={api.reportUrl(sessionId)} target="_blank" rel="noreferrer"
                     title="Printable session report">Report</a>
                </>
              )}
            </div>
            {range && (
              <span className="filter-chip" title="Applies to the legend, statistics and degradation list">
                Filter: seq {range.from ?? 0}&ndash;{range.to ?? maxSeq}
                <button onClick={() => setRange(null)} aria-label="Clear range filter">✕</button>
              </span>
            )}
            {session && (
              <button className="danger" onClick={removeSession}
                      title="Delete this measurement and all its data">Delete</button>
            )}
          </>
        )}
        <span className="spacer" />
        {session && <span className="dim">{session.device} · {session.technology}
          {session.scenario ? ` · ${session.scenario}` : ''}</span>}
      </div>

      {mode === 'analyze' && session?.notes && (
        <div className="session-notes">{session.notes}</div>
      )}

      {error && (
        <div className="error">
          {error}
          <button onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}

      {editingScale && activeDef && (
        <LegendEditor def={activeDef}
                      proposed={dist?.bins.map((b, i) => ({
                        ordinal: i,
                        lowerBound: b.lowerBound,
                        upperBound: b.upperBound,
                        color: b.color,
                        label: b.label,
                        severity: b.severity,
                      }))}
                      onClose={() => setEditingScale(false)}
                      onDeleted={(name) => {
                        setDefs((prev) => prev.filter((d) => d.name !== name))
                        if (kpi === name) setKpi('RSRP')
                      }}
                      onSaved={(updated) => {
                        setDefs((prev) => prev.map((d) => (d.name === updated.name ? updated : d)))
                        setScaleVersion((v) => v + 1)
                      }} />
      )}

      {mode === 'compare' ? (
        <div className="body"><div className="center"><CompareView sessions={sessions} /></div></div>
      ) : mode === 'lab' ? (
        <div className="body"><div className="center">
          <LabView onOpenSession={openSessionFromLab} />
        </div></div>
      ) : mode === 'import' ? (
        <div className="body"><div className="center">
          <ImportView onImported={() => {
            api.sessions().then(setSessions).catch(fail)
            // An import can define KPIs, so the catalogue is reloaded too - otherwise
            // the parameter tree keeps showing the set that existed at page load and
            // the columns the user just chose to keep are invisible.
            api.kpiDefinitions().then(setDefs).catch(fail)
          }} />
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
                {workbooks.map((w) => (
                  <button key={`wb:${w.id}`}
                          className={workbook === `wb:${w.id}` ? 'active' : ''}
                          title={`Composed workbook — ${w.panes.length} pane(s)`}
                          onClick={() => setWorkbook(`wb:${w.id}`)}>{w.name}</button>
                ))}
                {/* The `+` the reference has and we did not. Everything after this point
                    on the strip is the user's, not ours. */}
                <button title="New workbook — compose your own panes"
                        onClick={async () => {
                          const created = await api.saveWorkbook({
                            id: null, name: 'New workbook', panes: [],
                          })
                          setWorkbooks((ws) => [...ws, created])
                          setWorkbook(`wb:${created.id}`)
                        }}>+</button>
              </div>
            </div>

            <div className="dock right">
              <div className="dock-section">
                <h3>Color Legends</h3>
                <div className="content">
                  <LegendPanel dist={dist}
                               onEdit={activeDef ? () => setEditingScale(true) : undefined} />
                </div>
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
              <div className="dock-section" style={{ maxHeight: 170 }}>
                <h3>Monitored Set</h3>
                <div className="content" style={{ maxHeight: 140 }}>
                  <MonitoredSetDock data={monitored} />
                </div>
              </div>
              <div className="dock-section" style={{ maxHeight: 190 }}>
                <h3>Events ({events.length})</h3>
                <div className="content" style={{ maxHeight: 160 }}>
                  <EventList events={events} types={eventTypes} onPick={jumpToSeq} />
                </div>
              </div>
            </div>
          </div>

          <div className="statusbar">
            <button className="play" onClick={() => setPlaying((p) => !p)}
                    title={playing ? 'Pause playback' : 'Play the drive'}>
              {playing ? '⏸' : '▶'}
            </button>
            <span>START <b>{session ? new Date(session.startedAt).toISOString().slice(11, 19) : '-'}</b></span>
            <span>END <b>{session ? new Date(session.endedAt).toISOString().slice(11, 19) : '-'}</b></span>
            <span>CURRENT <b style={{ color: 'var(--cursor)' }}>
              {snapshot ? new Date(snapshot.ts).toISOString().slice(11, 19) : '-'}
            </b></span>
            <div className="progress"
                 // Press and drag scrubs, the way the charts already do. Click-only
                 // meant the one control that spans the whole run could not be swept.
                 onMouseDown={(e) => {
                   const box = e.currentTarget.getBoundingClientRect()
                   const seek = (clientX: number) => setCursorSeq(Math.max(0, Math.min(maxSeq,
                     Math.round(((clientX - box.left) / box.width) * maxSeq))))
                   seek(e.clientX)
                   const move = (ev: MouseEvent) => seek(ev.clientX)
                   const up = () => {
                     window.removeEventListener('mousemove', move)
                     window.removeEventListener('mouseup', up)
                   }
                   window.addEventListener('mousemove', move)
                   window.addEventListener('mouseup', up)
                 }}>
              <div className="fill" style={{ width: `${(cursorSeq / Math.max(1, maxSeq)) * 100}%` }} />
              <div className="knob" style={{ left: `${(cursorSeq / Math.max(1, maxSeq)) * 100}%` }} />
            </div>
            <span className="dim">seq {cursorSeq} / {maxSeq}</span>
            <span className="range-marks">
              <button onClick={() => setRange((r) => ({ from: cursorSeq, to: r?.to ?? null }))}
                      title="Filter from the cursor position onwards">From here</button>
              <button onClick={() => setRange((r) => ({ from: r?.from ?? null, to: cursorSeq }))}
                      title="Filter up to the cursor position">To here</button>
            </span>
            <span className="dim">{session?.name}</span>
          </div>
        </>
      )}
    </div>
  )
}

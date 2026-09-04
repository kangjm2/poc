import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api/client'
import type {
  AreaBin, CellRef, CoverageIssue, Degradation, Distribution, EventType, KpiDefinition,
  AreaStats, CellFootprint, MonitoredSet, NeighbourBar, NetworkEvent, SeqRange, Series,
  SessionSummary,
  SignalingMessage, Snapshot, TrackPoint, Workbook,
} from './api/types'
import { RouteMap } from './components/RouteMap'
import { TimeSeriesChart } from './components/TimeSeriesChart'
import {
  DegradationPanel, EventColourEditor, EventList, LegendPanel, MapLayerDock, MessageList,
  ParameterGrid, ParameterTree, PciLegend,
} from './components/Panels'
import { CompareView } from './components/CompareView'
import { CohortView } from './components/CohortView'
import { parsePciFilter } from './view/pciFilter'
import { CellsPage } from './components/CellBarChart'
import { CellLocatorPanel, useCellEstimates } from './components/CellLocatorPanel'
import { MonitoredSetDock, MonitoredSetPage } from './components/MonitoredSetPanel'
import { ComposedWorkbook } from './components/ComposedWorkbook'
import { DistanceProfile } from './components/DistanceProfile'
import { ProblemSurveyPanel } from './components/ProblemSurveyPanel'
import { AreaStatsPanel } from './components/AreaStatsPanel'
import { SpatialDiffPanel } from './components/SpatialDiffPanel'
import { FieldToLabPanel } from './components/FieldToLabPanel'
import { StatisticsPanel } from './components/StatisticsPanel'
import { LabView } from './components/LabView'
import { ImportView } from './components/ImportView'
import { LegendEditor } from './components/LegendEditor'
import { KeySheet } from './components/KeySheet'
import { SessionFilter } from './components/SessionFilter'
import { GlobalFilterBar } from './components/GlobalFilterBar'
import { bindingFor, isTypingTarget } from './view/keymap'
import { PRIORITY, dismissTop, useDismissable } from './view/dismiss'
import type { Correction } from './view/state'
import { encodeView, parseView, reconcile } from './view/state'
import type { ColorBy } from './view/paint'
import { buildPciColors } from './view/paint'
import type { LayerToggle, MapContents } from './view/maplayers'
import { describeLayers } from './view/maplayers'

/**
 * Workbook pages. Existing users switch screen sets from a tab strip along the
 * bottom, so the same idea is kept here rather than a side navigation.
 *
 * `isolates` says whether this screen draws anything the colour scale paints, and so
 * whether clicking a legend band can do what the legend says it does.
 *
 * `reads` says which toolbar groups this screen actually consumes. Same reason, same
 * shape: the toolbar cannot see the screen either. Before this column every group was
 * offered on every tab while three tabs consumed them, so "Ask an area" latched to
 * "Drawing…" on screens with no map, "Area bins" fetched tiles Mobility never drew,
 * "Distance bins" wrote a dead `ds=` into a shared link, and "Colour by: Serving cell"
 * swapped the legend beside a map still painted by KPI. A control that is offered and
 * ignored is worse than one that is absent - the user concludes the data has nothing to
 * say.
 *
 * It is a column here rather than a check inside the legend or the toolbar because
 * neither can see the screen. Before these columns the dock offered isolation on all
 * fourteen tabs while four honoured it: on the other ten the legend answered a click with
 * "the rest of the drive is drawn grey" over a screen that had no drive on it. Adding a
 * screen now means answering both questions in the same row that names it.
 */
type ToolGroup = 'colour' | 'areaBins' | 'distanceBins' | 'area' | 'footprints'
const WORKBOOKS = [
  { id: 'overview', label: 'Overview', isolates: true,
    reads: ['colour', 'areaBins', 'distanceBins', 'area', 'footprints'] },
  { id: 'radio', label: 'Radio Quality', isolates: false, reads: [] },
  { id: 'throughput', label: 'Throughput', isolates: false, reads: [] },
  { id: 'fronthaul', label: 'Fronthaul', isolates: false, reads: [] },
  { id: 'cells', label: 'Cells', isolates: true, reads: [] },
  { id: 'neighbours', label: 'Monitored Set', isolates: false, reads: [] },
  // No area bins: tiles REPLACE the route, and this map exists for the fan of lines from
  // the cursor to the monitored set. Drawing tiles here would delete the reason for it.
  { id: 'mobility', label: 'Mobility', isolates: true, reads: ['colour', 'footprints'] },
  { id: 'signaling', label: 'L3 Signalling', isolates: false, reads: [] },
  { id: 'problems', label: 'Problem Survey', isolates: false, reads: [] },
  { id: 'degradation', label: 'Degradation', isolates: false, reads: [] },
  { id: 'coverage', label: 'Coverage Issues', isolates: true,
    reads: ['colour', 'areaBins', 'footprints'] },
  { id: 'statistics', label: 'Statistics', isolates: false, reads: [] },
  { id: 'fieldtolab', label: 'Field-to-Lab', isolates: false, reads: [] },
  { id: 'spatialdiff', label: 'Compare on the Ground', isolates: false, reads: [] },
] as const
type BuiltInId = (typeof WORKBOOKS)[number]['id']
/**
 * A tab is either one of the built-in screens or a composed workbook, addressed as
 * `wb:<id>`. Two kinds rather than one list because they really are different things: the
 * built-ins hold panels that are not panes - a bring-up sequence, an import form - and
 * flattening them into pane rows would have meant inventing a pane type per screen.
 */
/**
 * Playback rates, in samples per second.
 *
 * The step is always one sample, so the ladder is what makes a long drive watchable:
 * 1174 samples take 20 minutes at 1/s and 18 seconds at 64/s, and 7200 samples take
 * under two minutes at the top rate - while every sample is still visited.
 *
 * The cursor moving 64 times a second does NOT mean 64 requests a second: the two
 * per-cursor fetches are debounced separately (see CURSOR_FETCH_MS), which is what lets
 * the rate ladder be about watching rather than about the server.
 */
const RATES = [1, 4, 16, 64]

/**
 * How often the cursor's server fetches may fire, in ms.
 *
 * 125 ms is 8 per second, which is exactly what the old 250 ms tick produced with its two
 * uncancelled requests per move. Holding an arrow key repeats at roughly 30/s and the top
 * playback rate is 64/s; without this, either would multiply the request rate by eight.
 */
const CURSOR_FETCH_MS = 125

type WorkbookId = BuiltInId | `wb:${number}`

export function App() {
  // Read once, before the first render, so the initial fetches are already aimed at the
  // linked drive rather than at the oldest one and then corrected - which would show the
  // recipient a drive nobody sent them, briefly but visibly.
  const [initial] = useState(() => parseView(window.location.search))
  const [corrections, setCorrections] = useState<Correction[]>([])
  /**
   * The global filter, mirrored here only so the bar can render it and the effects below
   * can depend on it. The value that reaches the network lives in the api module, which
   * is the one place that decides which requests carry it - see `filtered` there.
   *
   * Pushed into the client in the same statement that initialises this state, before any
   * effect runs, so a link carrying `gf=` never fires one unfiltered round of requests
   * first. It is validated afterwards, and dropped with a notice if the server rejects
   * it, exactly as a bad seq or a missing drive is.
   */
  const [filterSpec, setFilterSpec] = useState<string | null>(() => {
    const spec = parseView(window.location.search).filter
    api.setGlobalFilter(spec)
    return spec
  })
  const [reconciled, setReconciled] = useState(false)

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionId, setSessionId] = useState<number | null>(initial.sessionId)
  const [defs, setDefs] = useState<KpiDefinition[]>([])
  const [kpi, setKpi] = useState(initial.kpi)
  const [workbook, setWorkbook] = useState<WorkbookId>(initial.workbook as WorkbookId)
  const [mode, setMode] = useState<'analyze' | 'compare' | 'lab' | 'import'>(initial.mode)
  /**
   * Which drive property the Compare tab groups by, or null for the two-drive comparison.
   *
   * The scope switch and the axis are one value: see `ViewState.cohortBy`. `cohortHold`
   * is three-valued - null lets the server choose the guard, `'NONE'` is an explicit
   * refusal of one - which is why it is not a boolean here either.
   */
  const [cohortBy, setCohortBy] = useState<string | null>(initial.cohortBy)
  const [cohortHold, setCohortHold] = useState<string | null>(initial.cohortHold)

  // Area binning replaces the raw route once a drive is too dense to read.
  const [binSize, setBinSize] = useState(initial.binSize)
  const [bins, setBins] = useState<AreaBin[] | null>(null)
  // Distance binning is a different question from area binning, not a different size of the
  // same one, so it gets its own control rather than sharing the tile selector.
  const [distanceStep, setDistanceStep] = useState(initial.distanceStep)
  const [showFootprints, setShowFootprints] = useState(initial.footprints)
  /**
   * What the route's colour means. See view/paint.ts: the KPI ramp is a verdict, the
   * serving cell is an identity, and they are not two palettes for one idea.
   */
  const [colorBy, setColorBy] = useState<ColorBy>('kpi')
  /**
   * One bin shown alone, the rest muted.
   *
   * Kept across tabs rather than cleared on every switch: the user isolated a bin to ask a
   * question, and stepping away to read a number is part of asking it. The legend simply
   * stops offering the control where nothing would honour it - see WORKBOOKS.isolates.
   */
  const [isolate, setIsolate] = useState<string | null>(null)
  /** What the legend's shares are weighted by. See view of AggregationBasis on the server. */
  const [legendBasis, setLegendBasis] = useState('SAMPLE')
  const [pciBars, setPciBars] = useState<NeighbourBar[]>([])
  /**
   * Events drawn on the map, or not.
   *
   * They had no control at all - they appeared because the drive had them, and on a busy
   * measurement they are the marks most often in the way of reading the route underneath.
   * The Layers dock is what made the absence obvious: every other row could be switched.
   */
  const [eventsHidden, setEventsHidden] = useState(false)
  /** The dotted line from the cursor to the cell serving it. Listed, so switchable. */
  const [servingLine, setServingLine] = useState(true)
  /** A shape is a question being asked now, so it lives in state and is not persisted. */
  const [drawingArea, setDrawingArea] = useState(false)
  const [areaStats, setAreaStats] = useState<AreaStats | null>(null)
  /**
   * The shape currently narrowing the map, as the server's "lat,lon;..." spec.
   *
   * Held beside areaStats rather than derived from it: the statistics are one answer about
   * the shape and the colouring is another, and closing the panel should not silently
   * restore the whole route's colours underneath it.
   */
  const [areaSpec, setAreaSpec] = useState<string | null>(null)
  /** Which statistic paints a tile. The server bins on it - see BinStatistic. */
  const [binStat, setBinStat] = useState('AVERAGE')
  /** Whether a footprint is where the cell served or where it was among the three best. */
  const [footprintBasis, setFootprintBasis] = useState('SERVING')
  /**
   * Which cells the footprint layer draws, in the reference's own filter syntax.
   *
   * UC1 p67 asks for this before it draws anything, and its dialog help gives the grammar:
   * `3,10-30,42,100-`. The manual states the reason too - "Analysis will not work properly
   * if there will be hundreds of pages in the results" - which is our reason as well: the
   * hulls overlap, and overlapping every cell at once is how the layer stops answering.
   *
   * The server has taken `pcis` since P2-2. Narrowing is done HERE, on the drawn set,
   * rather than by refetching: the parse has to produce the caption anyway, and a refetch
   * per keystroke would make a typo cost a round trip.
   */
  const [footprintCells, setFootprintCells] = useState('')
  /**
   * The cell the Cells page is framing, and the reference's own minimum accuracy score.
   *
   * `focusPci` is state rather than a call into the map because the map is a child: the
   * grid row names a cell, this holds which one, and RouteMap frames it. UC18 p171.
   */
  const [focusPci, setFocusPci] = useState<number | null>(null)
  const [locatorScore, setLocatorScore] = useState(0)
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
  const [cursorSeq, setCursorSeq] = useState(initial.seq)
  // Session-independent, so it is fetched once rather than per drive.
  const [eventTypes, setEventTypes] = useState<Map<string, EventType>>(new Map())
  const [eventColours, setEventColours] = useState(false)
  const [playing, setPlaying] = useState(false)
  /**
   * Playback in samples per second, and which way.
   *
   * The old loop always took 240 steps whatever the drive length - a reasonable way to
   * say "a minute end to end", but it made the STEP a function of the drive: on a
   * two-hour run it advanced 30 samples a tick, so 29 of every 30 samples could not be
   * reached by playing at all. The step is now always one sample and the RATE is what
   * changes, so no speed can skip a sample.
   */
  const [rate, setRate] = useState(RATES[1])
  const [reverse, setReverse] = useState(false)
  const [keySheet, setKeySheet] = useState(false)
  /** The find-a-measurement dialog. The picker alone is unusable past a few dozen. */
  const [finding, setFinding] = useState(false)
  /** Bumped to ask the map for a deliberate re-frame. */
  const [refitToken, setRefitToken] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // A sub-selection of the drive. Statistics, the legend and the degradation list
  // honour it; the map and charts keep the whole drive so the selection stays in
  // context. The active range is shown as a chip because a filter the user cannot
  // see is a filter they will forget is on.
  const [range, setRange] = useState<SeqRange | null>(initial.range)

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

  /**
   * Change the filter in the one place that can, and only to something the server accepts.
   *
   * Both writes happen together and in this order: the client module first, because the
   * refetch that the state change triggers must already see the new value, and a filter
   * that arrived one render late would repaint every panel with the previous condition.
   */
  const applyFilter = useCallback((spec: string | null) => {
    api.setGlobalFilter(spec)
    setFilterSpec(spec)
  }, [])

  /**
   * The map's entry point into the global filter (UC14 p149).
   *
   * Goes through `applyFilter` like the bar does, so the condition, the address bar and
   * the reach list are the same ones - a second path that set the filter its own way is
   * how two screens end up disagreeing about what is in force.
   */
  const filterToCell = useCallback((pci: number) => {
    applyFilter(`cell:${pci}`)
  }, [applyFilter])

  /**
   * Drop one event type from the statistics (`Exclude Events`, p94).
   *
   * ADDED to whatever is already in force rather than replacing it: excluding two kinds
   * of measurement failure is the ordinary case, and a second click that silently undid
   * the first would be a control that cannot express the thing it exists for. Already
   * excluded, and it is a no-op rather than a duplicate clause.
   */
  const excludeEventType = useCallback((eventType: string) => {
    const term = `notevent:${eventType}`
    const parts = (filterSpec ?? '').split(';').map((p) => p.trim()).filter(Boolean)
    if (parts.includes(term)) return
    applyFilter([...parts, term].join(';'))
  }, [applyFilter, filterSpec])

  // A spec off a link is a claim like any other and gets the same treatment: checked
  // against the server, and reported rather than silently kept if it does not parse.
  // Left in force while the check is in flight would mean every panel answering 400.
  useEffect(() => {
    if (!filterSpec) return
    let live = true
    api.describeFilter(filterSpec).catch((e: Error) => {
      if (!live) return
      api.setGlobalFilter(null)
      setFilterSpec(null)
      setCorrections((c) => c.some((x) => x.param === 'gf') ? c : [...c, {
        param: 'gf', raw: filterSpec, became: 'off',
        why: e.message.replace(/^\d+:\s*/, ''),
      }])
    })
    return () => { live = false }
    // Only when the spec itself changes; applyFilter has already validated anything the
    // bar sets, so this is here for links and for nothing else.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSpec])

  /**
   * True for exactly the first session the page adopts, when it came from the URL.
   *
   * A ref rather than state, and armed at CONSTRUCTION rather than by reconcile(). The
   * reset effect runs on mount, before the session list has even arrived, so anything
   * decided later is decided too late: the link's cursor is already back at 0 by then.
   * That is not hypothetical - it is what the first version of this did, and the handover
   * check caught it by comparing the recipient's clock against the server's timestamp for
   * the sent seq rather than against anything the page printed.
   */
  const openedFromLink = useRef(initial.sessionId != null)

  /**
   * Make the incoming view legal, once, as soon as there is something to judge it against.
   *
   * Runs after the session list AND the KPI catalogue arrive, because "no such
   * measurement" and "we have not looked yet" are different answers and only one of them
   * justifies rewriting somebody's link.
   */
  useEffect(() => {
    if (reconciled || sessions.length === 0 || defs.length === 0) return
    const { view, corrections: fixes } = reconcile(
      { ...initial, sessionId, kpi, workbook, seq: cursorSeq, range,
        mode, binSize, distanceStep, footprints: showFootprints, filter: filterSpec,
        cohortBy, cohortHold },
      sessions, defs)
    setReconciled(true)
    // Appended, not assigned. The filter check runs on mount and reconcile runs later,
    // when the session list arrives; assigning here threw away a rejected `gf=` that had
    // already been reported, leaving the recipient on a repaired view with no notice -
    // the one outcome this whole mechanism exists to prevent.
    setCorrections((c) => [...c, ...fixes])
    // Not re-armed here. When reconcile REPLACES the session - the linked drive is gone -
    // the reset is exactly what should happen, and it agrees with the seq and range this
    // function has already dropped. The flag only has to survive the reset effect's very
    // first run, which happens before this effect can, so it is armed at construction.
    if (view.sessionId !== sessionId) setSessionId(view.sessionId)
    if (view.kpi !== kpi) setKpi(view.kpi)
    if (view.seq !== cursorSeq) setCursorSeq(view.seq)
    if (view.range !== range) setRange(view.range)
    if (view.cohortHold !== cohortHold) setCohortHold(view.cohortHold)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, defs, reconciled])


  useEffect(() => {
    api.sessions().then((s) => {
      setSessions(s)
      // Which session to open is now decided by reconcile(), below, because that decision
      // is entangled with what to do about the rest of the link when the named drive is
      // gone. Deciding it here as well would put the lowest-id fallback in two places.
    }).catch(fail)
    api.kpiDefinitions().then(setDefs).catch(fail)
    api.eventTypes()
      .then((ts) => setEventTypes(new Map(ts.map((t) => [t.name, t]))))
      .catch(fail)
  }, [fail])

  const SERIES_KPIS = useMemo(() => [
    'RSRP', 'RSRQ', 'SINR', 'MAC_DL_THROUGHPUT', 'MAC_UL_THROUGHPUT', 'DL_BLER',
  ], [])

  // Changing measurement resets the cursor and the range, because both are indices into
  // the drive being left. The ONE exception is the very first drive the page adopts: the
  // seq and range on an incoming link were composed against that drive, and clearing them
  // here would discard the whole point of the link. reconcile() has already decided
  // whether they are legal for it.
  useEffect(() => {
    if (sessionId == null) return
    setError(null)
    setPlaying(false)
    if (!openedFromLink.current) {
      setCursorSeq(0)
      setRange(null)
    }
    openedFromLink.current = false
    Promise.all([
      api.cells(sessionId).then(setCells),
      api.series(sessionId, SERIES_KPIS).then(setSeries),
      api.events(sessionId).then(setEvents),
      api.messages(sessionId).then(setMessages),
    ]).catch(fail)
  }, [sessionId, SERIES_KPIS, filterSpec, fail])

  useEffect(() => {
    if (sessionId == null) return
    api.track(sessionId, kpi, undefined, areaSpec).then(setTrack).catch(fail)
  }, [sessionId, kpi, scaleVersion, areaSpec, filterSpec, fail])

  // The drawn area's statistics, on the same dependencies as the route it describes. The
  // shape is the only input this panel adds; everything else that changes the numbers -
  // the measurement, the KPI, the global filter, an edited scale - changes them here too.
  useEffect(() => {
    if (sessionId == null || areaSpec == null) { setAreaStats(null); return }
    let live = true
    api.areaStatistics(sessionId, kpi, areaSpec)
      .then((a) => { if (live) setAreaStats(a) })
      .catch((e) => { if (live) { setAreaStats(null); fail(e) } })
    return () => { live = false }
  }, [sessionId, kpi, scaleVersion, areaSpec, filterSpec, fail])

  useEffect(() => {
    if (sessionId == null) return
    api.distribution(sessionId, kpi, range, legendBasis)
      .then((d) => {
        setDist(d)
        // "Is this a real parameter" is answered by the catalogue, which reconcile()
        // already checked. "Does this drive contain any of it" can only be answered by
        // the drive, and the answer arrives here. A link naming a fronthaul counter and
        // opening a field measurement passes every earlier check and then paints an
        // entirely grey route with a zeroed legend and nothing to say why - a screen that
        // looks like a finding rather than like a mismatch.
        // ...and only while the ANALYSE screen is the one being read. The correction is
        // about the drive currently open, and the Cohorts tab is explicitly about several
        // drives at once - there, "this measurement recorded none of it" is an answer the
        // screen exists to show, not a mismatch to repair. Without this guard a link to a
        // fronthaul counter grouped by build silently became RSRP, which is exactly the
        // quietly-different-view failure `view/state.ts` is built to prevent.
        if (d.total === 0 && kpi !== 'RSRP' && range == null && mode === 'analyze') {
          setCorrections((c) => c.some((x) => x.param === 'kpi') ? c : [...c, {
            param: 'kpi', raw: kpi, became: 'RSRP',
            why: 'this measurement recorded no values for it',
          }])
          setKpi('RSRP')
        }
      })
      .catch(fail)
    api.degradations(sessionId, kpi, 5, range).then(setDegradations).catch(fail)
  }, [sessionId, kpi, range, scaleVersion, legendBasis, filterSpec, mode, fail])

  useEffect(() => {
    if (sessionId == null || SERIES_KPIS.includes(kpi)) { setExtraSeries(null); return }
    api.series(sessionId, [kpi]).then((s) => setExtraSeries(s[0] ?? null)).catch(fail)
  }, [sessionId, kpi, SERIES_KPIS, filterSpec, fail])

  useEffect(() => {
    if (sessionId == null || workbook !== 'fronthaul') return
    api.series(sessionId, ['FH_RX_LATE', 'FH_RX_ON_TIME']).then(setFhSeries).catch(fail)
  }, [sessionId, workbook, filterSpec, fail])

  /**
   * The two fetches that follow the cursor, debounced together.
   *
   * This is what lets the cursor move at 64 samples a second without the server seeing
   * 128 requests a second. The cursor itself is not throttled - the map, the charts and
   * the status bar follow every sample, because they are drawn from data already in the
   * browser. Only the two round trips are rate-limited, so "how fast does it play" and
   * "how hard does it hit the server" stopped being the same question.
   *
   * `live` on BOTH: a debounce shortens the queue, it does not order it. Two responses
   * can still overtake each other, and an out-of-order snapshot leaves the CURRENT clock
   * and the Numerical Data grid describing a moment the cursor has already left - which
   * is a screen that is confidently wrong, the thing item ① existed to remove.
   */
  useEffect(() => {
    if (sessionId == null) { setMonitored(null); return }
    let live = true
    const timer = setTimeout(() => {
      api.snapshot(sessionId, cursorSeq)
        .then((d) => { if (live) setSnapshot(d) })
        .catch(() => { /* seq may be out of range */ })
      api.monitoredSet(sessionId, cursorSeq)
        .then((d) => { if (live) setMonitored(d) })
        .catch(() => { if (live) setMonitored(null) })
    }, CURSOR_FETCH_MS)
    return () => { live = false; clearTimeout(timer) }
  }, [sessionId, cursorSeq, scaleVersion])

  useEffect(() => {
    if (sessionId == null || binSize === 0) { setBins(null); return }
    api.bins(sessionId, kpi, binSize, binStat).then(setBins).catch(fail)
  }, [sessionId, kpi, binSize, binStat, scaleVersion, filterSpec, fail])

  // Footprints are fetched only when asked for. They are per-session and change with
  // neither the KPI nor the cursor, so refetching alongside those would be pure waste.
  useEffect(() => {
    if (sessionId == null || !showFootprints) { setFootprints(null); return }
    let live = true
    api.cellFootprints(sessionId, footprintBasis)
      .then((f) => { if (live) setFootprints(f) })
      .catch(() => { if (live) setFootprints(null) })
    return () => { live = false }
  }, [sessionId, showFootprints, footprintBasis, filterSpec])

  /**
   * The footprints actually drawn, and what the caption has to say about the rest.
   *
   * One derivation feeding both the map and the notice: a screen that drew five hulls while
   * saying it had narrowed to three would be the exact defect this project keeps finding,
   * and two independent reads of one typed string is how that happens.
   */
  const footprintFilter = parsePciFilter(footprintCells)
  // Memoised because RouteMap keys its footprint effect on this array's identity and
  // rebuilds every hull when it changes. A fresh array per render meant the layer was torn
  // down and re-added on every cursor move - up to 64 times a second at the top playback
  // rate - closing any tooltip the pointer was on.
  const shownFootprints = useMemo(() => (
    footprints == null ? null
      : (footprintFilter.match == null ? footprints
         : footprints.filter((f) => footprintFilter.match!(f.pci)))
  // footprintFilter is derived from footprintCells, so that string is the real input.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [footprints, footprintCells])
  const footprintNote = !showFootprints || footprints == null ? null
    : footprintFilter.error != null
      ? `cell filter ignored: ${footprintFilter.error}`
      : footprintFilter.match == null ? null
        : `footprints for ${footprintFilter.terms.join(', ')}`
          + ` (${shownFootprints!.length} of ${footprints.length} cells)`

  const reloadWorkbooks = useCallback(() => {
    api.workbooks().then(setWorkbooks).catch(() => setWorkbooks([]))
  }, [])
  useEffect(reloadWorkbooks, [reloadWorkbooks])

  useEffect(() => {
    if (sessionId == null) return
    api.coverageIssues(sessionId).then(setIssues).catch(fail)
  }, [sessionId, fail])

  // Only while identity colouring is on: the legend is the only consumer, and this is a
  // full-table aggregate rather than something already in the track payload.
  useEffect(() => {
    if (sessionId == null || colorBy !== 'pci') { setPciBars([]); return }
    api.neighbourBreakdown(sessionId).then((d) => setPciBars(d.bars)).catch(fail)
  }, [sessionId, colorBy, fail])

  // Isolation is a statement about ONE scale's bins, so it cannot survive a change of
  // scale: the label it names may not exist on the next KPI, and a stale isolate would
  // mute the whole route with nothing highlighted and no way to see why.
  useEffect(() => { setIsolate(null) }, [kpi, sessionId])

  const seriesFor = (name: string) =>
    series.find((s) => s.kpi === name)
    ?? (extraSeries?.kpi === name ? extraSeries : null)
  const maxSeq = Math.max(0, (session?.sampleCount ?? 1) - 1)

  /**
   * Whether the screen in front of the user honours isolation.
   *
   * A composed workbook is not in WORKBOOKS and does not honour it: a pane paints from
   * its own layer's KPI and, when the layer is pinned to another measurement, its own
   * drive - so the toolbar's scale is not what is on that screen. ComposedWorkbook takes
   * no `isolate` prop at all, and offering the click anyway had the legend answer with
   * "the rest of the drive is drawn grey" over a pane at full colour. Built-in screens are
   * read off the table rather than listed here a second time.
   */
  const tabIsolates = typeof workbook === 'string' && workbook.startsWith('wb:')
    ? false
    : (WORKBOOKS.find((w) => w.id === workbook)?.isolates ?? false)

  /**
   * Everything THIS screen's map is given, in one object, or null where the screen has no
   * map of its own.
   *
   * Spread into RouteMap and read by the Layers dock, so the list beside the map is
   * describing the map's own contents rather than a second account of what ought to be on
   * it. See view/maplayers.ts for why that distinction is the whole point of the dock.
   *
   * One object for all three map screens rather than one for Overview and hand-written
   * prop lists for the other two. The hand-written lists drifted exactly as that file
   * predicts: Mobility and Coverage Issues drew a serving-cell line the dock's own switch
   * could not reach (RouteMap defaults `showServingLine` to true), showed events the dock
   * had switched off, and took the unfiltered footprint set so the cell filter typed into
   * the toolbar did nothing there.
   */
  const shownEvents = eventsHidden ? [] : events
  // Fetched here rather than inside the panel so the map, the dock and the table read one
  // answer. Above `mapContents` because the contents now carry it - see the `cells` branch.
  const cellEstimates = useCellEstimates(workbook === 'cells' ? sessionId : null, locatorScore)
  const mapContents: MapContents | null =
    workbook === 'overview'
      ? {
        track, cells, bins, footprints: shownFootprints,
        showServingLine: servingLine, events: shownEvents,
      }
      : workbook === 'mobility'
        // The mobility map is where cell relationships are read, so it carries the fan of
        // lines to the monitored set - and no area bins, because tiles replace the route
        // the fan is anchored to.
        ? {
          track, cells, monitored: monitored?.cells ?? null, footprints: shownFootprints,
          showServingLine: servingLine, events: shownEvents,
        }
        : workbook === 'coverage'
          ? {
            track, cells, bins, footprints: shownFootprints,
            showServingLine: servingLine, events: shownEvents,
          }
          // The Cells map is about where the masts are: what the record says, and what the
          // drive measured. No tiles, no footprints, no event pins - each would be a fourth
          // kind of mark on a picture whose whole subject is the gap between two of them.
          //
          // It goes through `mapContents` like the other three because it must: this map
          // was drawing estimates handed to RouteMap as a separate prop, so the Layers dock
          // could not see them and the tab had no dock at all. `view/maplayers.ts` exists
          // to prevent exactly that, and the change that added the overlay broke its rule.
          : workbook === 'cells'
            ? { track, cells, estimates: cellEstimates, showServingLine: servingLine }
            : null
  // The switched-off ones, so the dock can offer them back. Everything about whether a
  // layer IS drawn still comes from the contents above.
  const layersOff: LayerToggle[] = [
    ...(showFootprints ? [] : ['footprints' as LayerToggle]),
    ...(eventsHidden ? ['events' as LayerToggle] : []),
  ]
  const mapLayers = mapContents ? describeLayers(mapContents, layersOff) : []

  /**
   * Whether the screen on show consumes a toolbar group. One lookup, so a control is
   * offered exactly where something answers it.
   */
  const tabReads = (g: ToolGroup) => {
    const row = WORKBOOKS.find((w) => w.id === workbook)
    // `as const` narrows each row's list to its own literal tuple, so the widening is
    // here rather than on the table - the table is meant to be read, not annotated.
    return (row?.reads as readonly ToolGroup[] | undefined)?.includes(g) ?? false
  }

  /**
   * The one place a layer id meets the state that controls it.
   *
   * The dock knows a layer can be switched; it does not know what switching it means. That
   * stays here, so adding a layer is a row in maplayers.ts and a case here rather than a
   * new control wired through three files.
   */
  const toggleLayer = (t: LayerToggle) => {
    switch (t) {
      case 'bins': setBinSize(0); break
      case 'footprints': setShowFootprints((v) => !v); break
      case 'events': setEventsHidden((v) => !v); break
      case 'servingLine': setServingLine((v) => !v); break
    }
  }

  /**
   * The one writer of the time cursor.
   *
   * There were fifteen call sites setting it directly and none of them clamped, so a
   * panel could ask for a seq the drive does not have and the status bar would print it.
   * Clamping HERE rather than in a corrective effect matters: a corrective effect runs
   * after the session-change reset in the same flush and undoes it, parking the cursor on
   * the last sample of the new drive instead of the first.
   */
  const moveCursor = useCallback((next: number) => {
    // `sampleCount == null` means the session has not loaded, which is not the same fact
    // as "this drive has one sample" - and `maxSeq` is 0 in both. Clamping on the
    // conflated value silently accepts any seq on a one-sample drive.
    const count = session?.sampleCount
    if (count == null) { setCursorSeq(Math.max(0, next)); return }
    setCursorSeq(Math.max(0, Math.min(count - 1, next)))
  }, [session])

  // Playback: the cursor sweeps the drive so the engineer can watch the grid,
  // charts and map move together, the way the run originally unfolded.
  //
  // One sample per tick at every rate. The old loop divided the drive into 240 steps
  // regardless of its length, which reads as "a minute end to end" but means the step
  // grows with the drive: at 7200 samples it moved 30 at a time and 29 of every 30
  // samples were unreachable by playing. Rate changes the tick period instead.
  useEffect(() => {
    if (!playing || maxSeq === 0) return
    const timer = setInterval(() => {
      setCursorSeq((s) => {
        const next = reverse ? s - 1 : s + 1
        if (next < 0 || next > maxSeq) { setPlaying(false); return s }
        return next
      })
    }, 1000 / rate)
    return () => clearInterval(timer)
  }, [playing, maxSeq, rate, reverse])

  // Pressing play at the end used to be a silent no-op: the loop set `playing` true, the
  // first tick found itself at maxSeq and turned it straight off again, so the button
  // flickered and nothing moved.
  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (p) return false
      if (!reverse && cursorSeq >= maxSeq) setCursorSeq(0)
      if (reverse && cursorSeq <= 0) setCursorSeq(maxSeq)
      return true
    })
  }, [reverse, cursorSeq, maxSeq])

  /**
   * The app's only keyboard listener.
   *
   * One owner, so "which key does what" is answerable by reading one table
   * (view/keymap.ts) rather than by grepping for onKeyDown. Registered on window in the
   * bubble phase, so a component that wants a key for itself can still stop it.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Chords belong to the browser and the OS. Shadowing Ctrl+F or Cmd+R would be a
      // worse bug than any shortcut here is a feature.
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // Mid-composition keystrokes are the IME's, not ours.
      if (e.isComposing) return

      const b = bindingFor(e.key)
      if (!b) return
      // Escape is exempt from the typing guard on purpose: the state where a modal is
      // open AND a field inside it has focus is exactly the state Escape exists for.
      if (b.keys[0] !== 'Escape' && isTypingTarget(e.target)) return
      if (e.repeat && !b.repeatable) return
      // Transport, range and framing act on the Analysis screen. Fired from Import, they
      // would sweep a cursor and narrow a filter nothing on screen displays - work the
      // user cannot see, undo, or even know happened.
      // The map handles its own keys, on itself. Claiming them here would give two
      // owners to one key, which is the situation this listener exists to end.
      if (b.scope === 'map') return
      if (b.scope === 'analyze' && mode !== 'analyze') return

      switch (b.keys[0]) {
        case 'Escape':
          // Only swallow the key if something actually closed, so a future local handler
          // is not starved by a global one that always claims it.
          if (dismissTop()) e.preventDefault()
          return
        case '?': setKeySheet((v) => !v); break
        case ' ': togglePlay(); break
        case 'ArrowRight': moveCursor(cursorSeq + 1); break
        case 'ArrowLeft': moveCursor(cursorSeq - 1); break
        case 'PageDown': moveCursor(cursorSeq + 10); break
        case 'PageUp': moveCursor(cursorSeq - 10); break
        case 'Home': moveCursor(0); break
        case 'End': moveCursor(maxSeq); break
        case 'r': setReverse((v) => !v); break
        case '+': setRate((r) => RATES[Math.min(RATES.length - 1, RATES.indexOf(r) + 1)]); break
        case '-': setRate((r) => RATES[Math.max(0, RATES.indexOf(r) - 1)]); break
        case '[': setRange((r) => ({ from: cursorSeq, to: r?.to ?? null })); break
        case ']': setRange((r) => ({ from: r?.from ?? null, to: cursorSeq })); break
        case '\\': setRange(null); break
        case 'f': setRefitToken((n) => n + 1); break
        default: return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, cursorSeq, maxSeq, moveCursor, togglePlay])

  /**
   * Write the view back to the address bar.
   *
   * replaceState, never pushState. The cursor alone changes tens of times a second under
   * playback, and a history entry per change would make Back mean "one sample earlier"
   * and bury whatever the user was doing before they opened this. The URL here is an
   * ADDRESS - something to copy, reload and send - not a navigation history.
   */
  useEffect(() => {
    if (!reconciled) return
    const url = window.location.pathname
      + encodeView({ mode, sessionId, kpi, workbook, seq: cursorSeq, range,
                     binSize, distanceStep, footprints: showFootprints,
                     filter: filterSpec, cohortBy, cohortHold })
    if (url !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', url)
    }
  }, [reconciled, mode, sessionId, kpi, workbook, cursorSeq, range,
      binSize, distanceStep, showFootprints, filterSpec, cohortBy, cohortHold])

  // Playback belongs to the Analysis screen. Leaving it running while the user is in
  // Import means a cursor sweeping a drive they are not looking at, and two fetches a
  // second for it.
  useEffect(() => { setPlaying(false) }, [mode])

  useDismissable(keySheet, PRIORITY.MODAL, () => setKeySheet(false))
  useDismissable(finding, PRIORITY.MODAL, () => setFinding(false))
  // Registered HERE and only here. LegendEditor registered itself as well, which looked
  // harmless and was not: with two registrations for one surface, removing either one
  // still closed the modal, so neither could be shown to be doing anything. A defect
  // injection that disabled the component's registration changed no observable behaviour
  // at all - the duplicate was hiding whether the feature worked.
  useDismissable(editingScale, PRIORITY.MODAL, () => setEditingScale(false))
  useDismissable(error != null, PRIORITY.NOTICE, () => setError(null))
  useDismissable(corrections.length > 0, PRIORITY.NOTICE, () => setCorrections([]))


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
  const jumpToSeq = (seq: number) => moveCursor(seq)

  /**
   * A finished shape becomes a question immediately.
   *
   * All this does is record the shape. The answer comes from the effect below, for the
   * reason every other panel's answer does: an area is a standing question, and the drive,
   * the KPI and the global filter can all change under it. Fetching once here left the
   * panel holding pre-filter numbers under a caption that said the filter had been applied,
   * and after a change of measurement it showed drive A's means beside drive B's header -
   * with rows that moved the cursor to seq numbers belonging to the other drive.
   */
  const askAboutArea = useCallback((rings: [number, number][] | null) => {
    setDrawingArea(false)
    if (rings == null || sessionId == null) return
    // The shape does two things: it produces the statistics, and it narrows what the route
    // is coloured for. Both read this one spec string, so the panel and the map cannot end
    // up describing different shapes.
    setAreaSpec(rings.map(([a, b]) => `${a},${b}`).join(';'))
  }, [sessionId])

  const chart = (name: string, filled = false) => {
    const s = seriesFor(name)
    return s ? (
      <TimeSeriesChart key={name} series={s} cursorSeq={cursorSeq}
                       onCursorChange={moveCursor} filled={filled}
                       thresholds={defs.find((d) => d.name === name)?.thresholds ?? []}
                       events={events} eventTypes={eventTypes} />
    ) : null
  }

  const chartOf = (s: Series, filled = false) => (
    <TimeSeriesChart key={s.kpi} series={s} cursorSeq={cursorSeq}
                     onCursorChange={moveCursor} filled={filled}
                     thresholds={defs.find((d) => d.name === s.kpi)?.thresholds ?? []}
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
          sessions={sessions}
          defs={defs}
          filterSpec={filterSpec}
          cells={cells}
          cursorSeq={cursorSeq}
          onCursorChange={moveCursor}
          onSaved={(w) => setWorkbooks((ws) => ws.map((x) => (x.id === w.id ? w : x)))}
          onDeleted={(id) => {
            setWorkbooks((ws) => ws.filter((x) => x.id !== id))
            setWorkbook('overview')
          }}
        />
      )
    }
    switch (workbook) {
      case 'spatialdiff':
        return (
          <SpatialDiffPanel sessionId={sessionId} sessions={sessions} kpi={kpi}
                            cursorSeq={cursorSeq} onPick={moveCursor} />
        )
      case 'overview':
        return (
          <>
            <RouteMap {...mapContents!} footprintNote={footprintNote} cursorSeq={cursorSeq}
                      frameKey={String(sessionId)} refitToken={refitToken}
                      onCursorChange={moveCursor} kpiName={activeDef?.displayName ?? kpi}
                      onFilterCell={filterToCell}
                      colorBy={colorBy} isolate={isolate}
                      drawingArea={drawingArea} onAreaDrawn={askAboutArea}
                      eventTypes={eventTypes} />
            {/* Close clears the shape, not just the answer. The panel now follows the
                shape - measurement, KPI and filter all re-ask it - so hiding the answer
                while keeping the question drawn would have the next KPI change bring it
                straight back. "Clear area" in the toolbar is the same act from the other
                end of the screen. */}
            {areaStats && (
              <AreaStatsPanel data={areaStats}
                              onClose={() => { setAreaSpec(null); setAreaStats(null) }}
                              onPick={moveCursor} filterSpec={filterSpec} />
            )}
            {distanceStep > 0 && (
              <DistanceProfile sessionId={sessionId} kpiName={kpi} stepMeters={distanceStep}
                               cursorSeq={cursorSeq} isolate={isolate}
                               filterSpec={filterSpec} onJump={moveCursor} />
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
            <RouteMap {...mapContents!} footprintNote={footprintNote} cursorSeq={cursorSeq}
                      frameKey={String(sessionId)} refitToken={refitToken}
                      onCursorChange={moveCursor} kpiName={activeDef?.displayName ?? kpi}
                      onFilterCell={filterToCell}
                      colorBy={colorBy} isolate={isolate}
                      eventTypes={eventTypes} />
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
                <EventList events={events} types={eventTypes} onPick={jumpToSeq}
                           onExclude={excludeEventType} />
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
        return <ProblemSurveyPanel sessionId={sessionId} onPick={moveCursor}
                                rsrpThresholds={
                                  defs.find((d) => d.name === 'RSRP')?.thresholds ?? []}
                                events={events} eventTypes={eventTypes} />
      case 'neighbours':
        return <MonitoredSetPage sessionId={sessionId} set={monitored}
                                 onJump={moveCursor} />
      case 'cells':
        return (
          <>
            {/* The map UC18 needs and UC21 draws on, in one place: a grid row frames a
                cell here, and the locator's estimates sit beside the recorded positions.
                Before this the Cells page had no map at all, which is why the row click
                and the estimate overlay were both blocked on the same missing thing.
                `isolate` is passed because this tab is marked isolates:true for its bar
                chart - without it the legend's claim would be half true on the one tab
                that now shows both a chart and a map. */}
            <RouteMap {...mapContents!} cursorSeq={cursorSeq}
                      frameKey={String(sessionId)} refitToken={refitToken}
                      onCursorChange={moveCursor} kpiName={activeDef?.displayName ?? kpi}
                      focusPci={focusPci}
                      onFilterCell={filterToCell}
                      isolate={isolate}
                      eventTypes={eventTypes} />
            <CellLocatorPanel sessionId={sessionId} estimates={cellEstimates}
                              onPick={setFocusPci}
                              minScore={locatorScore} onMinScore={setLocatorScore} />
            <CellsPage sessionId={sessionId} kpi={kpi} range={range}
                       scaleVersion={scaleVersion} isolate={isolate}
                       filterSpec={filterSpec} onPickCell={setFocusPci} />
          </>
        )
      case 'statistics':
        return (
          <StatisticsPanel sessionId={sessionId} kpi={kpi} unit={activeDef?.unit ?? ''}
                           range={range} filterSpec={filterSpec} />
        )
      case 'coverage':
        return (
          <>
            <RouteMap {...mapContents!} footprintNote={footprintNote} cursorSeq={cursorSeq}
                      frameKey={String(sessionId)} refitToken={refitToken}
                      onCursorChange={moveCursor} kpiName={activeDef?.displayName ?? kpi}
                      onFilterCell={filterToCell}
                      colorBy={colorBy} isolate={isolate}
                      eventTypes={eventTypes} />
            <div className="panel">
              <header>
                <span className="title">Detected coverage issues</span>
                <span className="meta">{issues.length}</span>
              </header>
              {/* The bars the detectors used, stated where the verdicts are read. A row
                  saying "weak coverage" is a judgement, and a judgement whose threshold is
                  invisible cannot be argued with - the same reason the pilot-pollution
                  panel prints its window and cell count. These are the server's defaults
                  (AnalyticsController.coverage); the endpoint accepts others. */}
              <div className="basis-note">
                Weak coverage below &minus;105 dBm &middot; poor quality below 0 dB SINR with
                adequate power &middot; overshoot beyond 3 km from the site.
              </div>
              <div style={{ maxHeight: 320, overflow: 'auto' }}>
                <table className="grid">
                  <thead><tr><th>Type</th><th>Severity</th><th className="num">Samples</th>
                    <th>Detail</th></tr></thead>
                  <tbody>
                    {issues.map((x, i) => (
                      <tr key={i} className={`deg-row issue-${x.type}`}
                          onClick={() => moveCursor(x.startSeq)}>
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
                                  onPick={moveCursor} />
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
              <select value={sessionId ?? ''} aria-label="Measurement"
                      onChange={(e) => { setSessionId(Number(e.target.value)); e.currentTarget.blur() }}>
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button title="Search and filter measurements"
                      aria-label="Find a measurement"
                      onClick={() => setFinding(true)}>Find…</button>
            </div>
            <div className="group">
              <label>KPI</label>
              <select value={kpi} aria-label="KPI"
                      onChange={(e) => { setKpi(e.target.value); e.currentTarget.blur() }}>
                {defs.map((d) => <option key={d.name} value={d.name}>{d.displayName}</option>)}
              </select>
            </div>
            <div className="group">
              {/* Drawing is offered only where a map takes it. `Clear area` is not: an
                  area narrows the track fetch on every screen, so the way out of one has
                  to be reachable from every screen too. */}
              {tabReads('area') && (
                <button className={drawingArea ? 'on' : undefined}
                        title="Draw an area on the map and get its statistics"
                        onClick={() => { setDrawingArea((v) => !v); setAreaStats(null) }}>
                  {drawingArea ? 'Drawing…' : 'Ask an area'}
                </button>
              )}
              {areaSpec && !drawingArea && (
                <button title="Colour the whole drive again"
                        onClick={() => { setAreaSpec(null); setAreaStats(null) }}>
                  Clear area
                </button>
              )}
            </div>
            {tabReads('colour') && (
            <div className="group">
              <label>Colour by</label>
              <select value={colorBy} aria-label="Colour by"
                      title="What the route's colour means"
                      onChange={(e) => { setColorBy(e.target.value as ColorBy); e.currentTarget.blur() }}>
                <option value="kpi">KPI value</option>
                <option value="pci">Serving cell (PCI)</option>
              </select>
            </div>
            )}
            {tabReads('areaBins') && (
            <div className="group">
              <label>Area bins</label>
              <select value={binSize} aria-label="Area bins"
                      onChange={(e) => { setBinSize(Number(e.target.value)); e.currentTarget.blur() }}>
                <option value={0}>off (raw route)</option>
                <option value={50}>50 m</option>
                <option value={150}>150 m</option>
                <option value={500}>500 m</option>
              </select>
              {binSize > 0 && (
                <select value={binStat} aria-label="Bin statistic"
                        title="Which statistic of a tile's samples decides its colour"
                        onChange={(e) => { setBinStat(e.target.value); e.currentTarget.blur() }}>
                  <option value="AVERAGE">average</option>
                  <option value="MINIMUM">minimum</option>
                  <option value="MAXIMUM">maximum</option>
                </select>
              )}
            </div>
            )}
            {tabReads('distanceBins') && (
            <div className="group">
              <label title="Averages per unit of road travelled, so a stop at a light stops
                     dominating the average">Distance bins</label>
              <select value={distanceStep}
                      aria-label="Distance bins"
                      onChange={(e) => { setDistanceStep(Number(e.target.value)); e.currentTarget.blur() }}>
                <option value={0}>off</option>
                <option value={50}>50 m</option>
                <option value={100}>100 m</option>
                <option value={250}>250 m</option>
              </select>
            </div>
            )}
            {tabReads('footprints') && (
            <div className="group">
              <label title="The outline of where each cell was measured">
                Footprints</label>
              <button onClick={() => setShowFootprints((v) => !v)}
                      style={showFootprints ? { fontWeight: 600 } : undefined}>
                {showFootprints ? 'on' : 'off'}
              </button>
              {showFootprints && (
                <select value={footprintBasis} aria-label="Footprint basis"
                        title="Where the cell served, or where it was among the three strongest"
                        onChange={(e) => { setFootprintBasis(e.target.value); e.currentTarget.blur() }}>
                  <option value="SERVING">where it served</option>
                  <option value="TOP3">where it was top 3</option>
                </select>
              )}
              {showFootprints && (
                <input className="footprint-cells" value={footprintCells}
                       aria-label="Footprint cells"
                       placeholder="all cells — try 3,10-30,42,100-"
                       title="Comma-separated PCIs and ranges, the reference's own syntax (UC1 p67)"
                       onChange={(e) => setFootprintCells(e.target.value)} />
              )}
            </div>
            )}
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

      {/* Above the panels rather than inside one, because it governs all of them.
          On Compare as well as Analysis, and that is not symmetry for its own sake: the
          cohort endpoint HONOURS the filter (GlobalFilter.coverage names it), the
          condition survives a change of screen, and the bar was the only way to see or
          clear it. A cohort table computed over a subset, with nothing on screen saying
          so, is exactly the silent narrowing this bar exists to prevent - and the reach
          list it carries is what tells the reader that the two-drive panel beside it is
          exempt. Lab and Import read no drive's samples, so there is nothing to state. */}
      {(mode === 'analyze' || mode === 'compare') && (
        <GlobalFilterBar spec={filterSpec} onApply={applyFilter} />
      )}

      {mode === 'analyze' && session?.notes && (
        <div className="session-notes">{session.notes}</div>
      )}

      {error && (
        <div className="error">
          {error}
          <button onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}

      {/* Every repair the app made to an incoming link, named. Correcting a shared view
          silently is the failure this whole feature is built to avoid: the recipient gets
          a screen that is entirely self-consistent and entirely not what was sent, and
          goes on to send the same broken link again tomorrow. */}
      {corrections.length > 0 && (
        <div className="view-notice">
          <b>This link was adjusted to fit what is on this server.</b>
          <ul>
            {corrections.map((c) => (
              <li key={c.param + c.raw}>
                <code>{c.param}={c.raw}</code> → <b>{c.became}</b> — {c.why}
              </li>
            ))}
          </ul>
          <button onClick={() => setCorrections([])} aria-label="Dismiss notice">✕</button>
        </div>
      )}

      {keySheet && <KeySheet onClose={() => setKeySheet(false)} />}

      {finding && (
        <SessionFilter onClose={() => setFinding(false)}
                       onPick={(id) => setSessionId(id)} />
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
        <div className="body"><div className="center">
          {/* Two scopes for one question. "Is this build better" is asked of two drives
              when there are two, and of every drive of each build when there are twelve -
              the second is not a bigger version of the first, because pooling is the only
              way a group gets a percentile at all. Both live on this tab so the reader
              picks the scope rather than the screen. */}
          <div className="scope-switch" role="group" aria-label="Comparison scope">
            <button className={cohortBy == null ? 'active' : ''}
                    onClick={() => { setCohortBy(null); setCohortHold(null) }}>
              Two drives
            </button>
            <button className={cohortBy != null ? 'active' : ''}
                    onClick={() => { if (cohortBy == null) setCohortBy('BUILD_LABEL') }}>
              Cohorts
            </button>
          </div>
          {cohortBy == null
            ? <CompareView sessions={sessions} />
            : <CohortView defs={defs} kpi={kpi} groupBy={cohortBy} holdConstant={cohortHold}
                          filterSpec={filterSpec} onKpi={setKpi}
                          onDimension={(by, hold) => { setCohortBy(by); setCohortHold(hold) }} />}
        </div></div>
      ) : mode === 'lab' ? (
        <div className="body"><div className="center">
          <LabView onOpenSession={openSessionFromLab} />
        </div></div>
      ) : mode === 'import' ? (
        <div className="body"><div className="center">
          <ImportView eventTypes={[...eventTypes.values()]} sessionId={sessionId}
                      onImported={() => {
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
              {/* Above the legend, because it answers the earlier question: the legend
                  explains what a colour means, and this explains what the shapes are. Only
                  where there is a map - a Layers list beside a table would be the same
                  mistake the isolate notice was making. */}
              {mapContents != null && (
                <div className="dock-section" style={{ maxHeight: 200 }}>
                  <h3>Layers ({mapLayers.length})</h3>
                  <div className="content" style={{ maxHeight: 170 }}>
                    <MapLayerDock layers={mapLayers} onToggle={toggleLayer} />
                  </div>
                </div>
              )}
              <div className="dock-section">
                <h3>Color Legends</h3>
                <div className="content">
                  {/* Gated on the same fact the maps are: a per-PCI census beside a
                      screen that no toolbar colour reaches is a legend for a picture that
                      is not on show. */}
                  {colorBy === 'pci' && tabReads('colour') ? (
                    <PciLegend colors={buildPciColors(track)} bars={pciBars}
                               total={session?.sampleCount ?? 0} />
                  ) : (
                    <LegendPanel dist={dist}
                                 onEdit={activeDef ? () => setEditingScale(true) : undefined}
                                 isolate={isolate}
                                 onIsolate={tabIsolates ? setIsolate : undefined}
                                 weightedBy={legendBasis} onWeightedBy={setLegendBasis} />
                  )}
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
                <h3>Events ({events.length})
                  {/* The colours live one click away rather than on screen: they are set
                      rarely and read constantly, and a colour well per type would crowd
                      out the events themselves. */}
                  <button className="dock-tool" aria-label="Edit event colours"
                          title="Set the colour of each event type"
                          aria-expanded={eventColours}
                          onClick={() => setEventColours((v) => !v)}>🎨</button>
                </h3>
                <div className="content" style={{ maxHeight: 160 }}>
                  {eventColours
                    ? (
                      <EventColourEditor
                        types={eventTypes}
                        // Written straight into the registry every panel reads, so the map
                        // marker, the chart tick and this list change together - which is
                        // the whole claim a shared registry makes.
                        onRecoloured={(t) => setEventTypes((m) => {
                          const next = new Map(m)
                          next.set(t.name, t)
                          return next
                        })} />
                    )
                    : <EventList events={events} types={eventTypes} onPick={jumpToSeq}
                           onExclude={excludeEventType} />}
                </div>
              </div>
            </div>
          </div>

          <div className="statusbar">
            <button className="step" onClick={() => moveCursor(cursorSeq - 1)}
                    title="Back one sample (←)">◀|</button>
            <button className="play" onClick={togglePlay}
                    title={playing ? 'Pause playback (Space)' : 'Play the drive (Space)'}>
              {playing ? '⏸' : '▶'}
            </button>
            <button className="step" onClick={() => moveCursor(cursorSeq + 1)}
                    title="Forward one sample (→)">|▶</button>
            <button className={reverse ? 'step on' : 'step'}
                    onClick={() => setReverse((v) => !v)}
                    title="Reverse playback direction (R)">↺</button>
            {/* Samples per second, not a multiplier of the drive: the step is always one
                sample, so this is literally how many samples pass per second. */}
            <select className="rate" value={rate} title="Playback rate (+ / −)"
                    onChange={(e) => { setRate(Number(e.target.value)); e.currentTarget.blur() }}>
              {RATES.map((r) => <option key={r} value={r}>{r}/s</option>)}
            </select>
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
                   const seek = (clientX: number) => moveCursor(
                     Math.round(((clientX - box.left) / box.width) * maxSeq))
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
            <button className="keys" onClick={() => setKeySheet(true)}
                    title="Keyboard shortcuts (?)">?</button>
          </div>
        </>
      )}
    </div>
  )
}

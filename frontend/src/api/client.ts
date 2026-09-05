import type {
  AreaBin, Campaign, CellConfig, CellRef, ChannelModel, Comparison, CoverageIssue,
  Degradation, Distribution, DuEndpoint, ImportResult, KpiDefinition, NetworkEvent,
  SeqRange, Series, SessionSummary, SignalingMessage, Snapshot, Statistics, TestRun,
  RunBringUp, CellBreakdown, ProblemSurvey, DerivedKpiResult, FieldToLab,
  Threshold, TrackPoint, UeProfile,
  MonitoredSet, NeighbourBreakdown, PollutionSpan, AreaStats, SpatialDiff,
  GraphNodePreview,
  GraphRequest, GraphValidation, StoredGraph,
  DistanceBin, CellFootprint, Workbook, WorkbookLimits, WorkbookRequest, EventType,
  FilterCoverage, CohortSet,
  CellEstimate, ServingLine,
} from './types'

const BASE = '/api'

const rangeQs = (r?: SeqRange | null) => {
  if (!r) return ''
  return (r.from != null ? `&fromSeq=${r.from}` : '') + (r.to != null ? `&toSeq=${r.to}` : '')
}

/**
 * The global filter, held HERE rather than passed through every call.
 *
 * UC5's whole claim is that one condition reaches every analytic. Threading it through
 * twelve method signatures would mean twelve chances to forget it, and a forgotten one
 * looks identical on screen to an honoured one - a panel showing the unfiltered drive
 * beside panels showing the filtered one, with nothing to say which is which. So the
 * value lives in one variable and one function appends it, and the list of paths that
 * get it is written out below rather than inferred, so it can be compared against the
 * server's own list.
 */
let globalFilter: string | null = null

/**
 * The paths the filter is sent to. Mirrors `GlobalFilter.coverage()`'s honoured entries.
 *
 * Checked behaviourally rather than by comparison: S20 records every request the app
 * makes while a filter is in force and requires each one matching an honoured path to
 * carry it, and each one matching an exempt path not to. Comparing this array against the
 * server's list would only prove the two arrays agree - it would not notice a call that
 * bypasses `get` altogether, which is the way this could actually go wrong.
 */
const FILTERED_PATHS = [
  '/track', '/series', '/distribution', '/statistics', '/cell-breakdown',
  '/degradations', '/area-statistics', '/bins', '/cell-footprints',
  '/export.csv', '/export.geojson', '/report.html',
  '/cohorts', '/distance-bins', '/serving-lines',
  '/compare', '/coverage-issues',
]

/** Appends `filter=` to the paths that honour it, and to nothing else. */
function filtered(path: string): string {
  if (!globalFilter) return path
  const base = path.split('?')[0]
  if (!FILTERED_PATHS.some((p) => base.endsWith(p))) return path
  return `${path}${path.includes('?') ? '&' : '?'}filter=${encodeURIComponent(globalFilter)}`
}

async function get<T>(path: string, honourFilter = true): Promise<T> {
  const res = await fetch(`${BASE}${honourFilter ? filtered(path) : path}`)
  if (!res.ok) {
    let detail = res.statusText
    try {
      detail = (await res.json()).message ?? detail
    } catch {
      /* response had no JSON body */
    }
    throw new Error(`${res.status}: ${detail}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  /**
   * Set the condition every analytic answers through, or null for none.
   *
   * Deliberately not validated here: the parser that runs the queries is on the server,
   * and a second grammar in TypeScript would eventually accept something the server
   * rejects. `describeFilter` is how a caller checks a spec before setting it.
   */
  setGlobalFilter: (spec: string | null) => { globalFilter = spec && spec.trim() ? spec : null },

  /** Which analytics honour the filter, which do not, and why - the server's own list. */
  filterCoverage: () => get<FilterCoverage[]>('/global-filter/coverage'),
  /** What a spec says, in words. Throws with the server's message when it says nothing. */
  describeFilter: (spec: string) =>
    get<{ active: boolean; text: string; scope: string }>(
      `/global-filter/describe?filter=${encodeURIComponent(spec)}`),

  sessions: () => get<SessionSummary[]>('/sessions'),
  // maxPoints caps the payload; the server decimates while preserving bin changes
  // and per-bucket extremes.
  // `area` asks the server which points fall inside a drawn shape. Sent rather than
  // tested here: the containment rule is the server's, and a second copy in TypeScript
  // would eventually disagree with the statistics panel beside it.
  track: (id: number, kpi: string, maxPoints = 4000, area?: string | null) =>
    get<TrackPoint[]>(`/sessions/${id}/track?kpi=${kpi}&maxPoints=${maxPoints}`
      + (area ? `&area=${encodeURIComponent(area)}` : '')),
  series: (id: number, kpis: string[], maxPoints = 2000) =>
    get<Series[]>(`/sessions/${id}/series?kpis=${kpis.join(',')}&maxPoints=${maxPoints}`),
  /**
   * The same series with the global filter deliberately NOT applied. One caller.
   *
   * The problem survey is exempt from the filter because it mixes network-reported
   * failures, which have no sample to filter on, with sample-derived ones. Its context
   * chart therefore has to be exempt too: a filtered chart under an unfiltered case list
   * would show a case sitting on a stretch the chart says was never measured. The escape
   * is named rather than achieved by building the URL by hand, so it is greppable and so
   * a second one cannot appear without a reviewer seeing it.
   */
  seriesUnfiltered: (id: number, kpis: string[], maxPoints = 2000) =>
    get<Series[]>(
      `/sessions/${id}/series?kpis=${kpis.join(',')}&maxPoints=${maxPoints}`, false),
  snapshot: (id: number, seq?: number) =>
    get<Snapshot>(`/sessions/${id}/snapshot${seq === undefined ? '' : `?seq=${seq}`}`),
  /**
   * Define a MEASURED parameter before its column arrives.
   *
   * The sibling of `createDerivedKpi`, and a different thing: that one computes a value
   * from other KPIs, this one declares what a column in a log FILE means. Without it the
   * only way a non-seeded measured parameter can be born is the import's
   * define-unknown-columns path, which has nothing to go on and so stamps every one of
   * them category "Imported", technology "Unknown" and direction NEUTRAL - and NEUTRAL is
   * not cosmetic: the colour ramp has no bad end and the comparison verdict is withheld,
   * for the life of the parameter, with no endpoint anywhere to correct it afterwards.
   */
  createKpi: async (body: Record<string, unknown>) => {
    const res = await fetch(`${BASE}/kpi-definitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message ?? `${res.status}`)
    return json as KpiDefinition
  },
  createDerivedKpi: async (body: Record<string, unknown>) => {
    const res = await fetch(`${BASE}/kpi-definitions/derived`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message ?? `${res.status}`)
    return json as DerivedKpiResult
  },
  recomputeDerivedKpi: async (name: string) => {
    const res = await fetch(`${BASE}/kpi-definitions/${name}/recompute`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message ?? `${res.status}`)
    return json as DerivedKpiResult
  },
  fieldToLab: (id: number) => get<FieldToLab>(`/sessions/${id}/field-to-lab`),
  generateChannelModel: async (id: number) => {
    const res = await fetch(`${BASE}/sessions/${id}/field-to-lab/generate`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message ?? `${res.status}`)
    return json as { channelModelId: number }
  },
  problemSurvey: (id: number) =>
    get<ProblemSurvey>(`/sessions/${id}/problem-survey`),
  cellBreakdown: (id: number, kpi: string, range?: SeqRange | null) =>
    get<CellBreakdown>(`/sessions/${id}/cell-breakdown?kpi=${kpi}${rangeQs(range)}`),
  distribution: (id: number, kpi: string, range?: SeqRange | null, weightedBy = 'SAMPLE') =>
    get<Distribution>(`/sessions/${id}/distribution?kpi=${kpi}${rangeQs(range)}`
      + `&weightedBy=${weightedBy}`),
  /**
   * `weightedBy` and `domain` default to what the tool did before they existed, so a
   * caller that does not care gets exactly the old numbers - now with a label saying
   * which basis produced them.
   */
  statistics: (id: number, kpi: string, range?: SeqRange | null,
               weightedBy = 'SAMPLE', domain = 'AS_RECORDED') =>
    get<Statistics>(`/sessions/${id}/statistics?kpi=${kpi}${rangeQs(range)}`
      + `&weightedBy=${weightedBy}&domain=${domain}`),
  degradations: (id: number, kpi: string, minSamples = 5, range?: SeqRange | null) =>
    get<Degradation[]>(
      `/sessions/${id}/degradations?kpi=${kpi}&minSamples=${minSamples}${rangeQs(range)}`),
  events: (id: number) => get<NetworkEvent[]>(`/sessions/${id}/events`),
  messages: (id: number) => get<SignalingMessage[]>(`/sessions/${id}/messages`),
  cells: (id: number) => get<CellRef[]>(`/sessions/${id}/cells`),
  kpiDefinitions: () => get<KpiDefinition[]>('/kpi-definitions'),

  saveThresholds: async (name: string, bins: Threshold[]): Promise<KpiDefinition> => {
    const res = await fetch(`${BASE}/kpi-definitions/${name}/thresholds`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bins),
    })
    if (!res.ok) {
      let detail = res.statusText
      try { detail = (await res.json()).message ?? detail } catch { /* no JSON body */ }
      throw new Error(detail)
    }
    return res.json() as Promise<KpiDefinition>
  },

  deleteKpi: async (name: string): Promise<{ name: string; removedValues: number }> => {
    const res = await fetch(`${BASE}/kpi-definitions/${name}`, { method: 'DELETE' })
    if (!res.ok) {
      let detail = res.statusText
      try { detail = (await res.json()).message ?? detail } catch { /* no JSON body */ }
      throw new Error(detail)
    }
    return res.json() as Promise<{ name: string; removedValues: number }>
  },

  clearThresholds: async (name: string): Promise<KpiDefinition> => {
    const res = await fetch(`${BASE}/kpi-definitions/${name}/thresholds`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`)
    return res.json() as Promise<KpiDefinition>
  },

  resetThresholds: async (name: string): Promise<KpiDefinition> => {
    const res = await fetch(`${BASE}/kpi-definitions/${name}/thresholds/reset`, { method: 'POST' })
    if (!res.ok) {
      let detail = res.statusText
      try { detail = (await res.json()).message ?? detail } catch { /* no JSON body */ }
      throw new Error(detail)
    }
    return res.json() as Promise<KpiDefinition>
  },
  compare: (a: number, b: number, kpis: string[],
            weightedBy = 'SAMPLE', domain = 'AS_RECORDED') =>
    get<Comparison>(`/compare?a=${a}&b=${b}&kpis=${kpis.join(',')}`
      + `&weightedBy=${weightedBy}&domain=${domain}`),

  /**
   * One KPI over every drive that matches, cut into cohorts.
   *
   * The narrowing arguments are the measurement list's, deliberately: the set the reader
   * chose on Sessions is the set this answers over, so the two screens cannot disagree.
   * The global filter is appended by `filtered()` like every other honoured path.
   */
  cohorts: (p: {
    kpi: string; groupBy?: string; holdConstant?: string
    weightedBy?: string; domain?: string
    q?: string; device?: string; operator?: string; technology?: string
    from?: string; to?: string
  }) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(p)) if (v) qs.set(k, String(v))
    return get<CohortSet>(`/cohorts?${qs.toString()}`)
  },

  bins: (id: number, kpi: string, sizeMeters: number, statistic = 'AVERAGE') =>
    get<AreaBin[]>(`/sessions/${id}/bins?kpi=${kpi}&sizeMeters=${sizeMeters}`
      + `&statistic=${statistic}`),
  coverageIssues: (id: number) => get<CoverageIssue[]>(`/sessions/${id}/coverage-issues`),

  channelModels: () => get<ChannelModel[]>('/lab/channel-models'),
  cellConfigs: () => get<CellConfig[]>('/lab/cell-configs'),
  ueProfiles: () => get<UeProfile[]>('/lab/ue-profiles'),
  duEndpoints: () => get<DuEndpoint[]>('/lab/du-endpoints'),
  campaigns: () => get<Campaign[]>('/lab/campaigns'),
  bringUp: (id: number) => get<RunBringUp>(`/lab/runs/${id}/bring-up`),
  cancelRun: async (id: number) => {
    const res = await fetch(`${BASE}/lab/runs/${id}/cancel`, { method: 'POST' })
    if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`)
    return res.json() as Promise<TestRun>
  },
  startRun: async (id: number) => {
    const res = await fetch(`${BASE}/lab/runs/${id}/start`, { method: 'POST' })
    if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`)
    return res.json() as Promise<TestRun>
  },
  runs: (campaignId?: number) =>
    get<TestRun[]>(`/lab/runs${campaignId === undefined ? '' : `?campaignId=${campaignId}`}`),

  evaluateRun: async (id: number): Promise<TestRun> => {
    const res = await fetch(`${BASE}/lab/runs/${id}/evaluate`, { method: 'POST' })
    if (!res.ok) {
      let detail = res.statusText
      try { detail = (await res.json()).message ?? detail } catch { /* no JSON body */ }
      throw new Error(`${res.status}: ${detail}`)
    }
    return res.json() as Promise<TestRun>
  },

  deleteSession: async (id: number): Promise<void> => {
    const res = await fetch(`${BASE}/sessions/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`)
  },

  importCsv: async (form: FormData): Promise<ImportResult> => {
    const res = await fetch(`${BASE}/import/csv`, { method: 'POST', body: form })
    if (!res.ok) {
      let detail = res.statusText
      try { detail = (await res.json()).message ?? detail } catch { /* no JSON body */ }
      throw new Error(detail)
    }
    return res.json() as Promise<ImportResult>
  },

  /** Session-independent, so callers fetch it once rather than per drive. */
  eventTypes: () => get<EventType[]>('/event-types'),

  importJobs: () => get<Array<Record<string, unknown>>>('/import/jobs'),

  /** Ask a running import to stop. A request, not a kill - see the endpoint's comment. */
  cancelImport: async (jobId: number): Promise<{ cancelRequested: boolean; message: string }> => {
    const res = await fetch(`${BASE}/import/jobs/${jobId}/cancel`, { method: 'POST' })
    if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`)
    return res.json()
  },

  /**
   * The measurement list, optionally narrowed. Called with nothing it is the list it
   * always returned, so every existing caller is unaffected.
   */
  sessionsFiltered: (f: {
    q?: string; device?: string; operator?: string
    technology?: string; from?: string; to?: string
  }) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(f)) if (v) p.set(k, v)
    const qs = p.toString()
    return get<SessionSummary[]>(`/sessions${qs ? `?${qs}` : ''}`)
  },

  sessionFacets: () =>
    get<{ device: string[]; operator: string[]; technology: string[] }>('/sessions/facets'),

  monitoredSet: (id: number, seq: number) =>
    get<MonitoredSet>(`/sessions/${id}/monitored-set?seq=${seq}`),

  /**
   * @param windowDb how close to the strongest cell counts as competing. The reference asks
   *                 for it by name - `Polluter level window from the best active set`, UC20
   *                 p173 - and the server has always accepted it; only the screen could not
   *                 send it, so every reader got the 6 dB default whether it suited their
   *                 network or not.
   *
   * Built with URLSearchParams rather than by juggling `?` and `&`, which is how the two
   * optional parameters were assembled and would not have survived a third.
   */
  neighbourBreakdown: (id: number, from?: number | null, to?: number | null,
                       windowDb?: number) => {
    const q = new URLSearchParams()
    if (from != null) q.set('fromSeq', String(from))
    if (to != null) q.set('toSeq', String(to))
    if (windowDb != null) q.set('windowDb', String(windowDb))
    return get<NeighbourBreakdown>(
      `/sessions/${id}/neighbour-breakdown${q.toString() ? `?${q}` : ''}`)
  },

  /**
   * @param windowDb  the same window as above - the two endpoints must be asked with one
   *                  value or the table and the spans describe different competitions.
   * @param minCells  the reference's `Pilot count threshold` (UC20 p173, default 3).
   */
  pilotPollution: (id: number, windowDb?: number, minCells?: number) => {
    const q = new URLSearchParams()
    if (windowDb != null) q.set('windowDb', String(windowDb))
    if (minCells != null) q.set('minCells', String(minCells))
    return get<PollutionSpan[]>(
      `/sessions/${id}/pilot-pollution${q.toString() ? `?${q}` : ''}`)
  },

  /** The polygon travels as "lat,lon;lat,lon;..." - a question being asked, not a stored object. */
  /**
   * @param polygon the ring as `lat,lon;lat,lon;…` - the wire form, not a coordinate array.
   *
   * The caller already holds this string: it is what narrows the track fetch, so the shape
   * on the map and the shape the statistics are about are one value. Taking an array here
   * meant serialising it a second time, and the two copies were free to drift.
   */
  /**
   * @param minScore the reference's `Minimum accuracy score (0-10)` - drop estimates below
   *                 it. Its own dialog offers this because a low score means the drive did
   *                 not see the site well enough to place it.
   */
  cellLocator: (id: number, minScore?: number, minRsrp?: number) => {
    const q = new URLSearchParams()
    if (minScore != null) q.set('minScore', String(minScore))
    if (minRsrp != null) q.set('minRsrp', String(minRsrp))
    const qs = q.toString()
    return get<CellEstimate[]>(`/sessions/${id}/cell-locator${qs ? `?${qs}` : ''}`)
  },

  areaStatistics: (id: number, kpi: string, polygon: string) =>
    get<AreaStats>(`/sessions/${id}/area-statistics?kpi=${encodeURIComponent(kpi)}`
      + `&polygon=${encodeURIComponent(polygon)}`),

  // `withB` adds measurements to the far side. Absent, the call is exactly what it was.
  /**
   * @param withA extra measurements on the NEAR side.
   *
   * The reference's delta plotting is symmetric - `Measurement Group 1` and
   * `Measurement Group 2`, each with its own list (UC16 p158-162) - and so is
   * `SpatialDiffService.diff(List, List, …)`. Only the client was asymmetric: `withA` was
   * declared on the server, accepted by the controller, and reachable from nothing, so the
   * near side was permanently one drive and "the evening runs against the morning runs"
   * could only ever be asked half way round.
   */
  spatialDiff: (id: number, other: number, kpi: string, sizeMeters: number,
                withB?: number[], withA?: number[]) =>
    get<SpatialDiff>(`/sessions/${id}/spatial-diff?other=${other}`
      + `&kpi=${encodeURIComponent(kpi)}&sizeMeters=${sizeMeters}`
      + (withB && withB.length ? `&withB=${withB.join(',')}` : '')
      + (withA && withA.length ? `&withA=${withA.join(',')}` : '')),

  distanceBins: (id: number, kpi: string, stepMeters: number) =>
    get<DistanceBin[]>(`/sessions/${id}/distance-bins?kpi=${kpi}&stepMeters=${stepMeters}`),

  cellFootprints: (id: number, basis = 'SERVING', pcis?: number[]) =>
    get<CellFootprint[]>(`/sessions/${id}/cell-footprints?basis=${basis}`
      + (pcis && pcis.length ? `&pcis=${pcis.join(',')}` : '')),

  workbooks: () => get<Workbook[]>('/workbooks'),

  // Fetched, not hardcoded: the server is the one that rejects an over-full pane, so it is
  // the one that says how full is full.
  workbookLimits: () => get<WorkbookLimits>('/workbooks/limits'),

  // Bands or a ramp, for one KPI. Separate from the thresholds call because it is a
  // separate decision - the bands say what the numbers mean, this says how they are drawn.
  setScaleType: async (name: string, scaleType: string): Promise<KpiDefinition> => {
    const res = await fetch(`${BASE}/kpi-definitions/${name}/scale-type`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scaleType }),
    })
    if (!res.ok) throw new Error((await res.text()) || res.statusText)
    return res.json()
  },

  // The string colour set: one colour per event NAME. Reaches the map, the chart, the dock
  // and the pie at once, because all four read the same registry.
  recolourEventType: async (name: string, color: string): Promise<EventType> => {
    const res = await fetch(`${BASE}/event-types/${name}/color`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color }),
    })
    if (!res.ok) throw new Error((await res.text()) || res.statusText)
    return res.json()
  },

  /**
   * Recompute one stored graph's KPI. The values are a snapshot; this refreshes it.
   *
   * @param vars values for the graph's `{?name}` variables, when it has any. Sent on
   *             every run because they are not stored with the graph - that is what makes
   *             re-running at a different threshold a run rather than a new document.
   */
  recomputeKpiGraph: async (id: number, vars?: Record<string, string>):
      Promise<{ valuesComputed: number }> => {
    const res = await fetch(`${BASE}/kpi-definitions/graphs/${id}/recompute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: null, output: null, spec: null, vars: vars ?? {} }),
    })
    if (!res.ok) throw new Error((await res.text()) || res.statusText)
    return res.json()
  },

  saveWorkbook: async (body: WorkbookRequest): Promise<Workbook> => {
    const res = await fetch(`${BASE}/workbooks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      let detail = res.statusText
      try { detail = (await res.json()).message ?? detail } catch { /* no JSON body */ }
      throw new Error(detail)
    }
    return res.json() as Promise<Workbook>
  },

  deleteWorkbook: async (id: number): Promise<void> => {
    const res = await fetch(`${BASE}/workbooks/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`)
  },

  kpiGraphs: () => get<StoredGraph[]>('/kpi-definitions/graphs'),

  validateKpiGraph: async (body: GraphRequest): Promise<GraphValidation> => {
    const res = await fetch(`${BASE}/kpi-definitions/graphs/validate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`)
    return res.json() as Promise<GraphValidation>
  },

  /**
   * What one node produces, without publishing anything.
   *
   * A POST because the graph travels in the body, but it writes nothing - which is the
   * whole point: the alternative was publishing a throwaway KPI to look at a node.
   */
  previewGraphNode: async (body: GraphRequest, nodeId: number,
                           sessionId: number | null, limit = 8): Promise<GraphNodePreview> => {
    const res = await fetch(
      `${BASE}/kpi-definitions/graphs/preview?nodeId=${nodeId}&limit=${limit}`
      + (sessionId == null ? '' : `&sessionId=${sessionId}`),
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body) })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `${res.status}: ${res.statusText}`)
    }
    return res.json() as Promise<GraphNodePreview>
  },

  saveKpiGraph: async (body: GraphRequest): Promise<StoredGraph> => {
    const res = await fetch(`${BASE}/kpi-definitions/graphs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      let detail = res.statusText
      try { detail = (await res.json()).message ?? detail } catch { /* no JSON body */ }
      throw new Error(detail)
    }
    return res.json() as Promise<StoredGraph>
  },

  deleteKpiGraph: async (id: number): Promise<void> => {
    const res = await fetch(`${BASE}/kpi-definitions/graphs/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`)
  },

  /** UC23: one line per sample to the cell serving it, for the whole drive. */
  servingLines: (id: number) => get<ServingLine[]>(`/sessions/${id}/serving-lines`),

  // A report opens rather than downloads: it is meant to be read, and printed to PDF
  // from the browser if the reader wants a file.
  // Built through the same `filtered` as every fetch, so a report or a spreadsheet
  // cannot be the one artefact that silently holds the whole drive.
  reportUrl: (id: number) => `${BASE}${filtered(`/sessions/${id}/report.html`)}`,
  /**
   * One builder for every export link, whichever result and whichever format.
   *
   * `result` rides as a query parameter on the two paths that already exist, so `filtered`
   * covers it with no new entry: it splits at the '?' before matching, and `/export.csv` is
   * already in the list. A path per result would need a line per result in FILTERED_PATHS,
   * and that list going stale is how /distance-bins shipped without the condition.
   *
   * The parameters are the ones ON SCREEN when the link is built - the KPI being shown, the
   * tile size, the statistic painting them. A link that carried the defaults instead would
   * hand over a file of a different analysis from the one the reader is looking at.
   */
  exportUrl: (
    id: number,
    kind: 'csv' | 'geojson',
    params: Record<string, string | number | undefined | null> = {},
  ) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&')
    // Both paths written out rather than composed from `kind`. They are two endpoints, and
    // api-surface.mjs matches a server path against the literal the client holds - so
    // `export.${kind}` made both of them look uncalled. That is the reachability check
    // going blind, not the client getting shorter, and the same reason `${BASE}` is named
    // above the two literals rather than below them: the checker reads backwards from a
    // path to decide it is a URL builder.
    const url = (path: string) => `${BASE}${filtered(`${path}${qs ? `?${qs}` : ''}`)}`
    return kind === 'csv'
      ? url(`/sessions/${id}/export.csv`)
      : url(`/sessions/${id}/export.geojson`)
  },
}

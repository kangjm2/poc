import type {
  AreaBin, Campaign, CellConfig, CellRef, ChannelModel, Comparison, CoverageIssue,
  Degradation, Distribution, DuEndpoint, ImportResult, KpiDefinition, NetworkEvent,
  SeqRange, Series, SessionSummary, SignalingMessage, Snapshot, Statistics, TestRun,
  RunBringUp, CellBreakdown, ProblemSurvey, DerivedKpiResult, FieldToLab,
  Threshold, TrackPoint, UeProfile,
  MonitoredSet, NeighbourBreakdown, PollutionSpan, AreaStats, SpatialDiff,
  GraphNodePreview,
  GraphRequest, GraphValidation, StoredGraph,
  DistanceBin, CellFootprint, Workbook, WorkbookRequest, EventType,
} from './types'

const BASE = '/api'

const rangeQs = (r?: SeqRange | null) => {
  if (!r) return ''
  return (r.from != null ? `&fromSeq=${r.from}` : '') + (r.to != null ? `&toSeq=${r.to}` : '')
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
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
  sessions: () => get<SessionSummary[]>('/sessions'),
  // maxPoints caps the payload; the server decimates while preserving bin changes
  // and per-bucket extremes.
  track: (id: number, kpi: string, maxPoints = 4000) =>
    get<TrackPoint[]>(`/sessions/${id}/track?kpi=${kpi}&maxPoints=${maxPoints}`),
  series: (id: number, kpis: string[], maxPoints = 2000) =>
    get<Series[]>(`/sessions/${id}/series?kpis=${kpis.join(',')}&maxPoints=${maxPoints}`),
  snapshot: (id: number, seq?: number) =>
    get<Snapshot>(`/sessions/${id}/snapshot${seq === undefined ? '' : `?seq=${seq}`}`),
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

  bins: (id: number, kpi: string, sizeMeters: number) =>
    get<AreaBin[]>(`/sessions/${id}/bins?kpi=${kpi}&sizeMeters=${sizeMeters}`),
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

  monitoredSet: (id: number, seq: number) =>
    get<MonitoredSet>(`/sessions/${id}/monitored-set?seq=${seq}`),

  neighbourBreakdown: (id: number, from?: number | null, to?: number | null) =>
    get<NeighbourBreakdown>(`/sessions/${id}/neighbour-breakdown`
      + (from == null ? '' : `?fromSeq=${from}`)
      + (to == null ? '' : `${from == null ? '?' : '&'}toSeq=${to}`)),

  pilotPollution: (id: number) => get<PollutionSpan[]>(`/sessions/${id}/pilot-pollution`),

  /** The polygon travels as "lat,lon;lat,lon;..." - a question being asked, not a stored object. */
  areaStatistics: (id: number, kpi: string, polygon: [number, number][]) =>
    get<AreaStats>(`/sessions/${id}/area-statistics?kpi=${encodeURIComponent(kpi)}`
      + `&polygon=${encodeURIComponent(polygon.map(([a, b]) => `${a},${b}`).join(';'))}`),

  spatialDiff: (id: number, other: number, kpi: string, sizeMeters: number) =>
    get<SpatialDiff>(`/sessions/${id}/spatial-diff?other=${other}`
      + `&kpi=${encodeURIComponent(kpi)}&sizeMeters=${sizeMeters}`),

  distanceBins: (id: number, kpi: string, stepMeters: number) =>
    get<DistanceBin[]>(`/sessions/${id}/distance-bins?kpi=${kpi}&stepMeters=${stepMeters}`),

  cellFootprints: (id: number) =>
    get<CellFootprint[]>(`/sessions/${id}/cell-footprints`),

  workbooks: () => get<Workbook[]>('/workbooks'),

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

  // A report opens rather than downloads: it is meant to be read, and printed to PDF
  // from the browser if the reader wants a file.
  reportUrl: (id: number) => `${BASE}/sessions/${id}/report.html`,
  exportUrl: (id: number, kind: 'csv' | 'geojson', kpi?: string) =>
    kind === 'csv'
      ? `${BASE}/sessions/${id}/export.csv`
      : `${BASE}/sessions/${id}/export.geojson?kpi=${kpi}`,
}

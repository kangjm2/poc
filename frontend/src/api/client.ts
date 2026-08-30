import type {
  AreaBin, Campaign, CellConfig, CellRef, ChannelModel, Comparison, CoverageIssue,
  Degradation, Distribution, DuEndpoint, ImportResult, KpiDefinition, NetworkEvent,
  Series, SessionSummary, SignalingMessage, Snapshot, Statistics, TestRun, TrackPoint,
  UeProfile,
} from './types'

const BASE = '/api'

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
  session: (id: number) => get<SessionSummary>(`/sessions/${id}`),
  // maxPoints caps the payload; the server decimates while preserving bin changes
  // and per-bucket extremes.
  track: (id: number, kpi: string, maxPoints = 4000) =>
    get<TrackPoint[]>(`/sessions/${id}/track?kpi=${kpi}&maxPoints=${maxPoints}`),
  series: (id: number, kpis: string[], maxPoints = 2000) =>
    get<Series[]>(`/sessions/${id}/series?kpis=${kpis.join(',')}&maxPoints=${maxPoints}`),
  snapshot: (id: number, seq?: number) =>
    get<Snapshot>(`/sessions/${id}/snapshot${seq === undefined ? '' : `?seq=${seq}`}`),
  distribution: (id: number, kpi: string) =>
    get<Distribution>(`/sessions/${id}/distribution?kpi=${kpi}`),
  statistics: (id: number, kpi: string) =>
    get<Statistics>(`/sessions/${id}/statistics?kpi=${kpi}`),
  degradations: (id: number, kpi: string, minSamples = 5) =>
    get<Degradation[]>(`/sessions/${id}/degradations?kpi=${kpi}&minSamples=${minSamples}`),
  events: (id: number) => get<NetworkEvent[]>(`/sessions/${id}/events`),
  messages: (id: number) => get<SignalingMessage[]>(`/sessions/${id}/messages`),
  cells: (id: number) => get<CellRef[]>(`/sessions/${id}/cells`),
  kpiDefinitions: () => get<KpiDefinition[]>('/kpi-definitions'),
  compare: (a: number, b: number, kpis: string[]) =>
    get<Comparison>(`/compare?a=${a}&b=${b}&kpis=${kpis.join(',')}`),

  bins: (id: number, kpi: string, sizeMeters: number) =>
    get<AreaBin[]>(`/sessions/${id}/bins?kpi=${kpi}&sizeMeters=${sizeMeters}`),
  coverageIssues: (id: number) => get<CoverageIssue[]>(`/sessions/${id}/coverage-issues`),

  channelModels: () => get<ChannelModel[]>('/lab/channel-models'),
  cellConfigs: () => get<CellConfig[]>('/lab/cell-configs'),
  ueProfiles: () => get<UeProfile[]>('/lab/ue-profiles'),
  duEndpoints: () => get<DuEndpoint[]>('/lab/du-endpoints'),
  campaigns: () => get<Campaign[]>('/lab/campaigns'),
  runs: (campaignId?: number) =>
    get<TestRun[]>(`/lab/runs${campaignId === undefined ? '' : `?campaignId=${campaignId}`}`),

  evaluateRun: async (id: number): Promise<TestRun> => {
    const res = await fetch(`${BASE}/lab/runs/${id}/evaluate`, { method: 'POST' })
    if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`)
    return res.json() as Promise<TestRun>
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

  exportUrl: (id: number, kind: 'csv' | 'geojson', kpi?: string) =>
    kind === 'csv'
      ? `${BASE}/sessions/${id}/export.csv`
      : `${BASE}/sessions/${id}/export.geojson?kpi=${kpi}`,
}

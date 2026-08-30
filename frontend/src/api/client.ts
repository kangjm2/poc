import type {
  Comparison, Degradation, Distribution, KpiDefinition, NetworkEvent, Series,
  SessionSummary, SignalingMessage, Snapshot, Statistics, TrackPoint, CellRef,
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
  track: (id: number, kpi: string) => get<TrackPoint[]>(`/sessions/${id}/track?kpi=${kpi}`),
  series: (id: number, kpis: string[]) =>
    get<Series[]>(`/sessions/${id}/series?kpis=${kpis.join(',')}`),
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
}

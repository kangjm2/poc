export interface SessionSummary {
  id: number
  name: string
  device: string
  operator: string
  technology: string
  scenario: string | null
  buildLabel: string | null
  startedAt: string
  endedAt: string
  locationName: string | null
  sampleCount: number
  eventCount: number
}

export interface TrackPoint {
  seq: number
  ts: string
  latitude: number
  longitude: number
  value: number | null
  color: string
  binLabel: string
  servingPci: number | null
  speedKmh: number | null
}

export interface SeriesPoint { seq: number; ts: string; value: number | null }
export interface Series { kpi: string; displayName: string; unit: string; points: SeriesPoint[] }

export interface DistributionBin {
  label: string; color: string; severity: string
  lowerBound: number | null; upperBound: number | null
  count: number; percentage: number
}
export interface Distribution {
  kpi: string; displayName: string; unit: string
  total: number; bins: DistributionBin[]
}

export interface KpiValue {
  kpi: string; displayName: string; unit: string; value: number | null
  color: string | null; severity: string; binLabel: string | null; decimals: number
}
export interface Snapshot {
  ts: string; seq: number
  latitude: number | null; longitude: number | null; servingPci: number | null
  byCategory: Record<string, KpiValue[]>
}

export interface CdfPoint { value: number; percentile: number }
export interface Statistics {
  kpi: string; displayName: string; unit: string; count: number
  min: number | null; max: number | null; mean: number | null
  p05: number | null; p50: number | null; p95: number | null
  cdf: CdfPoint[]
}

export interface Degradation {
  kpi: string; startTs: string; endTs: string; startSeq: number; endSeq: number
  durationSeconds: number; worstValue: number | null; meanValue: number | null
  severity: string; latitude: number; longitude: number; sampleCount: number
}

export interface ComparisonRow {
  kpi: string; displayName: string; unit: string
  a: Statistics; b: Statistics; meanDelta: number | null; verdict: string
}
export interface Comparison {
  sessionA: SessionSummary; sessionB: SessionSummary; rows: ComparisonRow[]
}

export interface NetworkEvent {
  id: number; ts: string; eventType: string; severity: string
  detail: string | null; latitude: number | null; longitude: number | null
}

export interface SignalingMessage {
  id: number; ts: string; direction: string; protocol: string
  channel: string | null; messageName: string; body: string | null
}

export interface CellRef {
  id: number; pci: number; arfcn: number; band: string | null; gscn: number | null
  cellType: string | null; latitude: number | null; longitude: number | null
  azimuthDeg: number | null
}

export interface Threshold {
  ordinal: number; lowerBound: number | null; upperBound: number | null
  color: string; label: string; severity: string
}
export interface KpiDefinition {
  name: string; displayName: string; unit: string; category: string
  technology: string; direction: string; decimals: number
  description: string | null; thresholds: Threshold[]
}

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
  notes: string | null
  sampleCount: number
  eventCount: number
}

/** Sub-selection of a drive by sample sequence; either bound may be open. */
export interface SeqRange { from: number | null; to: number | null }

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
  /** true = bins came from this session's own distribution, not from configuration */
  derived: boolean
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
  description: string | null
  /** shipped with the product: it has a default scale and cannot be deleted */
  seeded: boolean
  thresholds: Threshold[]
}

// ---------------------------------------------------------------- lab domain

export interface ChannelModel {
  id: number; name: string; modelType: string; profile: string | null
  delaySpreadNs: number | null; maxDopplerHz: number | null
  mimoCorrelation: string | null; pathLossDb: number | null; awgnSnrDb: number | null
  sourceSessionId: number | null; description: string | null
}

export interface CellConfig {
  id: number; name: string; band: string; dlArfcn: number | null; bandwidthMhz: number | null
  scsKhz: number | null; duplex: string; tddPattern: string | null; mimoLayers: number | null
  txAntennas: number | null; rxAntennas: number | null; maxPowerDbm: number | null
}

export interface UeProfile {
  id: number; name: string; release: string | null; ueCount: number | null
  maxMimoLayers: number | null; trafficProfile: string
  targetMbps: number | null; mobilityKmh: number | null
}

export interface DuEndpoint {
  id: number; name: string; vendor: string | null; connectionType: string
  address: string | null; splitOption: string | null; notes: string | null
}

export interface Campaign {
  id: number; name: string; description: string | null; owner: string | null
  createdAt: string; runCount: number
}

export interface Criterion {
  id: number; kpiName: string; aggregate: string; operator: string
  threshold: number; actualValue: number | null; passed: boolean | null
}

export interface TestRun {
  id: number; campaignId: number; name: string
  channelModel: ChannelModel | null; cellConfig: CellConfig | null
  ueProfile: UeProfile | null; duEndpoint: DuEndpoint | null
  sessionId: number | null; status: string; verdict: string | null
  progressPct: number; startedAt: string | null; endedAt: string | null
  message: string | null; criteria: Criterion[]
}

// ------------------------------------------------------- spatial and import

export interface AreaBin {
  centerLat: number; centerLon: number; sizeMeters: number; sampleCount: number
  avgValue: number; minValue: number; maxValue: number; color: string; binLabel: string
}

export interface CoverageIssue {
  type: string; severity: string; startSeq: number; endSeq: number
  sampleCount: number; latitude: number; longitude: number; detail: string
}

export interface ImportResult {
  jobId: number; sessionId: number | null; status: string
  rowsRead: number; samplesLoaded: number; kpisLoaded: number
  mappedKpis: string[]; ignoredColumns: string[]; createdKpis: string[]
  message: string | null
}

/** One instrument in the lab chain, ordered from capture host to the device. */
export interface Instrument {
  id: number; role: string; name: string; model: string | null
  serial: string | null; firmware: string | null; address: string | null
  ordinal: number; notes: string | null
}

/** One bring-up step of a run. */
export interface RunStep {
  id: number; ordinal: number; phase: string; name: string
  instrumentId: number | null; instrumentName: string | null
  status: string; startedAt: string | null; endedAt: string | null
  durationMs: number | null; detail: string | null
}

/** Random-access outcome, the fields the reference tool keeps in its RACH dock. */
export interface RachReport {
  rachType: string | null; rachReason: string | null; rachResult: string | null
  accessDelayMs: number | null; preambleFormat: string | null
  preambleIndex: number | null; preambleCount: number | null
  preambleInitialPwrDbm: number | null; preambleStepDb: number | null
  responseWindowSlots: number | null; raRnti: number | null; ssbId: number | null
  timingAdvance: number | null; pathlossDb: number | null
  puschPowerDbm: number | null; logicalRootSequence: number | null
  contentionResolutions: number | null
}

/** The cell the device camped on. PCI alone does not identify a cell. */
export interface ServingCell {
  cellType: string | null; ssbBand: string | null; ssbArfcn: number | null
  ssbGscn: number | null; pci: number | null; taOffset: number | null
}

/** One cell in the run's status strip. */
export interface RunCell {
  id: number; ordinal: number; label: string; role: string; duplex: string
  band: string; bandwidthMhz: number | null; scsKhz: number | null
  dlArfcn: number | null; ulArfcn: number | null
  powerDbm: number | null; state: string
}

/** Duration, progress and pass rate - the reference run view's three gauges. */
export interface RunGauges {
  elapsedMs: number | null; progressPct: number; passRatePct: number | null
  criteriaPassed: number; criteriaTotal: number
}

export interface RunBringUp {
  runId: number; status: string; chain: Instrument[]; cells: RunCell[]
  steps: RunStep[]; rach: RachReport | null; servingCell: ServingCell | null
  gauges: RunGauges
}

/** One serving cell's share of a session, for the per-cell bar chart. */
export interface CellBar {
  pci: number; arfcn: number | null; band: string | null; cellType: string | null
  sampleCount: number; share: number
  meanValue: number | null; minValue: number | null
  maxValue: number | null; p05Value: number | null
  color: string; binLabel: string
}

export interface CellBreakdown {
  kpi: string; displayName: string; unit: string; decimals: number
  total: number; cells: CellBar[]
}

/** One classified problem; the seq range is what the drill-down jumps to. */
export interface ProblemInstance {
  category: string; categoryLabel: string; severity: string
  startSeq: number; endSeq: number
  latitude: number | null; longitude: number | null
  detail: string; source: string
}

export interface ProblemSlice {
  category: string; label: string; color: string; count: number; share: number
}

export interface ProblemSurvey {
  total: number; categories: ProblemSlice[]; instances: ProblemInstance[]
}

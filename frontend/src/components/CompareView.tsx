import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Comparison, SessionSummary } from '../api/types'
import { CdfOverlay } from './CdfOverlay'

const COMPARE_KPIS = [
  'RSRP', 'RSRQ', 'SINR', 'MAC_DL_THROUGHPUT', 'MAC_UL_THROUGHPUT',
  'DL_BLER', 'CQI', 'PDSCH_RANK',
]

/**
 * Two sessions side by side. Comparing builds under identical conditions is the
 * reason virtual drive test exists, so this is a top-level view rather than a
 * workbook the user has to assemble.
 */
export function CompareView({ sessions }: { sessions: SessionSummary[] }) {
  const [a, setA] = useState<number | null>(null)
  const [b, setB] = useState<number | null>(null)
  const [data, setData] = useState<Comparison | null>(null)
  const [cdfKpi, setCdfKpi] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sessions.length >= 2 && a === null && b === null) {
      const sorted = [...sessions].sort((x, y) => x.id - y.id)
      setA(sorted[0].id)
      setB(sorted[1].id)
    }
  }, [sessions, a, b])

  /**
   * This is where the choice earns its keep. A build compared on sample weighting is
   * partly a comparison of where the two drives happened to stop; on distance weighting
   * it compares the road. On the seeded drives the basis roughly doubles the measured
   * deltas - it does not flip a verdict there, but a delta near the threshold would.
   */
  const [weightedBy, setWeightedBy] = useState('SAMPLE')

  /**
   * Arithmetic on the dB readings, or on the powers behind them.
   *
   * `/compare` has always accepted this and this screen never sent it, so every comparison
   * silently answered AS_RECORDED while the Statistics panel let the reader choose - two
   * screens printing different means for the same drives with nothing saying why. It is not
   * a rounding nicety: by Jensen's inequality the gap for lognormal shadowing is about
   * 0.115 sigma^2 dB, which is 1.8 dB at sigma 4 and 7.4 dB at sigma 8 - larger than most
   * verdicts in the table below.
   *
   * The mean is the only statistic it moves. Percentiles are order statistics and
   * dB-to-linear is monotone, so the median is the same sample either way.
   */
  const [domain, setDomain] = useState('AS_RECORDED')

  useEffect(() => {
    if (a === null || b === null) return
    setError(null)
    api.compare(a, b, COMPARE_KPIS, weightedBy, domain)
      .then(setData).catch((e) => setError(String(e)))
  }, [a, b, weightedBy, domain])

  // The row whose CDFs are overlaid; defaults to the first KPI both sides measured.
  const selectedRow = data
    ? data.rows.find((r) => r.kpi === cdfKpi && r.a.cdf.length > 0 && r.b.cdf.length > 0)
      ?? data.rows.find((r) => r.a.cdf.length > 0 && r.b.cdf.length > 0)
    : null

  return (
    <div className="panels compare">
      <div className="panel">
        <header><span className="title">Compare</span></header>
        <div style={{ padding: 8, display: 'flex', gap: 16, alignItems: 'center' }}>
          <label>A&nbsp;
            <select value={a ?? ''} onChange={(e) => setA(Number(e.target.value))}>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>B&nbsp;
            <select value={b ?? ''} onChange={(e) => setB(Number(e.target.value))}>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {data && (
        <div className="panel">
          <header>
            <span className="title">
              {data.sessionA.buildLabel} vs {data.sessionB.buildLabel}
            </span>
            <span className="basis-controls">
              <label>Weight by</label>
              <select value={weightedBy} aria-label="Compare weight by"
                      title="Sample weighting partly compares where the drives stopped; distance weighting compares the road"
                      onChange={(e) => setWeightedBy(e.target.value)}>
                <option value="SAMPLE">Sample</option>
                <option value="DISTANCE">Distance</option>
              </select>
              <label>Mean in</label>
              <select value={domain} aria-label="Compare mean in"
                      title="dB values averaged as recorded, or converted to power first - the mean is the only statistic this moves"
                      onChange={(e) => setDomain(e.target.value)}>
                <option value="AS_RECORDED">dB as recorded</option>
                <option value="LINEAR">linear power</option>
              </select>
            </span>
            <span className="meta">
              {data.sessionA.sampleCount} / {data.sessionB.sampleCount} samples
            </span>
          </header>
          {/* The verdict is only as meaningful as the basis behind it, so the basis is
              printed with it rather than left to be assumed. */}
          <div className="basis-note">
            Means and percentiles <b>{data.rows[0]?.a?.basisLabel ?? '[Sample]'}</b>
            {weightedBy === 'DISTANCE'
              ? ' — comparing the road rather than where each drive happened to stop'
              : ' — one row per sample, so time spent stopped counts once per second'}
            {domain === 'LINEAR'
              ? '. dB parameters are averaged in power and converted back; percentiles are'
                + ' unchanged, because dB-to-linear is monotone.'
              : ''}
          </div>
          <table className="grid">
            <thead>
              <tr>
                <th>KPI</th>
                <th className="num">A mean</th><th className="num">A p05</th><th className="num">A p95</th>
                <th className="num">B mean</th><th className="num">B p05</th><th className="num">B p95</th>
                <th className="num">Δ mean</th><th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.kpi} className="deg-row" onClick={() => setCdfKpi(r.kpi)}
                    style={r.kpi === selectedRow?.kpi ? { background: '#eef3fa' } : undefined}>
                  <td>{r.displayName} <span style={{ color: '#666' }}>{r.unit}</span></td>
                  <td className="num">{r.a.mean}</td>
                  <td className="num">{r.a.p05}</td>
                  <td className="num">{r.a.p95}</td>
                  <td className="num">{r.b.mean}</td>
                  <td className="num">{r.b.p05}</td>
                  <td className="num">{r.b.p95}</td>
                  <td className="num">{r.meanDelta ?? '-'}</td>
                  <td className={`verdict-${r.verdict.replace(' ', '-')}`}>{r.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && selectedRow && (
        /* The colours are named here rather than taken from SERIES_PALETTE because this
           screen has exactly two sides and A/B is not an ordered list: blue and purple
           are what the table, the deltas and this chart have always meant by A and B. */
        <CdfOverlay title={selectedRow.displayName}
                    meta="click a row above to change KPI"
                    series={[
                      { label: `A (${data.sessionA.buildLabel ?? 'A'})`,
                        cdf: selectedRow.a.cdf, p50: selectedRow.a.p50, color: '#30578d' },
                      { label: `B (${data.sessionB.buildLabel ?? 'B'})`,
                        cdf: selectedRow.b.cdf, p50: selectedRow.b.p50, color: 'var(--trace)' },
                    ]} />
      )}
    </div>
  )
}

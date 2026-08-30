import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Comparison, SessionSummary } from '../api/types'

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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sessions.length >= 2 && a === null && b === null) {
      const sorted = [...sessions].sort((x, y) => x.id - y.id)
      setA(sorted[0].id)
      setB(sorted[1].id)
    }
  }, [sessions, a, b])

  useEffect(() => {
    if (a === null || b === null) return
    setError(null)
    api.compare(a, b, COMPARE_KPIS).then(setData).catch((e) => setError(String(e)))
  }, [a, b])

  return (
    <div className="panels compare">
      <div className="panel">
        <header><span className="title">세션 비교</span></header>
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
            <span className="meta">
              {data.sessionA.sampleCount} / {data.sessionB.sampleCount} samples
            </span>
          </header>
          <table className="grid">
            <thead>
              <tr>
                <th>KPI</th>
                <th className="num">A 평균</th><th className="num">A p05</th><th className="num">A p95</th>
                <th className="num">B 평균</th><th className="num">B p05</th><th className="num">B p95</th>
                <th className="num">Δ 평균</th><th>판정</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.kpi}>
                  <td>{r.displayName} <span style={{ color: '#666' }}>{r.unit}</span></td>
                  <td className="num">{r.a.mean}</td>
                  <td className="num">{r.a.p05}</td>
                  <td className="num">{r.a.p95}</td>
                  <td className="num">{r.b.mean}</td>
                  <td className="num">{r.b.p05}</td>
                  <td className="num">{r.b.p95}</td>
                  <td className="num">{r.meanDelta ?? '-'}</td>
                  <td className={`verdict-${r.verdict}`}>{r.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

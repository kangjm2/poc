import type { AreaStats } from '../api/types'

/**
 * What the samples inside a drawn shape say.
 *
 * The passes are shown beside the aggregate rather than folded into it, because the two
 * answer different questions and only one of them was ever askable before. "This street
 * is bad" and "one of the three times we drove this street was bad" produce the same mean
 * and have different causes; the pass list is what separates them, and clicking one takes
 * the cursor there.
 */
export function AreaStatsPanel({ data, onClose, onPick }: {
  data: AreaStats
  onClose: () => void
  onPick: (seq: number) => void
}) {
  const s = data.statistics
  return (
    <div className="panel area-stats">
      <header>
        <span className="title">This area</span>
        <span className="meta" style={{ marginLeft: 'auto' }}>
          {data.sampleCount} samples · {data.passCount} pass{data.passCount === 1 ? '' : 'es'}
        </span>
        <button style={{ marginLeft: 8 }} onClick={onClose}>Close</button>
      </header>
      {data.sampleCount === 0 ? (
        <div className="loading">The drive never went inside that shape.</div>
      ) : s.count === 0 ? (
        // Samples inside, but none carrying this KPI. Reporting zeroes would state a
        // measurement; this states the absence of one.
        <div className="loading">
          {data.sampleCount} samples are inside, but {data.displayName} was not recorded
          on any of them.
        </div>
      ) : (
        <>
          <table className="grid">
            <tbody>
              <tr><td>{data.displayName}{data.unit ? ` (${data.unit})` : ''}</td>
                <td className="num">{s.count} values</td></tr>
              <tr><td>Mean</td><td className="num">{s.mean}</td></tr>
              <tr><td>Min / Max</td><td className="num">{s.min} / {s.max}</td></tr>
              <tr><td>5th / 50th / 95th pct</td>
                <td className="num">{s.p05} / {s.p50} / {s.p95}</td></tr>
            </tbody>
          </table>
          <table className="grid">
            <thead>
              <tr><th>Pass</th><th className="num">From seq</th><th className="num">To seq</th>
                <th className="num">Samples</th></tr>
            </thead>
            <tbody>
              {data.passes.map((p, i) => (
                <tr key={p.startSeq} className="deg-row" onClick={() => onPick(p.startSeq)}
                    title="Move the cursor to this pass">
                  <td>{i + 1}</td>
                  <td className="num">{p.startSeq}</td>
                  <td className="num">{p.endSeq}</td>
                  <td className="num">{p.sampleCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

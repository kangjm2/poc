import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { CellEstimate } from '../api/types'

/**
 * Where the drive says each cell is, against where the record says it is (UC21 p174-176).
 *
 * The reference draws both on one map - real in green, estimated in purple (p175) - and
 * that picture is the analysis: the line between a pair is the disagreement between a
 * measurement and a database, and a long one means the database is probably wrong. A cell
 * reference drifts as sites are moved, sectors are re-fed and coordinates are mistyped,
 * and a drive is the only independent evidence about it anyone collects routinely.
 *
 * The table is the other half of the same reading, because a distance on a map has no
 * scale a reader can judge: 200 m looks small until it is the difference between two
 * streets.
 */
export function CellLocatorPanel({ sessionId, estimates, onPick, minScore, onMinScore }: {
  sessionId: number | null
  estimates: CellEstimate[] | null
  onPick: (pci: number) => void
  minScore: number
  onMinScore: (v: number) => void
}) {
  if (sessionId == null) return null
  const withRef = (estimates ?? []).filter((e) => e.errorMetres != null)
  const errs = withRef.map((e) => e.errorMetres as number).sort((a, b) => a - b)
  const median = errs.length ? errs[Math.floor(errs.length / 2)] : null

  return (
    <div className="panel">
      <header>
        <span className="title">Cell locator</span>
        <span className="meta">
          {/* The reference's `Minimum accuracy score (0-10)`, and its own note that 9-10
              can filter everything out on data that is not dense. */}
          <label className="locator-score">
            min score&nbsp;
            <input type="number" min={0} max={10} value={minScore}
                   aria-label="Minimum accuracy score"
                   onChange={(e) => onMinScore(Number(e.target.value))} />
          </label>
          {estimates == null ? '…'
            : `${estimates.length} cells`
              + (median == null ? '' : ` · median ${median.toFixed(0)} m from the record`)}
        </span>
      </header>
      {estimates != null && estimates.length === 0 && (
        <div style={{ padding: 10, color: '#666' }}>
          No cell reached the minimum score. The reference warns of this too: at 9 and 10
          nothing survives unless the drive covered the site from more than one side.
        </div>
      )}
      {estimates != null && estimates.length > 0 && (
        <table className="grid">
          <thead>
            <tr>
              <th className="num">PCI</th>
              <th className="num" title="The reference's 1-10. At 6 and above ours land
                   inside 100 m of the record on the seeded drives">Confidence</th>
              <th className="num" title="How far the estimate is from the cell reference.
                   The reference is not necessarily the right one">Off by</th>
              <th className="num" title="Strongest sample - how close the drive got, which
                   is the ceiling on how well a centroid can place the site">Best</th>
              <th className="num">Samples</th>
              <th className="num" title="Samples within 8 dB of the best, which are the
                   ones the position is computed from">Near</th>
            </tr>
          </thead>
          <tbody>
            {estimates.map((e) => (
              <tr key={e.pci} className="deg-row" title="Show this cell on the map"
                  onClick={() => onPick(e.pci)}>
                <td className="num">{e.pci}</td>
                <td className={`num ${e.confidence >= 6 ? '' : 'sev-WARNING'}`}>
                  {e.confidence}/10
                </td>
                <td className="num">
                  {e.errorMetres == null
                    // Not "0" and not blank: no record to disagree with is a different
                    // fact from agreeing with one, and an imported drive has no records.
                    ? <span style={{ color: '#666' }}>no record</span>
                    : `${e.errorMetres.toFixed(0)} m`}
                </td>
                <td className="num">{e.strongestRsrp.toFixed(1)}</td>
                <td className="num">{e.samples}</td>
                <td className="num">{e.samplesUsed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ padding: '6px 10px', color: '#666', whiteSpace: 'normal' }}>
        Estimated from measured signal strength alone: the power-weighted centre of the
        samples that heard each cell loudest. <b>Antenna direction is not estimated</b> -
        one road through a sector samples too little of a lobe to place its bearing, and a
        direction that is tens of degrees out would send someone to the wrong side of a
        mast.
      </div>
    </div>
  )
}

/** Fetches the estimates for a session. Held here so the map and the table share one. */
export function useCellEstimates(sessionId: number | null, minScore: number) {
  const [estimates, setEstimates] = useState<CellEstimate[] | null>(null)
  useEffect(() => {
    if (sessionId == null) { setEstimates(null); return }
    let live = true
    setEstimates(null)
    api.cellLocator(sessionId, minScore)
      .then((e) => { if (live) setEstimates(e) })
      .catch(() => { if (live) setEstimates([]) })
    return () => { live = false }
  }, [sessionId, minScore])
  return estimates
}

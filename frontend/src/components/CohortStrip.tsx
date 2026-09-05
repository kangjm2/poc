import type { Cohort } from '../api/types'
import { seriesColor } from '../view/paint'

/**
 * The narrowest axis the strip will draw, by the KPI's unit.
 *
 * Spanning the axis over the data alone lets any difference fill the strip. Two builds
 * 0.67 dB apart were drawn on an axis 0.8 dB wide, so the elbow between them crossed the
 * whole plot - the same picture a 15 dB regression makes - and a reader who takes the width
 * of the strip as the size of the change, which is what a strip invites, read a rounding
 * difference as a result. So the axis is never narrower than a change worth noticing in
 * that unit; below the floor the empty axis either side is what says the groups are close.
 */
const MIN_SPAN: Record<string, number> = { dBm: 3, dB: 3, '%': 5, Mbps: 10, 'pkt/s': 100 }

/**
 * The drawn range for the readings on a cohort strip, as arithmetic and nothing else.
 *
 * A pad of one twentieth, so the extreme drive is a mark inside the plot and not a
 * half-circle clipped by the frame - which reads as "off the scale" rather than "worst".
 * Then the floor above: a padded range narrower than the unit's floor is widened about its
 * own centre, so the marks keep their place and the frame grows around them. A unit the
 * table does not name gets a tenth of where the data sits, or one whole unit at zero.
 */
export function cohortAxis(points: number[], unit: string): { lo: number; hi: number } {
  const rawLo = Math.min(...points)
  const rawHi = Math.max(...points)
  const margin = (rawHi - rawLo || Math.abs(rawHi) || 1) / 20
  const centre = (rawLo + rawHi) / 2
  const floor = MIN_SPAN[unit] ?? (Math.abs(centre) / 10 || 1)
  if (rawHi - rawLo + 2 * margin < floor) return { lo: centre - floor / 2, hi: centre + floor / 2 }
  return { lo: rawLo - margin, hi: rawHi + margin }
}

/**
 * One row per cohort, on one shared KPI axis, with every member drive drawn on its row.
 *
 * <h3>Why the members are on the chart and not only in a table</h3>
 * A cohort's mean is a number no single drive measured. Three drives at -6, -6 and -14 dB
 * have a mean of -8.7, and a strip showing only that mean says "this group is -8.7" -
 * which is exactly the shape of claim that turns one bad drive into a build regression.
 * Drawing the members makes the spread part of the picture by construction, so a reader
 * who is about to over-read the mean can see why not without asking for another view.
 *
 * <h3>Why the rows are not a time axis</h3>
 * The rows are ordered by each cohort's first drive, and the vertical spacing is constant.
 * That is a sequence, not a timeline: two builds tested a year apart sit one row apart,
 * the same as two tested on consecutive days. Drawing them at true time would leave a
 * strip that is mostly empty space, and drawing a DIAGONAL between consecutive means
 * would say the KPI moved smoothly through the gap, which nothing measured. So the
 * connector is an elbow of axis-aligned segments and the footer says what the spacing is.
 */
export function CohortStrip({ cohorts, unit, decimals, onPick, picked }: {
  cohorts: Cohort[]
  unit: string
  decimals: number
  /** Clicking a row selects it; the CDF overlay and the member table follow. */
  onPick?: (value: string) => void
  picked?: string | null
}) {
  const W = 760
  const PAD = { left: 96, right: 68, top: 16, bottom: 40 }
  const ROW_H = 34
  const GAP = 8

  // Every cohort is a row, including one that measured nothing.
  //
  // This filtered them out, which was wrong in a way the screen could not show: the header
  // above says "N groups", the table below prints a row of em dashes for it, and the CDF
  // legend names it - so three surfaces disagreed about how many groups there were, and the
  // one that was missing is exactly the group whose emptiness IS the answer. Worse, the delta
  // on the next group is measured from a baseline the reader could not see.
  const rows = cohorts
  if (!rows.some((c) => c.stats.mean != null)) {
    return <div className="empty-note">No cohort on screen has a value for this parameter.</div>
  }

  const H = PAD.top + rows.length * (ROW_H + GAP) - GAP + PAD.bottom
  const points = rows.flatMap((c) => [
    ...(c.stats.mean == null ? [] : [c.stats.mean]),
    ...c.members.map((m) => m.mean).filter((v): v is number => v != null),
  ])
  const { lo, hi } = cohortAxis(points, unit)
  const span = hi - lo || 1
  const plotW = W - PAD.left - PAD.right
  const x = (v: number) => PAD.left + ((v - lo) / span) * plotW
  const rowY = (i: number) => PAD.top + i * (ROW_H + GAP) + ROW_H / 2
  const fmt = (v: number | null) => v == null ? '—' : v.toFixed(decimals)

  /**
   * The connector from cohort i's mean to cohort i+1's mean, in axis-aligned segments.
   *
   * Down half a gap, across at that height, then down into the next row. Never a diagonal:
   * see the note above - a diagonal is a claim about what happened between two rows, and
   * between two rows there is nothing.
   */
  const elbow = (x1: number, y1: number, x2: number, y2: number) => {
    const mid = (y1 + y2) / 2
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x1.toFixed(1)} ${mid.toFixed(1)}`
         + ` L ${x2.toFixed(1)} ${mid.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="cohort-strip"
           style={{ width: '100%', height: H, display: 'block' }}>
        {/* The axis, in the DOM. A checker that has to measure a pixel to know what value
            a mark stands for is checking the renderer, not the answer. */}
        <desc>{`axisLo=${lo} axisHi=${hi} rows=${rows.length} unit=${unit}`}</desc>

        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.left + f * plotW} x2={PAD.left + f * plotW}
                  y1={PAD.top} y2={H - PAD.bottom}
                  stroke="#eeeef2" strokeDasharray="2 2" />
            <text x={PAD.left + f * plotW} y={H - PAD.bottom + 14} textAnchor="middle"
                  fontSize="9" fill="#666">{(lo + f * span).toFixed(decimals)}</text>
          </g>
        ))}

        {rows.map((c, i) => {
          // To the nearest row above that has a mean, not to i-1: that is the pair the delta
          // column compares, so a connector to a valueless row would draw a comparison the
          // table does not make.
          if (c.stats.mean == null) return null
          let j = i - 1
          while (j >= 0 && rows[j].stats.mean == null) j--
          if (j < 0) return null
          return (
            <path key={`e${c.value}`} className="cohort-elbow"
                  d={elbow(x(rows[j].stats.mean as number), rowY(j),
                           x(c.stats.mean as number), rowY(i))}
                  fill="none" stroke="#9a9aa2" strokeWidth={1} strokeDasharray="4 3" />
          )
        })}

        {rows.map((c, i) => {
          const mean = c.stats.mean
          const colour = seriesColor(i)
          return (
            <g key={c.value} className="cohort-row" data-bucket={c.value}
               data-mean={mean} data-drives={c.driveCount} data-verdict={c.verdict ?? ''}
               onClick={onPick ? () => onPick(c.value) : undefined}
               style={onPick ? { cursor: 'pointer' } : undefined}>
              <rect x={0} y={rowY(i) - ROW_H / 2} width={W} height={ROW_H}
                    fill={picked === c.value ? '#eef3fa' : 'transparent'} />
              <text x={PAD.left - 8} y={rowY(i) - 2} textAnchor="end" fontSize="11" fill="#222">
                {c.value}
              </text>
              <text x={PAD.left - 8} y={rowY(i) + 10} textAnchor="end" fontSize="9" fill="#666">
                {c.driveCount} drive{c.driveCount === 1 ? '' : 's'}
              </text>
              <line x1={PAD.left} x2={W - PAD.right} y1={rowY(i)} y2={rowY(i)}
                    stroke="#e2e2ea" />

              {/* Members first, so the cohort's own mark is never hidden behind one. */}
              {c.members.map((m) => m.mean == null ? null : (
                <circle key={m.sessionId} className="cohort-member" data-session={m.sessionId}
                        data-mean={m.mean}
                        cx={x(m.mean)} cy={rowY(i)} r={3.5}
                        fill="#fff" stroke={colour} strokeWidth={1.4}>
                  <title>{`${m.name}: ${fmt(m.mean)} ${unit} · ${m.sampleCount} samples`
                    + `${m.heldValue ? ` · ${m.heldValue}` : ''}`}</title>
                </circle>
              ))}
              {mean == null ? (
                // Said in the row rather than by the row's absence. "This group measured
                // nothing" is an answer, and a strip that silently omitted it made the reader
                // count groups wrong.
                <text x={PAD.left + 6} y={rowY(i) + 4} fontSize="10" fill="#8a8a92"
                      className="cohort-nodata">no value for this parameter</text>
              ) : (
                <line className="cohort-mean" data-bucket={c.value} data-mean={mean}
                      x1={x(mean)} x2={x(mean)} y1={rowY(i) - 11} y2={rowY(i) + 11}
                      stroke={colour} strokeWidth={2.5}>
                  <title>{`${c.value} pooled mean ${fmt(mean)} ${unit} over ${c.sampleCount} samples`}</title>
                </line>
              )}

              <text x={W - PAD.right + 6} y={rowY(i) - 2} fontSize="11" fill="#222"
                    className="cohort-figure">{fmt(mean)}</text>
              {c.deltaVsPrevious != null && (
                <text x={W - PAD.right + 6} y={rowY(i) + 10} fontSize="9" fill="#666"
                      className="cohort-delta">
                  {c.deltaVsPrevious > 0 ? '+' : ''}{c.deltaVsPrevious.toFixed(decimals)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {/* Said on the chart, not only in the manual: the reader who is about to treat the
          vertical as time is looking here, not there. */}
      <div className="cohort-footer">
        Ordered by first drive — spacing is not time. Hollow marks are single drives;
        the bar is the group&rsquo;s pooled mean ({unit}).
      </div>
    </div>
  )
}

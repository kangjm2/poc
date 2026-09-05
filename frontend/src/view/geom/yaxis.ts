/**
 * The y axis of a time-series chart, as arithmetic.
 *
 * Padding the extent by a margin on both sides is the right default for a quantity that
 * can lie anywhere on the line - RSRP, RSRQ, SINR - and the wrong one for a quantity that
 * cannot. Throughput opened at -18 Mbps, BLER at -5 %, the fronthaul late-packet counter
 * at -88 pkt/s: each axis named a value the KPI cannot take, and the filled trace stood on
 * a floor below zero. So a series whose readings are all non-negative is drawn from zero
 * and padded upward only; dBm and dB keep the symmetric margin.
 *
 * Here rather than in the component for the reason panegeom.ts gives: the rule is a claim
 * about numbers, and a Node check can hold it to that without a browser.
 */

/** How far the plot reaches beyond the readings, as a share of their span. */
const MARGIN = 0.08

export interface YDomain { lo: number; hi: number }

/**
 * The drawn range for readings that run from `min` to `max`.
 *
 * A flat series has no span to take a share of, so it is given one unit either side and
 * sits mid-plot - unless it is non-negative, in which case it starts at zero like every
 * other non-negative series, so switching KPIs never moves the floor.
 */
export function yDomain(min: number, max: number): YDomain {
  let lo = min
  let hi = max
  if (lo === hi) { lo -= 1; hi += 1 }
  const pad = (hi - lo) * MARGIN
  return { lo: min >= 0 ? 0 : lo - pad, hi: hi + pad }
}

/**
 * A tick's text. `toFixed` keeps the sign of a value that rounds to nothing - the SINR
 * axis ran -11.04 to 33.04 and its second tick, -0.02, printed as "-0" - so the sign goes
 * once the digits are all zero.
 */
export function tickLabel(v: number, decimals: number): string {
  const s = v.toFixed(decimals)
  return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s
}

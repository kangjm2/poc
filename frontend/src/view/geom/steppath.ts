import type { Reading } from './panegeom.ts'

/**
 * The step trace as path data, broken where the samples are not.
 *
 * `TimeSeriesChart` drew one continuous step path through every point it had, and under a
 * global filter the points it has are the samples the condition kept - the server omits the
 * rest. So a stretch the condition removed came out as a plateau at the last kept value:
 * 09:22 to 09:25 of the city drive under `RSRQ >= -12` read as three minutes of steady
 * -88 dBm that were never measured, in the one place a reader would believe them. The map
 * already refuses to do this (routeruns.ts ends a run at every break); the chart is the
 * same fact drawn against time.
 *
 * Here rather than in the component for the reason panegeom.ts gives: arithmetic that only
 * exists inside a render cannot be checked, and "a gap makes two subpaths" is exactly the
 * kind of claim a Node check should be able to make without a browser.
 */

/**
 * Two kept samples are neighbours when nothing was recorded between them.
 *
 * seq is per-sample and dense - the unfiltered series runs 0..n-1 without a hole - so a
 * step of more than one is a sample that is not in the payload, whether the condition
 * removed it or the drive never recorded a value for it. Drawing across it would state a
 * reading we do not have.
 */
export function adjacent(a: { seq: number }, b: { seq: number }): boolean {
  return b.seq - a.seq <= 1
}

export interface StepTrace {
  /** The trace: one subpath per run of neighbouring samples. */
  line: string
  /** The fill under it, each run closed to the baseline on its own, so it breaks with the trace. */
  area: string
  /** How many runs the samples fell into - one when nothing is missing. */
  runs: number
}

/**
 * The step trace and its area, in viewBox units.
 *
 * A step holds its value until the next sample, so every point after a run's first is a
 * horizontal to its x at the previous y and then a vertical to its own y. A run of ONE
 * sample gets a zero-length segment instead of a bare `M`: the bare move draws nothing,
 * and a kept sample that vanishes because both its neighbours were filtered out is the
 * same lie in the other direction. The component gives the trace round caps so that
 * segment shows as a dot.
 */
export function stepTrace(
  pts: Reading[],
  x: (seq: number) => number,
  y: (value: number) => number,
  baseline: number,
): StepTrace {
  const f = (n: number) => n.toFixed(2)
  const line: string[] = []
  const area: string[] = []
  let run: Reading[] = []
  const close = () => {
    if (run.length === 0) return
    const x0 = f(x(run[0].seq))
    let d = `M ${x0} ${f(y(run[0].value))}`
    if (run.length === 1) d += ` L ${x0} ${f(y(run[0].value))}`
    for (let i = 1; i < run.length; i++) {
      const px = f(x(run[i].seq))
      d += ` L ${px} ${f(y(run[i - 1].value))} L ${px} ${f(y(run[i].value))}`
    }
    line.push(d)
    area.push(`${d} L ${f(x(run[run.length - 1].seq))} ${f(baseline)} L ${x0} ${f(baseline)} Z`)
    run = []
  }
  for (const p of pts) {
    if (run.length > 0 && !adjacent(run[run.length - 1], p)) close()
    run.push(p)
  }
  close()
  return { line: line.join(' '), area: area.join(' '), runs: line.length }
}

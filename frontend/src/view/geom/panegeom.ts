import { seriesColor } from '../paint.ts'
import type { Series, SeriesPoint, WorkbookLayer } from '../../api/types'

/**
 * What a composed pane looks like, as arithmetic - with nothing on the screen involved.
 *
 * This exists because a workbook has to leave the tool. Everything else this application
 * exports is a table the server writes, and a pane is not a table: it is a picture whose
 * shape lives in a React component. The naive way to export it is to plot it again in the
 * exporter, and that is the mistake this repository has already made four times under
 * other names - RouteContinuity, event_type, AggregationBasis, Csv - and written down each
 * time: a rule in two places is a rule that will disagree. A second plotter would disagree
 * silently, because both pictures would look like charts of the right drive.
 *
 * So the geometry moved here and nothing draws it. `composeChartPane` takes what the pane
 * fetched and returns paths, ticks and legend text; `MultiSeriesChart` turns that into SVG
 * elements and the document builder turns the same object into SVG text. Neither computes
 * anything. A checker can import this file in Node - no build step - and compare what it
 * returns against what the browser drew, which makes "the export is the same arithmetic as
 * the screen" an assertion rather than a promise.
 *
 * The formatted strings are here for the same reason as the numbers. Returning only `lo`
 * and `hi` would leave `toFixed(1)` in the component and a second `toFixed` in the
 * exporter, and then a change to two decimals would move the screen and not the file -
 * which is the same defect one layer up, and harder to see because both numbers are right.
 */

/** A sample that carries a reading. A null is absence, and absence is not zero. */
export type Reading = SeriesPoint & { value: number }
export function hasValue(p: SeriesPoint): p is Reading { return p.value != null }

/** The pane's drawn box, in viewBox units. Not pixels: the SVG scales to its container. */
export const PANE_W = 1000
export const PANE_H = 200
const PAD_R = 8
const PAD_T = 10
const PAD_B = 18
/** Room for tick labels, and only when there is an axis worth labelling. */
const PAD_L_LABELLED = 44
const PAD_L_BARE = 8

/** How many decimals a pane prints. One rule, so the legend and the file agree. */
const DECIMALS = 1

export interface PaneTrace {
  key: string
  color: string
  displayName: string
  unit: string
  /** The path, in viewBox units. */
  d: string
  lo: number
  hi: number
  /** The sample under the cursor, and what the legend says about it. */
  atSeq: number
  atValue: number
  atText: string
  rangeText: string
}

export interface PaneTick { y: number; value: number; label: string }

export interface ChartPaneGeometry {
  frame: { w: number; h: number; padL: number; padT: number; padR: number; padB: number }
  /** One trace means one unit, so the pane can carry a real axis. */
  single: boolean
  maxSeq: number
  ticks: PaneTick[]
  traces: PaneTrace[]
  cursorX: number
  /** What the axis is, in words - so a file can say it and a check can read it. */
  axisDesc: string
  /** Why there is nothing to draw, or null when there is. */
  empty: null | 'no-visible-layer' | 'no-samples'
}

/** The number as this pane prints it, everywhere it is printed. */
export function paneNumber(v: number): string { return v.toFixed(DECIMALS) }

/**
 * The colour of the trace a layer draws.
 *
 * Delegates to `seriesColor` rather than indexing the palette again: the cohort strip and
 * the CDF overlay already order series by that function, and a third indexing expression
 * would be a third opinion about which blue is first. The index is the layer's position on
 * the pane, INCLUDING hidden layers, so unticking a layer does not recolour its siblings.
 */
export function paneTraceColor(layers: Pick<WorkbookLayer, 'kpiName'>[], kpiName: string): string {
  const i = layers.findIndex((l) => l.kpiName === kpiName)
  return seriesColor(i < 0 ? 0 : i)
}

/**
 * The sample under the cursor: the last one at or before it.
 *
 * Decimated payloads do not carry every seq, so "the reading here" has to mean the most
 * recent one, not the next one to come. `TimeSeriesChart` and the map cursor both already
 * read it that way; the composed pane read it the other way (`points.find(p => p.seq >=
 * cursorSeq)`), so the same drive at the same cursor printed a different number on a
 * composed pane than on the built-in chart beside it, and the gap widened with decimation.
 */
export function sampleAtCursor(points: Reading[], cursorSeq: number): Reading | undefined {
  let best: Reading | undefined
  for (const p of points) {
    if (p.seq > cursorSeq) break
    best = p
  }
  return best ?? points[0]
}

/** Where a seq sits across the pane. */
function xOf(geom: { frame: ChartPaneGeometry['frame'] }, maxSeq: number, seq: number): number {
  const { w, padL, padR } = geom.frame
  return padL + (seq / Math.max(1, maxSeq)) * (w - padL - padR)
}

/**
 * A click at a fraction of the pane's width, as a seq. The inverse of the scale above.
 *
 * It lives beside the forward scale because it did not: the pane mapped a click across the
 * whole SVG width while the plot was inset by `padL`, so on a single-layer pane - where
 * `padL` is 44 - clicking exactly on a trace point moved the shared cursor about 4.6% of
 * the drive away from the point that was clicked. `TimeSeriesChart.seqAt` had always
 * subtracted its own left pad. Two mappings, one of them the inverse of nothing.
 */
export function seqAtFraction(geom: ChartPaneGeometry, frac: number): number {
  const { w, padL, padR } = geom.frame
  const rel = Math.max(0, Math.min(1, frac)) * w
  const inner = (rel - padL) / Math.max(1e-9, w - padL - padR)
  const seq = Math.round(Math.max(0, Math.min(1, inner)) * geom.maxSeq)
  return Math.max(0, Math.min(geom.maxSeq, seq))
}

export interface PaneTraceInput { key: string; color: string; series: Series | undefined }

/**
 * The pane, as arithmetic.
 *
 * Each trace is normalised to its own min/max onto a shared axis. That is the honest way
 * to put RSRP in dBm beside a percentage; the alternative is a second axis, which invites
 * reading a crossing point as meaningful when it is an artefact of two scales chosen
 * independently. So a multi-trace pane's axis carries no numbers and each layer's real
 * range is printed in the legend instead - which is why `rangeText` is part of the
 * geometry and not of the markup.
 */
export function composeChartPane(
  { traces, cursorSeq, w = PANE_W, h = PANE_H }: {
    traces: PaneTraceInput[]
    cursorSeq: number
    w?: number
    h?: number
  },
): ChartPaneGeometry {
  const withData = traces
    .map((t) => ({ ...t, pts: (t.series?.points ?? []).filter(hasValue) }))
    .filter((t) => t.series && t.pts.length > 0)

  const single = withData.length === 1
  const padL = single ? PAD_L_LABELLED : PAD_L_BARE
  const frame = { w, h, padL, padT: PAD_T, padR: PAD_R, padB: PAD_B }

  if (withData.length === 0) {
    return {
      frame, single: false, maxSeq: 0, ticks: [], traces: [], cursorX: padL,
      axisDesc: traces.length === 0 ? 'nothing on this pane' : 'no samples for these layers',
      empty: traces.length === 0 ? 'no-visible-layer' : 'no-samples',
    }
  }

  const maxSeq = Math.max(...withData.map((t) => t.pts[t.pts.length - 1].seq))
  const x = (seq: number) => xOf({ frame }, maxSeq, seq)
  const plotH = h - PAD_T - PAD_B

  // A real axis only when there is one unit on it. With several the ticks would label one
  // trace's dBm and leave every other trace unlabelled beside them.
  const soleLo = single ? Math.min(...withData[0].pts.map((p) => p.value)) : 0
  const soleHi = single ? Math.max(...withData[0].pts.map((p) => p.value)) : 0
  const ticks: PaneTick[] = single
    ? [soleHi, (soleHi + soleLo) / 2, soleLo].map((value) => ({
      value,
      y: PAD_T + (1 - (value - soleLo) / Math.max(1e-9, soleHi - soleLo)) * plotH,
      label: paneNumber(value),
    }))
    : []

  const out: PaneTrace[] = withData.map((t) => {
    const lo = Math.min(...t.pts.map((p) => p.value))
    const hi = Math.max(...t.pts.map((p) => p.value))
    const span = Math.max(1e-9, hi - lo)
    const y = (v: number) => PAD_T + (1 - (v - lo) / span) * plotH
    const d = t.pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.seq)} ${y(p.value)}`).join(' ')
    const at = sampleAtCursor(t.pts, cursorSeq)!
    const unit = t.series!.unit ?? ''
    return {
      key: t.key,
      color: t.color,
      displayName: t.series!.displayName,
      unit,
      d,
      lo,
      hi,
      atSeq: at.seq,
      atValue: at.value,
      atText: `${paneNumber(at.value)}${unit ? ` ${unit}` : ''}`,
      rangeText: `range ${paneNumber(lo)}…${paneNumber(hi)}`,
    }
  })

  return {
    frame,
    single,
    maxSeq,
    ticks,
    traces: out,
    cursorX: x(Math.max(0, Math.min(maxSeq, cursorSeq))),
    axisDesc: single
      ? `x: sample 0–${maxSeq}; y: ${paneNumber(soleLo)}–${paneNumber(soleHi)}`
        + `${out[0].unit ? ` ${out[0].unit}` : ''}`
      : `x: sample 0–${maxSeq}; y: ${out.length} layers, each normalised to its own`
        + ` range - the axis carries no numbers`,
    empty: null,
  }
}

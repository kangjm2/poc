import type { TrackPoint } from '../api/types'

/**
 * The one place a route sample gets the colour it is drawn in.
 *
 * There are now two reasons to colour a route and they mean opposite kinds of thing.
 * A KPI ramp is a JUDGEMENT - red is bad, and the same colour means the same verdict in
 * every drive. Colouring by serving cell is an IDENTITY - the colour means "this one, not
 * that one", carries no verdict, and is only stable inside the drive that produced it.
 *
 * Keeping both in one function is deliberate: the map, the legend and the checkers then
 * cannot disagree about what a sample is painted, and the difference between judgement and
 * identity is stated once instead of being implied by which screen you are on.
 */

export type ColorBy = 'kpi' | 'pci'

/**
 * The categorical palette for identity colouring.
 *
 * NOT the event-type palette, although that was the obvious reuse. Those nine colours
 * already mean nine specific failures on this same map; letting one of them also mean
 * "PCI 41" would make a colour ambiguous exactly where the two are drawn together.
 *
 * Okabe-Ito, chosen because it stays distinguishable under the common colour-vision
 * deficiencies - a route dense with adjacent cells is the worst case for a palette that
 * only works for trichromats. Grey is not in the rotation: it is reserved below for cells
 * the palette could not give a colour to, so "grey" always means "not identified here"
 * rather than "the eighth cell".
 */
export const IDENTITY_PALETTE = [
  '#0072b2', // blue
  '#e69f00', // orange
  '#009e73', // bluish green
  '#cc79a7', // reddish purple
  '#56b4e9', // sky blue
  '#d55e00', // vermillion
  '#f0e442', // yellow
]

/**
 * The palette for a SERIES - one line, one bar row, one curve on an overlay.
 *
 * A third palette beside the identity one and the event one, and deliberately so. Identity
 * colours answer "which cell, in this drive"; event colours answer "which failure". A
 * series colour answers neither: it is a handle for a thing the user themselves put on
 * the screen in a particular order, and its whole job is to stay attached to position 1
 * whatever position 1 happens to be today. Reusing IDENTITY_PALETTE would have made a
 * workbook layer and a serving cell the same blue on one screen.
 *
 * Position-stable, so a chart legend, a CDF overlay and a cohort strip showing the same
 * ordered list agree without passing colours between them. Eight entries because that is
 * where a legend stops being readable, which is also `CohortService.MAX_COHORTS`.
 */
export const SERIES_PALETTE = [
  '#30578d', '#c0392b', '#1f7a1f', '#8a2be2',
  '#d4783c', '#0080c0', '#7a6000', '#b5179e',
]

/** The colour of series `i`, wrapping rather than failing - a chart is not a cell map. */
export function seriesColor(i: number): string {
  return SERIES_PALETTE[i % SERIES_PALETTE.length]
}

export const UNIDENTIFIED = '#9a9aa2'
/** What a sample is painted when another bin is isolated. */
export const MUTED = '#c9c9d0'

/**
 * Give each serving cell a colour, in order of first appearance along the drive.
 *
 * By first appearance rather than by PCI number, so the first cell of the drive is always
 * the first colour and a drive reads the same way each time it is opened. The cost is that
 * the mapping is per-drive: PCI 41 is not the same colour in another measurement, which
 * the legend has to say - the same honesty the derived colour scale already owes about its
 * quartiles.
 *
 * Cells beyond the palette get UNIDENTIFIED rather than a repeated colour. Two cells
 * sharing a colour would read as one cell, which is a wrong answer; "more cells than
 * colours" is only a missing answer, and the legend can say how many.
 */
export function buildPciColors(track: TrackPoint[]): Map<number, string> {
  const out = new Map<number, string>()
  for (const p of track) {
    if (p.servingPci == null || out.has(p.servingPci)) continue
    out.set(p.servingPci, IDENTITY_PALETTE[out.size] ?? UNIDENTIFIED)
  }
  return out
}

export interface PaintRule {
  colorBy: ColorBy
  /** A bin label to show alone, the rest muted. Only meaningful when colorBy is 'kpi'. */
  isolate: string | null
  pciColors: Map<number, string>
}

/**
 * Whether this sample is context rather than answer.
 *
 * Two questions can mute a sample and they compose: a legend band isolates by VALUE, a
 * drawn shape isolates by PLACE, and a sample outside either is context. Written once so
 * the two cannot drift into different greys or different ideas of "outside" - the second
 * reason arrived months after the first, and the temptation was a separate branch beside
 * the existing one rather than the same sentence.
 *
 * `inArea` undefined or null means no shape was drawn, which is not the same as outside.
 */
function muted(p: TrackPoint, rule: PaintRule): boolean {
  if (rule.isolate != null && p.binLabel !== rule.isolate) return true
  return p.inArea === false
}

export interface Paint {
  color: string
  weight: number
  /** Whether this sample is the one being looked at, as opposed to context. */
  emphasised: boolean
}

/**
 * Isolating a bin MUTES the rest instead of hiding it.
 *
 * Hiding was the first instinct and it is wrong: a route with only the bad samples drawn
 * is a scatter of disconnected fragments with no way to tell where they sit on the drive,
 * or even which way the car was going. The context has to stay, just quietly - which is
 * also exactly what users were doing by hand, by opening the colour editor and painting
 * every other bin grey.
 */
export function paint(p: TrackPoint, rule: PaintRule): Paint {
  if (rule.colorBy === 'pci') {
    // The shape still mutes here. Identity colouring answers "which cell", and asking it
    // inside a drawn area is the same question narrowed - unlike the legend band, which
    // is about a value ramp that identity colouring is not using.
    if (p.inArea === false) return { color: MUTED, weight: 3, emphasised: false }
    const c = p.servingPci == null ? UNIDENTIFIED : (rule.pciColors.get(p.servingPci) ?? UNIDENTIFIED)
    return { color: c, weight: 6, emphasised: true }
  }
  if (muted(p, rule)) {
    return { color: MUTED, weight: 3, emphasised: false }
  }
  return { color: p.color, weight: 6, emphasised: true }
}

/**
 * The same isolation rule for anything that is not the route line.
 *
 * The bars on the Cells page and the distance profile are painted from the same colour
 * scale as the route, so a legend band the user clicked has an obvious meaning there too.
 * They read it through this rather than repeating the comparison, because the moment the
 * rule exists in two places one of them is eventually the stale one - and the stale copy
 * shows as a screen that quietly disagrees with the map beside it.
 *
 * Muting rather than filtering, for the reason paint() gives: a chart with only the
 * isolated bar left loses the sense of how big a share it was.
 */
export function paintBar(binLabel: string, color: string, isolate: string | null): string {
  return isolate != null && binLabel !== isolate ? MUTED : color
}

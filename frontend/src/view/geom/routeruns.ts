import { buildPciColors, paint } from '../paint.ts'
import type { ColorBy } from '../paint'
import type { TrackPoint } from '../../api/types'

/**
 * The route's drawn form, with no map involved.
 *
 * `RouteMap` used to compute this inside the effect that hands it to Leaflet, which meant
 * the most carefully reasoned block in the frontend - where a run ends, which step is a
 * break, which points are believable enough to frame by - existed only as a side effect of
 * drawing. Nothing could read it. So a document that has to show a map pane had two
 * options: draw the route a second way, or move the rule here. The first is how two
 * pictures of one drive start disagreeing about where the vehicle went.
 *
 * Leaflet-free on purpose. A checker can import this in Node and compare what it returns
 * against what the browser drew, which is the only way "the exported map is the map" is an
 * assertion rather than a hope.
 *
 * The tooltip TEXT comes out as data for the same reason. A static picture loses every
 * hover, and the hover is the only place a run's time, value, bin and sample count are
 * ever stated; a document that re-worded them would be a second author of the same facts.
 */

export interface RouteRun {
  /** Positions, in order. Always at least two - a one-point run is not a line. */
  coords: Array<[number, number]>
  color: string
  weight: number
  emphasised: boolean
  /** The sample the run starts at: what the tooltip and the facts table are about. */
  headSeq: number
  headTs: string
  headValue: number | null
  binLabel: string
  servingPci: number | null
  sampleCount: number
  /** What the hover says, one line per entry. */
  tooltipLines: string[]
}

export interface RouteBreak {
  /** 1 gap (no fix), 2 implausible fix. */
  kind: 1 | 2
  coords: Array<[number, number]>
  seconds: number
  fromSeq: number
  toSeq: number
  tooltipLines: string[]
}

export interface RouteForm {
  runs: RouteRun[]
  breaks: RouteBreak[]
  /** The points the map may frame itself on. */
  frame: Array<[number, number]>
}

export interface RouteRule {
  colorBy: ColorBy
  isolate: string | null
  /** Named on the map's header; the tooltip prints it beside the value. */
  kpiName: string
}

const at = (p: TrackPoint): [number, number] => [p.latitude, p.longitude]

/**
 * The points a map may frame itself on.
 *
 * A rejected fix must not frame the map either. Leaving it in the bounds squashes the
 * whole real drive into a few pixels so the outlier can stay on screen - the map ends up
 * unreadable in order to show the one position we have already decided not to believe.
 * The same judgement the distance query makes.
 */
export function believableFrame(track: TrackPoint[]): Array<[number, number]> {
  const believable = track.filter((p) => p.breakBefore !== 2)
  return (believable.length > 1 ? believable : track).map(at)
}

/**
 * Consecutive same-colour samples as one run, and the discontinuities between them.
 *
 * Drawing a polyline per segment creates a layer, an SVG node and a tooltip for every
 * sample: on an eight-hour drive that is thousands of objects. The colour only changes
 * where the KPI crosses a bin boundary, so a run is the natural unit.
 *
 * A run also ends at a discontinuity. Carrying a coloured line across one would state that
 * we measured ground we have nothing from (a gap) or that the vehicle went somewhere it
 * did not (a bad fix) - the map's only two ways of asserting something false. Under 'pci'
 * every handover becomes a run boundary, which is the whole point of that mode: the
 * boundary IS the finding.
 */
export function composeRuns(track: TrackPoint[], rule: RouteRule): RouteForm {
  const frame = believableFrame(track)
  if (track.length === 0) return { runs: [], breaks: [], frame }

  const paintRule = {
    colorBy: rule.colorBy, isolate: rule.isolate, pciColors: buildPciColors(track),
  }
  const painted = track.map((p) => paint(p, paintRule))

  const runs: RouteRun[] = []
  let runStart = 0
  for (let i = 1; i <= track.length; i++) {
    const broken = i < track.length && track[i].breakBefore > 0
    const endOfRun = i === track.length || broken
      || painted[i].color !== painted[runStart].color
    if (!endOfRun) continue

    const head = track[runStart]
    const ink = painted[runStart]
    // Extend one sample past the run so adjacent runs join without a visible gap - but
    // never across a break, which is the one place the gap is the point.
    const end = broken ? i - 1 : Math.min(i, track.length - 1)
    const coords = track.slice(runStart, end + 1).map(at)

    if (coords.length > 1) {
      runs.push({
        coords,
        color: ink.color,
        weight: ink.weight,
        emphasised: ink.emphasised,
        headSeq: head.seq,
        headTs: head.ts,
        headValue: head.value,
        binLabel: head.binLabel,
        servingPci: head.servingPci,
        sampleCount: coords.length,
        tooltipLines: [
          new Date(head.ts).toISOString().slice(11, 19),
          `${rule.kpiName}: ${head.value ?? '-'}`,
          head.binLabel,
          ...(rule.colorBy === 'pci' ? [`serving PCI ${head.servingPci ?? '-'}`] : []),
          `${coords.length} samples`,
        ],
      })
    }
    runStart = i
  }

  // The breaks themselves. Omitting them would leave the route looking as though it simply
  // ended and resumed elsewhere, which is a different false impression. A thin dashed line
  // says "the vehicle went this way and we have nothing from it" - visibly not a
  // measurement, and it cannot be mistaken for one because it carries no bin colour.
  const breaks: RouteBreak[] = []
  for (let i = 1; i < track.length; i++) {
    const kind = track[i].breakBefore
    if (!kind) continue
    const a = track[i - 1]
    const b = track[i]
    const seconds = Math.round(
      (new Date(b.ts).getTime() - new Date(a.ts).getTime()) / 1000,
    )
    const gap = kind === 1
    breaks.push({
      kind: gap ? 1 : 2,
      coords: [at(a), at(b)],
      seconds,
      fromSeq: a.seq,
      toSeq: b.seq,
      tooltipLines: gap
        ? ['No measurement', `${seconds}s with no position fix`, `seq ${a.seq} → ${b.seq}`]
        : ['Implausible position fix', 'excluded from distance travelled',
           `seq ${a.seq} → ${b.seq}`],
    })
  }

  return { runs, breaks, frame }
}

/** How a break is classed on the map, and therefore how a check names it. */
export function breakClass(kind: 1 | 2): string {
  return kind === 1 ? 'route-gap' : 'route-glitch'
}
export function breakColor(kind: 1 | 2): string { return kind === 1 ? '#8a8a95' : '#b00020' }
export function breakDash(kind: 1 | 2): string { return kind === 1 ? '5 7' : '3 5' }

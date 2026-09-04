import type {
  AreaBin, CellEstimate, CellFootprint, CellRef, DiffBin, MonitoredCell, NetworkEvent,
  ServingLine, TrackPoint,
} from '../api/types'

/**
 * What the map is drawing, named once.
 *
 * The reference keeps a Layers list down the side of every map and it is the only place
 * that answers "what is on this picture right now". Ours had nine overlays and no such
 * place: the route came from one control, tiles from a second, footprints from a third,
 * and events, cell markers, monitored-set lines, the drawn shape and the difference grid
 * from no control at all - they appeared because of which tab you were on. A user looking
 * at a crowded map had no way to find out what the shapes were, and no way to take one
 * away.
 *
 * The rule this file exists to enforce: the list is DERIVED FROM THE SAME VALUES the map
 * is handed, never from a parallel record of what was switched on. A list built from
 * intentions drifts from the drawing the first time a fetch fails or a tab passes a prop
 * the toolbar does not know about, and then the dock confidently names a layer that is not
 * there. Here a layer is drawn if and only if the data for it is in `MapContents`, which
 * is the object spread into RouteMap.
 */

/** Exactly what a map is given. Spread into RouteMap and read by describeLayers. */
export interface MapContents {
  track: TrackPoint[]
  cells: CellRef[]
  bins?: AreaBin[] | null
  footprints?: CellFootprint[] | null
  monitored?: MonitoredCell[] | null
  events?: NetworkEvent[]
  showServingLine?: boolean
  diffBins?: DiffBin[] | null
  /**
   * Estimated cell positions, drawn beside the recorded ones.
   *
   * Added 2026-09-04, and its absence was this file's own rule being broken by the change
   * that introduced the overlay: the estimates reached RouteMap as a separate prop, so the
   * map drew a layer `describeLayers` could not see and the dock could not name. Exactly
   * the drift the doc comment above describes - a list built from anything other than the
   * contents handed to the map.
   */
  estimates?: CellEstimate[] | null
  /**
   * UC23: one line per sample to the cell serving it, for the whole drive.
   *
   * Not the same layer as `showServingLine`, which draws ONE line from the cursor. That is
   * a reading aid for the moment under the cursor; this is a shape you look at whole - the
   * fan tells you where a cell held on past its neighbour, and where one reaches too far.
   */
  servingLines?: ServingLine[] | null
}

/** A layer's toggle, where one exists. App maps these ids to its setters, in one switch. */
export type LayerToggle = 'bins' | 'footprints' | 'events' | 'servingLine'
  | 'servingLines'

export interface MapLayer {
  id: string
  label: string
  /**
   * Whether the map is actually drawing it. Always read from the contents, never from
   * whether a switch is set - that separation is the reason this file exists.
   */
  drawn: boolean
  /** How many marks this layer contributed. Zero when it is switched off or empty. */
  count: number
  /**
   * Why the layer is on screen. 'data' means it came with the drive and has no switch on
   * this screen; naming that is the point, because those were the invisible ones.
   */
  source: 'toggle' | 'data'
  toggle?: LayerToggle
  /** A swatch for the list, where the layer has one identifying colour. */
  swatch?: string
}

/**
 * The layers, in drawing order - bottom of the stack first, which is the order the eye
 * resolves them in and the order the reference lists them.
 */
export function describeLayers(m: MapContents, off: LayerToggle[] = []): MapLayer[] {
  const out: MapLayer[] = []
  // A switched-off layer is still listed, unticked, or turning one off would delete the
  // control that turns it back on - a checkbox with one usable state.
  //
  // But only on a map that DOES that layer at all. The two are different questions and
  // conflating them produced a control with one usable state anyway, in the other
  // direction: the Cells map does not draw footprints, so its contents carry no
  // `footprints` key, yet the dock listed "Cell footprints - off" because the switch is
  // application-wide. Ticking it drew nothing and made the row disappear, since the map
  // then had neither footprints nor an off-switch to explain. `events` had the same defect
  // latent - hide events on Overview, walk to Cells, and an Events row would appear for a
  // map that has none.
  //
  // So: an ABSENT key means this map does not offer the layer; a null or empty value means
  // it does and there is nothing to draw. `undefined` rather than a truthiness test,
  // because empty and absent are exactly the two cases being told apart. This keeps the
  // rule at the top of the file intact - the list still comes only from the contents.
  const offers = (v: unknown) => v !== undefined
  const isOff = (t: LayerToggle) => off.includes(t)

  if (offers(m.footprints) && ((m.footprints?.length ?? 0) > 0 || isOff('footprints'))) {
    out.push({
      id: 'footprints', label: 'Cell footprints', drawn: !!m.footprints?.length,
      count: m.footprints?.length ?? 0,
      source: 'toggle', toggle: 'footprints', swatch: '#8a8a95',
    })
  }
  if (m.diffBins && m.diffBins.length > 0) {
    out.push({
      id: 'diff', label: 'Difference tiles', drawn: true,
      count: m.diffBins.length, source: 'data',
    })
  }
  if (m.bins && m.bins.length > 0) {
    // Tiles REPLACE the route rather than sitting over it, so both are never counted as
    // drawn at once - saying otherwise would have the dock claim a route the map is not
    // showing.
    out.push({
      id: 'bins', label: 'Area bins', drawn: true, count: m.bins.length,
      source: 'toggle', toggle: 'bins',
    })
  } else if (m.track.length > 0) {
    out.push({
      id: 'route', label: 'Route', drawn: true, count: m.track.length, source: 'data',
    })
  }
  if (m.cells.length > 0) {
    out.push({
      id: 'cells', label: 'Cell sites', drawn: true, count: m.cells.length, source: 'data',
    })
  }
  if (m.estimates && m.estimates.length > 0) {
    // Its own row rather than folded into 'Cell sites'. The two are different claims about
    // the same masts - one is what the record says, one is what the drive measured - and
    // the gap between them is the reason the screen exists, so a dock that counted them
    // together would hide the subject.
    out.push({
      id: 'locator', label: 'Estimated cell positions', drawn: true,
      count: m.estimates.length, source: 'data', swatch: '#5b3fa8',
    })
  }
  if (offers(m.showServingLine)) {
    out.push({
      id: 'serving', label: 'Line to serving cell', drawn: !!m.showServingLine,
      count: m.showServingLine ? 1 : 0, source: 'toggle', toggle: 'servingLine',
    })
  }
  if (offers(m.servingLines) && ((m.servingLines?.length ?? 0) > 0 || isOff('servingLines'))) {
    out.push({
      id: 'servingLines', label: 'Serving cell lines (whole drive)',
      drawn: !!m.servingLines?.length, count: m.servingLines?.length ?? 0,
      source: 'toggle', toggle: 'servingLines', swatch: '#b06a1f',
    })
  }
  if (m.monitored && m.monitored.length > 0) {
    out.push({
      id: 'monitored', label: 'Lines to monitored set', drawn: true,
      count: m.monitored.length, source: 'data',
    })
  }
  if (offers(m.events) && ((m.events?.length ?? 0) > 0 || isOff('events'))) {
    out.push({
      id: 'events', label: 'Events', drawn: !!m.events?.length,
      count: m.events?.length ?? 0, source: 'toggle', toggle: 'events',
    })
  }
  // Counted off the track rather than off a separate "an area is drawn" flag, for the same
  // reason the map's own caption is - see RouteMap.areaFiltered.
  const outside = m.track.filter((p) => p.inArea === false).length
  if (outside > 0) {
    out.push({
      id: 'area', label: 'Drawn area', drawn: true,
      count: m.track.length - outside, source: 'data',
    })
  }
  return out
}

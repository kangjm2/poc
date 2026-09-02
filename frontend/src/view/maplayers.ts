import type {
  AreaBin, CellFootprint, CellRef, DiffBin, MonitoredCell, NetworkEvent, TrackPoint,
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
}

/** A layer's toggle, where one exists. App maps these ids to its setters, in one switch. */
export type LayerToggle = 'bins' | 'footprints' | 'events' | 'servingLine'

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
  const isOff = (t: LayerToggle) => off.includes(t)

  if ((m.footprints && m.footprints.length > 0) || isOff('footprints')) {
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
  out.push({
    id: 'serving', label: 'Line to serving cell', drawn: !!m.showServingLine,
    count: m.showServingLine ? 1 : 0, source: 'toggle', toggle: 'servingLine',
  })
  if (m.monitored && m.monitored.length > 0) {
    out.push({
      id: 'monitored', label: 'Lines to monitored set', drawn: true,
      count: m.monitored.length, source: 'data',
    })
  }
  if ((m.events && m.events.length > 0) || isOff('events')) {
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

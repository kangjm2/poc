import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type {
  AreaBin, CellFootprint, CellRef, DiffBin, EventType, MonitoredCell, NetworkEvent,
  TrackPoint,
  CellEstimate, ServingLine,
} from '../api/types'
import type { ColorBy } from '../view/paint'
import {
  breakClass, breakColor, breakDash, composeRuns,
} from '../view/geom/routeruns'

interface Props {
  track: TrackPoint[]
  cells: CellRef[]
  cursorSeq: number
  onCursorChange: (seq: number) => void
  kpiName: string
  /** When present, tiles replace the raw route so a long drive stays readable. */
  bins?: AreaBin[] | null
  showServingLine?: boolean
  /**
   * The monitored set at the cursor. When present, a line is drawn to every cell the
   * terminal could see, not only the one it was using - which is how pilot pollution
   * becomes visible on the map rather than inferred from a table.
   */
  monitored?: MonitoredCell[] | null
  /**
   * Where each cell was measured serving. Drawn as a translucent polygon behind the route,
   * so "which cell owns this street" is answered by looking rather than by clicking through
   * samples one at a time.
   */
  footprints?: CellFootprint[] | null
  /**
   * What the footprint layer left out, in words, or null when it left out nothing.
   *
   * Passed in rather than derived here: the filter is typed in the toolbar and parsed once,
   * beside the state, and a second parse in this component would be a second opinion about
   * the same string - the map could then draw five hulls under a caption claiming three.
   */
  footprintNote?: string | null
  /**
   * Apply a global filter naming one cell, from the map.
   *
   * UC14 p149: right-click a base station and the popup offers `Create Global Filter From
   * Cell ID`. The condition itself and the `cell:PCI` grammar have existed since P3-2 -
   * what was missing was this entry point, so narrowing to a cell meant reading its PCI
   * off a tooltip and typing it into the bar by hand. The two other items in the
   * reference's popup (highlight same-channel sectors, highlight neighbours) are not
   * offered: neither has a counterpart here, and a menu that lists what it cannot do is
   * worse than a short one.
   */
  onFilterCell?: (pci: number) => void
  /**
   * Estimated cell positions, drawn beside the recorded ones (UC21 p174-176).
   *
   * The reference's own example figure puts the real site and the estimated site on one
   * map - green and purple at p175 - and a line between a pair is the thing being read:
   * its length is the disagreement between the drive and the cell database, which is what
   * the analysis is for.
   */
  estimates?: CellEstimate[] | null
  /** UC23: the whole drive's fan, one line per sample. Not the cursor's single line. */
  servingLines?: ServingLine[] | null
  /**
   * Frame the map on one cell (UC18 p171: "the map zooms to the cell chosen in the grid").
   *
   * A number that CHANGES is what moves the map, so re-picking the same row does nothing
   * and picking another moves it - the map is not otherwise following anything here.
   */
  focusPci?: number | null
  /**
   * Events the network reported, each already placed on a sample by the server. Drawn as
   * per-type symbols on the route: "were all six link failures on the same street" is a
   * question about geography, and until now the only way to ask it was to click six table
   * rows in turn and remember where the cursor dot landed each time.
   */
  events?: NetworkEvent[]
  /** Name -> display identity, so a marker carries the same glyph the table does. */
  eventTypes?: Map<string, EventType>
  /**
   * What the current frame is a frame OF - the drive, not the parameters.
   *
   * The map used to re-fit on every change to [track, kpiName, onCursorChange, bins], so
   * picking a different KPI threw away a zoom the user had set to look at one junction.
   * Framing is a question about geography, and the geography only changes when the drive
   * does; everything else is a question about colour.
   */
  frameKey?: string
  /**
   * Bumped to ask for a deliberate re-frame - the `F` key and the toolbar button.
   * Stopping the automatic fit removes the only way back to the whole drive, so one has
   * to be put back deliberately.
   */
  refitToken?: number
  /**
   * What the route's colour MEANS: the KPI's verdict, or which cell was serving.
   * See view/paint.ts - the two are different kinds of claim, not two palettes.
   */
  colorBy?: ColorBy
  /**
   * One bin label to show at full strength, the rest muted. The workaround this replaces
   * was opening the colour editor, painting every other bin grey, looking, and undoing.
   */
  isolate?: string | null
  /**
   * True while the user is drawing an area to ask about.
   *
   * Drawn by hand rather than with leaflet-draw: the whole editor is a click handler, a
   * polyline and a polygon, and a dependency would arrive with a toolbar, an icon set and
   * a stylesheet whose look does not match anything else here.
   */
  drawingArea?: boolean
  /** Called with the closed ring when the user finishes, or null if they cancelled. */
  onAreaDrawn?: (ring: [number, number][] | null) => void
  /** Per-tile difference between two drives, drawn instead of the route. */
  diffBins?: DiffBin[] | null
}

/**
 * Drive route drawn as per-segment coloured polylines, which is how coverage is
 * read at a glance. Each segment takes the colour of the bin its sample fell in,
 * so the map and the legend are the same classification.
 */
export function RouteMap({
  track, cells, cursorSeq, onCursorChange, kpiName, bins, showServingLine = true,
  onFilterCell, estimates = null, servingLines = null, focusPci = null,
  monitored = null, footprints = null, footprintNote = null, events = [], eventTypes,
  frameKey = '', refitToken = 0, colorBy = 'kpi', isolate = null,
  drawingArea = false, onAreaDrawn, diffBins = null,
}: Props) {
  // Read off the track rather than taken as a prop, so the caption and the colours are
  // answering from the same rows. A separate "an area is active" flag could be true while
  // the track in hand was fetched without one, and then the map would say it was narrowed
  // while drawing the whole drive in full colour.
  const areaFiltered = track.some((p) => p.inArea === false)

  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayer = useRef<L.LayerGroup | null>(null)
  const eventLayer = useRef<L.LayerGroup | null>(null)
  const cellLayer = useRef<L.LayerGroup | null>(null)
  const binLayer = useRef<L.LayerGroup | null>(null)
  const servingLine = useRef<L.Polyline | null>(null)
  const monitoredLines = useRef<L.LayerGroup | null>(null)
  const footprintLayer = useRef<L.LayerGroup | null>(null)
  const cursorMarker = useRef<L.CircleMarker | null>(null)
  const [basemapFailed, setBasemapFailed] = useState(false)
  const drawLayer = useRef<L.LayerGroup | null>(null)
  const diffLayer = useRef<L.LayerGroup | null>(null)
  const estimateLayer = useRef<L.LayerGroup | null>(null)
  const servingFan = useRef<L.LayerGroup | null>(null)
  /** Vertices of the shape being drawn, in click order. */
  const [ring, setRing] = useState<[number, number][]>([])
  /**
   * Which drive the current frame belongs to, and which refit request produced it.
   *
   * Written during render, never in an effect closure. RouteMap's mount effect has an
   * empty dependency array, so anything it captures is the value from the FIRST render -
   * and on the first render `sessionId` is still null, because it is only set inside the
   * sessions fetch. A mount-time stamp would therefore always read "null", never match a
   * real drive, and re-fit anyway.
   */
  const framedFor = useRef<string | null>(null)
  /** What the frame SHOULD be of, readable from any effect without being captured stale. */
  const wanted = useRef('')
  wanted.current = `${frameKey}#${refitToken}`

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return
    const map = L.map(hostRef.current, {
      zoomControl: true,
      attributionControl: true,
      // Leaflet's keyboard handler claims the arrow keys whenever the map has focus and
      // calls stopPropagation, so a click on the map silently killed the one-sample
      // cursor - the key simply stopped doing anything, with nothing on screen to say
      // why. The keys it provided are given back below, on the two this app never binds.
      keyboard: false,
    })
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    })
    // Networks that cannot reach the tile CDN would otherwise just show a blank
    // pane; the route itself does not depend on the basemap, so say so and carry on.
    tiles.on('tileerror', () => setBasemapFailed(true))
    tiles.addTo(map)
    map.setView([65.012, 25.465], 13)
    // Cell sites get a pane of their own, above the route.
    //
    // Everything else shares Leaflet's default overlay pane, where stacking is DOM order
    // and therefore "whichever effect ran last". That was harmless while a site marker
    // was only a tooltip - it is not now that right-clicking one opens the filter menu,
    // because the route redraws on every KPI, colour and isolate change and lands on top,
    // so the click that should reach a site hits a route segment instead. A pane fixes
    // the order once rather than each effect racing to call bringToFront.
    map.createPane('cellSites')
    const sitePane = map.getPane('cellSites')
    if (sitePane) sitePane.style.zIndex = '450'
    routeLayer.current = L.layerGroup().addTo(map)
    binLayer.current = L.layerGroup().addTo(map)
    cellLayer.current = L.layerGroup().addTo(map)
    // Last, so event symbols sit above the route and the cell markers rather than under
    // a 6px coloured line.
    diffLayer.current = L.layerGroup().addTo(map)
    eventLayer.current = L.layerGroup().addTo(map)
    // Last of all, so the shape being drawn is never buried under the route it is
    // being drawn over.
    drawLayer.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  /**
   * Collect the shape's corners while drawing.
   *
   * The click handler is attached only while `drawingArea` is on, so the map's ordinary
   * click-to-move-the-cursor behaviour is untouched the rest of the time - two meanings
   * for one click, separated by mode rather than by a modifier key nobody would find.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!drawingArea) { setRing([]); return }
    const onClick = (e: L.LeafletMouseEvent) => {
      setRing((r) => [...r, [e.latlng.lat, e.latlng.lng]])
    }
    map.on('click', onClick)
    return () => { map.off('click', onClick) }
  }, [drawingArea])

  // Draw the shape as it is built: a line while it is open, a filled ring once it
  // encloses anything, and a handle on every corner so it is obvious what was clicked.
  useEffect(() => {
    const layer = drawLayer.current
    if (!layer) return
    layer.clearLayers()
    if (!drawingArea || ring.length === 0) return
    for (const [lat, lon] of ring) {
      L.circleMarker([lat, lon], {
        className: 'area-vertex', radius: 4, color: '#30578d', weight: 2,
        fillColor: '#fff', fillOpacity: 1,
      }).addTo(layer)
    }
    if (ring.length >= 3) {
      L.polygon(ring, {
        className: 'area-ring', color: '#30578d', weight: 2, dashArray: '6 4',
        fillColor: '#30578d', fillOpacity: 0.12,
      }).addTo(layer)
    } else if (ring.length === 2) {
      L.polyline(ring, {
        className: 'area-ring', color: '#30578d', weight: 2, dashArray: '6 4',
      }).addTo(layer)
    }
  }, [drawingArea, ring])

  /**
   * The difference tiles, drawn where the route would be.
   *
   * A tile only one drive visited is drawn hollow rather than filled grey: filled, it
   * reads as a measured "no change", which is the one thing it is not.
   */
  useEffect(() => {
    const map = mapRef.current
    const layer = diffLayer.current
    if (!map || !layer) return
    layer.clearLayers()
    if (!diffBins || diffBins.length === 0) return
    const frame: [number, number][] = []
    for (const b of diffBins) {
      // From the server, which is where the grid was cut. Recomputed here twice until
      // 2026-09-04, from each tile's own latitude and with no floor on the cosine, while
      // the server cut on the session centre with one - so the drawn tiles overlapped or
      // left slivers, and neither picture was the grid the numbers came from.
      const { latSpan: dLat, lonSpan: dLon } = b
      const oneSided = b.deltaValue == null
      const corners: [[number, number], [number, number]] = [
        [b.centerLat - dLat / 2, b.centerLon - dLon / 2],
        [b.centerLat + dLat / 2, b.centerLon + dLon / 2],
      ]
      frame.push(corners[0], corners[1])
      L.rectangle(corners, {
        className: 'diff-tile',
        color: b.color, weight: 1,
        fillColor: b.color, fillOpacity: oneSided ? 0 : 0.7,
        dashArray: oneSided ? '3 3' : undefined,
      }).bindTooltip(
        oneSided
          ? `Only one drive came here<br/>${b.countA != null ? 'A' : 'B'}: `
            + `${b.countA ?? b.countB} samples`
          : `${b.label}<br/>A ${b.avgA} \u2192 B ${b.avgB}`
            + `<br/>${b.deltaValue! > 0 ? '+' : ''}${b.deltaValue}`
            + `<br/>${b.countA} / ${b.countB} samples`,
        { sticky: true },
      ).addTo(layer)
    }
    fitOnce(map, frame)
  }, [diffBins])

  // Tiles and the raw route are alternatives, never both at once.
  useEffect(() => {
    const layer = binLayer.current
    if (!layer) return
    layer.clearLayers()
    if (!bins || bins.length === 0) return
    for (const b of bins) {
      const { latSpan: dLat, lonSpan: dLon } = b
      L.rectangle(
        [[b.centerLat - dLat / 2, b.centerLon - dLon / 2],
         [b.centerLat + dLat / 2, b.centerLon + dLon / 2]],
        { color: b.color, weight: 1, fillColor: b.color, fillOpacity: 0.65 },
      ).bindTooltip(
        // The painted value first and named, because it is the one the colour came from.
        // The other two follow so a tile coloured by its minimum still says how it
        // averaged - which is the comparison the switch was added to make.
        `${b.sampleCount} samples<br/>`
        + `<b>${b.statisticLabel ?? '[Average]'} ${b.value ?? b.avgValue}</b><br/>`
        + `avg ${b.avgValue} · min ${b.minValue} · max ${b.maxValue}<br/>${b.binLabel}`,
      ).addTo(layer)
    }
  }, [bins])

  /**
   * Frame the map on the drive, at most once per drive.
   *
   * The guard is on the DATA about to be framed, not on a key that arrives separately:
   * `track` and `bins` are fetched by two independent effects, and with area binning on,
   * whichever resolves first drives this one. Stamping a frame while `track` still holds
   * the previous drive's points would frame the old geography and then refuse to correct
   * itself, because the stamp says the job is done.
   */
  const fitOnce = (map: L.Map, frame: [number, number][]) => {
    if (track.length === 0) return
    if (framedFor.current === wanted.current) return
    framedFor.current = wanted.current
    // animate:false so the resulting moveend is synchronous. Nothing listens for it yet,
    // but the viewport work in the next item does, and an animated fit would leave a
    // 250 ms window in which the app cannot tell its own fit from a user pan.
    map.fitBounds(L.latLngBounds(frame), { padding: [18, 18], animate: false })
  }

  useEffect(() => {
    const map = mapRef.current
    const layer = routeLayer.current
    if (!map || !layer || track.length === 0) return
    layer.clearLayers()

    // Where the runs and the breaks ARE is view/geom/routeruns.ts, not here. This effect
    // owns only the Leaflet calls: what a run is, where it ends, which step is a break and
    // which points may frame the map are arithmetic, and arithmetic that lives inside a
    // drawing effect cannot be read by anything else - including the export that has to
    // put this same route in a document.
    const { runs, breaks, frame } = composeRuns(track, { colorBy, isolate, kpiName })

    if (bins && bins.length > 0) {
      fitOnce(map, frame)
      return
    }

    for (const run of runs) {
      L.polyline(run.coords, {
        // Classed, not identified by stroke width. Cell markers and the cursor are
        // circleMarkers drawn at width 3, which is also the width a muted run uses, so
        // a width-based selector counts map furniture as route.
        className: 'route-run',
        color: run.color, weight: run.weight,
        opacity: run.emphasised ? 0.95 : 0.5,
        lineCap: 'butt', lineJoin: 'round',
      })
        .on('click', () => onCursorChange(run.headSeq))
        .bindTooltip(run.tooltipLines.join('<br/>'), { sticky: true })
        .addTo(layer)
    }

    for (const br of breaks) {
      L.polyline(br.coords, {
        className: breakClass(br.kind),
        color: breakColor(br.kind),
        weight: 2,
        opacity: 0.85,
        dashArray: breakDash(br.kind),
      })
        .bindTooltip(br.tooltipLines.join('<br/>'), { sticky: true })
        .addTo(layer)
    }

    fitOnce(map, frame)
    // The dependency array is unchanged on purpose. The route must still be REDRAWN when
    // the KPI changes - that is what recolours it - and it is only the FRAMING that had to
    // stop following the KPI. Narrowing the array would have stopped the redraw too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, kpiName, onCursorChange, bins, frameKey, refitToken, colorBy, isolate])

  // Events, as per-type symbols anchored on the route.
  //
  // These are L.marker with a divIcon rather than circleMarker or polyline on purpose:
  // a divIcon renders into the marker pane as a <div>, so it cannot be caught by any of
  // the path selectors the checkers use to count route runs, neighbour lines, area bins
  // or footprints. Adding a shape to the overlay pane would have quietly changed four
  // existing counts.
  useEffect(() => {
    const layer = eventLayer.current
    if (!layer) return
    layer.clearLayers()
    for (const e of events) {
      // An event without a fix cannot be placed. Falling back to the route position at
      // its seq would put a marker somewhere plausible and wrong, so it is left off the
      // map and stays in the table, where it is still readable.
      if (e.latitude == null || e.longitude == null) continue
      const t = eventTypes?.get(e.eventType)
      const colour = t?.color ?? '#8a8a95'
      const glyph = t?.symbol ?? '?'
      L.marker([e.latitude, e.longitude], {
        icon: L.divIcon({
          className: 'event-marker',
          // Colour alone does not survive a photocopy or a reader with colour-vision
          // deficiency, and the route underneath is already dense with colour - so the
          // glyph carries the identity and the colour reinforces it.
          html: `<span class="ev-dot" style="border-color:${colour};color:${colour}">`
              + `${glyph}</span>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
        // Below the cursor marker, above the route.
        zIndexOffset: 100,
      })
        .on('click', () => onCursorChange(e.seq))
        .bindTooltip(
          `${new Date(e.ts).toISOString().slice(11, 19)} · `
          + `${t?.displayName ?? e.eventType}<br/>${e.detail ?? ''}`,
          { direction: 'top' },
        )
        .addTo(layer)
    }
  }, [events, eventTypes, onCursorChange])

  useEffect(() => {
    const layer = cellLayer.current
    if (!layer) return
    layer.clearLayers()
    for (const c of cells) {
      if (c.latitude == null || c.longitude == null) continue
      const marker = L.circleMarker([c.latitude, c.longitude], {
        radius: 6, color: '#1f2528', weight: 2, fillColor: '#30578d', fillOpacity: 0.9,
        pane: 'cellSites', className: `cell-site pci-${c.pci}`,
      })
        .bindTooltip(`PCI ${c.pci} / ${c.band ?? ''} / az ${c.azimuthDeg ?? '-'}°`)
        .addTo(layer)
      if (onFilterCell) {
        // A popup with one button rather than acting on the right-click itself: the
        // filter re-scopes every screen in the application, and a gesture that does that
        // without asking is one a reader fires by accident on a crowded map.
        const menu = document.createElement('div')
        menu.className = 'cell-menu'
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.setAttribute('aria-label', `Filter to cell ${c.pci}`)
        btn.textContent = `Filter to PCI ${c.pci}`
        btn.onclick = () => { marker.closePopup(); onFilterCell(c.pci) }
        menu.appendChild(btn)
        marker.bindPopup(menu, { closeButton: false, offset: [0, -4] })
        marker.on('contextmenu', (e) => {
          // Leaflet's own contextmenu fires on the browser one; stopping it keeps the
          // page menu from opening over ours.
          L.DomEvent.preventDefault(e as unknown as Event)
          marker.openPopup()
        })
      }
      // Short spoke showing sector azimuth, so orientation is visible on the map.
      if (c.azimuthDeg != null) {
        const rad = (c.azimuthDeg * Math.PI) / 180
        L.polyline(
          [
            [c.latitude, c.longitude],
            [c.latitude + 0.0032 * Math.cos(rad), c.longitude + 0.0075 * Math.sin(rad)],
          ],
          // Decoration, so it takes no pointer events: it starts at the site's centre and
          // was swallowing the hover that shows the PCI tooltip and the right-click that
          // opens the filter menu - the marker was unreachable at its own middle.
          {
            color: '#30578d', weight: 3, opacity: 0.85, pane: 'cellSites',
            interactive: false,
          },
        ).addTo(layer)
      }
    }
  }, [cells, onFilterCell])

  // Estimated cell positions, and the line to the record each one disagrees with.
  /**
   * UC23's fan: one line per sample to the cell that was serving it.
   *
   * Under the route rather than over it, and non-interactive: the lines are a shape to read
   * whole, and 1174 of them competing for clicks would take the map's own gestures away.
   * The colour is the layer's, not the cell's - a per-PCI palette here would collide with
   * the route's own serving-cell colouring and claim the two pictures were the same one.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (servingFan.current) { servingFan.current.remove(); servingFan.current = null }
    if (!servingLines || servingLines.length === 0) return
    const fan = L.layerGroup().addTo(map)
    servingFan.current = fan
    for (const l of servingLines) {
      L.polyline([[l.latitude, l.longitude], [l.cellLatitude, l.cellLongitude]], {
        color: '#b06a1f', weight: 0.7, opacity: 0.45, interactive: false,
      }).addTo(fan)
    }
  }, [servingLines])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (estimateLayer.current) { estimateLayer.current.remove(); estimateLayer.current = null }
    if (!estimates || estimates.length === 0) return
    const layer = L.layerGroup().addTo(map)
    estimateLayer.current = layer
    for (const e of estimates) {
      L.circleMarker([e.latitude, e.longitude], {
        radius: 6, color: '#5b3fa8', weight: 2, fillColor: '#8f7ad0', fillOpacity: 0.9,
        pane: 'cellSites', className: `cell-estimate pci-${e.pci}`,
      })
        .bindTooltip(`PCI ${e.pci} estimated \u00b7 confidence ${e.confidence}/10`
                     + (e.errorMetres == null ? '' : `<br/>${e.errorMetres} m from the record`))
        .addTo(layer)
      if (e.refLatitude != null && e.refLongitude != null) {
        // Dashed, because it is not a thing on the ground - it is the size of a
        // disagreement between two claims about where this cell is.
        L.polyline([[e.latitude, e.longitude], [e.refLatitude, e.refLongitude]], {
          color: '#5b3fa8', weight: 1.5, opacity: 0.8, dashArray: '4 4',
          pane: 'cellSites', interactive: false,
        }).addTo(layer)
      }
    }
  }, [estimates])

  // Framing on one cell, for a grid row that names it.
  //
  // Both points when there is an estimate, not just the record: the gap between them is
  // the thing this screen exists to show, and centring on one of the pair can leave the
  // other outside the frame - at 232 m apart it lands a third of the way to the edge.
  useEffect(() => {
    const map = mapRef.current
    if (!map || focusPci == null) return
    const c = cells.find((x) => x.pci === focusPci)
    const e = estimates?.find((x) => x.pci === focusPci)
    const pts: [number, number][] = []
    if (c?.latitude != null && c.longitude != null) pts.push([c.latitude, c.longitude])
    if (e) pts.push([e.latitude, e.longitude])
    if (pts.length === 0) return
    if (pts.length === 1) {
      map.setView(pts[0], Math.max(map.getZoom(), 15), { animate: true })
    } else {
      // Pixel padding, not `pad()`. `pad(1.2)` reads like 12 percent and means 120, so
      // the frame came out four times the size of the thing it was framing and the map
      // barely moved.
      map.fitBounds(L.latLngBounds(pts), { animate: true, maxZoom: 16, padding: [60, 60] })
    }
  }, [focusPci, cells, estimates])

  // Cell footprints, on their own effect so toggling them does not redraw the route.
  //
  // Drawn UNDER everything else and only as an outline plus a faint fill: a footprint is
  // context for the route, and a solid polygon would hide the very samples it was derived
  // from. Colour is per cell rather than per value - these are identities, not measurements.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (footprintLayer.current) { footprintLayer.current.remove(); footprintLayer.current = null }
    if (!footprints || footprints.length === 0) return
    const layer = L.layerGroup().addTo(map)
    footprintLayer.current = layer
    footprints.forEach((f, i) => {
      const hue = (i * 67) % 360
      L.polygon(f.hull as [number, number][], {
        color: `hsl(${hue} 55% 40%)`, weight: 1.5, opacity: 0.85,
        fillColor: `hsl(${hue} 55% 50%)`, fillOpacity: 0.10,
        // Named so a hull is countable apart from the route - both are SVG paths in the
        // same pane, and "how many footprints are drawn" is otherwise unanswerable without
        // also counting the several hundred coloured route segments - and named PER CELL,
        // so "which cells survived the filter" is answerable too. A count alone passes on
        // any narrowing that removes the right NUMBER of hulls, including one that removed
        // the wrong ones.
        className: `footprint-hull pci-${f.pci}`,
      })
        // "covers", not "served": under the three-strongest basis these samples are ones the
        // cell was a contender on, which is a different claim. And an em dash for a cell with
        // no mean - a cell can reach the top three without ever winning a sample, and printing
        // 0 dBm there put a level 80 dB above anything reportable where absence belongs.
        .bindTooltip(`PCI ${f.pci}${f.band ? ` \u00b7 ${f.band}` : ''} \u2014 covers `
                     + `${f.sampleCount} samples, mean RSRP `
                     + `${f.avgRsrp == null ? '\u2014' : `${f.avgRsrp} dBm`}`)
        .addTo(layer)
    })
    layer.eachLayer((l) => (l as L.Polygon).bringToBack?.())
  }, [footprints])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // A decimated track skips seqs, so take the last point at or before the
    // cursor; an exact-match lookup would freeze the marker between kept samples.
    let p: TrackPoint | undefined
    for (const t of track) {
      if (t.seq > cursorSeq) break
      p = t
    }
    p ??= track[0]
    if (!p) return
    // "Was the car actually moving here?" - the question that separates a real bad stretch
    // from hundreds of samples taken at one traffic light. The speed is already on every
    // track point and was rendering nowhere; this is the sample under the cursor, so the
    // reading is that sample's, not a run's.
    const cursorLabel = `seq ${p.seq}`
      + (p.speedKmh == null ? '' : ` \u00b7 ${p.speedKmh} km/h`)
    if (!cursorMarker.current) {
      cursorMarker.current = L.circleMarker([p.latitude, p.longitude], {
        radius: 7, color: '#da0000', weight: 3, fillColor: '#ffffff', fillOpacity: 1,
        className: 'cursor-marker',
      }).addTo(map)
      cursorMarker.current.bindTooltip(cursorLabel, { className: 'cursor-tip' })
    } else {
      cursorMarker.current.setLatLng([p.latitude, p.longitude])
      cursorMarker.current.setTooltipContent(cursorLabel)
    }

    // Lines from the terminal to the cells it can see. The serving cell is drawn solid
    // and the merely-detected ones faint, because the question the map answers is not
    // "which cells exist" but "did the terminal have a clear choice here" - several
    // strong lines fanning out from one point IS pilot pollution, seen rather than
    // computed. Weight follows level so the picture is quantitative, not just present.
    if (servingLine.current) { servingLine.current.remove(); servingLine.current = null }
    if (monitoredLines.current) { monitoredLines.current.remove() }
    monitoredLines.current = L.layerGroup().addTo(map)

    if (showServingLine && p.servingPci != null) {
      const cell = cells.find((c) => c.pci === p.servingPci)
      if (cell?.latitude != null && cell.longitude != null) {
        servingLine.current = L.polyline(
          [[p.latitude, p.longitude], [cell.latitude, cell.longitude]],
          { color: '#30578d', weight: 2, dashArray: '4 3', opacity: 0.9 },
        ).addTo(map)
      }
    }

    if (showServingLine && monitored) {
      for (const m of monitored) {
        if (m.serving) continue
        const cell = cells.find((c) => c.pci === m.pci && c.arfcn === m.arfcn)
        if (cell?.latitude == null || cell.longitude == null) continue
        // A cell within a few dB of the best is competing; one 15 dB down is scenery.
        const down = Math.abs(m.deltaDb ?? 0)
        const competing = down <= 6
        L.polyline(
          [[p.latitude, p.longitude], [cell.latitude, cell.longitude]],
          {
            // Named, not merely styled: the check that counts these used to select on
            // dashArray '2 4', which the rejected-fix break also carried - so it was
            // counting two unrelated things and would have passed with no neighbour
            // lines at all.
            className: 'neighbour-line',
            color: competing ? '#d4783c' : '#9aa0a6',
            weight: competing ? 2 : 1,
            dashArray: '2 4',
            opacity: competing ? 0.85 : 0.4,
          },
        ).bindTooltip(`PCI ${m.pci} · ${m.rsrp} dBm · ${m.deltaDb} dB`)
         .addTo(monitoredLines.current)
      }
    }
  }, [cursorSeq, track, cells, showServingLine, monitored])

  return (
    <div className="panel map-panel">
      <header>
        <span className="title">
          Map &mdash; {bins && bins.length > 0
            ? `${bins.length} area bins of ${bins[0].sizeMeters} m `
              + `${bins[0].statisticLabel ?? '[Average]'}`
            : `route coloured by ${kpiName}`}
          {footprintNote && (
            // The layer says what it left out, beside the drawing rather than in a tooltip:
            // a map of three hulls where the drive met five is a different picture, and
            // nothing else on screen would tell the reader which one they are looking at.
            <span style={{ color: '#666', fontWeight: 400 }}>
              {' '}&mdash; {footprintNote}
            </span>
          )}
          {areaFiltered && (
            // Said on the map itself, not only in the statistics panel beside it: the
            // route outside the shape is grey, and grey already means "another bin is
            // isolated" here. Without this line the two look identical.
            <span style={{ color: '#666', fontWeight: 400 }}>
              {' '}&mdash; coloured inside the drawn area only
            </span>
          )}
        </span>
        <span className="meta">
          {basemapFailed && (
            <span style={{ color: '#b26a00', marginRight: 10 }}>
              Basemap tiles unavailable (network) &mdash; route still shown
            </span>
          )}
          {track.length} samples
        </span>
        {drawingArea && (
          <span className="area-draw">
            {/* The count is the affordance: three is the smallest shape that encloses
                anything, and until it is reached Finish would produce a line and a
                selection of nothing. */}
            <b>{ring.length}</b> corner{ring.length === 1 ? '' : 's'}
            <button disabled={ring.length < 3}
                    title={ring.length < 3 ? 'An area needs at least three corners' : 'Use this area'}
                    onClick={() => onAreaDrawn?.(ring)}>Finish</button>
            <button disabled={ring.length === 0}
                    onClick={() => setRing((r) => r.slice(0, -1))}>Undo</button>
            <button onClick={() => onAreaDrawn?.(null)}>Cancel</button>
          </span>
        )}
      </header>
      <div
        ref={hostRef}
        className={`map${basemapFailed ? ' no-basemap' : ''}${drawingArea ? ' drawing' : ''}`}
        // Which cell the map has been asked to frame, on the element itself. A check can
        // see that a grid row reached the map, separately from whether the map then moved -
        // two failures that look identical from the outside and need different fixes.
        data-focus-pci={focusPci ?? ''}
        style={{ flex: 1 }}
        tabIndex={0}
        // The pan Leaflet's own handler used to give, handed back on the two keys the
        // app's keymap does not claim. Zoom is not re-provided: the +/- control is on
        // screen, and those keys belong to the playback rate.
        onKeyDown={(e) => {
          if (e.ctrlKey || e.metaKey || e.altKey) return
          const map = mapRef.current
          if (!map) return
          if (e.key === 'ArrowUp') map.panBy([0, -80])
          else if (e.key === 'ArrowDown') map.panBy([0, 80])
          else return
          e.preventDefault()
          e.stopPropagation()
        }}
      />
    </div>
  )
}

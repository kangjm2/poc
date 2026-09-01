import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type {
  AreaBin, CellFootprint, CellRef, EventType, MonitoredCell, NetworkEvent, TrackPoint,
} from '../api/types'

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
   * Events the network reported, each already placed on a sample by the server. Drawn as
   * per-type symbols on the route: "were all six link failures on the same street" is a
   * question about geography, and until now the only way to ask it was to click six table
   * rows in turn and remember where the cursor dot landed each time.
   */
  events?: NetworkEvent[]
  /** Name -> display identity, so a marker carries the same glyph the table does. */
  eventTypes?: Map<string, EventType>
}

/**
 * Drive route drawn as per-segment coloured polylines, which is how coverage is
 * read at a glance. Each segment takes the colour of the bin its sample fell in,
 * so the map and the legend are the same classification.
 */
export function RouteMap({
  track, cells, cursorSeq, onCursorChange, kpiName, bins, showServingLine = true,
  monitored = null, footprints = null, events = [], eventTypes,
}: Props) {
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

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return
    const map = L.map(hostRef.current, { zoomControl: true, attributionControl: true })
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    })
    // Networks that cannot reach the tile CDN would otherwise just show a blank
    // pane; the route itself does not depend on the basemap, so say so and carry on.
    tiles.on('tileerror', () => setBasemapFailed(true))
    tiles.addTo(map)
    map.setView([65.012, 25.465], 13)
    routeLayer.current = L.layerGroup().addTo(map)
    binLayer.current = L.layerGroup().addTo(map)
    cellLayer.current = L.layerGroup().addTo(map)
    // Last, so event symbols sit above the route and the cell markers rather than under
    // a 6px coloured line.
    eventLayer.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Tiles and the raw route are alternatives, never both at once.
  useEffect(() => {
    const layer = binLayer.current
    if (!layer) return
    layer.clearLayers()
    if (!bins || bins.length === 0) return
    for (const b of bins) {
      const dLat = b.sizeMeters / 111_320
      const dLon = b.sizeMeters / (111_320 * Math.cos((b.centerLat * Math.PI) / 180))
      L.rectangle(
        [[b.centerLat - dLat / 2, b.centerLon - dLon / 2],
         [b.centerLat + dLat / 2, b.centerLon + dLon / 2]],
        { color: b.color, weight: 1, fillColor: b.color, fillOpacity: 0.65 },
      ).bindTooltip(
        `${b.sampleCount} samples<br/>avg ${b.avgValue}<br/>${b.binLabel}`,
      ).addTo(layer)
    }
  }, [bins])

  useEffect(() => {
    const map = mapRef.current
    const layer = routeLayer.current
    if (!map || !layer || track.length === 0) return
    layer.clearLayers()

    // A rejected fix must not frame the map either. Leaving it in fitBounds squashes the
    // entire real drive into a few pixels so the outlier can stay on screen - the map
    // ends up unreadable in order to show the one position we have already decided not
    // to believe. Excluding it here is the same judgement the distance query makes.
    const believable = track.filter((p) => p.breakBefore !== 2)
    const frame = (believable.length > 1 ? believable : track)
      .map((p) => [p.latitude, p.longitude] as [number, number])

    if (bins && bins.length > 0) {
      map.fitBounds(L.latLngBounds(frame), { padding: [18, 18] })
      return
    }

    // Group consecutive same-colour samples into one polyline per run.
    //
    // Drawing a polyline per segment creates a layer, an SVG node and a tooltip for
    // every sample: on an eight-hour drive that is thousands of objects and the map
    // takes tens of seconds to appear. The colour only changes where the KPI crosses
    // a bin boundary, so a run is the natural unit and there are usually a few dozen.
    //
    // A run also ends at a discontinuity. Carrying a coloured line across one would
    // state that we measured ground we have nothing from (a gap) or that the vehicle
    // went somewhere it did not (a bad fix) - the map's only two ways of asserting
    // something false. The server classifies these; see RouteContinuity.
    let runStart = 0
    for (let i = 1; i <= track.length; i++) {
      const broken = i < track.length && track[i].breakBefore > 0
      const endOfRun = i === track.length || broken || track[i].color !== track[runStart].color
      if (!endOfRun) continue

      const head = track[runStart]
      // Extend one sample past the run so adjacent runs join without a visible gap -
      // but never across a break, which is the one place the gap is the point.
      const end = broken ? i - 1 : Math.min(i, track.length - 1)
      const coords = track.slice(runStart, end + 1)
        .map((p) => [p.latitude, p.longitude] as [number, number])

      if (coords.length > 1) {
        L.polyline(coords, {
          color: head.color, weight: 6, opacity: 0.95, lineCap: 'butt', lineJoin: 'round',
        })
          .on('click', () => onCursorChange(head.seq))
          .bindTooltip(
            `${new Date(head.ts).toISOString().slice(11, 19)}<br/>${kpiName}: ${head.value ?? '-'}`
            + `<br/>${head.binLabel}<br/>${coords.length} samples`,
            { sticky: true },
          )
          .addTo(layer)
      }
      runStart = i
    }

    // Then draw the breaks themselves. Omitting them entirely would leave the route
    // looking as though it simply ended and resumed elsewhere, which is a different
    // false impression. A thin dashed line says "the vehicle went this way and we have
    // nothing from it" - visibly not a measurement, and it cannot be mistaken for one
    // because it carries no bin colour and its own tooltip says so.
    for (let i = 1; i < track.length; i++) {
      const kind = track[i].breakBefore
      if (!kind) continue
      const a = track[i - 1]
      const b = track[i]
      const seconds = Math.round(
        (new Date(b.ts).getTime() - new Date(a.ts).getTime()) / 1000,
      )
      const gap = kind === 1
      L.polyline(
        [[a.latitude, a.longitude], [b.latitude, b.longitude]],
        {
          className: gap ? 'route-gap' : 'route-glitch',
          color: gap ? '#8a8a95' : '#b00020',
          weight: 2,
          opacity: 0.85,
          dashArray: gap ? '5 7' : '3 5',
        },
      )
        .bindTooltip(
          gap
            ? `No measurement<br/>${seconds}s with no position fix`
                + `<br/>seq ${a.seq} \u2192 ${b.seq}`
            : `Implausible position fix<br/>excluded from distance travelled`
                + `<br/>seq ${a.seq} \u2192 ${b.seq}`,
          { sticky: true },
        )
        .addTo(layer)
    }

    map.fitBounds(L.latLngBounds(frame), { padding: [18, 18] })
  }, [track, kpiName, onCursorChange, bins])

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
      L.circleMarker([c.latitude, c.longitude], {
        radius: 6, color: '#1f2528', weight: 2, fillColor: '#30578d', fillOpacity: 0.9,
      })
        .bindTooltip(`PCI ${c.pci} / ${c.band ?? ''} / az ${c.azimuthDeg ?? '-'}°`)
        .addTo(layer)
      // Short spoke showing sector azimuth, so orientation is visible on the map.
      if (c.azimuthDeg != null) {
        const rad = (c.azimuthDeg * Math.PI) / 180
        L.polyline(
          [
            [c.latitude, c.longitude],
            [c.latitude + 0.0032 * Math.cos(rad), c.longitude + 0.0075 * Math.sin(rad)],
          ],
          { color: '#30578d', weight: 3, opacity: 0.85 },
        ).addTo(layer)
      }
    }
  }, [cells])

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
      })
        .bindTooltip(`PCI ${f.pci}${f.band ? ` \u00b7 ${f.band}` : ''} \u2014 served `
                     + `${f.sampleCount} samples, mean RSRP ${f.avgRsrp} dBm`)
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
    if (!cursorMarker.current) {
      cursorMarker.current = L.circleMarker([p.latitude, p.longitude], {
        radius: 7, color: '#da0000', weight: 3, fillColor: '#ffffff', fillOpacity: 1,
      }).addTo(map)
    } else {
      cursorMarker.current.setLatLng([p.latitude, p.longitude])
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
            ? `${bins.length} area bins of ${bins[0].sizeMeters} m`
            : `route coloured by ${kpiName}`}
        </span>
        <span className="meta">
          {basemapFailed && (
            <span style={{ color: '#b26a00', marginRight: 10 }}>
              Basemap tiles unavailable (network) &mdash; route still shown
            </span>
          )}
          {track.length} samples
        </span>
      </header>
      <div
        ref={hostRef}
        className={`map${basemapFailed ? ' no-basemap' : ''}`}
        style={{ flex: 1 }}
      />
    </div>
  )
}

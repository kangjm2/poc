import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { AreaBin, CellRef, TrackPoint } from '../api/types'

interface Props {
  track: TrackPoint[]
  cells: CellRef[]
  cursorSeq: number
  onCursorChange: (seq: number) => void
  kpiName: string
  /** When present, tiles replace the raw route so a long drive stays readable. */
  bins?: AreaBin[] | null
  showServingLine?: boolean
}

/**
 * Drive route drawn as per-segment coloured polylines, which is how coverage is
 * read at a glance. Each segment takes the colour of the bin its sample fell in,
 * so the map and the legend are the same classification.
 */
export function RouteMap({
  track, cells, cursorSeq, onCursorChange, kpiName, bins, showServingLine = true,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayer = useRef<L.LayerGroup | null>(null)
  const cellLayer = useRef<L.LayerGroup | null>(null)
  const binLayer = useRef<L.LayerGroup | null>(null)
  const servingLine = useRef<L.Polyline | null>(null)
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
    if (bins && bins.length > 0) {
      const b = L.latLngBounds(track.map((p) => [p.latitude, p.longitude] as [number, number]))
      map.fitBounds(b, { padding: [18, 18] })
      return
    }

    // Group consecutive same-colour samples into one polyline per run.
    //
    // Drawing a polyline per segment creates a layer, an SVG node and a tooltip for
    // every sample: on an eight-hour drive that is thousands of objects and the map
    // takes tens of seconds to appear. The colour only changes where the KPI crosses
    // a bin boundary, so a run is the natural unit and there are usually a few dozen.
    let runStart = 0
    for (let i = 1; i <= track.length; i++) {
      const endOfRun = i === track.length || track[i].color !== track[runStart].color
      if (!endOfRun) continue

      const head = track[runStart]
      // Extend one sample past the run so adjacent runs join without a visible gap.
      const end = Math.min(i, track.length - 1)
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

    const bounds = L.latLngBounds(track.map((p) => [p.latitude, p.longitude] as [number, number]))
    map.fitBounds(bounds, { padding: [18, 18] })
  }, [track, kpiName, onCursorChange, bins])

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

    // Line from the terminal to its serving cell, so which cell is in charge at this
    // instant is visible rather than inferred from a PCI number.
    if (servingLine.current) { servingLine.current.remove(); servingLine.current = null }
    if (showServingLine && p.servingPci != null) {
      const cell = cells.find((c) => c.pci === p.servingPci)
      if (cell?.latitude != null && cell.longitude != null) {
        servingLine.current = L.polyline(
          [[p.latitude, p.longitude], [cell.latitude, cell.longitude]],
          { color: '#30578d', weight: 2, dashArray: '4 3', opacity: 0.9 },
        ).addTo(map)
      }
    }
  }, [cursorSeq, track, cells, showServingLine])

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

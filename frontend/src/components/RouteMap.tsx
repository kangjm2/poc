import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { CellRef, TrackPoint } from '../api/types'

interface Props {
  track: TrackPoint[]
  cells: CellRef[]
  cursorSeq: number
  onCursorChange: (seq: number) => void
  kpiName: string
}

/**
 * Drive route drawn as per-segment coloured polylines, which is how coverage is
 * read at a glance. Each segment takes the colour of the bin its sample fell in,
 * so the map and the legend are the same classification.
 */
export function RouteMap({ track, cells, cursorSeq, onCursorChange, kpiName }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayer = useRef<L.LayerGroup | null>(null)
  const cellLayer = useRef<L.LayerGroup | null>(null)
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
    cellLayer.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = routeLayer.current
    if (!map || !layer || track.length === 0) return
    layer.clearLayers()

    for (let i = 0; i < track.length - 1; i++) {
      const a = track[i]
      const b = track[i + 1]
      L.polyline(
        [[a.latitude, a.longitude], [b.latitude, b.longitude]],
        { color: a.color, weight: 6, opacity: 0.95, lineCap: 'butt' },
      )
        .on('click', () => onCursorChange(a.seq))
        .bindTooltip(
          `${new Date(a.ts).toISOString().slice(11, 19)}<br/>${kpiName}: ${a.value ?? '-'}<br/>${a.binLabel}`,
          { sticky: true },
        )
        .addTo(layer)
    }
    const bounds = L.latLngBounds(track.map((p) => [p.latitude, p.longitude] as [number, number]))
    map.fitBounds(bounds, { padding: [18, 18] })
  }, [track, kpiName, onCursorChange])

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
    const p = track.find((t) => t.seq === cursorSeq)
    if (!p) return
    if (!cursorMarker.current) {
      cursorMarker.current = L.circleMarker([p.latitude, p.longitude], {
        radius: 7, color: '#da0000', weight: 3, fillColor: '#ffffff', fillOpacity: 1,
      }).addTo(map)
    } else {
      cursorMarker.current.setLatLng([p.latitude, p.longitude])
    }
  }, [cursorSeq, track])

  return (
    <div className="panel map-panel">
      <header>
        <span className="title">Map &mdash; route coloured by {kpiName}</span>
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

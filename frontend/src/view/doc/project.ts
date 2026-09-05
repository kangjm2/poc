import L from 'leaflet'
import { breakColor, breakDash } from '../geom/routeruns.ts'
import type { RouteForm } from '../geom/routeruns'

/**
 * The route, projected into a fixed box for a document.
 *
 * Through `L.CRS.EPSG3857.latLngToPoint` - Leaflet's own projection, called as a pure
 * static with no map instance and no DOM. That is the whole point: the screen's map and
 * the exported map go through the SAME Web Mercator, so the two pictures cannot be two
 * opinions about where the vehicle went. Writing our own would have been twenty lines and
 * a second projection, and over a city drive the two would agree closely enough that
 * nothing would ever notice them diverging.
 *
 * The zoom is arbitrary because the result is rescaled to the box; it only has to be high
 * enough that the projected extent is not quantised.
 */

const PROJECT_ZOOM = 18

export interface ProjectedLine { d: string; color: string; weight: number; opacity: number; dash?: string }
export interface ProjectedRoute {
  width: number
  height: number
  runs: ProjectedLine[]
  breaks: ProjectedLine[]
  /** The geographic extent the box holds, for the caption. */
  bounds: { south: number; west: number; north: number; east: number }
}

function toPoint(lat: number, lon: number): { x: number; y: number } {
  const p = L.CRS.EPSG3857.latLngToPoint(L.latLng(lat, lon), PROJECT_ZOOM)
  return { x: p.x, y: p.y }
}

/**
 * Fit the drive into `width x height`, preserving shape.
 *
 * One scale for both axes, so a street that runs at forty-five degrees still does. The
 * alternative - stretching each axis to fill the box - makes a north-south drive look like
 * a city grid, which is a picture of something that did not happen.
 */
export function projectRoute(
  form: RouteForm, { width, height, padding = 8 }: {
    width: number; height: number; padding?: number
  },
): ProjectedRoute {
  // Framed on the BELIEVABLE points, exactly as the screen is - `form.frame` already
  // excludes rejected fixes. Framing on everything drawn was the first version of this
  // function and it reproduced, in an export, the precise mistake the map's own comment
  // warns about: one implausible position dragged the extent kilometres out and squashed
  // the whole real drive into a corner, so the picture became unreadable in order to show
  // the one place we had already decided not to believe. A break that leaves the box is
  // clipped by the SVG root, which is what Leaflet does with it on screen.
  const pts = form.frame.length > 0
    ? form.frame
    : [...form.runs.flatMap((r) => r.coords), ...form.breaks.flatMap((b) => b.coords)]
  const empty = { width, height, runs: [], breaks: [],
    bounds: { south: 0, west: 0, north: 0, east: 0 } }
  if (pts.length === 0) return empty

  const projected = pts.map(([lat, lon]) => toPoint(lat, lon))
  const minX = Math.min(...projected.map((p) => p.x))
  const maxX = Math.max(...projected.map((p) => p.x))
  const minY = Math.min(...projected.map((p) => p.y))
  const maxY = Math.max(...projected.map((p) => p.y))
  const spanX = Math.max(1e-9, maxX - minX)
  const spanY = Math.max(1e-9, maxY - minY)
  const scale = Math.min((width - 2 * padding) / spanX, (height - 2 * padding) / spanY)
  // Centred, so a drive narrower than the box is not pinned to a corner.
  const offX = padding + ((width - 2 * padding) - spanX * scale) / 2
  const offY = padding + ((height - 2 * padding) - spanY * scale) / 2

  const path = (coords: Array<[number, number]>) => coords.map(([lat, lon], i) => {
    const p = toPoint(lat, lon)
    const x = offX + (p.x - minX) * scale
    // Mercator y already grows southward, so no flip: the same convention the screen uses.
    const y = offY + (p.y - minY) * scale
    return `${i === 0 ? 'M' : 'L'} ${round(x)} ${round(y)}`
  }).join(' ')

  return {
    width,
    height,
    runs: form.runs.map((r) => ({
      d: path(r.coords), color: r.color, weight: r.weight,
      opacity: r.emphasised ? 0.95 : 0.5,
    })),
    breaks: form.breaks.map((b) => ({
      d: path(b.coords),
      // Through routeruns' own accessors. These four values were retyped here in the round
      // that created both files - the exact duplication that round was written to prevent,
      // three files apart. A gap drawn grey in the document and a different grey on the
      // map is the shape it would have taken.
      color: breakColor(b.kind),
      weight: 2,
      opacity: 0.85,
      dash: breakDash(b.kind),
    })),
    bounds: {
      south: Math.min(...pts.map((p) => p[0])), north: Math.max(...pts.map((p) => p[0])),
      west: Math.min(...pts.map((p) => p[1])), east: Math.max(...pts.map((p) => p[1])),
    },
  }
}

/** Two decimals of a pixel. Enough to draw, short enough to read in a diff. */
function round(v: number): number { return Math.round(v * 100) / 100 }

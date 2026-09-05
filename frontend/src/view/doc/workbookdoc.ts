import type { ChartPaneGeometry } from '../geom/panegeom'
import type { RouteForm } from '../geom/routeruns'
import type { ProjectedRoute } from './project'
import type { DocEntry, DocScope } from './scope'

/**
 * A composed workbook as a document, and each pane as a picture.
 *
 * Pure: a plain object in, a string out. No fetch, no DOM, no React - so a checker can
 * call it in Node with the same input the browser gave it and read what came out, which is
 * the difference between an export that is verified and one that merely runs.
 *
 * It renders panes, and it says so. The reference's exported unit is a PAGE (p220 adds
 * pages to a workbook, p223 exports one image per page); our workbook has no page level,
 * so calling these pages would be borrowing a word for a thing we do not have. When a page
 * concept arrives, `pages` here already takes a list and the renderer changes at the seam
 * rather than in the middle.
 *
 * What it is NOT is stated in the file itself, in the manner ResultExports already uses
 * for the GeoJSON that is not KML: the reference exports a workbook as PDF, MS Word and MS
 * PowerPoint, and this is none of those. It is a print-ready HTML document - the same
 * answer `ReportService` gives for a session report, for the same reason, and the browser
 * that opens it is what makes the PDF.
 */

export interface DocChartPane {
  kind: 'CHART'
  title: string
  geom: ChartPaneGeometry
  /** Layers on the pane that are not drawn, named so the file does not hide them. */
  omitted: string[]
  measurement: string
  condition: string
}

export interface DocMapPane {
  kind: 'MAP'
  title: string
  form: RouteForm
  route: ProjectedRoute
  /** What the map's Layers list says is on this picture. */
  layerNotes: string[]
  omitted: string[]
  measurement: string
  condition: string
}

export interface DocEmptyPane {
  kind: 'EMPTY'
  title: string
  reason: string
  measurement: string
  condition: string
}

export type DocPane = DocChartPane | DocMapPane | DocEmptyPane

export interface DocPage { name: string; panes: DocPane[] }

export interface DocModel {
  title: string
  scope: DocScope
  pages: DocPage[]
  /** CSS custom properties resolved to literal colours - see tokens.ts for why. */
  tokens: Record<string, string>
}

export function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** The pane's own picture, standalone - openable on its own, with nothing to resolve. */
export function renderPaneSvg(pane: DocPane, tokens: Record<string, string>,
                              provenance: string): string {
  const w = pane.kind === 'CHART' ? pane.geom.frame.w
    : pane.kind === 'MAP' ? pane.route.width : 1000
  const h = pane.kind === 'CHART' ? pane.geom.frame.h
    : pane.kind === 'MAP' ? pane.route.height : 120
  const desc = pane.kind === 'CHART' ? pane.geom.axisDesc
    : pane.kind === 'MAP'
      ? `${pane.route.bounds.south.toFixed(5)},${pane.route.bounds.west.toFixed(5)}`
        + ` to ${pane.route.bounds.north.toFixed(5)},${pane.route.bounds.east.toFixed(5)}`
        + ' - no basemap'
      : pane.reason
  return [
    // width/height as well as viewBox: a file opened outside a page has no container to
    // scale to, and an SVG with only a viewBox renders at whatever the viewer guesses.
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"`,
    ` viewBox="0 0 ${w} ${h}" role="img">`,
    `<title>${esc(pane.title)}</title>`,
    `<desc>${esc(`${desc} — ${provenance}`)}</desc>`,
    // The tokens, written in. Every label in this application inherits its font from the
    // page and every cursor line is stroke="var(--cursor)"; outside the document both
    // resolve to nothing, which is a picture that opens with the right traces and no
    // cursor at all - the one element the whole workbook is organised around.
    `<style>${styleBlock(tokens)}</style>`,
    `<rect width="${w}" height="${h}" fill="#ffffff"/>`,
    paneBody(pane),
    '</svg>',
  ].join('')
}

function styleBlock(tokens: Record<string, string>): string {
  const vars = Object.entries(tokens).map(([k, v]) => `${k}:${v};`).join('')
  return `:root{${vars}}`
    + `text{font-family:Inter,'Helvetica Neue',Arial,sans-serif;}`
}

function paneBody(pane: DocPane): string {
  if (pane.kind === 'CHART') return chartBody(pane)
  if (pane.kind === 'MAP') return mapBody(pane)
  return `<text x="12" y="24" font-size="12" fill="#666">${esc(pane.reason)}</text>`
}

function chartBody(pane: DocChartPane): string {
  const { frame, ticks, traces, cursorX } = pane.geom
  const out: string[] = []
  for (const t of ticks) {
    out.push(`<line x1="${frame.padL}" x2="${frame.w - frame.padR}" y1="${t.y}" y2="${t.y}"`
      + ' stroke="#ececf0"/>')
    out.push(`<text x="${frame.padL - 5}" y="${t.y + 3}" text-anchor="end" font-size="9"`
      + ` fill="#666">${esc(t.label)}</text>`)
  }
  for (const t of traces) {
    out.push(`<path class="trace" d="${t.d}" fill="none" stroke="${t.color}"`
      + ' stroke-width="1.2"/>')
  }
  out.push(`<line class="cursor" x1="${cursorX}" x2="${cursorX}" y1="0" y2="${frame.h}"`
    + ' stroke="var(--cursor)" stroke-width="1"/>')
  return out.join('')
}

function mapBody(pane: DocMapPane): string {
  const out: string[] = []
  for (const r of pane.route.runs) {
    out.push(`<path class="route-run" d="${r.d}" fill="none" stroke="${r.color}"`
      + ` stroke-width="${r.weight / 3}" stroke-opacity="${r.opacity}"`
      + ' stroke-linecap="butt" stroke-linejoin="round"/>')
  }
  for (const b of pane.route.breaks) {
    out.push(`<path class="route-break" d="${b.d}" fill="none" stroke="${b.color}"`
      + ` stroke-width="${b.weight / 2}" stroke-opacity="${b.opacity}"`
      + ` stroke-dasharray="${b.dash}"/>`)
  }
  return out.join('')
}

/** The '# key: value' lines, as an HTML comment above everything. */
function preamble(entries: DocEntry[]): string {
  return `<!--\n${entries.map((e) => `# ${e.key}: ${e.value}`).join('\n')}\n-->\n`
}

function provenanceLine(entries: DocEntry[]): string {
  return entries.map((e) => `${e.key}: ${e.value}`).join(' · ')
}

function factsTable(pane: DocPane): string {
  if (pane.kind === 'CHART') {
    if (pane.geom.traces.length === 0) return ''
    return table(['', 'Layer', 'Unit', 'At cursor', 'Range'],
      pane.geom.traces.map((t) => [
        swatch(t.color), esc(t.displayName), esc(t.unit || '—'),
        esc(t.atText), esc(t.rangeText),
      ]))
  }
  if (pane.kind === 'MAP') {
    if (pane.form.runs.length === 0) return ''
    // Every fact the hover carried. A static picture drops the tooltip, and the tooltip is
    // the only place a run's time, value, bin and sample count are ever stated - so a
    // picture without this table is a picture that quietly ate them.
    return table(['', 'From', 'Value', 'Bin', 'Serving PCI', 'Samples'],
      pane.form.runs.map((r) => [
        swatch(r.color),
        esc(new Date(r.headTs).toISOString().slice(11, 19)),
        esc(r.headValue == null ? '—' : String(r.headValue)),
        esc(r.binLabel),
        esc(r.servingPci == null ? '—' : String(r.servingPci)),
        String(r.sampleCount),
      ]))
  }
  return ''
}

function swatch(color: string): string {
  return `<span class="sw" style="background:${esc(color)}"></span>`
}

function table(head: string[], rows: string[][]): string {
  const th = head.map((h) => `<th>${h}</th>`).join('')
  const tr = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')
  return `<table class="pane-facts"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`
}

/** The whole workbook, as one self-contained file. */
export function renderWorkbookDocument(model: DocModel): string {
  const entries = model.scope.all()
  const paneScope = model.scope.paneEntries()
  const panes = model.pages.flatMap((p) => p.panes)

  const sections = panes.map((pane, i) => {
    const omitted = pane.kind === 'EMPTY' ? [] : pane.omitted
    return [
      `<section class="wb-pane" data-pane="${i + 1}">`,
      `<h2>${esc(pane.title)}</h2>`,
      '<figure>',
      renderPaneSvg(pane, model.tokens, provenanceLine(paneScope)),
      // The condition and the measurement on EVERY pane, not only in the preamble. A pane
      // dragged into a deck is a row pasted into a sheet: the preamble does not go with it.
      `<figcaption>measurement: ${esc(pane.measurement)}`
      + ` · condition: ${esc(pane.condition)}`
      + (pane.kind === 'MAP' && pane.layerNotes.length > 0
        ? ` · on this picture: ${esc(pane.layerNotes.join(', '))}` : '')
      + '</figcaption>',
      '</figure>',
      factsTable(pane),
      omitted.length > 0
        ? `<p class="omitted">Not drawn, and therefore not in this picture: `
          + `${esc(omitted.join(', '))}.</p>`
        : '',
      pane.kind === 'MAP'
        ? '<p class="note">No basemap. The route is drawn on its own coordinates; streets'
          + ' and place names come from a tile service and are not part of this file.</p>'
        : '',
      '</section>',
    ].join('')
  }).join('')

  return [
    preamble(entries),
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    `<title>${esc(model.title)} — workbook</title>`,
    `<style>${DOC_CSS}${styleBlock(model.tokens)}</style></head><body>`,
    `<h1>${esc(model.title)}</h1>`,
    '<table class="meta"><tbody>',
    entries.map((e) => `<tr><th>${esc(e.key)}</th><td>${esc(e.value)}</td></tr>`).join(''),
    '</tbody></table>',
    sections,
    '</body></html>',
  ].join('')
}

const DOC_CSS = `
body { font: 13px Inter, Arial, sans-serif; color: #262626; margin: 28px; max-width: 1080px; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 15px; margin: 26px 0 6px; border-bottom: 2px solid #30578d; padding-bottom: 3px; }
table { border-collapse: collapse; width: 100%; margin: 6px 0; }
th, td { border: 1px solid #d8d8de; padding: 3px 7px; text-align: left; }
thead th { background: #eef0f4; }
table.meta { max-width: 720px; }
table.meta th { background: #f7f7fa; width: 140px; }
figure { margin: 0; }
figure svg { border: 1px solid #e2e2e8; width: 100%; height: auto; }
figcaption { color: #666; font-size: 11px; padding: 3px 0; }
.sw { display: inline-block; width: 12px; height: 12px; border: 1px solid #999; }
.omitted, .note { color: #666; font-size: 11px; margin: 4px 0; }
@media print {
  body { margin: 0; max-width: none; }
  /* One pane per sheet, which is what the reference's per-page export produces. */
  section.wb-pane { break-after: page; break-inside: avoid; }
  section.wb-pane:last-of-type { break-after: auto; }
  h2 { break-after: avoid; }
  table { break-inside: avoid; }
}
`

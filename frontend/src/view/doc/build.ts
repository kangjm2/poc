import { api } from '../../api/client'
import { composeChartPane, paneTitle, paneTraceColor } from '../geom/panegeom'
import { composeRuns } from '../geom/routeruns'
import { describeLayers, type MapContents } from '../maplayers'
import { documentFileName, paneFileName } from './naming'
import { projectRoute } from './project'
import { DocScope } from './scope'
import { resolvedTokens } from './tokens'
import {
  renderPaneSvg, renderWorkbookDocument,
  type DocModel, type DocPane,
} from './workbookdoc'
import type {
  KpiDefinition, Series, SessionSummary, TrackPoint, Workbook,
} from '../../api/types'

/**
 * Where fetching meets the pure renderers, and nowhere else.
 *
 * Everything under view/geom and the rest of view/doc is a function of its arguments; this
 * file is the one that goes and gets things. Keeping the split sharp is what lets a
 * checker call the renderers in Node with the same input the browser had.
 *
 * It builds from the LIVE draft, not from the stored workbook. That is deliberate and it
 * is the reason this export is composed in the browser at all: a user arranges panes,
 * looks at them, and exports what they are looking at. A server-rendered export can only
 * draw what was last saved, and would produce a complete, well-formed, provenance-carrying
 * document of a DIFFERENT arrangement with nothing in it saying so. The file states
 * whether it was saved instead of refusing to run.
 */

const MAP_DOC_W = 1000
const MAP_DOC_H = 560

export interface BuildInput {
  workbook: Workbook
  dirty: boolean
  sessionId: number | null
  sessions: SessionSummary[]
  defs: KpiDefinition[]
  series: Series[]
  tracks: Record<string, TrackPoint[]>
  trackKey: (kpiName: string, sessionId: number | null | undefined) => string
  cursorSeq: number
  filterSpec: string | null | undefined
  /** ISO instant. Passed in so the renderers stay pure and a check can pin the value. */
  generatedAt: string
}

export interface BuiltDocument {
  filename: string
  html: string
  panes: Array<{ filename: string; svg: string }>
}

const displayName = (defs: KpiDefinition[], kpiName: string) =>
  defs.find((d) => d.name === kpiName)?.displayName ?? kpiName

export async function buildWorkbookDocument(input: BuildInput): Promise<BuiltDocument> {
  const {
    workbook, dirty, sessionId, sessions, defs, series, tracks, trackKey, cursorSeq,
    filterSpec, generatedAt,
  } = input

  const open = sessions.find((s) => s.id === sessionId) ?? null
  const sessionName = (id: number | null | undefined) =>
    (id == null ? open?.name : sessions.find((s) => s.id === id)?.name) ?? `#${id ?? '?'}`

  // The condition's WORDING comes from the server, never from here. There are already
  // three places that phrase a filter and the server's endpoint exists precisely so a
  // fourth cannot appear - its own javadoc says so.
  let condition = 'none'
  let conditionScope = ''
  if (filterSpec && filterSpec.trim()) {
    try {
      const d = await api.describeFilter(filterSpec)
      condition = d.text || 'none'
      conditionScope = d.scope
    } catch {
      // A spec the server will not describe is a spec the analytics did not honour either.
      condition = 'unreadable condition - the server did not accept it'
    }
  }

  const panes: DocPane[] = workbook.panes.map((pane) => {
    const visible = pane.layers.filter((l) => l.visible)
    const omitted = pane.layers.filter((l) => !l.visible)
      .map((l) => displayName(defs, l.kpiName))
    const measurement = open == null ? 'none open'
      : `${open.name} (#${open.id})`

    if (pane.kind === 'MAP') {
      const first = visible[0]
      if (!first) {
        return {
          kind: 'EMPTY' as const, title: paneTitle(pane, (k) => displayName(defs, k)),
          reason: 'No visible layer. Nothing was drawn on this pane.',
          measurement, condition,
        }
      }
      const track = tracks[trackKey(first.kpiName, first.sessionId)] ?? []
      const drive = first.sessionId ?? sessionId ?? null
      const caption = displayName(defs, first.kpiName)
        + (first.sessionId && first.sessionId !== sessionId
          ? ` · ${sessionName(first.sessionId)}` : '')
      const form = composeRuns(track, { colorBy: 'kpi', isolate: null, kpiName: caption })
      // Through the same module the map's own Layers dock reads, rather than a sentence
      // written here: that module exists so "what is on this picture" has one answer.
      const contents: MapContents = { track, cells: [] }
      return {
        kind: 'MAP' as const,
        title: paneTitle(pane, (k) => displayName(defs, k)),
        form,
        route: projectRoute(form, { width: MAP_DOC_W, height: MAP_DOC_H }),
        layerNotes: describeLayers(contents).filter((l) => l.drawn).map((l) => l.label),
        omitted,
        measurement: drive != null && drive !== sessionId
          ? `${sessionName(drive)} (#${drive})` : measurement,
        condition,
      }
    }

    const geom = composeChartPane({
      traces: visible.map((l) => ({
        key: l.kpiName,
        color: paneTraceColor(pane.layers, l.kpiName),
        series: series.find((s) => s.kpi === l.kpiName),
      })),
      cursorSeq,
    })
    if (geom.empty) {
      return {
        kind: 'EMPTY' as const,
        title: paneTitle(pane, (k) => displayName(defs, k)),
        reason: geom.empty === 'no-visible-layer'
          ? 'No visible layer. Nothing was drawn on this pane.'
          : 'The visible layers recorded no samples in this measurement.',
        measurement, condition,
      }
    }
    return {
      kind: 'CHART' as const,
      title: paneTitle(pane, (k) => displayName(defs, k)),
      geom,
      omitted,
      measurement,
      condition,
    }
  })

  const scope = new DocScope()
    // What this file is, and - in the manner the GeoJSON export uses to say it is not KML -
    // what it is not. The reference exports a workbook as PDF, MS Word and MS PowerPoint.
    .file('format', 'HTML with inline SVG, print-ready. The reference exports a workbook as'
      + ' PDF, MS Word and MS PowerPoint; this file is none of those - print it from a'
      + ' browser to get a PDF.')
    .file('workbook', `${workbook.name} (#${workbook.id ?? 'unsaved'})`)
    .file('generated', `${generatedAt} (browser clock)`)
    .file('saved', dirty
      ? 'no - exported from unsaved edits on the screen'
      : 'yes - matches the stored workbook')
    .file('contains', `${panes.length} pane${panes.length === 1 ? '' : 's'}`
      + `, drawn at ${MAP_DOC_W} units wide`)
    .file('not_included', 'the basemap (streets and place names come from a tile service),'
      + ' every tooltip and every interaction; run facts are printed in the tables instead')
    // Repeated on every pane. A pane dragged into a deck is a row pasted into a sheet, and
    // the preamble does not travel with it.
    .perPane('measurement', open == null ? 'none open' : `${open.name} (#${open.id})`)
    .perPane('condition', condition)
  if (conditionScope) scope.perPane('condition_scope', conditionScope)

  const model: DocModel = {
    title: workbook.name,
    scope,
    pages: [{ name: workbook.name, panes }],
    tokens: resolvedTokens(),
  }

  const provenance = scope.paneEntries().map((e) => `${e.key}: ${e.value}`).join(' · ')
  return {
    filename: documentFileName(workbook, open, 'html'),
    html: renderWorkbookDocument(model),
    panes: panes.map((pane, i) => ({
      filename: paneFileName(workbook, i, pane.title),
      svg: renderPaneSvg(pane, model.tokens, provenance),
    })),
  }
}

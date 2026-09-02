import type { KpiDefinition, SessionSummary, SeqRange } from '../api/types'

/**
 * The one definition of what a view of a measurement may be, and the one place the URL
 * is read or written.
 *
 * Two jobs on purpose, because they are the same job. Putting the view in the address bar
 * is what makes it possible to receive a view somebody else composed - and a received
 * view is the first view this app has ever had that it did not produce itself. Every
 * value in it is a claim about a drive that the sender was looking at and the recipient
 * may not have.
 *
 * That is why the legality rule lives here rather than as clamps scattered across the
 * consumers. A seq is not "a number ≥ 0"; it is an index into ONE drive's sample table,
 * and the same integer is a different moment - or no moment - in another. `sample_kpi`
 * makes the same argument for its long format and `RouteContinuity` for its distance
 * rule: the rule has one home and its consumers share it, because the failure mode of
 * several copies is that they disagree while each looks right.
 *
 * WHAT IS DELIBERATELY NOT HERE, so it is not re-litigated:
 *
 *  - The MAP VIEWPORT. It looks like the most shareable thing on the screen and it is the
 *    one value the app also writes by itself: the automatic fit raises the same `moveend`
 *    a user pan does, so a bare page load would record a frame nobody chose, and the next
 *    load would then suppress the fit that produced it. "The frame the app picked" and
 *    "the frame the user picked" would be one parameter meaning two things. Framing is
 *    per-drive and re-framing is one keypress (F), which is a smaller loss than a link
 *    that reopens on a frame its sender never set.
 *  - PLAYBACK (playing, rate, reverse). A link is evidence, not a performance; arriving
 *    at somebody else's link with the cursor already running away from you is worse than
 *    arriving stopped.
 *  - Transient UI: the parameter search text, form drafts, which problem case is open,
 *    which L3 message is expanded. None of it is a claim about the measurement.
 *  - Workbook CONTENTS. Composed workbooks are saved server-side precisely so a link to
 *    one does not have to carry it.
 */

export type Mode = 'analyze' | 'compare' | 'lab' | 'import'
const MODES: Mode[] = ['analyze', 'compare', 'lab', 'import']

export interface ViewState {
  mode: Mode
  sessionId: number | null
  kpi: string
  workbook: string
  seq: number
  range: SeqRange | null
  binSize: number
  distanceStep: number
  footprints: boolean
  /**
   * The global filter spec, or null.
   *
   * Belongs in a link for the same reason the KPI does: it changes what every number on
   * the screen means. A view sent without it would arrive looking like the sender's and
   * reading the whole drive - self-consistent, and not the thing that was sent. Left
   * unvalidated here on purpose: the grammar is the server's, and reconcile() has no way
   * to ask it, so the app validates the incoming spec against the server before applying
   * it and reports a rejection as a correction like any other.
   */
  filter: string | null
}

export const DEFAULT_VIEW: ViewState = {
  mode: 'analyze',
  sessionId: null,
  kpi: 'RSRP',
  workbook: 'overview',
  seq: 0,
  range: null,
  binSize: 0,
  distanceStep: 0,
  footprints: false,
  filter: null,
}

/**
 * One repair the app made to a view it was handed.
 *
 * Corrections are reported, never applied silently. A link that quietly becomes a
 * different view is the failure this whole module is built around: the recipient reads a
 * screen that is entirely self-consistent and entirely not what was sent, and nothing on
 * it disagrees with anything else.
 */
export interface Correction {
  param: string
  raw: string
  became: string
  why: string
}

const BIN_SIZES = [0, 50, 150, 500]
const DIST_STEPS = [0, 50, 100, 250]

function oneOf<T extends number>(raw: string | null, allowed: T[], fallback: T): T {
  if (raw == null) return fallback
  const n = Number(raw)
  return allowed.includes(n as T) ? (n as T) : fallback
}

/** Read a view out of a query string. Unparseable values fall back without complaint - */
/** they are not claims about a drive, they are typos in an option list. */
export function parseView(search: string): ViewState {
  const q = new URLSearchParams(search)
  const s = q.get('s')
  const seq = Number(q.get('seq'))
  const r = q.get('r')
  const rm = r?.match(/^(\d*)-(\d*)$/)
  const mode = q.get('mode') as Mode | null
  return {
    mode: mode && MODES.includes(mode) ? mode : DEFAULT_VIEW.mode,
    sessionId: s != null && /^\d+$/.test(s) ? Number(s) : null,
    kpi: q.get('kpi') ?? DEFAULT_VIEW.kpi,
    workbook: q.get('tab') ?? DEFAULT_VIEW.workbook,
    seq: Number.isFinite(seq) && seq >= 0 ? Math.floor(seq) : 0,
    range: rm
      ? { from: rm[1] === '' ? null : Number(rm[1]), to: rm[2] === '' ? null : Number(rm[2]) }
      : null,
    binSize: oneOf(q.get('bin'), BIN_SIZES, 0),
    distanceStep: oneOf(q.get('dist'), DIST_STEPS, 0),
    footprints: q.get('fp') === '1',
    filter: q.get('gf'),
  }
}

/**
 * Write a view as a query string, omitting everything at its default.
 *
 * A URL that spells out every default is unreadable and un-diffable, and it makes the
 * common case - "here, look at this drive" - look like a machine artefact.
 */
export function encodeView(v: ViewState): string {
  const q = new URLSearchParams()
  if (v.mode !== DEFAULT_VIEW.mode) q.set('mode', v.mode)
  if (v.sessionId != null) q.set('s', String(v.sessionId))
  if (v.kpi !== DEFAULT_VIEW.kpi) q.set('kpi', v.kpi)
  if (v.workbook !== DEFAULT_VIEW.workbook) q.set('tab', v.workbook)
  if (v.seq !== 0) q.set('seq', String(v.seq))
  if (v.range && (v.range.from != null || v.range.to != null)) {
    q.set('r', `${v.range.from ?? ''}-${v.range.to ?? ''}`)
  }
  if (v.binSize !== 0) q.set('bin', String(v.binSize))
  if (v.distanceStep !== 0) q.set('dist', String(v.distanceStep))
  if (v.footprints) q.set('fp', '1')
  if (v.filter) q.set('gf', v.filter)
  const s = q.toString()
  return s ? `?${s}` : ''
}

/**
 * Make a view legal for the measurement that actually loaded, and say what had to change.
 *
 * `sessions` empty means the list has not arrived; nothing is decided until it has,
 * because "this session does not exist" and "we have not looked yet" are different facts
 * and only one of them justifies throwing the sender's view away.
 */
export function reconcile(
  view: ViewState,
  sessions: SessionSummary[],
  defs: KpiDefinition[],
): { view: ViewState; corrections: Correction[] } {
  if (sessions.length === 0) return { view, corrections: [] }

  const corrections: Correction[] = []
  const out: ViewState = { ...view }

  // 1. The measurement. A link naming one that is gone is not a link to a different
  //    drive at the same sample index - it is a link to nothing, and the sample index
  //    came from a drive we do not have. Adopting a substitute and KEEPING the sender's
  //    seq produces a screen that is confidently wrong: every panel agrees with every
  //    other panel about a moment nobody chose. So the fallback drops the values that
  //    only meant something relative to the drive that is missing.
  // Note on an overlap that is deliberate: App's session-change effect ALSO clears the
  // cursor and the range, so in this branch the app would behave correctly even if the
  // lines below only reported. They are still here because reporting is not a side effect
  // of the repair - it is the repair's whole point - and because a reader of this function
  // should be able to see the view it returns without also holding App's effect order in
  // their head. What the notice SAYS is asserted directly in scenario S15, since the
  // behaviour alone cannot distinguish the two mechanisms.
  const oldest = [...sessions].sort((a, b) => a.id - b.id)[0]
  let session = sessions.find((s) => s.id === out.sessionId) ?? null
  if (out.sessionId != null && session == null) {
    corrections.push({
      param: 's', raw: String(out.sessionId), became: oldest.name,
      why: 'that measurement is not on this server',
    })
    out.sessionId = oldest.id
    if (out.seq !== 0) {
      corrections.push({ param: 'seq', raw: String(out.seq), became: '0',
        why: 'a sample index only means something inside its own drive' })
      out.seq = 0
    }
    if (out.range) {
      corrections.push({ param: 'r', raw: rangeText(out.range), became: 'off',
        why: 'a sample range only means something inside its own drive' })
      out.range = null
    }
    session = oldest
  }
  if (out.sessionId == null) { out.sessionId = oldest.id; session = oldest }

  // 2. The cursor and the range, against the drive that loaded. `sampleCount` may be
  //    absent while the summary is still arriving, which is NOT the same as a drive with
  //    one sample - and both would read as maxSeq 0. Clamping on the conflated value
  //    accepts any seq at all on a one-sample drive.
  const count = session?.sampleCount
  if (count != null && count > 0) {
    const maxSeq = count - 1
    if (out.seq > maxSeq) {
      corrections.push({ param: 'seq', raw: String(out.seq), became: String(maxSeq),
        why: `this drive ends at ${maxSeq}` })
      out.seq = maxSeq
    }
    if (out.range) {
      const from = out.range.from == null ? null : Math.max(0, Math.min(maxSeq, out.range.from))
      const to = out.range.to == null ? null : Math.max(0, Math.min(maxSeq, out.range.to))
      // An inverted range is not a narrow window, it is an empty one: the legend, the
      // statistics and the degradation list all come back with nothing and the chip
      // cheerfully states the filter that emptied them.
      const empty = from != null && to != null && from > to
      if (empty) {
        corrections.push({ param: 'r', raw: rangeText(out.range), became: 'off',
          why: 'the range started after it ended' })
        out.range = null
      } else if (from !== out.range.from || to !== out.range.to) {
        const next = { from, to }
        corrections.push({ param: 'r', raw: rangeText(out.range), became: rangeText(next),
          why: `this drive ends at ${maxSeq}` })
        out.range = next
      }
    }
  }

  // 3. The KPI, against the catalogue. Whether it has any VALUES in this particular drive
  //    is a question only the server can answer, so it is corrected later, where the
  //    answer arrives - see App's distribution effect.
  if (defs.length > 0 && !defs.some((d) => d.name === out.kpi)) {
    corrections.push({ param: 'kpi', raw: out.kpi, became: DEFAULT_VIEW.kpi,
      why: 'no such parameter on this server' })
    out.kpi = DEFAULT_VIEW.kpi
  }

  return { view: out, corrections }
}

function rangeText(r: SeqRange): string {
  return `${r.from ?? ''}-${r.to ?? ''}`
}

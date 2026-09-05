/**
 * What a workbook document has to say about itself.
 *
 * The same doctrine `ExportScope` states on the server, applied to an artifact that is a
 * picture rather than a table: every fact goes in TWO places - once about the file, and
 * once on every severable unit. There, the severable unit is a row, because forty rows
 * pasted into another sheet is how a drive-test table reaches a report. Here it is a PANE,
 * because a pane dragged into a deck is the same act.
 *
 * A separate register from `ExportScope.COLUMN_NAMES` rather than a shared one, and the
 * reason is mechanical: `ImportService` builds its RESERVED set by concatenating those
 * column names, so a key added here - `workbook`, say - would silently make a CSV column
 * called `workbook` un-importable as a KPI in files that have nothing to do with
 * workbooks. Two registers for one doctrine is the cost; a coupling between an HTML
 * document and the CSV importer would be worse.
 *
 * What is NOT duplicated is any sentence. Every value here is read off the result or
 * fetched from the server - the condition's wording comes from `/global-filter/describe`,
 * which exists precisely so a second phrasing of "what this filter says" cannot appear.
 */

/** Every key a workbook document may carry, declared here rather than at the call sites. */
export const DOC_KEYS = [
  'format', 'workbook', 'measurement', 'condition', 'condition_scope',
  'generated', 'saved', 'contains', 'not_included',
] as const

export type DocKey = (typeof DOC_KEYS)[number]

export interface DocEntry { key: DocKey; value: string; perPane: boolean }

export class DocScope {
  private readonly entries: DocEntry[] = []

  /** A fact about the document as a whole. */
  file(key: DocKey, value: string | null | undefined): this {
    return this.add(key, value, false)
  }

  /**
   * A fact that changes how ONE PANE reads, so it is repeated on every one.
   *
   * Written even when the value is a literal 'none': a condition line that disappears when
   * nothing is filtered means the reader has to know the line can be absent, and an absent
   * line is indistinguishable from a document written before it existed.
   */
  perPane(key: DocKey, value: string | null | undefined): this {
    return this.add(key, value, true)
  }

  private add(key: DocKey, value: string | null | undefined, perPane: boolean): this {
    if (!DOC_KEYS.includes(key)) {
      throw new Error(`Not a declared provenance key: ${key}. Add it to DOC_KEYS.`)
    }
    this.entries.push({
      key,
      // Two ways a value can escape the line it is written on, both of them values
      // somebody typed - a measurement name, a workbook name. A newline ends the '# '
      // line and puts the rest into the document one column wide; `-->` ends the HTML
      // COMMENT the preamble lives in, and everything after it becomes visible page
      // content that reads like part of the report. The server's ExportScope learned the
      // first of these with a test; this is the same rule plus the one HTML adds.
      value: (value == null || value.trim() === '' ? 'none' : value)
        .replace(/[\r\n]+/g, ' ').replace(/--+>/g, '--\u200b>'),
      perPane,
    })
    return this
  }

  all(): DocEntry[] { return [...this.entries] }
  paneEntries(): DocEntry[] { return this.entries.filter((e) => e.perPane) }
}

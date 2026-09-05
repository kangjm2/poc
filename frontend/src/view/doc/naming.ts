/**
 * What an exported workbook is called on disk.
 *
 * The slug rule is the server's, restated here because the server does not write this
 * file - and that restatement is a rule in two languages, which this repository normally
 * refuses. It is accepted with a guard rather than hidden: a check downloads a CSV (named
 * by `AnalyticsController.fileName`) and a workbook document (named here) of the same
 * measurement and asserts the measurement's slug is character-identical in both. If the
 * two rules ever diverge the check goes red, which is the property a shared rule has and a
 * copied one usually does not.
 *
 * The workbook id is always present, not only as a fallback the way the measurement's is.
 * `workbook.name` has no unique constraint and every workbook is created as the literal
 * 'New workbook', so a name-only slug collides on the user's first two - and two downloads
 * with one name means the second silently replaces the first.
 *
 * The condition is NOT in the name, which is the server's stated policy and its reason:
 * a `-filtered` suffix says something was excluded without saying what, disappears when
 * the file is renamed, and makes every file without it read as unfiltered. It lives inside.
 */
export function slug(name: string | null | undefined): string {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function documentFileName(
  workbook: { id: number | null; name: string },
  session: { id: number; name: string } | null,
  ext: string,
): string {
  const book = slug(workbook.name) || 'workbook'
  const id = workbook.id == null ? 'unsaved' : String(workbook.id)
  const drive = session == null ? 'no-measurement'
    : (slug(session.name) || `measurement-${session.id}`)
  return `${book}-${id}-${drive}.${ext}`
}

export function paneFileName(
  workbook: { id: number | null; name: string },
  index: number,
  paneTitle: string,
): string {
  const book = slug(workbook.name) || 'workbook'
  const id = workbook.id == null ? 'unsaved' : String(workbook.id)
  const title = slug(paneTitle).slice(0, 40) || 'pane'
  return `${book}-${id}-pane${index + 1}-${title}.svg`
}

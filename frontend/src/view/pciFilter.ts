/**
 * The reference's cell-filter syntax, parsed in one place.
 *
 * UC1 p67 gives the grammar in its own dialog help: comma-separated numbers and ranges,
 * `3,10-30,42,100-`. Three forms, and the third is the one worth naming: an open-ended
 * range `100-` means "100 and above", which is how an operator says "the small-cell layer"
 * without knowing where it ends.
 *
 * The manual attaches this to a `Scrambling code filter` / `Channel number filter`; our
 * equivalent identity is the PCI, so that is what it narrows.
 *
 * Its own module because two things read it and they must agree: the map, which draws the
 * hulls, and the caption, which tells the reader what was left out. A parse that lived in
 * the component would make the caption a second opinion about the same string.
 */
export interface PciFilter {
  /** Null means "no filter": every cell, which is what an empty box means in the manual too. */
  match: ((pci: number) => boolean) | null
  /** What the reader typed, cleaned up, or the reason it means nothing. */
  error: string | null
  /** The terms understood, for the caption. Empty when there is no filter. */
  terms: string[]
}

export function parsePciFilter(raw: string): PciFilter {
  const text = raw.trim()
  if (text === '') return { match: null, error: null, terms: [] }

  const terms: string[] = []
  const tests: Array<(n: number) => boolean> = []
  for (const piece of text.split(',')) {
    const t = piece.trim()
    if (t === '') continue
    // Order matters: `100-` is an open range and must be tried before the plain number,
    // and `-30` is not a negative PCI - there are none - but "up to 30".
    let m = t.match(/^(\d+)\s*-\s*(\d+)$/)
    if (m) {
      const lo = Number(m[1]); const hi = Number(m[2])
      if (lo > hi) return { match: null, error: `${t} counts downwards`, terms: [] }
      tests.push((n) => n >= lo && n <= hi); terms.push(`${lo}–${hi}`); continue
    }
    m = t.match(/^(\d+)\s*-$/)
    if (m) {
      const lo = Number(m[1])
      tests.push((n) => n >= lo); terms.push(`${lo} and above`); continue
    }
    m = t.match(/^-\s*(\d+)$/)
    if (m) {
      const hi = Number(m[1])
      tests.push((n) => n <= hi); terms.push(`up to ${hi}`); continue
    }
    m = t.match(/^(\d+)$/)
    if (m) {
      const only = Number(m[1])
      tests.push((n) => n === only); terms.push(String(only)); continue
    }
    return { match: null, error: `"${t}" is not a cell or a range`, terms: [] }
  }
  if (tests.length === 0) return { match: null, error: null, terms: [] }
  return { match: (n) => tests.some((f) => f(n)), error: null, terms }
}

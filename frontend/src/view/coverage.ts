import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { FilterCoverage } from '../api/types'

/**
 * The server's own account of which analytics the global filter reaches, read from one
 * fetch by everything that states it.
 *
 * The bar prints the count and the Reach list. The screen prints, above a panel whose
 * numbers the condition never touched, that it did not touch them. Both have to be reading
 * the SAME list, or the bar can say "23 of 29" while the panel under it shows the whole
 * drive's 34 problems with nothing on it to say so - which is what the screen did while
 * this fetch lived in the bar alone (docs/ux-audit.md S2-1). The list is a fact about the
 * server's code rather than about a drive, so one request per page load is the right
 * number: the promise is kept here and every mount shares it.
 */
let pending: Promise<FilterCoverage[]> | null = null

export function useFilterCoverage(): FilterCoverage[] {
  const [coverage, setCoverage] = useState<FilterCoverage[]>([])
  useEffect(() => {
    let live = true
    // A failed fetch is forgotten, so the next mount asks again rather than leaving every
    // screen of the session without a Reach button.
    pending ??= api.filterCoverage().catch(() => { pending = null; return [] })
    pending.then((c) => { if (live) setCoverage(c) })
    return () => { live = false }
  }, [])
  return coverage
}

/**
 * The exempt entries among the analytics one screen reads, in the screen's own order.
 *
 * `paths` are the tails the client's methods use - `/problem-survey` - while the server
 * lists `/api/sessions/{id}/problem-survey`; matched on the tail so the table in App.tsx
 * reads against api/client.ts without translation, and returned UNDER the tail so the
 * note on screen names the thing the way the code does. Honoured entries are left out: a
 * screen that mixes both says only what the condition did not reach, because the bar has
 * already said what it did.
 */
export function exemptAmong(
  coverage: readonly FilterCoverage[], paths: readonly string[],
): FilterCoverage[] {
  return paths.flatMap((p) => {
    const c = coverage.find((x) => x.path.endsWith(p))
    return c && !c.honoured ? [{ ...c, path: p }] : []
  })
}

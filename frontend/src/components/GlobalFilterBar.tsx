import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useFilterCoverage } from '../view/coverage'

/**
 * The one condition every analytic answers through, and an honest account of its reach.
 *
 * The reference's status bar reads "No global filters" when there is none, and that
 * single line is the reason this bar exists at the top of the window rather than inside
 * one panel: a narrowing that some screens obey is only safe if the screen SAYS it is in
 * force. A filter applied silently turns every number in the application into a claim
 * about a subset nobody can see, which is worse than having no filter at all.
 *
 * Two things are therefore always on screen while one is active: what it says, in words
 * the server produced, and how many analytics honour it. The count is not decoration -
 * six of ours cannot honour it, for reasons that are real and are listed - and a user who
 * cannot find out which is a user who will read an unfiltered events list as filtered.
 */
export function GlobalFilterBar({ spec, onApply }: {
  spec: string | null
  onApply: (spec: string | null) => void
}) {
  const [draft, setDraft] = useState(spec ?? '')
  const [text, setText] = useState<string | null>(null)
  const [scope, setScope] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Shared with the screens below, which print their exemptions from the same list.
  const coverage = useFilterCoverage()
  const [showReach, setShowReach] = useState(false)

  useEffect(() => { setDraft(spec ?? '') }, [spec])

  // The phrase comes from the server for the same reason the parsing does: two
  // implementations of "what this filter says" is one implementation too many, and the
  // wrong one would be the one on screen.
  useEffect(() => {
    if (!spec) { setText(null); return }
    let live = true
    api.describeFilter(spec)
      .then((d) => { if (live) { setText(d.text); setScope(d.scope ?? null) } })
      .catch(() => { if (live) setText(spec) })
    return () => { live = false }
  }, [spec])

  const apply = () => {
    const next = draft.trim()
    if (!next) { setError(null); onApply(null); return }
    // Validated by the server before it is applied, so a typo never becomes a filter that
    // makes every panel answer 400 at once.
    api.describeFilter(next)
      .then(() => { setError(null); onApply(next) })
      .catch((e: Error) => setError(e.message.replace(/^\d+:\s*/, '')))
  }

  const honoured = coverage.filter((c) => c.honoured)
  const exempt = coverage.filter((c) => !c.honoured)

  return (
    <div className={spec ? 'globalfilter on' : 'globalfilter'}>
      <label htmlFor="gf-spec">Global filter</label>
      <input id="gf-spec" value={draft} spellCheck={false}
             placeholder="kpi:RSRP:&gt;=:-100  or  cell:101"
             title="kpi:NAME:OP:VALUE, or cell:PCI. Join with ; for AND."
             onChange={(e) => setDraft(e.target.value)}
             onKeyDown={(e) => { if (e.key === 'Enter') apply() }} />
      <button onClick={apply}>Apply</button>
      {spec && (
        <button onClick={() => { setDraft(''); setError(null); onApply(null) }}
                aria-label="Clear global filter">Clear</button>
      )}

      {/* The reference's own words when nothing is set, kept verbatim because "no
          filters" is the fact a reader most needs and least thinks to check. */}
      {!spec && <span className="dim">No global filters</span>}

      {spec && (
        <span className="gf-active" title="In force on every analytic listed under Reach">
          In force: <b>{text ?? spec}</b>
        </span>
      )}

      {coverage.length > 0 && (
        <button className="gf-reach" onClick={() => setShowReach((v) => !v)}
                aria-expanded={showReach}
                title="Which analytics the filter reaches, and which it does not">
          Reach: {honoured.length} of {coverage.length}
        </button>
      )}

      {error && <span className="gf-error">{error}</span>}

      {showReach && (
        <div className="gf-reach-list">
          {/* Above the two columns, because it is true of every row in both of them.
              A condition evaluated per drive is the right answer and an invisible one. */}
          {scope && <div className="gf-scope">{scope}</div>}
          <div className="col">
            <h4>Honours the filter ({honoured.length})</h4>
            <ul>
              {honoured.map((c) => (
                <li key={c.path}><code>{c.path}</code> — {c.note}</li>
              ))}
            </ul>
          </div>
          <div className="col">
            {/* Named, not hidden. An exemption a user can read is a limit; an exemption
                they cannot is a screen that lies by omission. */}
            <h4>Does not, and why ({exempt.length})</h4>
            <ul>
              {exempt.map((c) => (
                <li key={c.path}><code>{c.path}</code> — {c.note}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

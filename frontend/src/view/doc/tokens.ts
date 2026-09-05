/**
 * The colour tokens, resolved to literal colours.
 *
 * The panes write `stroke="var(--cursor)"` into SVG attributes while the value lives only
 * in the stylesheet's `:root`. Inside the app that resolves; in a file that carries the
 * fragment and not the stylesheet it resolves to nothing, and `stroke:none` is invisible
 * rather than wrong-coloured - so the exported pane would open with every trace correct
 * and the shared time cursor silently gone. That is the element the whole workbook is
 * organised around, and no check that counted paths would have seen it.
 *
 * The one impure function in view/doc. Everything else here is a string in, a string out,
 * which is what lets a checker call the renderers in Node.
 */
const TOKENS = ['--cursor', '--trace', '--trace-2', '--area-fill', '--area-line'] as const

export function resolvedTokens(): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof document === 'undefined') return out
  const style = getComputedStyle(document.documentElement)
  for (const name of TOKENS) {
    const v = style.getPropertyValue(name).trim()
    if (v) out[name] = v
  }
  return out
}

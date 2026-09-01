import { useEffect, useRef } from 'react'

/**
 * One Escape, one owner, a written-down order.
 *
 * Escape had no handler at all: the scale editor closed only by clicking its backdrop or
 * its Close button, and the problem-survey context panel only by its own button. Adding a
 * keydown listener per component would have given Escape as many owners as there are
 * panels, and no way to say which one wins when two are open.
 *
 * Instead each dismissable surface registers what to close and how important it is, and
 * the single listener in App pops the top of the stack. State stays where it is - a
 * component registers a callback, it does not hand its state upward - which is why this is
 * a module registry and not a lifted `openPanel` union.
 */

export const PRIORITY = {
  /** A modal over the page. Closing anything behind it while it is up would be invisible. */
  MODAL: 300,
  /** A panel that appeared because the user drilled into something. */
  DRILLDOWN: 200,
  /** A strip the app raised to report something. */
  NOTICE: 100,
}

interface Entry { id: number; priority: number; close: () => void }

let nextId = 1
let stack: Entry[] = []

/**
 * Register `close` while `active`.
 *
 * The callback is read at dismiss time rather than captured at register time, so a stale
 * closure cannot close a panel using last render's state.
 */
export function useDismissable(active: boolean, priority: number, close: () => void) {
  // The latest callback, without re-registering. Re-registering on every render would
  // reorder the stack under a user who has two things open; capturing the first callback
  // instead would close a panel using the state of the render that opened it.
  const latest = useRef(close)
  latest.current = close

  useEffect(() => {
    if (!active) return
    const id = nextId++
    stack.push({ id, priority, close: () => latest.current() })
    return () => { stack = stack.filter((e) => e.id !== id) }
  }, [active, priority])
}

/**
 * Close the most important open surface. Returns false when there was nothing to close,
 * so the caller can let the key through.
 */
export function dismissTop(): boolean {
  if (stack.length === 0) return false
  let top = stack[0]
  for (const e of stack) {
    // Ties go to the most recently registered, which is the one on top of the screen.
    if (e.priority >= top.priority) top = e
  }
  top.close()
  return true
}

/** How many surfaces are currently dismissable. Exported for the checkers. */
export function openCount(): number {
  return stack.length
}

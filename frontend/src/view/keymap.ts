/**
 * The one place a key gets its meaning — and its documentation.
 *
 * The help sheet is rendered FROM this table, not written beside it. A key that is not in
 * the table cannot be documented, and a key that is in it cannot go undocumented, which is
 * the same argument `event_type` (V10) makes for event names and colours: a second copy of
 * a fact is a second thing to keep in step, and it will not be kept in step.
 *
 * Nothing here binds anything. App owns the single listener and reads this table; keeping
 * the table inert means it can also be imported by the sheet without dragging behaviour in.
 *
 * Every key has exactly one owner. Leaflet's own keyboard handler is turned off
 * (RouteMap passes `keyboard: false`) because it claimed the arrows whenever the map had
 * focus and called stopPropagation, so clicking the map made the one-sample cursor stop
 * responding with no indication why. The pan it provided is given back on the map itself,
 * on ArrowUp/Down only, which this table never claims.
 */

/** Where a binding is allowed to fire. */
export type Scope =
  /** Everywhere, including Compare, Lab and Import. */
  | 'global'
  /** Only while the Analysis mode is showing - the surfaces these keys drive live there. */
  | 'analyze'
  /**
   * Owned by the map, handled on the map itself, listed here so the sheet stays the one
   * account of what keys do. The global handler skips these.
   */
  | 'map'

export interface KeyBinding {
  /** Literal KeyboardEvent.key values. Several when one action has several spellings. */
  keys: string[]
  /** How the key is printed in the sheet. */
  label: string
  what: string
  group: 'Time' | 'Range' | 'View' | 'Help'
  scope: Scope
  /**
   * Whether holding the key should repeat the action.
   *
   * False for every toggle. An auto-repeating toggle at the OS repeat rate (~30/s) does
   * not "hold on", it thrashes: playback in particular clears and re-creates its interval
   * on every flip, so it never advances and the state left behind depends on whether the
   * key count was odd or even.
   */
  repeatable: boolean
}

export const KEYMAP: KeyBinding[] = [
  { keys: [' '], label: 'Space', what: 'Play / pause', group: 'Time', scope: 'analyze', repeatable: false },
  { keys: ['ArrowRight'], label: '→', what: 'Forward one sample', group: 'Time', scope: 'analyze', repeatable: true },
  { keys: ['ArrowLeft'], label: '←', what: 'Back one sample', group: 'Time', scope: 'analyze', repeatable: true },
  { keys: ['PageDown'], label: 'PgDn', what: 'Forward ten samples', group: 'Time', scope: 'analyze', repeatable: true },
  { keys: ['PageUp'], label: 'PgUp', what: 'Back ten samples', group: 'Time', scope: 'analyze', repeatable: true },
  { keys: ['Home'], label: 'Home', what: 'First sample', group: 'Time', scope: 'analyze', repeatable: false },
  { keys: ['End'], label: 'End', what: 'Last sample', group: 'Time', scope: 'analyze', repeatable: false },
  { keys: ['r'], label: 'R', what: 'Reverse playback direction', group: 'Time', scope: 'analyze', repeatable: false },
  { keys: ['+', '='], label: '+', what: 'Faster playback', group: 'Time', scope: 'analyze', repeatable: false },
  { keys: ['-', '_'], label: '−', what: 'Slower playback', group: 'Time', scope: 'analyze', repeatable: false },

  { keys: ['['], label: '[', what: 'Filter from the cursor', group: 'Range', scope: 'analyze', repeatable: false },
  { keys: [']'], label: ']', what: 'Filter up to the cursor', group: 'Range', scope: 'analyze', repeatable: false },
  { keys: ['\\'], label: '\\', what: 'Clear the range filter', group: 'Range', scope: 'analyze', repeatable: false },

  { keys: ['f'], label: 'F', what: 'Re-frame the map on the drive', group: 'View', scope: 'analyze', repeatable: false },
  { keys: ['ArrowUp', 'ArrowDown'], label: '↑ ↓', what: 'Pan the map, while it has focus', group: 'View', scope: 'map', repeatable: true },

  { keys: ['Escape'], label: 'Esc', what: 'Close what is open', group: 'Help', scope: 'global', repeatable: false },
  { keys: ['?', '/'], label: '?', what: 'This list', group: 'Help', scope: 'global', repeatable: false },
]

/** Grouped for the sheet, in the order the groups are declared above. */
export function keymapByGroup(): Array<[string, KeyBinding[]]> {
  const out: Array<[string, KeyBinding[]]> = []
  for (const b of KEYMAP) {
    const row = out.find(([g]) => g === b.group)
    if (row) row[1].push(b)
    else out.push([b.group, [b]])
  }
  return out
}

/** The binding a key event matches, or null. */
export function bindingFor(key: string): KeyBinding | null {
  return KEYMAP.find((b) => b.keys.includes(key)) ?? null
}

/**
 * Whether a key event is someone typing, and so none of our business.
 *
 * Deliberately NOT a component list. `role="application"` catches the workbench canvas -
 * a focusable non-input surface whose keys are its own - without this module having to
 * know that KpiWarehouse exists, and a new such surface only has to declare the role.
 *
 * SELECT is here on purpose: a focused select must keep its native arrow behaviour, or
 * the arrows would change the KPI behind the user while appearing to move the cursor.
 * The cost - arrows going dead right after a mouse pick, because the select keeps focus -
 * is paid where it is created, by blurring the select once its change has committed.
 */
const NON_TEXT_INPUT = new Set([
  'button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit',
])

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.getAttribute('role') === 'application') return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return !NON_TEXT_INPUT.has((target as HTMLInputElement).type)
  return false
}

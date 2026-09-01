import { keymapByGroup } from '../view/keymap'

/**
 * The keyboard help, rendered FROM the binding table.
 *
 * Not a written list beside the bindings. A hand-kept sheet is a second copy of what the
 * handler does, and the two drift the moment a key is renamed - the same reason event
 * display names moved into `event_type` instead of living in one service's private map.
 * Here a key cannot be documented unless it is bound, and cannot be bound without
 * appearing here.
 *
 * Shortcuts nobody finds are worth nothing, so this is reachable from a visible button in
 * the status bar as well as from `?`.
 */
export function KeySheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal key-sheet" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <span className="title">Keyboard</span>
          <button onClick={onClose}>Close</button>
        </header>
        <div className="key-groups">
          {keymapByGroup().map(([group, bindings]) => (
            <div key={group} className="key-group">
              <b>{group}</b>
              <table className="grid">
                <tbody>
                  {bindings.map((b) => (
                    <tr key={b.keys.join()}>
                      <td style={{ width: 64 }}><kbd>{b.label}</kbd></td>
                      <td>{b.what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <p className="modal-hint">
          Keys are ignored while you are typing, and the transport keys only act on the
          Analysis screen.
        </p>
      </div>
    </div>
  )
}

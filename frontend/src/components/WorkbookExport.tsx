import { useState } from 'react'
import { buildWorkbookDocument, type BuildInput } from '../view/doc/build'

/**
 * The workbook leaving the tool.
 *
 * The reference exports a workbook from the workbook (p223), which is where this sits -
 * in the composed workbook's own header, beside Save and Delete, and on no other screen.
 * A built-in tab is not a pane stack and has nothing to export this way; offering the
 * control there would be a promise with nothing behind it.
 *
 * Buttons rather than the anchors every other export in this application uses, and the
 * difference is real: an anchor's href can be read out of the DOM, which is how the other
 * exports are checked without downloading anything. These bytes are made here, so there is
 * no href to read - and the check that replaces it is stronger, because it takes the
 * download and reads what is actually in it.
 */
export function WorkbookExport({ build, paneCount }: {
  build: () => BuildInput
  paneCount: number
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = (filename: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoked on the next tick rather than immediately: revoking inside the same task can
    // race the browser's own read of the blob.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const run = async (what: 'document' | number) => {
    setBusy(true)
    setError(null)
    try {
      const doc = await buildWorkbookDocument(build())
      if (what === 'document') {
        save(doc.filename, doc.html, 'text/html;charset=utf-8')
      } else {
        const pane = doc.panes[what]
        if (!pane) throw new Error(`No pane ${what + 1} to export`)
        save(pane.filename, pane.svg, 'image/svg+xml;charset=utf-8')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="workbook-export" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <button disabled={busy} title="The whole workbook as one printable HTML document"
              onClick={() => run('document')}>
        {busy ? 'Exporting…' : 'Export document'}
      </button>
      {Array.from({ length: paneCount }, (_, i) => (
        <button key={i} disabled={busy} title={`Pane ${i + 1} on its own, as SVG`}
                onClick={() => run(i)}>{`pane ${i + 1}`}</button>
      ))}
      {error && <span className="error" style={{ fontSize: 11 }}>{error}</span>}
    </span>
  )
}

import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { SessionSummary, SpatialDiff } from '../api/types'
import { RouteMap } from './RouteMap'

/**
 * Where two drives differ, tile by tile.
 *
 * The A/B comparison already says "B is 2.1 dB worse". This exists because that sentence
 * cannot distinguish "every street got slightly worse" from "one street collapsed and the
 * rest is unchanged" - two findings with different causes, different fixes, and the same
 * average.
 */
export function SpatialDiffPanel({ sessionId, sessions, kpi, cursorSeq, onPick }: {
  sessionId: number | null
  sessions: SessionSummary[]
  kpi: string
  cursorSeq: number
  onPick: (seq: number) => void
}) {
  const [other, setOther] = useState<number | null>(null)
  /**
   * Extra measurements on the far side, making it a GROUP rather than a drive.
   *
   * One drive is one sample of a road. The reference compares groups for that reason
   * (UC16 p159) and averages every measurement in a group together, which is what makes
   * "the evening runs are worse here" a statement about evenings.
   */
  const [withB, setWithB] = useState<number[]>([])
  const [size, setSize] = useState(150)
  const [data, setData] = useState<SpatialDiff | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Default to the first other measurement rather than leaving the screen empty and
  // waiting to be told what to compare against.
  useEffect(() => {
    if (sessionId == null) return
    setOther((o) => (o != null && o !== sessionId ? o
      : sessions.find((s) => s.id !== sessionId)?.id ?? null))
  }, [sessionId, sessions])

  useEffect(() => {
    if (sessionId == null || other == null) { setData(null); return }
    setError(null)
    api.spatialDiff(sessionId, other, kpi, size, withB).then(setData)
      .catch((e) => { setData(null); setError(e instanceof Error ? e.message : String(e)) })
  }, [sessionId, other, kpi, size, withB])

  const legend = data?.direction === 'NEUTRAL'
    ? [['#5b3fa8', 'changed a lot'], ['#a390d4', 'changed'], ['#e8e8ec', 'unchanged']]
    : [['#1a7f37', 'much better'], ['#79c27a', 'better'], ['#e8e8ec', 'unchanged'],
       ['#f0a08a', 'worse'], ['#c0392b', 'much worse']]

  return (
    <>
      <div className="panel">
        <header>
          <span className="title">Compare on the ground</span>
          <span className="meta" style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <label>against</label>
            <select value={other ?? ''} aria-label="Compare against"
                    onChange={(e) => { setOther(Number(e.target.value)); setWithB([]) }}>
              {sessions.filter((s) => s.id !== sessionId)
                .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {/* Only measurements on neither side are offered: one on both would be
                differenced against itself and pull its tiles towards "these agree". */}
            <select value="" aria-label="Add to the far side"
                    title="Average another measurement into the far side"
                    onChange={(e) => {
                      const id = Number(e.target.value)
                      if (id) setWithB((v) => v.includes(id) ? v : [...v, id])
                      e.currentTarget.value = ''
                    }}>
              <option value="">+ add to far side…</option>
              {sessions
                .filter((s) => s.id !== sessionId && s.id !== other && !withB.includes(s.id))
                .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={size} aria-label="Diff tile size"
                    onChange={(e) => setSize(Number(e.target.value))}>
              <option value={50}>50 m</option>
              <option value={150}>150 m</option>
              <option value={500}>500 m</option>
            </select>
          </span>
        </header>
        {withB.length > 0 && (
          <div className="diff-group" style={{ padding: '4px 8px', color: '#444' }}>
            Far side is a group of {withB.length + 1}, averaged together:{' '}
            {[other, ...withB].map((id) => sessions.find((s) => s.id === id)?.name ?? id)
              .join(' · ')}
            <button style={{ marginLeft: 8 }} onClick={() => setWithB([])}>
              back to one measurement
            </button>
          </div>
        )}
        {error && <div className="error">{error}</div>}
        {data && (
          <div className="diff-legend">
            {legend.map(([c, l]) => (
              <span key={l}><span className="swatch" style={{ background: c }} />{l}</span>
            ))}
            {/* Hollow, not grey-filled: a tile only one drive visited has no difference
                to report, and a filled tile reads as a measured "no change". */}
            <span><span className="swatch hollow" />one drive only</span>
            <span className="meta" style={{ marginLeft: 'auto' }}>
              {data.tilesBoth} tiles in both · {data.tilesOnlyA} only A · {data.tilesOnlyB} only B
            </span>
          </div>
        )}
      </div>
      <RouteMap track={[]} cells={[]} cursorSeq={cursorSeq} onCursorChange={onPick}
                kpiName={data?.displayName ?? kpi}
                frameKey={`diff:${sessionId}:${other}:${size}`}
                diffBins={data?.bins ?? null} />
      {data && data.tilesBoth === 0 && (
        <div className="panel">
          <div className="loading">
            These two measurements have no ground in common at this tile size. A larger
            tile may overlap; if not, they are different routes and there is nothing to
            subtract.
          </div>
        </div>
      )}
    </>
  )
}

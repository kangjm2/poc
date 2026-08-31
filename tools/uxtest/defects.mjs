/**
 * Reversible source mutations standing in for the ways a UI actually breaks
 * during AI-assisted development.
 *
 * The first three are the case the whole exercise is about: backend logic exists
 * and the view does not reflect it. The rest are ordinary regressions, included so
 * the comparison is not rigged toward one detector.
 */
export const DEFECTS = [
  {
    id: 'D1-kpi-not-rendered',
    kind: 'logic-without-view',
    describes: 'A KPI family exists server-side but the parameter tree filters it out, '
      + 'so it is unreachable in the UI.',
    file: 'frontend/src/components/Panels.tsx',
    find: `  const byCat = defs.reduce<Record<string, KpiDefinition[]>>((acc, d) => {`,
    replace: `  const byCat = defs.filter((d) => d.category !== 'Fronthaul')
    .reduce<Record<string, KpiDefinition[]>>((acc, d) => {`,
  },
  {
    id: 'D2-legend-stats-dropped',
    kind: 'logic-without-view',
    describes: 'The API returns per-bin counts and percentages; the legend renders only '
      + 'the colours, silently discarding the distribution.',
    file: 'frontend/src/components/Panels.tsx',
    find: `          <span className="count">{b.count}</span>
          <span className="pct">{b.percentage.toFixed(2)}%</span>`,
    replace: '',
  },
  {
    id: 'D3-workbook-tab-dead',
    kind: 'logic-without-view',
    describes: 'A workbook page is registered but renders nothing.',
    file: 'frontend/src/App.tsx',
    find: `      case 'degradation':
        return (`,
    replace: `      case 'degradation':
        if (true) return null
        return (`,
  },
  {
    id: 'D4-cursor-desync',
    kind: 'interaction-broken',
    describes: 'The shared time cursor stops driving the value panels. Layout is intact; '
      + 'the numbers just stop following the cursor.',
    file: 'frontend/src/App.tsx',
    find: `    api.snapshot(sessionId, cursorSeq).then(setSnapshot).catch(() => { /* seq may be out of range */ })`,
    replace: `    api.snapshot(sessionId, 0).then(setSnapshot).catch(() => { /* seq may be out of range */ })`,
  },
  {
    id: 'D5-severity-colour-dropped',
    kind: 'visual-only',
    describes: 'Threshold severity no longer paints the cell. Every value is still correct '
      + 'and present, but a breached threshold is invisible.',
    file: 'frontend/src/components/Panels.tsx',
    find: '                  <td className={`num sev-${r.severity}`}>',
    replace: '                  <td className="num">',
  },
  {
    id: 'D6-runtime-error',
    kind: 'crash',
    describes: 'A component throws while rendering.',
    file: 'frontend/src/components/Panels.tsx',
    find: `      {dist.bins.map((b) => (`,
    replace: `      {dist.bins.slice(0, dist.bins[9999].count).map((b) => (`,
  },
]

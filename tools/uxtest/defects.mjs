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
    // Re-anchored 2026-09-05. The original anchor was `defs.reduce<` and the source now
    // reads `matches.reduce<` - a search box landed between them. `inject.mjs apply` has
    // been exiting 3 ever since, so the check this defect proves has had NO proof for as
    // long as the search box has existed, and nothing said so: the register listed it and
    // the harness silently refused it.
    find: `  const byCat = matches.reduce<Record<string, KpiDefinition[]>>((acc, d) => {`,
    replace: `  const byCat = matches.filter((d) => d.category !== 'Fronthaul')
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
    // Re-anchored 2026-09-05, and this one is the sharp case. The anchor was a one-line
    // `api.snapshot(sessionId, cursorSeq).then(setSnapshot)`; the debounce that wraps the
    // cursor fetches moved it into a setTimeout with a `live` guard, and from that moment
    // the defect guarding the shared cursor - the application's central invariant - could
    // not be applied at all. 139/139 stayed green throughout, because a defect that will
    // not apply is not a failing check, it is an absent one.
    find: `      api.snapshot(sessionId, cursorSeq)
        .then((d) => { if (live) setSnapshot(d) })`,
    replace: `      api.snapshot(sessionId, 0)
        .then((d) => { if (live) setSnapshot(d) })`,
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

  // ── the workbook export (2026-09-05). Each of these produces a file that OPENS, has a
  //    header, has panes, and is wrong in a way no reader could detect from the file.
  {
    id: 'D7-pane-width-drifts',
    kind: 'two-callers-one-module',
    describes: 'The screen asks the geometry module for a 900-unit pane while the document '
      + 'asks for the default 1000, so every x differs and both pictures look right.',
    file: 'frontend/src/components/ComposedWorkbook.tsx',
    find: `    traces: series.map((x) => ({ key: x.key, color: x.color, series: x.s })),
    cursorSeq,
  })`,
    replace: `    traces: series.map((x) => ({ key: x.key, color: x.color, series: x.s })),
    cursorSeq,
    w: 900,
  })`,
  },
  {
    id: 'D8-doc-exports-hidden-layers',
    kind: 'logic-without-view',
    describes: 'The document draws every layer on a pane instead of the visible ones, so a '
      + 'trace the user unticked reappears in the file.',
    file: 'frontend/src/view/doc/build.ts',
    find: `      traces: visible.map((l) => ({`,
    replace: `      traces: pane.layers.map((l) => ({`,
  },
  {
    id: 'D9-doc-drops-last-pane',
    kind: 'silent-truncation',
    describes: 'The document omits the last pane. The file is complete-looking and every '
      + '"more than zero" assertion still passes.',
    file: 'frontend/src/view/doc/build.ts',
    find: `  const panes: DocPane[] = workbook.panes.map((pane) => {`,
    replace: `  const panes: DocPane[] = workbook.panes.slice(0, -1).map((pane) => {`,
  },
  {
    id: 'D10-doc-tokens-unresolved',
    kind: 'invisible-loss',
    describes: 'The exported SVG keeps var(--cursor) with no :root to resolve it, so every '
      + 'pane opens with correct traces and no time cursor at all.',
    file: 'frontend/src/view/doc/tokens.ts',
    find: `  if (typeof document === 'undefined') return out`,
    replace: `  return out`,
  },
  {
    id: 'D11-pane-svg-no-xmlns',
    kind: 'plausible-empty-file',
    describes: 'The per-pane picture loses its namespace, so the file downloads at the '
      + 'right size and renders as nothing.',
    file: 'frontend/src/view/doc/workbookdoc.ts',
    find: `    \`<svg xmlns="http://www.w3.org/2000/svg" width="\${w}" height="\${h}"\`,`,
    replace: `    \`<svg width="\${w}" height="\${h}"\`,`,
  },
  {
    id: 'D12-doc-preamble-only',
    kind: 'provenance-loss',
    describes: 'Provenance is written above the document but not on each pane, so a pane '
      + 'pasted into a deck carries no measurement and no condition.',
    file: 'frontend/src/view/doc/workbookdoc.ts',
    find: `      \`<figcaption>measurement: \${esc(pane.measurement)}\``,
    replace: `      \`<figcaption>\${esc('')}\``,
  },
  {
    id: 'D13-doc-writes-own-condition',
    kind: 'rule-in-two-places',
    describes: 'The document phrases the global filter itself instead of printing the '
      + "server's sentence, becoming the fourth author of one rule.",
    file: 'frontend/src/view/doc/build.ts',
    find: `      condition = d.text || 'none'`,
    // A NEAR miss, not a wild one. The first version of this defect stripped 'kpi:' and
    // turned the colons into spaces, which produced 'RSRQ >= -12' - the server's sentence,
    // character for character - and the check stayed green because nothing had changed.
    // A hand-rolled formatter that happens to agree today is the one this check cannot
    // see; what it can see is the same formatter tidying the operator tomorrow.
    replace: `      condition = filterSpec.replace(/^kpi:/, '')
        .replace(/:>=:/, ' \u2265 ').replace(/:/g, ' ')`,
  },
  {
    id: 'D14-doc-claims-saved',
    kind: 'false-provenance',
    describes: 'The document says it matches the stored workbook whether or not it does, so '
      + 'a picture of unsaved edits presents itself as the saved arrangement.',
    file: 'frontend/src/view/doc/build.ts',
    find: `    .file('saved', dirty`,
    replace: `    .file('saved', dirty && false`,
  },
  {
    id: 'D15-map-facts-dropped',
    kind: 'invisible-loss',
    describes: 'The map page keeps its picture and loses the run table, so every time, '
      + 'value, bin and sample count the hover carried is gone with nothing to show it.',
    file: 'frontend/src/view/doc/workbookdoc.ts',
    find: `    if (pane.form.runs.length === 0) return ''`,
    replace: `    if (pane.form.runs.length >= 0) return ''`,
  },
  {
    id: 'D16-document-name-without-id',
    kind: 'silent-overwrite',
    describes: 'The document is named from the workbook name alone. Every workbook is '
      + "created as 'New workbook', so the second download replaces the first.",
    file: 'frontend/src/view/doc/naming.ts',
    find: `  const id = workbook.id == null ? 'unsaved' : String(workbook.id)
  const drive = session == null ? 'no-measurement'
    : (slug(session.name) || \`measurement-\${session.id}\`)
  return \`\${book}-\${id}-\${drive}.\${ext}\``,
    replace: `  const drive = session == null ? 'no-measurement'
    : (slug(session.name) || \`measurement-\${session.id}\`)
  return \`\${book}-\${drive}.\${ext}\``,
  },
  {
    id: 'D17-pane-cursor-full-width',
    kind: 'inverse-of-nothing',
    describes: 'The click handler maps across the full pane width again, ignoring the left '
      + 'pad the plot is inset by - the cursor lands where the trace is not.',
    file: 'frontend/src/components/ComposedWorkbook.tsx',
    find: `             onCursorChange(seqAtFraction(geom, (e.clientX - r.left) / r.width))`,
    replace: `             onCursorChange(seqAtFraction(
               { ...geom, frame: { ...geom.frame, padL: 0, padR: 0 } },
               (e.clientX - r.left) / r.width))`,
  },

  // ── F2/F3 (2026-09-05). The first BACKEND defects in this register: every one of
  //    D1-D17 lives under frontend/, so a Java mistake has never been provable here.
  //    `inject.mjs` is path-agnostic already; what these need is a container rebuild in
  //    the loop, which is why they are grouped and labelled.
  {
    id: 'D18-compare-one-sided',
    kind: 'backend',
    describes: 'The condition reaches only one side of the comparison. The table still '
      + 'narrows and still prints a verdict, comparing a subset against a whole drive - '
      + 'which is exactly what a real regression looks like.',
    file: 'backend/src/main/java/com/vdt/analyzer/service/AnalysisService.java',
    find: `            Statistics sb = statistics(idB, name, null, null, weightedBy, domain, filterSpec);`,
    replace: `            Statistics sb = statistics(idB, name, null, null, weightedBy, domain);`,
  },
  {
    id: 'D19-compare-filter-dropped',
    kind: 'backend',
    describes: 'The comparison endpoint accepts the condition and never passes it on. '
      + 'Every screen still sends it, the coverage list still calls the endpoint '
      + 'honoured, and the table answers about the whole drive.',
    file: 'backend/src/main/java/com/vdt/analyzer/api/AnalysisController.java',
    find: `        return analysis.compare(a, b, kpis, weightedBy, domain, filter);`,
    replace: `        return analysis.compare(a, b, kpis, weightedBy, domain);`,
  },
  {
    id: 'D20-issues-partial-scope',
    kind: 'backend',
    describes: 'Two of the three coverage detectors honour the condition and the third '
      + 'does not. The total drops, so the screen looks narrowed, while its overshoot '
      + 'answer is still about the whole drive.',
    file: 'backend/src/main/java/com/vdt/analyzer/service/GeoAnalysisService.java',
    // Blanking only the SQL left the parameters bound and the query threw - which crashes
    // the endpoint rather than answering it wrongly, and a crash is a different defect
    // from the one under test (1.5.9). Nulling the scope removes it from the clause AND
    // from the bind list, so the query runs and returns a plausible list.
    find: `        GlobalFilter.Scope overshootScope = GlobalFilter.scope(filterSpec, sessionId, "s");`,
    replace: `        GlobalFilter.Scope overshootScope = null;`,
  },
  {
    id: 'D21-weak-coverage-unscoped',
    kind: 'backend',
    describes: 'The weak-coverage detector ignores the condition while the other two '
      + 'honour it. The total still drops, so the screen looks narrowed, and its longest '
      + 'interval spans ground the condition excluded.',
    file: 'backend/src/main/java/com/vdt/analyzer/service/GeoAnalysisService.java',
    find: `        GlobalFilter.Scope weakScope = GlobalFilter.scope(filterSpec, sessionId, "k");`,
    replace: `        GlobalFilter.Scope weakScope = null;`,
  },
]

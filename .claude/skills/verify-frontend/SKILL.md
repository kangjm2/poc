---
name: verify-frontend
description: Verify the VDT analyzer frontend after any change — run the three checkers (feature checks, scenario journeys, API-surface coverage), interpret failures, and add new assertions the validated way. Use whenever frontend/ or backend API code changed, before committing UI work, or when asked to test/verify the UI.
---

# Frontend verification for this repository

Three checkers, each catching a different failure class. Run all three before
committing UI-affecting work; a change is not "verified" until all pass.

| Checker | Catches | Cost |
|---|---|---|
| `node scripts/verify-ui.mjs` | Individual behaviour regressions (30 checks) | ~60s |
| `node scripts/verify-scenarios.mjs` | Broken user journeys — steps carry state (49 steps, 8 scenarios) | ~90s |
| `node tools/uxtest/api-surface.mjs` | Logic-without-view: endpoints or client methods nothing renders | ~5s |

## Service lifecycle (required before browser checks)

```
sudo service postgresql start          # container idle kills it; check first
./scripts/backend.sh start             # pid-file based; NEVER pgrep-kill
./scripts/frontend.sh start            # serves the BUILT app on :4173
```

Frontend changes need a rebuild before they are visible to the checkers:
`cd frontend && npx tsc --noEmit && npm run build`, then restart frontend.sh.
Backend/seed changes need `cd backend && mvn -B -q package -DskipTests`,
restart backend.sh; seed changes additionally need a DB drop
(`sudo -u postgres psql -c 'DROP DATABASE vdt;' -c 'CREATE DATABASE vdt OWNER vdt;'`)
before the restart.

## Interpreting failures

- **Basemap tile errors are environmental** (sandbox blocks tile.openstreetmap.org);
  both browser scripts already filter them out of the console-error check. Do not
  chase them.
- A scenario step failure means the *journey* is broken at that point — read the
  steps above it in the same scenario; the failing step often only inherits bad
  state from an earlier UI change (e.g. a workbook that was never switched back).
- `api-surface.mjs` failing means something was added on one side only. Fix by
  wiring the UI (preferred) or deleting the dead endpoint/method — never by
  weakening the checker.

## Adding assertions — the validated rules

These came out of defect-injection experiments measured on this repo
(docs/ui-testing/README.md); follow them or the new check is decoration:

1. **Prove the assertion can fail.** Temporarily break the behaviour (edit the
   component, or reuse a mutation from `tools/uxtest/defects.mjs`) and watch the
   new check go red before trusting its green. A legend check that only tested
   for a `%` character passed with the entire statistics column deleted.
2. **Route coverage beats signal choice.** A cheap assertion on a route you
   actually visit outperforms an expensive signal on a route you never open.
   New views/workbooks get a step in `verify-scenarios.mjs`, not just a render check.
3. **Assert user-visible outcomes, not implementation.** Count rows, match
   rendered values against API responses (`legend Total === sampleCount`),
   check severity classes — not internal state.
4. **Typecheck catches zero logic-without-view defects.** `tsc --noEmit` is
   necessary but proves nothing about wiring; that is api-surface.mjs's job.

## Gotchas that already cost debugging time here

- SVG `<text>` returns `null` from `allInnerTexts()` — use
  `evaluateAll((ts) => ts.map((t) => t.textContent))`.
- Selectors use **display names** ("RSRP (NR SpCell)", "MAC downlink throughput",
  "CUS RX late"), not internal KPI names. Check `/api/kpi-definitions` first.
- Never wait on `networkidle` — blocked tile requests keep the network busy and
  a 202ms render once measured as "32s". Use `domcontentloaded` + explicit waits.
- Chromium launch needs the agent proxy with localhost bypass:
  `proxy: { server: HTTPS_PROXY, bypass: 'localhost,127.0.0.1,::1' }`, executable
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- Playwright probe scripts must live under the repo root (or `scripts/`) so the
  `playwright` package resolves — `/tmp` scratch locations cannot import it.
- Defect-injection experiments snapshot file bytes in memory and restore them —
  never `git checkout --` as a revert; it destroys uncommitted work.

## Token-frugal signal ladder (when driving the browser as an agent)

Cheapest first: (1) runtime probe / API diff, (2) DOM text of the one panel under
test, (3) `locator.ariaSnapshot({ depth: 3 })` — default mode saturates at depth 3
on this UI, (4) screenshot only when geometry/colour is the question (image cost
is `⌈w/28⌉ × ⌈h/28⌉` tokens; a 1680×1000 shot ≈ 2.2k tokens).

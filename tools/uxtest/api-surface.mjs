/**
 * Finds backend capability that never reaches the user.
 *
 * The failure this targets: logic ships, the view does not, and nothing fails.
 * Type checking cannot see it (the types are fine), and end-to-end tests cannot
 * see it (nobody wrote a test for a screen that does not exist). What does see it
 * is comparing what the server can do against what the client actually renders.
 *
 * Three checks, cheapest first:
 *   1. every REST endpoint the server exposes is called by the API client
 *   2. every API client method is called by some component
 *   3. every KPI the server defines is reachable in the running UI
 *
 * Output is a short list of gaps, not a dump - the point is to stay affordable
 * enough to run on every change.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { chromiumPath } from './browser.mjs'
import { join } from 'node:path'

const API = process.env.API ?? 'http://127.0.0.1:8080/api'
const SRC = 'frontend/src'
const CONTROLLERS = 'backend/src/main/java/com/vdt/analyzer'

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const read = (f) => readFileSync(f, 'utf8')
const srcFiles = walk(SRC).filter((f) => /\.tsx?$/.test(f))
const javaFiles = walk(CONTROLLERS).filter((f) => f.endsWith('.java'))

// ---------------------------------------------------------------- 1. endpoints
const mappings = []
for (const f of javaFiles) {
  const text = read(f)
  const base = (text.match(/@RequestMapping\("([^"]+)"\)/) ?? [])[1] ?? ''
  for (const m of text.matchAll(/@(Get|Post|Put|Delete)Mapping\((?:path\s*=\s*)?"([^"]*)"/g)) {
    mappings.push({ method: m[1].toUpperCase(), path: (base + m[2]).replace(/\/+$/, '') || base })
  }
  for (const m of text.matchAll(/@(Get|Post|Put|Delete)Mapping\s*\n?\s*(?=public)/g)) {
    mappings.push({ method: m[1].toUpperCase(), path: base })
  }
}

const clientText = srcFiles.filter((f) => f.includes('/api/')).map(read).join('\n')

/**
 * The whole path shape, not just its last word.
 *
 * This used to test `clientText.includes(tail)` - the endpoint's final literal segment,
 * as a bare substring of the entire client file. Two unrelated endpoints ending in the
 * same word therefore covered for each other, and one did: nothing called
 * `POST /kpi-definitions/graphs/{id}/recompute`, and the check passed anyway because a
 * DIFFERENT URL a few lines away contains the word "recompute". A checker that can be
 * satisfied by a coincidence in another line is not checking the thing it names.
 *
 * The shape is built from the endpoint's own segments: literals are matched literally,
 * `{var}` matches whatever the client interpolates there. The client's BASE is `/api`,
 * so that prefix is dropped before matching.
 */
const pathShape = (path) => new RegExp(
  path.replace(/^\/api/, '')
      .split('/')
      .filter(Boolean)
      .map((seg) => (seg.startsWith('{') ? '[^/`\'"\\s]+' : seg.replace(/[.*+?^$()|[\]\\]/g, '\\$&')))
      .map((seg) => '/' + seg)
      .join('')
  // End-anchored, or `/sessions/{id}` matches inside `/sessions/{id}/track`.
  //
  // Two wrong versions before this one. `(?!/)` does nothing: the preceding
  // `[^/`'"\s]+` gives back a character and the guard passes. Rejecting every non-path
  // character is too strong the other way, because a client path is usually followed by
  // `${...}` interpolation or a `?query` - so the lookahead rejects exactly what could
  // CONTINUE a segment, and nothing else.
  + '(?![A-Za-z0-9_.\\-])')

/**
 * Which HTTP methods the client actually uses at a given path shape.
 *
 * The check used to discard the verb entirely, so `GET /sessions/{id}` counted as reached
 * because `DELETE /sessions/{id}` is called - two different operations sharing a path
 * covering for each other, which is the same defect the path shape above was written to
 * fix, one level down.
 *
 * Only two call forms exist in the client and both are read here: `get<T>(`...`)`, which is
 * a GET, and `fetch(`${BASE}...`, { method: 'X' })`, where the verb follows the path.
 */
const methodsAtPath = (path) => {
  const re = new RegExp(pathShape(path).source, 'g')
  const found = new Set()
  for (const m of clientText.matchAll(re)) {
    // The CALL SITE decides, and the window is bounded to the client method the path is
    // written inside. Both halves were wrong before: reading `method:` FORWARDS first ran
    // past the end of the current method and borrowed the next one's verb, and reading
    // backwards without a bound let one method's `get<` vouch for the next method's path.
    // A 200-character window is not a scope; the property declaration is.
    const raw = clientText.slice(Math.max(0, m.index - 400), m.index)
    const boundary = [...raw.matchAll(/\n {2}\w+:/g)].pop()
    const before = boundary ? raw.slice(boundary.index) : raw
    const iGet = before.lastIndexOf('get<')
    const iFetch = before.lastIndexOf('fetch(')
    if (iFetch > iGet) {
      // Its verb is in the options object after the path; a fetch with no method is a GET.
      const verb = clientText.slice(m.index, m.index + 260)
        .match(/method:\s*'(GET|POST|PUT|DELETE|PATCH)'/)
      found.add(verb ? verb[1] : 'GET')
    } else if (iGet >= 0) {
      found.add('GET')
    } else if (before.includes('${BASE}')) {
      // A URL builder: the path is handed to an <a href>, and the browser GETs it when the
      // reader clicks. `exportUrl` and `reportUrl` are the two, and they were reported as
      // uncalled because the checker only knew two shapes of call and this is a third.
      found.add('GET')
    }
  }
  return found
}

/**
 * Endpoints no client method calls ON PURPOSE, named with the reason.
 *
 * Kept as a list rather than as silence, for the reason `GlobalFilter.coverage()` gives
 * about its own exemptions: an unexplained absence is indistinguishable from a screen - or
 * here a client - that simply forgot. An entry that stops being true is then a line someone
 * can read, not a check that quietly passes.
 */
const NOT_CALLED_BY_THE_APP = [
  { method: 'GET', path: '/api/sessions/{id}',
    why: 'the app reads the whole list (api.sessions) and never one drive by id;'
       + ' verify-scenarios uses it to read sampleCount independently of any screen' },
]

const unreachedEndpoints = mappings.filter(({ method, path }) => {
  const segs = path.replace(/^\/api/, '').split('/').filter(Boolean)
  if (segs.length === 0) return false
  if (NOT_CALLED_BY_THE_APP.some((e) => e.method === method && e.path === path)) return false
  return !methodsAtPath(path).has(method)
})

// -------------------------------------------------------- 2. client methods
const componentText = srcFiles.filter((f) => !f.includes('/api/')).map(read).join('\n')
const clientMethods = [...clientText.matchAll(/^\s{2}(\w+):\s*(?:\(|async)/gm)].map((m) => m[1])
const unusedClientMethods = clientMethods.filter((name) => !componentText.includes(`api.${name}(`))

// ------------------------------------------------------------------ 3. KPIs
let kpiGaps = []
let renderedNote = ''
let probeFailed = false
try {
  const defs = await (await fetch(`${API}/kpi-definitions`)).json()
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    proxy: process.env.HTTPS_PROXY
      ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1,::1' } : undefined,
  })
  const page = await browser.newPage()
  await page.goto(process.env.BASE ?? 'http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.tree', { timeout: 20000 })
  await page.waitForTimeout(2000)
  const rendered = await page.locator('.dock .tree').innerText()
  await browser.close()
  kpiGaps = defs.filter((d) => !rendered.includes(d.displayName))
    .map((d) => `${d.name} (${d.displayName}, category ${d.category})`)
  renderedNote = `${defs.length} defined, ${defs.length - kpiGaps.length} reachable in the tree`
} catch (e) {
  // A probe that could not run is a gap, not a pass. This used to leave `kpiGaps` empty,
  // so the script printed "no gaps" and exited 0 having run two of its three checks - the
  // failure mode being that the one check needing a browser is exactly the one that stops
  // working first.
  probeFailed = true
  renderedNote = `could not probe the running UI: ${e.message}`
}

// ---------------------------------------------------------------- report
const problems =
  unreachedEndpoints.length + unusedClientMethods.length + kpiGaps.length
  + (probeFailed ? 1 : 0)

console.log('API surface coverage')
console.log(`  endpoints declared:      ${mappings.length}`)
console.log(`  client methods declared: ${clientMethods.length}`)
console.log(`  KPI reachability:        ${renderedNote}`)
if (unreachedEndpoints.length) {
  console.log('\n  endpoints no client method calls:')
  for (const e of unreachedEndpoints) console.log(`    ${e.method} ${e.path}`)
}
if (unusedClientMethods.length) {
  console.log('\n  client methods no component calls:')
  for (const m of unusedClientMethods) console.log(`    api.${m}()`)
}
if (kpiGaps.length) {
  console.log('\n  KPIs defined server-side but not reachable in the UI:')
  for (const k of kpiGaps) console.log(`    ${k}`)
}
if (NOT_CALLED_BY_THE_APP.length) {
  console.log('\n  not called by the app, on purpose:')
  for (const e of NOT_CALLED_BY_THE_APP) console.log(`    ${e.method} ${e.path} - ${e.why}`)
}
if (probeFailed) console.log('\n  the KPI reachability probe did not run: 2 of 3 checks ran')
console.log(`\n${problems === 0 ? 'no gaps' : `${problems} gap(s)`}`)
process.exit(problems === 0 ? 0 : 1)

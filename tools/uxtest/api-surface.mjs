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
const unreachedEndpoints = mappings.filter(({ path }) => {
  // Compare on the literal segments, ignoring path variables.
  const segs = path.split('/').filter((s) => s && !s.startsWith('{'))
  const tail = segs[segs.length - 1]
  return tail ? !clientText.includes(tail) : false
})

// -------------------------------------------------------- 2. client methods
const componentText = srcFiles.filter((f) => !f.includes('/api/')).map(read).join('\n')
const clientMethods = [...clientText.matchAll(/^\s{2}(\w+):\s*(?:\(|async)/gm)].map((m) => m[1])
const unusedClientMethods = clientMethods.filter((name) => !componentText.includes(`api.${name}(`))

// ------------------------------------------------------------------ 3. KPIs
let kpiGaps = []
let renderedNote = ''
try {
  const defs = await (await fetch(`${API}/kpi-definitions`)).json()
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
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
  renderedNote = `could not probe the running UI: ${e.message}`
}

// ---------------------------------------------------------------- report
const problems =
  unreachedEndpoints.length + unusedClientMethods.length + kpiGaps.length

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
console.log(`\n${problems === 0 ? 'no gaps' : `${problems} gap(s)`}`)
process.exit(problems === 0 ? 0 : 1)

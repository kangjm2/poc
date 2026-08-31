/**
 * Collects each candidate verification signal from the running app and reports its
 * size, so the cost of a feedback format can be compared rather than assumed.
 *
 * The question this answers: when an agent needs to know whether the UI is correct,
 * what is the cheapest representation that still carries the answer?
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173'
const OUT = process.env.OUT ?? '/tmp/uxsignals'
mkdirSync(OUT, { recursive: true })

export async function openApp() {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    proxy: process.env.HTTPS_PROXY
      ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1,::1' }
      : undefined,
  })
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  const runtime = { consoleErrors: [], pageErrors: [], failedRequests: [] }
  page.on('console', (m) => { if (m.type() === 'error') runtime.consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => runtime.pageErrors.push(String(e)))
  page.on('requestfailed', (r) => {
    // Blocked map tiles are an environment limitation, not an app defect.
    if (!/tile\./.test(r.url())) {
      runtime.failedRequests.push(`${r.url()} ${r.failure()?.errorText}`)
    }
  })
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.statusbar', { timeout: 20000 })
  await page.waitForTimeout(2500)
  return { browser, page, runtime }
}

/** S1 - runtime error capture. Near-zero cost, catches only thrown errors. */
export function runtimeSignal(runtime) {
  return JSON.stringify(runtime, null, 1)
}

/** S2 - visible text of the whole page. */
export async function domTextSignal(page) {
  return page.locator('body').innerText()
}

/**
 * S3 - ARIA snapshot: structure plus accessible names, without styling or layout.
 *
 * The API is locator.ariaSnapshot(), which returns compact YAML. The older
 * page.accessibility.snapshot() namespace no longer exists - it is undefined in
 * Playwright 1.62.1, so code written against it fails at runtime rather than
 * degrading. Same idea, different and much cheaper serialisation.
 */
export async function ariaSignal(page) {
  return page.locator('body').ariaSnapshot()
}

/**
 * S4 - targeted structural digest. Not a Playwright primitive: a hand-written
 * projection of the things this app's correctness actually depends on.
 */
export async function digestSignal(page) {
  return page.evaluate(() => {
    const txt = (el) => (el?.textContent ?? '').trim().replace(/\s+/g, ' ')
    return JSON.stringify({
      modes: [...document.querySelectorAll('.mode-tabs button')].map(txt),
      workbooks: [...document.querySelectorAll('.workbook-tabs button')].map(txt),
      panels: [...document.querySelectorAll('.panel > header .title')].map(txt),
      treeCategories: [...document.querySelectorAll('.tree .cat')].map(txt),
      treeKpiCount: document.querySelectorAll('.tree .kpi').length,
      legendRows: [...document.querySelectorAll('.legend-row')].map(txt),
      severityCells: {
        critical: document.querySelectorAll('td.sev-CRITICAL').length,
        warning: document.querySelectorAll('td.sev-WARNING').length,
      },
      routeSegments: document.querySelectorAll('path.leaflet-interactive').length,
      statusbar: txt(document.querySelector('.statusbar')),
      gridRowCount: document.querySelectorAll('table.grid tbody tr').length,
    }, null, 1)
  })
}

/**
 * S4b - the same digest, collected across every workbook page.
 *
 * A signal only sees what is currently rendered. In the first experiment run no
 * detector caught a dead workbook page, because every probe looked at the default
 * page only. Route coverage, not signal choice, was the thing missing.
 */
export async function digestAllRoutesSignal(page) {
  const tabs = await page.locator('.workbook-tabs button').allInnerTexts()
  const out = []
  for (const tab of tabs) {
    await page.locator('.workbook-tabs button', { hasText: tab }).first().click()
    await page.waitForTimeout(700)
    const panels = await page.locator('.panel > header .title').allInnerTexts()
    const rows = await page.locator('table.grid tbody tr').count()
    out.push(`${tab}: panels=[${panels.join(' | ')}] rows=${rows}`)
  }
  return out.join('\n')
}

/** S5 - full-page screenshot. */
export async function screenshotSignal(page, name) {
  const path = `${OUT}/${name}.png`
  await page.screenshot({ path })
  return path
}

/**
 * Visual-token cost of an image for Claude, per the documented rule:
 *
 *   "Claude views images in patches instead of pixels. Each patch is a 28x28-pixel
 *    block of the image, referred to as a visual token. An image, therefore, costs
 *    ceil(width / 28) x ceil(height / 28) visual tokens."
 *
 * Two resolution tiers apply, and an image over either limit is downscaled first:
 *   high-resolution (Claude 4.7 and later): long edge 2576 px, 4784 visual tokens
 *   standard        (all other models):     long edge 1568 px, 1568 visual tokens
 *
 * Source: https://platform.claude.com/docs/en/build-with-claude/vision
 */
const TIERS = {
  high: { maxEdge: 2576, maxTokens: 4784 },
  standard: { maxEdge: 1568, maxTokens: 1568 },
}

function patchTokens(w, h) {
  return Math.ceil(w / 28) * Math.ceil(h / 28)
}

export function imageTokens(width, height, tier = 'high') {
  const { maxEdge, maxTokens } = TIERS[tier]
  const fits = (scale) => {
    const w = Math.round(width * scale)
    const h = Math.round(height * scale)
    return Math.max(w, h) <= maxEdge && patchTokens(w, h) <= maxTokens
  }
  if (fits(1)) {
    return { w: width, h: height, tokens: patchTokens(width, height), tier }
  }
  // Largest scale that satisfies both the long-edge and visual-token limits.
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid; else hi = mid
  }
  const w = Math.round(width * lo)
  const h = Math.round(height * lo)
  return { w, h, tokens: patchTokens(w, h), tier }
}

/** Rough text-token estimate. Deliberately labelled as an estimate, not a measurement. */
export function textTokensApprox(s) {
  return Math.round(s.length / 4)
}

export { OUT }

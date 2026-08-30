/**
 * Baseline: how large is each verification signal for this app?
 *
 * Bytes are measured exactly. Image visual tokens follow Anthropic's documented
 * patch formula and are exact. Text token counts are ESTIMATES (chars/4) - this
 * environment has no API credentials, so messages.count_tokens is unavailable.
 * The ratios between signals are what the comparison rests on, and bytes carry
 * those reliably.
 */
import {
  openApp, runtimeSignal, domTextSignal, ariaSignal, digestSignal,
  screenshotSignal, imageTokens, textTokensApprox,
} from './signals.mjs'
import { statSync } from 'node:fs'


const { browser, page, runtime } = await openApp()

const rows = []
const add = (name, text, note) => rows.push({
  name, bytes: Buffer.byteLength(text, 'utf8'),
  tokens: textTokensApprox(text), exact: false, note,
})

add('S1 runtime errors', runtimeSignal(runtime), 'console + pageerror + failed requests')
add('S2 DOM innerText', await domTextSignal(page), 'all visible text on the page')
add('S3 aria snapshot', await ariaSignal(page), 'locator.ariaSnapshot() YAML')
add('S4 structural digest', await digestSignal(page), 'hand-written projection')

const shot = await screenshotSignal(page, 'baseline')
const size = statSync(shot).size
const { w, h, tokens } = imageTokens(1680, 1000, 'high')
rows.push({
  name: 'S5 screenshot', bytes: size, tokens, exact: true,
  note: `1680x1000 -> ${w}x${h}, patch formula`,
})

// A single failing assertion line, which is what a well-designed check actually returns.
add('S6 assertion result', 'FAIL  shared time cursor - CURRENT did not change  (09:15:18 -> 09:15:18)',
  'one failed check')

console.log(`${'signal'.padEnd(24)}${'bytes'.padStart(9)}${'tokens'.padStart(9)}  ${'kind'.padEnd(10)} note`)
for (const r of rows) {
  console.log(
    `${r.name.padEnd(24)}${String(r.bytes).padStart(9)}${String(r.tokens).padStart(9)}  ` +
    `${(r.exact ? 'exact' : 'estimate').padEnd(10)} ${r.note}`)
}
const shotRow = rows.find((r) => r.name.startsWith('S5'))
console.log('\nrelative to one screenshot (%d visual tokens):', shotRow.tokens)
for (const r of rows) {
  if (r === shotRow) continue
  console.log(`  ${r.name.padEnd(24)} ${(shotRow.tokens / Math.max(1, r.tokens)).toFixed(1)}x cheaper`)
}
await browser.close()

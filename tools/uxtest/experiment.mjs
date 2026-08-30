/**
 * Injects each defect, runs every detector against it, and records whether the
 * detector caught it and how much feedback it produced.
 *
 * Cost without detection power is meaningless, so the two are measured together.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { DEFECTS } from './defects.mjs'
import {
  openApp, runtimeSignal, domTextSignal, ariaSignal, digestSignal, textTokensApprox,
} from './signals.mjs'

const sh = (cmd, args, opts = {}) => {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', timeout: 600000, ...opts }) }
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` || String(e.message) }
  }
}

const buildFrontend = () => sh('npm', ['run', 'build'], { cwd: 'frontend', stdio: 'pipe' })
const typecheck = () => sh('npx', ['tsc', '-b', '--force'], { cwd: 'frontend', stdio: 'pipe' })

/** Collects every signal from a freshly loaded page. */
async function probe() {
  const { browser, page, runtime } = await openApp()
  const out = {
    runtime: runtimeSignal(runtime),
    dom: await domTextSignal(page),
    aria: await ariaSignal(page),
    digest: await digestSignal(page),
  }
  await browser.close()
  return out
}

const lineDiff = (a, b) => {
  const A = a.split('\n')
  const B = new Set(b.split('\n'))
  const removed = A.filter((l) => !B.has(l))
  const Bs = b.split('\n')
  const As = new Set(A)
  const added = Bs.filter((l) => !As.has(l))
  return [...removed.map((l) => `- ${l}`), ...added.map((l) => `+ ${l}`)].join('\n')
}

console.log('=== establishing the noise floor: two baseline probes of an unmodified app ===')
const base1 = await probe()
const base2 = await probe()
for (const k of ['runtime', 'dom', 'aria', 'digest']) {
  const d = lineDiff(base1[k], base2[k])
  console.log(`  ${k.padEnd(8)} baseline-vs-baseline diff: ${d ? `${d.split('\n').length} lines - NOISY` : 'identical'}`)
}

const results = []
for (const defect of DEFECTS) {
  console.log(`\n=== ${defect.id} (${defect.kind}) ===`)
  const applied = sh('node', ['tools/uxtest/inject.mjs', 'apply', defect.id])
  if (!applied.ok) { console.log('  SKIP: could not apply -', applied.out.trim()); continue }

  const tc = typecheck()
  const build = buildFrontend()
  const row = { id: defect.id, kind: defect.kind, detectors: {} }

  row.detectors.typecheck = {
    caught: !tc.ok,
    bytes: tc.ok ? 0 : Buffer.byteLength(tc.out),
  }

  if (!build.ok) {
    row.detectors.build = { caught: true, bytes: Buffer.byteLength(build.out) }
    console.log('  build FAILED (defect is a compile error)')
  } else {
    row.detectors.build = { caught: false, bytes: 0 }
    const cur = await probe()
    for (const [name, key] of [['runtime', 'runtime'], ['domText', 'dom'],
                               ['aria', 'aria'], ['digest', 'digest']]) {
      const d = lineDiff(base1[key], cur[key])
      row.detectors[name] = { caught: d.length > 0, bytes: Buffer.byteLength(d) }
    }
    const suite = sh('node', ['scripts/verify-ui.mjs'])
    const failures = suite.out.split('\n').filter((l) => l.startsWith('FAIL'))
    row.detectors.assertions = {
      caught: failures.length > 0,
      bytes: Buffer.byteLength(failures.join('\n')),
      detail: failures.slice(0, 2).join(' | ').slice(0, 160),
    }
  }

  results.push(row)
  for (const [n, r] of Object.entries(row.detectors)) {
    console.log(`  ${n.padEnd(11)} ${r.caught ? 'CAUGHT' : '  miss'}  ${String(r.bytes).padStart(7)} B`
      + (r.detail ? `  ${r.detail}` : ''))
  }

  sh('git', ['checkout', '--', defect.file])
}

buildFrontend()
writeFileSync('/tmp/uxexperiment.json', JSON.stringify(results, null, 2))
console.log('\nresults written to /tmp/uxexperiment.json')

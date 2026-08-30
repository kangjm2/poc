/** Applies or reverts one defect by exact string replacement. */
import { readFileSync, writeFileSync } from 'node:fs'
import { DEFECTS } from './defects.mjs'

const [, , action, id] = process.argv
const defect = DEFECTS.find((d) => d.id === id)
if (!defect) {
  console.error(`unknown defect: ${id}\nknown: ${DEFECTS.map((d) => d.id).join(', ')}`)
  process.exit(2)
}
const src = readFileSync(defect.file, 'utf8')

if (action === 'apply') {
  if (!src.includes(defect.find)) {
    console.error(`anchor not found in ${defect.file} - source has moved`)
    process.exit(3)
  }
  writeFileSync(defect.file, src.replace(defect.find, defect.replace))
  console.log(`applied ${defect.id}`)
} else if (action === 'revert') {
  if (!src.includes(defect.replace) || defect.replace === '') {
    // An empty replacement cannot be located; fall back to git.
    console.log('revert via git checkout')
    process.exit(4)
  }
  writeFileSync(defect.file, src.replace(defect.replace, defect.find))
  console.log(`reverted ${defect.id}`)
} else {
  console.error('usage: inject.mjs apply|revert <defect-id>')
  process.exit(2)
}

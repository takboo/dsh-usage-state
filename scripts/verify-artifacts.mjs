import assert from 'node:assert/strict'
import { lstatSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { ROOT, command, packageJson, publishedFiles } from './verify-support.mjs'

const manifest = packageJson()
const expected = publishedFiles(manifest)
for (const file of expected) {
  assert.ok(lstatSync(path.join(ROOT, file)).isFile(), `required published file is missing or not regular: ${file}`)
}
const expectedLib = [...expected].filter(file => file.startsWith('lib/')).sort()
const actualLib = []
function walk(dir) {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const file = path.posix.join(dir, entry.name)
    if (entry.isDirectory()) walk(file)
    else {
      assert.ok(entry.isFile(), `lib contains a non-regular file: ${file}`)
      actualLib.push(file)
    }
  }
}
walk('lib')
assert.deepEqual(actualLib.sort(), expectedLib, 'lib contains undeclared files')
for (const file of expectedLib) command('git', ['ls-files', '--error-unmatch', '--', file])
const untracked = command('git', ['ls-files', '--others', '--exclude-standard', '--', 'lib']).trim()
assert.equal(untracked, '', `untracked generated artifacts: ${untracked}`)
const drift = command('git', ['diff', '--name-only', 'HEAD', '--', 'lib']).trim()
assert.equal(drift, '', `generated artifacts differ from the committed baseline: ${drift}. Rebuild, review and commit the source and artifacts together; do not hide this drift.`)
console.log(`Committed artifacts verified (${expectedLib.length} bundles). Run this after build to detect source/artifact drift.`)

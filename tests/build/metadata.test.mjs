import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, packageJson, publishedFiles, verifyIcon } from '../../scripts/verify-support.mjs'

test('the published plugin exports its own nonempty SVG icon', () => {
  const manifest = packageJson()
  assert.equal(manifest.exports['./icon'], './icon.svg')
  assert.ok(publishedFiles(manifest).has('icon.svg'))
  const bytes = readFileSync(path.join(ROOT, 'icon.svg'))
  assert.ok(bytes.length > 0 && bytes.length <= 256 * 1024)
  verifyIcon(manifest, file => readFileSync(path.join(ROOT, file)))
})

test('icon verification rejects missing exports, omitted assets and invalid envelope or size', () => {
  const manifest = { exports: { './icon': './icon.svg' }, files: ['icon.svg', 'cordis.patch.yml'], dsh: { bundle: { patch: './cordis.patch.yml' } } }
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"></svg>')
  verifyIcon(manifest, () => svg)
  assert.throws(() => verifyIcon({ ...manifest, exports: {} }, () => svg), /icon export missing/)
  assert.throws(() => verifyIcon({ ...manifest, files: ['cordis.patch.yml'] }, () => svg), /export not declared in files/)
  for (const bytes of [undefined, Buffer.alloc(0), Buffer.alloc(256 * 1024 + 1)]) {
    assert.throws(() => verifyIcon(manifest, () => bytes), /nonempty and at most 256 KiB/)
  }
  assert.throws(() => verifyIcon(manifest, () => Buffer.from('<html>not an icon</html>')), /SVG document envelope/)
})

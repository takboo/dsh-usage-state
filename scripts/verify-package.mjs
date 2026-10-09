import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { ROOT, SEMVER, command, npm, packageJson, publishedFiles, relativeFile } from './verify-support.mjs'

const { values } = parseArgs({ options: {
  'out-dir': { type: 'string' }, tarball: { type: 'string' },
  'expected-version': { type: 'string' }, 'expected-commit': { type: 'string' },
  'require-report': { type: 'boolean', default: false },
} })
const sourceManifest = packageJson()
let tarball
if (values.tarball) tarball = path.resolve(values.tarball)
else {
  const out = values['out-dir'] ? path.resolve(values['out-dir']) : mkdtempSync(path.join(tmpdir(), 'dsh-usage-state-pack-'))
  mkdirSync(out, { recursive: true })
  const filename = `${sourceManifest.name.replace('/', '-')}-${sourceManifest.version}.tgz`
  assert.ok(!existsSync(path.join(out, filename)), 'refusing to overwrite an existing tarball; verify it with --tarball')
  const result = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', out]))
  assert.equal(result.length, 1, 'expected one tarball')
  tarball = path.join(out, result[0].filename)
}
assert.ok(existsSync(tarball), `tarball missing: ${tarball}`)
const archive = command('tar', ['-tzf', tarball]).trim().split('\n')
const files = new Map()
for (const entry of archive) {
  assert.ok(entry.startsWith('package/'), `unexpected archive root: ${entry}`)
  const file = relativeFile(entry.slice(8), 'tar entry')
  if (entry.endsWith('/')) continue
  assert.ok(!files.has(file), `duplicate tar entry: ${file}`)
  // -O reads bytes without extracting any archive path to the filesystem.
  files.set(file, command('tar', ['-xOzf', tarball, entry], { encoding: 'buffer' }))
}
const manifest = JSON.parse(files.get('package.json')?.toString('utf8') ?? 'null')
assert.ok(manifest, 'tarball package.json missing')
assert.equal(manifest.name, sourceManifest.name, 'tarball package name differs')
assert.deepEqual(manifest.repository, sourceManifest.repository, 'tarball repository differs')
assert.match(manifest.version, SEMVER)
if (values['expected-version']) assert.equal(manifest.version, values['expected-version'], 'tarball version differs from release tag')
if (!values.tarball) assert.equal(manifest.version, sourceManifest.version)
assert.deepEqual([...files.keys()].sort(), [...publishedFiles(manifest)].sort(), 'tarball differs from explicit publication whitelist')
for (const [file, bytes] of files) assert.ok(bytes.length > 0, `published file is empty: ${file}`)
const patch = files.get(relativeFile(manifest.dsh.bundle.patch, 'bundle patch')).toString('utf8')
assert.match(patch, /-\s*insert:/, 'bundle patch must insert the plugin entry')
assert.match(patch, /id:\s*usage-state\b/, 'bundle patch settings namespace differs')
assert.ok(patch.includes(`name: ${manifest.name}`), 'bundle patch references a different package')
assert.match(patch, /config:\s*\{\}/, 'bundle patch must initialize its config')
assert.match(files.get('lib/client.js').toString('utf8'), /window\.__ModuleLoader__\.load\(/, 'client module-loader envelope missing')

const withoutCode = text => text.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '')
const headingIds = text => {
  const ids = new Set(), counts = new Map()
  for (const match of withoutCode(text).matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const base = match[1].toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '').replace(/ /g, '-')
    const count = counts.get(base) ?? 0
    counts.set(base, count + 1)
    ids.add(count ? `${base}-${count}` : base)
  }
  for (const match of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) ids.add(match[1])
  return ids
}
let markdownLinks = 0
for (const [file, bytes] of files) {
  if (!file.endsWith('.md')) continue
  const text = withoutCode(bytes.toString('utf8'))
  const urls = [...text.matchAll(/\]\(([^)\n]+)\)/g), ...text.matchAll(/^\[[^\]]+\]:\s*(\S+)/gm)].map(match => match[1])
  for (let url of urls) {
    url = url.replace(/^<|>$/g, '').split(/\s+["']/)[0]
    if (/^(?:https?:|mailto:|data:)/.test(url)) continue
    markdownLinks++
    const [target, anchor] = url.split('#')
    const dest = target ? path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(target))) : file
    assert.ok(files.has(dest), `${file} links to missing packed file: ${url}`)
    if (anchor && dest.endsWith('.md')) assert.ok(headingIds(files.get(dest).toString('utf8')).has(decodeURIComponent(anchor)), `${file} has missing packed anchor: ${url}`)
  }
}
const sha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex')
const checksum = `${tarball}.sha256`
const reportFile = path.join(path.dirname(tarball), 'verification.json')
const sourceCommit = command('git', ['rev-parse', 'HEAD']).trim()
if (values['require-report']) {
  assert.ok(existsSync(checksum) && existsSync(reportFile), 'validated checksum and report are required')
  const report = JSON.parse(readFileSync(reportFile, 'utf8'))
  assert.equal(report.sha256, sha256, 'tarball changed after verification')
  assert.equal(report.filename, path.basename(tarball), 'verification report filename differs')
  assert.equal(report.name, manifest.name)
  assert.equal(report.version, manifest.version)
  assert.equal(report.workingTreeDirty, false, 'release artifact must come from a clean verified checkout')
  if (values['expected-commit']) assert.equal(report.sourceCommit, values['expected-commit'], 'artifact commit differs from trusted tag')
  assert.equal(readFileSync(checksum, 'utf8'), `${sha256}  ${path.basename(tarball)}\n`, 'checksum file differs')
} else {
  assert.equal(values['expected-commit'], undefined, '--expected-commit requires --require-report')
  const workingTreeDirty = command('git', ['status', '--porcelain', '--untracked-files=all']).trim() !== ''
  writeFileSync(checksum, `${sha256}  ${path.basename(tarball)}\n`)
  writeFileSync(reportFile, JSON.stringify({ schemaVersion: 1, name: manifest.name, version: manifest.version, filename: path.basename(tarball), sha256, sourceCommit, workingTreeDirty }, null, 2) + '\n')
}
console.log(JSON.stringify({ tarball, checksum, report: reportFile, files: files.size, markdownLinks, sha256, version: manifest.version }, null, 2))

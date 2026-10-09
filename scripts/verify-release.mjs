import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { SEMVER, command, readJson } from './verify-support.mjs'

const { values } = parseArgs({ options: {
  tag: { type: 'string' }, base: { type: 'string', default: 'origin/main' },
  'github-output': { type: 'boolean', default: false },
  'require-unpublished': { type: 'boolean', default: false },
  'artifact-report': { type: 'string' },
} })
assert.ok(values.tag?.startsWith('v') && SEMVER.test(values.tag.slice(1)), 'tag must be v<SemVer>')
assert.match(values.tag, /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/, 'this workflow supports only stable release tags v<major>.<minor>.<patch>')
assert.match(values.base, /^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'invalid trusted base ref')
const commit = command('git', ['rev-parse', '--verify', `refs/tags/${values.tag}^{commit}`]).trim()
command('git', ['merge-base', '--is-ancestor', commit, values.base])
const manifest = JSON.parse(command('git', ['show', `${commit}:package.json`]))
const lock = JSON.parse(command('git', ['show', `${commit}:package-lock.json`]))
assert.equal(manifest.name, 'dsh-usage-state', 'unexpected release package')
assert.equal(manifest.repository?.url, 'git+https://github.com/takboo/dsh-usage-state.git', 'unexpected release repository')
assert.equal(values.tag, `v${manifest.version}`, 'tag and package version differ')
assert.equal(lock.version, manifest.version, 'tagged lock version differs')
assert.equal(lock.packages?.['']?.version, manifest.version, 'tagged lock package version differs')
const changelog = command('git', ['show', `${commit}:CHANGELOG.md`])
const escaped = manifest.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
assert.ok(new RegExp(`^## \\[${escaped}\\] - \\d{4}-\\d{2}-\\d{2}\\s*$`, 'm').test(changelog), 'tagged CHANGELOG needs a dated released section')
if (values['artifact-report']) {
  const report = readJson(values['artifact-report'])
  assert.equal(report.sourceCommit, commit, 'verified artifact commit differs from tag')
  assert.equal(report.version, manifest.version, 'verified artifact version differs')
  assert.equal(report.name, manifest.name)
  assert.equal(report.workingTreeDirty, false, 'artifact was packed from a dirty checkout')
  assert.match(report.sha256, /^[a-f0-9]{64}$/)
}
if (values['require-unpublished']) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(manifest.name)}/${encodeURIComponent(manifest.version)}`, { signal: AbortSignal.timeout(15_000) })
  assert.equal(response.status, 404, response.ok ? 'version is already published; npm versions cannot be reused' : `registry preflight failed: HTTP ${response.status}`)
}
if (values['github-output']) {
  assert.ok(process.env.GITHUB_OUTPUT, '--github-output requires GITHUB_OUTPUT')
  appendFileSync(process.env.GITHUB_OUTPUT, `commit=${commit}\nversion=${manifest.version}\ntag=${values.tag}\n`)
}
console.log(`Release tag verified: ${values.tag} at ${commit}, reachable from ${values.base}${values['require-unpublished'] ? ', npm version unused' : ''}`)

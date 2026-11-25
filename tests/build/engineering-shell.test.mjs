import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { prepareVerifyHostDir, recoverIncompleteDir, verifyHostReport } from '../../scripts/verify-host-pack.mjs'
import { ROOT, SEMVER, readJson } from '../../scripts/verify-support.mjs'

function versionGte(actual, min) {
  for (let i = 0; i < 3; i++) if (actual[i] !== min[i]) return actual[i] > min[i]
  return true
}

test('engineering lockfile, mise.toml, and root .rgignore satisfy the v0.2+ shell contract', () => {
  const lock = readJson(path.join(ROOT, 'dsh-engineering.lock.json'))
  assert.equal(lock.schemaVersion, 1)
  assert.match(lock.repository, /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/i)
  assert.ok(typeof lock.tag === 'string' && lock.tag.startsWith('v') && SEMVER.test(lock.tag.slice(1)))
  assert.match(lock.commit, /^[0-9a-f]{40}$/)

  const nodeVersion = readFileSync(path.join(ROOT, '.node-version'), 'utf8').trim()
  const mise = readFileSync(path.join(ROOT, 'mise.toml'), 'utf8')
  const minMatch = /^min_version\s*=\s*"(\d+)\.(\d+)\.(\d+)"/m.exec(mise)
  assert.ok(minMatch, 'mise.toml must declare a 3-part min_version')
  assert.equal(versionGte(minMatch.slice(1).map(Number), [2026, 10, 2]), true, 'min_version must be >= 2026.10.2')
  assert.match(mise, new RegExp(`^node\\s*=\\s*"${nodeVersion.replaceAll('.', '\\.')}"`, 'm'))
  for (const task of ['[tasks.setup]', '[tasks.check]', '[tasks."check:shell"]', '[tasks."verify:pack"]', '[tasks."verify:host:container"]', '[tasks."verify:host"]']) {
    assert.ok(mise.includes(task), `mise.toml missing ${task}`)
  }

  assert.equal(existsSync(path.join(ROOT, 'docs/.rgignore')), false)
  assert.equal(existsSync(path.join(ROOT, 'docs/.ignore')), false)
  const rgLines = readFileSync(path.join(ROOT, '.rgignore'), 'utf8')
    .split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  const archiveIdx = rgLines.findIndex(line => line === '/docs/archive/' || line === 'docs/archive/')
  assert.notEqual(archiveIdx, -1, 'root .rgignore must exclude /docs/archive/')
  assert.equal(rgLines.slice(archiveIdx + 1).some(line => line.startsWith('!')), false)
})

test('verify-host-pack enforces verified.json completion, sha256/sourceCommit parity, and mutually-exclusive recovery', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-verify-host-pack-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const sha = 'a'.repeat(64), sha2 = 'b'.repeat(64)
  const commit = '1'.repeat(40), commit2 = '2'.repeat(40)
  const marker = path.join(dir, '.in-progress.json')

  // 1. No racy auto-unlock on dead-PID marker; explicit recoverIncompleteDir recovers dead PID safely and refuses live PID/staging/concurrent lock.
  writeFileSync(marker, JSON.stringify({ pid: process.pid, startedAt: '2026-11-25T00:00:00Z' }))
  assert.throws(() => prepareVerifyHostDir(dir), /In-progress marker exists.*alive/)
  assert.throws(() => recoverIncompleteDir(dir), /live verify:pack/)
  writeFileSync(marker, JSON.stringify({ pid: 999999999, startedAt: '2026-11-25T00:00:00Z' }))
  assert.throws(() => prepareVerifyHostDir(dir), /not running/)
  assert.equal(existsSync(marker), true, 'normal pack must not auto-delete stale marker')
  const rLock = path.join(dir, '.recover.lock')
  writeFileSync(rLock, JSON.stringify({ pid: 999999999, startedAt: '2026-11-25T00:00:00Z' }))
  assert.throws(() => recoverIncompleteDir(dir), /Recovery lock exists.*pid 999999999 \(not running\).*remove .*\.recover\.lock/)
  assert.equal(existsSync(rLock), true, 'recovery must not auto-delete stale .recover.lock')
  rmSync(rLock, { force: true })
  recoverIncompleteDir(dir)
  assert.equal(existsSync(marker), false)
  assert.equal(existsSync(rLock), false)

  // 2. Post-container / pre-verify-report race: host-report.json without verified.json blocks concurrent pack without touching files.
  prepareVerifyHostDir(dir, target => {
    writeFileSync(path.join(target, 'verification.json'), JSON.stringify({ filename: 'a.tgz', sha256: sha, sourceCommit: commit }))
    writeFileSync(path.join(target, 'a.tgz'), 'tarball-A')
    writeFileSync(path.join(target, 'a.tgz.sha256'), `${sha}  a.tgz\n`)
    writeFileSync(path.join(target, 'candidate.tgz'), 'tarball-A')
  })
  assert.throws(() => prepareVerifyHostDir(dir), /without verified\.json/)
  writeFileSync(path.join(dir, 'host-report.json'), JSON.stringify({ plugin: { sha256: sha, sourceCommit: commit }, provenance: { inputs: { tarballSha256: sha, sourceCommit: commit } } }))
  assert.throws(() => prepareVerifyHostDir(dir), /without verified\.json/)
  assert.equal(readFileSync(path.join(dir, 'candidate.tgz'), 'utf8'), 'tarball-A')

  // 3. verifyHostReport checks both sha256 and sourceCommit parity before stamping verified.json.
  for (const bad of [
    { plugin: { sha256: sha2, sourceCommit: commit }, provenance: { inputs: { tarballSha256: sha, sourceCommit: commit } } },
    { plugin: { sha256: sha, sourceCommit: commit2 }, provenance: { inputs: { tarballSha256: sha, sourceCommit: commit } } },
    { plugin: { sha256: sha, sourceCommit: commit }, provenance: { inputs: { tarballSha256: sha, sourceCommit: commit2 } } },
  ]) {
    writeFileSync(path.join(dir, 'host-report.json'), JSON.stringify(bad))
    assert.throws(() => verifyHostReport(dir), /differs from E1 verification\.json/)
    assert.equal(existsSync(path.join(dir, 'verified.json')), false)
  }
  writeFileSync(path.join(dir, 'host-report.json'), JSON.stringify({ plugin: { sha256: sha, sourceCommit: commit }, provenance: { inputs: { tarballSha256: sha, sourceCommit: commit } } }))
  assert.equal(verifyHostReport(dir).sourceCommit, commit)
  assert.equal(existsSync(path.join(dir, 'verified.json')), true)

  // 4. After verified.json is stamped, next run archives all 6 files into runs/.
  const next = prepareVerifyHostDir(dir, target => {
    writeFileSync(path.join(target, 'candidate.tgz'), 'tarball-B')
  })
  assert.ok(next.archivedTo && next.archivedTo.startsWith(path.join(dir, 'runs')))
  for (const name of ['verified.json', 'host-report.json', 'verification.json', 'a.tgz', 'a.tgz.sha256', 'candidate.tgz']) {
    assert.equal(existsSync(path.join(next.archivedTo, name)), true, `expected ${name} archived`)
  }
  const staging = path.join(dir, '.dsh-locked-report-test')
  mkdirSync(staging)
  assert.throws(() => recoverIncompleteDir(dir), /Active container staging dir/)
  rmSync(staging, { recursive: true, force: true })
  assert.ok(recoverIncompleteDir(dir).archivedTo)
  assert.equal(existsSync(path.join(dir, 'candidate.tgz')), false)
})

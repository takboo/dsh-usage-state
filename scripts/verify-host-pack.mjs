import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROOT, npm, readJson } from './verify-support.mjs'

const isArtifact = name => name === 'verified.json' || name === 'host-report.json' ||
  name === 'verification.json' || name === 'candidate.tgz' || name.endsWith('.tgz') || name.endsWith('.tgz.sha256')

function isPidAlive(pid) {
  try { process.kill(pid, 0); return true }
  catch (error) { return error?.code === 'EPERM' }
}

function resolveTarget(dir) {
  const target = path.resolve(dir)
  assert.notEqual(target, path.resolve(ROOT), 'verify-host output dir must not be the repository root')
  mkdirSync(target, { recursive: true })
  assert.notEqual(realpathSync(target), realpathSync(ROOT), 'verify-host output dir must not resolve to the repository root')
  return target
}

function acquireLockFile(lockPath, label, hint) {
  const payload = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n'
  try { writeFileSync(lockPath, payload, { flag: 'wx' }); return lockPath } catch (error) {
    if (error?.code !== 'EEXIST') throw error
  }
  let detail = 'unreadable pid'
  try {
    const meta = JSON.parse(readFileSync(lockPath, 'utf8'))
    if (Number.isInteger(meta?.pid) && meta.pid > 0) detail = `pid ${meta.pid} (${isPidAlive(meta.pid) ? 'alive' : 'not running'})`
  } catch { /* keep unreadable detail */ }
  throw new Error(`${label} exists at ${lockPath} (${detail}); ${hint}`)
}

const acquireMarker = target => acquireLockFile(path.join(target, '.in-progress.json'), 'In-progress marker',
  'wait for active mise run verify:host to exit, or recover with: node scripts/verify-host-pack.mjs --archive-incomplete')

function archiveEntries(target, entries, firstEntry = null) {
  if (entries.length === 0) return null
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${process.pid}`
  let archivedTo = path.join(target, 'runs', stamp)
  for (let i = 1; existsSync(archivedTo); i++) archivedTo = path.join(target, 'runs', `${stamp}-${i}`)
  mkdirSync(archivedTo, { recursive: true })
  const ordered = firstEntry && entries.includes(firstEntry)
    ? [firstEntry, ...entries.filter(name => name !== firstEntry)]
    : entries
  for (const name of ordered) renameSync(path.join(target, name), path.join(archivedTo, name))
  return archivedTo
}

export function prepareVerifyHostDir(dir, work = () => {}) {
  const target = resolveTarget(dir)
  const markerPath = acquireMarker(target)
  try {
    const entries = readdirSync(target)
    if (entries.some(name => name.startsWith('.dsh-locked-report-'))) {
      throw new Error(`Active container staging dir detected in ${target}; use a separate worktree or DSH_VERIFY_HOST_DIR`)
    }
    const prior = entries.filter(isArtifact)
    if (prior.length > 0 && !prior.includes('verified.json')) {
      throw new Error(`Incomplete or unverified artifacts exist in ${target} without verified.json; wait for active verify:host or recover with: node scripts/verify-host-pack.mjs --archive-incomplete`)
    }
    const archivedTo = archiveEntries(target, prior, 'verified.json')
    const result = work(target, archivedTo)
    return { target, archivedTo, result }
  } finally {
    rmSync(markerPath, { force: true })
  }
}

export function recoverIncompleteDir(dir) {
  const target = resolveTarget(dir)
  const recoverLockPath = path.join(target, '.recover.lock')
  const recoverLock = acquireLockFile(recoverLockPath, 'Recovery lock',
    `confirm no --archive-incomplete process is running, remove ${recoverLockPath} manually, and re-run: node scripts/verify-host-pack.mjs --archive-incomplete`)
  let ownMarker = null
  try {
    if (readdirSync(target).some(name => name.startsWith('.dsh-locked-report-'))) {
      throw new Error(`Active container staging dir detected in ${target}; refusing recovery`)
    }
    const markerPath = path.join(target, '.in-progress.json')
    if (existsSync(markerPath)) {
      let meta
      try { meta = JSON.parse(readFileSync(markerPath, 'utf8')) } catch {
        throw new Error(`Unreadable in-progress marker at ${markerPath}; inspect manually`)
      }
      if (!Number.isInteger(meta?.pid) || meta.pid <= 0 || isPidAlive(meta.pid)) {
        throw new Error(`Refusing recovery while live verify:pack holds ${markerPath} (pid ${meta?.pid ?? 'unknown'})`)
      }
      rmSync(markerPath, { force: true })
    }
    ownMarker = acquireMarker(target)
    const entries = readdirSync(target)
    if (entries.some(name => name.startsWith('.dsh-locked-report-'))) {
      throw new Error(`Active container staging dir detected in ${target}; refusing recovery`)
    }
    const archivedTo = archiveEntries(target, entries.filter(isArtifact))
    return { target, archivedTo }
  } finally {
    if (ownMarker) rmSync(ownMarker, { force: true })
    rmSync(recoverLock, { force: true })
  }
}

export function verifyHostReport(dir) {
  const target = path.resolve(dir)
  const verificationPath = path.join(target, 'verification.json')
  const reportPath = path.join(target, 'host-report.json')
  assert.ok(existsSync(verificationPath), `Missing E1 report: ${verificationPath}`)
  assert.ok(existsSync(reportPath), `Missing E2 report: ${reportPath}`)
  const verification = readJson(verificationPath)
  const report = readJson(reportPath)
  assert.match(String(verification.sha256 ?? ''), /^[0-9a-f]{64}$/, 'Invalid verification.json sha256')
  assert.match(String(verification.sourceCommit ?? ''), /^[0-9a-f]{40}$/, 'Invalid verification.json sourceCommit')
  assert.equal(report.provenance?.inputs?.tarballSha256, verification.sha256, 'host-report provenance tarballSha256 differs from E1 verification.json')
  assert.equal(report.plugin?.sha256, verification.sha256, 'host-report plugin.sha256 differs from E1 verification.json')
  assert.equal(report.provenance?.inputs?.sourceCommit, verification.sourceCommit, 'host-report provenance sourceCommit differs from E1 verification.json')
  assert.equal(report.plugin?.sourceCommit, verification.sourceCommit, 'host-report plugin.sourceCommit differs from E1 verification.json')
  const stamp = { sha256: verification.sha256, sourceCommit: verification.sourceCommit, verifiedAt: new Date().toISOString() }
  writeFileSync(path.join(target, 'verified.json'), JSON.stringify(stamp, null, 2) + '\n', { flag: 'wx' })
  return { sha256: verification.sha256, sourceCommit: verification.sourceCommit, reportPath }
}

const isMain = Boolean(process.argv[1]) && (() => {
  try { return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]) } catch { return false }
})()

if (isMain) {
  const args = process.argv.slice(2)
  const outDir = process.env.DSH_VERIFY_HOST_DIR || '.tmp/verify-host'
  if (args.length === 1 && args[0] === '--verify-report') {
    const { sha256, sourceCommit } = verifyHostReport(outDir)
    console.log(`Verified E1/E2 parity: sha256=${sha256} sourceCommit=${sourceCommit}`)
  } else if (args.length === 1 && args[0] === '--archive-incomplete') {
    const { archivedTo } = recoverIncompleteDir(outDir)
    console.log(archivedTo ? `Archived incomplete artifacts to: ${archivedTo}` : 'Recovered clean directory (no artifacts to archive).')
  } else if (args.length === 0) {
    prepareVerifyHostDir(outDir, target => {
      npm(['run', 'build'], { stdio: 'inherit' })
      const packed = spawnSync(process.execPath, [path.join(ROOT, 'scripts/verify-package.mjs'), '--out-dir', target], { cwd: ROOT, stdio: 'inherit' })
      if (packed.error) throw packed.error
      if (packed.status !== 0) { process.exitCode = packed.status ?? 1; return }
      const { filename } = readJson(path.join(target, 'verification.json'))
      assert.ok(typeof filename === 'string' && filename.length > 0, 'verification.json missing filename')
      linkSync(path.join(target, filename), path.join(target, 'candidate.tgz'))
    })
  } else {
    console.error('Usage: node scripts/verify-host-pack.mjs [--verify-report | --archive-incomplete]')
    process.exitCode = 2
  }
}

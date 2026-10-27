import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { selectReleases } from '../../scripts/compatibility/discover.mjs'
import { outcome } from '../../scripts/compatibility/outcome.mjs'

const release = (id, tag, published_at = '2026-10-24T00:00:00Z') => ({ id, tag_name: tag, published_at, draft: false })
const issue = (id, status, updated_at = '2026-10-24T00:00:00Z') => ({ number: 12, user: { login: 'github-actions[bot]' }, body: `<!-- dsh-compat:${id}:${status}:1 -->`, updated_at })

test('discovers stable and RC releases by publication time, including older maintenance lines', () => {
  const releases = [release(1, 'dsh-v0.2.1-rc.3', '2026-10-23T15:26:39Z'), release(2, 'dsh-v0.2.2-rc.1'), release(3, 'dsh-v0.2.0'), release(4, 'dsh-v0.2.2-alpha.1'), { ...release(5, 'dsh-v0.2.3'), draft: true }]
  assert.deepEqual(selectReleases(releases, []).map(x => x.tag), ['dsh-v0.2.2-rc.1', 'dsh-v0.2.0'])
})

test('deduplicates bot reports and retries temporary failures after six hours', () => {
  const releases = [release(1, 'dsh-v0.2.2'), release(2, 'dsh-v0.2.3'), release(3, 'dsh-v0.2.4')]
  const issues = [issue(1, 'passed'), issue(2, 'failed'), issue(3, 'retry')]
  assert.deepEqual(selectReleases(releases, issues, { now: Date.parse('2026-10-24T05:59:59Z') }), [])
  assert.deepEqual(selectReleases(releases, issues, { now: Date.parse('2026-10-24T06:00:00Z') }).map(x => [x.id, x.issue]), [[3, 12]])
  const exhausted = { ...issue(3, 'retry'), body: '<!-- dsh-compat:3:retry:3 -->' }
  assert.deepEqual(selectReleases([releases[2]], [exhausted], { now: Date.parse('2026-10-25T06:00:00Z') }), [])
})

test('ignores spoofed issue markers and manual dispatch bypasses deduplication', () => {
  const releases = [release(1, 'dsh-v0.2.2')]
  assert.equal(selectReleases(releases, [issue(1, 'partial')]).length, 0) // legacy results remain deduplicated
  const spoof = { ...issue(1, 'partial'), user: { login: 'someone-else' } }
  assert.equal(selectReleases(releases, [spoof]).length, 1)
  assert.equal(selectReleases(releases, [issue(1, 'partial')], { manual: 'dsh-v0.2.2' })[0].issue, 12)
  assert.throws(() => selectReleases(releases, [], { manual: 'dsh-v0.2.2; echo unsafe' }))
  assert.throws(() => selectReleases(releases, [], { manual: 'dsh-v0.2.3' }))
})

test('check outcome distinguishes assertion failure from temporary host setup failure', () => {
  const ok = { ok: true, status: 0 }
  assert.equal(outcome(ok, ok, ok), 'passed')
  assert.equal(outcome({ ok: false, status: 1 }, ok, null), 'failed')
  assert.equal(outcome(ok, { ok: false, status: 1 }, null), 'failed')
  assert.equal(outcome(ok, ok, { ok: false, status: 1 }), 'failed')
  assert.equal(outcome(ok, ok, { ok: false, status: 2 }), 'retry')
  assert.equal(outcome(ok, ok, { ok: false, status: null }), 'retry')
})

test('web smoke refuses an existing directory before changing its contents', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-web-protection-'))
  const sentinel = join(root, 'keep')
  try {
    writeFileSync(sentinel, 'preserve')
    const run = spawnSync(process.execPath, ['scripts/compatibility/web-smoke.mjs'], {
      encoding: 'utf8', env: { ...process.env, DSH_VERSION: '0.2.1-rc.3', DSH_WEB_ROOT: root, DSH_REPORT_DIR: join(root, 'report') },
    })
    assert.equal(run.status, 2)
    assert.match(run.stderr, /Refusing a nonempty DSH_WEB_ROOT/)
    assert.equal(readFileSync(sentinel, 'utf8'), 'preserve')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('fixture rejects the environment credential and accepts the distinct saved credential', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-fixture-test-'))
  try {
    const program = `
      import assert from 'node:assert/strict'
      const endpoint = 'https://api.deepseek.com/user/balance'
      const wrong = await fetch(endpoint, { headers: { authorization: 'Bearer compat-env-key' } })
      const right = await fetch(endpoint, { headers: { authorization: 'Bearer compat-file-key' } })
      assert.equal(wrong.status, 403)
      assert.equal(right.status, 200)
      assert.equal((await right.json()).balance_infos[0].total_balance, '42.25')
    `
    const run = spawnSync(process.execPath, ['--import', './scripts/compatibility/fetch-fixture.mjs', '--input-type=module', '--eval', program], {
      encoding: 'utf8', env: { ...process.env, DSH_FIXTURE_TRACE: join(root, 'trace.jsonl') },
    })
    assert.equal(run.status, 0, run.stderr)
    const trace = readFileSync(join(root, 'trace.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    assert.deepEqual(trace.map(entry => entry.source), ['environment', 'file'])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('baseline and contract subprocess timeouts and launch failures remain retryable', () => {
  const timeout = spawnSync(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 100 })
  const missing = spawnSync(join(tmpdir(), 'dsh-monitor-missing-executable'))
  const signalled = spawnSync(process.execPath, ['-e', "process.kill(process.pid, 'SIGTERM')"])
  const assertionFailure = spawnSync(process.execPath, ['-e', 'process.exit(1)'])
  const ok = { ok: true, status: 0 }
  assert.equal(timeout.error?.code, 'ETIMEDOUT')
  assert.equal(missing.error?.code, 'ENOENT')
  assert.equal(signalled.signal, 'SIGTERM')
  for (const subprocess of [timeout, missing, signalled]) {
    const failed = { ok: false, status: subprocess.status, error: subprocess.error, signal: subprocess.signal }
    assert.equal(outcome(failed, ok, null), 'retry')
    assert.equal(outcome(ok, failed, null), 'retry')
    assert.equal(outcome(failed, { ok: false, status: 1 }, null), 'retry')
  }
  assert.equal(outcome({ ok: false, status: assertionFailure.status }, ok, null), 'failed')
})

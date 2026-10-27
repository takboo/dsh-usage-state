import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { selectTargets } from '../../scripts/compatibility/discover.mjs'
import { outcome } from '../../scripts/compatibility/outcome.mjs'
import { marker, botStates, compareVersions, validateTarget } from '../../scripts/compatibility/state.mjs'
import { buildState, normalizeReport, renderBody, publish } from '../../scripts/compatibility/report.mjs'
import { inventory, platformSpecs, verifyIntegrity } from '../../scripts/compatibility/packages.mjs'

const version = '0.2.2-rc.1'
const integrity = `sha512-${createHash('sha512').update('fixture').digest('base64')}`
const date = '2026-10-24T00:00:00Z'
const sha = 'a'.repeat(40)
const release = (v = version, id = 1) => ({ id, tag_name: `dsh-v${v}`, published_at: date, draft: false, commit: sha })
const registry = (tags = { next: version }) => ({ 'dist-tags': tags, time: Object.fromEntries(Object.values(tags).map(v => [v, date])), versions: Object.fromEntries(Object.values(tags).map(v => [v, { dist: { integrity, tarball: `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${v}.tgz` } }])) })
const item = () => selectTargets([], registry(), [])[0]
const success = target => ({ version: target.version, integrity: target.integrity, status: 'passed', category: 'passed', completed: true, reason: 'All checks passed', stages: ['baseline-verify', 'dsh-contracts', 'web-host-command'].map(name => ({ name, status: 'passed' })), dependencies: { platform: ['dsh-typert-loader', 'dsh-typert-registry'].map(name => ({ path: `node_modules/@deepseek-ai/${name}`, version: target.version })), web: [{ path: 'node_modules/@deepseek-ai/dsh', version: target.version, integrity: target.integrity }] } })
const state = (i = item(), report = success(i.target), opts = {}) => buildState(i, undefined, report, { now: date, run: '123', sourceCommit: sha, ...opts })
const issue = (s, number = 12) => ({ number, user: { login: 'github-actions[bot]' }, body: marker(s), updated_at: date })

test('discovers official GitHub prereleases and maintenance versions, plus npm-first latest/next', () => {
  const r = registry({ latest: '0.2.1', next: version })
  const found = selectTargets([release('0.1.9'), release('0.2.3-alpha.1'), { ...release('0.3.0'), draft: true }], r, [])
  assert.deepEqual(found.map(x => x.version).sort(), ['0.1.9', '0.2.1', '0.2.2-rc.1', '0.2.3-alpha.1'])
  assert.equal(found.find(x => x.version === version).target.integrity, integrity)
  assert.equal(found.find(x => x.version === version).target.commit, null)
  assert.equal(found.find(x => x.version === '0.2.3-alpha.1').target.commit, sha)
  assert.equal(selectTargets([{ ...release(), published_at: '2026-10-23T15:26:39Z' }], registry({}), []).length, 0)
})

test('two npm tags and GitHub merge into one exact-version target', () => {
  const found = selectTargets([release()], registry({ latest: version, next: version }), [])
  assert.equal(found.length, 1)
  assert.equal(found[0].target.sources.length, 3)
})

test('channel convergence only updates the original closed bot issue and retains checked evidence', () => {
  const initial = item(), prior = state(initial)
  const next = selectTargets([release()], registry(), [issue(prior)])[0]
  assert.equal(next.mode, 'update')
  assert.equal(next.issue, 12)
  const merged = buildState(next, prior, undefined, { run: '456', sourceCommit: 'b'.repeat(40) })
  assert.equal(merged.autoAttempts, 1)
  assert.equal(merged.summary.run, '123')
  assert.equal(merged.checkedTarget.commit, null)
  assert.equal(merged.target.commit, sha)
  assert.equal(selectTargets([release()], registry(), [issue(merged)]).length, 0)
})

test('npm channel rollback to an unseen version cannot schedule automatic downgrade', () => {
  const prior = state()
  assert.deepEqual(selectTargets([], registry({ next: '0.2.1-rc.9' }), [issue(prior)]), [])
  const old = selectTargets([], registry({ next: '0.2.1-rc.9' }), [issue(prior)], { manual: '0.2.1-rc.9' })
  assert.equal(old[0].mode, 'check')
  assert.ok(compareVersions('0.2.1-rc.10', '0.2.1-rc.9') > 0)
  assert.ok(compareVersions('0.2.1', '0.2.1-rc.10') > 0)
  assert.ok(compareVersions('0.2.1-alpha-b', '0.2.1-alpha-a') > 0)
})

test('infrastructure retries use last check time, six-hour boundary and three total automatic executions', () => {
  const i = item()
  let prior = buildState(i, undefined, undefined, { now: date, run: '123', sourceCommit: sha })
  assert.equal(prior.status, 'incomplete')
  assert.equal(selectTargets([], registry(), [issue(prior)], { now: Date.parse(date) + 6 * 3600000 - 1 }).length, 0)
  const retry = selectTargets([], registry(), [issue(prior)], { now: Date.parse(date) + 6 * 3600000 })[0]
  assert.equal(retry.mode, 'check')
  prior = buildState(retry, prior, undefined, { now: '2026-10-24T06:00:00Z', run: '124', sourceCommit: sha })
  const converged = selectTargets([release()], registry(), [issue(prior)], { now: Date.parse('2026-10-24T07:00:00Z') })[0]
  assert.equal(converged.mode, 'update')
  prior = buildState(converged, prior, undefined, { now: '2026-10-24T07:00:00Z', run: '125', sourceCommit: sha })
  assert.equal(prior.lastAttemptAt, '2026-10-24T06:00:00Z')
  const third = selectTargets([release()], registry(), [issue(prior)], { now: Date.parse('2026-10-24T12:00:00Z') })[0]
  prior = buildState(third, prior, undefined, { now: '2026-10-24T12:00:00Z', run: '126', sourceCommit: sha })
  assert.equal(prior.autoAttempts, 3)
  assert.deepEqual(selectTargets([release()], registry(), [issue(prior)], { now: Date.parse('2026-10-25T00:00:00Z') }), [])
  assert.equal(selectTargets([release()], registry(), [issue(prior)], { manual: `dsh-v${version}` })[0].mode, 'check')
})

test('later metadata cannot replace pinned integrity, package address or known source commit', () => {
  const prior = state()
  prior.target.commit = sha
  const r = registry()
  r.versions[version].dist.integrity = `sha512-${createHash('sha512').update('replacement').digest('base64')}`
  r.versions[version].gitHead = 'b'.repeat(40)
  const manual = selectTargets([], r, [issue(prior)], { manual: version })[0]
  assert.equal(manual.target.integrity, integrity)
  assert.equal(manual.target.commit, sha)
  assert.equal(manual.target.tarball, prior.target.tarball)
})

test('a pinned infrastructure retry survives npm tags moving forward', () => {
  const prior = buildState(item(), undefined, undefined, { now: date, run: '123', sourceCommit: sha })
  const r = registry({ next: '0.2.3' })
  const selected = selectTargets([], r, [issue(prior)], { now: Date.parse(date) + 6 * 3600000 })
  const retry = selected.find(x => x.version === version)
  assert.equal(retry.mode, 'check')
  assert.equal(retry.target.integrity, integrity)
})

test('completed assertion and baseline failures never auto retry; manual revalidation does not consume automatic budget', () => {
  for (const category of ['incompatible', 'baseline_failure']) {
    const i = item(), report = { ...success(i.target), status: 'failed', category }
    const prior = state(i, report)
    assert.deepEqual(selectTargets([], registry(), [issue(prior)], { now: Date.parse('2026-10-30') }), [])
    const manual = selectTargets([], registry(), [issue(prior)], { manual: version })[0]
    assert.equal(manual.issue, 12)
    assert.equal(buildState(manual, prior, report, { now: date, run: '124', sourceCommit: sha }).autoAttempts, 1)
  }
})

test('legacy release ID markers migrate to same version and preserve baselines and run links', () => {
  const legacy = { ...issue(state()), body: `<!-- dsh-compat:1:passed:1 -->\nCheck: [Actions run 88](url); plugin source commit: \`${sha}\`\nDetail: Original evidence` }
  const selected = selectTargets([release()], registry(), [legacy])[0]
  assert.equal(selected.mode, 'update')
  assert.equal(selected.issue, 12)
  const prior = botStates([legacy], [release()]).get(version)
  const migrated = buildState(selected, prior, undefined, {})
  assert.equal(migrated.summary.run, '88')
  assert.equal(migrated.summary.sourceCommit, sha)
})

test('legacy partial checks migrate as unfinished and require explicit revalidation', () => {
  const legacy = { ...issue(state()), body: '<!-- dsh-compat:1:partial:1 -->' }
  const prior = botStates([legacy], [release()]).get(version)
  assert.equal(prior.status, 'incomplete')
  assert.equal(prior.retryable, false)
  assert.equal(selectTargets([release()], registry(), [legacy])[0].mode, 'update')
})

test('spoofed markers, pull requests, malformed metadata and shell-like versions do not suppress checks', () => {
  const real = issue(state())
  for (const spoof of [{ ...real, user: { login: 'someone' } }, { ...real, pull_request: {} }, { ...real, body: '<!-- dsh-compat-v2:bad== -->' }]) assert.equal(selectTargets([], registry(), [spoof]).length, 1)
  for (const manual of ['next', '0.2.2; echo unsafe', 'https://evil.test/pkg', '0.2.2-01']) assert.throws(() => selectTargets([], registry(), [], { manual }))
  assert.throws(() => selectTargets([], registry(), [], { manual: '9.9.9' }))
})

test('missing, interrupted, malformed and baseline-only reports are unfinished', () => {
  const t = item().target, ok = success(t)
  for (const report of [undefined, {}, { ...ok, completed: false }, { ...ok, version: '0.0.1' }, { ...ok, integrity: 'different' }, { ...ok, stages: [ok.stages[0]] }, { ...ok, dependencies: {} }, { ...ok, dependencies: { ...ok.dependencies, web: [null] } }]) {
    assert.equal(normalizeReport(report, t).status, 'incomplete')
  }
  assert.equal(normalizeReport(ok, t).status, 'passed')
})

test('official package allowlist and integrity pins reject URL, alias and command injection', () => {
  assert.deepEqual(platformSpecs({ '@deepseek-ai/cordis': '~4.0.5', '@deepseek-ai/schemastery': '^3.18.5' }, version), [`@deepseek-ai/cordis@~4.0.5`, '@deepseek-ai/schemastery@^3.18.5', `@deepseek-ai/dsh-typert-loader@${version}`, `@deepseek-ai/dsh-typert-registry@${version}`])
  for (const range of ['npm:evil@1.0.0', 'git+https://evil.test', 'file:/tmp/payload', '1.0.0; echo unsafe']) assert.throws(() => platformSpecs({ '@deepseek-ai/cordis': range }, version))
  assert.throws(() => validateTarget({ ...item().target, tarball: 'https://evil.test/dsh.tgz' }))
  verifyIntegrity(Buffer.from('fixture'), integrity)
  assert.throws(() => verifyIntegrity(Buffer.from('modified'), integrity))
})

test('report re-reads bot issues and PATCHes the canonical issue even if matrix issue points elsewhere', async () => {
  const initial = item(), prior = state(initial), calls = []
  const next = selectTargets([release()], registry(), [issue(prior)])[0]
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => options.method ? { html_url: 'https://github.com/takboo/dsh-usage-state/issues/12' } : url.includes('/releases') ? [release()] : [issue(prior)] }
  }
  try { await publish({ token: 'fixture-token', repo: 'takboo/dsh-usage-state', item: { ...next, issue: 999 }, run: '456', sourceCommit: sha }) } finally { globalThis.fetch = originalFetch }
  const writes = calls.filter(c => c.options.method)
  assert.equal(writes.length, 1)
  assert.match(writes[0].url, /issues\/12$/)
  assert.equal(writes[0].options.method, 'PATCH')
  assert.match(JSON.parse(writes[0].options.body).body, /Actions run 123/)
})

test('report sanitizes hostile upstream/report prose without commands, links or mentions', () => {
  const s = state()
  s.summary.reason = '[click](https://evil.test) @someone <script> $(echo evil)'
  const body = renderBody(s, 'takboo/dsh-usage-state')
  assert.ok(!body.includes('[click](https://evil.test)'))
  assert.ok(!body.includes('@someone'))
  assert.ok(!body.includes('<script>'))
  assert.match(body, /14 days/)
})

test('workflow retains minute 17, least privilege and report-only artifact allowlist', () => {
  const workflow = readFileSync('.github/workflows/dsh-compatibility.yml', 'utf8')
  const check = workflow.split('  check:')[1].split('  report:')[0]
  assert.match(workflow, /cron: '17 \* \* \* \*'/)
  assert.match(check, /permissions:\n      contents: read/)
  assert.ok(!check.includes('issues: write'))
  assert.ok(!check.includes('GH_TOKEN'))
  assert.match(check, /retention-days: 14/)
  assert.match(check, /\/\*failure.png/)
  assert.ok(!check.includes('node_modules/'))
  assert.match(workflow, /REPORT_ARTIFACT_OK: \$\{\{ steps.artifact.outcome/)
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

test('missing npm package produces durable incomplete reports and each execution gets fresh state', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-check-isolation-'))
  try {
    const target = { ...item().target, integrity: null, tarball: null }
    for (let n = 0; n < 2; n++) {
      const output = join(root, `report-${n}`)
      const result = spawnSync(process.execPath, ['scripts/compatibility/check.mjs'], { encoding: 'utf8', env: { ...process.env, TMPDIR: root, DSH_TARGET: JSON.stringify(target), DSH_REPORT_DIR: output } })
      assert.equal(result.status, 1, result.stderr)
      const report = JSON.parse(readFileSync(join(output, 'report.json'), 'utf8'))
      assert.equal(report.status, 'incomplete')
      assert.equal(report.completed, false)
      assert.match(report.reason, /package is not available/)
    }
    assert.equal(readdirSync(root).filter(path => path.startsWith(`dsh-check-${version}-`)).length, 2)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('missing report creates an unfinished bot issue with persistent baselines; payload is data', async () => {
  const originalFetch = globalThis.fetch, writes = []
  globalThis.fetch = async (url, options) => ({ ok: true, json: async () => {
    if (!options.method) return []
    writes.push({ url, options })
    return { html_url: 'https://github.com/takboo/dsh-usage-state/issues/13' }
  } })
  try { await publish({ token: 'fixture-token', repo: 'takboo/dsh-usage-state', item: item(), report: undefined, run: '567', sourceCommit: sha }) } finally { globalThis.fetch = originalFetch }
  assert.equal(writes.length, 1)
  assert.equal(writes[0].options.method, 'POST')
  const payload = JSON.parse(writes[0].options.body)
  assert.match(payload.body, /Result: \*\*incomplete\*\*/)
  assert.match(payload.body, /Actions run 567/)
  assert.match(payload.body, new RegExp(sha))
  assert.match(payload.body, /Unfinished verification/)
})


test('dependency inventory records resolved versions without npm prefix path leakage', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-lock-test-'))
  try {
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ packages: { '': { name: 'root' }, '../../private/tmp/candidate/node_modules/@deepseek-ai/dsh': { version, integrity }, 'node_modules/playwright': { version: '1.62.1', integrity } } }))
    assert.deepEqual(inventory(root), [{ path: 'node_modules/@deepseek-ai/dsh', version, integrity }, { path: 'node_modules/playwright', version: '1.62.1', integrity }])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

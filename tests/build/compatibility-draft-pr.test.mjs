import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { eligibleState, addMatrixVersion, renderEvidence, upsertDraft, maintainDrafts } from '../../scripts/compatibility/draft-pr.mjs'
import { marker } from '../../scripts/compatibility/state.mjs'
import { matrixVersions } from '../../scripts/compatibility/matrix.mjs'

const version = '0.2.1-rc.5', repo = 'takboo/dsh-usage-state'
const sha = 'a'.repeat(40), head = 'b'.repeat(40), tree = 'c'.repeat(40)
const integrity = `sha512-${createHash('sha512').update('fixture').digest('base64')}`
const matrix = `${JSON.stringify({ versions: ['0.2.1-rc.1', '0.2.1-rc.2', '0.2.1-rc.3'] }, null, 2)}\n`
const prMarker = `<!-- dsh-compat-pr-v1:${version} -->`
const state = () => ({ version, issue: 13, status: 'passed', autoAttempts: 2, lastAttemptAt: '2026-10-30T01:00:59Z', target: { version, integrity, tarball: `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${version}.tgz`, commit: null, sources: [] }, checkedTarget: { version, integrity, tarball: `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${version}.tgz`, commit: null, sources: [] }, summary: { category: 'passed', sourceCommit: sha, run: '123', stages: ['baseline-verify', 'dsh-contracts', 'web-host-command'].map(name => ({ name, status: 'passed' })), dependencies: { platform: ['dsh-typert-loader', 'dsh-typert-registry'].map(name => ({ path: `node_modules/@deepseek-ai/${name}`, version })), web: [{ path: 'node_modules/@deepseek-ai/dsh', version }] } } })
const issue = s => ({ number: 13, user: { login: 'github-actions[bot]' }, body: marker(s) })
const pr = (overrides = {}) => ({ number: 14, state: 'open', draft: true, user: { login: 'github-actions[bot]' }, body: `${prMarker}\n<!-- dsh-compat-head:${head} -->`, head: { ref: `codex/dsh-compat-${version}`, sha: head, repo: { full_name: repo } }, base: { ref: 'main' }, html_url: `https://github.com/${repo}/pull/14`, ...overrides })

function mock({ prs = [], branch = null, passed = true, foundIssues = [issue(state())], runSha = sha, currentTree = 'd'.repeat(40), runStatus = 'completed', orphan = false, committer = 'web-flow', verified = true } = {}) {
  const calls = []
  const request = async (path, options = {}) => {
    calls.push({ path, ...options, body: options.body ? JSON.parse(options.body) : undefined })
    if (path === `/repos/${repo}`) return { default_branch: 'main' }
    if (path.includes('/issues?')) return foundIssues
    if (path.includes('/pulls?')) return prs
    if (path.endsWith('/actions/runs/123/jobs?per_page=100&page=1')) return { jobs: [{ name: `check (${version}, ...)`, conclusion: passed ? 'success' : 'failure', steps: [{ name: 'Check exact upstream contracts and baseline', conclusion: passed ? 'success' : 'skipped' }] }] }
    if (path.endsWith('/actions/runs/123')) return { status: runStatus, path: '.github/workflows/dsh-compatibility.yml', head_sha: runSha, event: 'schedule', head_repository: { full_name: repo } }
    if (!path.includes('/git/') && /\/commits\/[a-f0-9]{40}$/.test(path)) return { author: { login: orphan ? 'github-actions[bot]' : 'someone' }, committer: { login: committer }, commit: { message: `ci: track DSH ${version} compatibility\n\n${prMarker}`, verification: { verified, reason: verified ? 'valid' : 'unsigned' } }, files: [{ filename: `.github/dsh-compatibility.json` }, { filename: `docs/compatibility/${version}.md` }], parents: [{ sha: sha }] }
    if (path.endsWith('/git/ref/heads/main')) return { object: { sha } }
    if (path.includes('/git/ref/heads/codex%2F')) { if (branch) return { object: { sha: branch } }; const e = new Error('not found'); e.status = 404; throw e }
    if (path.endsWith(`/git/commits/${sha}`)) return { tree: { sha: tree } }
    if (path.endsWith(`/git/commits/${head}`)) return { tree: { sha: currentTree } }
    if (path.includes('/contents/.github/')) return { type: 'file', encoding: 'base64', content: Buffer.from(matrix).toString('base64') }
    if (path.endsWith('/git/trees')) return { sha: tree }
    if (path.endsWith('/git/commits')) return { sha: head }
    if (path.endsWith('/git/refs') || path.includes('/git/refs/heads/')) return {}
    if (path.endsWith('/pulls') || /\/pulls\/14$/.test(path)) return pr({ body: JSON.parse(options.body).body })
    throw new Error(`Unexpected request: ${path}`)
  }
  return { request, calls }
}

test('only complete exact-version bot evidence is eligible for a draft', () => {
  assert.equal(eligibleState(state()), true)
  for (const patch of [{ status: 'incomplete' }, { status: 'failed' }, { summary: { ...state().summary, category: 'legacy' } }, { summary: { ...state().summary, dependencies: {} } }, { summary: { ...state().summary, stages: [{ name: 'baseline-verify', status: 'passed' }] } }, { checkedTarget: { ...state().checkedTarget, integrity: null } }]) assert.equal(eligibleState({ ...state(), ...patch }), false)
})

test('matrix changes preserve old baselines, add one exact candidate and are idempotent', () => {
  const next = addMatrixVersion(matrix, version)
  assert.deepEqual(JSON.parse(next).versions, ['0.2.1-rc.1', '0.2.1-rc.2', '0.2.1-rc.3', version])
  assert.equal(addMatrixVersion(next, version), next)
  assert.throws(() => addMatrixVersion(matrix, 'next'))
  assert.throws(() => addMatrixVersion(JSON.stringify({ versions: ['next'] }), version))
})

test('the checked-in matrix contains unique exact versions and remains bounded', () => {
  assert.ok(matrixVersions(readFileSync('.github/dsh-compatibility.json', 'utf8')).length > 0)
  for (const value of [{ versions: [] }, { versions: ['next'] }, { versions: [version, version] }, { versions: [version], other: true }, { versions: Array.from({ length: 65 }, (_, n) => `0.2.${n}`) }]) assert.throws(() => matrixVersions(JSON.stringify(value)))
})

test('evidence preserves the checked baseline and distinguishes later source metadata', () => {
  const s = state(); s.target.commit = head
  const text = renderEvidence(s, repo)
  assert.match(text, new RegExp(sha))
  assert.match(text, /actions\/runs\/123/)
  assert.match(text, /issues\/13/)
  assert.match(text, /Checked upstream commit: unavailable/)
  assert.match(text, new RegExp(`Observed upstream commit: ${head}`))
  assert.match(text, /Desktop/)
  assert.ok(!text.includes('undefined'))
})

test('creates one draft from current default branch with an evidence file and CI matrix only', async () => {
  const m = mock()
  const result = await upsertDraft({ token: 'fixture', repo, state: state(), request: m.request })
  assert.equal(result.status, 'created')
  const changes = m.calls.find(x => x.path.endsWith('/git/trees')).body.tree
  assert.deepEqual(changes.map(x => x.path), ['.github/dsh-compatibility.json', `docs/compatibility/${version}.md`])
  const create = m.calls.find(x => x.path.endsWith('/pulls')).body
  assert.equal(create.draft, true)
  assert.equal(create.base, 'main')
  assert.equal(create.head, `codex/dsh-compat-${version}`)
  assert.match(create.body, /dsh-compat-head:/)
  assert.ok(!m.calls.some(x => /merge|releases|reviews/.test(x.path)))
})

test('completed drafts are idempotent and retain the canonical PR number', async () => {
  const initial = mock()
  await upsertDraft({ token: 'fixture', repo, state: state(), request: initial.request })
  const body = initial.calls.find(x => x.path.endsWith('/pulls')).body.body
  const m = mock({ prs: [pr({ body })], branch: head, currentTree: tree })
  const result = await upsertDraft({ token: 'fixture', repo, state: state(), request: m.request })
  assert.equal(result.status, 'unchanged')
  assert.equal(result.number, 14)
  assert.ok(!m.calls.some(x => x.path.endsWith('/git/commits') || x.path.endsWith('/git/refs') || x.path.endsWith('/pulls')))
})

test('draft updates advance without force and preserve the current base in commit ancestry', async () => {
  const m = mock({ prs: [pr()], branch: head })
  assert.equal((await upsertDraft({ token: 'fixture', repo, state: state(), request: m.request })).status, 'updated')
  assert.deepEqual(m.calls.find(x => x.path.endsWith('/git/commits')).body.parents, [sha, head])
  assert.equal(m.calls.find(x => x.path.includes('/git/refs/heads/')).body.force, false)
})

test('closed or ready-for-review PRs remain under human control', async () => {
  for (const existing of [pr({ state: 'closed' }), pr({ draft: false })]) {
    const m = mock({ prs: [existing], branch: head })
    assert.equal((await upsertDraft({ token: 'fixture', repo, state: state(), request: m.request })).status, 'human-controlled')
    assert.ok(!m.calls.some(x => x.method))
  }
})

test('foreign PRs, branches and human commits are never overwritten', async () => {
  for (const options of [{ prs: [pr({ user: { login: 'someone' } })], branch: head }, { branch: head }, { prs: [pr()], branch: 'e'.repeat(40) }, { prs: [pr({ head: { ...pr().head, sha: 'e'.repeat(40) } })], branch: 'e'.repeat(40) }]) {
    const m = mock(options)
    await assert.rejects(upsertDraft({ token: 'fixture', repo, state: state(), request: m.request }), /managed|changed|branch/i)
    assert.ok(!m.calls.some(x => x.method))
  }
})

test('a green workflow alone cannot replace a successful exact-version check job', async () => {
  for (const options of [{ passed: false }, { runSha: head }]) {
    const m = mock(options)
    await assert.rejects(upsertDraft({ token: 'fixture', repo, state: state(), request: m.request }), /check|baseline/i)
    assert.ok(!m.calls.some(x => x.method))
  }
})

test('newly passed reports can create a draft inside their current still-running workflow only', async () => {
  const m = mock({ runStatus: 'in_progress' })
  assert.equal((await upsertDraft({ token: 'fixture', repo, state: state(), activeRun: '123', request: m.request })).status, 'created')
  const other = mock({ runStatus: 'in_progress' })
  await assert.rejects(upsertDraft({ token: 'fixture', repo, state: state(), activeRun: '456', request: other.request }), /check|baseline/i)
  assert.ok(!other.calls.some(x => x.method))
})

test('a bot-created branch survives a failed PR response and can be recovered without duplication', async () => {
  const m = mock({ branch: head, orphan: true, currentTree: tree })
  assert.equal((await upsertDraft({ token: 'fixture', repo, state: state(), request: m.request })).status, 'created')
  assert.ok(!m.calls.some(x => x.path.endsWith('/git/refs') || x.path.endsWith('/git/commits')))
})

test('recovery refuses extra content even with a bot author, matching marker and allowed filenames', async () => {
  const m = mock({ branch: head, orphan: true, currentTree: 'd'.repeat(40) })
  await assert.rejects(upsertDraft({ token: 'fixture', repo, state: state(), request: m.request }), /content|changed/i)
  assert.ok(!m.calls.some(x => x.path.endsWith('/git/commits') || x.path.endsWith('/git/refs') || x.path.endsWith('/pulls')))
})

test('recovery accepts the signed web-flow committer returned by real Actions API commits', async () => {
  const m = mock({ branch: head, orphan: true, currentTree: tree, committer: 'web-flow' })
  assert.equal((await upsertDraft({ token: 'fixture', repo, state: state(), request: m.request })).status, 'created')
  const unsigned = mock({ branch: head, orphan: true, currentTree: tree, committer: 'web-flow', verified: false })
  await assert.rejects(upsertDraft({ token: 'fixture', repo, state: state(), request: unsigned.request }), /managed|changed/i)
})

test('an interrupted PR-body update recovers the signed generated head without writing another commit', async () => {
  const m = mock({ prs: [pr({ body: `${prMarker}\n<!-- dsh-compat-head:${sha} -->` })], branch: head, orphan: true, currentTree: tree })
  assert.equal((await upsertDraft({ token: 'fixture', repo, state: state(), request: m.request })).status, 'updated')
  assert.ok(!m.calls.some(x => x.path.endsWith('/git/commits') || x.path.includes('/git/refs')))
})

test('backfill and closed-PR deduplication follow all pages', async () => {
  const m = mock({ prs: [pr({ state: 'closed' })] })
  const request = async (path, options) => {
    if (path.includes('/issues?') && path.endsWith('page=1')) return Array.from({ length: 100 }, (_, n) => ({ number: n + 20, user: { login: 'someone' }, body: marker(state()) }))
    if (path.includes('/issues?') && path.endsWith('page=2')) return [issue(state())]
    if (path.includes('/pulls?') && path.endsWith('page=1')) return Array.from({ length: 100 }, () => ({ head: { ref: 'other' } }))
    return m.request(path, options)
  }
  const results = await maintainDrafts({ token: 'fixture', repo, version, request })
  assert.equal(results[0].status, 'human-controlled')
  assert.equal(results[0].number, 14)
  assert.ok(!m.calls.some(x => x.method))
})

test('backfills a passed version from bot issues without rerunning checks or trusting input issue ids', async () => {
  const m = mock()
  const results = await maintainDrafts({ token: 'fixture', repo, version, request: m.request })
  assert.equal(results.length, 1)
  assert.equal(results[0].status, 'created')
  assert.ok(!m.calls.some(x => /dispatches|rerun/.test(x.path)))
  const spoof = mock({ foundIssues: [{ ...issue(state()), user: { login: 'someone' } }] })
  await assert.rejects(maintainDrafts({ token: 'fixture', repo, version, request: spoof.request }), /passed/i)
})

test('automatic scans skip incomplete and legacy issues; manual versions reject shell and URL input', async () => {
  const m = mock({ foundIssues: [issue({ ...state(), status: 'incomplete' })] })
  assert.deepEqual(await maintainDrafts({ token: 'fixture', repo, request: m.request }), [])
  for (const version of ['next', '0.2.1;echo hi', 'https://evil.test']) await assert.rejects(maintainDrafts({ token: 'fixture', repo, version, request: m.request }), /version/i)
})

test('writer workflow is isolated, supports backfill and cannot publish or merge', () => {
  const workflow = readFileSync('.github/workflows/dsh-compatibility.yml', 'utf8')
  const writer = workflow.split('  draft-pr:')[1]
  assert.ok(writer)
  assert.match(workflow, /options: \[check, draft-pr\]/)
  assert.match(writer, /contents: write/)
  assert.match(writer, /pull-requests: write/)
  assert.ok(!writer.includes('npm ci'))
  assert.ok(!writer.includes('actions: write'))
  assert.match(writer, /persist-credentials: false/)
})

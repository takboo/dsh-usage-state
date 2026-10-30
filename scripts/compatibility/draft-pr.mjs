import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { api } from './github.mjs'
import { matrixVersions } from './matrix.mjs'
import { botStates, compareVersions, exactVersion, SHA, validateTarget } from './state.mjs'

const stages = ['baseline-verify', 'dsh-contracts', 'web-host-command']
const bot = 'github-actions[bot]'
const branchName = version => `codex/dsh-compat-${version}`
const prMarker = version => `<!-- dsh-compat-pr-v1:${version} -->`
const evidencePath = version => `docs/compatibility/${version}.md`
const repoPattern = /^[\w.-]+\/[\w.-]+$/
const dependencyNames = /^node_modules\/@deepseek-ai\/(dsh|cordis|schemastery|dsh-typert-loader|dsh-typert-registry)$/

// An issue is durable evidence, not executable input. Older partial/legacy passes
// lack the exact-version proof required to propose a new regression candidate.
export function eligibleState(state) {
  try {
    const s = state?.summary
    validateTarget(state?.target)
    validateTarget(state?.checkedTarget)
    if (state.status !== 'passed' || s?.category !== 'passed' || !exactVersion(state.version) || state.version !== state.target.version || state.version !== state.checkedTarget.version || !state.checkedTarget.integrity || state.target.integrity !== state.checkedTarget.integrity || !SHA.test(s.sourceCommit || '') || !/^\d+$/.test(String(s.run)) || !Number.isSafeInteger(state.issue) || state.issue <= 0 || !Number.isFinite(Date.parse(state.lastAttemptAt))) return false
    if (!Array.isArray(s.stages) || s.stages.length > 30 || s.stages.some(x => x?.status !== 'passed' || typeof x.name !== 'string') || !stages.every(name => s.stages.some(x => x.name === name))) return false
    for (const name of ['platform', 'web']) if (!Array.isArray(s.dependencies?.[name]) || s.dependencies[name].length > 100 || s.dependencies[name].some(p => !dependencyNames.test(p?.path || '') || !exactVersion(p?.version))) return false
    const exact = (list, name) => Array.isArray(list) && list.some(p => p?.path === `node_modules/@deepseek-ai/${name}` && p.version === state.version)
    return exact(s.dependencies?.platform, 'dsh-typert-loader') && exact(s.dependencies?.platform, 'dsh-typert-registry') && exact(s.dependencies?.web, 'dsh')
  } catch { return false }
}

export function addMatrixVersion(content, version) {
  if (!exactVersion(version)) throw new Error('Expected an exact candidate version')
  const versions = matrixVersions(content)
  if (versions.includes(version)) return content
  const result = `${JSON.stringify({ versions: [...versions, version].sort(compareVersions) }, null, 2)}\n`
  matrixVersions(result)
  return result
}

export function renderEvidence(state, repo) {
  if (!eligibleState(state) || !repoPattern.test(repo)) throw new Error('Incomplete passed evidence')
  const s = state.summary
  const dependencies = Object.entries(s.dependencies).filter(([name]) => ['platform', 'web'].includes(name)).flatMap(([stage, list]) => list.filter(p => dependencyNames.test(p.path) && exactVersion(p.version)).map(p => `- ${stage}: \`${p.path.replace('node_modules/', '')}@${p.version}\``))
  return [
    `# DSH ${state.version}: automated compatibility evidence`, '',
    `- Result: passed; checked at ${new Date(state.lastAttemptAt).toISOString()}.`,
    `- Durable report: [Issue #${state.issue}](https://github.com/${repo}/issues/${state.issue}).`,
    `- Check: [Actions run ${s.run}](https://github.com/${repo}/actions/runs/${s.run}).`,
    `- Checked plugin commit: ${s.sourceCommit}`, `- Checked upstream commit: ${state.checkedTarget.commit || 'unavailable'}`,
    `- Observed upstream commit: ${state.target.commit || 'unavailable'} (source metadata may arrive after the check).`,
    `- Checked npm package: @deepseek-ai/dsh@${state.version}`, `- Checked package integrity: ${state.checkedTarget.integrity}`, '',
    '## Completed automated checks', '', ...s.stages.map(x => `- ${stages.includes(x.name) || ['host-metadata', 'platform-install'].includes(x.name) ? x.name : 'additional stage'}: passed`), '',
    '## Installed dependencies', '', ...dependencies, '',
    '## Review boundary', '',
    'The regression matrix adds an exact candidate for future changes. This evidence applies to the checked plugin commit above; subsequent commits require their own CI results.', '',
    'Web checks use fixture data. Real Desktop accounts, vendor balances, saved credential operations, inference and full visual acceptance remain unverified. This proposal does not change package versions, support declarations or release state.', '',
  ].join('\n')
}

function renderBody(state, repo, head) {
  return [prMarker(state.version), `<!-- dsh-compat-head:${head} -->`,
    `DSH ${state.version} passed the automated compatibility monitor. This proposal preserves the check evidence and adds the exact version to the ongoing RPC contract matrix.`, '',
    `Evidence: [Issue #${state.issue}](https://github.com/${repo}/issues/${state.issue}), [original check run ${state.summary.run}](https://github.com/${repo}/actions/runs/${state.summary.run}).`,
    `Checked plugin commit: \`${state.summary.sourceCommit}\`.`, '',
    'The original check predates this PR. Review CI for this PR separately; workflow-created PR runs may require approval in GitHub. Real Desktop accounts, credentials, vendor balances, inference and full visual acceptance remain pending.', '',
    'Package versions and support declarations are unchanged. Human review controls promotion, merge and release. Closing this PR prevents automatic recreation for the same version; human commits or promotion out of draft stop automatic branch updates.',
  ].join('\n')
}

async function allPages(path, request, field) {
  const values = []
  for (let page = 1; page <= 100; page++) {
    const data = await request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
    const list = field ? data[field] : data
    if (!Array.isArray(list)) throw new Error('Unexpected GitHub collection')
    values.push(...list)
    if (list.length < 100) return values
  }
  throw new Error('GitHub pagination limit exceeded')
}

// The adapter keeps credentials out of fixtures. All production requests use the
// same fixed GitHub origin; no upstream URLs or prose become request paths/code.
const client = (token, request) => request || ((path, options) => api(path, token, options))

export async function upsertDraft({ token, repo, state, baseBranch = '', activeRun = '', request }) {
  if (!token || !repoPattern.test(repo) || !eligibleState(state)) throw new Error('Expected valid passed check evidence')
  const call = client(token, request), root = `/repos/${repo}`, version = state.version, branch = branchName(version)
  const metadata = await call(root)
  const base = baseBranch || metadata.default_branch
  if (typeof base !== 'string' || !/^[\w./-]+$/.test(base) || base.includes('..')) throw new Error('Review base branch unavailable or invalid')
  const prs = await allPages(`${root}/pulls?state=all&head=${encodeURIComponent(`${repo.split('/')[0]}:${branch}`)}`, call)
  const matching = prs.filter(p => p.head?.ref === branch)
  if (matching.some(p => p.user?.login !== bot || p.head?.repo?.full_name !== repo || !p.body?.includes(prMarker(version)))) throw new Error('Candidate branch has a PR not managed by this monitor')
  if (matching.length > 1) throw new Error('Multiple managed PRs for one candidate; manual review required')
  const previous = matching[0]
  if (previous && (previous.state === 'closed' || previous.draft !== true || previous.base?.ref !== base)) return { status: 'human-controlled', number: previous.number, url: previous.html_url }
  let branchHead, recovering = false
  try { branchHead = (await call(`${root}/git/ref/heads/${encodeURIComponent(branch)}`)).object.sha } catch (error) { if (error.status !== 404) throw error }
  if (branchHead && (!previous || previous.head.sha !== branchHead || !previous.body.includes(`<!-- dsh-compat-head:${branchHead} -->`))) {
    // Recover a successful branch write followed by a failed/unknown PR API
    // response. Human commits do not carry the Actions bot's provenance.
    const commit = await call(`${root}/commits/${branchHead}`)
    const recordedHead = previous && /<!-- dsh-compat-head:([a-f0-9]{40}) -->/.exec(previous.body)?.[1]
    // GitHub signs Actions API commits with web-flow as the committer. The
    // author/committer display names alone can be supplied by another writer.
    const owned = commit.author?.login === bot && commit.commit?.verification?.verified === true && commit.commit.verification.reason === 'valid' && commit.commit?.message === `ci: track DSH ${version} compatibility\n\n${prMarker(version)}`
    const recoverable = previous
      ? previous.head.sha === branchHead && recordedHead && commit.parents?.some(p => p.sha === recordedHead)
      : commit.files?.length > 0 && commit.files.length <= 2 && commit.files.every(f => ['.github/dsh-compatibility.json', evidencePath(version)].includes(f.filename))
    if (!owned || !recoverable) throw new Error('Candidate branch changed or is not managed; preserving its contents')
    recovering = true
  }
  if (previous && !branchHead) throw new Error('Managed candidate branch is missing')

  const run = await call(`${root}/actions/runs/${state.summary.run}`)
  const completeOrCurrent = run.status === 'completed' || (run.status === 'in_progress' && String(state.summary.run) === activeRun)
  if (!completeOrCurrent || run.head_sha !== state.summary.sourceCommit || run.path !== '.github/workflows/dsh-compatibility.yml' || run.head_repository?.full_name !== repo || !['schedule', 'workflow_dispatch'].includes(run.event)) throw new Error('Original check baseline or workflow does not match')
  const jobs = await allPages(`${root}/actions/runs/${state.summary.run}/jobs`, call, 'jobs')
  if (!jobs.some(j => j.name.startsWith(`check (${version},`) && j.conclusion === 'success' && j.steps?.some(s => s.name === 'Check exact upstream contracts and baseline' && s.conclusion === 'success'))) throw new Error('Successful exact-version check job is missing')

  const baseSha = (await call(`${root}/git/ref/heads/${encodeURIComponent(base)}`)).object.sha
  if (!SHA.test(baseSha)) throw new Error('Invalid default branch commit')
  const baseTree = (await call(`${root}/git/commits/${baseSha}`)).tree.sha
  const file = await call(`${root}/contents/.github/dsh-compatibility.json?ref=${baseSha}`)
  if (file.type !== 'file' || file.encoding !== 'base64') throw new Error('CI version list unavailable; merge the matrix-reader feature or use its branch as the review base')
  const changes = [
    { path: '.github/dsh-compatibility.json', mode: '100644', type: 'blob', content: addMatrixVersion(Buffer.from(file.content, 'base64').toString('utf8'), version) },
    { path: evidencePath(version), mode: '100644', type: 'blob', content: renderEvidence(state, repo) },
  ]
  const nextTree = (await call(`${root}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree: changes }) })).sha
  let nextHead = branchHead
  const currentTree = branchHead && (await call(`${root}/git/commits/${branchHead}`)).tree.sha
  if (recovering && currentTree !== nextTree) throw new Error('Recoverable branch content changed; preserving its contents for manual review')
  if (!branchHead || currentTree !== nextTree) {
    const parents = [...new Set([baseSha, branchHead].filter(Boolean))]
    nextHead = (await call(`${root}/git/commits`, { method: 'POST', body: JSON.stringify({ message: `ci: track DSH ${version} compatibility\n\n${prMarker(version)}`, tree: nextTree, parents }) })).sha
    if (!SHA.test(nextHead)) throw new Error('Invalid generated commit')
    // A concurrent human push makes a non-force update fail instead of losing it.
    await call(`${root}/git/refs${branchHead ? `/heads/${encodeURIComponent(branch)}` : ''}`, { method: branchHead ? 'PATCH' : 'POST', body: JSON.stringify(branchHead ? { sha: nextHead, force: false } : { ref: `refs/heads/${branch}`, sha: nextHead }) })
  }
  const body = renderBody(state, repo, nextHead)
  if (previous && previous.body === body && nextHead === branchHead) return { status: 'unchanged', number: previous.number, url: previous.html_url }
  const response = await call(`${root}/pulls${previous ? `/${previous.number}` : ''}`, { method: previous ? 'PATCH' : 'POST', body: JSON.stringify(previous ? { body } : { title: `ci: verify DSH ${version} compatibility`, head: branch, base, body, draft: true, maintainer_can_modify: false }) })
  return { status: previous ? 'updated' : 'created', number: response.number, url: response.html_url }
}

export async function maintainDrafts({ token, repo, version = '', baseBranch = '', activeRun = '', request }) {
  version = version.replace(/^dsh-v/, '')
  if (version && !exactVersion(version)) throw new Error('Expected an exact version for Draft PR backfill')
  if (!token || !repoPattern.test(repo)) throw new Error('GitHub token and repository are required')
  const call = client(token, request)
  const issues = await allPages(`/repos/${repo}/issues?state=all`, call)
  const states = [...botStates(issues).values()].filter(s => (!version || s.version === version) && eligibleState(s)).sort((a, b) => compareVersions(b.version, a.version))
  if (version && !states.length) throw new Error('No complete passed bot report for requested version')
  const results = [], failures = []
  for (const state of states) {
    try {
      const result = { version: state.version, ...await upsertDraft({ token, repo, state, baseBranch, activeRun, request }) }
      results.push(result)
      console.log(JSON.stringify(result))
    } catch (error) {
      failures.push(`${state.version}: ${error.message}`)
    }
  }
  if (failures.length) throw new Error(`Draft PR maintenance needs attention: ${failures.join('; ')}`)
  return results
}

async function main() {
  const results = await maintainDrafts({ token: process.env.GH_TOKEN, repo: process.env.GITHUB_REPOSITORY, version: process.env.DSH_PR_VERSION || '', baseBranch: process.env.DSH_PR_BASE || '', activeRun: process.env.GITHUB_RUN_ID || '' })
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['## Compatibility Draft PRs', '', ...results.map(r => `- ${r.version}: ${r.status} — ${r.url}`), ''].join('\n'))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })

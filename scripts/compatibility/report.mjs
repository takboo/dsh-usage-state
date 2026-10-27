import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { api, pages } from './github.mjs'
import { botStates, marker, mergeTarget, validateTarget, SHA, MAX_ATTEMPTS } from './state.mjs'

const incomplete = reason => ({ status: 'incomplete', category: 'infrastructure', completed: false, reason, stages: [], dependencies: {} })
export function normalizeReport(report, target) {
  if (!report || report.version !== target.version || report.integrity !== target.integrity || !['passed', 'failed', 'incomplete'].includes(report.status) || report.completed !== (report.status !== 'incomplete')) return incomplete('Missing, interrupted, malformed or mismatched check report; verification is unfinished.')
  if (!Array.isArray(report.stages) || report.stages.some(s => !s || typeof s.name !== 'string' || !['passed', 'failed', 'incomplete'].includes(s.status)) || !report.dependencies || typeof report.dependencies !== 'object' || Object.values(report.dependencies).some(list => !Array.isArray(list) || list.some(p => !p || typeof p.path !== 'string' || typeof p.version !== 'string'))) return incomplete('Malformed stage or dependency evidence; check remains unfinished.')
  if (report.status === 'passed') {
    const stages = ['baseline-verify', 'dsh-contracts', 'web-host-command']
    const platform = report.dependencies?.platform || [], web = report.dependencies?.web || []
    const exact = (list, name) => Array.isArray(list) && list.some(p => p.path === `node_modules/@deepseek-ai/${name}` && p.version === target.version && (name !== 'dsh' || p.integrity === target.integrity))
    if (report.category !== 'passed' || report.stages.some(s => s.status !== 'passed') || !target.integrity || !stages.every(name => report.stages?.some(s => s.name === name && s.status === 'passed')) || !exact(platform, 'dsh-typert-loader') || !exact(platform, 'dsh-typert-registry') || !exact(web, 'dsh')) return incomplete('Missing exact-version stages or dependency evidence; a baseline pass alone is insufficient.')
  }
  if (report.status === 'failed' && !['baseline_failure', 'incompatible'].includes(report.category)) return incomplete('Invalid failure classification; check remains unfinished.')
  return report
}
export function buildState(item, previous, report, { now = new Date().toISOString(), run, sourceCommit }) {
  validateTarget(item.target)
  if (item.mode === 'update' && previous) return { ...previous, target: mergeTarget(previous.target, item.target) }
  const normalized = normalizeReport(report, item.target)
  const dependencies = Object.fromEntries(Object.entries(normalized.dependencies || {}).filter(([stage]) => ['platform', 'web'].includes(stage)).map(([stage, list]) => [stage, Array.isArray(list) ? list.filter(p => /^node_modules\/@deepseek-ai\/(dsh|cordis|schemastery|dsh-typert-loader|dsh-typert-registry)$/.test(p.path)).map(p => ({ path: p.path, version: p.version })) : []]))
  return { version: item.target.version, target: mergeTarget(previous?.target, item.target), checkedTarget: item.target, status: normalized.status, autoAttempts: (previous?.autoAttempts || 0) + (item.manual ? 0 : 1), lastAttemptAt: now, retryable: normalized.status === 'incomplete', summary: { category: normalized.category, reason: String(normalized.reason || '').slice(0, 1500), stages: normalized.stages.slice(0, 30).map(s => ({ name: s.name.slice(0, 100), status: s.status })), dependencies, run, sourceCommit, manual: item.manual } }
}
// Treat prose as text, including Markdown links/mentions and HTML. URLs below are constructed locally.
const safe = value => String(value ?? 'unavailable').slice(0, 1500).replace(/[\r\n]/g, ' ').replace(/[^\x20-\x7e]/g, '?').replace(/[\\`*_{}\[\]()<>!#|@]/g, c => `&#${c.charCodeAt(0)};`)
export function renderBody(state, repo) {
  const { target: t, summary: s = {} } = state
  const sources = (t?.sources || []).map(x => `- ${x.kind === 'github' ? `GitHub [${safe(x.tag)}](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v${state.version}) (release ${x.id})` : `npm ${safe(x.channel)}`} — published: ${safe(x.published_at)}; source commit: ${safe(x.commit)}`)
  const stages = (Array.isArray(s.stages) ? s.stages : []).slice(0, 30).map(x => `- ${safe(x.name)}: ${safe(x.status)}`)
  const deps = Object.entries(s.dependencies || {}).map(([stage, list]) => `- ${safe(stage)}: ${safe(list.map(p => `${p.path.replace('node_modules/', '')}@${p.version}`).join(', '))}`)
  const retryNote = state.status !== 'incomplete' ? 'Completed test failures do not automatically rerun. Dispatch an exact version to recheck; human review is required before changing support.' : !state.retryable || state.autoAttempts >= MAX_ATTEMPTS ? 'Unfinished verification. Automatic retries are exhausted or disabled for this legacy result. Dispatch an exact version to recheck manually.' : 'Unfinished verification. Infrastructure failures retry after at least six hours, with at most three total automatic executions. Dispatch an exact version to recheck manually.'
  return [marker(state), `DSH exact version: **${state.version}**`, ...sources,
    `Pinned package integrity: ${safe(t?.integrity)}`, `Pinned source baseline: ${safe(t?.commit)}`,
    `Result: **${state.status}**; classification: ${safe(s.category)}; automatic executions: ${state.autoAttempts}/${MAX_ATTEMPTS}; last attempt: ${safe(state.lastAttemptAt)}`,
    SHA.test(s.sourceCommit || '') ? `Plugin source baseline: \`${s.sourceCommit}\`` : 'Plugin source baseline: unavailable (legacy report)',
    /^\d+$/.test(String(s.run)) ? `Check: [Actions run ${s.run}](https://github.com/${repo}/actions/runs/${s.run})` : 'Check run: unavailable (legacy report)',
    `Checked package integrity: ${safe(state.checkedTarget?.integrity)}; checked source: ${safe(state.checkedTarget?.commit)}`,
    '', ...stages, ...deps, '', `Detail: ${safe(s.reason || 'Legacy result retained; exact-version evidence has not been revalidated by this workflow.')}`, '',
    'Artifacts retain reports, necessary logs and failure screenshots for 14 days. This issue preserves the summary, source baselines and check run after artifacts expire.',
    'Automated evidence does not expand the supported range. Real Desktop accounts, vendor balances, saved credential operations, inference and full visual acceptance remain unverified.',
    retryNote,
  ].join('\n')
}
export async function publish({ token, repo, item, report, run, sourceCommit }) {
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !/^\d+$/.test(run || '') || !SHA.test(sourceCommit || '') || !['check', 'update'].includes(item.mode) || typeof item.manual !== 'boolean') throw new Error('Invalid report metadata')
  validateTarget(item.target)
  // Re-read authoritative bot issues, including closed issues, instead of trusting a supplied issue number.
  const [issues, releases] = await Promise.all([pages(`/repos/${repo}/issues?state=all`, token), pages('/repos/deepseek-ai/deepseek-harness/releases', token)])
  const previous = botStates(issues, releases).get(item.target.version)
  const state = buildState(item, previous, report, { run, sourceCommit })
  const body = renderBody(state, repo)
  if (body.length > 65000) throw new Error('Issue report exceeds GitHub size limit')
  const response = await api(`/repos/${repo}/issues${previous ? `/${previous.issue}` : ''}`, token, { method: previous ? 'PATCH' : 'POST', body: JSON.stringify({ ...(previous ? {} : { title: `DSH compatibility check: ${item.target.version}` }), body }) })
  console.log(`Report: ${response.html_url}`)
}
async function main() {
  let report
  try { if (process.env.REPORT_ARTIFACT_OK === 'success') report = JSON.parse(readFileSync(process.argv[2], 'utf8')) } catch { /* Missing artifacts are explicitly incomplete. */ }
  await publish({ token: process.env.GH_TOKEN, repo: process.env.GITHUB_REPOSITORY, item: JSON.parse(process.env.DSH_ITEM || 'null'), report, run: process.env.GITHUB_RUN_ID, sourceCommit: process.env.GITHUB_SHA })
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })

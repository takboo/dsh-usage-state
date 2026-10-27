import { readFileSync } from 'node:fs'
import { TAG } from './discover.mjs'

const { GH_TOKEN: token, GITHUB_REPOSITORY: repo, DSH_TAG: tag, RELEASE_ID: id, DSH_COMMIT: commit, DSH_PUBLISHED: published, ISSUE_NUMBER: issue, ATTEMPTS: attempts, GITHUB_RUN_ID: run, GITHUB_SHA: sourceCommit } = process.env
if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !TAG.test(tag || '') || !/^\d+$/.test(id || '') || !/^[a-f0-9]{40}$/.test(commit || '') || !/^\d+$/.test(run || '') || !/^\d+$/.test(issue || '') || !/^\d+$/.test(attempts || '') || Number(attempts) > 100000 || !/^[a-f0-9]{40}$/.test(sourceCommit || '')) throw new Error('Invalid report metadata')
let report
try { report = JSON.parse(readFileSync(process.argv[2], 'utf8')) } catch { report = { status: 'retry', stages: [], reason: 'The check did not produce a report; runner or setup failed.' } }
if (!['passed', 'partial', 'failed', 'retry'].includes(report.status)) throw new Error('Invalid report status')
const safe = value => String(value || '').replace(/[\r\n`<>]/g, ' ').slice(0, 500)
const lines = (Array.isArray(report.stages) ? report.stages : []).map(s => `- ${safe(s.name)}: ${safe(s.status)}`)
const body = [
  `<!-- dsh-compat:${id}:${report.status}:${Number(attempts) + 1} -->`,
  `Upstream: [${tag}](https://github.com/deepseek-ai/deepseek-harness/releases/tag/${tag})`,
  `Upstream commit: \`${commit}\`; published: ${safe(published)}`,
  `Check: [Actions run ${run}](https://github.com/${repo}/actions/runs/${run}); plugin source commit: \`${sourceCommit}\``,
  `Result: **${report.status}**`, '', ...lines, '',
  `Detail: ${safe(report.reason)}`, '',
  'This is automated evidence, not a compatibility declaration. See the run artifacts for logs. Real Desktop accounts, saved credentials, and full visual acceptance remain unverified.',
  report.status === 'retry' ? 'The monitor retries after six hours, up to three attempts; a maintainer can also dispatch the exact tag.' : 'Dispatch this exact tag to repeat the check. Human review is required before changing the supported range.',
].join('\n')
const response = await fetch(`https://api.github.com/repos/${repo}/issues${issue !== '0' ? `/${issue}` : ''}`, {
  method: issue !== '0' ? 'PATCH' : 'POST',
  headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'dsh-usage-state-compatibility' },
  body: JSON.stringify(issue !== '0' ? { body } : { title: `DSH compatibility check: ${tag}`, body }),
  signal: AbortSignal.timeout(30000),
})
if (!response.ok) throw new Error(`Issue report failed: HTTP ${response.status} ${await response.text()}`)
console.log(`Report: ${(await response.json()).html_url}`)

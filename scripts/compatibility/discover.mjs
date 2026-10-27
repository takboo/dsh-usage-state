import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// The last release reviewed before this monitor was introduced. Use release time,
// not SemVer ordering: a maintenance release on an older line is still relevant.
export const BASELINE_TIME = '2026-10-23T15:26:39Z'
export const TAG = /^dsh-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/
export const MARKER = /<!-- dsh-compat:(\d+):(passed|partial|failed|retry):(\d+) -->/

export function selectReleases(releases, issues, { now = Date.now(), manual = '' } = {}) {
  if (manual && !TAG.test(manual)) throw new Error('Expected an exact dsh-vX.Y.Z or dsh-vX.Y.Z-rc.N tag')
  const seen = new Map()
  for (const issue of issues) {
    if (issue.pull_request || issue.user?.login !== 'github-actions[bot]') continue
    const match = MARKER.exec(issue.body || '')
    if (match) seen.set(Number(match[1]), { status: match[2], attempts: Number(match[3]), updated: Date.parse(issue.updated_at), number: issue.number })
  }
  const selected = releases.filter(release => {
    if (release.draft || !TAG.test(release.tag_name) || !release.published_at || !Number.isSafeInteger(release.id)) return false
    if (manual) return release.tag_name === manual
    if (Date.parse(release.published_at) <= Date.parse(BASELINE_TIME)) return false
    const previous = seen.get(release.id)
    return !previous || (previous.status === 'retry' && previous.attempts < 3 && now - previous.updated >= 6 * 60 * 60 * 1000)
  }).sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at)).slice(0, 10)
  if (manual && selected.length !== 1) throw new Error(`Published upstream release not found: ${manual}`)
  return selected.map(r => ({ id: r.id, tag: r.tag_name, version: r.tag_name.slice(5), published_at: r.published_at, issue: seen.get(r.id)?.number || 0, attempts: seen.get(r.id)?.attempts || 0 }))
}

async function api(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-usage-state-compatibility', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`GitHub API ${path}: HTTP ${response.status}`)
  return response.json()
}
async function pages(path, token) {
  const result = []
  for (let page = 1; page <= 100; page++) {
    const data = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, token)
    if (!Array.isArray(data)) throw new Error(`Unexpected GitHub response for ${path}`)
    result.push(...data)
    if (data.length < 100) return result
  }
  throw new Error(`Pagination limit exceeded for ${path}`)
}

async function main() {
  const token = process.env.GH_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new Error('GH_TOKEN and GITHUB_REPOSITORY are required')
  const [releases, issues] = await Promise.all([
    pages('/repos/deepseek-ai/deepseek-harness/releases', token),
    pages(`/repos/${repo}/issues?state=all`, token),
  ])
  const selected = selectReleases(releases, issues, { manual: process.env.DSH_TAG || '' })
  for (const release of selected) {
    const commit = await api(`/repos/deepseek-ai/deepseek-harness/commits/${encodeURIComponent(release.tag)}`, token)
    if (!/^[a-f0-9]{40}$/.test(commit.sha || '')) throw new Error(`Invalid commit for ${release.tag}`)
    release.commit = commit.sha
  }
  const matrix = JSON.stringify({ include: selected })
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${matrix}\ncount=${selected.length}\n`)
  console.log(matrix)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })

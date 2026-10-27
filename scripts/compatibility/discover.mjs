import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { api, pages } from './github.mjs'
import { BASELINE_TIME, RETRY_MS, MAX_ATTEMPTS, SHA, exactVersion, tagVersion, botStates, compareVersions, mergeTarget, validateTarget } from './state.mjs'
export { TAG } from './state.mjs'

/** All upstream fields are data. Never derive executable/package names from them. */
export function selectTargets(releases, packument, issues, { now = Date.now(), manual = '' } = {}) {
  manual = manual.replace(/^dsh-v/, '')
  if (manual && !exactVersion(manual)) throw new Error('Expected an exact version or dsh-vX.Y.Z[-prerelease] tag')
  const states = botStates(issues, releases)
  const candidates = new Map()
  const add = (version, source) => {
    if (!exactVersion(version) || (manual && version !== manual)) return
    if (!candidates.has(version)) candidates.set(version, [])
    candidates.get(version).push({ ...source })
  }
  for (const r of releases) {
    if (!r.draft && exactVersion(tagVersion(r.tag_name)) && Number.isSafeInteger(r.id) && Number.isFinite(Date.parse(r.published_at))) {
      add(tagVersion(r.tag_name), { kind: 'github', id: r.id, tag: r.tag_name, published_at: r.published_at, ...(SHA.test(r.commit || '') ? { commit: r.commit } : {}) })
    }
  }
  for (const channel of ['latest', 'next']) {
    const version = packument['dist-tags']?.[channel]
    if (!exactVersion(version)) continue
    // A moving npm tag must never cause an automatic downgrade, even to an unseen version.
    const higher = [...states.values()].some(s => s.target?.sources?.some(x => x.kind === 'npm' && x.channel === channel) && compareVersions(s.version, version) > 0)
    if (higher && !manual && !states.has(version)) continue
    if (Number.isFinite(Date.parse(packument.time?.[version]))) add(version, { kind: 'npm', channel, published_at: packument.time[version] })
  }
  if (manual && packument.versions?.[manual] && Number.isFinite(Date.parse(packument.time?.[manual]))) add(manual, { kind: 'npm', channel: 'exact', published_at: packument.time[manual] })
  // Retry the pinned version even when neither moving tag points at it any more.
  for (const s of states.values()) if (s.target) for (const source of s.target.sources) add(s.version, source)
  const selected = []
  for (const [version, sources] of candidates) {
    const previous = states.get(version)
    if (!manual && !previous && !sources.some(s => Date.parse(s.published_at) > Date.parse(BASELINE_TIME))) continue
    const pkg = packument.versions?.[version]
    const npmCommit = SHA.test(pkg?.gitHead || '') ? pkg.gitHead : null
    const current = validateTarget({ version, sources, published_at: packument.time?.[version] || sources[0].published_at, integrity: pkg?.dist?.integrity || null, tarball: pkg?.dist?.tarball || null, commit: npmCommit || sources.find(s => s.commit)?.commit || pkg?.sourceCommit || null })
    if (npmCommit) for (const s of current.sources) if (s.kind === 'npm') s.commit = npmCommit
    const target = validateTarget(mergeTarget(previous?.target, current))
    const changed = !previous?.target || JSON.stringify(target) !== JSON.stringify(previous.target)
    const retry = previous?.status === 'incomplete' && previous.retryable && previous.autoAttempts < MAX_ATTEMPTS && now - Date.parse(previous.lastAttemptAt) >= RETRY_MS
    const mode = manual || !previous || retry ? 'check' : 'update'
    if (mode === 'update' && !changed) continue
    selected.push({ version, target, mode, manual: Boolean(manual), issue: previous?.issue || 0 })
  }
  selected.sort((a, b) => Date.parse(a.target.published_at) - Date.parse(b.target.published_at))
  if (manual && selected.length !== 1) throw new Error(`Published upstream version not found: ${manual}`)
  return selected.slice(0, 10)
}

export async function discover({ token, repo, manual = '' }) {
  const registry = await fetch('https://registry.npmjs.org/@deepseek-ai%2fdsh', { signal: AbortSignal.timeout(30000) })
  if (!registry.ok) throw new Error(`npm registry: HTTP ${registry.status}`)
  const [releases, issues, packument] = await Promise.all([
    pages('/repos/deepseek-ai/deepseek-harness/releases', token), pages(`/repos/${repo}/issues?state=all`, token), registry.json(),
  ])
  // Resolve exact official tags even before a GitHub Release exists (npm-first).
  const versions = new Set([
    ...releases.filter(r => !r.draft && (manual || Date.parse(r.published_at) > Date.parse(BASELINE_TIME))).map(r => tagVersion(r.tag_name)),
    ...['latest', 'next'].map(channel => packument['dist-tags']?.[channel]),
    ...botStates(issues, releases).keys(), manual.replace(/^dsh-v/, ''),
  ].filter(exactVersion))
  for (const version of versions) {
    try {
      const commit = (await api(`/repos/deepseek-ai/deepseek-harness/commits/dsh-v${version}`, token)).sha
      if (!SHA.test(commit || '')) continue
      for (const r of releases) if (r.tag_name === `dsh-v${version}`) r.commit = commit
      if (packument.versions?.[version]) packument.versions[version].sourceCommit = commit
    } catch { /* Source commit can be unavailable; record that explicitly. */ }
  }
  return selectTargets(releases, packument, issues, { manual })
}
async function main() {
  const token = process.env.GH_TOKEN, repo = process.env.GITHUB_REPOSITORY
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new Error('GH_TOKEN and GITHUB_REPOSITORY are required')
  const selected = await discover({ token, repo, manual: process.env.DSH_TAG || '' })
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify({ include: selected })}\ncount=${selected.length}\n`)
  console.log(JSON.stringify({ include: selected }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })

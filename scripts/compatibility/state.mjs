export const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/
export const TAG = /^dsh-v(.+)$/
export const BASELINE_TIME = '2026-10-23T15:26:39Z'
export const RETRY_MS = 6 * 60 * 60 * 1000
export const MAX_ATTEMPTS = 3 // total automatic executions, including the first
export const SHA = /^[a-f0-9]{40}$/
export const INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/
export const exactVersion = value => typeof value === 'string' && value.length <= 128 && VERSION.test(value)
export const tagVersion = tag => TAG.exec(tag || '')?.[1]
export const marker = state => `<!-- dsh-compat-v2:${Buffer.from(JSON.stringify(state)).toString('base64')} -->`

export function compareVersions(a, b) {
  const [aa] = a.split('-'), [bb] = b.split('-')
  const ap = a.includes('-') ? a.slice(aa.length + 1) : '', bp = b.includes('-') ? b.slice(bb.length + 1) : ''
  const ac = aa.split('.').map(BigInt), bc = bb.split('.').map(BigInt)
  for (let i = 0; i < 3; i++) if (ac[i] !== bc[i]) return ac[i] > bc[i] ? 1 : -1
  if (ap === bp) return 0
  if (!ap || !bp) return !ap ? 1 : -1
  const ax = a.slice(aa.length + 1).split('.'), bx = b.slice(bb.length + 1).split('.')
  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    if (ax[i] === bx[i]) continue
    if (ax[i] === undefined || bx[i] === undefined) return ax[i] === undefined ? -1 : 1
    const an = /^\d+$/.test(ax[i]), bn = /^\d+$/.test(bx[i])
    if (an && bn) return BigInt(ax[i]) > BigInt(bx[i]) ? 1 : -1
    if (an !== bn) return an ? -1 : 1
    return ax[i] > bx[i] ? 1 : -1
  }
  return 0
}
export function botStates(issues, releases = []) {
  const states = new Map()
  // Oldest issue wins if pre-existing duplicate issues exist.
  for (const issue of [...issues].sort((a, b) => a.number - b.number)) {
    if (issue.pull_request || issue.user?.login !== 'github-actions[bot]') continue
    let state
    try {
      const encoded = /<!-- dsh-compat-v2:([A-Za-z0-9+/=]+) -->/.exec(issue.body || '')?.[1]
      if (encoded) state = JSON.parse(Buffer.from(encoded, 'base64').toString())
      else {
        const old = /<!-- dsh-compat:(\d+):(passed|partial|failed|retry):(\d+) -->/.exec(issue.body || '')
        const release = old && releases.find(r => r.id === Number(old[1]))
        if (release) state = { version: tagVersion(release.tag_name), status: ['retry', 'partial'].includes(old[2]) ? 'incomplete' : old[2], autoAttempts: Number(old[3]), lastAttemptAt: issue.updated_at, summary: { run: /Actions run (\d+)/.exec(issue.body)?.[1], sourceCommit: /plugin source commit: `([a-f0-9]{40})`/.exec(issue.body)?.[1], category: 'legacy', reason: /Detail: ([^\n]+)/.exec(issue.body)?.[1], stages: [] }, retryable: old[2] === 'retry', legacy: true }
      }
      if (!state || !exactVersion(state.version) || !['passed', 'partial', 'failed', 'incomplete'].includes(state.status) || !Number.isSafeInteger(state.autoAttempts) || state.autoAttempts < 0) continue
      if (!states.has(state.version)) states.set(state.version, { ...state, issue: issue.number })
    } catch { /* Malformed issue metadata cannot suppress a check. */ }
  }
  return states
}
export function validateTarget(t) {
  if (!t || !exactVersion(t.version) || !Array.isArray(t.sources) || t.sources.length > 100) throw new Error('Invalid target')
  if (t.integrity !== null && !INTEGRITY.test(t.integrity || '')) throw new Error('Invalid package integrity')
  if (t.tarball !== null && t.tarball !== `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${t.version}.tgz`) throw new Error('Unofficial package URL')
  if (t.commit !== null && !SHA.test(t.commit || '')) throw new Error('Invalid source commit')
  for (const s of t.sources) {
    if (!['github', 'npm'].includes(s.kind) || !Number.isFinite(Date.parse(s.published_at))) throw new Error('Invalid source')
    if (s.kind === 'github' && (s.tag !== `dsh-v${t.version}` || !Number.isSafeInteger(s.id))) throw new Error('Invalid release')
    if (s.kind === 'npm' && !['latest', 'next', 'exact'].includes(s.channel)) throw new Error('Invalid channel')
    if (s.commit && !SHA.test(s.commit)) throw new Error('Invalid source commit')
  }
  return t
}
export function mergeTarget(previous, current) {
  if (!previous) return current
  const sources = new Map(previous.sources.map(s => [s.kind === 'github' ? `github:${s.id}` : `npm:${s.channel}`, s]))
  for (const s of current.sources) {
    const key = s.kind === 'github' ? `github:${s.id}` : `npm:${s.channel}`
    sources.set(key, { ...sources.get(key), ...s })
  }
  return { ...current, ...previous, sources: [...sources.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), integrity: previous.integrity || current.integrity, tarball: previous.tarball || current.tarball, commit: previous.commit || current.commit }
}

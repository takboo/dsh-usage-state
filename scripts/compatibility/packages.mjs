import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { INTEGRITY, exactVersion, validateTarget } from './state.mjs'

const PLATFORM = new Set(['@deepseek-ai/cordis', '@deepseek-ai/schemastery', '@deepseek-ai/dsh-typert-loader', '@deepseek-ai/dsh-typert-registry'])
export function platformSpecs(deps, version) {
  if (!exactVersion(version)) throw new Error('Invalid exact version')
  return [...PLATFORM].map(name => {
    const range = name.includes('dsh-typert-') ? version : deps[name]
    if (!/^[~^]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(range || '')) throw new Error(`Unsupported official dependency range: ${name}`)
    return `${name}@${range}`
  })
}
export function verifyIntegrity(bytes, integrity) {
  if (!INTEGRITY.test(integrity || '') || `sha512-${createHash('sha512').update(bytes).digest('base64')}` !== integrity) throw new Error('Pinned npm integrity mismatch')
}
export async function downloadTarget(target, dir) {
  validateTarget(target)
  if (!target.tarball || !target.integrity) throw new Error('Exact official npm package is not available yet')
  const response = await fetch(target.tarball, { redirect: 'error', signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw new Error(`Package download: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  verifyIntegrity(bytes, target.integrity)
  const file = join(dir, 'dsh.tgz')
  writeFileSync(file, bytes)
  return file
}
/** Persist the actual lock resolution, including transitives, without copying dependencies. */
export function inventory(root) {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
  // npm can key prefixed installs by a path relative to its invocation directory.
  // Keep package-tree paths, excluding machine-specific temporary prefixes.
  return Object.entries(lock.packages || {}).filter(([path, p]) => path.includes('node_modules/') && typeof p.version === 'string').map(([path, p]) => ({ path: path.slice(path.indexOf('node_modules/')), version: p.version, integrity: p.integrity || null }))
}

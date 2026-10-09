import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

export const ROOT = fileURLToPath(new URL('../', import.meta.url))
export const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
export const packageJson = () => readJson(path.join(ROOT, 'package.json'))
export const fail = message => { throw new Error(message) }
// SemVer 2.0: https://semver.org/ (numeric prerelease identifiers cannot have leading zeros).
export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

export function command(program, args, options = {}) {
  const result = spawnSync(program, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) fail(`${program} ${args.join(' ')} failed (${result.status}): ${result.stderr?.toString().trim() || result.stdout?.toString().trim()}`)
  return result.stdout
}

export function npm(args, options = {}) {
  return process.env.npm_execpath
    ? command(process.execPath, [process.env.npm_execpath, ...args], options)
    : command(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, options)
}

export function relativeFile(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a path`)
  const normalized = value.replace(/^\.\//, '')
  assert.ok(normalized && !path.posix.isAbsolute(normalized) && !normalized.includes('\\') && !normalized.split('/').includes('..') && !normalized.includes('\0'), `${label} leaves the package`)
  return normalized
}

export function exportFiles(manifest) {
  const files = new Set()
  const visit = value => {
    if (typeof value === 'string') {
      assert.ok(value.startsWith('./') && !value.includes('*'), `export must be an explicit package path: ${value}`)
      files.add(relativeFile(value, 'export'))
    } else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') Object.values(value).forEach(visit)
    else assert.ok(value === null, 'invalid export target')
  }
  visit(manifest.exports)
  if (manifest.main) files.add(relativeFile(manifest.main, 'main'))
  return files
}

export function publishedFiles(manifest) {
  const files = new Set(['package.json', 'README.md', 'LICENSE'])
  const exports = exportFiles(manifest)
  for (const entry of manifest.files ?? []) {
    const file = relativeFile(entry, 'files entry')
    if (file === 'lib') {
      for (const target of exports) if (target.startsWith('lib/')) files.add(target)
    } else {
      assert.ok(!file.includes('*'), 'publish whitelist must use explicit files')
      files.add(file)
    }
  }
  for (const target of exports) assert.ok(files.has(target), `export not declared in files: ${target}`)
  const patch = relativeFile(manifest.dsh?.bundle?.patch, 'bundle patch')
  assert.ok(files.has(patch), 'bundle patch not declared in files')
  return files
}

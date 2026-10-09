import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, SEMVER, npm, packageJson, publishedFiles, readJson } from './verify-support.mjs'

const manifest = packageJson()
const lock = readJson(path.join(ROOT, 'package-lock.json'))
assert.match(manifest.version, SEMVER, 'package version must be SemVer')
assert.equal(lock.name, manifest.name, 'lockfile name differs')
assert.equal(lock.version, manifest.version, 'lockfile root version differs')
assert.equal(lock.packages?.['']?.name, manifest.name, 'lockfile package name differs')
assert.equal(lock.packages?.['']?.version, manifest.version, 'lockfile package version differs')
for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'engines']) {
  assert.deepEqual(lock.packages[''][field] ?? {}, manifest[field] ?? {}, `lockfile ${field} differs`)
}
assert.match(manifest.packageManager, /^npm@\d+\.\d+\.\d+$/, 'packageManager must pin npm')
const npmVersion = manifest.packageManager.slice(4)
assert.equal(npm(['--version']).trim(), npmVersion, `use pinned ${manifest.packageManager}`)
const [major, minor] = npmVersion.split('.').map(Number)
assert.ok(major > 11 || (major === 11 && minor >= 5), 'npm trusted publishing requires npm >=11.5.1')
if (major === 11 && minor === 5) assert.ok(Number(npmVersion.split('.')[2]) >= 1)
const nodeVersion = readFileSync(path.join(ROOT, '.node-version'), 'utf8').trim()
assert.match(nodeVersion, /^24\.\d+\.\d+$/, 'canonical Node must pin a Node 24 release')
assert.ok(Number(nodeVersion.split('.')[1]) >= 11, 'canonical Node must satisfy tsdown >=24.11')
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number)
assert.ok((nodeMajor === 22 && nodeMinor >= 18) || (nodeMajor === 24 && nodeMinor >= 11) || nodeMajor > 24, 'development requires Node 22.18+ on 22, or >=24.11')
for (const lifecycle of ['prepare', 'prepack', 'install', 'postinstall']) {
  assert.equal(manifest.scripts?.[lifecycle], undefined, `${lifecycle} would change the prebuilt installation contract`)
}
publishedFiles(manifest)
assert.equal(manifest.dsh?.client?.platform, 'web')
console.log(`Metadata verified: ${manifest.name}@${manifest.version}; canonical Node ${nodeVersion}; ${manifest.packageManager}`)

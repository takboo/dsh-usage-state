// Supplemental probe for the legacy peer diagnostic the locked runner cannot accept.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const [reportFile, artifactPath] = process.argv.slice(2)
const report = JSON.parse(readFileSync(reportFile, 'utf8'))
const target = report.checks.find(check => check.expectation === 'refuse')
assert.equal(process.platform, 'linux')
assert.equal(report.mode, 'cli')
assert.equal(target?.stages.setup, 'passed')
const { name, version, enginesDsh, sourceCommit, sha256 } = report.plugin
const artifact = resolve(artifactPath)
const hash = (path, algorithm, encoding) => createHash(algorithm).update(readFileSync(path)).digest(encoding)
assert.equal(hash(artifact, 'sha256', 'hex'), sha256, 'Expected the same candidate as the base report')

const root = mkdtempSync(join(tmpdir(), 'dsh-engineering-peer-'))
const host = join(root, 'host')
const env = {
  PATH: `${join(host, 'node_modules/.bin')}:${process.env.PATH}`,
  HOME: join(root, 'home'), DSH_HOME: join(root, 'dsh'), TMPDIR: root, CI: 'true',
  npm_config_cache: join(root, 'cache'), npm_config_registry: 'https://registry.npmjs.org',
  npm_config_userconfig: join(root, 'user.npmrc'), npm_config_globalconfig: join(root, 'global.npmrc'),
  npm_config_ignore_scripts: 'true',
}

function run(program, args) {
  const result = spawnSync(program, args, { cwd: host, env, encoding: 'utf8', timeout: 480_000 })
  if (result.error) throw result.error
  return result
}

function success(program, args) {
  const result = run(program, args)
  assert.equal(result.status, 0, `${program} ${args[0]} failed: ${result.stderr}`)
  return result.stdout.trim()
}

try {
  for (const dir of [host, env.HOME, env.DSH_HOME]) mkdirSync(dir)
  writeFileSync(join(host, 'package.json'), '{"name":"dsh-engineering-peer-host","private":true}\n')
  writeFileSync(env.npm_config_userconfig, 'ignore-scripts=true\n')
  writeFileSync(env.npm_config_globalconfig, '')
  const packed = success('npm', ['pack', '--ignore-scripts', '--silent', `@deepseek-ai/dsh@${target.version}`])
  const hostTarball = join(host, packed)
  assert.equal(`sha512-${hash(hostTarball, 'sha512', 'base64')}`, target.integrity)
  success('npm', ['install', '--save-exact', '--ignore-scripts', '--no-audit', '--no-fund', hostTarball, `pnpm@${report.pnpm}`])
  assert.equal(success('dsh', ['--version']), target.version)

  const dump = ['--profile', 'probe', '--dump-config']
  success('dsh', ['--from-default-profile', 'web', ...dump])
  const manifest = join(env.DSH_HOME, 'profiles/probe/package.json')
  const lock = join(dirname(manifest), 'pnpm-lock.yaml')
  const readLock = () => existsSync(lock) ? readFileSync(lock) : null
  const before = { manifest: readFileSync(manifest), lock: readLock() }
  const result = run('dsh', ['plugin', '--profile', 'probe', 'add', artifact])
  assert.ok(Number.isInteger(result.status) && result.status > 0, 'Expected a normal nonzero exit')
  const diagnostic = `${result.stdout}\n${result.stderr}`.split('\n').find(line => line.includes('installation rejected:'))?.trim()
  assert.ok(diagnostic?.includes(`Plugin ${name}@${version} is incompatible with dsh ${target.version}:`) &&
    diagnostic.includes(`peerDependencies {"@deepseek-ai/dsh-settings":"${enginesDsh}"}`), 'Expected the legacy DSH peer diagnostic')
  assert.deepEqual(readFileSync(manifest), before.manifest, 'Refusal changed the profile manifest')
  assert.deepEqual(readLock(), before.lock, 'Refusal changed the profile lockfile')
  assert.ok(!success('dsh', dump).includes(name), 'Refused bundle appeared in the composed profile')
  console.log(JSON.stringify({ sourceCommit, sha256, host: target.version, integrity: target.integrity,
    exitCode: result.status, diagnostic, profileManifestUnchanged: true, profileLockUnchanged: true,
    bundleAbsentFromComposedProfile: true }, null, 2))
} finally {
  rmSync(root, { recursive: true, force: true })
}

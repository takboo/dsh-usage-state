import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ROOT, SEMVER, command, packageJson, readJson } from './verify-support.mjs'

const httpsRepository = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)$/i
const sshRepository = /^(?:git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+)$/i
const commitSha = /^[0-9a-f]{40}$/
const usage = 'Usage: node scripts/verify-engineering.mjs docs <base-checkout> <contract-path>\n' +
  '       node scripts/verify-engineering.mjs cli|all <base-checkout> <candidate.tgz> <report.json>'
const contractFiles = [
  '.agents/skills/dsh-plugin-onboarding/SKILL.md',
  'docs/base-versions.md',
  'docs/engineering-contract.md',
  'docs/plugin-onboarding.md',
  'docs/test-environments.md',
  'docs/distribution.md',
]
const runnerFiles = [
  'scripts/run-container.sh',
  'scripts/stage-container-inputs.mjs',
  'scripts/collect-container-report.mjs',
  'scripts/verify-host.mjs',
]
const repositoryId = match => match?.[1].replace(/\.git$/i, '').toLowerCase()
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

function lockedBase(checkout) {
  const lock = readJson(join(ROOT, 'dsh-engineering.lock.json'))
  const repository = typeof lock?.repository === 'string' && repositoryId(httpsRepository.exec(lock.repository))
  assert.ok(lock?.schemaVersion === 1 && repository &&
    typeof lock.tag === 'string' && lock.tag.startsWith('v') && SEMVER.test(lock.tag.slice(1)) &&
    typeof lock.commit === 'string' && commitSha.test(lock.commit), 'Invalid dsh-engineering.lock.json')

  const root = realpathSync(checkout)
  const git = (args, options) => command('git', ['--no-replace-objects', '-C', root, ...args], options)
  assert.equal(git(['rev-parse', '--show-toplevel']).trim(), root, 'Pass the base checkout root')
  const origins = git(['remote', 'get-url', '--all', 'origin']).trim().split('\n')
  assert.ok(origins.length === 1 && repositoryId(httpsRepository.exec(origins[0]) ?? sshRepository.exec(origins[0])) === repository,
    'Base checkout origin differs from the locked repository')
  const tagRef = `refs/tags/${lock.tag}`
  const commit = git(['rev-parse', '--verify', `${tagRef}^{commit}`]).trim()
  assert.ok(commit === lock.commit, `Engineering tag ${tagRef} resolves to ${commit}, expected ${lock.commit}`)
  return { commit, git, blob: file => git(['show', `${commit}:${file}`], { encoding: 'buffer' }) }
}

function verifyContainer(mode, base, tarball, reportPath) {
  const sourceCommit = command('git', ['rev-parse', 'HEAD']).trim()
  assert.equal(command('git', ['status', '--porcelain', '--untracked-files=all']).trim(), '',
    'Run from the clean candidate source checkout')
  assert.ok(!lstatSync(reportPath, { throwIfNoEntry: false }), 'Choose a new report path')
  const candidate = JSON.parse(command(process.execPath, [join(ROOT, 'scripts/verify-package.mjs'),
    '--tarball', tarball, '--require-report', '--expected-version', packageJson().version, '--expected-commit', sourceCommit]))
  const targets = join(ROOT, 'scripts/compatibility/engineering-targets.json')
  const inputs = { mode, sourceCommit, targetsSha256: sha256(readFileSync(targets)), tarballSha256: candidate.sha256 }

  const scratch = mkdtempSync(join(tmpdir(), 'dsh-usage-state-engineering-'))
  try {
    const archive = join(scratch, 'base.tar')
    base.git(['archive', '--format=tar', `--output=${archive}`, base.commit])
    command('tar', ['-xf', archive, '-C', scratch])
    assert.equal(readFileSync(join(scratch, '.engineering-revision'), 'utf8').trim(), base.commit,
      'Base archive revision differs from the lock')
    const runWeb = mode === 'all'
    const paths = runWeb ? [...runnerFiles, 'environments/Web.Dockerfile'] : runnerFiles
    const files = Object.fromEntries(paths.map(file => {
      const digest = sha256(base.blob(file))
      assert.equal(sha256(readFileSync(join(scratch, file))), digest, `Base archive changed ${file}`)
      return [file, digest]
    }))

    // CLI requires the positional probe path but does not read it.
    const probe = join(ROOT, 'scripts/compatibility/engineering-web-probe.mjs')
    if (runWeb) inputs.probeSha256 = sha256(readFileSync(probe))
    const result = spawnSync('bash', [join(scratch, 'scripts/run-container.sh'), mode, targets,
      probe, tarball, sourceCommit, reportPath], { stdio: 'inherit' })
    if (result.error) throw result.error
    if (lstatSync(reportPath, { throwIfNoEntry: false })) {
      const report = readJson(reportPath)
      assert.deepEqual(report.provenance?.producer, { source: 'git-archive', commit: base.commit, files },
        'Report producer differs from the locked base archive')
      assert.deepEqual(report.provenance?.inputs, inputs, 'Report inputs differ from the verified candidate and targets')
    } else {
      assert.notEqual(result.status, 0, 'Base runner succeeded without a report')
    }
    return result.status ?? 1
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

try {
  const [mode, checkout, input, report, ...extra] = process.argv.slice(2)
  const validMode = (mode === 'docs' && report === undefined && contractFiles.includes(input)) ||
    (['cli', 'all'].includes(mode) && report && extra.length === 0)
  assert.ok(checkout && input && validMode, usage)
  const base = lockedBase(checkout)
  if (mode === 'docs') process.stdout.write(base.blob(input))
  else process.exitCode = verifyContainer(mode, base, resolve(input), resolve(report))
} catch (error) {
  console.error(`Shared engineering verification: ${error.message}`)
  process.exitCode = 1
}

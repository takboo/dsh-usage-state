import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ROOT, command, readJson } from '../../scripts/verify-support.mjs'

test('shared engineering uses the locked tag for docs and gates the CLI before execution', t => {
  const scratch = mkdtempSync(join(tmpdir(), 'dsh-engineering-lock-test-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const base = join(scratch, 'base checkout')
  const project = join(scratch, 'project')
  const lock = readJson(join(ROOT, 'dsh-engineering.lock.json'))
  const contract = 'docs/engineering-contract.md'
  const executed = join(scratch, 'executed')
  const git = (...args) => command('git', ['-C', base, ...args]).trim()
  const commit = message => git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
    '-c', 'commit.gpgSign=false', 'commit', '-qm', message)
  mkdirSync(join(base, 'docs'), { recursive: true })
  mkdirSync(join(base, 'scripts'))
  mkdirSync(join(project, 'scripts'), { recursive: true })
  git('init', '-q', '--initial-branch=main')
  git('remote', 'add', 'origin', lock.repository.replace('https://github.com/', 'git@github.com:'))
  writeFileSync(join(base, contract), 'locked contract\n')
  writeFileSync(join(base, 'scripts/run-container.sh'), 'touch "$ENGINEERING_TEST_EXECUTED"\n')
  git('add', '.')
  commit('locked base')
  const lockedCommit = git('rev-parse', 'HEAD')
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'tag.gpgSign=false',
    'tag', '-a', lock.tag, '-m', 'fixture tag')
  git('branch', lock.tag, lockedCommit)
  writeFileSync(join(base, contract), 'new main contract\n')
  git('add', contract)
  commit('advanced base')
  writeFileSync(join(base, contract), 'local edit\n')

  for (const file of ['scripts/verify-engineering.mjs', 'scripts/verify-support.mjs']) {
    copyFileSync(join(ROOT, file), join(project, file))
  }
  writeFileSync(join(project, 'dsh-engineering.lock.json'), JSON.stringify({ ...lock, commit: lockedCommit }))
  const run = (mode, ...args) => spawnSync(process.execPath, ['scripts/verify-engineering.mjs', mode, base, ...args], {
    cwd: project, encoding: 'utf8', env: { ...process.env, ENGINEERING_TEST_EXECUTED: executed },
  })
  const docs = run('docs', contract)
  assert.equal(docs.status, 0, docs.stderr)
  assert.equal(docs.stdout, 'locked contract\n')

  const report = join(scratch, 'report.json')
  git('remote', 'set-url', 'origin', `${lock.repository}.invalid`)
  const wrongOrigin = run('cli', 'candidate.tgz', report)
  assert.equal(wrongOrigin.status, 1)
  assert.match(wrongOrigin.stderr, /origin differs from the locked repository/)
  git('remote', 'set-url', 'origin', lock.repository)

  const advancedCommit = git('rev-parse', 'HEAD')
  git('update-ref', `refs/tags/${lock.tag}`, advancedCommit)
  for (const mode of ['cli', 'all']) {
    const wrongTag = run(mode, 'candidate.tgz', report)
    assert.equal(wrongTag.status, 1)
    assert.match(wrongTag.stderr, new RegExp(`resolves to ${advancedCommit}, expected ${lockedCommit}`))
  }
  assert.equal(existsSync(executed), false)
  assert.equal(existsSync(report), false)
})

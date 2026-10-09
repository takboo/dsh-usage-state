import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { ROOT, SEMVER } from '../../scripts/verify-support.mjs'

// Independent cases from https://semver.org/#spec-item-9.
test('release metadata accepts valid prerelease identifiers and rejects leading-zero numeric identifiers', () => {
  for (const version of ['0.4.5', '0.4.5-rc.1', '0.4.5-alpha--beta', '0.4.5-0', '0.4.5+build-01']) {
    assert.equal(SEMVER.test(version), true, `${version} is valid SemVer`)
  }
  for (const version of ['0.4.5-01', '0.4.5-alpha.01', '00.4.5', '0.04.5', '0.4.05', '0.4.5-']) {
    assert.equal(SEMVER.test(version), false, `${version} is invalid SemVer`)
  }
})

test('the stable release workflow refuses prerelease tags before Git or npm side effects', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-release.mjs', '--tag', 'v0.4.5-rc.1'], { cwd: ROOT, encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /only stable release tags/)
})

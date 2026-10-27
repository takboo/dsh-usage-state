import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { validateTarget } from './state.mjs'
import { downloadTarget, inventory, platformSpecs } from './packages.mjs'
import { outcome, processOutcome } from './outcome.mjs'

const target = validateTarget(JSON.parse(process.env.DSH_TARGET || 'null'))
const output = process.env.DSH_REPORT_DIR
if (!output) throw new Error('DSH_REPORT_DIR required')
mkdirSync(output, { recursive: true })
// Never reuse another candidate's HOME, dependency tree, browser, profile or fixture.
const work = mkdtempSync(join(tmpdir(), `dsh-check-${target.version}-`))
const root = join(work, 'platform')
const home = join(work, 'home')
mkdirSync(home)
mkdirSync(root)
writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'dsh-compat-platform', private: true }))
const env = { PATH: process.env.PATH, HOME: home, DSH_HOME: join(work, 'state'), TMPDIR: work, CI: 'true', LANG: 'en_US.UTF-8', npm_config_cache: join(work, 'npm-cache'), npm_config_registry: 'https://registry.npmjs.org', npm_config_ignore_scripts: 'true', npm_config_userconfig: join(work, '.npmrc'), npm_config_globalconfig: join(work, 'global-npmrc') }
const report = { version: target.version, integrity: target.integrity, status: 'incomplete', category: 'infrastructure', completed: false, reason: 'Check started; completion has not been recorded.', stages: [], dependencies: {} }
function save() { writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n') }
save()
function run(name, command, args, extra = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', cwd: name === 'platform-install' ? root : process.cwd(), env: { ...env, ...extra }, timeout: name === 'web-host-command' ? 18 * 60_000 : 8 * 60_000, maxBuffer: 12 * 1024 * 1024 })
  writeFileSync(resolve(output, `${name}.log`), `${result.stdout || ''}\n${result.stderr || ''}\n${result.error || ''}`.replace(/token=[A-Za-z0-9_-]+/g, 'token=[redacted]'))
  const check = { ok: result.status === 0 && !result.error, stdout: result.stdout, error: result.error, status: result.status, signal: result.signal }
  const status = name === 'web-host-command' && result.status === 2 ? 'retry' : processOutcome(check)
  report.stages.push({ name, status: status === 'retry' ? 'incomplete' : status })
  save()
  return check
}
try {
  const tarball = await downloadTarget(target, work)
  const metadata = run('host-metadata', 'tar', ['-xOf', tarball, 'package/package.json'])
  if (!metadata.ok) throw new Error('Cannot read the pinned package manifest')
  const pkg = JSON.parse(metadata.stdout)
  if (pkg.name !== '@deepseek-ai/dsh' || pkg.version !== target.version) throw new Error('Pinned package identity mismatch')
  const install = run('platform-install', 'npm', ['install', '--prefix', root, '--save-exact', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', ...platformSpecs(pkg.dependencies, target.version)])
  if (!install.ok) throw new Error('Platform installation failed; inspect the log')
  report.dependencies.platform = inventory(root)
  for (const name of ['dsh-typert-loader', 'dsh-typert-registry']) {
    if (JSON.parse(readFileSync(join(root, `node_modules/@deepseek-ai/${name}/package.json`), 'utf8')).version !== target.version) throw new Error('Exact platform version mismatch')
  }
  const verify = run('baseline-verify', 'npm', ['run', 'verify'])
  const contracts = run('dsh-contracts', process.execPath, ['--import', './tests/support/client-render-hook.mjs', '--test', 'tests/host/typert.test.ts', 'tests/client/contribution.test.ts', 'tests/build/bundle.test.ts'], { DSH_PLATFORM_ROOT: root })
  const web = verify.ok && contracts.ok ? run('web-host-command', process.execPath, ['scripts/compatibility/web-smoke.mjs'], { DSH_VERSION: target.version, DSH_TARBALL: tarball, DSH_INTEGRITY: target.integrity, DSH_WEB_ROOT: join(work, 'web'), DSH_REPORT_DIR: output }) : null
  const result = outcome(verify, contracts, web)
  report.status = result === 'retry' ? 'incomplete' : result
  report.completed = result !== 'retry'
  report.category = result === 'retry' ? 'infrastructure' : !verify.ok ? 'baseline_failure' : result === 'failed' ? 'incompatible' : 'passed'
  if (web) {
    try { report.dependencies.web = JSON.parse(readFileSync(join(output, 'web-dependencies.json'), 'utf8')) } catch { if (result === 'passed') throw new Error('Missing actual host dependency resolution') }
  }
  report.reason = result === 'passed' ? 'Baseline, exact-version contracts and isolated browser RPC/model/settings checks passed with fixture data.' : result === 'retry' ? 'Execution did not complete or setup failed; inspect logs.' : !verify.ok ? 'Repository baseline failed; this does not establish an upstream incompatibility.' : 'Exact-version contract or browser assertion failed; human review required.'
} catch (error) { report.reason = error.message; report.status = 'incomplete'; report.category = 'infrastructure'; report.completed = false }
save()
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'passed') process.exitCode = 1

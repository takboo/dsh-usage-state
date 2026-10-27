import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TAG } from './discover.mjs'
import { outcome, processOutcome } from './outcome.mjs'

const version = process.env.DSH_VERSION
const root = process.env.DSH_PLATFORM_ROOT
const output = process.env.DSH_REPORT_DIR
if (!TAG.test(`dsh-v${version}`) || !root || !output) throw new Error('Valid DSH_VERSION, DSH_PLATFORM_ROOT and DSH_REPORT_DIR are required')
mkdirSync(output, { recursive: true })
const report = { status: 'retry', reason: '', stages: [] }
function save() { writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n') }
function run(name, command, args, env = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, ...env }, timeout: name === 'web-host-command' ? 18 * 60_000 : 8 * 60_000, maxBuffer: 12 * 1024 * 1024 })
  writeFileSync(resolve(output, `${name}.log`), `${result.stdout || ''}\n${result.stderr || ''}\n${result.error || ''}`.replace(/token=[A-Za-z0-9_-]+/g, 'token=[redacted]'))
  const ok = result.status === 0 && !result.error
  const check = { ok, stdout: result.stdout, error: result.error, status: result.status, signal: result.signal }
  const status = name === 'web-host-command' && !ok && result.status === 2 ? 'retry' : processOutcome(check)
  report.stages.push({ name, status })
  save()
  return check
}
try {
  const metadata = run('host-metadata', 'npm', ['view', `@deepseek-ai/dsh@${version}`, 'dependencies', '--json'])
  if (!metadata.ok) throw new Error('Unable to read the exact DSH package metadata; retry later.')
  const deps = JSON.parse(metadata.stdout)
  const cordis = deps['@deepseek-ai/cordis']
  const schema = deps['@deepseek-ai/schemastery']
  // npm registry metadata is data, not an instruction or shell command.
  if (!/^[~^]?\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(cordis || '') || !/^[~^]?\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(schema || '')) throw new Error('Host platform dependency ranges changed; manual investigation is required.')
  const install = run('platform-install', 'npm', ['install', '--prefix', root, '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', `@deepseek-ai/cordis@${cordis}`, `@deepseek-ai/schemastery@${schema}`, `@deepseek-ai/dsh-typert-loader@${version}`, `@deepseek-ai/dsh-typert-registry@${version}`])
  if (!install.ok) throw new Error('Platform packages could not be installed; retry later and inspect the log.')
  const verify = run('baseline-verify', 'npm', ['run', 'verify'])
  const contracts = run('dsh-contracts', process.execPath, ['--import', './tests/support/client-render-hook.mjs', '--test', 'tests/host/typert.test.ts', 'tests/client/contribution.test.ts', 'tests/build/bundle.test.ts'], { DSH_PLATFORM_ROOT: root })
  const web = verify.ok && contracts.ok ? run('web-host-command', process.execPath, ['scripts/compatibility/web-smoke.mjs'], { DSH_WEB_ROOT: process.env.DSH_WEB_ROOT || resolve(root, '../dsh-web') }) : null
  report.status = outcome(verify, contracts, web)
  report.reason = report.status === 'passed' ? 'Baseline, exact-version RPC contracts and isolated Web browser RPC, model selection, status line and settings checks passed with fixture data.' : report.status === 'retry' ? 'A check could not complete, timed out or had a setup failure; inspect the stage logs and retry.' : 'A baseline, contract or browser acceptance check failed; inspect the logs.'
} catch (error) { report.reason = error.message; report.status = 'retry' }
save()
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'passed') process.exitCode = 1

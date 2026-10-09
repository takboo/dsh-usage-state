import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { Script } from 'node:vm'
import { ROOT, command, npm, packageJson } from './verify-support.mjs'

const { values } = parseArgs({ options: { tarball: { type: 'string' }, 'schema-version': { type: 'string' } } })
let packageRoot = ROOT
if (values.tarball) {
  const tarball = path.resolve(values.tarball)
  const packed = JSON.parse(command('tar', ['-xOzf', tarball, 'package/package.json']))
  assert.equal(packed.name, packageJson().name)
  const project = mkdtempSync(path.join(tmpdir(), 'dsh-usage-state-runtime-'))
  const lock = JSON.parse(readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'))
  const schemaVersion = values['schema-version'] ?? lock.packages?.['node_modules/@deepseek-ai/schemastery']?.version
  assert.match(schemaVersion, /^\d+\.\d+\.\d+$/, 'an explicit stable platform schema version is required')
  // Use the lockfile by default; an explicit version exercises the declared peer floor.
  // Both install the real schema package. No volatile polyfill is injected.
  // The DSH install-gate peer is not needed by this fake host.
  writeFileSync(path.join(project, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: {
    [packed.name]: `file:${tarball}`, '@deepseek-ai/schemastery': schemaVersion,
  } }, null, 2) + '\n')
  npm(['install', '--ignore-scripts', '--omit=dev', '--legacy-peer-deps', '--no-audit', '--no-fund', '--cache', path.join(project, 'npm-cache')], { cwd: project })
  packageRoot = path.join(project, 'node_modules', packed.name)
}
const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
const host = await import(pathToFileURL(path.join(packageRoot, manifest.exports['.'].default)).href)
const typert = await import(pathToFileURL(path.join(packageRoot, manifest.exports['./typert'].default)).href)
assert.equal(typeof host.apply, 'function')
assert.equal(typeof host.createUsageState, 'function')
assert.equal(typert.TYPERT.package, manifest.name)
assert.equal(typert.TYPERT.face, 'host')
new Script(readFileSync(path.join(packageRoot, manifest.exports['./client'].default), 'utf8'), { filename: 'client.js' })
const supplied = new Map(), urls = []
const ctx = {
  get: name => name === 'credentials' ? {
    resolve: async ref => ref === 'DEEPSEEK_API_KEY' ? { value: 'runtime-smoke-fake-key', source: 'test' } : undefined,
    describe: async () => ({ configured: true, source: 'test', writable: true }),
  } : name === 'llm' ? { listProviders: () => [{ id: 'deepseek-official' }] } : undefined,
  on: () => () => {}, effect: callback => callback(), provide: (key, value) => supplied.set(key, value),
  timeout: () => () => {}, interval: () => () => {},
}
const service = host.createUsageState(ctx, {
  config: { get: () => ({ providers: { 'deepseek-official': { mode: 'api' } } }) },
  credentialFallback: false,
  fetch: async url => {
    urls.push(url)
    return { ok: true, status: 200, json: async () => ({ balance_infos: [{ currency: 'CNY', total_balance: '42.25' }] }) }
  },
})
const view = await service.getState(false)
assert.deepEqual(urls, ['https://api.deepseek.com/user/balance'])
assert.ok(Object.values(view.snapshots).some(snapshot => snapshot.balances.some(balance => balance.amount === 42.25 && balance.currency === 'CNY')))
assert.equal(supplied.get('usageState'), service)
assert.equal(service.typertRemote.service, service)
const getState = typert.TYPERT.invocations.find(invocation => invocation.method === 'getState')
assert.ok(getState, 'getState invocation missing')
getState.result.create().parse(view)
console.log(`Prebuilt JS runtime smoke passed: ${manifest.name}@${manifest.version} on ${process.version}${values.tarball ? ' (isolated tarball install)' : ''}; fake fetch only.`)

import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { TAG } from './discover.mjs'
import { browserAcceptance } from './browser-acceptance.mjs'

const { DSH_VERSION: version, DSH_WEB_ROOT: root, DSH_REPORT_DIR: output } = process.env
try {
  if (!TAG.test(`dsh-v${version}`) || !root || !isAbsolute(root) || !output || !isAbsolute(output)) throw new Error('DSH_VERSION, DSH_WEB_ROOT and DSH_REPORT_DIR required')
  mkdirSync(root, { recursive: true })
  if (readdirSync(root).length !== 0) throw new Error('Refusing a nonempty DSH_WEB_ROOT; choose a fresh temporary directory')
  mkdirSync(output, { recursive: true })
} catch (error) {
  console.error(`Web setup failed: ${error.message}`)
  process.exit(2)
}
const home = join(root, 'home')
const host = join(root, 'host')
const state = join(root, 'dsh')
const pack = join(root, 'pack')
const env = { HOME: home, DSH_HOME: state, PATH: `${join(host, 'node_modules/.bin')}:${process.env.PATH}`, TMPDIR: root, npm_config_cache: join(root, 'npm-cache'), CI: 'true', LANG: 'en_US.UTF-8', PLAYWRIGHT_BROWSERS_PATH: join(root, 'browsers') }
const log = []
function command(label, cmd, args, opts = {}, cwd = process.cwd()) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', env: { ...env, ...opts }, cwd, timeout: 8 * 60_000, maxBuffer: 10 * 1024 * 1024 })
  log.push(`${label}: status ${r.status}\n${r.stdout || ''}\n${r.stderr || ''}\n${r.error || ''}`)
  writeFileSync(join(output, 'web-host.log'), log.join('\n'))
  if (r.status !== 0 || r.error) throw new Error(`${label} failed; inspect web-host.log`)
  return r.stdout.trim()
}
let child
let phase = 'setup'
try {
  for (const dir of [home, host, state, pack]) mkdirSync(dir, { recursive: true })
  command('install host', 'npm', ['install', '--prefix', host, '--ignore-scripts', '--no-audit', '--no-fund', `@deepseek-ai/dsh@${version}`, 'pnpm@11.28.5', 'playwright@1.62.1'])
  const dsh = join(host, 'node_modules/.bin/dsh')
  if (!process.env.DSH_BROWSER_EXECUTABLE) command('install browser', join(host, 'node_modules/.bin/playwright'), ['install', ...(process.platform === 'linux' ? ['--with-deps'] : []), '--only-shell', 'chromium'])
  if (command('host version', dsh, ['--version']) !== version) throw new Error('DSH CLI version mismatch')
  const archive = command('pack plugin', 'npm', ['pack', '--ignore-scripts', '--silent', '--pack-destination', pack]).split('\n').at(-1)
  if (!/^dsh-usage-state-[\w.+-]+\.tgz$/.test(archive)) throw new Error('Unexpected tarball filename')
  command('create profile', dsh, ['--profile', 'compat', '--from-default-profile', 'web', '--dump-config'], {}, root)
  command('install tarball', dsh, ['plugin', '--profile', 'compat', 'add', join(pack, archive)], {}, root)
  const profile = JSON.parse(readFileSync(join(state, 'profiles/compat/package.json'), 'utf8'))
  if (!String(profile.dependencies?.['dsh-usage-state'] || '').startsWith('file:')) throw new Error('Profile did not install the plugin tarball')
  const documents = join(root, 'documents')
  mkdirSync(documents, { recursive: true })
  const overlay = join(root, 'workspace-overlay.yml')
  writeFileSync(overlay, `- id: workspace-controller\n  name: '@deepseek-ai/dsh-api-workspace-controller'\n  config:\n    documentsDirectory: ${JSON.stringify(documents)}\n`)
  writeFileSync(join(state, '.credentials.yaml'), 'version: 1\nrefs:\n  DEEPSEEK_API_KEY: compat-file-key\n', { mode: 0o600 })
  const fixture = pathToFileURL(resolve('scripts/compatibility/fetch-fixture.mjs')).href
  child = spawn(dsh, ['--profile', 'compat', '--patch', overlay, '--port', '0', '--no-open'], { cwd: root, env: { ...env, DEEPSEEK_API_KEY: 'compat-env-key', DSH_FIXTURE_TRACE: join(output, 'fixture.jsonl'), NODE_OPTIONS: `--import=${fixture}` }, stdio: ['ignore', 'pipe', 'pipe'] })
  let raw = ''
  const url = await new Promise((resolveUrl, reject) => {
    const timer = setTimeout(() => reject(new Error('Web host did not print its URL within 90 seconds')), 90000)
    function collect(buf) {
      raw += buf.toString()
      const match = raw.match(/https?:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)
      if (match) { clearTimeout(timer); resolveUrl(match[0]) }
    }
    child.stdout.on('data', collect); child.stderr.on('data', collect)
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Web host exited before ready: ${code}`)) })
  })
  const launch = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
  const cookie = launch.headers.get('set-cookie')?.split(';')[0]
  const location = launch.headers.get('location')
  if (launch.status !== 303 || !cookie || !location) throw new Error(`Web host launch exchange failed: HTTP ${launch.status}`)
  const response = await fetch(new URL(location, url), { headers: { cookie }, signal: AbortSignal.timeout(10000) })
  const html = await response.text()
  if (!response.ok || !/<html\b/i.test(html)) throw new Error(`Web host HTTP ${response.status}; HTML not available; response: ${html.slice(0, 300)}`)
  // Playwright resolves the browser from the Node process environment before
  // launch(); passing env to Chromium only affects the child process.
  process.env.PLAYWRIGHT_BROWSERS_PATH = env.PLAYWRIGHT_BROWSERS_PATH
  const require = createRequire(join(host, 'package.json'))
  const { chromium } = require('playwright')
  const browser = await chromium.launch({ headless: true, env, ...(process.env.DSH_BROWSER_EXECUTABLE ? { executablePath: process.env.DSH_BROWSER_EXECUTABLE } : {}) })
  try {
    const page = await browser.newPage()
    phase = 'acceptance'
    try {
      const evidence = await browserAcceptance(page, url)
      log.push(`Browser RPC evidence: ${JSON.stringify(evidence)}`)
    } catch (error) {
      await page.screenshot({ path: join(output, 'browser-failure.png') }).catch(() => {})
      throw error
    }
  } finally { await browser.close() }
  const trace = readFileSync(join(output, 'fixture.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  for (const endpoint of ['models', 'balance']) {
    if (!trace.some(item => item.endpoint === endpoint && item.source === 'file')) throw new Error(`Missing ${endpoint} fixture request with saved credential`)
  }
  log.push('Browser verified RPC results, model selection, status line placement and hide/API round trip using fake credentials and data.')
  writeFileSync(join(output, 'web-host.log'), log.join('\n'))
  console.log('Exact DSH tarball, browser RPC, model selection, status line and settings round trip passed with fixture data.')
} catch (error) {
  console.error(`Web ${phase} failed: ${error.stack || error}`)
  process.exitCode = phase === 'acceptance' ? 1 : 2
} finally {
  if (child && child.exitCode === null) child.kill('SIGTERM')
}

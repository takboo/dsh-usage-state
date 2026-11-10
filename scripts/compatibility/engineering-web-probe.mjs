import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const fileKey = 'compat-file-key'
const environmentKey = 'compat-env-key'
const traceFile = 'fixture.jsonl'

export function prepareHost({ dshHome, fixtureDir }) {
  const documents = join(fixtureDir, 'documents')
  mkdirSync(documents, { recursive: true })
  writeFileSync(join(dshHome, '.credentials.yaml'), `version: 1\nrefs:\n  DEEPSEEK_API_KEY: ${fileKey}\n`, { mode: 0o600 })
  return {
    patch: `- id: workspace-controller\n  name: '@deepseek-ai/dsh-api-workspace-controller'\n  config:\n    documentsDirectory: ${JSON.stringify(documents)}\n`,
    fakeApiKeys: { DEEPSEEK_API_KEY: environmentKey },
  }
}

export function installHostFixture({ fixtureDir }) {
  installFixtureFetch(join(fixtureDir, traceFile))
}

// Test host only. This replaces fetch, not every network API.
export function installFixtureFetch(tracePath) {
  const original = globalThis.fetch
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return original(input, init)
    const models = url.hostname === 'api.deepseek.com' && url.pathname === '/models'
    const balance = url.hostname === 'api.deepseek.com' && url.pathname === '/user/balance'
    if (models || balance) {
      const headers = new Headers(init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined))
      const credential = models ? headers.get('x-api-key') : headers.get('authorization')?.replace(/^Bearer\s+/i, '')
      const source = credential === fileKey ? 'file' : credential === environmentKey ? 'environment' : 'unknown'
      if (tracePath) appendFileSync(tracePath, JSON.stringify({ endpoint: models ? 'models' : 'balance', source }) + '\n')
      if (source !== 'file') return json({ error: 'fixture expected the saved credential' }, 403)
      if (models) return json({ object: 'list', data: [
        { id: 'deepseek-flash', name: 'Compatibility Flash', api_capabilities: { anthropic_messages: {} } },
        { id: 'deepseek-v4-pro', name: 'Compatibility Pro', api_capabilities: { anthropic_messages: {} } },
      ] })
      return json({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '42.25', granted_balance: '0', topped_up_balance: '42.25' }] })
    }
    throw new Error(`Blocked external fetch: ${url.origin}`)
  }
}

export async function assertFixtureBalanceAboveComposer(page, timeout) {
  const balance = page.getByText('¥42.25', { exact: true })
  await balance.waitFor({ state: 'visible', timeout })
  const lineBox = await balance.boundingBox()
  const editorBox = await page.locator('[contenteditable="true"]').first().boundingBox()
  assert.ok(lineBox && editorBox && lineBox.y < editorBox.y, 'balance line must appear above the composer')
}

export async function selectFixturePro(page) {
  await page.getByText('Compatibility Flash', { exact: true }).first().click()
  await page.getByText('Model', { exact: true }).first().click()
  await page.getByText('Compatibility Pro', { exact: true }).first().click()
}

export async function prepareClient(page, context) {
  assert.ok(context?.fixtureDir, 'The locked base must prepare the Web host fixture')
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true })
  const model = page.getByText('Compatibility Flash', { exact: true }).first()
  await continueButton.or(model).first().waitFor()
  if (await continueButton.isVisible()) await continueButton.click()

  const signIn = page.getByRole('dialog', { name: 'Get started' })
  await signIn.or(model).first().waitFor()
  if (await signIn.isVisible()) await signIn.getByRole('button', { name: 'Close', exact: true }).click()
  await model.waitFor()
}

export async function verifyClient(page, { fixtureDir }) {
  await selectFixturePro(page)
  await page.locator('[contenteditable="true"]').first().click()
  await page.getByText('Compatibility Pro', { exact: true }).first().waitFor()
  await assertFixtureBalanceAboveComposer(page, 60000)
  const trace = readFileSync(join(fixtureDir, traceFile), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.ok(trace.some(entry => entry.endpoint === 'balance' && entry.source === 'file'),
    'Missing balance fixture request with saved credential')
  return { balanceAboveComposer: true, balanceRequestCredentialSource: 'file' }
}

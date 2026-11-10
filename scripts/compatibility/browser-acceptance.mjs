import assert from 'node:assert/strict'
import { assertFixtureBalanceAboveComposer } from './engineering-web-probe.mjs'

/** Exercise the installed client through real browser/Host RPC, not test doubles. */
export async function browserAcceptance(page, url, { timeoutMs = 60000, noticeTimeoutMs = 15000, expectDisplayMetadata = false } = {}) {
  const evidence = { state: false, credentials: false, catalog: false, selection: false }
  let settingsWrites = 0
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/settings/mutate') settingsWrites += 1
  })
  page.on('response', response => {
    const path = new URL(response.url()).pathname
    if (!['/api/usageState/getState', '/api/usageState/describeCredentials', '/api/session/modelCatalog', '/api/session/selectModel'].includes(path)) return
    void (async () => {
      try {
        if (response.status() !== 200) return
        const request = response.request().postDataJSON()
        const body = await response.json()
        if (body.type !== 'server-response' || body.rpcId !== request.rpcId || body.result?.ok !== true) return
        const value = body.result.value
        if (path === '/api/usageState/getState') {
          evidence.state ||= value?.snapshots?.['deepseek:api']?.balances?.some(b => b.currency === 'CNY' && b.amount === 42.25) === true
        } else if (path === '/api/usageState/describeCredentials') {
          const c = value?.credentials?.['deepseek:api']
          evidence.credentials ||= c?.configured === true && c?.source === 'file' && c?.writable === true
        } else if (path === '/api/session/modelCatalog') {
          const group = value?.groups?.find(g => g.id === 'deepseek-official')
          evidence.catalog ||= group?.models?.some(m => m.id === 'deepseek-flash' && m.name === 'Compatibility Flash') === true && group?.models?.some(m => m.id === 'deepseek-v4-pro' && m.name === 'Compatibility Pro') === true
        } else if (path === '/api/session/selectModel') {
          const selection = request.payload?.args?.request
          evidence.selection ||= selection?.provider === 'deepseek-official' && selection?.model === 'deepseek-v4-pro'
        }
      } catch { /* A malformed or incomplete response cannot satisfy the assertion. */ }
    })()
  })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true })
  if (await continueButton.waitFor({ state: 'visible', timeout: noticeTimeoutMs }).then(() => true, () => false)) await continueButton.click()
  await page.getByText('Compatibility Flash', { exact: true }).first().waitFor({ timeout: timeoutMs })
  const balance = page.getByText('¥42.25', { exact: true })

  // Selecting a model in the draft causes DSH to create a local session. Its
  // workspace is redirected to the temporary directory by the host overlay.
  await page.getByText('Compatibility Flash', { exact: true }).first().click()
  await page.getByText('Model', { exact: true }).first().click()
  await page.getByText('Compatibility Pro', { exact: true }).first().click()
  await waitForEvidence(evidence, ['selection'], timeoutMs)
  await page.locator('[contenteditable="true"]').first().click()
  await page.getByText('Compatibility Pro', { exact: true }).first().waitFor({ state: 'visible', timeout: timeoutMs })
  await assertFixtureBalanceAboveComposer(page, timeoutMs)

  // The migrated page comes from the real keyed plugin-row contribution. Do not
  // silently fall back to the old Settings entry when testing an older host.
  const openPackage = async () => {
    await page.getByRole('button', { name: 'Plugins', exact: true }).click()
    await page.getByRole('heading', { name: 'Plugins', exact: true }).waitFor({ timeout: timeoutMs })
    // The market is optional; without it the same page opens directly on the
    // installed list and has no Discover/Installed tabs.
    const installed = page.getByText('Installed', { exact: true })
    if (await installed.isVisible()) await installed.click()
    await page.getByRole('button', { name: expectDisplayMetadata ? 'View Balance & Quota' : /^View (Balance & Quota|dsh-usage-state)$/ }).click()
    const detail = page.locator('[data-plugin-detail="dsh-usage-state"]')
    await detail.getByText('dsh-usage-state', { exact: true }).first().waitFor({ timeout: timeoutMs })
    if (expectDisplayMetadata) await detail.getByText("Shows the current provider's account balance or coding-plan quota above the composer, with usage percentages and reset countdowns.", { exact: true }).first().waitFor({ timeout: timeoutMs })
    await detail.getByText('1 total · 1 running', { exact: true }).waitFor({ timeout: timeoutMs })
    await detail.getByText('usage-state', { exact: true }).waitFor({ timeout: timeoutMs })
    await detail.getByText('Running', { exact: true }).waitFor({ timeout: timeoutMs })
    return detail
  }
  const openConfiguration = async () => {
    const detail = await openPackage()
    await detail.getByRole('button', { name: /^Configure / }).click()
    await page.locator('[data-plugin-row-detail="dsh-usage-state#usage-state"]').waitFor({ state: 'visible', timeout: timeoutMs })
    return page.locator('[data-usage-provider="deepseek-official"]')
  }
  const saveSettings = async () => {
    const accepted = page.waitForResponse(response => new URL(response.url()).pathname === '/api/settings/mutate' && response.status() === 200, { timeout: timeoutMs })
    await page.getByRole('button', { name: 'Save settings', exact: true }).click()
    assert.equal((await (await accepted).json()).result?.ok, true, 'Host must accept the configuration mutation')
    const save = page.getByRole('button', { name: 'Save settings', exact: true })
    await save.waitFor({ state: 'visible', timeout: timeoutMs })
    assert.equal(await save.isDisabled(), true, 'accepted configuration must clear the draft')
  }
  const row = await openConfiguration()
  const mode = row.getByRole('combobox', { name: /^Mode for / })
  const acceptedMode = await mode.inputValue()
  const beforeEdit = settingsWrites
  await mode.selectOption('hidden')
  assert.equal(settingsWrites, beforeEdit, 'mode changes must remain local until Save')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  assert.equal(await mode.inputValue(), acceptedMode, 'Reset must restore accepted configuration without a write')
  assert.equal(settingsWrites, beforeEdit)
  await mode.selectOption('hidden')
  await saveSettings()
  // Plugin Manager is a full page, not a dialog above the composer. Return to a
  // fresh local draft before checking the accepted setting's status-line effect.
  await page.getByRole('button', { name: 'New session', exact: true }).first().click()
  await page.locator('[contenteditable="true"]').first().waitFor({ state: 'visible', timeout: timeoutMs })
  assert.equal(await balance.count(), 0, 'saved Hidden must remove the balance from the composer')
  const restored = await openConfiguration()
  await restored.getByRole('combobox', { name: /^Mode for / }).selectOption('api')
  await saveSettings()
  await page.getByRole('button', { name: 'New session', exact: true }).first().click()
  await balance.waitFor({ state: 'visible', timeout: timeoutMs })

  await waitForEvidence(evidence, ['state', 'credentials', 'catalog', 'selection'], timeoutMs)
  // The caller captures the English display-metadata artifact on return.
  await openPackage()
  return evidence
}

async function waitForEvidence(evidence, names, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (!names.every(name => evidence[name]) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
  assert.deepEqual(names.filter(name => !evidence[name]), [], `Missing browser RPC evidence: ${names.join(', ')}`)
}

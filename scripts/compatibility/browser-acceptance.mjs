import assert from 'node:assert/strict'

/** Exercise the installed client through real browser/Host RPC, not test doubles. */
export async function browserAcceptance(page, url, { timeoutMs = 60000, noticeTimeoutMs = 15000 } = {}) {
  const evidence = { state: false, credentials: false, catalog: false, selection: false }
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
  await balance.waitFor({ state: 'visible', timeout: timeoutMs })
  const lineBox = await balance.boundingBox()
  const editorBox = await page.locator('[contenteditable="true"]').first().boundingBox()
  assert.ok(lineBox && editorBox && lineBox.y < editorBox.y, 'balance line must appear above the composer')

  // The settings section is supplied by the plugin's actual browser bundle.
  await page.getByText('More', { exact: true }).last().click()
  await page.getByText('Settings', { exact: true }).last().click()
  await page.getByText('Usage state', { exact: true }).last().click()
  await page.getByText('Models: Compatibility Flash · Compatibility Pro', { exact: true }).waitFor({ timeout: timeoutMs })
  await page.getByRole('button', { name: 'Hidden', exact: true }).click()
  await balance.waitFor({ state: 'detached', timeout: timeoutMs })
  await page.getByRole('button', { name: 'API Key balance', exact: true }).click()
  await balance.waitFor({ state: 'visible', timeout: timeoutMs })
  await page.getByRole('button', { name: 'Close', exact: true }).last().click()
  await balance.waitFor({ state: 'visible', timeout: timeoutMs })

  await waitForEvidence(evidence, ['state', 'credentials', 'catalog', 'selection'], timeoutMs)
  await page.getByText('Plugins', { exact: true }).first().click()
  await page.getByText('dsh-usage-state', { exact: true }).first().click()
  await page.getByText('1 total · 1 running', { exact: true }).waitFor({ timeout: timeoutMs })
  await page.getByText('usage-state', { exact: true }).waitFor({ timeout: timeoutMs })
  await page.getByText('Running', { exact: true }).waitFor({ timeout: timeoutMs })
  return evidence
}

async function waitForEvidence(evidence, names, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (!names.every(name => evidence[name]) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
  assert.deepEqual(names.filter(name => !evidence[name]), [], `Missing browser RPC evidence: ${names.join(', ')}`)
}

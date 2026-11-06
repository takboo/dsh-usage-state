import test from 'node:test'
import assert from 'node:assert/strict'

import { en, LOCALE_NS, zh } from '../../src/client/locales.ts'

test('the dictionary namespace is the one the slots registration declares', () => {
  assert.equal(LOCALE_NS, 'usage-state')
  assert.match(LOCALE_NS, /^[a-z][a-z0-9-]*$/)
})

test('both dictionaries carry exactly the same keys', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
})

test('every entry is a non-empty string', () => {
  for (const [key, value] of [...Object.entries(zh), ...Object.entries(en)]) {
    assert.equal(typeof value, 'string', `${key} must be a string`)
    assert.ok(value.trim().length > 0, `${key} must not be blank`)
  }
})

test('no key is left as its own translation, except window labels which are language-neutral', () => {
  for (const dict of [zh, en]) {
    for (const [key, value] of Object.entries(dict)) {
      if (key.startsWith('window.')) continue
      assert.notEqual(value, key, `${key} looks untranslated`)
    }
  }
})

test('the dictionaries stay bilingual where it matters most', () => {
  assert.equal(zh.nav, '余额与额度')
  assert.equal(en.nav, 'Balance & Quota')
  assert.notEqual(zh['state.unconfigured'], en['state.unconfigured'])
})

test('Admin and spend copy is bilingual, explicit about privilege, scope and reporting limits', () => {
  for (const key of ['modeAdmin', 'adminWarning', 'adminKeyRef', 'adminKeyRefRequired', 'organizationSpend', 'spendNoData', 'tipSpendPeriod', 'tipSpendAsOf', 'tipSpendScope', 'tipSpendCaveat'] as const) {
    assert.notEqual(zh[key], en[key], `${key} must be localized`)
  }
  assert.match(en.adminWarning, /high-privilege.*read-only Usage permission/)
  assert.match(zh.adminWarning, /权限较高.*只读 Usage 权限/)
  assert.match(en.adminKeyRefRequired, /save settings before pasting/)
  assert.match(en.tipSpendCaveat, /delayed.*not a balance.*not real-time.*not a final invoice/)
  assert.match(zh.tipSpendCaveat, /延迟.*不是余额.*不是实时.*不是最终账单/)
  assert.match(en.organizationSpend, /Organization.*\{month\}.*\{amount\}/)
})

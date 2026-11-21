/**
 * Guard de fachada: la batería medicolegal vive en shared/consentRecords.test.js
 * (ejecutable con `node --test` sin alias @/).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

test('consentHelpers.ts reexporta el núcleo shared y los tipos de SignedConsentRecord', () => {
  const src = readFileSync(join(here, 'consentHelpers.ts'), 'utf8')
  assert.match(src, /shared\/consentRecords\.js/)
  assert.match(src, /createConsentDraft/)
  assert.match(src, /signConsentRecord/)
  assert.match(src, /revokeConsentRecord/)
  assert.match(src, /mergeConsentRecords/)
  assert.match(src, /getNormalizedConsents/)
  assert.match(src, /SignedConsentRecord/)
})

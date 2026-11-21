import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'clinicalHistoryPrint.ts'), 'utf8')

test('impresión de consentimientos itera getNormalizedConsents y bloques individuales', () => {
  assert.match(src, /getNormalizedConsents/)
  assert.match(src, /buildSignedConsentRecordBlock/)
  assert.match(src, /renderedTextSnapshot/)
  assert.match(src, /contentHash/)
  assert.match(src, /REVOCADO \/ DESISTIMIENTO REGISTRADO/)
  assert.match(src, /Registro Histórico Unificado/)
  assert.match(src, /consent-document/)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'InformedConsentForm.tsx'), 'utf8')

test('InformedConsentForm usa SignedConsentRecord y helpers de Fase 1', () => {
  assert.match(src, /getNormalizedConsents/)
  assert.match(src, /createConsentDraft/)
  assert.match(src, /signConsentRecord/)
  assert.match(src, /revokeConsentRecord/)
  assert.match(src, /informedConsents/)
  assert.match(src, /isLegacyUnified/)
  assert.match(src, /Sellar y Firmar Consentimiento/)
  assert.match(src, /Registrar desistimiento/)
  assert.match(src, /guardianRelationship/)
  assert.match(src, /onImmediatePersist/)
})

test('InformedConsentForm no comparte un solo lienzo para todos los procedimientos', () => {
  assert.doesNotMatch(src, /selectedConsentIds/)
  assert.match(src, /activeConsentId/)
  assert.match(src, /Descartar borrador/)
})

test('InformedConsentForm Fase 3: cola kiosco y auto-sello', () => {
  assert.match(src, /Enviar todos los pendientes a Tableta/)
  assert.match(src, /consentQueue/)
  assert.match(src, /applyKioskPatientSignatureAndSeal/)
})

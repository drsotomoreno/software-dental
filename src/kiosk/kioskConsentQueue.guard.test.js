import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, 'KioskApp.tsx'), 'utf8')
const types = readFileSync(join(here, 'kioskTypes.ts'), 'utf8')
const form = readFileSync(
  join(here, '../components/clinical/InformedConsentForm.tsx'),
  'utf8',
)

test('kioskTypes define cola secuencial de consentimientos', () => {
  assert.match(types, /KioskConsentQueueItem/)
  assert.match(types, /consentQueue\?:/)
})

test('KioskApp muestra progreso Documento i de N y avanza la cola', () => {
  assert.match(app, /readConsentQueue/)
  assert.match(app, /Documento \$\{consentQueueIndex \+ 1\} de/)
  assert.match(app, /signatureResetKey/)
  assert.match(app, /queueGuardian/)
})

test('InformedConsentForm envía cola y auto-sella firmas de tableta', () => {
  assert.match(form, /Enviar todos los pendientes a Tableta/)
  assert.match(form, /sendAllDraftsToTablet/)
  assert.match(form, /applyKioskPatientSignatureAndSeal/)
  assert.match(form, /onClinicKioskSignatureReceived/)
  assert.match(form, /consentQueue/)
})

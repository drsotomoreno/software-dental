import assert from 'node:assert/strict'
import test from 'node:test'
import { acceptsKioskPatientSignature } from '../kiosk/kioskTypes.ts'
import { renderKioskSignatureBlock } from './kioskSignaturePrint.ts'

test('la evolución no recibe firma de paciente desde el kiosco', () => {
  assert.equal(acceptsKioskPatientSignature('EVOLUTION'), false)
  assert.equal(acceptsKioskPatientSignature('INTAKE'), true)
  assert.equal(acceptsKioskPatientSignature('CONSENT'), true)
})

test('sin firma, el PDF muestra el pendiente', () => {
  const html = renderKioskSignatureBlock({
    heading: 'Firma del paciente',
    signerName: 'Ana Pérez',
    signerDocument: 'CC 123',
  })
  assert.match(html, /Pendiente de firma digital/)
  assert.equal(html.includes('<img'), false)
})

test('con firma, el PDF muestra imagen, nombre, documento y estampado', () => {
  const html = renderKioskSignatureBlock({
    heading: 'Firma del paciente',
    signatureDataUrl: 'data:image/png;base64,abc',
    signerName: 'Ana Pérez',
    signerDocument: 'CC 123',
    signedAtLabel: '4 nov 2026, 11:23 p. m.',
    ipAddress: '190.0.0.1',
    kioskDeviceId: 'tablet-1',
  })
  assert.match(html, /src="data:image\/png;base64,abc"/)
  assert.match(html, /Ana Pérez/)
  assert.match(html, /CC 123/)
  assert.match(html, /4 nov 2026, 11:23 p\. m\./)
  assert.match(html, /190\.0\.0\.1/)
  assert.match(html, /tablet-1/)
  assert.equal(html.includes('Pendiente de firma digital'), false)
})

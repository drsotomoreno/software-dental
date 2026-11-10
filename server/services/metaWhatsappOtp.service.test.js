import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertWhatsAppSendAllowed,
  commitWhatsAppSend,
  mapMetaSendError,
  normalizeWhatsAppRecipient,
  resetWhatsAppSendRateLimitForTests,
  sendAuthenticationOtp,
} from './metaWhatsappOtp.service.js'
import { checkPhoneOtp, deletePhoneOtp, savePhoneOtp } from './phoneOtpStore.js'

const cfg = {
  graphVersion: 'v22.0',
  phoneNumberId: '1099887766',
  accessToken: 'token-de-prueba',
  templateName: 'otp_registro',
  templateLanguage: 'es',
  includeButton: true,
}

test('rechaza un celular que no es móvil de Colombia sin llamar a Meta', async () => {
  let called = false
  const result = await sendAuthenticationOtp(
    { to: '6012345678', code: '123456' },
    {
      config: cfg,
      fetch: async () => {
        called = true
        throw new Error('no debía llamarse')
      },
    },
  )
  assert.equal(called, false)
  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
  assert.equal(result.kind, 'invalid_number')
  assert.equal(normalizeWhatsAppRecipient('3001234567'), '573001234567')
})

test('envía la plantilla authentication con el OTP en el cuerpo y en el botón', async () => {
  const seen = []
  const result = await sendAuthenticationOtp(
    { to: '+57 300 123 4567', code: '482913' },
    {
      config: cfg,
      fetch: async (url, init) => {
        seen.push({ url, init })
        return {
          ok: true,
          status: 200,
          json: async () => ({ messages: [{ id: 'wamid.HBgMNTcz' }] }),
        }
      },
    },
  )

  assert.equal(result.ok, true)
  assert.equal(result.messageId, 'wamid.HBgMNTcz')
  assert.equal(result.code, undefined)
  assert.equal(
    seen[0].url,
    'https://graph.facebook.com/v22.0/1099887766/messages',
  )
  assert.equal(seen[0].init.method, 'POST')
  assert.equal(seen[0].init.headers.Authorization, 'Bearer token-de-prueba')
  const body = JSON.parse(seen[0].init.body)
  assert.equal(body.messaging_product, 'whatsapp')
  assert.equal(body.type, 'template')
  assert.equal(body.to, '573001234567')
  assert.equal(body.template.name, 'otp_registro')
  assert.equal(body.template.language.code, 'es')
  assert.equal(body.template.components[0].parameters[0].text, '482913')
  assert.equal(body.template.components[1].type, 'button')
  assert.equal(body.template.components[1].sub_type, 'url')
  assert.equal(body.template.components[1].parameters[0].text, '482913')
})

test('un número rechazado por Meta no se presenta como fallo genérico', async () => {
  const result = await sendAuthenticationOtp(
    { to: '3001234567', code: '111111' },
    {
      config: cfg,
      fetch: async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: '(#131026) Receiver is not a valid WhatsApp user',
            code: 131026,
            fbtrace_id: 'trace-test',
          },
        }),
      }),
    },
  )
  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
  assert.equal(result.kind, 'invalid_number')
  assert.equal(result.error.includes('131026'), false)
  assert.equal(result.fbtrace_id, undefined)
})

test('sin token de Meta no se intenta el envío', async () => {
  let called = false
  const result = await sendAuthenticationOtp(
    { to: '3001234567', code: '222222' },
    {
      config: { ...cfg, accessToken: '' },
      fetch: async () => {
        called = true
        return { ok: true, status: 200, json: async () => ({}) }
      },
    },
  )
  assert.equal(called, false)
  assert.equal(result.status, 503)
  assert.equal(result.kind, 'not_configured')
})

test('un corte de red con Graph API queda como fallo de contacto', async () => {
  const result = await sendAuthenticationOtp(
    { to: '3001234567', code: '333333' },
    {
      config: cfg,
      fetch: async () => {
        throw new Error('connect ECONNREFUSED')
      },
    },
  )
  assert.equal(result.ok, false)
  assert.equal(result.status, 502)
  assert.equal(result.kind, 'network')
})

test('el límite de reenvío es de un código por minuto', () => {
  resetWhatsAppSendRateLimitForTests()
  const now = Date.UTC(2026, 10, 10, 12, 0, 0)
  assert.equal(assertWhatsAppSendAllowed('3005556677', now).ok, true)
  commitWhatsAppSend('3005556677', now)
  const blocked = assertWhatsAppSendAllowed('573005556677', now + 30_000)
  assert.equal(blocked.ok, false)
  assert.equal(blocked.status, 429)
  assert.equal(assertWhatsAppSendAllowed('3005556677', now + 61_000).ok, true)
})

test('mapMetaSendError distingue credencial inválida de límite de Meta', () => {
  const auth = mapMetaSendError(401, { error: { code: 190, message: 'Invalid OAuth' } })
  assert.equal(auth.kind, 'meta_auth')
  assert.equal(auth.status, 503)
  const rate = mapMetaSendError(429, { error: { code: 130429, message: 'Rate limit' } })
  assert.equal(rate.kind, 'meta_rate')
  assert.equal(rate.status, 429)
})

test('el OTP de WhatsApp solo coincide con el código guardado y caduca', async () => {
  const phone = '3007778899'
  try {
    const saved = await savePhoneOtp({
      phone,
      email: 'otp-wa@example.com',
      code: '654321',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    assert.equal(saved.ok, true)
    assert.equal(saved.record.code, undefined)

    const wrong = await checkPhoneOtp(phone, '000000')
    assert.equal(wrong.ok, false)
    assert.match(wrong.error, /no es válido/)

    const right = await checkPhoneOtp('+57 300 777 8899', '654321')
    assert.equal(right.ok, true)
    assert.equal(right.record.email, 'otp-wa@example.com')

    await savePhoneOtp({
      phone,
      email: 'otp-wa@example.com',
      code: '654321',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    const expired = await checkPhoneOtp(phone, '654321')
    assert.equal(expired.ok, false)
    assert.match(expired.error, /expiró/)
  } finally {
    await deletePhoneOtp(phone)
  }
})

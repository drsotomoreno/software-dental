import assert from 'node:assert/strict'
import test from 'node:test'
import {
  checkWhatsAppNumberExists,
  parseWhatsAppExistsResponse,
  WHATSAPP_EXISTS_TIMEOUT_MS,
} from './whatsapp.service.js'

const testWa = {
  baseUrl: 'https://evolution.test',
  apiKey: 'test-key',
  instance: 'mihistoriadental',
}

test('parseWhatsAppExistsResponse lee exists / onWhatsApp', () => {
  assert.equal(
    parseWhatsAppExistsResponse([{ exists: true, number: '573158472936' }], '573158472936'),
    true,
  )
  assert.equal(
    parseWhatsAppExistsResponse([{ exists: false, number: '573001234567' }], '573001234567'),
    false,
  )
  assert.equal(
    parseWhatsAppExistsResponse(
      [{ onWhatsApp: false, jid: '573001112233@s.whatsapp.net' }],
      '573001112233',
    ),
    false,
  )
  assert.equal(parseWhatsAppExistsResponse({}, '573158472936'), null)
})

test('checkWhatsAppNumberExists: exists false vs timeout/fallback', async () => {
  assert.equal(WHATSAPP_EXISTS_TIMEOUT_MS, 3000)

  const missing = await checkWhatsAppNumberExists('573158472936', {
    waConfig: testWa,
    fetchImpl: async () => ({
      ok: true,
      json: async () => [{ exists: false, number: '573158472936' }],
    }),
  })
  assert.equal(missing.ok, true)
  assert.equal(missing.exists, false)

  const present = await checkWhatsAppNumberExists('573158472936', {
    waConfig: testWa,
    fetchImpl: async () => ({
      ok: true,
      json: async () => [{ exists: true, number: '573158472936' }],
    }),
  })
  assert.equal(present.ok, true)
  assert.equal(present.exists, true)

  const timedOut = await checkWhatsAppNumberExists('573158472936', {
    waConfig: testWa,
    timeoutMs: 40,
    fetchImpl: async (_url, init) => {
      await new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('should have aborted')), 500)
        init.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
        })
      })
    },
  })
  assert.equal(timedOut.ok, false)
  assert.equal(timedOut.exists, null)
})

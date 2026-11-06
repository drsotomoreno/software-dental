import assert from 'node:assert/strict'
import test from 'node:test'
import { buildKioskLanUrl, isPrivateLanOrigin, resolveKioskLinkTarget } from './localLanAddress.js'

test('buildKioskLanUrl sustituye localhost por la IP de la LAN', () => {
  const url = buildKioskLanUrl({
    ip: '192.168.1.42',
    port: '5173',
    clinicId: 'clinic:demo',
    token: 'header.payload.sig',
  })
  assert.equal(
    url,
    'http://192.168.1.42:5173/kiosco/clinic%3Ademo/header.payload.sig',
  )
  assert.equal(url.includes('localhost'), false)
})

test('resolveKioskLinkTarget usa el dominio público y no el puerto interno de Node', () => {
  const target = resolveKioskLinkTarget(
    {
      headers: {
        host: 'www.mihistoriadental.com',
        'x-forwarded-proto': 'https',
      },
    },
    { lanIp: '192.168.80.35', lanPort: '3000' },
  )
  assert.equal(target.origin, 'https://www.mihistoriadental.com')
  assert.equal(target.port, null)
  assert.equal(target.origin.includes('192.168.80.35'), false)
})

test('resolveKioskLinkTarget conserva la IP de la LAN en local', () => {
  const target = resolveKioskLinkTarget(
    { headers: { host: 'localhost:3000' } },
    { lanIp: '192.168.80.35', lanPort: '5173' },
  )
  assert.equal(target.origin, 'http://192.168.80.35:5173')
})

test('isPrivateLanOrigin acepta la tableta en 192.168 y rechaza hosts públicos', () => {
  assert.equal(isPrivateLanOrigin('http://192.168.0.15:3000'), true)
  assert.equal(isPrivateLanOrigin('http://localhost:5173'), true)
  assert.equal(isPrivateLanOrigin('https://mihistoriadental.com'), false)
})

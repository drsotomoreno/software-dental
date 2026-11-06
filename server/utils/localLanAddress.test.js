import assert from 'node:assert/strict'
import test from 'node:test'
import { buildKioskLanUrl, isPrivateLanOrigin } from './localLanAddress.js'

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

test('isPrivateLanOrigin acepta la tableta en 192.168 y rechaza hosts públicos', () => {
  assert.equal(isPrivateLanOrigin('http://192.168.0.15:3000'), true)
  assert.equal(isPrivateLanOrigin('http://localhost:5173'), true)
  assert.equal(isPrivateLanOrigin('https://mihistoriadental.com'), false)
})

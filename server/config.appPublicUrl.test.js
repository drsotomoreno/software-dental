import assert from 'node:assert/strict'
import test from 'node:test'
import { CANONICAL_PRODUCTION_ORIGIN, resolveAppPublicUrl } from './config.js'

test('resolveAppPublicUrl fuerza www para apex y www de mihistoriadental.com', () => {
  assert.equal(resolveAppPublicUrl('https://mihistoriadental.com'), CANONICAL_PRODUCTION_ORIGIN)
  assert.equal(resolveAppPublicUrl('https://www.mihistoriadental.com/'), CANONICAL_PRODUCTION_ORIGIN)
  assert.equal(resolveAppPublicUrl('https://mihistoriadental.com/ruta'), CANONICAL_PRODUCTION_ORIGIN)
})

test('resolveAppPublicUrl conserva localhost en desarrollo', () => {
  const prev = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    assert.equal(resolveAppPublicUrl('http://localhost:3000'), 'http://localhost:3000')
  } finally {
    process.env.NODE_ENV = prev
  }
})

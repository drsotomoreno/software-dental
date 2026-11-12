import assert from 'node:assert/strict'
import test from 'node:test'
import {
  APEX_PRODUCTION_HOST,
  CANONICAL_PRODUCTION_HOST,
  CANONICAL_PRODUCTION_ORIGIN,
} from './canonicalHost.ts'

test('constantes canónicas de producción usan www', () => {
  assert.equal(CANONICAL_PRODUCTION_ORIGIN, 'https://www.mihistoriadental.com')
  assert.equal(CANONICAL_PRODUCTION_HOST, 'www.mihistoriadental.com')
  assert.equal(APEX_PRODUCTION_HOST, 'mihistoriadental.com')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectMobile, mobileDigitsMatch, normalizeMobileDigits } from './mobilePhone.js'

test('acepta celular de Colombia con o sin indicativo', () => {
  const national = inspectMobile('300 123 4567')
  assert.equal(national.ok, true)
  assert.equal(national.digits, '573001234567')

  const international = inspectMobile('+57 300 123 4567')
  assert.equal(international.ok, true)
  assert.equal(international.digits, '573001234567')
  assert.equal(normalizeMobileDigits('573001234567'), '573001234567')
})

test('rechaza un fijo de Colombia', () => {
  const landline = inspectMobile('6012345678')
  assert.equal(landline.ok, false)
  assert.match(landline.error, /celular/)
  assert.equal(normalizeMobileDigits('6012345678'), '')
})

test('acepta un celular internacional con indicativo', () => {
  const spain = inspectMobile('+34612345678')
  assert.equal(spain.ok, true)
  assert.equal(spain.digits, '34612345678')
})

test('Colombia coincide por E.164 o por los 10 dígitos locales', () => {
  assert.equal(mobileDigitsMatch('573001234567', '3001234567'), true)
  assert.equal(mobileDigitsMatch('573001234567', '573001234567'), true)
  assert.equal(mobileDigitsMatch('573001234567', '573009999999'), false)
  assert.equal(mobileDigitsMatch('34612345678', '612345678'), false)
})

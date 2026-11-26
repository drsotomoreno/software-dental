import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FAKE_OR_INVALID_MOBILE_ERROR,
  inspectMobile,
  looksLikeFakeMobileDigits,
  mobileDigitsMatch,
  normalizeMobileDigits,
} from './mobilePhone.js'

test('acepta celular de Colombia con o sin indicativo', () => {
  const national = inspectMobile('315 847 2936')
  assert.equal(national.ok, true)
  assert.equal(national.digits, '573158472936')

  const international = inspectMobile('+57 315 847 2936')
  assert.equal(international.ok, true)
  assert.equal(international.digits, '573158472936')
  assert.equal(normalizeMobileDigits('573158472936'), '573158472936')
})

test('rechaza un fijo de Colombia', () => {
  const landline = inspectMobile('6012345678')
  assert.equal(landline.ok, false)
  assert.match(landline.error, /celular/)
  assert.equal(normalizeMobileDigits('6012345678'), '')
})

test('acepta un celular internacional con indicativo', () => {
  const spain = inspectMobile('+34619876543')
  assert.equal(spain.ok, true)
  assert.equal(spain.digits, '34619876543')
})

test('rechaza patrones falsos evidentes de Colombia', () => {
  for (const fake of ['3123456789', '3001234567', '573001234567', '3111111111', '3000000000']) {
    assert.equal(looksLikeFakeMobileDigits(fake), true, fake)
    const result = inspectMobile(fake)
    assert.equal(result.ok, false, fake)
    assert.equal(result.error, FAKE_OR_INVALID_MOBILE_ERROR)
  }
})

test('no rechaza celulares reales con repetición parcial de dígitos', () => {
  for (const real of ['3155858168', '3187080343', '573155858168', '573187080343']) {
    assert.equal(looksLikeFakeMobileDigits(real), false, real)
    const result = inspectMobile(real)
    assert.equal(result.ok, true, real)
  }
})

test('rechaza longitud inválida con el mensaje de celular real', () => {
  const short = inspectMobile('300123')
  assert.equal(short.ok, false)
  assert.equal(short.error, FAKE_OR_INVALID_MOBILE_ERROR)
})

test('Colombia coincide por E.164 o por los 10 dígitos locales', () => {
  assert.equal(mobileDigitsMatch('573158472936', '3158472936'), true)
  assert.equal(mobileDigitsMatch('573158472936', '573158472936'), true)
  assert.equal(mobileDigitsMatch('573158472936', '573009999999'), false)
  assert.equal(mobileDigitsMatch('34619876543', '619876543'), false)
})

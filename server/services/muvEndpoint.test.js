import assert from 'node:assert/strict'
import test from 'node:test'
import { readFevRipsSettings } from './fevRipsService.js'
import { resolveMinsaludSettings } from './minsaludService.js'
import {
  MUV_PRODUCTION_APP_VERSION,
  MUV_PRODUCTION_BASE_URL,
  MUV_SANDBOX_BASE_URL,
  MUV_STAGE_APP_VERSION,
  resolveMuvEndpoint,
} from './muvEndpoint.js'

const CREDENCIALES = {
  MINSALUD_USERNAME: 'CC79904620',
  MINSALUD_PASSWORD: 'clave-prueba',
  MINSALUD_NIT: '79904620',
}

test('sin señales de producción el MUV usa Stage', () => {
  assert.deepEqual(resolveMuvEndpoint({}), {
    sandbox: true,
    baseUrl: MUV_SANDBOX_BASE_URL,
  })
  assert.equal(resolveMuvEndpoint({ MINSALUD_ENV: 'stage' }).baseUrl, MUV_SANDBOX_BASE_URL)
})

test('MINSALUD_ENV=production usa el host oficial', () => {
  for (const environment of ['production', ' Production ']) {
    const endpoint = resolveMuvEndpoint({ MINSALUD_ENV: environment })
    assert.equal(endpoint.sandbox, false)
    assert.equal(endpoint.baseUrl, MUV_PRODUCTION_BASE_URL)
  }
})

test('MINSALUD_SANDBOX=false usa el host oficial aunque el entorno sea stage', () => {
  const endpoint = resolveMuvEndpoint({
    MINSALUD_ENV: 'stage',
    MINSALUD_SANDBOX: 'false',
  })
  assert.equal(endpoint.sandbox, false)
  assert.equal(endpoint.baseUrl, MUV_PRODUCTION_BASE_URL)
})

test('MINSALUD_ENV=production gana a MINSALUD_SANDBOX=true', () => {
  const endpoint = resolveMuvEndpoint({
    MINSALUD_ENV: 'production',
    MINSALUD_SANDBOX: 'true',
  })
  assert.equal(endpoint.sandbox, false)
  assert.equal(endpoint.baseUrl, MUV_PRODUCTION_BASE_URL)
})

test('MINSALUD_API_BASE_URL reemplaza el host automático', () => {
  const endpoint = resolveMuvEndpoint({
    MINSALUD_ENV: 'production',
    MINSALUD_API_BASE_URL: 'https://proxy.ejemplo.test/fevrips-api/',
  })
  assert.equal(endpoint.sandbox, false)
  assert.equal(endpoint.baseUrl, 'https://proxy.ejemplo.test/fevrips-api')
})

test('MinsaludService y el cliente FEV radican en el host que corresponde', () => {
  const stage = resolveMinsaludSettings({ ...CREDENCIALES, MINSALUD_ENV: 'stage' })
  const production = resolveMinsaludSettings({ ...CREDENCIALES, MINSALUD_ENV: 'production' })
  const sandboxOff = readFevRipsSettings({ ...CREDENCIALES, MINSALUD_SANDBOX: 'false' })

  assert.equal(stage.appVersion, MUV_STAGE_APP_VERSION)
  assert.equal(production.appVersion, MUV_PRODUCTION_APP_VERSION)
  assert.equal(stage.baseUrl, MUV_SANDBOX_BASE_URL)
  assert.equal(stage.loginUrl, `${MUV_SANDBOX_BASE_URL}/api/Auth/LoginSISPRO`)
  assert.equal(stage.cargarSinFacturaUrl, `${MUV_SANDBOX_BASE_URL}/api/PaquetesFevRips/CargarRipsSinFactura`)
  assert.equal(production.baseUrl, MUV_PRODUCTION_BASE_URL)
  assert.equal(production.cargarSinFacturaUrl, `${MUV_PRODUCTION_BASE_URL}/api/PaquetesFevRips/CargarRipsSinFactura`)
  assert.equal(sandboxOff.appVersion, MUV_PRODUCTION_APP_VERSION)
  assert.equal(sandboxOff.baseUrl, MUV_PRODUCTION_BASE_URL)
  assert.equal(sandboxOff.loginUrl, `${MUV_PRODUCTION_BASE_URL}/api/Auth/LoginSISPRO`)
})

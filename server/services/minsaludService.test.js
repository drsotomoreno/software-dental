import assert from 'node:assert/strict'
import test from 'node:test'
import { MinsaludService, TOKEN_RENEW_SKEW_MS } from './minsaludService.js'

const CUV = 'ab'.repeat(48)

function jwtExpiringIn(ms) {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor((Date.now() + ms) / 1000) })).toString('base64url')
  return `${header}.${payload}.sig`
}

function credenciales(extra = {}) {
  return {
    env: {},
    username: 'CC79904620',
    password: 'clave-prueba',
    nit: '79904620',
    ...extra,
  }
}

test('la margen de renovación del token es de 5 minutos', () => {
  assert.equal(TOKEN_RENEW_SKEW_MS, 5 * 60 * 1000)
})

test('falta de credenciales aborta la instancia', () => {
  assert.throws(
    () => new MinsaludService({ env: {}, password: 'x', nit: '79904620' }),
    (error) =>
      error?.code === 'MUV_CREDENTIALS_MISSING' &&
      error.missing.includes('MINSALUD_USERNAME') &&
      /MINSALUD_USERNAME/.test(error.message),
  )
  assert.throws(
    () => new MinsaludService({ env: {}, username: 'CC1', nit: '1' }),
    (error) => error.missing.includes('MINSALUD_PASSWORD'),
  )
  assert.throws(
    () => new MinsaludService({ env: {}, username: 'CC1', password: 'x', nit: 'abc' }),
    (error) => error.missing.includes('MINSALUD_NIT'),
  )
})

test('separa el usuario en tipo y número y envía tipoUsuario PIN', async () => {
  const calls = []
  const service = new MinsaludService({
    ...credenciales({ tipoUsuario: 'RE' }),
    request: async (url, options) => {
      calls.push({ url, body: options.body, headers: options.headers })
      if (String(url).includes('LoginSISPRO')) {
        return {
          response: { status: 200, ok: true },
          data: { login: true, token: jwtExpiringIn(60 * 60 * 1000) },
        }
      }
      return {
        response: { status: 200, ok: true },
        data: {
          ResultState: true,
          CodigoUnicoValidacion: CUV,
          ResultadosValidacion: [{ Clase: 'NOTIFICACION', Codigo: 'RVG01' }],
        },
      }
    },
  })

  assert.equal(service.settings.tipoDocumento, 'CC')
  assert.equal(service.settings.numeroDocumento, '79904620')
  assert.equal(service.settings.tipoUsuario, 'PIN')

  const result = await service.enviarRipsSinFactura({ numFactura: null, usuarios: [] })
  const login = calls.find((call) => String(call.url).includes('LoginSISPRO'))
  const carga = calls.find((call) => String(call.url).includes('CargarRipsSinFactura'))

  assert.equal(login.body.persona.identificacion.tipo, 'CC')
  assert.equal(login.body.persona.identificacion.numero, '79904620')
  assert.equal(login.body.tipoUsuario, 'PIN')
  assert.equal(login.body.clave, 'clave-prueba')
  assert.equal(login.body.nit, '79904620')
  assert.equal(carga.body.xmlFevFile, '')
  assert.deepEqual(carga.body.rips, { numFactura: null, usuarios: [] })
  assert.match(carga.headers.Authorization, /^Bearer /)
  assert.equal(result.CUV, CUV)
  assert.equal(result.resultState, true)
  assert.equal(result.resultadosValidacion[0].Codigo, 'RVG01')
})

test('reutiliza el token vivo y lo renueva si faltan menos de 5 minutos', async () => {
  let logins = 0
  let tokenTtl = 60 * 60 * 1000
  const service = new MinsaludService({
    ...credenciales(),
    request: async (url) => {
      if (String(url).includes('LoginSISPRO')) {
        logins += 1
        return {
          response: { status: 200, ok: true },
          data: { login: true, token: jwtExpiringIn(tokenTtl) },
        }
      }
      return {
        response: { status: 200, ok: true },
        data: { ResultState: false, ResultadosValidacion: [{ Clase: 'RECHAZADO', Codigo: 'RVC091' }] },
      }
    },
  })

  const first = await service.enviarRipsSinFactura({ id: 1 })
  const second = await service.enviarRipsSinFactura({ id: 2 })
  assert.equal(logins, 1)
  assert.equal(first.CUV, null)
  assert.equal(second.resultState, false)
  assert.equal(second.resultadosValidacion[0].Codigo, 'RVC091')

  tokenTtl = 4 * 60 * 1000
  service._cachedToken = null
  service._tokenExpiresAt = 0
  await service.enviarRipsSinFactura({ id: 3 })
  await service.enviarRipsSinFactura({ id: 4 })
  assert.equal(logins, 3)
})

test('el header de carga lleva el Bearer renovado', async () => {
  const tokens = []
  const service = new MinsaludService({
    ...credenciales(),
    request: async (url, options) => {
      if (String(url).includes('LoginSISPRO')) {
        return {
          response: { status: 200, ok: true },
          data: { login: true, token: jwtExpiringIn(60 * 60 * 1000) },
        }
      }
      tokens.push(options.headers.Authorization)
      return {
        response: { status: 200, ok: true },
        data: { ResultState: true, CodigoUnicoValidacion: CUV, ResultadosValidacion: [] },
      }
    },
  })

  await service.enviarRipsSinFactura({})
  assert.match(tokens[0], /^Bearer [\w-]+\.[\w-]+\.sig$/)
})

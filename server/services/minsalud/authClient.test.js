import assert from 'node:assert/strict'
import https from 'node:https'
import test from 'node:test'
import { createMinsaludAuthClient } from './authClient.js'
import {
  MinsaludAuthConfigError,
  MinsaludAuthForbiddenError,
  MinsaludAuthNetworkError,
  MinsaludAuthUnauthorizedError,
  MinsaludAuthUpstreamError,
} from './errors.js'
import { credentialsAreConfigured, readMinsaludAuthSettings } from './settings.js'
import { createTlsAgent } from './tls.js'

const NOW = 1_700_000_000_000

function jwt(expSeconds) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url')
  return `${header}.${body}.sig`
}

function sisproSettings(overrides = {}) {
  return {
    authMode: 'login_sispro',
    apiBaseUrl: 'https://muv.minsalud.test',
    authUrl: '',
    authPath: '/api/Auth/LoginSISPRO',
    tipoDocumento: 'CC',
    numeroDocumento: '79605611',
    clave: 'secreto-sispro',
    nit: '900123456',
    tipoUsuario: 'RE',
    tipoMecanismoValidacion: null,
    reps: null,
    clientId: '',
    clientSecret: '',
    clientScope: '',
    clientAuth: 'body',
    tls: {
      cert: '',
      key: '',
      ca: '',
      certPath: '',
      keyPath: '',
      caPath: '',
      passphrase: '',
      rejectUnauthorized: true,
    },
    tokenSkewMs: 60_000,
    tokenTtlSeconds: 3600,
    timeoutMs: 5_000,
    maxAttempts: 3,
    retryBaseMs: 400,
    retryMaxMs: 8_000,
    ...overrides,
  }
}

function tokenResponse(expSeconds = NOW / 1000 + 3600, extra = {}) {
  return {
    status: 200,
    headers: {},
    text: JSON.stringify({ token: jwt(expSeconds), login: true, registrado: true, ...extra }),
  }
}

function harness(settings, responses, extra = {}) {
  const calls = []
  let index = 0
  const delays = []
  let clock = extra.nowStart ?? NOW
  const timers = []
  const client = createMinsaludAuthClient({
    getConfig: () => settings,
    now: () => clock,
    sleep: async (ms) => {
      delays.push(ms)
    },
    random: () => 0,
    autoRenew: extra.autoRenew ?? false,
    setTimer: (fn, ms) => {
      const handle = { fn, ms, cleared: false, unref() {} }
      timers.push(handle)
      return handle
    },
    clearTimer: (handle) => {
      handle.cleared = true
    },
    readFile: extra.readFile,
    request: async (options) => {
      calls.push(options)
      const next = responses[Math.min(index, responses.length - 1)]
      index += 1
      if (typeof next === 'function') return next(options)
      if (next instanceof Error) throw next
      return next
    },
  })
  return {
    client,
    calls,
    delays,
    timers,
    setClock(value) {
      clock = value
    },
  }
}

test('LoginSISPRO envía el cuerpo de la guía y reutiliza el Bearer Token', async () => {
  const exp = NOW / 1000 + 3600
  const { client, calls } = harness(sisproSettings(), [tokenResponse(exp)])

  const first = await client.getAccessToken()
  const second = await client.getAccessToken()

  assert.equal(first, second)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://muv.minsalud.test/api/Auth/LoginSISPRO')
  assert.equal(calls[0].headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(calls[0].body), {
    persona: { identificacion: { tipo: 'CC', numero: '79605611' } },
    clave: 'secreto-sispro',
    nit: '900123456',
    tipoUsuario: 'RE',
  })
})

test('renueva el token al entrar en la ventana previa al exp del JWT', async () => {
  const exp = NOW / 1000 + 3600
  const renewed = exp + 3600
  const { client, calls, setClock } = harness(sisproSettings(), [
    tokenResponse(exp),
    tokenResponse(renewed),
  ])

  const original = await client.getAccessToken()
  setClock(exp * 1000 - 60_000)
  const next = await client.getAccessToken()

  assert.notEqual(next, original)
  assert.equal(calls.length, 2)
  assert.equal(await client.getAccessToken(), next)
  assert.equal(calls.length, 2)
})

test('si el refresco falla y el token aún no vence, se sigue usando', async () => {
  const exp = NOW / 1000 + 3600
  const { client, setClock } = harness(sisproSettings(), [
    tokenResponse(exp),
    new Error('socket hang up'),
  ])
  const original = await client.getAccessToken()
  setClock(exp * 1000 - 30_000)
  assert.equal(await client.getAccessToken(), original)
})

test('las peticiones concurrentes comparten un solo login', async () => {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  let started = 0
  const { client } = harness(sisproSettings(), [
    async () => {
      started += 1
      await gate
      return tokenResponse()
    },
  ])

  const pending = Promise.all([client.getAccessToken(), client.getAccessToken()])
  await Promise.resolve()
  assert.equal(started, 1)
  release()
  const [a, b] = await pending
  assert.equal(a, b)
  assert.equal(started, 1)
})

test('500 reintenta con backoff y no filtra la clave', async () => {
  const { client, calls, delays } = harness(sisproSettings(), [
    { status: 500, headers: {}, text: JSON.stringify({ message: 'fallo secreto-sispro' }) },
    { status: 503, headers: { 'retry-after': '1' }, text: '' },
    tokenResponse(),
  ])

  const token = await client.getAccessToken()
  assert.ok(token)
  assert.equal(calls.length, 3)
  assert.deepEqual(delays, [400, 1000])
})

test('401 con clave inválida no se reintenta', async () => {
  const { client, calls } = harness(sisproSettings(), [
    { status: 401, headers: {}, text: JSON.stringify({ login: false, errors: ['Usuario o clave incorrectos'] }) },
  ])

  await assert.rejects(client.getAccessToken(), (error) => {
    assert.ok(error instanceof MinsaludAuthUnauthorizedError)
    assert.equal(error.retryable, false)
    assert.equal(error.httpStatus, 401)
    assert.equal(JSON.stringify(error.details).includes('secreto-sispro'), false)
    return true
  })
  assert.equal(calls.length, 1)
})

test('401 sin cuerpo reintenta una sola vez', async () => {
  const { client, calls } = harness(sisproSettings(), [
    { status: 401, headers: {}, text: '' },
    { status: 401, headers: {}, text: '' },
    tokenResponse(),
  ])

  await assert.rejects(client.getAccessToken(), MinsaludAuthUnauthorizedError)
  assert.equal(calls.length, 2)
})

test('403 con cuerpo de permiso no se reintenta; 403 vacío sí, una vez', async () => {
  const forbidden = harness(sisproSettings(), [
    { status: 403, headers: {}, text: JSON.stringify({ message: 'Acceso denegado' }) },
  ])
  await assert.rejects(forbidden.client.getAccessToken(), (error) => {
    assert.ok(error instanceof MinsaludAuthForbiddenError)
    assert.equal(error.retryable, false)
    return true
  })
  assert.equal(forbidden.calls.length, 1)

  const ambiguous = harness(sisproSettings(), [
    { status: 403, headers: {}, text: '' },
    { status: 403, headers: {}, text: '' },
  ])
  await assert.rejects(ambiguous.client.getAccessToken(), MinsaludAuthForbiddenError)
  assert.equal(ambiguous.calls.length, 2)
})

test('HTTP 200 con login false no guarda token', async () => {
  const { client, calls } = harness(sisproSettings(), [
    { status: 200, headers: {}, text: JSON.stringify({ token: null, login: false }) },
  ])
  await assert.rejects(client.getAccessToken(), MinsaludAuthUnauthorizedError)
  assert.equal(calls.length, 1)
})

test('un fallo de red reintenta y luego agota el cupo', async () => {
  const { client, calls } = harness(sisproSettings({ maxAttempts: 3 }), [
    Object.assign(new Error('econnreset'), { code: 'ECONNRESET' }),
    Object.assign(new Error('econnreset'), { code: 'ECONNRESET' }),
    Object.assign(new Error('econnreset'), { code: 'ECONNRESET' }),
  ])
  await assert.rejects(client.getAccessToken(), MinsaludAuthNetworkError)
  assert.equal(calls.length, 3)
})

test('client_credentials usa el token endpoint y Basic no pone el secreto en el cuerpo', async () => {
  const settings = sisproSettings({
    authMode: 'client_credentials',
    authUrl: 'https://gateway.minsalud.test/token',
    clientId: 'ips-odontologia',
    clientSecret: 'super-secreto-gateway',
    clientAuth: 'basic',
    clientScope: 'fevrips',
    numeroDocumento: '',
    clave: '',
  })
  const { client, calls } = harness(settings, [tokenResponse()])
  await client.getAccessToken()
  assert.equal(calls[0].url, 'https://gateway.minsalud.test/token')
  assert.equal(calls[0].headers['Content-Type'], 'application/x-www-form-urlencoded')
  assert.match(calls[0].headers.Authorization, /^Basic /)
  assert.equal(calls[0].body.includes('super-secreto-gateway'), false)
  assert.match(calls[0].body, /grant_type=client_credentials/)
  assert.match(calls[0].body, /scope=fevrips/)
})

test('falta de credenciales SISPRO es un error de configuración', async () => {
  const { client } = harness(sisproSettings({ numeroDocumento: '', clave: '' }), [])
  await assert.rejects(client.getAccessToken(), MinsaludAuthConfigError)
})

test('mTLS adjunta el certificado de cliente a la petición de login', async () => {
  const settings = sisproSettings({
    tls: {
      ...sisproSettings().tls,
      cert: '-----BEGIN CERTIFICATE-----\\nQUJD\\n-----END CERTIFICATE-----',
      key: '-----BEGIN PRIVATE KEY-----\\nREVG\\n-----END PRIVATE KEY-----',
      rejectUnauthorized: false,
    },
  })
  const { client, calls } = harness(settings, [tokenResponse()])
  await client.getAccessToken()
  assert.ok(calls[0].agent instanceof https.Agent)
  assert.equal(calls[0].agent.options.rejectUnauthorized, false)
  assert.match(calls[0].agent.options.cert, /BEGIN CERTIFICATE/)
  assert.doesNotMatch(calls[0].agent.options.cert, /\\n/)
})

test('la renovación automática se agenda antes del vencimiento', async () => {
  const exp = NOW / 1000 + 3600
  const { client, timers, calls } = harness(sisproSettings(), [tokenResponse(exp), tokenResponse(exp + 10)], {
    autoRenew: true,
  })
  await client.getAccessToken()
  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, 3_600_000 - 60_000)
  await timers[0].fn()
  assert.equal(calls.length, 2)
})

test('un 401 en la API de negocio invalida el token y reintenta una vez', async () => {
  const { client, calls } = harness(sisproSettings(), [
    tokenResponse(NOW / 1000 + 3600),
    { status: 401, headers: {}, text: '{"message":"token expirado"}' },
    tokenResponse(NOW / 1000 + 7200),
    { status: 200, headers: {}, text: '{"CUV":"CUV-1"}' },
  ])

  const response = await client.authorizedRequest({
    url: 'https://muv.minsalud.test/api/PaquetesFevRips/CargarFevRips',
    body: '{}',
  })
  assert.equal(response.status, 200)
  assert.equal(calls.length, 4)
  assert.match(calls[1].headers.Authorization, /^Bearer /)
  assert.notEqual(calls[1].headers.Authorization, calls[3].headers.Authorization)
})

test('agota 5xx y conserva el código HTTP del ministerio', async () => {
  const { client } = harness(sisproSettings({ maxAttempts: 2 }), [
    { status: 500, headers: {}, text: '{"message":"error interno secreto-sispro"}' },
    { status: 500, headers: {}, text: '{"message":"error interno secreto-sispro"}' },
  ])
  await assert.rejects(client.getAccessToken(), (error) => {
    assert.ok(error instanceof MinsaludAuthUpstreamError)
    assert.equal(error.httpStatus, 500)
    assert.equal(error.attempt, 2)
    const rendered = `${error.message} ${JSON.stringify(error.details)}`
    assert.equal(rendered.includes('secreto-sispro'), false)
    return true
  })
})

test('el entorno resuelve LoginSISPRO, alias de usuario y client_credentials', () => {
  const sispro = readMinsaludAuthSettings({
    MINSALUD_API_BASE_URL: 'https://muv.example/',
    MINSALUD_USERNAME: '123',
    MINSALUD_PASSWORD: 'clave',
    MINSALUD_NIT: '900',
    MINSALUD_TIPO_USUARIO: 'pinx',
    MINSALUD_REPS: 'true',
    MINSALUD_TIPO_MECANISMO_VALIDACION: '0',
  })
  assert.equal(sispro.authMode, 'login_sispro')
  assert.equal(sispro.apiBaseUrl, 'https://muv.example')
  assert.equal(sispro.numeroDocumento, '123')
  assert.equal(sispro.clave, 'clave')
  assert.equal(sispro.tipoUsuario, 'PINx')
  assert.equal(sispro.reps, true)
  assert.equal(sispro.tipoMecanismoValidacion, 0)
  assert.equal(credentialsAreConfigured(sispro), true)

  const gateway = readMinsaludAuthSettings({
    MINSALUD_CLIENT_ID: 'abc',
    MINSALUD_CLIENT_SECRET: 'xyz',
    MINSALUD_AUTH_URL: 'https://gateway.example/token',
  })
  assert.equal(gateway.authMode, 'client_credentials')
  assert.equal(credentialsAreConfigured(gateway), true)

  const incomplete = readMinsaludAuthSettings({
    MINSALUD_API_BASE_URL: 'https://muv.example',
    MINSALUD_USERNAME: '123',
    MINSALUD_PASSWORD: 'clave',
  })
  assert.equal(credentialsAreConfigured(incomplete), false)
})

test('certificado sin llave falla al armar el agente', () => {
  assert.throws(
    () => createTlsAgent({
      cert: '-----BEGIN CERTIFICATE-----\\nQQ==\\n-----END CERTIFICATE-----',
      key: '',
      ca: '',
      certPath: '',
      keyPath: '',
      caPath: '',
      passphrase: '',
      rejectUnauthorized: true,
    }),
    MinsaludAuthConfigError,
  )
})

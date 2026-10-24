import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import {
  MuvInfrastructureError,
  SisproMuvService,
  canalDeEnvio,
  codificarXmlFev,
  interpretarRespuestaSispro,
  resolveSisproTimeoutMs,
  ripsParaMinisterio,
} from './sisproMuvService.js'

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

function servicioCon(request, extra = {}) {
  return new SisproMuvService({ ...credenciales(extra), request })
}

test('el timeout del MUV sale de MINSALUD_TIMEOUT_MS y se recorta', () => {
  assert.equal(resolveSisproTimeoutMs({}), 45_000)
  assert.equal(resolveSisproTimeoutMs({ MINSALUD_TIMEOUT_MS: '12000' }), 12_000)
  assert.equal(resolveSisproTimeoutMs({ MINSALUD_TIMEOUT_MS: '50' }), 1_000)
  assert.equal(resolveSisproTimeoutMs({ MINSALUD_TIMEOUT_MS: '999999' }), 180_000)
  assert.equal(resolveSisproTimeoutMs({ MINSALUD_TIMEOUT_MS: 'no-numero' }), 45_000)
})

test('sin credenciales el cliente queda reintentable y no fabrica un CUV', () => {
  assert.throws(
    () => new SisproMuvService({ env: {} }),
    (error) =>
      error instanceof MuvInfrastructureError &&
      error.code === 'MUV_CREDENTIALS_MISSING' &&
      error.retryable === true &&
      error.status === 503,
  )
})

test('el canal FEV depende del CUFE o del XML', () => {
  assert.equal(canalDeEnvio({ rips: { usuarios: [] } }), 'sin_factura')
  assert.equal(canalDeEnvio({ rips: { usuarios: [] }, cufe: '  ' }), 'sin_factura')
  assert.equal(canalDeEnvio({ rips: { cufe: 'DIAN-1', usuarios: [] } }), 'fev')
  assert.equal(canalDeEnvio({ xmlFevFile: '<Factura/>', rips: { usuarios: [] } }), 'fev')
})

test('el RIPS que viaja al ministerio no lleva CUFE, CUV ni clave', () => {
  const limpio = ripsParaMinisterio({
    numFactura: null,
    usuarios: [],
    cufe: 'DIAN-1',
    evolutionId: 'evo-1',
    xmlFevFile: '<Factura/>',
    clave: 'secreta',
    token: 'jwt',
  })
  assert.deepEqual(limpio, { numFactura: null, usuarios: [] })
  assert.equal(codificarXmlFev('<Factura/>'), Buffer.from('<Factura/>', 'utf8').toString('base64'))
  assert.equal(codificarXmlFev('YQ=='), 'YQ==')
})

test('sin CUFE consume CargarRipsSinFactura y devuelve el CUV', async () => {
  const calls = []
  const service = servicioCon(async (url, options) => {
    calls.push({ url: String(url), body: options.body, authorization: options.headers.Authorization })
    if (String(url).includes('LoginSISPRO')) {
      return { response: { status: 200, ok: true }, data: { login: true, token: jwtExpiringIn(60 * 60 * 1000) } }
    }
    return {
      response: { status: 200, ok: true },
      data: { ResultState: true, CodigoUnicoValidacion: CUV, ResultadosValidacion: [{ Clase: 'NOTIFICACION', Codigo: 'RVG01', Descripcion: 'aviso' }] },
    }
  })

  const result = await service.enviar({
    evolutionId: 'evo-1',
    rips: { numFactura: null, usuarios: [{ tipoDocumentoIdentificacion: 'CC' }], cufe: '', clave: 'no-sale' },
  })

  assert.equal(result.success, true)
  assert.equal(result.cuv, CUV)
  assert.equal(result.canal, 'sin_factura')
  assert.equal(result.errors.length, 0)
  const carga = calls.find((call) => call.url.includes('CargarRipsSinFactura'))
  assert.ok(carga)
  assert.equal(carga.body.xmlFevFile, '')
  assert.deepEqual(carga.body.rips, { numFactura: null, usuarios: [{ tipoDocumentoIdentificacion: 'CC' }] })
  assert.equal(JSON.stringify(carga.body).includes('clave-prueba'), false)
  assert.match(carga.authorization, /^Bearer .+/)
  assert.equal(calls.some((call) => call.url.includes('CargarFevRips')), false)
})

test('con CUFE consume CargarFevRips y codifica el XML', async () => {
  const calls = []
  const service = servicioCon(async (url, options) => {
    calls.push({ url: String(url), body: options.body })
    if (String(url).includes('LoginSISPRO')) {
      return { response: { status: 201, ok: true }, data: { login: true, token: jwtExpiringIn(60 * 60 * 1000) } }
    }
    return { response: { status: 201, ok: true }, data: { ResultState: true, cuv: CUV } }
  })

  const result = await service.enviar({
    cufe: 'CUFE-DIAN',
    xmlFevFile: '<Factura/>',
    rips: { numFactura: 'FV-1', usuarios: [] },
  })

  assert.equal(result.success, true)
  assert.equal(result.canal, 'fev')
  const carga = calls.find((call) => call.url.includes('CargarFevRips'))
  assert.ok(carga)
  assert.equal(carga.body.rips.numFactura, 'FV-1')
  assert.equal(carga.body.rips.cufe, undefined)
  assert.equal(carga.body.xmlFevFile, Buffer.from('<Factura/>', 'utf8').toString('base64'))
})

test('un rechazo estructural devuelve la lista de errores y no lanza', async () => {
  const service = servicioCon(async (url) => {
    if (String(url).includes('LoginSISPRO')) {
      return { response: { status: 200, ok: true }, data: { login: true, token: jwtExpiringIn(60 * 60 * 1000) } }
    }
    return {
      response: { status: 400, ok: false },
      data: {
        ResultState: false,
        ResultadosValidacion: [
          { Clase: 'NOTIFICACION', Codigo: 'RVG01', Descripcion: 'aviso' },
          { Clase: 'RECHAZADO', Codigo: 'RVC012', Descripcion: 'CIE-10 inválido', PathFuente: 'usuarios[0].servicios' },
        ],
      },
    }
  })

  const result = await service.enviar({ rips: { usuarios: [] } })
  assert.equal(result.success, false)
  assert.equal(result.cuv, null)
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].code, 'RVC012')
  assert.equal(result.errors[0].path, 'usuarios[0].servicios')
  assert.match(result.errors[0].message, /CIE-10/)
})

test('HTTP 200 con ResultState false es validación, no infraestructura', () => {
  const parsed = interpretarRespuestaSispro(200, {
    ResultState: false,
    CodigoUnicoValidacion: '-',
    errors: { numDocumentoIdObligado: ['obligatorio'] },
  })
  assert.equal(parsed.success, false)
  assert.equal(parsed.errors[0].path, 'numDocumentoIdObligado')
})

test('401, 500 y 408 se pueden reintentar', () => {
  assert.throws(() => interpretarRespuestaSispro(401, { message: 'no' }), (error) => error.code === 'MUV_AUTH' && error.status === 503)
  assert.throws(() => interpretarRespuestaSispro(500, {}), (error) => error.code === 'MUV_INFRASTRUCTURE' && error.retryable === true)
  assert.throws(() => interpretarRespuestaSispro(408, {}), (error) => error.code === 'MUV_TIMEOUT' && error.status === 504)
})

test('un 401 invalida el token para el siguiente envío', async () => {
  let logins = 0
  let cargas = 0
  const service = servicioCon(async (url) => {
    if (String(url).includes('LoginSISPRO')) {
      logins += 1
      return { response: { status: 200, ok: true }, data: { login: true, token: jwtExpiringIn(60 * 60 * 1000) } }
    }
    cargas += 1
    return { response: { status: 401, ok: false }, data: { message: 'token vencido' } }
  })

  await assert.rejects(() => service.enviar({ rips: { usuarios: [] } }), (error) => error.code === 'MUV_AUTH')
  await assert.rejects(() => service.enviar({ rips: { usuarios: [] } }), (error) => error.code === 'MUV_AUTH')
  assert.equal(logins, 2)
  assert.equal(cargas, 2)
})

test('un servidor que no responde lanza MUV_TIMEOUT', { timeout: 5_000 }, async () => {
  const sockets = new Set()
  const server = http.createServer((req, res) => {
    if (req.url.includes('LoginSISPRO')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ login: true, token: jwtExpiringIn(60 * 60 * 1000) }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    const service = new SisproMuvService({
      ...credenciales({ baseUrl: `http://127.0.0.1:${port}/fevrips-api`, timeoutMs: 80 }),
    })
    await assert.rejects(() => service.enviar({ rips: { numFactura: null, usuarios: [] } }), (error) => {
      assert.equal(error instanceof MuvInfrastructureError, true)
      assert.equal(error.code, 'MUV_TIMEOUT')
      assert.equal(error.retryable, true)
      assert.equal(error.status, 504)
      return true
    })
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise((resolve) => server.close(resolve))
  }
})

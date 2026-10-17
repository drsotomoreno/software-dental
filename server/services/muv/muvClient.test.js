import assert from 'node:assert/strict'
import { gunzipSync } from 'node:zlib'
import test from 'node:test'
import { redactMuvValue } from './auditLog.js'
import { createMuvClient } from './client.js'
import { encodeCargarFevRipsRequest } from './request.js'
import { parseMuvResponse } from './response.js'

const CUV = 'a'.repeat(96)
const XML = '<AttachedDocument>fev</AttachedDocument>'

function rips() {
  return {
    numDocumentoIdObligado: '900123456',
    numFactura: 'FV100',
    usuarios: [{ servicios: { consultas: [{}], procedimientos: [] } }],
  }
}

test('CargarFevRips comprime el JSON y deja el XML en Base64', () => {
  const encoded = encodeCargarFevRipsRequest({
    rips: rips(),
    xmlFevFile: Buffer.from(XML).toString('base64'),
  })
  assert.equal(encoded.headers['Content-Encoding'], 'gzip')
  assert.equal(encoded.body[0], 0x1f)
  assert.equal(encoded.body[1], 0x8b)
  const decoded = JSON.parse(gunzipSync(encoded.body).toString('utf8'))
  assert.equal(decoded.rips.numFactura, 'FV100')
  assert.equal(Buffer.from(decoded.xmlFevFile, 'base64').toString('utf8'), XML)
})

test('un ResultState true con notificación devuelve el CUV', () => {
  const parsed = parseMuvResponse({
    ResultState: true,
    ProcesoId: 15,
    NumFactura: 'FV100',
    CodigoUnicoValidacion: CUV,
    FechaRadicacion: '2026-10-07T12:00:00Z',
    Ambiente: 'DockerTest',
    Modulo: 'FacturaElectronica',
    ResultadosValidacion: [{
      Clase: 'NOTIFICACION',
      Codigo: 'RVC059',
      Descripcion: 'El código de CUPS puede ser validado con el grupo de servicio.',
      Observaciones: 'Verificar finalidad',
      PathFuente: 'usuarios[0].servicios.consultas[0].codConsulta',
      Fuente: 'Rips',
    }],
  }, 200)

  assert.equal(parsed.success, true)
  assert.equal(parsed.cuv, CUV)
  assert.equal(parsed.notificaciones[0].codigo, 'RVC059')
  assert.equal(parsed.rechazos.length, 0)
})

test('los rechazos quedan con el código de la regla', () => {
  const parsed = parseMuvResponse({
    ResultState: false,
    CodigoUnicoValidacion: 'No aplica a paquetes procesados en estado [RECHAZADO]',
    ResultadosValidacion: [
      {
        Clase: 'RECHAZADO',
        Codigo: 'RVC023',
        Descripcion: 'El procedimiento de parto debe informar datos del recién nacido.',
        Observaciones: 'Excepto mortinato',
        PathFuente: 'usuarios[0].servicios.procedimientos[0].codProcedimiento',
        Fuente: 'Rips',
      },
      {
        Clase: 'RECHAZADO',
        Codigo: 'RVC053',
        Descripcion: 'Hay servicios posteriores a la defunción.',
        Observaciones: '',
        PathFuente: 'usuarios[0].servicios.urgencias[0].fechaEgreso',
        Fuente: 'Rips',
      },
    ],
  }, 200)

  assert.equal(parsed.success, false)
  assert.equal(parsed.cuv, null)
  assert.deepEqual(parsed.ministryErrors.map((item) => item.code), ['RVC023', 'RVC053'])
  assert.match(parsed.ministryErrors[0].field, /codProcedimiento/)
})

test('el cliente envía el Bearer de la Fase 1 y registra la respuesta sin el XML', async () => {
  const lines = []
  let seenAuth = ''
  let calls = 0
  const client = createMuvClient({
    baseUrl: 'https://fevrips.sispro.gov.co',
    path: '/api/PaquetesFevRips/CargarFevRips',
    gzip: true,
    getAccessToken: async () => 'token-fase-1',
    clearAccessToken: () => {},
    logger: { record: (event) => lines.push(JSON.stringify(event)) },
    fetchImpl: async (_url, init) => {
      calls += 1
      seenAuth = init.headers.Authorization
      const decoded = JSON.parse(gunzipSync(init.body).toString('utf8'))
      assert.equal(decoded.rips.numFactura, 'FV100')
      return {
        status: 200,
        text: async () => JSON.stringify({
          ResultState: true,
          ProcesoId: 9,
          CodigoUnicoValidacion: CUV,
          ResultadosValidacion: [],
        }),
      }
    },
  })

  const result = await client.cargarFevRips({ rips: rips(), xmlFev: XML })
  assert.equal(calls, 1)
  assert.equal(seenAuth, 'Bearer token-fase-1')
  assert.equal(result.cuv, CUV)
  const journal = lines.join('\n')
  assert.equal(journal.includes('token-fase-1'), false)
  assert.equal(journal.includes(Buffer.from(XML).toString('base64')), false)
  assert.match(journal, /muv\.request/)
  assert.match(journal, /muv\.response/)
  assert.match(journal, new RegExp(CUV))
})

test('un 401 renueva el token y reintenta una vez', async () => {
  const tokens = ['vencido', 'nuevo']
  let calls = 0
  const client = createMuvClient({
    baseUrl: 'https://fevrips.sispro.gov.co',
    getAccessToken: async () => tokens[Math.min(calls, tokens.length - 1)],
    clearAccessToken: () => {},
    logger: { record: () => {} },
    fetchImpl: async (_url, init) => {
      calls += 1
      if (init.headers.Authorization.endsWith('vencido')) {
        return { status: 401, text: async () => JSON.stringify({ message: 'token vencido' }) }
      }
      return {
        status: 200,
        text: async () => JSON.stringify({
          ResultState: true,
          ProcesoId: 3,
          CodigoUnicoValidacion: CUV,
          ResultadosValidacion: [],
        }),
      }
    },
  })

  const result = await client.cargarFevRips({ rips: rips(), xmlFevFile: Buffer.from(XML).toString('base64') })
  assert.equal(calls, 2)
  assert.equal(result.success, true)
  assert.equal(result.cuv, CUV)
})

test('la bitácora no conserva el encabezado Authorization', () => {
  const redacted = redactMuvValue({
    Authorization: 'Bearer secreto',
    xmlFevFile: 'AAAA',
    numFactura: 'FV100',
  })
  assert.equal(JSON.stringify(redacted).includes('secreto'), false)
  assert.equal(JSON.stringify(redacted).includes('AAAA'), false)
  assert.equal(redacted.numFactura, 'FV100')
})

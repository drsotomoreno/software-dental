import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCompraDirecta } from './catalogs.js'
import { createFevcdClient } from './client.js'
import { encodeMultipart } from './multipart.js'
import { enviarCompraDirecta } from './service.js'
import { ambientePermitido, resolveFevcdSettings } from './settings.js'

const CUCON = 'ab'.repeat(32)
const XML = `<?xml version="1.0"?><Invoice><NUMERO_CONTRATO>${CUCON}</NUMERO_CONTRATO></Invoice>`

function baseInput(extra = {}) {
  return {
    xml: XML,
    tipoDocumento: 'FEV',
    tecnologia: 'medicamento',
    rolEmisor: 'fabricante',
    cucon: CUCON,
    lineas: [{ descripcion: 'Amoxicilina 500 mg', cantidad: 20, cum: '1A234' }],
    ...extra,
  }
}

test('medicamento exige CUM o IUM y la compra directa no acepta RIPS', () => {
  const sinCodigo = buildCompraDirecta(baseInput({ lineas: [{ descripcion: 'Ampolla', cantidad: 1 }] }))
  assert.equal(sinCodigo.issues.some((item) => item.codigo === 'MEDICAMENTO'), true)

  const conRips = buildCompraDirecta(baseInput({ rips: { usuarios: [] } }))
  assert.equal(conRips.issues.some((item) => item.codigo === 'SIN_RIPS'), true)

  const apme = buildCompraDirecta(baseInput({
    tecnologia: 'apme',
    rolEmisor: 'titular',
    lineas: [{ descripcion: 'Fórmula nutricional', cantidad: 4, registroSanitario: 'INVIMA2026' }],
  }))
  assert.equal(apme.issues.some((item) => item.level === 'error'), false)
  assert.equal(apme.document.tecnologia, 'APME')
  assert.equal(apme.document.sinRips, true)
})

test('el multipart lleva GUID, tipo, tecnología y el SHA-256 del XML', () => {
  const encoded = encodeMultipart({
    guid: '6f1c1c3a-6b4e-4a1a-9c2d-111111111111',
    tipoDocumento: 'FEV',
    tecnologia: 'DM',
    sha256: 'abc',
  }, { filename: 'factura.xml', bytes: Buffer.from(XML) })
  const text = encoded.body.toString('utf8')
  assert.match(encoded.contentType, /multipart\/form-data/)
  assert.match(text, /name="tecnologia"\r\n\r\nDM/)
  assert.match(text, /name="archivo"; filename="factura.xml"/)
  assert.equal(text.includes('usuarios'), false)
})

test('Stage es el ambiente por defecto y producción preliminar no se llama', () => {
  const settings = resolveFevcdSettings({})
  assert.equal(settings.ambiente, 'stage')
  assert.equal(settings.apiBaseUrl, 'https://stage-fevrips.sispropreprod.gov.co')
  assert.equal(ambientePermitido({ ambiente: 'produccion', preliminar: true }).ok, false)
  assert.equal(ambientePermitido({ ambiente: 'stage', preliminar: true }).ok, true)
})

test('un 503 del ambiente preliminar se reintenta y un 409 no se reenvía', async () => {
  let calls = 0
  const client = createFevcdClient({
    settings: {
      ...resolveFevcdSettings({}),
      sandbox: false,
      maxAttempts: 3,
      fragmentBytes: 5 * 1024 * 1024,
      retryBaseMs: 1,
      timeoutMs: 1000,
      enviarDetalle: true,
      apiBaseUrl: 'https://stage-fevrips.sispropreprod.gov.co',
      receptorPath: '/api/Receptor/Cargar',
      consultaPath: '/api/Consultas/Envios',
    },
    sleep: async () => {},
    random: () => 0,
    getAccessToken: async () => 'token-fase-1',
    logger: { record: () => {} },
    fetchImpl: async (_url, init) => {
      calls += 1
      assert.equal(init.headers.Authorization, 'Bearer token-fase-1')
      if (calls === 1) return { status: 503, text: async () => '{}' }
      return {
        status: 200,
        text: async () => JSON.stringify({
          CodigoUnicoValidacion: 'c'.repeat(96),
          ResultadosValidacion: [{ Clase: 'NOTIFICACION', Codigo: 'FED129', Descripcion: 'Aviso', PathFuente: '' }],
        }),
      }
    },
  })
  const built = buildCompraDirecta(baseInput())
  const result = await client.cargar({ ...built.document, guid: 'guid-1' })
  assert.equal(calls, 2)
  assert.equal(result.cuv, 'c'.repeat(96))
  assert.equal(result.notificaciones[0].codigo, 'FED129')

  let conflictCalls = 0
  const conflicted = createFevcdClient({
    settings: {
      ...resolveFevcdSettings({}),
      sandbox: false,
      maxAttempts: 3,
      fragmentBytes: 1024 * 1024,
      retryBaseMs: 1,
      timeoutMs: 1000,
      enviarDetalle: false,
      apiBaseUrl: 'https://stage-fevrips.sispropreprod.gov.co',
      receptorPath: '/api/Receptor/Cargar',
      consultaPath: '/api/Consultas/Envios',
    },
    sleep: async () => {},
    getAccessToken: async () => 'token-fase-1',
    logger: { record: () => {} },
    fetchImpl: async () => {
      conflictCalls += 1
      return { status: 409, text: async () => JSON.stringify({ guid: 'guid-1', sha256: 'abc' }) }
    },
  })
  const duplicate = await conflicted.cargar({ ...built.document, guid: 'guid-1' })
  assert.equal(conflictCalls, 1)
  assert.equal(duplicate.duplicado, true)
  assert.equal(duplicate.success, true)
})

test('si la red falla, consulta el mismo GUID antes de dar el cargue por perdido', async () => {
  const urls = []
  const client = createFevcdClient({
    settings: {
      ...resolveFevcdSettings({}),
      sandbox: false,
      maxAttempts: 1,
      fragmentBytes: 1024 * 1024,
      retryBaseMs: 1,
      timeoutMs: 1000,
      enviarDetalle: false,
      apiBaseUrl: 'https://dev-fevrips.sispropreprod.gov.co',
      receptorPath: '/api/Receptor/Cargar',
      consultaPath: '/api/Consultas/Envios',
    },
    sleep: async () => {},
    getAccessToken: async () => 'token-fase-1',
    logger: { record: () => {} },
    fetchImpl: async (url) => {
      urls.push(url)
      if (url.endsWith('/api/Receptor/Cargar')) throw new Error('socket hang up')
      return {
        status: 200,
        text: async () => JSON.stringify({ CodigoUnicoValidacion: 'd'.repeat(64), guid: 'guid-2' }),
      }
    },
  })
  const built = buildCompraDirecta(baseInput({ tecnologia: 'dispositivo', lineas: [{ descripcion: 'Guante', cantidad: 10, registroSanitario: 'RS123' }] }))
  const result = await client.cargar({ ...built.document, guid: 'guid-2' })
  assert.equal(result.recuperado, true)
  assert.equal(result.cuv, 'd'.repeat(64))
  assert.equal(urls.some((url) => url.includes('/api/Consultas/Envios')), true)
})

test('el servicio en sandbox no llama a producción preliminar', async () => {
  const blocked = await enviarCompraDirecta(baseInput(), {
    settings: {
      ...resolveFevcdSettings({}),
      sandbox: false,
      ambiente: 'produccion',
      preliminar: true,
    },
  })
  assert.equal(blocked.success, false)
  assert.equal(blocked.rechazos[0].codigo, 'FEVCD_PRELIMINAR')

  const sandbox = await enviarCompraDirecta(baseInput(), {
    settings: { ...resolveFevcdSettings({}), sandbox: true, ambiente: 'stage', preliminar: true },
  })
  assert.equal(sandbox.success, true)
  assert.equal(sandbox.sinRips, true)
  assert.equal(sandbox.tecnologia, 'MED')
  assert.equal(sandbox.cuv.length, 96)
})

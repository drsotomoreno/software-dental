import assert from 'node:assert/strict'
import test from 'node:test'
import { MuvInfrastructureError } from '../services/sisproMuvService.js'
import { createRipsBatchTracker } from '../services/ripsBatchTracker.js'
import { getBatchRips, sendBatchRips, sendSingleRips } from './ripsTransmission.controller.js'
import router from '../routes/rips.routes.js'

function respuesta() {
  return {
    statusCode: null,
    body: null,
    headersSent: false,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      this.headersSent = true
      return this
    },
  }
}

const sesion = async () => ({ user: { id: 'user-1', email: 'ana@clinica.test', nombre: 'Ana', nit: '79904620' } })

test('send-single sin sesión responde 401', async () => {
  const res = respuesta()
  await sendSingleRips(
    { headers: {}, body: { usuarios: [] } },
    res,
    { resolveSession: async () => null },
  )
  assert.equal(res.statusCode, 401)
})

test('send-single con CUFE radica y devuelve el CUV', async () => {
  const res = respuesta()
  let recibido = null
  await sendSingleRips(
    {
      headers: { authorization: 'Bearer sesion-app' },
      body: { rips: { numFactura: 'FV-9', usuarios: [] }, cufe: 'CUFE-9', evolutionId: 'evo-9' },
    },
    res,
    {
      resolveSession: sesion,
      transmitir: async (envelope, context) => {
        recibido = { envelope, context }
        return { success: true, cuv: 'CUV-9', logId: 'log-9', auditStored: true, canal: 'fev' }
      },
    },
  )
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.cuv, 'CUV-9')
  assert.equal(res.body.logId, 'log-9')
  assert.equal(recibido.envelope.cufe, 'CUFE-9')
  assert.equal(recibido.envelope.rips.numFactura, 'FV-9')
  assert.equal(recibido.context.user.email, 'ana@clinica.test')
  assert.equal(recibido.context.modo, 'single')
})

test('send-single traduce el rechazo del MUV a 422 y el timeout a 504', async () => {
  const validacion = respuesta()
  await sendSingleRips(
    { headers: { authorization: 'Bearer sesion-app' }, body: { usuarios: [], numFactura: null } },
    validacion,
    {
      resolveSession: sesion,
      transmitir: async () => ({
        success: false,
        errors: [{ code: 'RVC012', message: 'CIE-10 inválido', path: 'usuarios[0]' }],
        logId: 'log-2',
        canal: 'sin_factura',
      }),
    },
  )
  assert.equal(validacion.statusCode, 422)
  assert.equal(validacion.body.errors[0].code, 'RVC012')

  const caido = respuesta()
  await sendSingleRips(
    { headers: { authorization: 'Bearer sesion-app' }, body: { usuarios: [] } },
    caido,
    {
      resolveSession: sesion,
      transmitir: async () => {
        const error = new MuvInfrastructureError('Tiempo de espera agotado al contactar el MUV.', {
          code: 'MUV_TIMEOUT',
          status: 504,
        })
        error.logId = 'log-3'
        throw error
      },
    },
  )
  assert.equal(caido.statusCode, 504)
  assert.equal(caido.body.retryable, true)
  assert.equal(caido.body.code, 'MUV_TIMEOUT')
  assert.equal(caido.body.logId, 'log-3')
})

test('send-batch acepta el arreglo y procesa cada RIPS después de responder', async () => {
  const res = respuesta()
  const vistos = []
  let trabajo = null
  await sendBatchRips(
    {
      headers: { authorization: 'Bearer sesion-app' },
      body: [
        { usuarios: [], numFactura: null, evolutionId: 'evo-a' },
        { rips: { usuarios: [{ tipoDocumentoIdentificacion: 'CC' }] }, cufe: 'CUFE-B', evolutionId: 'evo-b' },
      ],
    },
    res,
    {
      resolveSession: sesion,
      encolar: (tarea) => {
        trabajo = tarea()
      },
      transmitir: async (sobre) => {
        vistos.push({ evolutionId: sobre.evolutionId, cufe: String(sobre.cufe ?? '').trim() })
        return { success: true, cuv: 'CUV' }
      },
    },
  )
  assert.equal(res.statusCode, 202)
  assert.equal(res.body.accepted, true)
  assert.equal(res.body.count, 2)
  assert.match(res.body.batchId, /^[0-9a-f-]{36}$/)
  await trabajo
  assert.deepEqual(vistos, [
    { evolutionId: 'evo-a', cufe: '' },
    { evolutionId: 'evo-b', cufe: 'CUFE-B' },
  ])
})

test('send-batch rechaza un lote vacío, un ítem inválido y más de 200', async () => {
  const casos = [
    [{}, 'array de RIPS'],
    [[], 'no trae RIPS'],
    [[{ nota: 'no es rips' }], 'no es un RIPS'],
    [Array.from({ length: 201 }, () => ({ usuarios: [] })), '200'],
  ]
  for (const [body, fragmento] of casos) {
    const res = respuesta()
    await sendBatchRips({ headers: { authorization: 'Bearer sesion-app' }, body }, res, { resolveSession: sesion })
    assert.equal(res.statusCode, 400)
    assert.match(res.body.error, new RegExp(fragmento))
  }
})

test('el lote aceptado se puede consultar con el CUV y el rechazo de cada atención', async () => {
  const res = respuesta()
  const tracker = createRipsBatchTracker()
  let trabajo = null
  await sendBatchRips(
    {
      headers: { authorization: 'Bearer sesion-app' },
      body: [
        { usuarios: [], numFactura: null, evolutionId: 'evo-ok', patientId: 'pac-1' },
        { usuarios: [], numFactura: null, evolutionId: 'evo-mal', patientId: 'pac-2' },
      ],
    },
    res,
    {
      resolveSession: sesion,
      tracker,
      encolar: (tarea) => {
        trabajo = tarea()
      },
      transmitir: async (sobre) => {
        if (sobre.evolutionId === 'evo-mal') {
          return { success: false, cuv: null, errors: [{ code: 'RVC012', message: 'CIE-10 inválido', path: 'usuarios[0]' }] }
        }
        return { success: true, cuv: 'CUV-OK', errors: [] }
      },
    },
  )
  await trabajo
  const consulta = respuesta()
  await getBatchRips({ headers: { authorization: 'Bearer sesion-app' }, params: { batchId: res.body.batchId } }, consulta, {
    resolveSession: sesion,
    tracker,
  })
  assert.equal(consulta.statusCode, 200)
  assert.equal(consulta.body.status, 'done')
  assert.equal(consulta.body.items.find((item) => item.evolutionId === 'evo-ok').cuv, 'CUV-OK')
  assert.equal(consulta.body.items.find((item) => item.evolutionId === 'evo-mal').errors[0].code, 'RVC012')

  const ajeno = respuesta()
  await getBatchRips(
    { headers: { authorization: 'Bearer otra' }, params: { batchId: res.body.batchId } },
    ajeno,
    { resolveSession: async () => ({ user: { id: 'user-2' } }), tracker },
  )
  assert.equal(ajeno.statusCode, 404)
})

test('las rutas de radicación quedan montadas en /api/rips', () => {
  const rutas = router.stack.filter((layer) => layer.route).map((layer) => `${Object.keys(layer.route.methods)[0]} ${layer.route.path}`)
  assert.ok(rutas.includes('post /send-single'))
  assert.ok(rutas.includes('post /send-batch'))
  assert.ok(rutas.includes('get /send-batch/:batchId'))
})

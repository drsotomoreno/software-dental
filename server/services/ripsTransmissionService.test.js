import assert from 'node:assert/strict'
import test from 'node:test'
import { MuvInfrastructureError } from './sisproMuvService.js'
import { payloadParaAuditoria, transmitirLote, transmitirRips } from './ripsTransmissionService.js'

const CUV = 'cd'.repeat(48)

function depsDe(service, extra = {}) {
  const logs = []
  const estados = []
  return {
    logs,
    estados,
    deps: {
      service,
      registrar: async (entry) => {
        logs.push(entry)
        return { id: 'log-1' }
      },
      actualizarAtencion: async (evolutionId, patch) => {
        estados.push({ evolutionId, patch })
        return { updated: true }
      },
      ...extra,
    },
  }
}

test('el XML largo no entra completo a la auditoría', () => {
  const xml = `<Factura>${'x'.repeat(40_000)}</Factura>`
  const payload = payloadParaAuditoria({ rips: { usuarios: [] }, xmlFevFile: xml, cufe: 'CUFE-1' })
  assert.equal(payload.cufe, 'CUFE-1')
  assert.equal(payload.xmlFevFile.omitted, true)
  assert.equal(payload.xmlFevFile.bytes, Buffer.byteLength(xml))
})

test('un CUV actualiza la atención y queda en el log', async () => {
  const { deps, logs, estados } = depsDe({
    async enviar() {
      return {
        success: true,
        cuv: CUV,
        errors: [],
        httpStatus: 200,
        canal: 'fev',
        durationMs: 40,
        response: { ResultState: true, CodigoUnicoValidacion: CUV, token: 'no-guardar' },
      }
    },
  })

  const result = await transmitirRips(
    { rips: { numFactura: 'FV-1', usuarios: [] }, cufe: 'CUFE-1', evolutionId: 'evo-1', patientId: 'pac-1' },
    { user: { id: 'user-1', email: 'ana@clinica.test', nombre: 'Ana', nit: '79904620' }, modo: 'single' },
    deps,
  )

  assert.equal(result.success, true)
  assert.equal(result.cuv, CUV)
  assert.equal(result.auditStored, true)
  assert.equal(result.atencionUpdated, true)
  assert.equal(logs[0].usuarioPrestador.email, 'ana@clinica.test')
  assert.equal(logs[0].nitPrestador, '79904620')
  assert.equal(logs[0].canal, 'fev')
  assert.equal(logs[0].responseMuv.token, undefined)
  assert.equal(logs[0].requestPayload.cufe, 'CUFE-1')
  assert.deepEqual(estados[0], { evolutionId: 'evo-1', patch: { estado: 'enviado_ok', cuv: CUV, errorLog: null } })
})

test('la validación marca error en la atención y no lanza', async () => {
  const { deps, estados } = depsDe({
    async enviar() {
      return {
        success: false,
        cuv: null,
        errors: [{ code: 'RVC012', message: 'CIE-10 inválido', path: 'usuarios[0]' }],
        httpStatus: 400,
        canal: 'sin_factura',
        durationMs: 15,
        response: { ResultState: false },
      }
    },
  })

  const result = await transmitirRips(
    { rips: { usuarios: [] }, evolutionId: 'evo-2' },
    { user: { id: 'user-1' }, modo: 'single' },
    deps,
  )
  assert.equal(result.success, false)
  assert.equal(result.errors[0].code, 'RVC012')
  assert.equal(estados[0].patch.estado, 'error')
  assert.match(estados[0].patch.errorLog, /RVC012/)
  assert.equal(estados[0].patch.cuv, null)
})

test('un timeout se audita, se relanza y no cambia rips_estado', async () => {
  const { deps, logs, estados } = depsDe({
    async enviar() {
      const error = new MuvInfrastructureError('Tiempo de espera agotado al contactar el MUV.', {
        code: 'MUV_TIMEOUT',
        status: 504,
        httpStatus: 408,
      })
      error.durationMs = 80
      error.canal = 'sin_factura'
      throw error
    },
  })

  await assert.rejects(
    () => transmitirRips({ rips: { usuarios: [] }, evolutionId: 'evo-3' }, { user: { id: 'user-1' } }, deps),
    (error) => error.code === 'MUV_TIMEOUT' && error.logId === 'log-1' && error.retryable === true,
  )
  assert.equal(estados.length, 0)
  assert.equal(logs[0].success, false)
  assert.equal(logs[0].errors[0].code, 'MUV_TIMEOUT')
  assert.equal(logs[0].cuv, null)
})

test('si la auditoría falla después del CUV, el CUV se conserva', async () => {
  const estados = []
  const result = await transmitirRips(
    { rips: { usuarios: [] }, evolutionId: 'evo-4' },
    { user: { id: 'user-1' }, modo: 'single' },
    {
      service: {
        async enviar() {
          return { success: true, cuv: CUV, errors: [], httpStatus: 200, canal: 'sin_factura', durationMs: 5, response: {} }
        },
      },
      registrar: async () => {
        throw new Error('RDS no disponible')
      },
      actualizarAtencion: async (evolutionId, patch) => {
        estados.push({ evolutionId, patch })
        return { updated: true }
      },
    },
  )
  assert.equal(result.success, true)
  assert.equal(result.cuv, CUV)
  assert.equal(result.auditStored, false)
  assert.equal(result.logId, null)
  assert.equal(estados[0].patch.estado, 'enviado_ok')
})

function ripsNicolas() {
  return {
    numDocumentoIdObligado: '900123456',
    numFactura: null,
    tipoNota: null,
    numNota: null,
    usuarios: [
      {
        tipoDocumentoIdentificacion: 'TI',
        numDocumentoIdentificacion: '1097106893',
        tipoUsuario: '04',
        fechaNacimiento: '2012-04-18',
        codSexo: 'M',
        codPaisResidencia: '170',
        codMunicipioResidencia: '68001',
        codZonaTerritorialResidencia: '02',
        incapacidad: 'NO',
        consecutivo: 1,
        codPaisOrigen: '170',
        servicios: {
          consultas: [],
          procedimientos: [
            {
              codPrestador: '680010389801',
              fechaInicioAtencion: '2026-10-24 11:06',
              codProcedimiento: '391402',
              viaIngresoServicioSalud: '01',
              modalidadGrupoServicioTecSal: '01',
              grupoServicios: '04',
              codServicio: 344,
              finalidadTecnologiaSalud: '44',
              tipoDocumentoIdentificacion: 'CC',
              numDocumentoIdentificacion: '1234567890',
              codDiagnosticoPrincipal: 'K074',
              vrServicio: 0,
              conceptoRecaudo: '05',
              valorPagoModerador: 0,
              numFEVPagoModerador: null,
              consecutivo: 1,
            },
          ],
          otrosServicios: [],
        },
      },
    ],
  }
}

test('en sandbox Exportar no contacta el MUV y devuelve un CUV de prueba', async () => {
  const estados = []
  const result = await transmitirRips(
    { rips: ripsNicolas(), evolutionId: 'nota-nicolas', patientId: '1097106893' },
    { user: { id: 'user-1', nit: '900123456' }, modo: 'single' },
    {
      registrar: async () => ({ id: 'log-sandbox' }),
      actualizarAtencion: async (evolutionId, patch) => {
        estados.push({ evolutionId, patch })
        return { updated: true }
      },
    },
  )
  assert.equal(result.success, true)
  assert.equal(result.source, 'sandbox')
  assert.match(String(result.cuv), /^CUV-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$/)
  assert.equal(estados[0].patch.estado, 'enviado_ok')
  assert.equal(estados[0].patch.cuv, result.cuv)
})

test('el lote sigue con el siguiente RIPS cuando uno falla', async () => {
  const vistos = []
  const resumen = await transmitirLote(
    [
      { rips: { usuarios: [] }, evolutionId: 'a' },
      { rips: { usuarios: [] }, evolutionId: 'b' },
    ],
    { user: { id: 'user-1' }, batchId: 'batch-1' },
    {
      transmitir: async (sobre) => {
        vistos.push(sobre.evolutionId)
        if (sobre.evolutionId === 'a') {
          throw new MuvInfrastructureError('red', { code: 'MUV_NETWORK', status: 503 })
        }
        return { success: false, errors: [{ code: 'RVC012', message: 'rechazo' }] }
      },
    },
  )
  assert.deepEqual(vistos, ['a', 'b'])
  assert.deepEqual(resumen, { ok: 0, failed: 2 })
})

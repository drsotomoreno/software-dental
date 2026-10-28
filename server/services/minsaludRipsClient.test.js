import assert from 'node:assert/strict'
import test from 'node:test'
import { MuvInfrastructureError } from './sisproMuvService.js'
import { submitRipsToMinsalud } from './minsaludRipsClient.js'

const CUV = 'cd'.repeat(48)

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

const produccion = { sandbox: false, hasCredentials: true }

test('validar en producción radica por SISPRO y devuelve el CUV', async () => {
  let canal = null
  const result = await submitRipsToMinsalud(
    { rips: ripsNicolas(), metadatos: { esRipsTemporal: true, allowNullNumFactura: true } },
    {
      ...produccion,
      service: {
        async enviar(envelope) {
          canal = envelope.cufe ? 'fev' : 'sin_factura'
          return { success: true, cuv: CUV, errors: [], httpStatus: 200, response: { ProcesoId: 'PROC-1' } }
        },
      },
    },
  )
  assert.equal(result.success, true)
  assert.equal(result.source, 'minsalud')
  assert.equal(result.cuv, CUV)
  assert.equal(result.procesoId, 'PROC-1')
  assert.equal(canal, 'sin_factura')
})

test('un fetch failed de validar no sale crudo ni fabrica un CUV', async () => {
  const result = await submitRipsToMinsalud(
    { rips: ripsNicolas(), metadatos: { allowNullNumFactura: true, esRipsTemporal: true } },
    {
      ...produccion,
      service: {
        async enviar() {
          const error = new TypeError('fetch failed')
          error.cause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
          throw error
        },
      },
    },
  )
  assert.equal(result.success, false)
  assert.equal(result.cuv, undefined)
  assert.equal(result.code, 'MUV_NETWORK')
  assert.equal(result.message, undefined)
  assert.equal(result.error, 'No se pudo contactar el MUV (ECONNREFUSED).')
  assert.equal(result.error.includes('fetch failed'), false)
  assert.deepEqual(result.ministryErrors, [])
})

test('la sesión rechazada no se presenta como rechazo del paquete', async () => {
  const result = await submitRipsToMinsalud(
    { rips: ripsNicolas(), metadatos: { allowNullNumFactura: true, esRipsTemporal: true } },
    {
      ...produccion,
      service: {
        async enviar() {
          throw new MuvInfrastructureError('Autenticación LoginSISPRO rechazada.', {
            code: 'MUV_AUTH',
            status: 503,
            errors: [{ code: 'MUV_AUTH', message: 'Clave inválida.', path: '', clase: 'AUTH' }],
          })
        },
      },
    },
  )
  assert.equal(result.success, false)
  assert.equal(result.code, 'MUV_AUTH')
  assert.match(result.error, /LoginSISPRO/)
  assert.match(result.error, /Clave inválida/)
  assert.deepEqual(result.ministryErrors, [])
})

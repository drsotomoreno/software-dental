import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clasificarRutaFiscal,
  enrutarPorPerfilFiscal,
  radicarRipsSinFev,
} from './billingAndRipsService.js'

function ripsDeRecibo() {
  return {
    numDocumentoIdObligado: '900123456',
    numFactura: null,
    tipoNota: null,
    numNota: null,
    usuarios: [
      {
        tipoDocumentoIdentificacion: 'CC',
        numDocumentoIdentificacion: '52987654',
        fechaNacimiento: '1992-03-14',
        codSexo: 'F',
        codMunicipioResidencia: '68001',
        servicios: {
          procedimientos: [
            {
              codPrestador: '680010389801',
              fechaInicioAtencion: '2024-10-23 09:30',
              codProcedimiento: '232102',
              codDiagnosticoPrincipal: 'K021',
              tipoDocumentoIdentificacion: 'CC',
              numDocumentoIdentificacion: '1234567890',
            },
          ],
        },
      },
    ],
  }
}

const obligado = { id: 'prof-1', perfilFiscal: 'Obligado_FEV' }

test('el recibo de caja interno de un obligado no usa la ruta FEV', () => {
  assert.equal(
    clasificarRutaFiscal({
      perfilFiscal: 'Obligado_FEV',
      rips: { numFactura: null },
      metadatos: { tipoVinculacionFinanciera: 'recibo_interno', canal: 'sin_factura' },
    }),
    'muv_sin_factura',
  )
  assert.equal(
    clasificarRutaFiscal({
      perfilFiscal: 'Obligado_FEV',
      rips: { numFactura: 'FV00000002' },
      metadatos: { tipoVinculacionFinanciera: 'recibo_interno' },
    }),
    'muv_sin_factura',
  )
  assert.equal(
    clasificarRutaFiscal({
      perfilFiscal: 'Obligado_FEV',
      rips: { numFactura: null },
      metadatos: { tipoVinculacionFinanciera: 'valor_cero' },
    }),
    'muv_sin_factura',
  )
})

test('un paquete sin número y sin factura tampoco exige FEV', () => {
  assert.equal(
    clasificarRutaFiscal({
      perfilFiscal: 'Obligado_FEV',
      rips: { numFactura: null },
      user: obligado,
    }),
    'muv_sin_factura',
  )
})

test('la factura electrónica de un obligado sigue en la ruta FEV', () => {
  assert.equal(
    clasificarRutaFiscal({
      perfilFiscal: 'Obligado_FEV',
      rips: { numFactura: 'FV0001' },
      metadatos: { tipoVinculacionFinanciera: 'fev', canal: 'fev' },
    }),
    'generarFEV_y_RIPS',
  )
  assert.equal(
    clasificarRutaFiscal({
      perfilFiscal: 'Obligado_FEV',
      rips: { numFactura: null },
      invoice: { payableAmount: 200000 },
      metadatos: { canal: 'fev' },
    }),
    'generarFEV_y_RIPS',
  )
})

test('el no obligado sigue en RIPS pendiente', () => {
  assert.equal(
    clasificarRutaFiscal({
      perfilFiscal: 'No_Obligado',
      rips: { numFactura: null },
      metadatos: { tipoVinculacionFinanciera: 'recibo_interno' },
    }),
    'guardarRIPS_Pendiente',
  )
})

test('radicar el recibo interno no responde que numFactura es obligatorio', async () => {
  let enviado = null
  const result = await radicarRipsSinFev(
    {
      rips: { ...ripsDeRecibo(), numFactura: 'FV00000002' },
      metadatos: { tipoVinculacionFinanciera: 'recibo_interno', canal: 'sin_factura' },
      user: obligado,
    },
    {
      submit: async ({ rips }) => {
        enviado = rips
        return { success: true, cuv: 'CUV-RECIBO', source: 'sandbox', localIssues: [], estado: 'APROBADO' }
      },
      saveCuvRecord: async (entry) => ({ id: 'cuv-1', ...entry }),
    },
  )

  assert.equal(result.ok, true)
  assert.equal(result.route, 'muv_sin_factura')
  assert.equal(result.numFactura, null)
  assert.equal(result.cuv, 'CUV-RECIBO')
  assert.equal(enviado.numFactura, null)
  assert.equal(
    (result.localIssues ?? []).some((issue) => issue.field === 'numFactura'),
    false,
  )
})

test('enrutar un recibo interno no devuelve el error FEV DIAN', async () => {
  const result = await enrutarPorPerfilFiscal(
    {
      perfilFiscal: 'Obligado_FEV',
      rips: ripsDeRecibo(),
      metadatos: { tipoVinculacionFinanciera: 'recibo_interno', canal: 'sin_factura' },
      user: obligado,
    },
    {
      submit: async () => ({
        success: true,
        cuv: 'CUV-SIN-FEV',
        source: 'sandbox',
        localIssues: [],
        estado: 'APROBADO',
      }),
      saveCuvRecord: async (entry) => ({ id: 'cuv-2', ...entry }),
    },
  )

  assert.equal(result.route, 'muv_sin_factura')
  assert.equal(result.ok, true)
  assert.equal(result.numFactura, null)
  const factura = (result.localIssues ?? []).find((issue) => issue.field === 'numFactura')
  assert.equal(factura, undefined)
})

test('un FEV sin número sigue exigiendo numFactura', async () => {
  const result = await enrutarPorPerfilFiscal({
    perfilFiscal: 'Obligado_FEV',
    rips: { ...ripsDeRecibo(), numFactura: null },
    metadatos: { tipoVinculacionFinanciera: 'fev', canal: 'fev' },
    user: obligado,
  })

  assert.equal(result.route, 'generarFEV_y_RIPS')
  assert.equal(result.ok, false)
  const factura = (result.localIssues ?? []).find((issue) => issue.field === 'numFactura')
  assert.ok(factura)
  assert.match(factura.message, /obligatorio \(FEV DIAN\)/)
})

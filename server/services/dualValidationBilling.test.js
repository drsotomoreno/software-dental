import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ejecutarFlujoDobleValidacion } from './dualValidationBilling.js'
import { injectCufeIntoRips } from '../../shared/dualValidation.js'
import { ESTADO_DIAN, ESTADO_MUV } from '../../shared/dualValidation.js'

function sampleInvoice(overrides = {}) {
  return {
    nitEmisor: '900111222',
    razonSocialEmisor: 'IPS Odontológica Demo',
    nitAdquiriente: '123456789',
    razonSocialAdquiriente: 'Paciente Demo',
    issueDate: '2026-09-12',
    payableAmount: 150000,
    numFactura: 'FV00001234',
    invoiceNumber: 'FV00001234',
    lines: [{ description: 'Consulta odontológica', quantity: 1, unitPrice: 150000, cupsCode: '890701' }],
    ...overrides,
  }
}

function sampleRips(overrides = {}) {
  return {
    numDocumentoIdObligado: '900111222',
    numFactura: 'FV00001234',
    tipoNota: null,
    numNota: null,
    vrTotalRips: 150000,
    vrTotalDian: 150000,
    procedimientos: [{ vrServicio: 150000, cups: '890701' }],
    ...overrides,
  }
}

function memoryStore() {
  const records = []
  return {
    records,
    async saveInvoiceTransaction(entry) {
      const next = { id: entry.id ?? 'tx-1', ...entry, updatedAt: new Date().toISOString() }
      const idx = records.findIndex((row) => row.id === next.id || row.numFactura === next.numFactura)
      if (idx >= 0) {
        records[idx] = { ...records[idx], ...next, id: records[idx].id }
        return records[idx]
      }
      records.push(next)
      return next
    },
    async getInvoiceTransaction({ id, numFactura } = {}) {
      return records.find((row) => row.id === id || (numFactura && row.numFactura === numFactura)) ?? null
    },
  }
}

describe('flujo de doble validación DIAN → CUFE → RIPS → MUV → CUV', () => {
  it('inyecta el CUFE en el JSON RIPS (Paso 3)', () => {
    const rips = injectCufeIntoRips(sampleRips(), 'ABC123CUFE')
    assert.equal(rips.cufe, 'ABC123CUFE')
    assert.equal(rips.numFactura, 'FV00001234')
  })

  it('rechaza ensamblar RIPS sin CUFE', () => {
    assert.throws(() => injectCufeIntoRips(sampleRips(), '  '), /CUFE es obligatorio/)
  })

  it('Paso 1-5 exitoso: guarda CUFE, luego CUV, y marca legalizada', async () => {
    const store = memoryStore()
    const muvCalls = []
    const result = await ejecutarFlujoDobleValidacion(
      { rips: sampleRips(), invoice: sampleInvoice(), metadatos: { patientUuid: 'p1' } },
      {
        submitInvoiceXmlToDian: async ({ xml }) => {
          assert.match(xml, /<Invoice/)
          assert.doesNotMatch(xml, /<salud:CodigoUnicoValidacion>/)
          return { success: true, cufe: 'CUFE-DIAN-OK-001', source: 'sandbox' }
        },
        submitRipsToMinsalud: async (payload) => {
          muvCalls.push(payload)
          return { success: true, cuv: 'CUV-MUV-OK-001', source: 'sandbox', procesoId: 'PROC-1' }
        },
        saveInvoiceTransaction: store.saveInvoiceTransaction,
        getInvoiceTransaction: store.getInvoiceTransaction,
        saveCuvRecord: async (entry) => ({ id: 'cuv-1', ...entry }),
      },
    )

    assert.equal(result.legalizada, true)
    assert.equal(result.estado_dian, ESTADO_DIAN.APROBADO)
    assert.equal(result.codigo_cufe, 'CUFE-DIAN-OK-001')
    assert.equal(result.estado_muv, ESTADO_MUV.APROBADO_CON_CUV)
    assert.equal(result.codigo_cuv, 'CUV-MUV-OK-001')
    assert.equal(result.detalles_rechazo_muv.length, 0)
    assert.equal(muvCalls.length, 1)
    assert.equal(muvCalls[0].rips.cufe, 'CUFE-DIAN-OK-001')
    assert.equal(muvCalls[0].requireCufe, true)
    assert.match(muvCalls[0].facturaXml, /CUFE-DIAN-OK-001/)
  })

  it('si la DIAN rechaza, no llama al MUV y no hay CUV', async () => {
    const store = memoryStore()
    let muvCalled = false
    const result = await ejecutarFlujoDobleValidacion(
      { rips: sampleRips(), invoice: sampleInvoice() },
      {
        submitInvoiceXmlToDian: async () => ({
          success: false,
          errors: [{ code: 'DIAN-X', message: 'Montos inválidos' }],
        }),
        submitRipsToMinsalud: async () => {
          muvCalled = true
          return { success: true, cuv: 'NO-DEBE' }
        },
        saveInvoiceTransaction: store.saveInvoiceTransaction,
        getInvoiceTransaction: store.getInvoiceTransaction,
        saveCuvRecord: async (entry) => entry,
      },
    )

    assert.equal(muvCalled, false)
    assert.equal(result.legalizada, false)
    assert.equal(result.failedStep, 'dian')
    assert.equal(result.estado_dian, ESTADO_DIAN.RECHAZADO)
    assert.equal(result.codigo_cufe, null)
    assert.equal(result.estado_muv, ESTADO_MUV.PENDIENTE_ENVIO)
    assert.equal(result.codigo_cuv, null)
  })

  it('si el MUV rechaza, conserva el CUFE y guarda glosas (sin CUV)', async () => {
    const store = memoryStore()
    const glosas = [{ code: 'MUV-GLOSA-CENTAVO', field: 'vrServicio', message: 'No cuadra al centavo.' }]
    const result = await ejecutarFlujoDobleValidacion(
      { rips: sampleRips({ vrTotalRips: 100 }), invoice: sampleInvoice() },
      {
        submitInvoiceXmlToDian: async () => ({ success: true, cufe: 'CUFE-KEEP' }),
        submitRipsToMinsalud: async () => ({ success: false, ministryErrors: glosas }),
        saveInvoiceTransaction: store.saveInvoiceTransaction,
        getInvoiceTransaction: store.getInvoiceTransaction,
        saveCuvRecord: async (entry) => entry,
      },
    )

    assert.equal(result.legalizada, false)
    assert.equal(result.failedStep, 'muv')
    assert.equal(result.estado_dian, ESTADO_DIAN.APROBADO)
    assert.equal(result.codigo_cufe, 'CUFE-KEEP')
    assert.equal(result.estado_muv, ESTADO_MUV.RECHAZADO_POR_MUV)
    assert.equal(result.codigo_cuv, null)
    assert.equal(result.detalles_rechazo_muv[0].code, 'MUV-GLOSA-CENTAVO')
    assert.equal(store.records[0].codigo_cufe, 'CUFE-KEEP')
    assert.equal(store.records[0].codigo_cuv, null)
  })

  it('sandbox real: montos al centavo producen CUFE y CUV', async () => {
    const store = memoryStore()
    const result = await ejecutarFlujoDobleValidacion(
      { rips: sampleRips(), invoice: sampleInvoice() },
      {
        saveInvoiceTransaction: store.saveInvoiceTransaction,
        getInvoiceTransaction: store.getInvoiceTransaction,
        saveCuvRecord: async (entry) => ({ id: 'cuv-sandbox', ...entry }),
      },
    )
    assert.equal(result.legalizada, true)
    assert.equal(result.estado_dian, ESTADO_DIAN.APROBADO)
    assert.match(String(result.codigo_cufe), /^[A-F0-9]{96}$/)
    assert.equal(result.estado_muv, ESTADO_MUV.APROBADO_CON_CUV)
    assert.match(String(result.codigo_cuv), /^CUV-/)
    assert.equal(result.rips.cufe, result.codigo_cufe)
  })

  it('sandbox real: MUV glosa si el RIPS no cuadra al centavo con la DIAN', async () => {
    const store = memoryStore()
    const result = await ejecutarFlujoDobleValidacion(
      {
        rips: sampleRips({ vrTotalRips: 100, procedimientos: [{ vrServicio: 100 }] }),
        invoice: sampleInvoice({ payableAmount: 150000 }),
      },
      {
        saveInvoiceTransaction: store.saveInvoiceTransaction,
        getInvoiceTransaction: store.getInvoiceTransaction,
        saveCuvRecord: async (entry) => entry,
      },
    )
    assert.equal(result.estado_dian, ESTADO_DIAN.APROBADO)
    assert.ok(result.codigo_cufe)
    assert.equal(result.estado_muv, ESTADO_MUV.RECHAZADO_POR_MUV)
    assert.equal(result.codigo_cuv, null)
    assert.ok(result.detalles_rechazo_muv.some((item) => item.code === 'MUV-GLOSA-CENTAVO'))
  })

  it('reintento tras glosa MUV no reenvía a la DIAN si ya hay CUFE aprobado', async () => {
    const store = memoryStore()
    await store.saveInvoiceTransaction({
      id: 'tx-retry',
      numFactura: 'FV00001234',
      estado_dian: ESTADO_DIAN.APROBADO,
      codigo_cufe: 'CUFE-EXISTENTE',
      estado_muv: ESTADO_MUV.RECHAZADO_POR_MUV,
      detalles_rechazo_muv: [{ message: 'glosa previa' }],
      dianXml: '<Invoice><cbc:UUID schemeName="CUFE-SHA384">old</cbc:UUID><salud:SectorSalud></salud:SectorSalud></Invoice>',
    })

    let dianCalls = 0
    const result = await ejecutarFlujoDobleValidacion(
      { rips: sampleRips(), invoice: sampleInvoice(), transactionId: 'tx-retry' },
      {
        submitInvoiceXmlToDian: async () => {
          dianCalls += 1
          return { success: true, cufe: 'CUFE-NUEVO' }
        },
        submitRipsToMinsalud: async ({ rips }) => {
          assert.equal(rips.cufe, 'CUFE-EXISTENTE')
          return { success: true, cuv: 'CUV-RETRY' }
        },
        saveInvoiceTransaction: store.saveInvoiceTransaction,
        getInvoiceTransaction: store.getInvoiceTransaction,
        saveCuvRecord: async (entry) => ({ id: 'cuv-retry', ...entry }),
      },
    )

    assert.equal(dianCalls, 0)
    assert.equal(result.legalizada, true)
    assert.equal(result.codigo_cufe, 'CUFE-EXISTENTE')
    assert.equal(result.codigo_cuv, 'CUV-RETRY')
  })
})

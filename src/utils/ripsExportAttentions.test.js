import assert from 'node:assert/strict'
import test from 'node:test'
import { etiquetaAtencionRips, listRipsExportAttentions } from './ripsExportAttentions.ts'

function nota(id, estado, extra = {}) {
  const { ripsMetadata, ...rest } = extra
  return {
    id,
    date: '2026-10-20T09:00',
    procedure: 'Resina',
    cupsCode: '232102',
    anesthesia: { type: '', carpules: 0, vasoconstrictor: '' },
    prescriptions: '',
    professionalName: 'Dr. Mauricio Soto',
    professionalLicense: '123',
    createdAt: '2026-10-20T14:00:00.000Z',
    isLocked: true,
    signedAt: '2026-10-20T14:10:00.000Z',
    contentHash: 'hash',
    ...rest,
    ripsMetadata: {
      codDiagnosticoPrincipal: 'K021',
      ripsEstado: estado,
      tipoVinculacionFinanciera: 'valor_cero',
      ripsErrorLog: estado === 'error' ? 'RVC091' : null,
      ...(ripsMetadata ?? {}),
    },
  }
}

function historia(extra = {}) {
  return {
    id: 7,
    patientId: '4',
    professionalId: 'user-mauricio',
    isLocked: true,
    signedAt: '2026-10-13T23:21:00.000Z',
    createdAt: '2026-10-13T23:21:00.000Z',
    updatedAt: '2026-10-13T23:21:00.000Z',
    diagnoses: [{ code: 'K02.1', description: 'Caries de la dentina', type: 'principal', certainty: 'confirmado' }],
    budgetItems: Array.from({ length: 6 }, (_, index) => ({
      id: `b${index}`,
      procedure: `Procedimiento ${index + 1}`,
      cupsCode: '997102',
      quantity: 1,
      unitPrice: 50000,
    })),
    treatmentPlan: [],
    paymentControlLines: [],
    evolutionNotes: [],
    ...extra,
  }
}

test('la historia firmada sigue en la lista y la nota del borrador también', () => {
  const lista = listRipsExportAttentions({
    records: [historia()],
    drafts: [
      {
        patientId: '4',
        updatedAt: '2026-10-21T12:00:00.000Z',
        clinicalDraft: {
          diagnoses: [
            { code: 'K02.1', description: 'Caries de la dentina', type: 'principal', certainty: 'confirmado' },
          ],
          evolutionNotes: [nota('nota-resina', 'preparado'), nota('nota-control', 'sin_preparar')],
        },
      },
      {
        patientId: '9',
        updatedAt: '2026-10-22T08:00:00.000Z',
        evolutionNotes: [nota('nota-otra', 'preparado', { procedure: 'Exodoncia', cupsCode: '230102' })],
      },
    ],
  })

  assert.deepEqual(
    lista.map((item) => item.id),
    ['nota:nota-otra', 'nota:nota-resina', 'historia:7'],
  )
  assert.equal(etiquetaAtencionRips(lista[1]), 'Listo para exportar')
  assert.equal(lista[1].diagnosisLabel, 'K02.1 — Caries de la dentina')
  assert.equal(lista[1].procedureLabel, 'Resina')
  assert.equal(lista[2].procedureLabel, '6')
  assert.equal(lista[2].diagnosisLabel, 'K02.1 — Caries de la dentina')
  assert.equal(lista.find((item) => item.id === 'nota:nota-control'), undefined)
})

test('una nota preparada en una historia abierta entra aunque isLocked sea false', () => {
  const abierta = historia({
    id: 8,
    isLocked: false,
    isSigned: true,
    updatedAt: '2026-10-18T10:00:00.000Z',
    evolutionNotes: [nota('nota-abierta', 'preparado', { procedure: 'Sellante' })],
    budgetItems: [],
  })
  const lista = listRipsExportAttentions({ records: [abierta], drafts: [] })
  assert.deepEqual(
    lista.map((item) => item.id),
    ['nota:nota-abierta'],
  )
  assert.equal(lista[0].record.isLocked, true)
  assert.equal(lista[0].record.ripsAtencionNotaId, 'nota-abierta')
  assert.deepEqual(
    lista[0].record.evolutionNotes.map((note) => note.id),
    ['nota-abierta'],
  )
  assert.equal(lista[0].record.budgetItems.length, 0)
})

test('el borrador más reciente gana sobre la copia sin preparar de la historia', () => {
  const record = historia({
    evolutionNotes: [nota('nota-resina', 'sin_preparar')],
    updatedAt: '2026-10-13T23:21:00.000Z',
  })
  const lista = listRipsExportAttentions({
    records: [record],
    drafts: [
      {
        patientId: '4',
        updatedAt: '2026-10-24T15:00:00.000Z',
        evolutionNotes: [nota('nota-resina', 'sin_preparar')],
        clinicalDraft: {
          evolutionNotes: [nota('nota-resina', 'preparado', { procedure: 'Resina oclusal' })],
        },
      },
    ],
  })
  const notaLista = lista.find((item) => item.id === 'nota:nota-resina')
  const historiaLista = lista.find((item) => item.id === 'historia:7')
  assert.equal(notaLista.procedureLabel, 'Resina oclusal')
  assert.equal(notaLista.ripsEstado, 'preparado')
  assert.equal(
    historiaLista.record.evolutionNotes.some((note) => note.id === 'nota-resina'),
    false,
  )
  assert.equal(record.evolutionNotes[0].ripsMetadata.ripsEstado, 'sin_preparar')
})

test('transmitido y error también son RIPS generados de la cuenta', () => {
  const lista = listRipsExportAttentions({
    records: [],
    drafts: [
      {
        patientId: '4',
        updatedAt: '2026-10-22T10:00:00.000Z',
        clinicalDraft: {
          evolutionNotes: [
            nota('nota-ok', 'enviado_ok', {
              signedAt: '2026-10-22T11:00:00.000Z',
              ripsMetadata: { cuv: 'CUV1', ripsFechaTransmision: '2026-10-22T11:00:00.000Z' },
            }),
            nota('nota-error', 'error', { procedure: 'Endodoncia' }),
          ],
        },
      },
    ],
  })
  assert.deepEqual(
    lista.map((item) => [item.id, etiquetaAtencionRips(item)]),
    [
      ['nota:nota-ok', 'Transmitido'],
      ['nota:nota-error', 'Error de envío'],
    ],
  )
  assert.equal(lista[1].ripsErrorLog, 'RVC091')
})

test('la nota se exporta sola y la historia conservada no la vuelve a incluir', () => {
  const record = historia({
    evolutionNotes: [nota('nota-resina', 'preparado')],
  })
  const lista = listRipsExportAttentions({ records: [record], drafts: [] })
  const notaLista = lista.find((item) => item.id === 'nota:nota-resina')
  const historiaLista = lista.find((item) => item.id === 'historia:7')
  assert.equal(notaLista.record.ripsAtencionNotaId, 'nota-resina')
  assert.deepEqual(
    notaLista.record.evolutionNotes.map((item) => item.id),
    ['nota-resina'],
  )
  assert.equal(notaLista.record.budgetItems.length, 0)
  assert.equal(notaLista.record.treatmentPlan.length, 0)
  assert.equal(historiaLista.record.budgetItems.length, 6)
  assert.equal(
    historiaLista.record.evolutionNotes.some((item) => item.id === 'nota-resina'),
    false,
  )
  assert.equal(record.evolutionNotes[0].id, 'nota-resina')
})

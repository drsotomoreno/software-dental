import assert from 'node:assert/strict'
import test from 'node:test'
import {
  firmarAperturaHistoria,
  firmarEvolucion,
  firmarEvolucionSinAlterarApertura,
  leerApertura,
  HistoriaAperturaYaFirmadaError,
} from './clinicalHistorySignature.ts'
import { EvolutionNoteImmutableError } from '../types/evolutionNote.ts'

const APERTURA_AT = '2026-10-14T04:21:13.505Z'
const EVOLUCION_AT = '2026-10-19T16:06:00.000Z'

function nota(id, extra = {}) {
  return {
    id,
    date: '2026-09-29T13:48',
    procedure: 'Consulta de primera vez',
    anesthesia: { type: '', carpules: 0, vasoconstrictor: '' },
    prescriptions: '',
    professionalName: 'Mauricio Soto',
    professionalLicense: '79904620',
    createdAt: '2026-09-29T18:48:00.000Z',
    status: 'borrador',
    isSigned: false,
    isLocked: false,
    clinicalNote: 'valoración inicial',
    ...extra,
  }
}

function historia(extra = {}) {
  return {
    id: 'apertura-1',
    patientId: 'paciente-1',
    professionalId: 'profesional-1',
    isLocked: false,
    evolutionNotes: [nota('evo-1'), nota('evo-2', { date: '2026-10-06T16:47', clinicalNote: 'control' })],
    ...extra,
  }
}

test('la apertura se firma una sola vez y la segunda llamada no cambia la fecha', () => {
  const original = historia()
  const firmada = firmarAperturaHistoria(original, {
    signedAt: APERTURA_AT,
    signatureData: 'data:image/png;base64,apertura',
    signedBy: 'profesional-1',
    signedByName: 'Mauricio Soto',
  })

  assert.equal(firmada.isSigned, true)
  assert.equal(firmada.apertura.isSigned, true)
  assert.equal(firmada.apertura.signedAt, APERTURA_AT)
  assert.equal(firmada.apertura.signatureData, 'data:image/png;base64,apertura')
  assert.equal(firmada.apertura.signedBy, 'profesional-1')
  assert.equal(firmada.evolutionNotes, original.evolutionNotes)
  assert.equal(firmada.evolutionNotes[0].status, 'borrador')
  assert.equal(original.isSigned, undefined)

  assert.throws(
    () =>
      firmarAperturaHistoria(firmada, {
        signedAt: EVOLUCION_AT,
        signatureData: 'data:image/png;base64,otra',
        signedBy: 'profesional-1',
      }),
    HistoriaAperturaYaFirmadaError,
  )
  assert.equal(firmada.apertura.signedAt, APERTURA_AT)
  assert.equal(firmada.apertura.signatureData, 'data:image/png;base64,apertura')
  assert.equal(firmada.signedAt, APERTURA_AT)
})

test('firmar una evolución solo bloquea esa nota y no altera la apertura', async () => {
  const apertura = {
    isSigned: true,
    signedAt: APERTURA_AT,
    signatureData: 'data:image/png;base64,apertura',
    signedBy: 'profesional-1',
  }
  const notes = [nota('evo-1'), nota('evo-2', { procedure: 'Exodoncia', clinicalNote: 'pendiente' })]
  const borrador = notes[1]

  const result = await firmarEvolucionSinAlterarApertura({
    apertura,
    notes,
    evolucionId: 'evo-1',
    firma: {
      signedAt: EVOLUCION_AT,
      signatureData: 'data:image/png;base64,evolucion',
      signedBy: 'profesional-1',
    },
  })

  assert.equal(result.apertura, apertura)
  assert.equal(result.apertura.signedAt, APERTURA_AT)
  assert.equal(result.apertura.signatureData, 'data:image/png;base64,apertura')
  assert.equal(result.notes[1], borrador)
  assert.equal(result.notes[1].status, 'borrador')
  assert.equal(result.notes[1].isSigned, false)
  assert.equal(result.notes[0].id, 'evo-1')
  assert.equal(result.notes[0].status, 'firmada')
  assert.equal(result.notes[0].isSigned, true)
  assert.equal(result.notes[0].isLocked, true)
  assert.equal(result.notes[0].signedAt, EVOLUCION_AT)
  assert.equal(result.notes[0].signedBy, 'profesional-1')
  assert.equal(result.notes[0].signatureData, 'data:image/png;base64,evolucion')
  assert.notEqual(result.notes[0].signedAt, apertura.signedAt)
  assert.ok(result.notes[0].contentHash)

  await assert.rejects(
    () =>
      firmarEvolucion(result.notes, 'evo-1', {
        signedAt: '2026-10-19T16:16:00.000Z',
        signatureData: 'data:image/png;base64,reintento',
        signedBy: 'profesional-1',
      }),
    EvolutionNoteImmutableError,
  )
  assert.equal(result.notes[0].signedAt, EVOLUCION_AT)
  assert.equal(result.notes[0].signatureData, 'data:image/png;base64,evolucion')
})

test('un cierre legado más reciente no reemplaza la apertura más antigua', () => {
  const apertura = leerApertura([
    {
      id: 3,
      isLocked: true,
      signedAt: '2026-10-19T16:16:00.000Z',
      professionalId: 'profesional-1',
      isSigned: false,
    },
    {
      id: 1,
      isLocked: true,
      signedAt: APERTURA_AT,
      professionalId: 'profesional-1',
      signatureData: 'data:image/png;base64,apertura',
      isSigned: true,
      apertura: {
        isSigned: true,
        signedAt: APERTURA_AT,
        signatureData: 'data:image/png;base64,apertura',
        signedBy: 'profesional-1',
      },
    },
    {
      id: 2,
      isLocked: true,
      signedAt: '2026-10-19T16:06:00.000Z',
      professionalId: 'profesional-1',
    },
  ])

  assert.equal(apertura.recordId, '1')
  assert.equal(apertura.signedAt, APERTURA_AT)
  assert.equal(apertura.origen, 'apertura')
})

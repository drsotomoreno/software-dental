import assert from 'node:assert/strict'
import test from 'node:test'
import { serializeForHash } from '../utils/crypto.ts'
import { buildEvolutionNoteHashPayload } from '../utils/evolutionNoteHash.ts'
import {
  EvolutionNoteRipsMetadataError,
  applyEvolutionNotePatch,
  applyEvolutionNoteRipsMetadata,
  backfillEvolutionNotesRipsMetadata,
  createDefaultEvolutionNoteRipsMetadata,
  esVinculoSinFacturaElectronica,
  isRipsMetadataOnlyPatch,
  omitEvolutionNoteRipsMetadata,
} from './evolutionNoteRips.ts'

function notaFirmada(extra = {}) {
  return {
    id: 'nota-1',
    date: '2026-10-23T08:00',
    procedure: 'Obturación',
    anesthesia: { type: 'Lidocaína', carpules: 1, vasoconstrictor: 'epinefrina' },
    prescriptions: '',
    professionalName: 'Dra. Nubia',
    professionalLicense: '438265',
    createdAt: '2026-10-23T13:00:00.000Z',
    clinicalNote: 'Se obtura 16 oclusal.',
    contentHash: 'hash-clinico',
    signedAt: '2026-10-23T13:05:00.000Z',
    isLocked: true,
    ...extra,
  }
}

test('la metadata nueva trae los defaults de Res. 2275 y queda sin preparar', () => {
  const metadata = createDefaultEvolutionNoteRipsMetadata()
  assert.equal(metadata.codDiagnosticoPrincipal, '')
  assert.equal(metadata.tipoVinculacionFinanciera, 'valor_cero')
  assert.equal(metadata.idReciboAsociado, null)
  assert.equal(metadata.idFacturaElectronica, null)
  assert.equal(metadata.causaMotivoAtencion, '38')
  assert.equal(metadata.finalidadTecnologia, '11')
  assert.equal(metadata.conceptoRecaudo, '05')
  assert.equal(metadata.ripsEstado, 'sin_preparar')
  assert.equal(metadata.cuv, null)
  assert.equal(metadata.ripsFechaTransmision, null)
  assert.equal(metadata.ripsErrorLog, null)
})

test('normaliza el CIE-10 y acepta un RIPS preparado con recibo interno', () => {
  const metadata = createDefaultEvolutionNoteRipsMetadata({
    codDiagnosticoPrincipal: 'k02.1',
    tipoVinculacionFinanciera: 'recibo_interno',
    idReciboAsociado: 'recibo-12',
    ripsEstado: 'preparado',
  })
  assert.equal(metadata.codDiagnosticoPrincipal, 'K021')
  assert.equal(metadata.idReciboAsociado, 'recibo-12')
  assert.equal(metadata.ripsEstado, 'preparado')
})

test('rechaza preparar el RIPS sin CIE-10, sin soporte o con un CUV ausente', () => {
  assert.throws(
    () => createDefaultEvolutionNoteRipsMetadata({ ripsEstado: 'preparado' }),
    (error) => {
      assert.ok(error instanceof EvolutionNoteRipsMetadataError)
      assert.match(error.message, /CIE-10/)
      return true
    },
  )
  assert.throws(
    () =>
      createDefaultEvolutionNoteRipsMetadata({
        codDiagnosticoPrincipal: 'K021',
        tipoVinculacionFinanciera: 'fev',
        ripsEstado: 'preparado',
      }),
    /idFacturaElectronica/,
  )
  assert.throws(
    () =>
      createDefaultEvolutionNoteRipsMetadata({
        codDiagnosticoPrincipal: 'K021',
        ripsEstado: 'enviado_ok',
        cuv: 'CUV-1',
      }),
    /ripsFechaTransmision/,
  )
  assert.throws(
    () => createDefaultEvolutionNoteRipsMetadata({ tipoVinculacionFinanciera: 'contado' }),
    /tipoVinculacionFinanciera/,
  )
})

test('vincular recibo o CUV en una nota firmada no toca el cuerpo ni el hash', () => {
  const original = notaFirmada()
  const linked = applyEvolutionNoteRipsMetadata(original, {
    codDiagnosticoPrincipal: 'K021',
    tipoVinculacionFinanciera: 'recibo_interno',
    idReciboAsociado: 'recibo-9',
    ripsEstado: 'preparado',
  })
  const accepted = applyEvolutionNoteRipsMetadata(linked, {
    ripsEstado: 'enviado_ok',
    cuv: 'CUV-9988',
    ripsFechaTransmision: '2026-10-23T18:40:00.000Z',
  })

  assert.equal(accepted.procedure, 'Obturación')
  assert.equal(accepted.clinicalNote, 'Se obtura 16 oclusal.')
  assert.equal(accepted.contentHash, 'hash-clinico')
  assert.equal(accepted.signedAt, original.signedAt)
  assert.equal(accepted.ripsMetadata.cuv, 'CUV-9988')
  assert.equal(accepted.ripsMetadata.idReciboAsociado, 'recibo-9')
  assert.equal(original.ripsMetadata, undefined)
  assert.equal(isRipsMetadataOnlyPatch({ ripsMetadata: accepted.ripsMetadata }), true)
  assert.equal(isRipsMetadataOnlyPatch({ ripsMetadata: accepted.ripsMetadata, clinicalNote: 'x' }), false)
})

test('guardar el CIE-10 de una nota con tarifa no la convierte en atención de $0', () => {
  const note = applyEvolutionNoteRipsMetadata(
    { cost: 180000, isBillable: true, estadoRips: 'PENDIENTE_PAGO' },
    { codDiagnosticoPrincipal: 'K021' },
  )
  assert.equal(note.ripsMetadata.tipoVinculacionFinanciera, 'recibo_interno')
  assert.equal(note.ripsMetadata.codDiagnosticoPrincipal, 'K021')
})

test('el hash clínico ignora la metadata aunque cambie el CUV o el recibo', () => {
  const base = notaFirmada({ ripsMetadata: createDefaultEvolutionNoteRipsMetadata() })
  const updated = applyEvolutionNoteRipsMetadata(base, {
    codDiagnosticoPrincipal: 'K021',
    tipoVinculacionFinanciera: 'fev',
    idFacturaElectronica: 'fev-1',
    ripsEstado: 'enviado_ok',
    cuv: 'CUV-1',
    ripsFechaTransmision: '2026-10-23T18:40:00.000Z',
  })

  const basePayload = buildEvolutionNoteHashPayload(base)
  const updatedPayload = buildEvolutionNoteHashPayload(updated)
  assert.equal('ripsMetadata' in basePayload, false)
  assert.equal('pagoId' in basePayload, false)
  assert.equal(serializeForHash(basePayload), serializeForHash(updatedPayload))
  assert.equal('patientSignatureDataUrl' in basePayload, false)
  assert.equal('patientSignatureMeta' in basePayload, false)
  assert.equal(omitEvolutionNoteRipsMetadata(updated).ripsMetadata, undefined)
  assert.equal(omitEvolutionNoteRipsMetadata(updated).clinicalNote, 'Se obtura 16 oclusal.')
})

test('una nota bloqueada acepta solo el parche de metadata RIPS', () => {
  const notes = [notaFirmada()]
  const blocked = () => {
    throw new Error(
      'Por norma legal (Res. 1995/1999), las notas clínicas firmadas son inmutables. Debe realizar una nota aclaratoria (Addendum).',
    )
  }
  const next = notes.map((note) =>
    applyEvolutionNotePatch(
      note,
      {
        ripsMetadata: {
          codDiagnosticoPrincipal: 'K040',
          ripsEstado: 'error',
          ripsErrorLog: 'El MUV rechazó el diagnóstico.',
        },
      },
      { immutable: true, rejectClinicalEdit: blocked },
    ),
  )
  assert.equal(next[0].clinicalNote, 'Se obtura 16 oclusal.')
  assert.equal(next[0].contentHash, 'hash-clinico')
  assert.equal(next[0].ripsMetadata.ripsEstado, 'error')
  assert.equal(next[0].ripsMetadata.codDiagnosticoPrincipal, 'K040')
  assert.match(next[0].ripsMetadata.ripsErrorLog, /MUV/)

  assert.throws(
    () =>
      applyEvolutionNotePatch(
        notes[0],
        { clinicalNote: 'texto nuevo' },
        { immutable: true, rejectClinicalEdit: blocked },
      ),
    /inmutables/,
  )

  const vinculado = applyEvolutionNotePatch(
    notes[0],
    {
      pagoId: 'recibo-9',
      numeroSoportePago: 'RC-9',
      valorProcedimiento: 80000,
      estadoRips: 'PAGADO',
      ripsMetadata: { idReciboAsociado: 'recibo-9', tipoVinculacionFinanciera: 'recibo_interno' },
    },
    { immutable: true, rejectClinicalEdit: blocked },
  )
  assert.equal(vinculado.clinicalNote, 'Se obtura 16 oclusal.')
  assert.equal(vinculado.contentHash, 'hash-clinico')
  assert.equal(vinculado.pagoId, 'recibo-9')
  assert.equal(vinculado.ripsMetadata.idReciboAsociado, 'recibo-9')
})

test('cerrar la evolución es un sidecar y no entra al hash clínico', () => {
  const note = notaFirmada()
  const blocked = () => {
    throw new Error('inmutables')
  }
  const closed = applyEvolutionNotePatch(
    note,
    { workflowStatus: 'CLOSED' },
    { immutable: true, rejectClinicalEdit: blocked },
  )
  assert.equal(closed.workflowStatus, 'CLOSED')
  assert.equal(closed.clinicalNote, note.clinicalNote)
  assert.equal(closed.contentHash, note.contentHash)
  const hashed = omitEvolutionNoteRipsMetadata({ ...closed, ripsMetadata: closed.ripsMetadata })
  assert.equal(hashed.workflowStatus, undefined)
  assert.equal(
    serializeForHash(buildEvolutionNoteHashPayload(note)),
    serializeForHash(buildEvolutionNoteHashPayload(closed)),
  )
})

test('la migración de notas existentes solo completa la metadata ausente', () => {
  const custom = createDefaultEvolutionNoteRipsMetadata({
    codDiagnosticoPrincipal: 'K021',
    ripsEstado: 'error',
    ripsErrorLog: 'timeout',
  })
  const notes = backfillEvolutionNotesRipsMetadata([
    { id: 'vieja', procedure: 'Control' },
    { id: 'nueva', procedure: 'Endodoncia', ripsMetadata: custom },
  ])
  assert.equal(notes[0].ripsMetadata.causaMotivoAtencion, '38')
  assert.equal(notes[0].ripsMetadata.ripsEstado, 'sin_preparar')
  assert.equal(notes[0].procedure, 'Control')
  assert.equal(notes[1].ripsMetadata, custom)
})

test('el recibo interno no pide factura aunque la nota firmada siga marcada como cobrable', () => {
  assert.equal(
    esVinculoSinFacturaElectronica({
      cost: 200000,
      isBillable: true,
      ripsMetadata: { tipoVinculacionFinanciera: 'recibo_interno' },
    }),
    true,
  )
  assert.equal(
    esVinculoSinFacturaElectronica({
      cost: 200000,
      isBillable: true,
      ripsMetadata: { tipoVinculacionFinanciera: 'fev' },
    }),
    false,
  )
  assert.equal(
    esVinculoSinFacturaElectronica({
      cost: 200000,
      isBillable: true,
      ripsMetadata: { tipoVinculacionFinanciera: 'valor_cero' },
    }),
    false,
  )
})

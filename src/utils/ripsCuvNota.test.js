import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultEvolutionNoteRipsMetadata } from '../types/evolutionNoteRips.ts'
import { idsNotaDeFuentes, notasConCuv } from './ripsCuvNota.ts'

test('el CUV queda en la nota de Nicolás y no en las demás', () => {
  const base = {
    ...createDefaultEvolutionNoteRipsMetadata(),
    codDiagnosticoPrincipal: 'K074',
    tipoVinculacionFinanciera: 'valor_cero',
    ripsEstado: 'preparado',
  }
  const notes = [
    { id: 'nota-nicolas', procedure: 'Ortodoncia', ripsMetadata: base },
    { id: 'nota-isabel', procedure: 'Exodoncia', ripsMetadata: { ...base, codDiagnosticoPrincipal: 'K021' } },
  ]
  const next = notasConCuv(notes, new Set(['nota-nicolas']), 'CUV-PRUEBA', '2026-10-27T16:00:00.000Z')
  assert.equal(next[0].ripsMetadata.ripsEstado, 'enviado_ok')
  assert.equal(next[0].ripsMetadata.cuv, 'CUV-PRUEBA')
  assert.equal(next[0].procedure, 'Ortodoncia')
  assert.equal(next[1].ripsMetadata.ripsEstado, 'preparado')
  assert.equal(next[1], notes[1])
})

test('sin coincidencias no reescribe el arreglo', () => {
  const notes = [{ id: 'otra', ripsMetadata: createDefaultEvolutionNoteRipsMetadata() }]
  assert.equal(notasConCuv(notes, new Set(['nota-nicolas']), 'CUV', '2026-10-27T16:00:00.000Z'), notes)
})

test('la atención de nota usa su id y no las notas de otra historia', () => {
  const ids = idsNotaDeFuentes([
    {
      patient: { id: 'p1' },
      record: { ripsAtencionNotaId: 'nota-nicolas', evolutionNotes: [{ id: 'nota-nicolas' }] },
    },
  ])
  assert.deepEqual(ids, ['nota-nicolas'])
})

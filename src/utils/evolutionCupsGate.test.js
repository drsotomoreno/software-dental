import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultEvolutionNoteRipsMetadata } from '../types/evolutionNoteRips.ts'
import {
  adminCupsAlreadyAssigned,
  canEditAdminCupsOnLockedNote,
  effectiveEvolutionCupsCode,
  isValidEvolutionCupsCode,
  noteHasValidCupsForRips,
  noteHasValidPrincipalCie10,
  noteRequiresCupsAndCie10ForClose,
} from './evolutionCupsGate.ts'

function notaBase(extra = {}) {
  return {
    id: 'nota-1',
    date: '2026-11-21T09:00',
    procedure: 'Consulta de primera vez por otras especialidades en odontología',
    anesthesia: { type: '', carpules: 0, vasoconstrictor: '' },
    prescriptions: '',
    professionalName: 'Dra. Nubia',
    professionalLicense: '123',
    createdAt: '2026-11-21T14:00:00.000Z',
    clinicalNote: 'Valoración inicial.',
    cupsCode: null,
    requiereCupsRips: true,
    catalogServices: [
      {
        id: 's1',
        procedure: 'Consulta de primera vez por otras especialidades en odontología',
        serviceName: 'Consulta de primera vez por otras especialidades en odontología',
        cupsCode: null,
        requiereCupsRips: true,
      },
    ],
    ripsMetadata: createDefaultEvolutionNoteRipsMetadata(),
    ...extra,
  }
}

test('isValidEvolutionCupsCode exige exactamente 6 dígitos sin rellenar ceros', () => {
  assert.equal(isValidEvolutionCupsCode(''), false)
  assert.equal(isValidEvolutionCupsCode(null), false)
  assert.equal(isValidEvolutionCupsCode('8902'), false)
  assert.equal(isValidEvolutionCupsCode('890203'), true)
  assert.equal(isValidEvolutionCupsCode('89.02.03'), true)
})

test('evoluciones RIPS exigen CUPS y CIE-10; estéticas no', () => {
  const rips = notaBase()
  assert.equal(noteRequiresCupsAndCie10ForClose(rips), true)
  assert.equal(noteHasValidCupsForRips(rips), false)
  assert.equal(noteHasValidPrincipalCie10(rips), false)

  const ready = notaBase({
    cupsCode: '890203',
    catalogServices: [
      {
        id: 's1',
        procedure: 'Consulta odontología',
        cupsCode: '890203',
        cie10Code: 'K02.1',
        requiereCupsRips: true,
        toothNumber: 16,
      },
    ],
    ripsMetadata: createDefaultEvolutionNoteRipsMetadata({ codDiagnosticoPrincipal: 'K021' }),
  })
  assert.equal(noteHasValidCupsForRips(ready), true)
  assert.equal(noteHasValidPrincipalCie10(ready), true)

  const aesthetic = notaBase({
    requiereCupsRips: false,
    catalogServices: [
      {
        id: 's1',
        procedure: 'Tatuaje dental',
        serviceName: 'Tatuaje dental',
        cupsCode: null,
        requiereCupsRips: false,
      },
    ],
  })
  assert.equal(noteRequiresCupsAndCie10ForClose(aesthetic), false)
})

test('nota firmada sin CUPS permite override administrativo en ripsMetadata', () => {
  const locked = notaBase({
    isLocked: true,
    signedAt: '2026-11-21T16:00:00.000Z',
    contentHash: 'hash',
  })
  assert.equal(canEditAdminCupsOnLockedNote(locked), true)
  assert.equal(adminCupsAlreadyAssigned(locked), false)
  assert.equal(effectiveEvolutionCupsCode(locked), '')

  const assigned = {
    ...locked,
    ripsMetadata: createDefaultEvolutionNoteRipsMetadata({ cupsCode: '890203' }),
  }
  assert.equal(adminCupsAlreadyAssigned(assigned), true)
  assert.equal(effectiveEvolutionCupsCode(assigned), '890203')
  assert.equal(noteHasValidCupsForRips(assigned), true)
  assert.equal(canEditAdminCupsOnLockedNote(assigned) && !adminCupsAlreadyAssigned(assigned), false)
})

test('prellena el CUPS visual desde el texto del procedimiento superior', () => {
  const note = notaBase({
    cupsCode: null,
    procedure: '230101 — Exodoncia de dientes permanentes',
    catalogServices: [
      {
        id: 's1',
        procedure: '230101 — Exodoncia de dientes permanentes',
        serviceName: '230101 — Exodoncia de dientes permanentes',
        cupsCode: null,
        requiereCupsRips: true,
      },
    ],
    ripsMetadata: createDefaultEvolutionNoteRipsMetadata({ cupsCode: null }),
  })
  assert.equal(effectiveEvolutionCupsCode(note), '230101')
  assert.equal(noteHasValidCupsForRips(note), true)
  assert.equal(canEditAdminCupsOnLockedNote({ ...note, isLocked: true, signedAt: 'x', contentHash: 'y' }), false)
})

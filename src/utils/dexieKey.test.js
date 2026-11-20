import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { asDexieScalarKey, asDexieStringKey, isDexieScalarKey } from './dexieKey.ts'
import {
  ensureEvolutionNoteIds,
  evolutionNoteIdsWereRepaired,
  isRecoveredEvolutionNoteId,
  stripRecoveredEvolutionNoteIdForHash,
} from '../../shared/evolutionNoteIds.js'
import { buildEvolutionNoteHashPayload } from './evolutionNoteHash.ts'
import { serializeForHash } from './crypto.ts'

describe('dexieKey guards', () => {
  it('rejects null/undefined/boolean/object that crash WhereClause.equals', () => {
    assert.equal(isDexieScalarKey(null), false)
    assert.equal(isDexieScalarKey(undefined), false)
    assert.equal(isDexieScalarKey(true), false)
    assert.equal(isDexieScalarKey({}), false)
    assert.equal(asDexieScalarKey(null), null)
    assert.equal(asDexieStringKey(undefined), null)
    assert.equal(asDexieStringKey(''), null)
    assert.equal(asDexieStringKey('  '), null)
  })

  it('accepts string/number/Date keys', () => {
    assert.equal(asDexieStringKey('evo-1'), 'evo-1')
    assert.equal(asDexieScalarKey(42), 42)
    assert.ok(asDexieScalarKey(new Date('2026-01-01T00:00:00.000Z')) instanceof Date)
  })
})

describe('ensureEvolutionNoteIds', () => {
  it('recovers missing ids so Dexie addendum queries never see undefined', () => {
    const notes = ensureEvolutionNoteIds([
      {
        procedure: 'Resina',
        clinicalNote: 'sin id',
        contentHash: 'abc123',
        isLocked: true,
        signedAt: '2026-10-01T12:00:00.000Z',
      },
      {
        id: 'ok-1',
        procedure: 'Profilaxis',
        clinicalNote: 'con id',
      },
    ])
    assert.equal(notes[0].id, 'recovered-abc123')
    assert.equal(notes[0].idRecoveredFromLegacy, true)
    assert.equal(notes[1].id, 'ok-1')
    assert.equal(isRecoveredEvolutionNoteId(notes[0].id), true)
    assert.equal(evolutionNoteIdsWereRepaired([{ contentHash: 'abc123' }], notes), true)
  })

  it('is deterministic across calls (same contentHash → same recovered id)', () => {
    const orphan = {
      procedure: 'Resina',
      clinicalNote: 'Isabel',
      contentHash: 'hash-isabel-1',
      isLocked: true,
      signedAt: '2026-10-01T12:00:00.000Z',
    }
    const a = ensureEvolutionNoteIds([orphan])[0]
    const b = ensureEvolutionNoteIds([orphan])[0]
    assert.equal(a.id, b.id)
    assert.equal(a.id, 'recovered-hash-isabel-1')
  })

  it('omits recovered id from hash payload so sealed contentHash stays valid', () => {
    const sealedWithoutId = {
      procedure: 'Resina',
      clinicalNote: 'texto clínico inmutable',
      date: '2026-10-01T07:00:00.000-05:00',
      anesthesia: { type: '', carpules: 0, vasoconstrictor: '' },
      prescriptions: '',
      professionalName: 'Dr',
      professionalLicense: '123',
      createdAt: '2026-10-01T12:00:00.000Z',
      contentHash: 'seal',
      isLocked: true,
      signedAt: '2026-10-01T12:00:00.000Z',
    }
    const originalPayload = serializeForHash(buildEvolutionNoteHashPayload(sealedWithoutId))
    const repaired = ensureEvolutionNoteIds([sealedWithoutId])[0]
    assert.equal(repaired.id, 'recovered-seal')
    assert.equal(repaired.clinicalNote, sealedWithoutId.clinicalNote)
    assert.equal(repaired.contentHash, sealedWithoutId.contentHash)
    const repairedPayload = serializeForHash(buildEvolutionNoteHashPayload(repaired))
    assert.equal(repairedPayload, originalPayload)
    assert.equal(stripRecoveredEvolutionNoteIdForHash(repaired).id, undefined)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { asDexieScalarKey, asDexieStringKey, isDexieScalarKey } from './dexieKey.ts'
import { ensureEvolutionNoteIds } from '../../shared/evolutionNoteIds.js'

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
    assert.equal(notes[1].id, 'ok-1')
  })
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { appendClinicalAuditLogs } from './clinicalAuditLogStore.js'

test('appendClinicalAuditLogs escribe espejo JSON aunque Postgres falle/timeout', async () => {
  const clinic = { clinicalAuditLogs: {} }
  const id = '11111111-1111-4111-8111-111111111111'
  const written = await appendClinicalAuditLogs(
    'clinic:doctormauriciosoto@gmail.com',
    [
      {
        id,
        patientSyncId: '4a08b227-da3d-45f6-8325-a0ec906a45c9',
        clinicaId: 'clinic:doctormauriciosoto@gmail.com',
        userId: 'u1',
        userEmail: 'doctormauriciosoto@gmail.com',
        clinicalRevision: 2,
        contentHash: 'abc123',
        changedSections: ['anamnesis'],
        source: 'autosave',
        createdAt: '2026-11-19T12:00:00.000Z',
      },
    ],
    clinic,
  )
  assert.equal(written, 1)
  assert.ok(clinic.clinicalAuditLogs[id])
  assert.equal(clinic.clinicalAuditLogs[id].patientSyncId, '4a08b227-da3d-45f6-8325-a0ec906a45c9')

  // Append-only: segunda escritura del mismo id no duplica.
  const again = await appendClinicalAuditLogs(
    'clinic:doctormauriciosoto@gmail.com',
    [{ id, patientSyncId: '4a08b227-da3d-45f6-8325-a0ec906a45c9', contentHash: 'other' }],
    clinic,
  )
  assert.equal(again, 0)
  assert.equal(clinic.clinicalAuditLogs[id].contentHash, 'abc123')
})

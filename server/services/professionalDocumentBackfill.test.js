import assert from 'node:assert/strict'
import test from 'node:test'
import { professionalDocumentFromSnapshot } from './professionalDocumentBackfill.js'

const CEDULA = '52333444'
const OTRA = '1099887766'

test('recupera la única cédula del profesional en las atenciones', () => {
  const signer = { id: 'servidor', email: 'doctormauriciosoto@gmail.com' }
  const resolved = professionalDocumentFromSnapshot(
    {
      drafts: [
        {
          payload: {
            clinicalDraft: {
              informedConsent: { professionalLicense: CEDULA },
              evolutionNotes: [
                {
                  professionalLicense: '52.333.444',
                  authorEmail: signer.email,
                  authorUserId: 'id-local',
                },
              ],
            },
          },
        },
      ],
      clinicalRecords: [],
    },
    signer,
  )
  assert.equal(resolved, CEDULA)
})

test('no usa la cédula del paciente ni la de otro profesional', () => {
  const resolved = professionalDocumentFromSnapshot(
    {
      drafts: [
        {
          payload: {
            documentNumber: '80001122',
            clinicalDraft: {
              informedConsent: { professionalLicense: OTRA },
              evolutionNotes: [
                {
                  professionalLicense: OTRA,
                  authorEmail: 'otro@clinica.co',
                },
              ],
            },
          },
        },
      ],
    },
    { id: 'servidor', email: 'doctormauriciosoto@gmail.com' },
  )
  assert.equal(resolved, '')
})

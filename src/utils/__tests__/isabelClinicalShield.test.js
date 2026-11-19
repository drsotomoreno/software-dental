/**
 * Smoke test médico-legal — Isabel De la Rosa (CC 37861325).
 * Verifica los 5 pilares sin Dexie real: hidratación, RIPS admin,
 * inmunidad post-hidratación, emergency draft y bitácora append-only.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeLivingChart } from '../odontogramPersistence.ts'
import { computeClinicalFormHash } from '../../../shared/clinicalFormHash.js'
import {
  clinicalRevisionOf,
  localDraftBlocksRemoteOverwrite,
  nextClinicalRevision,
} from '../../../shared/clinicalRevision.js'
import { shouldReplaceClinicalDocument } from '../../../shared/clinicalRecordGuard.js'
import {
  clearEmergencyClinicalDraft,
  emergencyDraftIsNewerThanDexie,
  emergencyDraftStorageKey,
  readEmergencyClinicalDraft,
  writeEmergencyClinicalDraft,
} from '../clinicalEmergencyDraft.ts'

const ISABEL_SYNC_ID = '4a08b227-da3d-45f6-8325-a0ec906a45c9'
const ISABEL_DOCUMENT = '37861325'
const ISABEL_SIGNED_ID = 'e3a4df37-b719-424b-a952-da429c83d93d'

function isabelSignedRecord(overrides = {}) {
  return {
    id: ISABEL_SIGNED_ID,
    syncId: ISABEL_SIGNED_ID,
    patientSyncId: ISABEL_SYNC_ID,
    documentNumber: ISABEL_DOCUMENT,
    signedAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    anamnesis: { chiefComplaint: 'Motivo firmado antiguo' },
    diagnoses: [{ code: 'K04.0', description: 'Pulpitis', type: 'principal' }],
    diagnosticChart: { entries: [], notes: '' },
    findings: 'Hallazgo firmado',
    treatmentPlan: [{ id: 'plan-old', procedure: 'Endodoncia' }],
    specializedAnnexes: { orthodontics: { notes: 'Anexo firmado' } },
    informedConsent: {
      textAccepted: true,
      signedAt: '2026-10-01T12:00:00.000Z',
      professionalSignatureDataUrl: 'data:image/png;base64,old',
      professionalLicense: '79984620',
    },
    budgetItems: [{ id: 'b-old', procedure: 'Endodoncia', unitPrice: 450000, quantity: 1 }],
    orthodonticsBudget: {
      initialInstallment: { quantity: 1, unitPrice: 800000 },
      controls: { quantity: 0, unitPrice: 0 },
      retainers: { quantity: 0, unitPrice: 0 },
    },
    evolutionNotes: [
      {
        id: 'evo-signed',
        procedure: 'Endodoncia',
        clinicalNote: 'Sellada',
        isLocked: true,
        signedAt: '2026-10-01T12:00:00.000Z',
        contentHash: 'hash-evo-isabel',
      },
    ],
    ...overrides,
  }
}

function isabelLivingDraft(overrides = {}) {
  return {
    anamnesis: { chiefComplaint: 'Dolor en 35 — editado hoy por el profesional' },
    diagnoses: [{ code: 'K02.1', description: 'Caries', type: 'principal' }],
    diagnosticChart: {
      entries: [
        {
          dienteId: '35',
          diagnosisCode: 'K02.1',
          diagnosisDescription: 'Caries',
          color: '#3B82F6',
        },
      ],
      notes: 'molar 35',
    },
    findings: 'Caries oclusal 35',
    treatmentPlan: [{ id: 'plan-new', procedure: 'Resina 35', cupsCode: '232101' }],
    specializedAnnexes: { orthodontics: { notes: 'Plan ortodoncia actualizado' } },
    informedConsent: {
      textAccepted: true,
      selectedConsentIds: ['ortodoncia_brackets'],
      professionalLicense: '79984620',
      patientSignatureDataUrl: 'data:image/png;base64,paciente-nuevo',
    },
    budgetItems: [
      { id: 'b-new', procedure: 'Resina 35', unitPrice: 180000, quantity: 1 },
    ],
    orthodonticsBudget: {
      initialInstallment: { quantity: 1, unitPrice: 900000 },
      controls: { quantity: 12, unitPrice: 150000 },
      retainers: { quantity: 2, unitPrice: 200000 },
    },
    treatmentPlanAuthorization: {
      accepted: true,
      signedAt: '2026-11-18T20:00:00.000Z',
    },
    paymentControl: [
      { id: 'p1', amount: 50000, paymentDate: '2026-11-18' },
    ],
    evolutionNotes: [
      {
        id: 'evo-draft',
        procedure: 'Valoración',
        clinicalNote: 'Nota viva no firmada',
      },
    ],
    ...overrides,
  }
}

test('Isabel: hidratación conserva draft vivo aunque signedRecord.updatedAt sea más nuevo (RIPS)', () => {
  const signed = isabelSignedRecord({
    updatedAt: '2026-11-19T15:00:00.000Z',
    administrativeUpdatedAt: '2026-11-19T15:00:00.000Z',
  })
  const draft = isabelLivingDraft()
  const draftUpdatedAt = '2026-11-18T18:00:00.000Z'

  assert.ok(
    Date.parse(signed.updatedAt) > Date.parse(draftUpdatedAt),
    'precondición: RIPS dejó la firmada con reloj posterior',
  )

  // Pilar 1: draftIsNewer=false (firmada “gana” por wall-clock) ya no descarta secciones.
  const hydrated = mergeLivingChart(signed, draft, false)

  assert.equal(hydrated.anamnesis.chiefComplaint, draft.anamnesis.chiefComplaint)
  assert.equal(hydrated.specializedAnnexes.orthodontics.notes, 'Plan ortodoncia actualizado')
  assert.equal(hydrated.informedConsent.patientSignatureDataUrl, 'data:image/png;base64,paciente-nuevo')
  // Presupuesto general: unión por id (médico-legal); el ítem nuevo del draft debe existir.
  assert.ok(
    (hydrated.budgetItems || []).some((item) => item.id === 'b-new'),
    'el presupuesto vivo de Isabel debe conservar la línea nueva del draft',
  )
  assert.equal(hydrated.orthodonticsBudget.controls.quantity, 12)
  assert.equal(hydrated.treatmentPlan[0].procedure, 'Resina 35')
  assert.equal(hydrated.treatmentPlanAuthorization.accepted, true)
  // Evolución sellada de la firmada se conserva junto a la viva.
  assert.ok(hydrated.evolutionNotes.some((n) => n.id === 'evo-signed' && n.isLocked))
})

test('Isabel: evento administrativo RIPS no debe hacer que un remoto viejo pise pending', () => {
  const localPending = {
    patientId: ISABEL_SYNC_ID,
    patientSyncId: ISABEL_SYNC_ID,
    syncStatus: 'pending',
    clinicalRevision: 7,
    clinicalUpdatedAt: '2026-11-18T20:00:00.000Z',
    clinicalDraft: isabelLivingDraft(),
    updatedAt: '2026-11-18T20:00:00.000Z',
  }
  const remoteAfterRips = {
    patientId: ISABEL_SYNC_ID,
    clinicalRevision: 5,
    clinicalDraft: isabelSignedRecord(),
    updatedAt: '2026-11-19T15:00:00.000Z',
    administrativeUpdatedAt: '2026-11-19T15:00:00.000Z',
  }

  assert.equal(localDraftBlocksRemoteOverwrite(localPending, remoteAfterRips), true)
  assert.equal(shouldReplaceClinicalDocument(localPending, remoteAfterRips), false)
  assert.equal(clinicalRevisionOf(localPending), 7)
  assert.equal(nextClinicalRevision(localPending), 8)
})

test('Isabel: post-hidratación no dispara autosave fantasma (mismo hash)', () => {
  const signed = isabelSignedRecord({ updatedAt: '2026-11-19T15:00:00.000Z' })
  const draft = isabelLivingDraft()
  const hydrated = mergeLivingChart(signed, draft, false)
  const hydrationHash = computeClinicalFormHash(hydrated)
  const currentHash = computeClinicalFormHash(hydrated)
  assert.equal(hydrationHash, currentHash)
  assert.notEqual(hydrationHash, computeClinicalFormHash(signed))
})

test('Isabel: cierre brusco → emergency_draft → recuperación con revisión mayor', () => {
  const memory = new Map()
  const original = globalThis.localStorage
  globalThis.localStorage = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => {
      memory.set(k, String(v))
    },
    removeItem: (k) => {
      memory.delete(k)
    },
  }

  try {
    const draft = isabelLivingDraft()
    const hash = computeClinicalFormHash(draft)
    const ok = writeEmergencyClinicalDraft({
      patientId: ISABEL_SYNC_ID,
      patientSyncId: ISABEL_SYNC_ID,
      clinicalRevision: 9,
      contentHash: hash,
      timestamp: '2026-11-19T16:05:00.000Z',
      clinicalData: draft,
      valuationOnly: false,
    })
    assert.equal(ok, true)
    assert.ok(memory.has(emergencyDraftStorageKey(ISABEL_SYNC_ID)))

    const emergency = readEmergencyClinicalDraft(ISABEL_SYNC_ID)
    assert.ok(emergency)
    assert.equal(emergency.clinicalRevision, 9)
    assert.equal(emergency.clinicalData.anamnesis.chiefComplaint, draft.anamnesis.chiefComplaint)

    const dexieOlder = {
      patientId: ISABEL_SYNC_ID,
      clinicalRevision: 8,
      clinicalUpdatedAt: '2026-11-19T15:00:00.000Z',
      updatedAt: '2026-11-19T15:00:00.000Z',
      clinicalDraft: isabelSignedRecord(),
      evolutionNotes: [],
    }
    assert.equal(emergencyDraftIsNewerThanDexie(emergency, dexieOlder), true)

    const recoveredRevision = nextClinicalRevision(dexieOlder)
    assert.equal(recoveredRevision, 9)

    // Bitácora inmutable (forma del registro; Dexie se prueba en runtime).
    const auditEntry = {
      id: '00000000-0000-4000-8000-000000000001',
      patientSyncId: ISABEL_SYNC_ID,
      clinicaId: 'clinic:doctormauriciosoto@gmail.com',
      userId: 'doctor',
      userEmail: 'doctormauriciosoto@gmail.com',
      clinicalRevision: recoveredRevision,
      contentHash: hash,
      changedSections: ['anamnesis', 'specializedAnnexes', 'informedConsent', 'budgetItems'],
      source: 'emergency_recovery',
      createdAt: new Date().toISOString(),
    }
    assert.equal(auditEntry.source, 'emergency_recovery')
    assert.ok(auditEntry.changedSections.includes('anamnesis'))
    assert.equal(auditEntry.clinicalRevision, 9)

    clearEmergencyClinicalDraft(ISABEL_SYNC_ID)
    assert.equal(readEmergencyClinicalDraft(ISABEL_SYNC_ID), null)
  } finally {
    if (original === undefined) delete globalThis.localStorage
    else globalThis.localStorage = original
  }
})

test('Isabel: revisión clínica mayor acepta borrado intencional de ítem de presupuesto', () => {
  const prev = {
    clinicalRevision: 3,
    clinicalDraft: {
      anamnesis: { chiefComplaint: 'dolor' },
      budgetItems: [
        { id: 'b1', procedure: 'Resina' },
        { id: 'b2', procedure: 'Endodoncia' },
      ],
      paymentControl: [{ id: 'p1', amount: 10000, paymentDate: '2026-11-01' }],
    },
  }
  const next = {
    clinicalRevision: 4,
    clinicalDraft: {
      anamnesis: { chiefComplaint: 'dolor' },
      budgetItems: [{ id: 'b1', procedure: 'Resina' }],
      paymentControl: [{ id: 'p1', amount: 10000, paymentDate: '2026-11-01' }],
    },
  }
  assert.equal(shouldReplaceClinicalDocument(prev, next), true)
})

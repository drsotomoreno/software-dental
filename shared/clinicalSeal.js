/**
 * Sello clínico determinístico (Res. 1995/1999 · Ley 527 · Res. 839).
 * Canonicaliza el núcleo clínico e ignora campos volátiles (updatedAt,
 * workflowStatus, ripsMetadata, cobros). La igualdad de sellos no confía
 * en el contentHash que envía el cliente.
 */

const VOLATILE_NOTE_KEYS = new Set([
  'updatedAt',
  'workflowStatus',
  'ripsMetadata',
  'pagoId',
  'numeroSoportePago',
  'conceptoPago',
  'valorProcedimiento',
  'estadoRips',
  'pendingSync',
  'lastSyncedAt',
  'syncId',
  'clinicId',
])

const VOLATILE_DOC_KEYS = new Set([
  'updatedAt',
  'createdAt',
  'deletedAt',
  'pendingSync',
  'lastSyncedAt',
  'syncId',
  'clinicId',
  'id',
  'contentHash',
  'paymentControl',
  'paymentControlLines',
  'orthodonticsPaymentControl',
  'paymentPlan',
  'budget',
  'budgetItems',
  'orthodonticsBudget',
  'dentalImplantsBudget',
])

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function unwrapClinicalPayload(record) {
  if (!record || typeof record !== 'object') return {}
  const payload = record.payload
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload
  return record
}

/** JSON canónico: ordena claves en profundidad para SHA-256 estable. */
export function canonicalize(value) {
  return JSON.stringify(sortValue(value))
}

function sortValue(value) {
  if (value == null) return null
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sortValue)
  const keys = Object.keys(value).sort()
  const out = {}
  for (const key of keys) {
    const child = value[key]
    if (child === undefined) continue
    out[key] = sortValue(child)
  }
  return out
}

/** Cuerpo clínico de una nota de evolución (sin sidecar RIPS/pago). */
export function buildEvolutionSealPayload(note) {
  if (!note || typeof note !== 'object') return null
  const sealed = {
    id: note.id ?? null,
    kind: note.kind ?? 'evolution',
    parentEvolutionNoteId: note.parentEvolutionNoteId ?? null,
    parentEvolutionNoteHash: note.parentEvolutionNoteHash ?? null,
    addendumReason: note.addendumReason ?? null,
    date: note.date ?? null,
    procedure: note.procedure ?? null,
    toothNumber: note.toothNumber ?? null,
    anatomicalScope: note.anatomicalScope ?? null,
    diagnoses: note.diagnoses ?? null,
    anesthesia: note.anesthesia ?? null,
    prescriptions: note.prescriptions ?? null,
    professionalName: note.professionalName ?? null,
    professionalLicense: note.professionalLicense ?? null,
    authorUserId: note.authorUserId ?? null,
    authorEmail: note.authorEmail ?? null,
    createdAt: note.createdAt ?? null,
    catalogServices: note.catalogServices ?? null,
    dentalServiceId: note.dentalServiceId ?? null,
    serviceName: note.serviceName ?? null,
    requiereCupsRips: note.requiereCupsRips ?? null,
    clinicalNote: note.clinicalNote ?? null,
    cupsCode: note.cupsCode ?? null,
    professionalSignatureDataUrl: note.professionalSignatureDataUrl ?? null,
    professionalSignatureMeta: note.professionalSignatureMeta ?? null,
    cost: note.cost ?? null,
    isBillable: note.isBillable ?? null,
    isLocked: note.isLocked === true,
    signedAt: text(note.signedAt) || null,
  }
  return sealed
}

function sealEvolutionNotes(notes) {
  if (!Array.isArray(notes)) return []
  return notes
    .filter((note) => note && typeof note === 'object')
    .map(buildEvolutionSealPayload)
    .sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')))
}

function sealFormCore(form) {
  if (!form || typeof form !== 'object') return null
  return {
    anamnesis: form.anamnesis ?? null,
    stomatologicalExam: form.stomatologicalExam ?? null,
    specializedAnnexes: form.specializedAnnexes ?? null,
    odontogramSnapshot: form.odontogramSnapshot ?? null,
    diagnoses: form.diagnoses ?? null,
    diagnosisNotes: form.diagnosisNotes ?? '',
    findings: form.findings ?? null,
    treatmentPlan: form.treatmentPlan ?? null,
    treatmentPlanNotes: form.treatmentPlanNotes ?? '',
    evolutionNotes: sealEvolutionNotes(form.evolutionNotes),
    informedConsent: sealInformedConsent(form.informedConsent),
    treatingDentistSignature: sealTreatingSignature(form.treatingDentistSignature),
    isLocked: form.isLocked === true,
    isSigned: form.isSigned === true,
    signedAt: text(form.signedAt) || null,
    professionalId: form.professionalId ?? null,
    patientId: form.patientId ?? null,
  }
}

function sealInformedConsent(consent) {
  if (!consent || typeof consent !== 'object') return null
  return {
    textAccepted: consent.textAccepted === true,
    selectedConsentIds: Array.isArray(consent.selectedConsentIds)
      ? [...consent.selectedConsentIds].sort()
      : [],
    patientSignatureDataUrl: consent.patientSignatureDataUrl ?? null,
    professionalSignatureDataUrl: consent.professionalSignatureDataUrl ?? null,
    signedAt: text(consent.signedAt) || null,
    guardianName: consent.guardianName ?? null,
    guardianDocument: consent.guardianDocument ?? null,
  }
}

function sealTreatingSignature(signature) {
  if (!signature || typeof signature !== 'object') return null
  return {
    signedAt: text(signature.signedAt) || null,
    signatureDataUrl: signature.signatureDataUrl ?? null,
    professionalName: signature.professionalName ?? null,
    professionalLicense: signature.professionalLicense ?? null,
    rethus: signature.rethus ?? signature.firmaRethus ?? null,
  }
}

/**
 * Núcleo clínico del documento (historia / borrador / payload de sync).
 * Ignora updatedAt, contentHash del cliente y campos de facturación.
 */
export function buildClinicalSealPayload(record) {
  const data = unwrapClinicalPayload(record)
  return {
    patientId: data.patientId ?? null,
    professionalId: data.professionalId ?? null,
    root: sealFormCore(data),
    clinicalDraft: sealFormCore(data.clinicalDraft),
    valuationDraft: sealFormCore(data.valuationDraft),
  }
}

export function clinicalSealCanonical(record) {
  return canonicalize(buildClinicalSealPayload(record))
}

export function evolutionSealCanonical(note) {
  return canonicalize(buildEvolutionSealPayload(note))
}

export function clinicalSealsEqual(left, right) {
  return clinicalSealCanonical(left) === clinicalSealCanonical(right)
}

export function evolutionSealsEqual(left, right) {
  return evolutionSealCanonical(left) === evolutionSealCanonical(right)
}

export function recordHasSignedAt(record) {
  const data = unwrapClinicalPayload(record)
  if (text(data.signedAt)) return true
  if (text(data.clinicalDraft?.signedAt) || text(data.valuationDraft?.signedAt)) return true
  const notes = [
    ...(Array.isArray(data.evolutionNotes) ? data.evolutionNotes : []),
    ...(Array.isArray(data.clinicalDraft?.evolutionNotes) ? data.clinicalDraft.evolutionNotes : []),
    ...(Array.isArray(data.valuationDraft?.evolutionNotes)
      ? data.valuationDraft.evolutionNotes
      : []),
  ]
  return notes.some((note) => text(note?.signedAt))
}

const ADMIN_NOTE_KEYS = [
  'ripsMetadata',
  'workflowStatus',
  'pagoId',
  'numeroSoportePago',
  'conceptoPago',
  'valorProcedimiento',
  'estadoRips',
]

/** Copia solo sidecar administrativo sobre una nota ya sellada. */
export function mergeEvolutionAdminSidecar(baseNote, incomingNote) {
  if (!baseNote || typeof baseNote !== 'object') return incomingNote
  if (!incomingNote || typeof incomingNote !== 'object') return baseNote
  const next = { ...baseNote }
  for (const key of ADMIN_NOTE_KEYS) {
    if (incomingNote[key] !== undefined) next[key] = incomingNote[key]
  }
  return next
}

export { VOLATILE_NOTE_KEYS, VOLATILE_DOC_KEYS }

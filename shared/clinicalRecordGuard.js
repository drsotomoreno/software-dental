/**
 * La historia clínica firmada es un documento legal (Ley 527 / Res. 1995 de 1999).
 * Una copia más nueva, vacía o sin firma no puede reemplazarla: ni en el
 * servidor, ni al bajar el snapshot, ni al autoguardar el formulario.
 */

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function unwrapClinicalPayload(record) {
  if (!record || typeof record !== 'object') return {}
  const payload = record.payload
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload
  return record
}

function stampOf(record) {
  if (!record || typeof record !== 'object') return 0
  const data = unwrapClinicalPayload(record)
  const deleted = Date.parse(record.deletedAt || data.deletedAt || '') || 0
  const updated =
    Date.parse(record.updatedAt || data.updatedAt || data.signedAt || data.createdAt || '') || 0
  return Math.max(deleted, updated)
}

function evolutionNoteIsSigned(note) {
  if (!note || typeof note !== 'object') return false
  return note.isLocked === true || Boolean(text(note.signedAt) && text(note.contentHash))
}

/**
 * Une las notas. Un formulario vacío no borra las que ya existen, y una nota
 * firmada conserva su cuerpo (la metadata RIPS sí puede actualizarse).
 */
export function mergeSignedEvolutionNotes(baseNotes, incomingNotes) {
  if (!evolutionNotesHaveContent(incomingNotes)) {
    return Array.isArray(baseNotes) ? baseNotes : incomingNotes
  }
  if (!Array.isArray(baseNotes) || baseNotes.length === 0) return incomingNotes
  const merged = new Map(baseNotes.filter((note) => note && note.id).map((note) => [note.id, note]))
  for (const note of incomingNotes) {
    if (!note || !note.id) continue
    const previous = merged.get(note.id)
    if (!previous) {
      merged.set(note.id, note)
      continue
    }
    if (!evolutionNoteIsSigned(previous)) {
      merged.set(note.id, note)
      continue
    }
    const kept = { ...previous }
    if (note.ripsMetadata !== undefined) kept.ripsMetadata = note.ripsMetadata
    if (note.workflowStatus !== undefined) kept.workflowStatus = note.workflowStatus
    merged.set(note.id, kept)
  }
  return preserveEvolutionWorkflowStatus(baseNotes, [...merged.values()])
}

/**
 * Una evolución ya cerrada para RIPS no vuelve a borrador porque un
 * autoguardado traiga la nota sin `workflowStatus`.
 * @param {unknown} existing
 * @param {unknown} incoming
 */
export function preserveEvolutionWorkflowStatus(existing, incoming) {
  if (!Array.isArray(incoming)) return incoming
  const closed = new Set(
    (Array.isArray(existing) ? existing : [])
      .filter((note) => note && note.workflowStatus === 'CLOSED' && note.id)
      .map((note) => note.id),
  )
  if (closed.size === 0) return incoming
  return incoming.map((note) => {
    if (!note || !closed.has(note.id) || note.workflowStatus === 'CLOSED') return note
    return { ...note, workflowStatus: 'CLOSED' }
  })
}

export function evolutionNotesHaveContent(notes) {
  if (!Array.isArray(notes)) return false
  return notes.some((note) => {
    if (!note || typeof note !== 'object') return false
    if (evolutionNoteIsSigned(note)) return true
    return Boolean(
      text(note.procedure) ||
        text(note.clinicalNote) ||
        text(note.serviceName) ||
        text(note.prescriptions) ||
        text(note.anesthesia?.type),
    )
  })
}

export function anamnesisHasContent(anamnesis) {
  if (!anamnesis || typeof anamnesis !== 'object') return false
  if (
    text(anamnesis.chiefComplaint) ||
    text(anamnesis.currentIllness) ||
    text(anamnesis.dentalHistory) ||
    text(anamnesis.familyHistory) ||
    text(anamnesis.currentMedications) ||
    text(anamnesis.systemicDiseasesOther)
  ) {
    return true
  }
  if (Array.isArray(anamnesis.systemicDiseases) && anamnesis.systemicDiseases.length > 0) return true
  if (Array.isArray(anamnesis.criticalMedications) && anamnesis.criticalMedications.length > 0) {
    return true
  }
  const allergies = anamnesis.allergies
  if (
    allergies &&
    (text(allergies.medications) || text(allergies.anesthesia) || text(allergies.other))
  ) {
    return true
  }
  return Boolean(
    anamnesis.allergiesNoReporta ||
      anamnesis.systemicDiseasesNoReporta ||
      anamnesis.currentMedicationsNoReporta ||
      anamnesis.dentalHistoryNoReporta ||
      anamnesis.familyHistoryNoReporta,
  )
}

export function stomatologicalExamHasContent(exam) {
  if (!exam || typeof exam !== 'object') return false
  const vital = exam.vitalSigns
  if (
    vital &&
    (vital.systolicPressure != null ||
      vital.diastolicPressure != null ||
      vital.heartRate != null ||
      text(vital.notes))
  ) {
    return true
  }
  const atm = exam.atm
  if (atm && (atm.isNormal || text(atm.clicks) || text(atm.pain) || text(atm.deviation) || text(atm.notes))) {
    return true
  }
  const soft = exam.softTissues
  if (soft && typeof soft === 'object') {
    for (const field of Object.values(soft)) {
      if (field && (field.isNormal || text(field.description) || text(field.notes))) return true
    }
  }
  const occlusion = exam.occlusion
  if (
    occlusion &&
    (occlusion.isNormal || occlusion.crossbite || occlusion.openbite || occlusion.deepBite || text(occlusion.notes))
  ) {
    return true
  }
  if (occlusion) {
    for (const key of ['molarRight', 'molarLeft', 'canineLeft', 'canineRight']) {
      const value = text(occlusion[key])
      if (value && value !== 'no_evaluado') return true
    }
  }
  const perio = exam.periodontium
  if (perio && (perio.isNormal || text(perio.notes))) return true
  if (
    perio?.plaqueCalculus &&
    (text(perio.plaqueCalculus.hygiene) || text(perio.plaqueCalculus.calculusPresent))
  ) {
    return true
  }
  const findings = exam.findingCie10
  return Boolean(findings && typeof findings === 'object' && Object.keys(findings).length > 0)
}

export function informedConsentHasContent(consent) {
  if (!consent || typeof consent !== 'object') return false
  if (consent.textAccepted === true) return true
  if (Array.isArray(consent.selectedConsentIds) && consent.selectedConsentIds.length > 0) return true
  return Boolean(
    text(consent.patientSignatureDataUrl) ||
      text(consent.professionalSignatureDataUrl) ||
      text(consent.signedAt),
  )
}

export function treatmentPlanHasContent(plan) {
  return (
    Array.isArray(plan) &&
    plan.some((item) => text(item?.procedure) || text(item?.notes) || text(item?.cupsCode))
  )
}

const ANNEX_EMPTY = new Set([
  '',
  '0',
  'no_evaluado',
  'sano',
  'presente',
  'pendiente',
  'no aplica',
  'sin_preparar',
  'valor_cero',
])

/** Textos que trae la plantilla periodontal nueva. No son hallazgos del paciente. */
const ANNEX_TEMPLATE_TEXT = new Set([
  'instruccion de higiene oral, control de placa, rar',
  'instrucción de higiene oral, control de placa, rar',
  'cirugia periodontal / regenerativa',
  'cirugía periodontal / regenerativa',
  'soporte periodontal (mantenimiento)',
])

function annexNodeHasContent(value, depth) {
  if (value == null || depth > 7) return false
  if (typeof value === 'boolean') return value === true
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return (
      normalized.length > 0 &&
      !ANNEX_EMPTY.has(normalized) &&
      !ANNEX_TEMPLATE_TEXT.has(normalized)
    )
  }
  if (Array.isArray(value)) return value.some((item) => annexNodeHasContent(item, depth + 1))
  if (typeof value === 'object') {
    return Object.entries(value).some(([key, child]) => {
      if (key === 'id' || key === 'color' || key === 'number') return false
      return annexNodeHasContent(child, depth + 1)
    })
  }
  return false
}

export function specializedAnnexesHaveContent(annexes) {
  return annexNodeHasContent(annexes, 0)
}

/** Contenido clínico real. La cédula del profesional o un formulario vacío no cuentan. */
export function clinicalFormHasContent(form) {
  if (!form || typeof form !== 'object') return false
  if (anamnesisHasContent(form.anamnesis)) return true
  if (stomatologicalExamHasContent(form.stomatologicalExam)) return true
  if (Array.isArray(form.diagnoses) && form.diagnoses.length > 0) return true
  if (Array.isArray(form.diagnosticChart?.entries) && form.diagnosticChart.entries.length > 0) {
    return true
  }
  if (text(form.findings) || text(form.diagnosisNotes) || text(form.treatmentPlanNotes)) return true
  if (treatmentPlanHasContent(form.treatmentPlan)) return true
  if (evolutionNotesHaveContent(form.evolutionNotes)) return true
  if (informedConsentHasContent(form.informedConsent)) return true
  if (form.valuationConsent?.consentimientoValoracionAceptado) return true
  if (Array.isArray(form.budgetItems) && form.budgetItems.some((item) => text(item?.procedure))) {
    return true
  }
  return specializedAnnexesHaveContent(form.specializedAnnexes)
}

/** Qué tan completa está la historia. Sirve para no abrir una copia vacía si la firmada sigue guardada. */
export function clinicalDocumentRichness(record) {
  const data = unwrapClinicalPayload(record)
  const forms = [data, data.clinicalDraft, data.valuationDraft].filter(
    (form) => form && typeof form === 'object',
  )
  let score = 0
  for (const form of forms) {
    if (anamnesisHasContent(form.anamnesis)) score += 5
    if (stomatologicalExamHasContent(form.stomatologicalExam)) score += 3
    if (Array.isArray(form.diagnoses) && form.diagnoses.length > 0) score += 3
    if (text(form.findings) || text(form.diagnosisNotes)) score += 1
    if (treatmentPlanHasContent(form.treatmentPlan)) score += 2
    if (informedConsentHasContent(form.informedConsent)) score += 2
    if (evolutionNotesHaveContent(form.evolutionNotes)) score += 4
    if (specializedAnnexesHaveContent(form.specializedAnnexes)) score += 2
  }
  return score
}

export function clinicalBodyHasContent(record) {
  const data = unwrapClinicalPayload(record)
  if (clinicalFormHasContent(data)) return true
  if (clinicalFormHasContent(data.clinicalDraft)) return true
  if (clinicalFormHasContent(data.valuationDraft)) return true
  return evolutionNotesHaveContent(data.evolutionNotes)
}

function formIsSigned(form) {
  if (!form || typeof form !== 'object') return false
  if (form.isLocked === true && text(form.signedAt)) return true
  if (form.isSigned === true && text(form.signedAt)) return true
  if (text(form.signedAt) && text(form.contentHash)) return true
  const signature = form.treatingDentistSignature
  if (signature && text(signature.signedAt) && text(signature.signatureDataUrl)) return true
  const notes = Array.isArray(form.evolutionNotes) ? form.evolutionNotes : []
  return notes.some(evolutionNoteIsSigned)
}

/** Firma del tratante, cierre RIPS o una evolución ya firmada. */
export function isSignedClinicalDocument(record) {
  const data = unwrapClinicalPayload(record)
  if (formIsSigned(data) || formIsSigned(data.clinicalDraft) || formIsSigned(data.valuationDraft)) {
    return true
  }
  return evolutionNotesHaveContent(data.evolutionNotes) && (data.evolutionNotes ?? []).some(evolutionNoteIsSigned)
}

export function isBlankClinicalShell(record) {
  return !clinicalBodyHasContent(record)
}

/**
 * El autoguardado de un formulario todavía vacío no puede borrar la historia
 * que ya estaba en el dispositivo.
 */
export function shouldPersistClinicalDraft(existing, incoming) {
  if (!existing) return true
  if (clinicalBodyHasContent(existing) && isBlankClinicalShell(incoming)) return false
  return true
}

/**
 * Decide si la copia entrante puede sustituir a la guardada.
 * Una historia firmada o con contenido gana siempre sobre una copia en blanco,
 * aunque la copia en blanco tenga `updatedAt` posterior.
 */
function clinicalFormsOf(record) {
  const data = unwrapClinicalPayload(record)
  return [data, data.clinicalDraft, data.valuationDraft].filter(
    (form) => form && typeof form === 'object',
  )
}

function anyClinicalForm(record, predicate) {
  return clinicalFormsOf(record).some((form) => predicate(form))
}

const CLINICAL_SECTION_CHECKS = [
  (form) => anamnesisHasContent(form.anamnesis),
  (form) => stomatologicalExamHasContent(form.stomatologicalExam),
  (form) => Array.isArray(form.diagnoses) && form.diagnoses.length > 0,
  (form) => treatmentPlanHasContent(form.treatmentPlan),
  (form) => evolutionNotesHaveContent(form.evolutionNotes),
  (form) => text(form.findings) || text(form.diagnosisNotes) || text(form.treatmentPlanNotes),
]

/** Una copia más nueva no puede dejar atrás secciones que la guardada sí tiene. */
function dropsClinicalSections(prev, next) {
  return CLINICAL_SECTION_CHECKS.some(
    (hasSection) => anyClinicalForm(prev, hasSection) && !anyClinicalForm(next, hasSection),
  )
}

/** La copia entrante trae anamnesis, examen, diagnóstico, plan o evolución que faltaba. */
function gainsClinicalSections(prev, next) {
  return CLINICAL_SECTION_CHECKS.some(
    (hasSection) => !anyClinicalForm(prev, hasSection) && anyClinicalForm(next, hasSection),
  )
}

export function shouldReplaceClinicalDocument(prev, next) {
  if (!prev) return true
  if (!next) return false

  const prevSigned = isSignedClinicalDocument(prev)
  const nextSigned = isSignedClinicalDocument(next)
  const prevBody = clinicalBodyHasContent(prev)
  const nextBody = clinicalBodyHasContent(next)
  const prevHash = text(unwrapClinicalPayload(prev).contentHash)
  const nextHash = text(unwrapClinicalPayload(next).contentHash)

  if (prevBody && !nextBody) return false
  if (!prevBody && nextBody) return true
  if (dropsClinicalSections(prev, next)) return false
  if (gainsClinicalSections(prev, next)) return true

  if (prevSigned && !nextSigned) return false
  if (!prevSigned && nextSigned) return true

  if (prevSigned && nextSigned && prevHash && nextHash && prevHash !== nextHash) return false
  return stampOf(next) >= stampOf(prev)
}

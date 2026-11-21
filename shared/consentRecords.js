/**
 * Núcleo medicolegal de consentimientos individuales (FASE 1).
 * Res. 1995/1999 · Ley 527 · inmutabilidad · fusión Dexie/Postgres.
 *
 * Usado por frontend (consentHelpers.ts), clinicalRecordGuard y clinicalPostgresStore.
 */

import { sha256HexBytes } from './sha256Hex.js'

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export class ConsentMedicolegalError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConsentMedicolegalError'
  }
}

/** @param {unknown} record */
export function isConsentLegallySealed(record) {
  if (!record || typeof record !== 'object') return false
  const status = text(/** @type {{ status?: string }} */ (record).status)
  return status === 'signed' || status === 'revoked'
}

/**
 * @param {unknown} existing
 * @param {unknown} incoming
 */
function isValidRevocationTransition(existing, incoming) {
  if (!existing || !incoming || typeof existing !== 'object' || typeof incoming !== 'object') {
    return false
  }
  const prev = /** @type {Record<string, unknown>} */ (existing)
  const next = /** @type {Record<string, unknown>} */ (incoming)
  if (text(prev.status) !== 'signed') return false
  if (text(next.status) !== 'revoked') return false
  return Boolean(text(next.revokedReason) && text(next.revokedAt) && text(next.revokedByUserId))
}

/**
 * @param {Record<string, unknown>} sealed
 * @param {Record<string, unknown>} incoming
 */
function retainSealedConsent(sealed, incoming) {
  if (isValidRevocationTransition(sealed, incoming)) {
    return {
      ...sealed,
      status: 'revoked',
      revokedAt: text(incoming.revokedAt),
      revokedReason: text(incoming.revokedReason),
      revokedByUserId: text(incoming.revokedByUserId),
    }
  }
  return sealed
}

/**
 * Une arreglos de consentimientos por `id` sin pisar documentos firmados.
 * Los firmados ausentes en `incoming` se conservan (cero borrado).
 *
 * @param {unknown} existing
 * @param {unknown} incoming
 * @returns {object[]}
 */
export function mergeConsentRecords(existing, incoming) {
  const base = Array.isArray(existing) ? existing.filter((item) => item && typeof item === 'object') : []
  const next = Array.isArray(incoming) ? incoming.filter((item) => item && typeof item === 'object') : []

  /** @type {Map<string, Record<string, unknown>>} */
  const merged = new Map()
  const order = []

  const remember = (id, record) => {
    if (!merged.has(id)) order.push(id)
    merged.set(id, record)
  }

  for (const item of base) {
    const id = text(/** @type {{ id?: string }} */ (item).id)
    if (!id) continue
    remember(id, /** @type {Record<string, unknown>} */ ({ ...item }))
  }

  for (const item of next) {
    const id = text(/** @type {{ id?: string }} */ (item).id)
    if (!id) continue
    const prev = merged.get(id)
    const incomingRecord = /** @type {Record<string, unknown>} */ ({ ...item })
    if (!prev) {
      remember(id, incomingRecord)
      continue
    }
    if (isConsentLegallySealed(prev)) {
      remember(id, retainSealedConsent(prev, incomingRecord))
      continue
    }
    remember(id, incomingRecord)
  }

  return order.map((id) => merged.get(id)).filter(Boolean)
}

/**
 * @param {Record<string, unknown>|null|undefined} left
 * @param {Record<string, unknown>|null|undefined} right
 */
export function mergeConsentFieldsInForm(left, right) {
  const leftList = Array.isArray(left?.informedConsents) ? left.informedConsents : []
  const rightList = Array.isArray(right?.informedConsents) ? right.informedConsents : []
  return {
    informedConsents: mergeConsentRecords(leftList, rightList),
  }
}

function newConsentId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `consent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** @param {Record<string, unknown>} record */
export function buildConsentHashPayload(record) {
  return {
    id: record.id,
    templateId: record.templateId,
    title: record.title,
    renderedTextSnapshot: record.renderedTextSnapshot,
    status: record.status,
    textAccepted: record.textAccepted,
    signerRole: record.signerRole,
    guardianName: record.guardianName ?? null,
    guardianDocument: record.guardianDocument ?? null,
    guardianRelationship: record.guardianRelationship ?? null,
    patientSignatureDataUrl: record.patientSignatureDataUrl ?? null,
    patientSignatureDriveId: record.patientSignatureDriveId ?? null,
    professionalSignatureDataUrl: record.professionalSignatureDataUrl ?? null,
    professionalSignatureDriveId: record.professionalSignatureDriveId ?? null,
    professionalId: record.professionalId,
    professionalName: record.professionalName,
    professionalDocument: record.professionalDocument,
    professionalRethus: record.professionalRethus,
    createdAt: record.createdAt,
    signedAt: record.signedAt ?? null,
  }
}

/** @param {Record<string, unknown>} record */
export function computeConsentContentHash(record) {
  const payload = buildConsentHashPayload(record)
  const stable = JSON.stringify(payload, Object.keys(payload).sort())
  return sha256HexBytes(stable)
}

/** @param {object} record */
export function assertConsentMutable(record) {
  if (isConsentLegallySealed(record)) {
    throw new ConsentMedicolegalError(
      'Un consentimiento firmado o revocado es inmutable: no se puede editar ni eliminar (Res. 1995/1999).',
    )
  }
}

/** @param {unknown} consent */
function legacyIsSigned(consent) {
  if (!consent || typeof consent !== 'object') return false
  const c = /** @type {Record<string, unknown>} */ (consent)
  const ids = Array.isArray(c.selectedConsentIds) ? c.selectedConsentIds : []
  if (ids.length === 0) {
    if (!(c.textAccepted || text(c.signedAt) || text(c.patientSignatureDataUrl))) return false
  }
  const selected =
    ids.length > 0
      ? ids
      : c.textAccepted || text(c.signedAt) || text(c.patientSignatureDataUrl)
        ? ['general_odonto']
        : []
  if (selected.length === 0) return false
  return Boolean(text(c.patientSignatureDataUrl) && text(c.professionalSignatureDataUrl))
}

/**
 * Proyecta el campo legado `informedConsent` como registros virtuales de solo lectura.
 * @param {unknown} legacy
 * @returns {object[]}
 */
export function projectLegacyInformedConsent(legacy) {
  if (!legacyIsSigned(legacy)) return []
  const c = /** @type {Record<string, unknown>} */ (legacy)
  const ids = Array.isArray(c.selectedConsentIds) ? c.selectedConsentIds.filter(Boolean) : []
  const selected =
    ids.length > 0
      ? ids
      : ['general_odonto']
  const signedAt = text(c.signedAt) || new Date(0).toISOString()
  const professionalDocument = text(c.professionalLicense)
  const professionalRethus = text(c.professionalRegistry) || professionalDocument
  const hasGuardian = Boolean(text(c.guardianName) && text(c.guardianDocument))
  const drivePatient = text(
    c.patientSignatureDrive && typeof c.patientSignatureDrive === 'object'
      ? /** @type {{ driveFileId?: string }} */ (c.patientSignatureDrive).driveFileId
      : '',
  )
  const driveProfessional = text(
    c.professionalSignatureDrive && typeof c.professionalSignatureDrive === 'object'
      ? /** @type {{ driveFileId?: string }} */ (c.professionalSignatureDrive).driveFileId
      : '',
  )

  return selected.map((templateId) => {
    const id = String(templateId)
    return {
      id: `legacy-unified:${id}:${signedAt}`,
      templateId: id,
      title: id,
      renderedTextSnapshot: id,
      status: 'signed',
      textAccepted: true,
      signerRole: hasGuardian ? 'guardian' : 'patient',
      guardianName: text(c.guardianName) || undefined,
      guardianDocument: text(c.guardianDocument) || undefined,
      patientSignatureDataUrl: text(c.patientSignatureDataUrl) || undefined,
      patientSignatureDriveId: drivePatient || undefined,
      professionalSignatureDataUrl: text(c.professionalSignatureDataUrl) || undefined,
      professionalSignatureDriveId: driveProfessional || undefined,
      professionalId: professionalDocument,
      professionalName: '',
      professionalDocument,
      professionalRethus,
      createdAt: signedAt,
      signedAt,
      isLegacyUnified: true,
    }
  })
}

/**
 * @param {{ informedConsent?: unknown, informedConsents?: unknown }} record
 */
export function getNormalizedConsents(record) {
  const modern = Array.isArray(record?.informedConsents)
    ? record.informedConsents.filter((item) => item && typeof item === 'object' && text(item.id))
    : []
  const modernTemplateIds = new Set(modern.map((item) => item.templateId))
  const legacyProjected = projectLegacyInformedConsent(record?.informedConsent).filter(
    (item) => !modernTemplateIds.has(item.templateId),
  )
  return [...modern, ...legacyProjected]
}

/**
 * @param {object} input
 */
export function createConsentDraft(input) {
  const snapshot = text(input?.renderedTextSnapshot)
  if (!snapshot) {
    throw new ConsentMedicolegalError(
      'El consentimiento requiere renderedTextSnapshot (texto congelado) al crearse.',
    )
  }
  const professionalRethus = text(input?.professionalRethus)
  if (!professionalRethus) {
    throw new ConsentMedicolegalError(
      'El borrador de consentimiento requiere registro ReTHUS del odontólogo tratante.',
    )
  }
  const professionalId = text(input?.professionalId)
  const professionalName = text(input?.professionalName)
  const professionalDocument = text(input?.professionalDocument)
  if (!professionalId || !professionalName || !professionalDocument) {
    throw new ConsentMedicolegalError(
      'El borrador requiere identificación completa del odontólogo (id, nombre y documento).',
    )
  }
  const templateId = text(input?.templateId)
  if (!templateId) {
    throw new ConsentMedicolegalError('El borrador requiere templateId del procedimiento.')
  }

  return {
    id: text(input?.id) || newConsentId(),
    templateId,
    title: text(input?.title) || templateId,
    renderedTextSnapshot: snapshot,
    status: 'draft',
    textAccepted: false,
    signerRole: input?.signerRole === 'guardian' ? 'guardian' : 'patient',
    guardianName: text(input?.guardianName) || undefined,
    guardianDocument: text(input?.guardianDocument) || undefined,
    guardianRelationship: text(input?.guardianRelationship) || undefined,
    professionalId,
    professionalName,
    professionalDocument,
    professionalRethus,
    createdAt: text(input?.createdAt) || new Date().toISOString(),
  }
}

/**
 * @param {object} input
 */
export function signConsentRecord(input) {
  const base = input?.record
  if (!base || typeof base !== 'object') {
    throw new ConsentMedicolegalError('signConsentRecord requiere un registro borrador.')
  }
  assertConsentMutable(base)

  const textAccepted = input.textAccepted ?? base.textAccepted
  if (textAccepted !== true) {
    throw new ConsentMedicolegalError(
      'Debe aceptarse el texto del consentimiento informado antes de firmar.',
    )
  }

  const patientIsMinor = input.patientIsMinor === true
  const signerRole =
    input.signerRole ?? base.signerRole ?? (patientIsMinor ? 'guardian' : 'patient')
  const guardianName = text(input.guardianName ?? base.guardianName)
  const guardianDocument = text(input.guardianDocument ?? base.guardianDocument)
  const guardianRelationship = text(input.guardianRelationship ?? base.guardianRelationship)

  if (patientIsMinor || signerRole === 'guardian') {
    if (signerRole !== 'guardian') {
      throw new ConsentMedicolegalError(
        'Paciente menor de edad: la firma debe ser del acudiente / representante legal.',
      )
    }
    if (!guardianName || !guardianDocument) {
      throw new ConsentMedicolegalError(
        'Paciente menor de edad: nombre y documento del acudiente son obligatorios.',
      )
    }
  }

  const patientSignatureDataUrl = text(input.patientSignatureDataUrl ?? base.patientSignatureDataUrl)
  const patientSignatureDriveId = text(input.patientSignatureDriveId ?? base.patientSignatureDriveId)
  const professionalSignatureDataUrl = text(
    input.professionalSignatureDataUrl ?? base.professionalSignatureDataUrl,
  )
  const professionalSignatureDriveId = text(
    input.professionalSignatureDriveId ?? base.professionalSignatureDriveId,
  )

  if (!patientSignatureDataUrl && !patientSignatureDriveId) {
    throw new ConsentMedicolegalError(
      'Falta la firma del paciente o del acudiente / representante legal.',
    )
  }
  if (!professionalSignatureDataUrl && !professionalSignatureDriveId) {
    throw new ConsentMedicolegalError('Falta la firma electrónica del odontólogo tratante.')
  }

  const professionalId = text(input.professionalId ?? base.professionalId)
  const professionalName = text(input.professionalName ?? base.professionalName)
  const professionalDocument = text(input.professionalDocument ?? base.professionalDocument)
  const professionalRethus = text(input.professionalRethus ?? base.professionalRethus)

  if (!professionalId || !professionalName || !professionalDocument || !professionalRethus) {
    throw new ConsentMedicolegalError(
      'La firma del odontólogo requiere id, nombre, documento y ReTHUS activos en sesión.',
    )
  }

  const signedAt = text(input.signedAt) || new Date().toISOString()
  const sealedBase = {
    ...base,
    status: 'signed',
    textAccepted: true,
    signerRole,
    guardianName: guardianName || undefined,
    guardianDocument: guardianDocument || undefined,
    guardianRelationship: guardianRelationship || undefined,
    patientSignatureDataUrl: patientSignatureDataUrl || undefined,
    patientSignatureDriveId: patientSignatureDriveId || undefined,
    professionalSignatureDataUrl: professionalSignatureDataUrl || undefined,
    professionalSignatureDriveId: professionalSignatureDriveId || undefined,
    professionalId,
    professionalName,
    professionalDocument,
    professionalRethus,
    signedAt,
    renderedTextSnapshot: base.renderedTextSnapshot,
  }

  return { ...sealedBase, contentHash: computeConsentContentHash(sealedBase) }
}

/**
 * @param {object} input
 */
export function revokeConsentRecord(input) {
  const record = input?.record
  if (!record || typeof record !== 'object') {
    throw new ConsentMedicolegalError('revokeConsentRecord requiere un registro firmado.')
  }
  if (record.status === 'revoked') {
    throw new ConsentMedicolegalError('El consentimiento ya está revocado.')
  }
  if (record.status !== 'signed') {
    throw new ConsentMedicolegalError(
      'Solo un consentimiento firmado puede revocarse. Los borradores se descartan sin revocatoria.',
    )
  }
  if (record.isLegacyUnified) {
    throw new ConsentMedicolegalError(
      'Los consentimientos legado unificados son de solo lectura; no se revocan desde este flujo.',
    )
  }

  const revokedReason = text(input.revokedReason)
  const revokedByUserId = text(input.revokedByUserId)
  if (!revokedReason) {
    throw new ConsentMedicolegalError('La revocatoria exige un motivo escrito (revokedReason).')
  }
  if (!revokedByUserId) {
    throw new ConsentMedicolegalError(
      'La revocatoria exige el profesional que registra el desistimiento (revokedByUserId).',
    )
  }

  return {
    ...record,
    status: 'revoked',
    revokedAt: text(input.revokedAt) || new Date().toISOString(),
    revokedReason,
    revokedByUserId,
    renderedTextSnapshot: record.renderedTextSnapshot,
    patientSignatureDataUrl: record.patientSignatureDataUrl,
    professionalSignatureDataUrl: record.professionalSignatureDataUrl,
    contentHash: record.contentHash,
    signedAt: record.signedAt,
  }
}

/**
 * @param {object} record
 * @param {object} patch
 */
export function patchConsentDraft(record, patch) {
  assertConsentMutable(record)
  return {
    ...record,
    ...patch,
    id: record.id,
    templateId: record.templateId,
    renderedTextSnapshot: record.renderedTextSnapshot,
    status: 'draft',
    professionalId: record.professionalId,
    professionalName: record.professionalName,
    professionalDocument: record.professionalDocument,
    professionalRethus: record.professionalRethus,
    createdAt: record.createdAt,
  }
}

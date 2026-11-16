/**
 * Extrae firmas `data:image/...;base64` del JSON clínico y las sube a
 * Google Drive (scope drive.file, misma cuenta OAuth de la clínica).
 *
 * Campos auditados (el walker es por nombre, no por una lista cerrada):
 * - informedConsent.patientSignatureDataUrl / professionalSignatureDataUrl
 * - treatmentPlanAuthorization.patientSignatureDataUrl / professionalSignatureDataUrl
 * - treatingDentistSignature.signatureDataUrl
 * - evolutionNotes[].professionalSignatureDataUrl (y adendas)
 * - kioskIntakeSignature.patientSignatureDataUrl (habeas data en tableta)
 * - signatureBase64 de kiosk_signatures / patients (respaldo Postgres)
 * - clinicalDraft y valuationDraft repiten el mismo esquema
 * - savedSignatureDataUrl si viaja dentro del payload de sync
 *
 * La evolución no gana firma de paciente: ese campo se sigue eliminando
 * en stripClinicalPayloadEvolutionPatientSignatures antes de persistir.
 *
 * Si Drive no está vinculado o la red falla, el base64 se conserva y
 * el hermano `*Drive.pendingRetry` queda para el siguiente push.
 */
import { isGoogleDriveRequiredError, uploadClinicAttachmentToDrive } from './googleDriveAttachments.service.js'
import { getAuthorizedDriveClient } from './googleDriveOAuth.service.js'
import {
  SIGNATURES_FOLDER_NAME,
  decodeSignatureDataUrlBytes,
  forEachSignatureField,
  imageSha256OfDataUrl,
  isSignatureDataUrl,
  isSignatureDriveRef,
  jsonUtf8Bytes,
  signatureDriveMetaKey,
  signatureProxyUrl,
} from '../../shared/signatureDriveRef.js'

const DEFAULT_BUDGET_MS = 8_000

function driveFailureReason(error) {
  const code = String(error?.code || '')
  if (
    isGoogleDriveRequiredError(error) ||
    code === 'DRIVE_NOT_CONNECTED' ||
    code === 'google_drive_required' ||
    code === 'GOOGLE_OAUTH_NOT_CONFIGURED'
  ) {
    return 'drive_not_connected'
  }
  return 'drive_upload_failed'
}

function markPending(hit, reason) {
  const metaKey = signatureDriveMetaKey(hit.key)
  const prev =
    hit.parent[metaKey] && typeof hit.parent[metaKey] === 'object' && !Array.isArray(hit.parent[metaKey])
      ? hit.parent[metaKey]
      : {}
  hit.parent[metaKey] = {
    ...prev,
    driveFileId: prev.driveFileId || null,
    uploadedAt: null,
    proxyUrl: null,
    storageBackend: 'inline',
    pendingRetry: true,
    pendingReason: reason,
    markedAt: new Date().toISOString(),
  }
}

function safeSegment(value, fallback) {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80)
  return cleaned || fallback
}

async function uploadSignatureBuffer({ clinicId, clinicIdCandidates, hit, seq, uploadSignature }) {
  const decoded = decodeSignatureDataUrlBytes(hit.value)
  if (!decoded) {
    const err = new Error('Firma base64 ilegible.')
    err.code = 'INVALID_SIGNATURE_DATA_URL'
    throw err
  }
  const imageSha256 = imageSha256OfDataUrl(hit.value)
  const mimeType = decoded.mimeType || 'image/png'
  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png'
  const campo = safeSegment(hit.key, 'firma')
  const patient = safeSegment(hit.patientSyncId, 'sin-paciente')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `firma_${patient}_${campo}_${stamp}${seq ? `_${seq}` : ''}.${ext}`
  const buffer = Buffer.from(decoded.bytes)

  const uploaded = uploadSignature
    ? await uploadSignature({
        buffer,
        fileName,
        mimeType,
        patientSyncId: patient,
        fieldKey: hit.key,
        imageSha256,
      })
    : await uploadClinicAttachmentToDrive({
        clinicId,
        clinicIdCandidates,
        patientSyncId: patient,
        fileName,
        mimeType,
        buffer,
        folderSegments: [SIGNATURES_FOLDER_NAME],
        appProperties: {
          kind: 'clinical_signature',
          field: campo,
          imageSha256,
        },
      })

  const driveFileId = String(uploaded?.driveFileId || '').trim()
  if (!driveFileId) {
    const err = new Error('Google Drive no devolvió fileId de la firma.')
    err.code = 'DRIVE_UPLOAD_FAILED'
    throw err
  }
  return {
    driveFileId,
    proxyUrl: signatureProxyUrl(driveFileId, mimeType),
    imageSha256,
    uploadedAt: new Date().toISOString(),
  }
}

/**
 * @param {unknown} payload
 * @param {{
 *   clinicId?: string,
 *   clinicIdCandidates?: string[],
 *   uploadSignature?: (input: object) => Promise<{ driveFileId: string }>,
 *   isDriveConnected?: () => Promise<boolean>,
 *   budgetMs?: number,
 * }} [options]
 */
export async function offloadSignaturesInPayload(payload, options = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const preview = []
  forEachSignatureField(source, (hit) => {
    if (isSignatureDataUrl(hit.value) || isSignatureDriveRef(hit.value)) preview.push(hit.value)
  })
  const bytesBefore = jsonUtf8Bytes(source)
  if (!preview.some((value) => isSignatureDataUrl(value))) {
    const skipped = preview.filter((value) => isSignatureDriveRef(value)).length
    return {
      payload: source,
      migrated: 0,
      pending: 0,
      skipped,
      bytesBefore,
      bytesAfter: bytesBefore,
      bytesSaved: 0,
    }
  }

  const clone = structuredClone(source)
  const targets = []
  forEachSignatureField(clone, (hit) => targets.push(hit))

  let driveReady = null
  let blockedReason = null
  const budgetMs = Number(options.budgetMs) > 0 ? Number(options.budgetMs) : DEFAULT_BUDGET_MS
  const started = Date.now()
  let migrated = 0
  let pending = 0
  let skipped = 0
  let seq = 0

  async function ensureDrive() {
    if (driveReady != null) return driveReady
    if (typeof options.isDriveConnected === 'function') {
      driveReady = Boolean(await options.isDriveConnected())
      if (!driveReady) blockedReason = 'drive_not_connected'
      return driveReady
    }
    const clinicId = String(options.clinicId || '').trim()
    if (!clinicId) {
      driveReady = false
      blockedReason = 'drive_not_connected'
      return false
    }
    try {
      await getAuthorizedDriveClient(clinicId, options.clinicIdCandidates || [])
      driveReady = true
    } catch (error) {
      driveReady = false
      blockedReason = driveFailureReason(error)
    }
    return driveReady
  }

  for (const hit of targets) {
    if (isSignatureDriveRef(hit.value)) {
      skipped += 1
      continue
    }
    if (!isSignatureDataUrl(hit.value)) continue
    // Res. 1995: la evolución no conserva firma de paciente. No se sube a Drive.
    if (hit.path.includes('evolutionNotes') && /patientSignature/i.test(hit.key)) continue

    if (blockedReason || (migrated + pending > 0 && Date.now() - started > budgetMs)) {
      markPending(hit, blockedReason || 'drive_retry_budget')
      pending += 1
      continue
    }

    const connected = await ensureDrive()
    if (!connected) {
      markPending(hit, blockedReason || 'drive_not_connected')
      pending += 1
      continue
    }

    try {
      const stored = await uploadSignatureBuffer({
        clinicId: options.clinicId,
        clinicIdCandidates: options.clinicIdCandidates || [],
        hit,
        seq,
        uploadSignature: options.uploadSignature,
      })
      seq += 1
      hit.parent[hit.key] = stored.proxyUrl
      hit.parent[signatureDriveMetaKey(hit.key)] = {
        driveFileId: stored.driveFileId,
        uploadedAt: stored.uploadedAt,
        proxyUrl: stored.proxyUrl,
        imageSha256: stored.imageSha256,
        storageBackend: 'google_drive',
        pendingRetry: false,
        pendingReason: null,
      }
      migrated += 1
    } catch (error) {
      const reason = driveFailureReason(error)
      if (reason === 'drive_not_connected') blockedReason = reason
      console.warn(
        '[signatures] se conserva base64:',
        error instanceof Error ? error.message : error,
      )
      markPending(hit, reason)
      pending += 1
    }
  }

  const bytesAfter = jsonUtf8Bytes(clone)
  return {
    payload: clone,
    migrated,
    pending,
    skipped,
    bytesBefore,
    bytesAfter,
    bytesSaved: Math.max(0, bytesBefore - bytesAfter),
  }
}

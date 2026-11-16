import { db } from '@/db/database'
import { logAuditEvent } from '@/services/auditService'
import {
  deleteDiagnosticAidBlob,
  saveDiagnosticAidBlob,
  saveDiagnosticAidBlobFromBuffer,
} from '@/services/diagnosticAidBlobStore'
import { uploadDiagnosticAidToGoogleDrive } from '@/services/diagnosticAidDriveUpload'
import { ensureLocalDiagnosticAidBlob } from '@/services/diagnosticAidRemoteStore'
import { getCurrentClinicId, notifyClinicalRecordDirty } from '@/services/clinicalSyncState'
import { enqueueDiagnosticAidForSync, resolvePatientSyncId } from '@/services/syncQueueService'
import type { UserProfile } from '@/types/user'
import type { DiagnosticAid, DiagnosticAidFileType } from '@/types/diagnosticAid'
import { getDesktopBridge, isDesktopApp } from '@/types/desktopBridge'
import { generateId } from '@/utils/crypto'
import { getPatientByRouteId, toDexiePrimaryKey } from '@/utils/patientId'
import {
  hasLocalDiskPath,
  inferDiagnosticAidFileTypeFromName,
  isBrowserStoredDiagnosticAid,
  mimeTypeForDiagnosticFile,
} from '@/utils/diagnosticAidWebClassification'
import {
  getDiagnosticAidOpenerPreference,
  saveDiagnosticAidOpenerPreference,
  type DiagnosticAidOpenerPreference,
} from '@/utils/diagnosticAidOpenerPreferences'

const CHUNK_SIZE_BYTES = 4 * 1024 * 1024

export interface OpenDiagnosticFileOptions {
  /** Ruta absoluta del ejecutable. Si no se indica, usa el programa guardado para el tipo o el predeterminado del SO. */
  programPath?: string
  programName?: string
  /** Si es true, abre el diálogo nativo para elegir programa antes de abrir. */
  pickProgram?: boolean
  /** Guardar el programa elegido como predeterminado para este tipo de archivo. */
  rememberProgram?: boolean
}

export interface OpenDiagnosticFileResult {
  ok: boolean
  message: string
  programName?: string
}

export interface PickApplicationProgramResult {
  ok: boolean
  preference: DiagnosticAidOpenerPreference | null
  message: string
}

export interface RegisterDiagnosticAidInput {
  patientId: string
  encounterId: string
  absolutePath: string
  fileName: string
  fileType?: DiagnosticAidFileType
  comments?: string
  /** Fecha/hora de recepción del estudio (ISO). Por defecto, ahora. */
  receivedAt?: string
  user?: UserProfile | null
}

/** Infiere el tipo de archivo a partir de la extensión. */
export function inferDiagnosticAidFileType(fileName: string): DiagnosticAidFileType {
  return inferDiagnosticAidFileTypeFromName(fileName)
}

/**
 * Calcula SHA-256 del archivo.
 * - Electron: lectura por streaming en el proceso principal (sin cargar en memoria del renderer).
 * - Navegador: digest sobre el File (adecuado para archivos clínicos habituales).
 */
export async function generateFileHash(source: File | string): Promise<string> {
  const bridge = getDesktopBridge()

  if (typeof source === 'string') {
    if (bridge?.isElectron) {
      return bridge.generateFileHash(source)
    }
    throw new Error('La ruta absoluta solo puede hashearse en la aplicación de escritorio.')
  }

  const fileWithPath = source as File & { path?: string }
  if (bridge?.isElectron && fileWithPath.path) {
    return bridge.generateFileHash(fileWithPath.path)
  }

  return generateFileHashFromBrowserFile(source)
}

async function generateFileHashFromBrowserFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await readFileInChunks(file))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Lee el archivo en fragmentos y concatena en un solo ArrayBuffer para el digest. */
async function readFileInChunks(file: File): Promise<ArrayBuffer> {
  if (file.size <= CHUNK_SIZE_BYTES) {
    return file.arrayBuffer()
  }

  const chunks: Uint8Array[] = []
  let offset = 0
  while (offset < file.size) {
    const slice = file.slice(offset, offset + CHUNK_SIZE_BYTES)
    chunks.push(new Uint8Array(await slice.arrayBuffer()))
    offset += CHUNK_SIZE_BYTES
  }

  const merged = new Uint8Array(file.size)
  let position = 0
  for (const chunk of chunks) {
    merged.set(chunk, position)
    position += chunk.length
  }
  return merged.buffer
}

function rememberLookupKey(keys: Array<string | number>, key: string | number): void {
  if (key == null || key === '') return
  if (!keys.some((existing) => existing === key)) keys.push(key)
}

/**
 * Lectura pura para useLiveQuery. Sin import() dinámico ni escrituras:
 * Dexie aborta un liveQuery que hace update/delete (ReadOnly) y la lista se queda en [].
 * IndexedDB no trata iguales "123" y 123.
 */
async function patientIdLookupKeys(patientId: string): Promise<Array<string | number>> {
  const keys: Array<string | number> = []
  const raw = String(patientId || '').trim()
  rememberLookupKey(keys, raw)
  const numeric = toDexiePrimaryKey(raw)
  if (typeof numeric === 'number') rememberLookupKey(keys, numeric)

  const patient = await getPatientByRouteId(raw)
  if (patient?.id != null) {
    rememberLookupKey(keys, String(patient.id))
    if (typeof patient.id === 'number') rememberLookupKey(keys, patient.id)
  }
  if (patient?.syncId) rememberLookupKey(keys, String(patient.syncId))
  return keys
}

function sortDiagnosticAids(rows: DiagnosticAid[]): DiagnosticAid[] {
  return [...rows].sort((a, b) => {
    const dateA = new Date(a.receivedAt ?? a.createdAt).getTime()
    const dateB = new Date(b.receivedAt ?? b.createdAt).getTime()
    return dateB - dateA
  })
}

export async function listDiagnosticAids(
  patientId: string,
  encounterId?: string,
): Promise<DiagnosticAid[]> {
  const keys = await patientIdLookupKeys(patientId)
  const byId = new Map<string, DiagnosticAid>()

  for (const key of keys) {
    const rows = encounterId
      ? await db.diagnosticAids.where('[patientId+encounterId]').equals([key, encounterId]).toArray()
      : await db.diagnosticAids.where('patientId').equals(key).toArray()
    for (const row of rows) byId.set(String(row.id), row)
  }

  // Huérfanos: misma lectura, sin reescribir patientId (eso lo hace el mantenimiento).
  const patient = await getPatientByRouteId(String(patientId || '').trim())
  const syncId = String(patient?.syncId || '').trim()
  if (syncId) {
    const orphans = await db.diagnosticAids
      .filter((row) => String(row.patientSyncId || '') === syncId)
      .toArray()
    for (const row of orphans) {
      const rid = String(row.id)
      if (byId.has(rid)) continue
      if (encounterId && String(row.encounterId || '') !== String(encounterId)) continue
      byId.set(rid, row)
    }
  }

  let tombIds = new Set<string>()
  try {
    const tombs = await db.deletedDiagnosticAids.toArray()
    tombIds = new Set(
      tombs.map((tomb) => String(tomb.id || '').trim()).filter(Boolean),
    )
  } catch {
    tombIds = new Set()
  }

  return sortDiagnosticAids(
    [...byId.values()].filter((row) => !tombIds.has(String(row.id))),
  )
}

/**
 * Reparación fuera del liveQuery: reetiqueta huérfanos y quita filas cuya tumba
 * ya existe. No llamarla desde listDiagnosticAids.
 */
export async function maintainDiagnosticAidRecords(patientId: string): Promise<void> {
  const patient = await getPatientByRouteId(String(patientId || '').trim())
  const syncId = String(patient?.syncId || '').trim()
  const localId = patient?.id != null ? String(patient.id) : ''
  if (syncId && localId) {
    const orphans = await db.diagnosticAids
      .filter((row) => String(row.patientSyncId || '') === syncId)
      .toArray()
    for (const row of orphans) {
      if (String(row.patientId) === localId) continue
      await db.diagnosticAids.update(row.id, { patientId: localId })
    }
  }

  try {
    const tombs = await db.deletedDiagnosticAids.toArray()
    for (const tomb of tombs) {
      const tid = String(tomb.id || '').trim()
      if (!tid) continue
      const row = await db.diagnosticAids.get(tid)
      if (row) await db.diagnosticAids.delete(tid)
    }
  } catch {
    // Bases anteriores a la tabla de tumbas.
  }
}

async function forgetDiagnosticAidTombstone(id: string): Promise<void> {
  try {
    await db.deletedDiagnosticAids.delete(id)
  } catch {
    // Sin tabla de tumbas.
  }
}

export async function listDiagnosticAidsForPatient(patientId: string): Promise<DiagnosticAid[]> {
  return listDiagnosticAids(patientId)
}

export async function registerDiagnosticAid(
  input: RegisterDiagnosticAidInput,
): Promise<DiagnosticAid> {
  const fileHash = await generateFileHash(input.absolutePath)
  const entryId = generateId()
  const bridge = getDesktopBridge()
  let blobId: string | null = null
  if (bridge?.readFileBytes) {
    try {
      const data = await bridge.readFileBytes(input.absolutePath)
      blobId = await saveDiagnosticAidBlobFromBuffer(entryId, {
        fileName: input.fileName,
        mimeType: mimeTypeForDiagnosticFile(input.fileName),
        data,
      })
    } catch {
      blobId = null
    }
  }
  const entry: DiagnosticAid = {
    id: entryId,
    patientId: input.patientId,
    encounterId: input.encounterId,
    fileType: input.fileType ?? inferDiagnosticAidFileType(input.fileName),
    fileName: input.fileName,
    absolutePath: input.absolutePath,
    blobId,
    fileHash,
    createdAt: new Date().toISOString(),
    receivedAt: input.receivedAt?.trim() || new Date().toISOString(),
    comments: input.comments?.trim() ?? '',
    patientSyncId: await resolvePatientSyncId(input.patientId),
    clinicId: getCurrentClinicId() || undefined,
    storageBackend: blobId ? 'indexeddb' : 'disk',
    driveUploadStatus: blobId ? 'pending' : 'local_only',
  }

  await forgetDiagnosticAidTombstone(entry.id)
  await db.diagnosticAids.add(entry)
  await enqueueDiagnosticAidForSync(entry)

  await logAuditEvent({
    action: 'UPLOAD_DIAGNOSTIC_AID',
    resourceType: 'diagnostic_aid',
    resourceId: entry.id,
    details: `${entry.fileName} (${entry.fileType}) — paciente ${input.patientId}`,
    success: true,
    user: input.user ?? null,
  })

  if (blobId) {
    return uploadDiagnosticAidToGoogleDrive(entry)
  }
  return entry
}

export async function registerDiagnosticAidFromBrowserFile(
  file: File,
  input: Omit<RegisterDiagnosticAidInput, 'absolutePath' | 'fileName'>,
): Promise<DiagnosticAid> {
  const bridge = getDesktopBridge()
  const fileWithPath = file as File & { path?: string }
  const entryId = generateId()

  let absolutePath = fileWithPath.path?.trim() ?? ''
  let blobId: string | null = null

  if (!absolutePath && bridge?.isElectron) {
    throw new Error('No se pudo obtener la ruta absoluta del archivo seleccionado.')
  }

  if (!absolutePath) {
    absolutePath = `[navegador]/${file.name}`
    blobId = await saveDiagnosticAidBlob(entryId, file)
  } else if (bridge?.readFileBytes) {
    try {
      const data = await bridge.readFileBytes(absolutePath)
      blobId = await saveDiagnosticAidBlobFromBuffer(entryId, {
        fileName: file.name,
        mimeType: file.type || mimeTypeForDiagnosticFile(file.name),
        data,
      })
    } catch {
      blobId = null
    }
  }

  const fileHash = await generateFileHash(
    bridge?.isElectron && fileWithPath.path ? fileWithPath.path : file,
  )

  const entry: DiagnosticAid = {
    id: entryId,
    patientId: input.patientId,
    encounterId: input.encounterId,
    fileType: input.fileType ?? inferDiagnosticAidFileType(file.name),
    fileName: file.name,
    absolutePath,
    blobId,
    fileHash,
    createdAt: new Date().toISOString(),
    receivedAt: input.receivedAt?.trim() || new Date().toISOString(),
    comments: input.comments?.trim() ?? '',
    patientSyncId: await resolvePatientSyncId(input.patientId),
    clinicId: getCurrentClinicId() || undefined,
    storageBackend: blobId ? 'indexeddb' : absolutePath.startsWith('[navegador]/') ? 'indexeddb' : 'disk',
    driveUploadStatus: blobId ? 'pending' : 'local_only',
  }

  await forgetDiagnosticAidTombstone(entry.id)
  await db.diagnosticAids.add(entry)
  await enqueueDiagnosticAidForSync(entry)

  await logAuditEvent({
    action: 'UPLOAD_DIAGNOSTIC_AID',
    resourceType: 'diagnostic_aid',
    resourceId: entry.id,
    details: `${entry.fileName} (${entry.fileType}) — paciente ${input.patientId}`,
    success: true,
    user: input.user ?? null,
  })

  if (blobId) {
    return uploadDiagnosticAidToGoogleDrive(entry)
  }
  return entry
}

async function pathExists(absolutePath: string): Promise<boolean> {
  const bridge = getDesktopBridge()
  if (bridge?.isElectron) {
    return bridge.fileExists(absolutePath)
  }
  return !absolutePath.startsWith('[navegador]/')
}

export function shouldOpenDiagnosticAidWithWebMenu(entry: DiagnosticAid): boolean {
  if (!isDesktopApp()) return true
  return isBrowserStoredDiagnosticAid(entry)
}

export async function pickDiagnosticApplicationProgram(): Promise<PickApplicationProgramResult> {
  const bridge = getDesktopBridge()
  if (!bridge?.isElectron) {
    return {
      ok: false,
      preference: null,
      message: 'La selección de programas requiere la aplicación de escritorio.',
    }
  }

  const picked = await bridge.pickApplicationProgram()
  if (!picked) {
    return { ok: false, preference: null, message: 'Selección cancelada.' }
  }

  return {
    ok: true,
    preference: {
      programPath: picked.absolutePath,
      programName: picked.displayName,
    },
    message: `Programa seleccionado: ${picked.displayName}`,
  }
}

/**
 * Abre el archivo con el programa indicado, el guardado para su tipo, o el predeterminado del SO.
 * Registra la apertura en `auditLogs` (trazabilidad médica Colombia).
 */
export async function openDiagnosticFile(
  id: string,
  user?: UserProfile | null,
  options: OpenDiagnosticFileOptions = {},
): Promise<OpenDiagnosticFileResult> {
  const entry = await db.diagnosticAids.get(id)
  if (!entry) {
    return { ok: false, message: 'El registro del archivo no existe en la base de datos.' }
  }

  if (shouldOpenDiagnosticAidWithWebMenu(entry)) {
    await ensureLocalDiagnosticAidBlob(entry)
    return {
      ok: false,
      message: 'Use el menú de apertura web para este archivo.',
    }
  }

  if (!hasLocalDiskPath(entry)) {
    const restored = await ensureLocalDiagnosticAidBlob(entry)
    if (restored) {
      return {
        ok: false,
        message: 'Use el menú de apertura web para este archivo.',
      }
    }
    return {
      ok: false,
      message: 'No se pudo descargar el archivo desde el servidor de la clínica. Reintente con conexión.',
    }
  }

  const exists = await pathExists(entry.absolutePath)
  if (!exists) {
    const restored = await ensureLocalDiagnosticAidBlob(entry)
    if (restored) {
      return {
        ok: false,
        message: 'Use el menú de apertura web para este archivo.',
      }
    }
    const message =
      'No se pudo descargar el archivo desde el servidor de la clínica. Reintente con conexión.'
    await logAuditEvent({
      action: 'OPEN_DIAGNOSTIC_AID',
      resourceType: 'diagnostic_aid',
      resourceId: entry.id,
      details: `Ruta no encontrada: ${entry.absolutePath}`,
      success: false,
      user: user ?? null,
    })
    return { ok: false, message }
  }

  const bridge = getDesktopBridge()
  if (!bridge?.isElectron) {
    return { ok: false, message: 'La apertura nativa requiere la aplicación de escritorio.' }
  }

  let program: DiagnosticAidOpenerPreference | null = null

  if (options.pickProgram) {
    const picked = await pickDiagnosticApplicationProgram()
    if (!picked.ok || !picked.preference) {
      return { ok: false, message: picked.message }
    }
    program = picked.preference
    if (options.rememberProgram !== false) {
      saveDiagnosticAidOpenerPreference(entry.fileType, program)
    }
  } else if (options.programPath) {
    program = {
      programPath: options.programPath,
      programName: options.programName ?? options.programPath,
    }
  } else {
    program = getDiagnosticAidOpenerPreference(entry.fileType)
  }

  const openError = program
    ? await bridge.openPathWithProgram(entry.absolutePath, program.programPath)
    : await bridge.openPath(entry.absolutePath)
  const success = !openError
  const programLabel = program?.programName ?? 'aplicación predeterminada del sistema'

  await logAuditEvent({
    action: 'OPEN_DIAGNOSTIC_AID',
    resourceType: 'diagnostic_aid',
    resourceId: entry.id,
    details: success
      ? `${entry.fileName} — ${programLabel} — ${entry.absolutePath}`
      : `Error al abrir (${programLabel}): ${openError}`,
    success,
    user: user ?? null,
  })

  if (!success) {
    return {
      ok: false,
      message:
        openError ||
        `No se pudo abrir el archivo con ${programLabel}. Verifique que el programa esté instalado.`,
    }
  }

  return {
    ok: true,
    message: `Abriendo ${entry.fileName} con ${programLabel}…`,
    programName: programLabel,
  }
}

export async function updateDiagnosticAidComments(
  id: string,
  comments: string,
): Promise<void> {
  await db.diagnosticAids.update(id, { comments: comments.trim() })
}

export async function updateDiagnosticAidReceivedAt(
  id: string,
  receivedAt: string,
): Promise<void> {
  const value = receivedAt.trim()
  if (!value) return
  await db.diagnosticAids.update(id, { receivedAt: value })
}

export async function deleteDiagnosticAid(id: string, user?: UserProfile | null): Promise<void> {
  const aidId = String(id || '').trim()
  if (!aidId) {
    throw new Error('No se pudo identificar el examen a eliminar.')
  }

  const entry =
    (await db.diagnosticAids.get(aidId)) ||
    (await db.diagnosticAids.filter((row) => String(row.id) === aidId).first())

  const deletedAt = new Date().toISOString()
  const clinicId =
    entry?.clinicId || getCurrentClinicId() || undefined
  const fileName = entry?.fileName || 'examen'

  // 1) Binario local (best-effort).
  try {
    await deleteDiagnosticAidBlob(aidId)
  } catch {
    // Continuar: lo crítico es quitar la fila y registrar tumba.
  }

  // 2) Borrar fila + tumba + cola DELETE. Pasos separados: una tabla rota no anula el resto.
  try {
    await db.diagnosticAids.delete(aidId)
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `No se pudo quitar el examen de IndexedDB: ${error.message}`
        : 'No se pudo quitar el examen de IndexedDB.',
    )
  }

  try {
    await db.deletedDiagnosticAids.put({
      id: aidId,
      clinicId,
      fileName,
      deletedAt,
      explicitDelete: true,
      deletedBy: String(user?.email || user?.id || ''),
    })
  } catch (error) {
    console.warn('[diagnosticAid] No se pudo guardar tumba local:', error)
  }

  try {
    const existing = await db.syncQueue.where('aidId').equals(aidId).first()
    const queueItem = {
      id: existing?.id || generateId(),
      entityType: 'diagnostic_aid' as const,
      action: 'DELETE' as const,
      status: 'pending' as const,
      patientId: String(entry?.patientId || ''),
      encounterId: String(entry?.encounterId || ''),
      patientSyncId: entry?.patientSyncId,
      aidId,
      blobId: null as string | null,
      fileName,
      fileHash: entry?.fileHash || '',
      mimeType: mimeTypeForDiagnosticFile(fileName),
      absolutePath: entry?.absolutePath || '',
      clinicId,
      driveFileId: entry?.driveFileId ?? null,
      webViewLink: entry?.webViewLink ?? null,
      binarySynced: true,
      explicitDelete: true,
      deletedBy: String(user?.email || user?.id || ''),
      createdAt: existing?.createdAt || deletedAt,
      updatedAt: deletedAt,
    }
    if (existing?.id) await db.syncQueue.put({ ...existing, ...queueItem })
    else await db.syncQueue.add(queueItem)
  } catch (error) {
    console.warn('[diagnosticAid] No se pudo encolar DELETE:', error)
  }

  const stillThere = await db.diagnosticAids.get(aidId)
  if (stillThere) {
    throw new Error('El examen sigue en el expediente local tras intentar eliminarlo. Recargue e intente de nuevo.')
  }

  notifyClinicalRecordDirty()

  // 3) Sync en segundo plano: no bloquear el botón Quitar (antes esperaba hasta 36s).
  void import('@/services/clinicalSyncService')
    .then(({ runClinicalSyncCycle }) => runClinicalSyncCycle())
    .catch(() => undefined)

  await logAuditEvent({
    action: 'DELETE_DIAGNOSTIC_AID',
    resourceType: 'diagnostic_aid',
    resourceId: aidId,
    details: fileName,
    success: true,
    user: user ?? null,
  })
}

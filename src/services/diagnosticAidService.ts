import { db } from '@/db/database'
import { logAuditEvent } from '@/services/auditService'
import {
  deleteDiagnosticAidBlob,
  saveDiagnosticAidBlob,
} from '@/services/diagnosticAidBlobStore'
import type { UserProfile } from '@/types/user'
import type { DiagnosticAid, DiagnosticAidFileType } from '@/types/diagnosticAid'
import { getDesktopBridge, isDesktopApp } from '@/types/desktopBridge'
import { generateId } from '@/utils/crypto'
import {
  hasLocalDiskPath,
  inferDiagnosticAidFileTypeFromName,
  isBrowserStoredDiagnosticAid,
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

export async function listDiagnosticAids(
  patientId: string,
  encounterId?: string,
): Promise<DiagnosticAid[]> {
  const items = encounterId
    ? await db.diagnosticAids.where('[patientId+encounterId]').equals([patientId, encounterId]).toArray()
    : await db.diagnosticAids.where('patientId').equals(patientId).toArray()

  return items.sort((a, b) => {
    const dateA = new Date(a.receivedAt ?? a.createdAt).getTime()
    const dateB = new Date(b.receivedAt ?? b.createdAt).getTime()
    return dateB - dateA
  })
}

export async function listDiagnosticAidsForPatient(patientId: string): Promise<DiagnosticAid[]> {
  return listDiagnosticAids(patientId)
}

export async function registerDiagnosticAid(
  input: RegisterDiagnosticAidInput,
): Promise<DiagnosticAid> {
  const fileHash = await generateFileHash(input.absolutePath)
  const entry: DiagnosticAid = {
    id: generateId(),
    patientId: input.patientId,
    encounterId: input.encounterId,
    fileType: input.fileType ?? inferDiagnosticAidFileType(input.fileName),
    fileName: input.fileName,
    absolutePath: input.absolutePath,
    fileHash,
    createdAt: new Date().toISOString(),
    receivedAt: input.receivedAt?.trim() || new Date().toISOString(),
    comments: input.comments?.trim() ?? '',
  }

  await db.diagnosticAids.add(entry)

  await logAuditEvent({
    action: 'UPLOAD_DIAGNOSTIC_AID',
    resourceType: 'diagnostic_aid',
    resourceId: entry.id,
    details: `${entry.fileName} (${entry.fileType}) — paciente ${input.patientId}`,
    success: true,
    user: input.user ?? null,
  })

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
  }

  await db.diagnosticAids.add(entry)

  await logAuditEvent({
    action: 'UPLOAD_DIAGNOSTIC_AID',
    resourceType: 'diagnostic_aid',
    resourceId: entry.id,
    details: `${entry.fileName} (${entry.fileType}) — paciente ${input.patientId}`,
    success: true,
    user: input.user ?? null,
  })

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
    return {
      ok: false,
      message: 'Use el menú de apertura web para este archivo.',
    }
  }

  if (!hasLocalDiskPath(entry)) {
    return {
      ok: false,
      message: 'Este archivo no tiene ruta de disco local disponible.',
    }
  }

  const exists = await pathExists(entry.absolutePath)
  if (!exists) {
    const message =
      'El archivo ya no existe en la ruta registrada. Verifique que el disco o carpeta de red esté disponible.'
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
  const entry = await db.diagnosticAids.get(id)
  if (!entry) return
  await deleteDiagnosticAidBlob(id)
  await db.diagnosticAids.delete(id)
  await logAuditEvent({
    action: 'DELETE_DIAGNOSTIC_AID',
    resourceType: 'diagnostic_aid',
    resourceId: id,
    details: entry.fileName,
    success: true,
    user: user ?? null,
  })
}

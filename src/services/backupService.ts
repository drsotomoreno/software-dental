import { db, withBackupRestoreUnlock } from '@/db/database'
import { APP_NAME, APP_SHORT_NAME } from '@/constants/branding'
import type {
  BackupPayload,
  BackupSettings,
  EncryptedBackupFile,
} from '@/types/backup'
import {
  BACKUP_FORMAT,
  BACKUP_REMINDER_DAYS,
  BACKUP_SETTINGS_CHANGED_EVENT,
  BACKUP_SETTINGS_KEY,
  BACKUP_VERSION,
  DEFAULT_BACKUP_SETTINGS,
  PLAIN_BACKUP_KIND,
  SCHEDULED_PASSPHRASE_KEY,
  WORKDAY_END_HOUR,
} from '@/types/backup'
import { decryptBackupData, encryptBackupData } from '@/utils/backupCrypto'
import { saveBillingModalitySettings } from '@/services/billingModalityService'
import { CLINIC_BILLING_SETTINGS_ID } from '@/types/billingModality'

export type BackupReminderReason = 'never' | 'stale' | 'end_of_day'

export type ParsedBackupInput =
  | { kind: 'encrypted'; file: EncryptedBackupFile }
  | { kind: 'plain'; payload: BackupPayload }

interface SerializedDiagnosticAidBlob {
  id: string
  aidId: string
  fileName: string
  mimeType: string
  dataBase64: string
  createdAt: string
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function serializeDiagnosticAidBlobs(rows: unknown[]): SerializedDiagnosticAidBlob[] {
  return rows.map((row) => {
    const blob = row as {
      id: string
      aidId: string
      fileName: string
      mimeType: string
      data?: ArrayBuffer
      dataBase64?: string
      createdAt: string
    }
    const dataBase64 =
      blob.dataBase64 ??
      (blob.data instanceof ArrayBuffer ? arrayBufferToBase64(blob.data) : '')
    return {
      id: blob.id,
      aidId: blob.aidId,
      fileName: blob.fileName,
      mimeType: blob.mimeType,
      dataBase64,
      createdAt: blob.createdAt,
    }
  })
}

function deserializeDiagnosticAidBlobs(rows: unknown[] | undefined): unknown[] {
  if (!rows?.length) return []
  return rows.map((row) => {
    const blob = row as SerializedDiagnosticAidBlob & { data?: ArrayBuffer }
    if (blob.data instanceof ArrayBuffer) return blob
    if (typeof blob.dataBase64 === 'string' && blob.dataBase64.length > 0) {
      return {
        id: blob.id,
        aidId: blob.aidId,
        fileName: blob.fileName,
        mimeType: blob.mimeType,
        data: base64ToArrayBuffer(blob.dataBase64),
        createdAt: blob.createdAt,
      }
    }
    return blob
  })
}

function notifyBackupSettingsChanged(): void {
  window.dispatchEvent(new Event(BACKUP_SETTINGS_CHANGED_EVENT))
}

export function getBackupSettings(): BackupSettings {
  try {
    const raw = localStorage.getItem(BACKUP_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_BACKUP_SETTINGS }
    return { ...DEFAULT_BACKUP_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_BACKUP_SETTINGS }
  }
}

export function saveBackupSettings(settings: BackupSettings): void {
  localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify(settings))
  notifyBackupSettingsChanged()
}

export function setScheduledPassphrase(passphrase: string): void {
  localStorage.setItem(SCHEDULED_PASSPHRASE_KEY, passphrase)
}

export function getScheduledPassphrase(): string | null {
  return localStorage.getItem(SCHEDULED_PASSPHRASE_KEY)
}

export function clearScheduledPassphrase(): void {
  localStorage.removeItem(SCHEDULED_PASSPHRASE_KEY)
}

export function markBackupCompleted(userId: string | null): void {
  const settings = getBackupSettings()
  saveBackupSettings({
    ...settings,
    lastBackupAt: new Date().toISOString(),
    lastBackupBy: userId,
    reminderDismissedAt: null,
  })
}

export function dismissBackupReminder(): void {
  const settings = getBackupSettings()
  saveBackupSettings({
    ...settings,
    reminderDismissedAt: new Date().toISOString(),
  })
}

export function isBackupOverdue(settings: BackupSettings = getBackupSettings()): boolean {
  if (!settings.lastBackupAt) return true
  const hoursSince =
    (Date.now() - new Date(settings.lastBackupAt).getTime()) / (1000 * 60 * 60)
  return hoursSince >= settings.autoBackupIntervalHours
}

function isSameLocalDay(iso: string, now: Date): boolean {
  const date = new Date(iso)
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

export function getBackupReminderReason(
  settings: BackupSettings = getBackupSettings(),
  now: Date = new Date(),
): BackupReminderReason | null {
  if (settings.reminderDismissedAt && isSameLocalDay(settings.reminderDismissedAt, now)) {
    return null
  }
  if (!settings.lastBackupAt) return 'never'
  const daysSince =
    (now.getTime() - new Date(settings.lastBackupAt).getTime()) / (1000 * 60 * 60 * 24)
  if (daysSince >= BACKUP_REMINDER_DAYS) return 'stale'
  if (now.getHours() >= WORKDAY_END_HOUR && !isSameLocalDay(settings.lastBackupAt, now)) {
    return 'end_of_day'
  }
  return null
}

export function isBackupReminderDue(
  settings: BackupSettings = getBackupSettings(),
  now: Date = new Date(),
): boolean {
  return getBackupReminderReason(settings, now) !== null
}

export function buildPlainBackupFilename(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `backup_historias_${year}-${month}-${day}.json`
}

export async function collectBackupPayload(exportedBy: string | null): Promise<BackupPayload> {
  const [
    patients,
    odontograms,
    clinicalRecords,
    signatures,
    appointments,
    scheduleColumns,
    scheduleBlocks,
    users,
    prices,
    userCredentials,
    auditLogs,
    clinicalAddendums,
    catalogMeta,
    catalogItems,
    diagnosticAids,
    diagnosticAidBlobs,
    dentalServices,
    dentalServiceSpecialties,
    professionals,
    dentalServicePrices,
    patientClinicalDrafts,
    electronicInvoices,
    electronicCreditNotes,
    evolutionNoteAddendums,
    syncOutbox,
    clinicBillingSettings,
  ] = await Promise.all([
    db.patients.toArray(),
    db.odontograms.toArray(),
    db.clinicalRecords.toArray(),
    db.signatures.toArray(),
    db.appointments.toArray(),
    db.scheduleColumns.toArray(),
    db.scheduleBlocks.toArray(),
    db.users.toArray(),
    db.prices.toArray(),
    db.userCredentials.toArray(),
    db.auditLogs.toArray(),
    db.clinicalAddendums.toArray(),
    db.catalogMeta.toArray(),
    db.catalogItems.toArray(),
    db.diagnosticAids.toArray(),
    db.diagnosticAidBlobs.toArray(),
    db.dentalServices.toArray(),
    db.dentalServiceSpecialties.toArray(),
    db.professionals.toArray(),
    db.dentalServicePrices.toArray(),
    db.patientClinicalDrafts.toArray(),
    db.electronicInvoices.toArray(),
    db.electronicCreditNotes.toArray(),
    db.evolutionNoteAddendums.toArray(),
    db.syncOutbox.toArray(),
    db.clinicBillingSettings.toArray(),
  ])

  return {
    format: BACKUP_FORMAT,
    kind: PLAIN_BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy,
    data: {
      patients,
      odontograms,
      clinicalRecords,
      signatures,
      appointments,
      scheduleColumns,
      scheduleBlocks,
      users,
      prices,
      userCredentials,
      auditLogs,
      clinicalAddendums,
      catalogMeta,
      catalogItems,
      diagnosticAids,
      diagnosticAidBlobs: serializeDiagnosticAidBlobs(diagnosticAidBlobs),
      dentalServices,
      dentalServiceSpecialties,
      professionals,
      dentalServicePrices,
      patientClinicalDrafts,
      electronicInvoices,
      electronicCreditNotes,
      evolutionNoteAddendums,
      syncOutbox,
      clinicBillingSettings,
    },
  }
}

export function downloadJsonFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function downloadPlainBackup(payload: BackupPayload): void {
  const exportedAt = new Date(payload.exportedAt)
  const filename = Number.isNaN(exportedAt.getTime())
    ? buildPlainBackupFilename()
    : buildPlainBackupFilename(exportedAt)
  downloadJsonFile(filename, JSON.stringify(payload, null, 2))
}

export async function exportAndDownloadPlainBackup(
  exportedBy: string | null,
): Promise<BackupPayload> {
  const payload = await collectBackupPayload(exportedBy)
  downloadPlainBackup(payload)
  markBackupCompleted(exportedBy)
  return payload
}

export async function createEncryptedBackup(
  password: string,
  exportedBy: string | null,
): Promise<EncryptedBackupFile> {
  const payload = await collectBackupPayload(exportedBy)
  const plaintext = JSON.stringify(payload)
  const encrypted = await encryptBackupData(plaintext, password)

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: payload.exportedAt,
    algorithm: 'AES-GCM-PBKDF2',
    ...encrypted,
  }
}

export function downloadBackupFile(file: EncryptedBackupFile): void {
  const date = file.exportedAt.slice(0, 10)
  downloadJsonFile(
    `${APP_SHORT_NAME}_respaldo_${date}.dentalbak.json`,
    JSON.stringify(file, null, 2),
  )
}

export async function parseBackupFile(file: File): Promise<EncryptedBackupFile> {
  const parsed = await parseBackupInput(file)
  if (parsed.kind !== 'encrypted') {
    throw new Error('El archivo no es un respaldo cifrado.')
  }
  return parsed.file
}

export async function parseBackupInput(file: File): Promise<ParsedBackupInput> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('El archivo no es un JSON válido.')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`El archivo no es un respaldo válido de ${APP_NAME}.`)
  }

  const record = parsed as Record<string, unknown>
  if (record.format !== BACKUP_FORMAT) {
    throw new Error(`El archivo no es un respaldo válido de ${APP_NAME}.`)
  }

  if (record.algorithm === 'AES-GCM-PBKDF2' && typeof record.ciphertext === 'string') {
    return { kind: 'encrypted', file: record as unknown as EncryptedBackupFile }
  }

  if (record.data && typeof record.data === 'object') {
    return { kind: 'plain', payload: record as unknown as BackupPayload }
  }

  throw new Error(`El archivo no es un respaldo válido de ${APP_NAME}.`)
}

export async function decryptBackupFile(
  file: EncryptedBackupFile,
  password: string,
): Promise<BackupPayload> {
  const plaintext = await decryptBackupData(file.salt, file.iv, file.ciphertext, password)
  const payload = JSON.parse(plaintext) as BackupPayload
  if (payload.format !== BACKUP_FORMAT) {
    throw new Error('El contenido del respaldo no es válido.')
  }
  return payload
}

function asRows(value: unknown[] | undefined): unknown[] {
  return Array.isArray(value) ? value : []
}

async function bulkPutIfAny(
  table: { bulkPut: (rows: never[]) => Promise<unknown> },
  rows: unknown[] | undefined,
): Promise<void> {
  if (!rows?.length) return
  await table.bulkPut(rows as never[])
}

export async function restoreBackupPayload(payload: BackupPayload): Promise<void> {
  if (!payload?.data || !Array.isArray(payload.data.patients)) {
    throw new Error('El respaldo no contiene datos de pacientes válidos.')
  }

  const tables = [
    db.patients,
    db.odontograms,
    db.clinicalRecords,
    db.signatures,
    db.appointments,
    db.scheduleColumns,
    db.scheduleBlocks,
    db.users,
    db.prices,
    db.userCredentials,
    db.auditLogs,
    db.sessions,
    db.clinicalAddendums,
    db.catalogMeta,
    db.catalogItems,
    db.diagnosticAids,
    db.diagnosticAidBlobs,
    db.dentalServices,
    db.dentalServiceSpecialties,
    db.professionals,
    db.dentalServicePrices,
    db.patientClinicalDrafts,
    db.electronicInvoices,
    db.electronicCreditNotes,
    db.evolutionNoteAddendums,
    db.syncOutbox,
    db.clinicBillingSettings,
  ] as const

  await withBackupRestoreUnlock(async () => {
    await db.transaction('rw', tables, async () => {
      await Promise.all(tables.map((table) => table.clear()))

      const { data } = payload
      await Promise.all([
        bulkPutIfAny(db.patients, data.patients),
        bulkPutIfAny(db.odontograms, data.odontograms),
        bulkPutIfAny(db.clinicalRecords, data.clinicalRecords),
        bulkPutIfAny(db.signatures, data.signatures),
        bulkPutIfAny(db.appointments, data.appointments),
        bulkPutIfAny(db.scheduleColumns, data.scheduleColumns),
        bulkPutIfAny(db.scheduleBlocks, data.scheduleBlocks),
        bulkPutIfAny(db.users, data.users),
        bulkPutIfAny(db.prices, data.prices),
        bulkPutIfAny(db.userCredentials, data.userCredentials),
        bulkPutIfAny(db.auditLogs, data.auditLogs),
        bulkPutIfAny(db.clinicalAddendums, data.clinicalAddendums),
        bulkPutIfAny(db.catalogMeta, data.catalogMeta),
        bulkPutIfAny(db.catalogItems, data.catalogItems),
        bulkPutIfAny(db.diagnosticAids, data.diagnosticAids),
        bulkPutIfAny(
          db.diagnosticAidBlobs,
          deserializeDiagnosticAidBlobs(asRows(data.diagnosticAidBlobs)),
        ),
        bulkPutIfAny(db.dentalServices, data.dentalServices),
        bulkPutIfAny(db.dentalServiceSpecialties, data.dentalServiceSpecialties),
        bulkPutIfAny(db.professionals, data.professionals),
        bulkPutIfAny(db.dentalServicePrices, data.dentalServicePrices),
        bulkPutIfAny(db.patientClinicalDrafts, data.patientClinicalDrafts),
        bulkPutIfAny(db.electronicInvoices, data.electronicInvoices),
        bulkPutIfAny(db.electronicCreditNotes, data.electronicCreditNotes),
        bulkPutIfAny(db.evolutionNoteAddendums, data.evolutionNoteAddendums),
        bulkPutIfAny(db.syncOutbox, data.syncOutbox),
        bulkPutIfAny(db.clinicBillingSettings, data.clinicBillingSettings),
      ])
    })
  })

  const billing = await db.clinicBillingSettings.get(CLINIC_BILLING_SETTINGS_ID)
  if (billing) {
    const { id: _id, updatedAt: _updatedAt, ...settings } = billing
    saveBillingModalitySettings(settings)
  }
}

export async function restoreFromBackupFile(file: File, password?: string): Promise<void> {
  const parsed = await parseBackupInput(file)
  if (parsed.kind === 'encrypted') {
    if (!password) {
      throw new Error('Este archivo está cifrado. Ingrese la contraseña.')
    }
    const payload = await decryptBackupFile(parsed.file, password)
    await restoreBackupPayload(payload)
    return
  }
  await restoreBackupPayload(parsed.payload)
}

export function getBackupSummary(settings: BackupSettings = getBackupSettings()) {
  return {
    isOfflineCapable: true,
    lastBackupAt: settings.lastBackupAt,
    autoBackupEnabled: settings.autoBackupEnabled,
    autoBackupIntervalHours: settings.autoBackupIntervalHours,
    backupOverdue: isBackupOverdue(settings),
    reminderDue: isBackupReminderDue(settings),
    reminderReason: getBackupReminderReason(settings),
  }
}

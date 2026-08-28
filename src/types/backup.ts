export const BACKUP_FORMAT = 'dental-emr-backup'
export const BACKUP_VERSION = 2
export const PLAIN_BACKUP_KIND = 'plain-json'
export const BACKUP_REMINDER_DAYS = 7
/** Hora local a partir de la cual se recuerda cerrar jornada con un backup. */
export const WORKDAY_END_HOUR = 18
export const BACKUP_SETTINGS_CHANGED_EVENT = 'dental-backup-settings-changed'

export interface BackupSettings {
  autoBackupEnabled: boolean
  /** Intervalo en horas entre respaldos automáticos cifrados */
  autoBackupIntervalHours: number
  lastBackupAt: string | null
  lastBackupBy: string | null
  /** Guardar clave localmente para respaldos programados (solo equipos protegidos) */
  storeBackupKeyForSchedule: boolean
  /** ISO 8601 — el usuario pospuso el recordatorio (se oculta el resto del día) */
  reminderDismissedAt?: string | null
}

export interface BackupDataTables {
  patients: unknown[]
  odontograms: unknown[]
  clinicalRecords: unknown[]
  signatures: unknown[]
  appointments: unknown[]
  scheduleColumns: unknown[]
  scheduleBlocks?: unknown[]
  users: unknown[]
  prices: unknown[]
  userCredentials: unknown[]
  auditLogs: unknown[]
  clinicalAddendums: unknown[]
  catalogMeta: unknown[]
  catalogItems: unknown[]
  diagnosticAids?: unknown[]
  /** Blobs serializados con `dataBase64` (ArrayBuffer no cabe en JSON). */
  diagnosticAidBlobs?: unknown[]
  dentalServices?: unknown[]
  dentalServiceSpecialties?: unknown[]
  professionals?: unknown[]
  dentalServicePrices?: unknown[]
  patientClinicalDrafts?: unknown[]
  electronicInvoices?: unknown[]
  electronicCreditNotes?: unknown[]
  evolutionNoteAddendums?: unknown[]
  syncOutbox?: unknown[]
  clinicBillingSettings?: unknown[]
}

export interface BackupPayload {
  format: typeof BACKUP_FORMAT
  kind?: typeof PLAIN_BACKUP_KIND
  version: number
  exportedAt: string
  exportedBy: string | null
  data: BackupDataTables
}

export interface EncryptedBackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  algorithm: 'AES-GCM-PBKDF2'
  salt: string
  iv: string
  ciphertext: string
}

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  autoBackupEnabled: false,
  autoBackupIntervalHours: 24,
  lastBackupAt: null,
  lastBackupBy: null,
  storeBackupKeyForSchedule: false,
  reminderDismissedAt: null,
}

export const BACKUP_SETTINGS_KEY = 'dental_emr_backup_settings'
export const SCHEDULED_PASSPHRASE_KEY = 'dental_emr_scheduled_passphrase'

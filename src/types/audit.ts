export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'SESSION_EXPIRED'
  | 'VIEW_PATIENT_LIST'
  | 'VIEW_PATIENT'
  | 'CREATE_PATIENT'
  | 'UPDATE_PATIENT'
  | 'UPDATE_ODONTOGRAM'
  | 'VIEW_CLINICAL_RECORD'
  | 'SIGN_CLINICAL_RECORD'
  | 'SIGN_ADDENDUM'
  | 'CONFIRM_SIGN_PASSWORD'
  | 'EXPORT_RIPS'
  | 'EXPORT_FHIR'
  | 'CREATE_BACKUP'
  | 'RESTORE_BACKUP'
  | 'PURGE_TEST_DATABASE'
  | 'EXPORT_PORTABILITY'
  | 'VERIFY_INTEGRITY'
  | 'IMPORT_CATALOG'
  | 'UPDATE_PROFILE'
  | 'CHANGE_PASSWORD'
  | 'CREATE_USER'
  | 'UPDATE_USER'
  | 'RESET_USER_PASSWORD'
  | 'DELETE_USER'
  | 'VIEW_AUDIT_LOG'
  | 'VIEW_INVOICE_LEDGER'
  | 'ACCESS_DENIED'
  | 'ACCEPT_VALUATION_CONSENT'
  | 'UPLOAD_DIAGNOSTIC_AID'
  | 'OPEN_DIAGNOSTIC_AID'
  | 'DELETE_DIAGNOSTIC_AID'
  | 'CREATE_EVOLUTION_NOTE'
  | 'CREATE_EVOLUTION_ADDENDUM'
  | 'BLOCK_EVOLUTION_MUTATION'

export type AuditResourceType =
  | 'session'
  | 'patient'
  | 'clinical_record'
  | 'odontogram'
  | 'profile'
  | 'user'
  | 'rips'
  | 'fhir'
  | 'backup'
  | 'database'
  | 'portability'
  | 'catalog'
  | 'audit_log'
  | 'invoice_ledger'
  | 'route'
  | 'diagnostic_aid'

export interface AuditLogEntry {
  id: string
  userId: string | null
  userEmail: string | null
  userName: string | null
  userRole: string | null
  action: AuditAction
  resourceType: AuditResourceType
  resourceId?: string
  details?: string
  success: boolean
  userAgent: string
  timestamp: string
}

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN_SUCCESS: 'Inicio de sesión',
  LOGIN_FAILED: 'Intento de acceso fallido',
  LOGOUT: 'Cierre de sesión',
  SESSION_EXPIRED: 'Sesión expirada',
  VIEW_PATIENT_LIST: 'Consulta lista de pacientes',
  VIEW_PATIENT: 'Consulta ficha de paciente',
  CREATE_PATIENT: 'Registro de paciente',
  UPDATE_PATIENT: 'Actualización datos de identificación del paciente',
  UPDATE_ODONTOGRAM: 'Actualización odontograma',
  VIEW_CLINICAL_RECORD: 'Consulta historia clínica',
  SIGN_CLINICAL_RECORD: 'Firma historia clínica',
  SIGN_ADDENDUM: 'Firma nota aclaratoria/adenda',
  CONFIRM_SIGN_PASSWORD: 'Confirmación de contraseña para firma',
  EXPORT_RIPS: 'Exportación RIPS',
  EXPORT_FHIR: 'Exportación FHIR',
  CREATE_BACKUP: 'Creación de copia de seguridad',
  RESTORE_BACKUP: 'Restauración de respaldo',
  PURGE_TEST_DATABASE: 'Limpieza de base de datos de prueba',
  EXPORT_PORTABILITY: 'Exportación portabilidad paciente',
  VERIFY_INTEGRITY: 'Verificación de integridad',
  IMPORT_CATALOG: 'Actualización catálogo CUPS/CIE',
  UPDATE_PROFILE: 'Actualización de perfil',
  CHANGE_PASSWORD: 'Cambio de contraseña',
  CREATE_USER: 'Creación de usuario',
  UPDATE_USER: 'Actualización de usuario',
  RESET_USER_PASSWORD: 'Restablecimiento de contraseña',
  DELETE_USER: 'Eliminación de usuario',
  VIEW_AUDIT_LOG: 'Consulta bitácora de auditoría',
  VIEW_INVOICE_LEDGER: 'Consulta cuentas y facturas',
  ACCESS_DENIED: 'Acceso denegado',
  UPLOAD_DIAGNOSTIC_AID: 'Registro examen complementario / escaneo',
  OPEN_DIAGNOSTIC_AID: 'Apertura examen complementario (app externa)',
  DELETE_DIAGNOSTIC_AID: 'Eliminación registro examen complementario',
  ACCEPT_VALUATION_CONSENT: 'Aceptación consentimiento de valoración',
  CREATE_EVOLUTION_NOTE: 'Creación nota de evolución clínica',
  CREATE_EVOLUTION_ADDENDUM: 'Creación nota aclaratoria de evolución',
  BLOCK_EVOLUTION_MUTATION: 'Bloqueo edición/eliminación evolución (Res. 1995/1999)',
}

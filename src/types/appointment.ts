import type { ProcedureType } from '@/constants/procedures'

export type AppointmentStatus =
  | 'programada'
  | 'confirmada'
  | 'en_atencion'
  | 'completada'
  | 'cancelada'
  | 'no_asistio'

export interface Appointment {
  id?: number | string
  patientName: string
  /** Teléfono de contacto para recordatorios WhatsApp */
  patientPhone?: string
  procedureType: ProcedureType
  startTime: string
  endTime: string
  /** ID de la silla / consultorio (columna dinámica) */
  columnId: string
  notes?: string
  status: AppointmentStatus
  /** Vínculo opcional al registro de paciente */
  patientId?: string
  /** syncId del paciente en el origen (para remapear el id Dexie local). */
  patientSyncId?: string
  createdAt: string
  updatedAt: string
  /** Identidad estable entre dispositivos (no es el id Dexie). */
  syncId?: string
  clinicId?: string
  pendingSync?: boolean
  lastSyncedAt?: string
  /** Tumba suave: la cita no se muestra pero sí se replica el borrado. */
  deletedAt?: string
}

export function isActiveAppointment(appointment: Pick<Appointment, 'deletedAt'>): boolean {
  return !appointment.deletedAt
}

/** Columna dinámica del scheduler (silla / consultorio) */
export interface ScheduleColumn {
  id: string
  name: string
  order: number
  createdAt: string
  updatedAt: string
}

export interface CreateAppointmentInput {
  patientName: string
  patientPhone?: string
  patientId?: string
  procedureType: ProcedureType
  startTime: string
  endTime: string
  columnId: string
  notes?: string
}

export interface CreateColumnInput {
  name: string
}

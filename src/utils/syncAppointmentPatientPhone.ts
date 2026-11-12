import { db } from '@/db/database'
import type { Appointment } from '@/types/appointment'
import { syncCitasToLocalStorage } from '@/utils/agendaStorage'
import { getPatientByRouteId } from '@/utils/patientId'
import { resolveAppointmentPatient } from '@/utils/resolveAppointmentPatient'
import { toStoredInternationalPhone } from '@/utils/phoneInternational'

export interface SyncAppointmentPatientPhoneResult {
  patientUpdated: boolean
}

export async function syncAppointmentPatientPhone(
  appointment: Appointment,
  phone: string,
): Promise<SyncAppointmentPatientPhoneResult> {
  const trimmed = toStoredInternationalPhone(phone)
  if (!trimmed) {
    throw new Error('El teléfono es obligatorio.')
  }

  if (appointment.id == null) {
    throw new Error('Guarde la cita antes de actualizar el teléfono.')
  }

  const now = new Date().toISOString()

  await db.appointments.update(appointment.id, {
    patientPhone: trimmed,
    updatedAt: now,
  })
  await syncCitasToLocalStorage()

  const patient = appointment.patientId
    ? await getPatientByRouteId(appointment.patientId)
    : await resolveAppointmentPatient(appointment)

  if (patient?.id != null) {
    await db.patients.update(patient.id, {
      phone: trimmed,
      updatedAt: now,
    })
    return { patientUpdated: true }
  }

  return { patientUpdated: false }
}

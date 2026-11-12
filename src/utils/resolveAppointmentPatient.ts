import { db } from '@/db/database'
import type { Appointment } from '@/types/appointment'
import type { Patient } from '@/types/patient'
import { getPatientByRouteId } from './patientId'
import { phonesEquivalent } from './phoneInternational'

export async function resolveAppointmentPatient(
  appointment: Appointment,
): Promise<Patient | null> {
  if (appointment.patientId) {
    const byId = await getPatientByRouteId(appointment.patientId)
    if (byId) return byId
  }

  if (!appointment.patientPhone?.trim()) return null

  const patients = await db.patients.toArray()
  return (
    patients.find((patient) => phonesEquivalent(patient.phone, appointment.patientPhone ?? '')) ??
    null
  )
}

export async function resolveAppointmentPatientRouteId(
  appointment: Appointment,
): Promise<string | null> {
  const patient = await resolveAppointmentPatient(appointment)
  if (patient?.id != null) return String(patient.id)
  return appointment.patientId ?? null
}

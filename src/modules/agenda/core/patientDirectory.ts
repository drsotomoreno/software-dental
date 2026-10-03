import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  formatPatientFullName,
  formatPatientLabel,
  getPatientRouteId,
  searchPatients,
  usePatientsList,
} from '@/hooks/usePatientsList'
import type { Appointment } from '@/types/appointment'
import type { Patient } from '@/types/patient'
import { resolveAppointmentPatient } from './resolveAppointmentPatient'

/** Vista de paciente que la agenda necesita. El id de ruta sigue siendo String(patient.id). */
export interface AgendaPatientSummary {
  routeId: string
  firstName: string
  lastName: string
  fullName: string
  label: string
  documentType: string
  documentNumber: string
  phone: string
  email?: string
  gender: 'M' | 'F' | 'O'
  birthDate: string
  insurer?: string
  city?: string
  address?: string
}

export function toAgendaPatientSummary(patient: Patient): AgendaPatientSummary {
  return {
    routeId: getPatientRouteId(patient),
    firstName: patient.firstName,
    lastName: patient.lastName,
    fullName: formatPatientFullName(patient),
    label: formatPatientLabel(patient),
    documentType: patient.documentType,
    documentNumber: patient.documentNumber,
    phone: patient.phone,
    email: patient.email,
    gender: patient.gender,
    birthDate: patient.birthDate,
    insurer: patient.insurer,
    city: patient.city,
    address: patient.address,
  }
}

export function useAgendaPatients() {
  const { patients, isLoading } = usePatientsList()
  const summaries = useMemo(() => patients.map(toAgendaPatientSummary), [patients])
  return { patients: summaries, isLoading }
}

/**
 * Reutiliza el ranking del directorio clínico. Solo lee nombre y documento,
 * campos que el resumen ya contiene.
 */
export function searchAgendaPatients(
  patients: AgendaPatientSummary[],
  query: string,
  limit = 12,
): AgendaPatientSummary[] {
  return searchPatients(patients as unknown as Patient[], query, limit) as unknown as AgendaPatientSummary[]
}

export function agendaPatientRouteId(patient: AgendaPatientSummary): string {
  return patient.routeId
}

export function formatAgendaPatientFullName(patient: AgendaPatientSummary): string {
  return patient.fullName
}

export function formatAgendaPatientLabel(patient: AgendaPatientSummary): string {
  return patient.label
}

export function useAgendaAppointmentPatient(appointment: Appointment) {
  return useLiveQuery(async () => {
    const patient = await resolveAppointmentPatient(appointment)
    return patient ? toAgendaPatientSummary(patient) : null
  }, [appointment.id, appointment.patientId, appointment.patientPhone])
}

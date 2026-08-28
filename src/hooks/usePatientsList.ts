import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import type { Patient } from '@/types/patient'

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

/** Filtra pacientes por nombre, apellido o documento desde la primera letra. */
export function searchPatients(patients: Patient[], query: string, limit = 12): Patient[] {
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return []

  const scored = patients
    .map((patient) => {
      const firstName = normalizeSearch(patient.firstName)
      const lastName = normalizeSearch(patient.lastName)
      const fullName = `${firstName} ${lastName}`
      const fullNameReverse = `${lastName} ${firstName}`
      const document = normalizeSearch(patient.documentNumber)

      let score = 0

      if (lastName.startsWith(normalizedQuery)) score = 100
      else if (firstName.startsWith(normalizedQuery)) score = 90
      else if (fullNameReverse.startsWith(normalizedQuery)) score = 80
      else if (fullName.startsWith(normalizedQuery)) score = 70
      else if (lastName.includes(normalizedQuery)) score = 50
      else if (firstName.includes(normalizedQuery)) score = 40
      else if (document.includes(normalizedQuery)) score = 30
      else if (fullName.includes(normalizedQuery)) score = 20

      return { patient, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const nameA = `${a.patient.lastName} ${a.patient.firstName}`.toLowerCase()
      const nameB = `${b.patient.lastName} ${b.patient.firstName}`.toLowerCase()
      return nameA.localeCompare(nameB, 'es')
    })

  return scored.slice(0, limit).map((entry) => entry.patient)
}

export function usePatientsList() {
  const patients = useLiveQuery(async () => {
    const all = await db.patients.orderBy('lastName').toArray()
    return all.sort((a, b) => {
      const nameA = `${a.lastName} ${a.firstName}`.toLowerCase()
      const nameB = `${b.lastName} ${b.firstName}`.toLowerCase()
      return nameA.localeCompare(nameB, 'es')
    })
  }, [])

  return {
    patients: patients ?? [],
    isLoading: patients === undefined,
  }
}

export function formatPatientLabel(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName} — ${patient.documentType} ${patient.documentNumber}`
}

export function formatPatientFullName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`.trim()
}

export function getPatientRouteId(patient: Patient): string {
  return String(patient.id ?? '')
}

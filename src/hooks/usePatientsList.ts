import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import type { Patient } from '@/types/patient'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

/** Equivalente a unaccent + LOWER: NFD, quita marcas diacríticas y pasa a minúsculas. */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

function tokenizeSearch(query: string): string[] {
  return normalizeSearch(query).split(/\s+/).filter(Boolean)
}

function patientSearchBlob(patient: Patient): string {
  const firstName = normalizeSearch(patient.firstName)
  const lastName = normalizeSearch(patient.lastName)
  const document = normalizeSearch(patient.documentNumber)
  return `${firstName} ${lastName} ${lastName} ${firstName} ${document}`
}

function patientMatchesTokens(patient: Patient, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  const blob = patientSearchBlob(patient)
  return tokens.every((token) => blob.includes(token))
}

function scorePatientMatch(patient: Patient, normalizedQuery: string): number {
  const firstName = normalizeSearch(patient.firstName)
  const lastName = normalizeSearch(patient.lastName)
  const fullName = `${firstName} ${lastName}`
  const fullNameReverse = `${lastName} ${firstName}`
  const document = normalizeSearch(patient.documentNumber)

  if (lastName.startsWith(normalizedQuery)) return 100
  if (firstName.startsWith(normalizedQuery)) return 90
  if (fullNameReverse.startsWith(normalizedQuery)) return 80
  if (fullName.startsWith(normalizedQuery)) return 70
  if (document.startsWith(normalizedQuery)) return 60
  if (lastName.includes(normalizedQuery)) return 50
  if (firstName.includes(normalizedQuery)) return 40
  if (document.includes(normalizedQuery)) return 30
  if (fullName.includes(normalizedQuery) || fullNameReverse.includes(normalizedQuery)) return 20
  return 10
}

function comparePatientsByName(a: Patient, b: Patient): number {
  const nameA = `${a.lastName} ${a.firstName}`.toLowerCase()
  const nameB = `${b.lastName} ${b.firstName}`.toLowerCase()
  return nameA.localeCompare(nameB, 'es')
}

function rankMatchingPatients(patients: Patient[], query: string): Patient[] {
  const tokens = tokenizeSearch(query)
  const normalizedQuery = normalizeSearch(query)

  return patients
    .map((patient) => ({
      patient,
      score: patientMatchesTokens(patient, tokens) ? scorePatientMatch(patient, normalizedQuery) : 0,
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return comparePatientsByName(a.patient, b.patient)
    })
    .map((entry) => entry.patient)
}

/** Filtra la lista de una vista. Query vacío devuelve todos los pacientes de esa sección. */
export function filterPatientsByQuery(patients: Patient[], query: string): Patient[] {
  if (!normalizeSearch(query)) return patients
  return rankMatchingPatients(patients, query)
}

/** Filtra pacientes por nombre, apellido o documento desde la primera letra. */
export function searchPatients(patients: Patient[], query: string, limit = 12): Patient[] {
  if (!normalizeSearch(query)) return []
  return rankMatchingPatients(patients, query).slice(0, limit)
}

export function usePatientsList() {
  const patients = useLiveQuery(async () => {
    const all = await db.patients.orderBy('lastName').toArray()
    return all.sort(comparePatientsByName)
  }, [])

  return {
    patients: patients ?? [],
    isLoading: patients === undefined,
  }
}

/** Estado de búsqueda con debounce para las tres listas de pacientes. */
export function usePatientListFilter(patients: Patient[] | undefined) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)
  const filteredPatients = useMemo(
    () => (patients ? filterPatientsByQuery(patients, debouncedQuery) : undefined),
    [patients, debouncedQuery],
  )

  return { query, setQuery, debouncedQuery, filteredPatients }
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

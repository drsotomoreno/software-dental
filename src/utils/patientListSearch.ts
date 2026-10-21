import type { Patient } from '@/types/patient'

export function foldSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function compactDocument(value: string): string {
  return foldSearchText(value).replace(/[.\s]/g, '')
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/** Nombre, documento/cédula o teléfono. Cada palabra del query debe coincidir. */
export function patientMatchesQuery(
  patient: Pick<Patient, 'firstName' | 'lastName' | 'documentNumber' | 'phone'>,
  query: string,
): boolean {
  const normalized = foldSearchText(query).trim()
  if (!normalized) return true

  const name = foldSearchText(`${patient.firstName} ${patient.lastName}`)
  const document = compactDocument(patient.documentNumber)
  const documentDigits = digitsOnly(patient.documentNumber)
  const phone = foldSearchText(patient.phone ?? '')
  const phoneDigits = digitsOnly(patient.phone ?? '')

  return normalized.split(/\s+/).every((token) => {
    if (name.includes(token)) return true
    const compactToken = token.replace(/[.\s]/g, '')
    if (compactToken && document.includes(compactToken)) return true
    if (phone.includes(token)) return true
    const tokenDigits = digitsOnly(token)
    return (
      tokenDigits.length > 0 &&
      (documentDigits.includes(tokenDigits) || phoneDigits.includes(tokenDigits))
    )
  })
}

export function formatShownCount(shown: number, total: number): string {
  const noun = total === 1 ? 'paciente' : 'pacientes'
  return `Mostrando ${shown} de ${total} ${noun}`
}

export const PATIENT_LIST_SEARCH_PLACEHOLDER =
  'Buscar por nombre, apellido, documento o teléfono'

import {
  CIE10_RIPS_PATTERN,
  createDefaultEvolutionNoteRipsMetadata,
} from '../types/evolutionNoteRips.ts'
import type { EvolutionNote } from '../types/evolutionNote.ts'
import { compactEvolutionCie10 } from './evolutionNoteAssociation.ts'
import { cupsValidosDeNota } from './evolutionRipsPayload.ts'

/** CUPS RIPS: exactamente 6 dígitos (Res. 2275). No rellena ceros a la izquierda. */
export function isValidEvolutionCupsCode(value: string | null | undefined): boolean {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length === 6
}

export function normalizeEvolutionCupsDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '').slice(0, 6)
}

function isNonRipsOnlyNote(note: EvolutionNote): boolean {
  if (note.requiereCupsRips === false) {
    const services = note.catalogServices ?? []
    if (services.length === 0) return true
  }
  const services = (note.catalogServices ?? []).filter(
    (service) =>
      Boolean(service.dentalServiceId) ||
      Boolean(service.serviceName?.trim()) ||
      Boolean(service.procedure?.trim()),
  )
  if (services.length === 0) return false
  return services.every((service) => service.requiereCupsRips === false)
}

export function noteRequiresCupsAndCie10ForClose(note: EvolutionNote): boolean {
  return !isNonRipsOnlyNote(note)
}

export function notePrincipalCie10(note: EvolutionNote): string {
  const fromMeta = compactEvolutionCie10(note.ripsMetadata?.codDiagnosticoPrincipal)
  if (fromMeta && CIE10_RIPS_PATTERN.test(fromMeta)) return fromMeta

  for (const diagnosis of note.diagnoses ?? []) {
    const code = compactEvolutionCie10(diagnosis.code)
    if (code && CIE10_RIPS_PATTERN.test(code)) return code
  }

  for (const service of note.catalogServices ?? []) {
    const code = compactEvolutionCie10(service.cie10Code)
    if (code && CIE10_RIPS_PATTERN.test(code)) return code
  }

  return ''
}

export function noteHasValidPrincipalCie10(note: EvolutionNote): boolean {
  return Boolean(notePrincipalCie10(note))
}

export function noteHasValidCupsForRips(note: EvolutionNote): boolean {
  return cupsValidosDeNota(note).length > 0
}

/**
 * CUPS efectivo para la UI de Vinculación Administrativa:
 * clínico de la nota, override administrativo en ripsMetadata, o catálogo.
 */
export function effectiveEvolutionCupsCode(note: EvolutionNote): string {
  if (isValidEvolutionCupsCode(note.cupsCode)) {
    return normalizeEvolutionCupsDigits(note.cupsCode)
  }
  const admin = note.ripsMetadata?.cupsCode
  if (isValidEvolutionCupsCode(admin)) {
    return normalizeEvolutionCupsDigits(admin)
  }
  for (const service of note.catalogServices ?? []) {
    if (service.requiereCupsRips === false) continue
    if (isValidEvolutionCupsCode(service.cupsCode)) {
      return normalizeEvolutionCupsDigits(service.cupsCode)
    }
  }
  const draft =
    normalizeEvolutionCupsDigits(note.cupsCode) ||
    normalizeEvolutionCupsDigits(note.ripsMetadata?.cupsCode)
  return draft
}

/**
 * Nota firmada cuyo CUPS clínico quedó vacío/inválido: se permite
 * completar solo el CUPS administrativo (ripsMetadata) sin reescribir el folio.
 */
export function canEditAdminCupsOnLockedNote(note: EvolutionNote): boolean {
  if (!noteRequiresCupsAndCie10ForClose(note)) return false
  const clinicalOk = isValidEvolutionCupsCode(note.cupsCode)
  const catalogOk = (note.catalogServices ?? []).some(
    (service) =>
      service.requiereCupsRips !== false && isValidEvolutionCupsCode(service.cupsCode),
  )
  return !clinicalOk && !catalogOk
}

export function adminCupsAlreadyAssigned(note: EvolutionNote): boolean {
  return isValidEvolutionCupsCode(note.ripsMetadata?.cupsCode)
}

const HIGHLIGHT_CLASS = 'ring-2 ring-amber-500 ring-offset-2'
const HIGHLIGHT_MS = 3200

/** Scroll suave al campo faltante y resaltado temporal para el bloqueo pre-firma. */
export function focusEvolutionMissingField(noteId: string, field: string): void {
  if (typeof document === 'undefined') return
  const escape =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape
      : (value: string) => value.replace(/["\\]/g, '\\$&')
  const selector = `[data-evo-note="${escape(noteId)}"][data-evo-field="${escape(field)}"]`
  const el = document.querySelector<HTMLElement>(selector)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add(...HIGHLIGHT_CLASS.split(' '))
  const focusable = el.matches('input, textarea, select, button')
    ? el
    : el.querySelector<HTMLElement>('input, textarea, select, button')
  focusable?.focus({ preventScroll: true })
  window.setTimeout(() => {
    el.classList.remove(...HIGHLIGHT_CLASS.split(' '))
  }, HIGHLIGHT_MS)
}

export function ensureRipsMetadataCups(
  note: EvolutionNote,
  cupsCode: string,
): NonNullable<EvolutionNote['ripsMetadata']> {
  const base = note.ripsMetadata ?? createDefaultEvolutionNoteRipsMetadata()
  return {
    ...base,
    cupsCode: normalizeEvolutionCupsDigits(cupsCode) || null,
  }
}

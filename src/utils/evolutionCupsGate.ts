/**
 * Puerta CUPS/CIE-10 — delega al resolver canónico (fuente única).
 */
import {
  createDefaultEvolutionNoteRipsMetadata,
} from '../types/evolutionNoteRips.ts'
import type { EvolutionNote } from '../types/evolutionNote.ts'
import {
  isValidCupsCode,
  normalizeCupsDigits,
  resolveCanonicalCie10Principal,
  resolveCanonicalCupsCodes,
  resolveCanonicalEvolutionRips,
} from './canonicalEvolutionRips.ts'

export const isValidEvolutionCupsCode = isValidCupsCode
export const normalizeEvolutionCupsDigits = normalizeCupsDigits

export function noteRequiresCupsAndCie10ForClose(note: EvolutionNote): boolean {
  return resolveCanonicalEvolutionRips(note).requiresRips
}

export function notePrincipalCie10(note: EvolutionNote): string {
  return resolveCanonicalCie10Principal(note)
}

export function noteHasValidPrincipalCie10(note: EvolutionNote): boolean {
  return Boolean(notePrincipalCie10(note))
}

export function noteHasValidCupsForRips(note: EvolutionNote): boolean {
  return resolveCanonicalCupsCodes(note).length > 0
}

export function effectiveEvolutionCupsCode(note: EvolutionNote): string {
  return resolveCanonicalCupsCodes(note)[0] || normalizeCupsDigits(note.ripsMetadata?.cupsCode) || normalizeCupsDigits(note.cupsCode)
}

export function canEditAdminCupsOnLockedNote(note: EvolutionNote): boolean {
  if (!noteRequiresCupsAndCie10ForClose(note)) return false
  return !noteHasValidCupsForRips(note)
}

export function adminCupsAlreadyAssigned(note: EvolutionNote): boolean {
  return isValidCupsCode(note.ripsMetadata?.cupsCode)
}

const HIGHLIGHT_CLASS = 'ring-2 ring-amber-500 ring-offset-2'
const HIGHLIGHT_MS = 3200

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
    cupsCode: normalizeCupsDigits(cupsCode) || null,
  }
}

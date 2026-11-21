/**
 * Adaptador frontend del resolver canónico compartido.
 * Enriquece la nota con CUPS resueltos por catálogo (descripciones)
 * y delega 100% a shared/canonicalEvolutionRips.js.
 */
import {
  resolveAndValidateCanonicalEvolutionRips as sharedResolveAndValidate,
  resolveCanonicalCupsCodes as sharedCups,
  resolveCanonicalCie10Principal as sharedCie10,
  resolveCanonicalEvolutionRips as sharedResolve,
  validateCanonicalEvolutionRips as sharedValidate,
  applySinFacturaBillingContract,
  isValidCupsCode,
  isValidCie10Code,
  normalizeCupsDigits,
  compactCie10Code,
  type CanonicalEvolutionRipsResolved,
  type CanonicalRipsValidationMode,
  type CanonicalRipsValidationResult,
  type CanonicalRipsValidationError,
} from '../../shared/canonicalEvolutionRips.js'
import type { EvolutionNote } from '../types/evolutionNote.ts'
import type { PacienteRipsIdentidad, PrestadorRipsIdentidad } from './evolutionRipsPayload.ts'
import { cupsDesdeTexto } from './cupsCodeResolve.ts'

export type {
  CanonicalEvolutionRipsResolved,
  CanonicalRipsValidationMode,
  CanonicalRipsValidationResult,
  CanonicalRipsValidationError,
}

export {
  applySinFacturaBillingContract,
  isValidCupsCode,
  isValidCie10Code,
  normalizeCupsDigits,
  compactCie10Code,
}

/**
 * Inyecta CUPS descubiertos por descripción oficial del catálogo
 * (además de los dígitos explícitos que ya resuelve shared).
 */
function enrichNoteCupsFromCatalog(note: EvolutionNote): EvolutionNote {
  const extras: string[] = []
  const fuentes = [
    note.cupsCode,
    note.ripsMetadata?.cupsCode,
    note.serviceName,
    note.procedure,
    ...(note.catalogServices ?? []).flatMap((service) =>
      service.requiereCupsRips === false
        ? []
        : [service.cupsCode, service.procedure, service.serviceName],
    ),
  ]
  for (const fuente of fuentes) {
    for (const cups of cupsDesdeTexto(fuente)) {
      if (isValidCupsCode(cups) && !extras.includes(cups)) extras.push(cups)
    }
  }
  if (extras.length === 0) return note
  const current = sharedCups(note)
  if (extras.every((code) => current.includes(code))) return note
  // Solo ayuda al resolver en memoria; no reescribe ripsMetadata ni el hash.
  return {
    ...note,
    cupsCode: note.cupsCode || extras[0] || note.cupsCode,
  }
}

export function resolveCanonicalCupsCodes(note: EvolutionNote): string[] {
  const enriched = enrichNoteCupsFromCatalog(note)
  const fromShared = sharedCups(enriched)
  if (fromShared.length > 0) return fromShared
  return sharedCups(note)
}

export function resolveCanonicalCie10Principal(note: EvolutionNote): string {
  return sharedCie10(note)
}

export function resolveCanonicalEvolutionRips(
  note: EvolutionNote,
  patient: PacienteRipsIdentidad | Record<string, unknown> = {},
  clinicConfig: PrestadorRipsIdentidad & Record<string, unknown> = {},
): CanonicalEvolutionRipsResolved {
  return sharedResolve(enrichNoteCupsFromCatalog(note), patient, clinicConfig)
}

export function validateCanonicalEvolutionRips(
  resolved: CanonicalEvolutionRipsResolved,
  mode: CanonicalRipsValidationMode = 'send',
): CanonicalRipsValidationResult {
  return sharedValidate(resolved, mode)
}

export function resolveAndValidateCanonicalEvolutionRips(
  note: EvolutionNote,
  patient: PacienteRipsIdentidad | Record<string, unknown> = {},
  clinicConfig: PrestadorRipsIdentidad & Record<string, unknown> = {},
  mode: CanonicalRipsValidationMode = 'send',
) {
  return sharedResolveAndValidate(enrichNoteCupsFromCatalog(note), patient, clinicConfig, mode)
}

export function formatCanonicalRipsErrors(
  errors: CanonicalRipsValidationError[],
): string {
  return errors
    .map((error) => {
      const fix = error.fix ? ` → ${error.fix}` : ''
      return `${error.field}: ${error.message}${fix}`
    })
    .join('\n')
}

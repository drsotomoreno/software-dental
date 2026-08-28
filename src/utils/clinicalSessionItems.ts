import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { EvolutionNote } from '@/types/evolutionNote'
import type { ClinicalEvolutionItem } from '@/types/billingAndRips'
import type { UserProfile } from '@/types/user'
import { normalizeCupsCode } from '@/services/catalogService'
import {
  resolveEvolutionNoteRipsCups,
  type EvolutionCatalogLookup,
} from '@/utils/ripsCompiler'
import { isNonRipsEvolutionNote } from '@/types/evolutionNote'
import { expandEvolutionNoteServices } from '@/utils/evolutionCatalogServices'

const CUPS_PATTERN = /^\d{6}$/

function normalizeCups(code: string | null | undefined): string | null {
  if (!code?.trim()) return null
  const normalized = normalizeCupsCode(code)
  return CUPS_PATTERN.test(normalized) ? normalized : null
}

function resolveEvolutionCost(
  note: EvolutionNote,
  catalog?: { defaultPrice?: number } | null,
): number {
  if (typeof note.cost === 'number') return Math.max(0, note.cost)
  return Math.max(0, catalog?.defaultPrice ?? 0)
}

function resolveEvolutionBillable(note: EvolutionNote, cost: number): boolean {
  if (note.isBillable === false) return false
  if (note.isBillable === true) return cost > 0
  return cost > 0
}

export function mapEvolutionNoteToClinicalItem(
  note: EvolutionNote,
  record: ClinicalRecord,
  professional: UserProfile,
  catalogLookup?: EvolutionCatalogLookup,
): ClinicalEvolutionItem | null {
  if (!note.procedure?.trim() && !note.clinicalNote?.trim() && !note.serviceName?.trim()) {
    return null
  }

  const catalog = note.dentalServiceId ? catalogLookup?.(note.dentalServiceId) : null
  const cupsRaw = resolveEvolutionNoteRipsCups(note, catalog ?? undefined)
  const cups = cupsRaw ? normalizeCups(cupsRaw) : null
  const isCustom = isNonRipsEvolutionNote(note) || !cups
  const cost = resolveEvolutionCost(note, catalog)
  const isBillable = resolveEvolutionBillable(note, cost)
  const principal =
    record.diagnoses?.find((diagnosis) => diagnosis.type === 'principal') ?? record.diagnoses?.[0]

  return {
    id: note.id,
    procedureName: note.serviceName || note.procedure || note.clinicalNote || 'Atención clínica',
    cupsCode: cups,
    cie10Code: principal?.code ?? null,
    cie10Description: principal?.description ?? null,
    isCustomProcedure: isCustom,
    cost: isBillable ? cost : 0,
    isBillable,
    providerId: note.authorUserId || professional.id,
    providerDocument: professional.documentNumber,
    providerName: note.professionalName || `${professional.firstName} ${professional.lastName}`,
    attentionDate: note.date || note.createdAt,
    requiereCupsRips: note.requiereCupsRips,
    sourceType: 'evolution',
    sourceId: note.id,
  }
}

export function extractClinicalItemsFromRecord(
  record: ClinicalRecord,
  professional: UserProfile,
  options?: {
    catalogLookup?: EvolutionCatalogLookup
    evolutionNoteIds?: string[]
  },
): ClinicalEvolutionItem[] {
  const notes = (record.evolutionNotes ?? []).filter((note) => {
    if (!options?.evolutionNoteIds?.length) return true
    return options.evolutionNoteIds.includes(note.id)
  })

  return notes
    .flatMap((note) =>
      expandEvolutionNoteServices(note).map(({ note: scopedNote, service }) =>
        mapEvolutionNoteToClinicalItem(
          {
            ...scopedNote,
            id: `${note.id}:${service.id}`,
          },
          record,
          professional,
          options?.catalogLookup,
        ),
      ),
    )
    .filter((item): item is ClinicalEvolutionItem => item !== null)
}

export function isClinicalItemBillable(item: ClinicalEvolutionItem): boolean {
  return item.isBillable !== false && item.cost > 0
}

/** Reportable en RIPS: tiene CUPS válido y no es procedimiento personalizado interno */
export function isClinicalItemRipsReportable(item: ClinicalEvolutionItem): boolean {
  if (item.isCustomProcedure) return false
  if (item.requiereCupsRips === false) return false
  const cups = normalizeCups(item.cupsCode)
  return Boolean(cups)
}

export function getRipsVrServicioForClinicalItem(item: ClinicalEvolutionItem): number {
  if (!isClinicalItemRipsReportable(item)) return 0
  return isClinicalItemBillable(item) ? item.cost : 0
}

export function requiresDianBilling(items: ClinicalEvolutionItem[]): boolean {
  return items.some((item) => isClinicalItemBillable(item))
}

export function computeDianTotal(items: ClinicalEvolutionItem[]): number {
  return items
    .filter((item) => isClinicalItemBillable(item) || (item.isCustomProcedure && item.cost > 0))
    .reduce((sum, item) => sum + item.cost, 0)
}

export function computeRipsReportableTotal(items: ClinicalEvolutionItem[]): number {
  return items
    .filter(isClinicalItemRipsReportable)
    .reduce((sum, item) => sum + getRipsVrServicioForClinicalItem(item), 0)
}

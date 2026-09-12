import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { EvolutionNote } from '@/types/evolutionNote'
import type { InvoiceItem } from '@/types/invoice'
import type { UserProfile } from '@/types/user'
import type { CheckoutLineItem } from '@/types/consultationCheckout'
import type { ClinicalEvolutionItem } from '@/types/billingAndRips'
import {
  RIPS_OTROS_SERVICIOS_COD_TECNOLOGIA,
  RIPS_OTROS_SERVICIOS_TIPO_OS,
  type RipsExportMetadata,
  type RipsOtroServicio,
} from '@/types/rips'
import { DOCUMENT_TYPE_RIPS, DEMO_PRESTADOR_REPS, RIPS_DEFAULTS } from '@/constants/rips'
import { expandEvolutionNoteServices } from '@/utils/evolutionCatalogServices'
import { isEvolutionNoteExemptFromRips } from '@/utils/evolutionNoteValidation'
import { normalizeCupsCode } from '@/services/catalogService'

const CUPS_PATTERN = /^\d{6}$/

function formatRipsDateTime(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return `${isoDate.slice(0, 10)} 08:00`
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function professionalDocumentType(professional: UserProfile): string {
  return DOCUMENT_TYPE_RIPS[professional.documentType as keyof typeof DOCUMENT_TYPE_RIPS] ?? 'CC'
}

export function isAestheticWithoutCups(input: {
  cupsCode?: string | null
  isCustomProcedure?: boolean
  requiereCupsRips?: boolean
}): boolean {
  if (input.requiereCupsRips === false || input.isCustomProcedure === true) return true
  const cups = normalizeCupsCode(String(input.cupsCode ?? ''))
  return !CUPS_PATTERN.test(cups)
}

export function buildRipsOtroServicio(input: {
  name: string
  unitPrice: number
  quantity?: number
  attentionDate: string
  professional: UserProfile
  metadata: Pick<RipsExportMetadata, 'codPrestador' | 'conceptoRecaudo' | 'valorPagoModerador' | 'numFEVPagoModerador'>
  consecutivo: number
}): RipsOtroServicio {
  const quantity = Math.max(1, input.quantity ?? 1)
  const unitPrice = Math.max(0, Math.round(input.unitPrice))
  return {
    codPrestador: input.metadata.codPrestador || DEMO_PRESTADOR_REPS,
    numAutorizacion: null,
    idMIPRES: null,
    fechaSuministroTecnologia: formatRipsDateTime(input.attentionDate),
    tipoOS: RIPS_OTROS_SERVICIOS_TIPO_OS,
    codTecnologiaSalud: RIPS_OTROS_SERVICIOS_COD_TECNOLOGIA,
    nomTecnologiaSalud: input.name.trim() || 'Servicio estético / insumo',
    cantidadOS: quantity,
    tipoDocumentoIdentificacion: professionalDocumentType(input.professional),
    numDocumentoIdentificacion: input.professional.documentNumber.trim(),
    vrUnitOS: unitPrice,
    vrServicio: unitPrice * quantity,
    conceptoRecaudo: input.metadata.conceptoRecaudo ?? RIPS_DEFAULTS.conceptoRecaudoParticular,
    valorPagoModerador: input.metadata.valorPagoModerador ?? 0,
    numFEVPagoModerador: input.metadata.numFEVPagoModerador ?? null,
    consecutivo: input.consecutivo,
  }
}

export function compileEvolutionNotesToRipsOtrosServicios(
  notes: EvolutionNote[],
  professional: UserProfile,
  metadata: RipsExportMetadata,
  startConsecutivo = 1,
): RipsOtroServicio[] {
  const items: RipsOtroServicio[] = []
  let consecutivo = startConsecutivo

  for (const note of notes) {
    const expanded = expandEvolutionNoteServices(note)
    for (const { note: scoped, service } of expanded) {
      const aesthetic =
        isEvolutionNoteExemptFromRips(scoped) ||
        service.requiereCupsRips === false ||
        isAestheticWithoutCups({
          cupsCode: scoped.cupsCode ?? service.cupsCode,
          requiereCupsRips: scoped.requiereCupsRips ?? service.requiereCupsRips,
        })
      if (!aesthetic) continue
      const name = (service.serviceName || service.procedure || scoped.procedure || '').trim()
      if (!name) continue
      items.push(
        buildRipsOtroServicio({
          name,
          unitPrice: Math.max(0, service.cost ?? scoped.cost ?? 0),
          attentionDate: scoped.date || scoped.createdAt,
          professional,
          metadata,
          consecutivo: consecutivo++,
        }),
      )
    }
  }

  return items
}

export function compileBudgetOtrosServicios(
  record: ClinicalRecord,
  professional: UserProfile,
  metadata: RipsExportMetadata,
  startConsecutivo = 1,
): RipsOtroServicio[] {
  const items: RipsOtroServicio[] = []
  let consecutivo = startConsecutivo
  const attentionDate = record.signedAt ?? record.createdAt

  for (const line of record.budgetItems ?? []) {
    const name = line.procedure?.trim()
    if (!name) continue
    const cups = String(line.cupsCode ?? '')
    const aesthetic =
      cups.toUpperCase().startsWith('CUSTOM_') ||
      isAestheticWithoutCups({ cupsCode: line.cupsCode })
    if (!aesthetic) continue
    items.push(
      buildRipsOtroServicio({
        name,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        attentionDate,
        professional,
        metadata,
        consecutivo: consecutivo++,
      }),
    )
  }

  return items
}

export function compileOtrosServiciosForRecord(
  record: ClinicalRecord,
  professional: UserProfile,
  metadata: RipsExportMetadata,
): RipsOtroServicio[] {
  const fromBudget = compileBudgetOtrosServicios(record, professional, metadata)
  const fromNotes = compileEvolutionNotesToRipsOtrosServicios(
    record.evolutionNotes ?? [],
    professional,
    metadata,
    fromBudget.length + 1,
  )
  return [...fromBudget, ...fromNotes]
}

export function mapInvoiceAestheticItemsToOtrosServicios(
  items: InvoiceItem[],
  professional: UserProfile,
  metadata: RipsExportMetadata,
): RipsOtroServicio[] {
  return items
    .filter((item) =>
      isAestheticWithoutCups({
        cupsCode: item.cupsCode,
        isCustomProcedure: item.isCustomProcedure,
      }),
    )
    .map((item, index) =>
      buildRipsOtroServicio({
        name: item.description,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        attentionDate: item.attentionDate ?? new Date().toISOString(),
        professional,
        metadata,
        consecutivo: index + 1,
      }),
    )
}

export function mapCheckoutCartToOtrosServicios(
  cart: CheckoutLineItem[],
  professional: UserProfile,
  metadata: RipsExportMetadata,
  attentionDate = new Date().toISOString(),
): RipsOtroServicio[] {
  return cart
    .filter((item) => item.ripsGroup === 'otrosServicios' || item.kind === 'aesthetic')
    .map((item, index) =>
      buildRipsOtroServicio({
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        attentionDate,
        professional,
        metadata,
        consecutivo: index + 1,
      }),
    )
}

export function mapClinicalItemsToOtrosServicios(
  items: ClinicalEvolutionItem[],
  professional: UserProfile,
  metadata: RipsExportMetadata,
): RipsOtroServicio[] {
  return items
    .filter(
      (item) =>
        item.isCustomProcedure ||
        item.requiereCupsRips === false ||
        isAestheticWithoutCups({ cupsCode: item.cupsCode, isCustomProcedure: item.isCustomProcedure }),
    )
    .filter((item) => item.cost > 0 || item.isBillable)
    .map((item, index) =>
      buildRipsOtroServicio({
        name: item.procedureName,
        unitPrice: item.cost,
        attentionDate: item.attentionDate,
        professional,
        metadata,
        consecutivo: index + 1,
      }),
    )
}

export function sumOtrosServicios(items: RipsOtroServicio[]): number {
  return items.reduce((sum, item) => sum + (item.vrServicio || 0), 0)
}

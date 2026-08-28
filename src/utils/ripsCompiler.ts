import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { DentalService } from '@/types/dentalServiceCatalog'
import type { EvolutionNote } from '@/types/evolutionNote'
import type { UserProfile } from '@/types/user'
import type { RipsExportMetadata, RipsProcedimiento } from '@/types/rips'
import { DOCUMENT_TYPE_RIPS, RIPS_DEFAULTS, DEMO_PRESTADOR_REPS } from '@/constants/rips'
import { normalizeCupsCode } from '@/services/catalogService'
import { resolveEffectiveCupsForRips } from '@/utils/dentalServiceCatalogRules'
import { isEvolutionNoteExemptFromRips } from '@/utils/evolutionNoteValidation'
import { expandEvolutionNoteServices } from '@/utils/evolutionCatalogServices'
import { calcBillableLineTotal } from '@/utils/cupsBillingRules'
import { expandBillableLinesForRips } from '@/utils/cupsLocationRules'

const CUPS_PATTERN = /^\d{6}$/

function normalizeCie10ForRips(code: string): string {
  return code.replace(/\./g, '').trim().toUpperCase()
}

function formatRipsDateTime(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return isoDate.slice(0, 10) + ' 08:00'
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export type RipsCompileOmissionReason =
  | 'requiere_cups_rips_false'
  | 'missing_cups_code'
  | 'invalid_cups_code'

export interface RipsCompileOmission {
  evolutionNoteId: string
  serviceName?: string
  procedure?: string
  reason: RipsCompileOmissionReason
}

export interface RipsCompileStats {
  budgetProcedureCount: number
  evolutionEligibleCount: number
  evolutionOmittedCount: number
  omissions: RipsCompileOmission[]
}

export interface RipsCompileProcedimientosResult {
  procedimientos: RipsProcedimiento[]
  stats: RipsCompileStats
  nextConsecutivo: number
}

interface BuildProcedimientoContext {
  record: ClinicalRecord
  professional: UserProfile
  metadata: RipsExportMetadata
  principalCode: string
  defaultAtencionDate: string
}

/**
 * Extrae código CUPS (6 dígitos) desde texto libre o etiqueta «89.02.03 — …».
 */
export function extractCupsCodeFromText(text: string | null | undefined): string | null {
  const value = String(text ?? '').trim()
  if (!value) return null

  const dotted = value.match(/\b(\d{2})\.(\d{2})\.(\d{2})\b/)
  if (dotted) {
    const normalized = `${dotted[1]}${dotted[2]}${dotted[3]}`
    return CUPS_PATTERN.test(normalized) ? normalized : null
  }

  const compact = value.match(/\b(\d{6})\b/)
  if (compact && CUPS_PATTERN.test(compact[1])) {
    return compact[1]
  }

  const digits = normalizeCupsCode(value)
  return CUPS_PATTERN.test(digits) ? digits : null
}

/**
 * Resuelve CUPS reportable de una nota de evolución.
 * Retorna null si el servicio está exento de RIPS o no tiene CUPS válido.
 */
export function resolveEvolutionNoteRipsCups(
  note: EvolutionNote,
  serviceCatalog?: {
    requiereCupsRips: boolean
    cupsCode?: string | null
    cupsHomologo?: string | null
  } | null,
): string | null {
  if (isEvolutionNoteExemptFromRips(note)) {
    return null
  }

  if (serviceCatalog && !serviceCatalog.requiereCupsRips) {
    return null
  }

  const fromNoteField = note.cupsCode ? normalizeCupsCode(note.cupsCode) : null
  if (fromNoteField && CUPS_PATTERN.test(fromNoteField)) {
    return fromNoteField
  }

  if (serviceCatalog) {
    const effective = resolveEffectiveCupsForRips({
      requiereCupsRips: serviceCatalog.requiereCupsRips,
      cupsCode: serviceCatalog.cupsCode,
      cupsHomologo: serviceCatalog.cupsHomologo,
    })
    if (effective && CUPS_PATTERN.test(effective)) {
      return effective
    }
  }

  return extractCupsCodeFromText(note.procedure)
}

export function isEvolutionNoteEligibleForRipsProcedimiento(
  note: EvolutionNote,
  serviceCatalog?: {
    requiereCupsRips: boolean
    cupsCode?: string | null
    cupsHomologo?: string | null
  } | null,
): boolean {
  return resolveEvolutionNoteRipsCups(note, serviceCatalog) !== null
}

function buildSingleProcedimiento(
  ctx: BuildProcedimientoContext,
  cupsCode: string,
  atencionDate: string,
  consecutivo: number,
  unitPrice = 0,
  quantity = 1,
  location?: {
    toothNumber?: number | null
    fdiQuadrant?: string | null
    arch?: 'superior' | 'inferior' | null
  },
): RipsProcedimiento {
  const normalizedCups = normalizeCupsCode(cupsCode)

  return {
    codPrestador: ctx.metadata.codPrestador || DEMO_PRESTADOR_REPS,
    fechaInicioAtencion: atencionDate,
    idMIPRES: null,
    numAutorizacion: null,
    codProcedimiento: normalizedCups,
    viaIngresoServicioSalud: RIPS_DEFAULTS.viaIngresoProcedimiento,
    modalidadGrupoServicioTecSal: RIPS_DEFAULTS.modalidadProcedimiento,
    grupoServicios: RIPS_DEFAULTS.grupoServiciosProcedimiento,
    codServicio: ctx.metadata.codServicio ?? RIPS_DEFAULTS.codServicio,
    finalidadTecnologiaSalud: RIPS_DEFAULTS.finalidadProcedimiento,
    tipoDocumentoIdentificacion:
      DOCUMENT_TYPE_RIPS[ctx.professional.documentType as keyof typeof DOCUMENT_TYPE_RIPS] ?? 'CC',
    numDocumentoIdentificacion: ctx.professional.documentNumber.trim(),
    codDiagnosticoPrincipal: ctx.principalCode,
    codDiagnosticoPrincipalCIE11: '',
    nomCodDiagnosticoPrincipalCIE11: '',
    codDiagnosticoRelacionado: ctx.principalCode,
    codComplicacion: null,
    codComplicacionCIE11: '',
    nomComplicacionCIE11: '',
    vrServicio: Math.round(calcBillableLineTotal(unitPrice, quantity, normalizedCups)),
    conceptoRecaudo: ctx.metadata.conceptoRecaudo ?? RIPS_DEFAULTS.conceptoRecaudoParticular,
    valorPagoModerador: ctx.metadata.valorPagoModerador ?? 0,
    numFEVPagoModerador: ctx.metadata.numFEVPagoModerador ?? null,
    consecutivo,
    codigoVIDA: ctx.metadata.codigoVIDA ?? null,
    piezaDental: location?.toothNumber ?? null,
    cuadranteFdi: location?.fdiQuadrant ?? null,
    arcada: location?.arch ?? null,
  }
}

function buildBudgetProcedimientos(
  ctx: BuildProcedimientoContext,
  startConsecutivo: number,
): { procedimientos: RipsProcedimiento[]; nextConsecutivo: number } {
  const items = (ctx.record.budgetItems ?? []).filter(
    (item) => (item.procedure ?? '').trim() && item.cupsCode?.trim(),
  )

  const expanded = expandBillableLinesForRips(
    items.map((item) => ({
      procedure: item.procedure,
      cupsCode: item.cupsCode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      toothNumber: item.toothNumber,
      fdiQuadrant: item.fdiQuadrant,
      arch: item.arch,
    })),
  )

  const procedimientos = expanded.map((item, index) =>
    buildSingleProcedimiento(
      ctx,
      item.cupsCode!,
      ctx.defaultAtencionDate,
      startConsecutivo + index,
      item.unitPrice,
      item.quantity,
      {
        toothNumber: item.toothNumber,
        fdiQuadrant: item.fdiQuadrant,
        arch: item.arch,
      },
    ),
  )

  return {
    procedimientos,
    nextConsecutivo: startConsecutivo + procedimientos.length,
  }
}

export interface EvolutionCatalogLookup {
  (dentalServiceId: string | undefined): {
    requiereCupsRips: boolean
    cupsCode?: string | null
    cupsHomologo?: string | null
    defaultPrice?: number
  } | null
}

/**
 * Motor de compilación — recorre evoluciones y agrega procedimientos RIPS.
 * Omite servicios con `requiere_cups_rips: false` sin error ni huecos en consecutivo.
 */
export function compileEvolutionNotesToRipsProcedimientos(
  notes: EvolutionNote[],
  ctx: BuildProcedimientoContext,
  startConsecutivo: number,
  lookupCatalog?: EvolutionCatalogLookup,
): { procedimientos: RipsProcedimiento[]; omissions: RipsCompileOmission[]; nextConsecutivo: number } {
  const procedimientos: RipsProcedimiento[] = []
  const omissions: RipsCompileOmission[] = []
  let consecutivo = startConsecutivo

  const sorted = [...notes].sort((a, b) => {
    const dateA = new Date(a.date || a.createdAt).getTime()
    const dateB = new Date(b.date || b.createdAt).getTime()
    return dateA - dateB
  })

  for (const note of sorted) {
    const expanded = expandEvolutionNoteServices(note)

    for (const { note: scopedNote, service } of expanded) {
      const catalog = lookupCatalog?.(scopedNote.dentalServiceId) ?? null

      if (isEvolutionNoteExemptFromRips(scopedNote) || catalog?.requiereCupsRips === false) {
        omissions.push({
          evolutionNoteId: note.id,
          serviceName: scopedNote.serviceName,
          procedure: scopedNote.procedure,
          reason: 'requiere_cups_rips_false',
        })
        continue
      }

      const cupsCode = resolveEvolutionNoteRipsCups(scopedNote, catalog ?? undefined)
      if (!cupsCode) {
        omissions.push({
          evolutionNoteId: note.id,
          serviceName: scopedNote.serviceName,
          procedure: scopedNote.procedure,
          reason:
            scopedNote.procedure?.trim() || scopedNote.cupsCode ? 'invalid_cups_code' : 'missing_cups_code',
        })
        continue
      }

      const atencionDate = formatRipsDateTime(scopedNote.date || scopedNote.createdAt || ctx.defaultAtencionDate)
      const unitPrice = service.cost ?? catalog?.defaultPrice ?? 0

      procedimientos.push(
        buildSingleProcedimiento(ctx, cupsCode, atencionDate, consecutivo, unitPrice, 1),
      )
      consecutivo += 1
    }
  }

  return { procedimientos, omissions, nextConsecutivo: consecutivo }
}

/**
 * Compila procedimientos de presupuesto + evoluciones para una atención.
 */
export function compileProcedimientosForRecord(
  record: ClinicalRecord,
  professional: UserProfile,
  metadata: RipsExportMetadata,
  startConsecutivo: number,
  lookupCatalog?: EvolutionCatalogLookup,
): RipsCompileProcedimientosResult {
  const principal = (record.diagnoses ?? []).find((d) => d.type === 'principal') ?? record.diagnoses?.[0]
  const principalCode = principal ? normalizeCie10ForRips(principal.code) : 'Z000'
  const defaultAtencionDate = formatRipsDateTime(record.signedAt ?? record.createdAt)

  const ctx: BuildProcedimientoContext = {
    record,
    professional,
    metadata,
    principalCode,
    defaultAtencionDate,
  }

  const budget = buildBudgetProcedimientos(ctx, startConsecutivo)
  const evolution = compileEvolutionNotesToRipsProcedimientos(
    record.evolutionNotes ?? [],
    ctx,
    budget.nextConsecutivo,
    lookupCatalog,
  )

  return {
    procedimientos: [...budget.procedimientos, ...evolution.procedimientos],
    stats: {
      budgetProcedureCount: budget.procedimientos.length,
      evolutionEligibleCount: evolution.procedimientos.length,
      evolutionOmittedCount: evolution.omissions.length,
      omissions: evolution.omissions,
    },
    nextConsecutivo: evolution.nextConsecutivo,
  }
}

export function createCatalogLookupFromServices(
  services: DentalService[],
): EvolutionCatalogLookup {
  const byId = new Map(services.map((service) => [service.id, service]))
  return (dentalServiceId) => {
    if (!dentalServiceId) return null
    const service = byId.get(dentalServiceId)
    if (!service) return null
    return {
      requiereCupsRips: service.requiereCupsRips,
      cupsCode: service.cupsCode,
      cupsHomologo: service.cupsHomologo,
      defaultPrice: service.defaultPrice,
    }
  }
}

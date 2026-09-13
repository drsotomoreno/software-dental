import type { InvoiceItem } from '@/types/invoice'
import type { RipsProcedimiento, RipsTransaction } from '@/types/rips'
import type { BuildRipsJsonOptions, BuildRipsJsonResult } from '@/types/invoice'
import { buildRipsFromRecords } from '@/utils/rips'
import { validateRipsExport } from '@/utils/ripsValidation'
import { normalizeRipsNumFactura } from '@/utils/fiscalProfile'
import {
  mapInvoiceAestheticItemsToOtrosServicios,
  sumOtrosServicios,
} from '@/utils/ripsOtrosServicios'

const CUPS_PATTERN = /^\d{6}$/

/** Determina si un ítem de factura es reportable en RIPS/MUV como procedimiento CUPS. */
export function isInvoiceItemRipsEligible(item: Pick<InvoiceItem, 'cupsCode' | 'isCustomProcedure'>): boolean {
  if (item.isCustomProcedure === true) return false
  const cups = String(item.cupsCode ?? '').trim()
  if (!cups) return false
  return CUPS_PATTERN.test(cups.replace(/\D/g, '').padStart(6, '0').slice(-6))
}

/** Códigos CUPS elegibles derivados de la factura (para cruzar con procedimientos RIPS). */
export function getRipsEligibleCupsCodes(items: InvoiceItem[]): Set<string> {
  const codes = new Set<string>()
  for (const item of items) {
    if (!isInvoiceItemRipsEligible(item)) continue
    const normalized = item.cupsCode!.replace(/\D/g, '').padStart(6, '0').slice(-6)
    codes.add(normalized)
  }
  return codes
}

function normalizeCups(code: string): string {
  return code.replace(/\D/g, '').padStart(6, '0').slice(-6)
}

function filterProcedimientosForInvoice(
  procedimientos: RipsProcedimiento[],
  eligibleCups: Set<string>,
): RipsProcedimiento[] {
  return procedimientos
    .filter((proc) => {
      const code = normalizeCups(proc.codProcedimiento)
      if (!CUPS_PATTERN.test(code)) return false
      if (eligibleCups.size === 0) return true
      return eligibleCups.has(code)
    })
    .map((proc, index) => ({
      ...proc,
      consecutivo: index + 1,
    }))
}

function sumProcedimientoValues(procedimientos: RipsProcedimiento[]): number {
  return procedimientos.reduce((sum, proc) => sum + (proc.vrServicio || 0), 0)
}

function sumConsultaValues(rips: RipsTransaction): number {
  return rips.usuarios.reduce(
    (sum, usuario) =>
      sum + usuario.servicios.consultas.reduce((inner, consulta) => inner + (consulta.vrServicio || 0), 0),
    0,
  )
}

/**
 * Compila el JSON RIPS asociado a una factura.
 *
 * REGLA DE NEGOCIO:
 * - Procedimientos CUPS van a `servicios.procedimientos`.
 * - Ítems estéticos/insumos (sin CUPS, isCustomProcedure) van a `servicios.otrosServicios`
 *   con el nombre literal que se envía a la DIAN.
 * - El total DIAN debe coincidir con procedimientos + otrosServicios (+ consultas).
 */
export function buildRipsJson(options: BuildRipsJsonOptions): BuildRipsJsonResult {
  const { invoice, sources, professional, metadata, catalogLookup } = options
  const aestheticItems = invoice.items.filter((item) => !isInvoiceItemRipsEligible(item))
  const eligibleCups = getRipsEligibleCupsCodes(invoice.items)

  const exportResult = buildRipsFromRecords(sources, professional, metadata, { catalogLookup })
  const fromInvoice = mapInvoiceAestheticItemsToOtrosServicios(
    aestheticItems,
    professional,
    metadata,
  )

  const filteredUsuarios = exportResult.rips.usuarios.map((usuario, userIndex) => {
    const filteredProcedimientos = filterProcedimientosForInvoice(
      usuario.servicios.procedimientos,
      eligibleCups,
    )
    const mergedOtros = [
      ...usuario.servicios.otrosServicios,
      ...(userIndex === 0 ? fromInvoice : []),
    ].map((item, index) => ({ ...item, consecutivo: index + 1 }))

    return {
      ...usuario,
      servicios: {
        ...usuario.servicios,
        procedimientos: filteredProcedimientos,
        otrosServicios: mergedOtros,
      },
    }
  })

  const rips: RipsTransaction = {
    ...exportResult.rips,
    numFactura: normalizeRipsNumFactura(metadata.numFactura ?? invoice.invoiceNumber),
    usuarios: filteredUsuarios,
  }

  const ripsReportableTotal =
    sumConsultaValues(rips) +
    filteredUsuarios.reduce(
      (sum, usuario) =>
        sum +
        sumProcedimientoValues(usuario.servicios.procedimientos) +
        sumOtrosServicios(usuario.servicios.otrosServicios),
      0,
    )

  const validationIssues = validateRipsExport(rips, sources, professional, metadata)

  return {
    rips,
    issues: [...exportResult.issues, ...validationIssues],
    ripsReportableTotal,
    excludedLineCount: 0,
    excludedItems: [],
  }
}

export function summarizeRipsData(rips: RipsTransaction) {
  let consultaCount = 0
  let procedimientoCount = 0
  let otrosCount = 0
  let totalVrServicios = 0

  for (const usuario of rips.usuarios) {
    consultaCount += usuario.servicios.consultas.length
    procedimientoCount += usuario.servicios.procedimientos.length
    otrosCount += usuario.servicios.otrosServicios.length
    totalVrServicios += usuario.servicios.consultas.reduce((s, c) => s + c.vrServicio, 0)
    totalVrServicios += usuario.servicios.procedimientos.reduce((s, p) => s + p.vrServicio, 0)
    totalVrServicios += usuario.servicios.otrosServicios.reduce((s, p) => s + p.vrServicio, 0)
  }

  return {
    numFactura: rips.numFactura,
    numDocumentoIdObligado: rips.numDocumentoIdObligado,
    usuarioCount: rips.usuarios.length,
    consultaCount,
    procedimientoCount,
    otrosServiciosCount: otrosCount,
    totalVrServicios,
  }
}

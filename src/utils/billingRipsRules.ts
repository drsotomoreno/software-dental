import type { ClinicalEvolutionItem, BillingValidationIssue, RipsProcedureItem } from '@/types/billingAndRips'
import type { RipsProcedimiento, RipsTransaction } from '@/types/rips'
import { normalizeCie10ForRips } from '@/utils/rips'
import {
  getRipsVrServicioForClinicalItem,
  isClinicalItemBillable,
  isClinicalItemRipsReportable,
} from '@/utils/clinicalSessionItems'

const CUPS_PATTERN = /^\d{6}$/

function normalizeCups(code: string): string {
  return code.replace(/\D/g, '').padStart(6, '0').slice(-6)
}

export function validateClinicalItems(items: ClinicalEvolutionItem[]): BillingValidationIssue[] {
  const issues: BillingValidationIssue[] = []

  if (items.length === 0) {
    issues.push({
      level: 'error',
      message: 'La sesión clínica no tiene procedimientos para procesar.',
    })
    return issues
  }

  for (const item of items) {
    const billable = isClinicalItemBillable(item)
    const ripsReportable = isClinicalItemRipsReportable(item)

    if (billable && !item.cie10Code?.trim()) {
      issues.push({
        level: 'error',
        field: 'cie10Code',
        itemId: item.id,
        message: `«${item.procedureName}»: atención facturable requiere diagnóstico CIE-10.`,
      })
    }

    if (billable && ripsReportable && !item.cupsCode?.trim()) {
      issues.push({
        level: 'error',
        field: 'cupsCode',
        itemId: item.id,
        message: `«${item.procedureName}»: procedimiento asistencial facturable requiere CUPS.`,
      })
    }

    if (
      billable &&
      !ripsReportable &&
      !item.isCustomProcedure &&
      item.requiereCupsRips !== false
    ) {
      issues.push({
        level: 'error',
        field: 'isCustomProcedure',
        itemId: item.id,
        message:
          `«${item.procedureName}»: marque como procedimiento personalizado o asigne CUPS válido.`,
      })
    }

    if (!billable && ripsReportable && !item.cie10Code?.trim()) {
      issues.push({
        level: 'warning',
        field: 'cie10Code',
        itemId: item.id,
        message: `«${item.procedureName}»: se recomienda CIE-10 para RIPS a valor $0.`,
      })
    }
  }

  const hasRips = items.some(isClinicalItemRipsReportable)
  if (!hasRips && items.every((item) => item.isCustomProcedure || item.requiereCupsRips === false)) {
    issues.push({
      level: 'warning',
      message:
        'La sesión no contiene procedimientos CUPS reportables. Solo se procesará facturación DIAN si aplica.',
    })
  }

  return issues
}

export function hasBlockingBillingIssues(issues: BillingValidationIssue[]): boolean {
  return issues.some((issue) => issue.level === 'error')
}

/**
 * Aplica reglas MinSalud:
 * - Procedimientos CUPS no facturables → vrServicio: 0 (sí van al RIPS)
 * - Personalizados → excluidos del RIPS
 */
export function applyClinicalRulesToRips(
  rips: RipsTransaction,
  clinicalItems: ClinicalEvolutionItem[],
): { rips: RipsTransaction; procedureItems: RipsProcedureItem[] } {
  const ripsItems = clinicalItems.filter(isClinicalItemRipsReportable)
  const cupsToVr = new Map<string, number>()

  for (const item of ripsItems) {
    const cups = normalizeCups(item.cupsCode!)
    cupsToVr.set(cups, getRipsVrServicioForClinicalItem(item))
  }

  const procedureItems: RipsProcedureItem[] = []
  let consecutivo = 1

  const usuarios = rips.usuarios.map((usuario) => {
    const procedimientos = usuario.servicios.procedimientos
      .filter((proc) => {
        const code = normalizeCups(proc.codProcedimiento)
        return CUPS_PATTERN.test(code) && cupsToVr.has(code)
      })
      .map((proc) => {
        const code = normalizeCups(proc.codProcedimiento)
        const vrServicio = cupsToVr.get(code) ?? 0
        const next: RipsProcedimiento = {
          ...proc,
          vrServicio,
          consecutivo: consecutivo++,
          codDiagnosticoPrincipal: normalizeCie10ForRips(
            ripsItems.find((item) => normalizeCups(item.cupsCode!) === code)?.cie10Code ||
              proc.codDiagnosticoPrincipal,
          ),
        }
        procedureItems.push({
          codProcedimiento: code,
          codDiagnosticoPrincipal: next.codDiagnosticoPrincipal,
          fechaInicioAtencion: proc.fechaInicioAtencion,
          vrServicio,
          consecutivo: next.consecutivo,
          sourceId: ripsItems.find((item) => normalizeCups(item.cupsCode!) === code)?.sourceId,
        })
        return next
      })

    const consultas = usuario.servicios.consultas.map((consulta) => {
      const billableConsult = clinicalItems.some(
        (item) => item.sourceType === 'consultation' && isClinicalItemBillable(item),
      )
      return {
        ...consulta,
        vrServicio: billableConsult ? consulta.vrServicio : 0,
      }
    })

    return {
      ...usuario,
      servicios: {
        ...usuario.servicios,
        consultas,
        procedimientos,
      },
    }
  })

  return {
    rips: { ...rips, usuarios },
    procedureItems,
  }
}

export function buildRipsOnlyReference(sessionId: string): string {
  const date = new Date()
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  const suffix = sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || '000001'
  return `CTRL${ymd}${suffix}`
}

import type { DentalImplantsBudget } from '../types/clinicalRecord.ts'
import type { DentalImplantsAnnex } from '../types/specializedAnnexes.ts'

/** Hay montos capturados (no basta `active` vacío / fantasma). */
export function dentalImplantsBudgetHasMonetaryValues(
  budget: DentalImplantsBudget | null | undefined,
): boolean {
  if (!budget) return false
  const lines = [budget.implantPlacement, budget.prosthetics]
  return lines.some((line) => {
    if (!line) return false
    return Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitPrice) || 0) > 0
  })
}

/** El anexo de implantes ya tiene procedimientos planeados. */
export function dentalImplantsAnnexHasPlannedProcedures(
  annex: DentalImplantsAnnex | null | undefined,
): boolean {
  if (!annex) return false
  if ((annex.implantPlacementPlan?.implants?.length ?? 0) > 0) return true
  if ((annex.visualTreatmentPlan?.length ?? 0) > 0) return true
  if (annex.protesisTotal || annex.protesisParcialRemovible) return true
  if (Object.keys(annex.restorationDetails ?? {}).length > 0) return true
  const surgicalPlan = annex.surgicalRiskAssessment?.treatmentPlan ?? []
  return surgicalPlan.some(
    (line) => Boolean(line.procedure?.trim()) || Boolean(line.cupsCode?.trim()),
  )
}

/**
 * Caja teal de presupuesto de implantes (sección 8):
 * - plan del anexo de implantes, o
 * - presupuesto incluido con montos reales.
 * Un `active: true` sin montos (fantasma) no debe mostrarla.
 */
export function shouldShowDentalImplantsBudgetSection(
  dentalImplantsBudget: DentalImplantsBudget | null | undefined,
  dentalImplantsAnnex?: DentalImplantsAnnex | null,
): boolean {
  if (dentalImplantsAnnexHasPlannedProcedures(dentalImplantsAnnex)) return true
  if (
    dentalImplantsBudget?.active &&
    dentalImplantsBudgetHasMonetaryValues(dentalImplantsBudget)
  ) {
    return true
  }
  return false
}

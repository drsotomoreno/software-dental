import type { BudgetLineItem } from '@/types/clinicalRecord'
import { validateProcedureLocations, type CupsLocationValidationIssue } from './cupsLocationRules'

export function validateClinicalBudgetForRips(
  budgetItems: BudgetLineItem[],
): CupsLocationValidationIssue[] {
  return validateProcedureLocations(
    budgetItems
      .filter((item) => item.procedure.trim())
      .map((item) => ({
        procedure: item.procedure,
        cupsCode: item.cupsCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        toothNumber: item.toothNumber,
        fdiQuadrant: item.fdiQuadrant,
        arch: item.arch,
      })),
  )
}

export function getFirstBlockingClinicalBudgetIssue(
  budgetItems: BudgetLineItem[],
): CupsLocationValidationIssue | undefined {
  return validateClinicalBudgetForRips(budgetItems).find((issue) => issue.level === 'error')
}

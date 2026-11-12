export function generalBudgetHasContent(form: unknown): boolean
export function mergeBudgetItems(left: unknown, right: unknown): unknown[]
export function preferBudgetSummary(existing: unknown, incoming: unknown): unknown
export function preferGeneralBudgetSections(
  existing: unknown,
  incoming: unknown,
): { budgetItems: unknown[]; budget: unknown }
export function mergeClinicalBudgetSections(
  base: unknown,
  incoming: unknown,
): { budgetItems: unknown[]; budget: unknown }
export function withMergedClinicalBudgets<T>(winner: T, other: unknown): T

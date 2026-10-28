export interface OrthodonticsBudgetLine {
  quantity: number
  unitPrice: number
}

export interface OrthodonticsBudget {
  active: boolean
  initialInstallment: OrthodonticsBudgetLine
  controls: OrthodonticsBudgetLine
  retainers: OrthodonticsBudgetLine
}

export function mapAnnexBudgetToClinicalBudget(
  orthodontics:
    | {
        treatmentType?: string | null
        orthodonticBudget?: {
          kind: string
          values: Record<string, unknown>
        } | null
      }
    | null
    | undefined,
): OrthodonticsBudget | null

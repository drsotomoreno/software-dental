import type {
  BudgetLineItem,
  BudgetSummary,
  DentalImplantsBudget,
  OrthodonticsBudget,
  TreatmentPlanItem,
} from '@/types/clinicalRecord'
import { lineSubtotal } from '@/utils/budget'
import { formatCurrency } from '@/utils/crypto'
import { calcBillableLineTotal } from '@/utils/cupsBillingRules'
import { formatAnatomicalZone } from '@/utils/treatmentPlanZone'

export interface TreatmentPlanTabletInput {
  treatmentPlan: TreatmentPlanItem[]
  treatmentPlanNotes?: string
  budgetItems: BudgetLineItem[]
  orthodonticsBudget?: OrthodonticsBudget
  dentalImplantsBudget?: DentalImplantsBudget
  budget: BudgetSummary
}

function money(value: number): string {
  return formatCurrency(Number.isFinite(value) ? value : 0)
}

/**
 * Texto que el paciente lee en la tableta antes de firmar
 * la autorización del plan de tratamiento y el presupuesto.
 */
export function buildTreatmentPlanAuthorizationText(input: TreatmentPlanTabletInput): string {
  const planLines = (input.treatmentPlan ?? []).filter(
    (item) => item.procedure?.trim() || item.cupsCode || (item.unitPrice ?? 0) > 0,
  )
  const planBlock = planLines.length
    ? planLines
        .map((item, index) => {
          const zone = formatAnatomicalZone(item)
          const procedure = [item.procedure?.trim(), item.cupsCode?.trim()]
            .filter(Boolean)
            .join(' · ')
          const bits = [`${index + 1}. ${procedure || 'Procedimiento'}`]
          if (zone) bits.push(`Zona: ${zone}`)
          if (item.quantity) bits.push(`Cantidad: ${item.quantity}`)
          bits.push(`Valor: ${money(item.unitPrice)}`)
          if (item.notes?.trim()) bits.push(item.notes.trim())
          return bits.join(' — ')
        })
        .join('\n')
    : 'Sin procedimientos en el plan de tratamiento.'

  const notes = input.treatmentPlanNotes?.trim()
    ? `\n\nObservaciones del plan\n${input.treatmentPlanNotes.trim()}`
    : ''

  const budgetLines = (input.budgetItems ?? []).filter((item) => item.procedure?.trim())
  const budgetBlock = budgetLines.length
    ? budgetLines
        .map((item, index) => {
          const zone = formatAnatomicalZone(item)
          const lineTotal = calcBillableLineTotal(item.unitPrice, item.quantity, item.cupsCode)
          const bits = [`${index + 1}. ${item.procedure.trim()}`]
          if (zone) bits.push(`Zona: ${zone}`)
          bits.push(`Cantidad: ${item.quantity}`)
          bits.push(`Unitario: ${money(item.unitPrice)}`)
          bits.push(`Subtotal: ${money(lineTotal)}`)
          return bits.join(' — ')
        })
        .join('\n')
    : 'Sin ítems en el presupuesto general.'

  const extras: string[] = []
  const ortho = input.orthodonticsBudget
  if (ortho?.active) {
    extras.push('Ortodoncia')
    extras.push(`Cuota inicial: ${money(lineSubtotal(ortho.initialInstallment))}`)
    extras.push(`Controles: ${money(lineSubtotal(ortho.controls))}`)
    extras.push(`Retenedores: ${money(lineSubtotal(ortho.retainers))}`)
  }
  const implants = input.dentalImplantsBudget
  if (implants?.active) {
    extras.push('Implantes')
    extras.push(`Colocación: ${money(lineSubtotal(implants.implantPlacement))}`)
    extras.push(`Prótesis: ${money(lineSubtotal(implants.prosthetics))}`)
  }

  const summary = input.budget
  return [
    'PLAN DE TRATAMIENTO',
    `${planBlock}${notes}`,
    '',
    'PRESUPUESTO',
    budgetBlock,
    extras.length ? extras.join('\n') : '',
    '',
    `Subtotal: ${money(summary?.subtotal ?? 0)}`,
    `Descuento: ${money(summary?.discount ?? 0)}`,
    `Total: ${money(summary?.total ?? 0)}`,
  ]
    .filter((part) => part !== '')
    .join('\n')
}

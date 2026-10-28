/**
 * Mapea el presupuesto de la calculadora del anexo → presupuesto clínico.
 * Solo montos cuentan: el nº de cuotas del plan no es valor económico.
 * `null` = el anexo no aporta montos; no se debe borrar el presupuesto clínico.
 */

function mapMultiPhaseAnnexBudgetToClinical(annexBudget) {
  const phases = Array.isArray(annexBudget?.values?.phases) ? annexBudget.values.phases : []
  const initialTotal = phases.reduce((sum, phase) => sum + (Number(phase?.initialPayment) || 0), 0)
  const controlsCount = phases.reduce(
    (sum, phase) => sum + (Number(phase?.monthlyControlsCount) || 0),
    0,
  )
  const controlsTotal = phases.reduce(
    (sum, phase) =>
      sum + (Number(phase?.monthlyControlsCount) || 0) * (Number(phase?.pricePerControl) || 0),
    0,
  )
  const retainerPrice = Number(annexBudget?.values?.retainerPrice) || 0
  const hasMonetaryValues = initialTotal > 0 || controlsTotal > 0 || retainerPrice > 0

  if (!hasMonetaryValues) return null

  return {
    active: true,
    initialInstallment: { quantity: 1, unitPrice: initialTotal },
    controls: {
      quantity: controlsCount,
      unitPrice: controlsCount > 0 ? controlsTotal / controlsCount : 0,
    },
    retainers: { quantity: 1, unitPrice: retainerPrice },
  }
}

/**
 * @param {{ treatmentType?: string | null, orthodonticBudget?: object | null } | null | undefined} orthodontics
 * @returns {object | null}
 */
export function mapAnnexBudgetToClinicalBudget(orthodontics) {
  if (!orthodontics?.treatmentType) return null
  const annexBudget = orthodontics.orthodonticBudget
  if (!annexBudget) return null

  if (annexBudget.kind === 'standard') {
    const values = annexBudget.values ?? {}
    const initialPayment = Number(values.initialPayment) || 0
    const pricePerControl = Number(values.pricePerControl) || 0
    const retainerPrice = Number(values.retainerPrice) || 0
    const hasMonetaryValues =
      initialPayment > 0 || pricePerControl > 0 || retainerPrice > 0

    if (!hasMonetaryValues) return null

    return {
      active: true,
      initialInstallment: { quantity: 1, unitPrice: initialPayment },
      controls: {
        quantity: Number(values.monthlyControlsCount) || 0,
        unitPrice: pricePerControl,
      },
      retainers: { quantity: 1, unitPrice: retainerPrice },
    }
  }

  if (annexBudget.kind === 'multi_phase') {
    return mapMultiPhaseAnnexBudgetToClinical(annexBudget)
  }

  return null
}

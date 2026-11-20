import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type {
  BudgetLineItem,
  BudgetSummary,
  DentalImplantsBudget,
  OrthodonticsBudget,
  TreatmentPlanItem,
} from '@/types/clinicalRecord'
import type { DentalImplantsAnnex, OrthodonticsAnnex } from '@/types/specializedAnnexes'
import { DEFAULT_IVA_RATE } from '@/types/pricing'
import { computeBudgetTotals } from '@/hooks/useBudget'
import { BudgetModule } from '@/modules/budget/BudgetModule'
import { useTariffSync } from '@/modules/tariff/useTariffSync'
import {
  calcSpecialtyBudgetTotal,
  formatCurrency,
  normalizeDentalImplantsBudget,
  normalizeOrthodonticsBudget,
} from '@/utils'
import { mapBudgetItemsToLines, mapLinesToBudgetItems } from '@/utils/budgetAdapter'
import { OrthodonticsBudgetSection } from './OrthodonticsBudgetSection'
import { DentalImplantsBudgetSection } from './DentalImplantsBudgetSection'
import { FieldVoiceHeader } from '@/components/voice'
import { parseDictatedInteger } from '@/utils/voiceDictation'
import { calcBillableLineTotal } from '@/utils/cupsBillingRules'
import {
  omitOrthodonticsPackageBudgetLines,
  shouldShowOrthodonticsBudgetSection,
} from '@/utils/orthodonticsBudgetLines'
import { shouldShowDentalImplantsBudgetSection } from '@/utils/dentalImplantsBudgetLines'

interface BudgetFormProps {
  budgetItems: BudgetLineItem[]
  orthodonticsBudget?: OrthodonticsBudget
  dentalImplantsBudget?: DentalImplantsBudget
  dentalImplantsAnnex?: DentalImplantsAnnex | null
  orthodonticsAnnex?: OrthodonticsAnnex | null
  budget: BudgetSummary
  treatmentPlan: TreatmentPlanItem[]
  disabled?: boolean
  /**
   * Modo unificado (sección 7): sin título ni tabla de líneas (viven en TreatmentPlanForm).
   * Solo especialidades + descuento/total.
   */
  unifiedCompanion?: boolean
  onChange: (patch: {
    budgetItems: BudgetLineItem[]
    orthodonticsBudget: OrthodonticsBudget
    dentalImplantsBudget: DentalImplantsBudget
    budget: BudgetSummary
  }) => void
  onOrthodonticsAnnexChange?: (patch: Partial<OrthodonticsAnnex>) => void
}

function buildClinicalBudgetSummary(
  lineSubtotal: number,
  globalDiscount: number,
  orthodontics: OrthodonticsBudget,
  dentalImplants: DentalImplantsBudget,
): BudgetSummary {
  const specialtySubtotal = calcSpecialtyBudgetTotal(orthodontics, dentalImplants)
  const combinedSubtotal = lineSubtotal + specialtySubtotal
  const taxableBase = Math.max(0, combinedSubtotal - globalDiscount)
  const total = taxableBase + Math.round(taxableBase * DEFAULT_IVA_RATE)

  return {
    subtotal: combinedSubtotal,
    discount: globalDiscount,
    total,
    currency: 'COP',
  }
}

export function BudgetForm({
  budgetItems,
  orthodonticsBudget: orthodonticsBudgetProp,
  dentalImplantsBudget: dentalImplantsBudgetProp,
  dentalImplantsAnnex = null,
  orthodonticsAnnex = null,
  budget,
  treatmentPlan,
  disabled = false,
  unifiedCompanion = true,
  onChange,
  onOrthodonticsAnnexChange,
}: BudgetFormProps) {
  const orthodonticsBudget = normalizeOrthodonticsBudget(orthodonticsBudgetProp)
  const dentalImplantsBudget = normalizeDentalImplantsBudget(dentalImplantsBudgetProp)
  const { user } = useAuth()
  useTariffSync(user?.id)

  const [showOrthodonticBudget, setShowOrthodonticBudget] = useState(false)
  const orthodonticBudgetVisible =
    showOrthodonticBudget ||
    Boolean(orthodonticsAnnex?.treatmentType) ||
    Boolean(orthodonticsAnnex?.orthodonticBudget)

  const clinicalBudgetItems = useMemo(
    () => omitOrthodonticsPackageBudgetLines(budgetItems, treatmentPlan),
    [budgetItems, treatmentPlan],
  )

  const moduleItems = useMemo(
    () => mapLinesToBudgetItems(clinicalBudgetItems),
    [clinicalBudgetItems],
  )

  const omittedPackageKey = useMemo(() => {
    if (clinicalBudgetItems.length === budgetItems.length) return ''
    return budgetItems
      .filter((item) => !clinicalBudgetItems.some((kept) => kept.id === item.id))
      .map((item) => item.id)
      .join('\0')
  }, [budgetItems, clinicalBudgetItems])

  const persistedOmissionRef = useRef('')

  const lineTotals = useMemo(
    () => computeBudgetTotals(moduleItems, budget.discount, DEFAULT_IVA_RATE),
    [moduleItems, budget.discount],
  )

  useEffect(() => {
    if (disabled || !omittedPackageKey || persistedOmissionRef.current === omittedPackageKey) {
      return
    }
    persistedOmissionRef.current = omittedPackageKey
    const subtotal = clinicalBudgetItems.reduce(
      (sum, line) => sum + calcBillableLineTotal(line.unitPrice, line.quantity, line.cupsCode),
      0,
    )
    onChange({
      budgetItems: clinicalBudgetItems,
      orthodonticsBudget,
      dentalImplantsBudget,
      budget: buildClinicalBudgetSummary(
        subtotal,
        budget.discount,
        orthodonticsBudget,
        dentalImplantsBudget,
      ),
    })
  }, [
    disabled,
    omittedPackageKey,
    clinicalBudgetItems,
    orthodonticsBudget,
    dentalImplantsBudget,
    budget.discount,
    onChange,
  ])

  const emitItemsWithDiscount = (
    items: ReturnType<typeof mapLinesToBudgetItems>,
    discount: number,
  ) => {
    const lines = mapBudgetItemsToLines(items, clinicalBudgetItems)
    const subtotal = computeBudgetTotals(items, discount, DEFAULT_IVA_RATE).subtotal
    onChange({
      budgetItems: lines,
      orthodonticsBudget,
      dentalImplantsBudget,
      budget: buildClinicalBudgetSummary(subtotal, discount, orthodonticsBudget, dentalImplantsBudget),
    })
  }

  const emitDiscountOnly = (discount: number) => {
    onChange({
      budgetItems: clinicalBudgetItems,
      orthodonticsBudget,
      dentalImplantsBudget,
      budget: buildClinicalBudgetSummary(
        lineTotals.subtotal,
        Math.max(0, discount),
        orthodonticsBudget,
        dentalImplantsBudget,
      ),
    })
  }

  const emitOrtho = (ortho: OrthodonticsBudget) => {
    onChange({
      budgetItems: clinicalBudgetItems,
      orthodonticsBudget: ortho,
      dentalImplantsBudget,
      budget: buildClinicalBudgetSummary(
        lineTotals.subtotal,
        budget.discount,
        ortho,
        dentalImplantsBudget,
      ),
    })
  }

  const emitImplants = (implants: DentalImplantsBudget) => {
    onChange({
      budgetItems: clinicalBudgetItems,
      orthodonticsBudget,
      dentalImplantsBudget: implants,
      budget: buildClinicalBudgetSummary(
        lineTotals.subtotal,
        budget.discount,
        orthodonticsBudget,
        implants,
      ),
    })
  }

  const combinedSummary = buildClinicalBudgetSummary(
    lineTotals.subtotal,
    budget.discount,
    orthodonticsBudget,
    dentalImplantsBudget,
  )

  const showOrthodonticsBudget = shouldShowOrthodonticsBudgetSection(
    orthodonticsBudget,
    treatmentPlan,
  )
  const showDentalImplantsBudget = shouldShowDentalImplantsBudgetSection(
    dentalImplantsBudget,
    dentalImplantsAnnex,
  )
  const hasSpecialtyBudget =
    (showOrthodonticsBudget && orthodonticsBudget.active) ||
    (showDentalImplantsBudget && dentalImplantsBudget.active)

  const showSummary =
    clinicalBudgetItems.length > 0 || hasSpecialtyBudget || combinedSummary.total > 0

  return (
    <section className={unifiedCompanion ? 'space-y-4' : 'card'}>
      {!unifiedCompanion ? (
        <h3 className="mb-2 text-base font-semibold text-slate-800">
          Presupuesto (legado) <span className="text-red-500">*</span>
        </h3>
      ) : null}

      {!unifiedCompanion && (!disabled || clinicalBudgetItems.length > 0) ? (
        <BudgetModule
          items={moduleItems}
          globalDiscount={budget.discount}
          disabled={disabled}
          onItemsChange={(items) => emitItemsWithDiscount(items, budget.discount)}
          onGlobalDiscountChange={(discount) => emitItemsWithDiscount(moduleItems, discount)}
          hideSummary
          onAddOrthodonticsBudget={
            onOrthodonticsAnnexChange && !disabled && !orthodonticBudgetVisible
              ? () => setShowOrthodonticBudget(true)
              : undefined
          }
        />
      ) : null}

      {/* Caja verde solo si el bloque del anexo unificado no está visible. */}
      {showOrthodonticsBudget && !orthodonticBudgetVisible && (
        <OrthodonticsBudgetSection
          orthodonticsBudget={orthodonticsBudget}
          disabled={disabled}
          onChange={emitOrtho}
        />
      )}

      {showDentalImplantsBudget && (
        <DentalImplantsBudgetSection
          dentalImplantsBudget={dentalImplantsBudget}
          disabled={disabled}
          onChange={emitImplants}
        />
      )}

      {clinicalBudgetItems.length === 0 && !hasSpecialtyBudget && disabled && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Agregue tratamientos al plan de tratamiento y presupuesto.
        </p>
      )}

      {showSummary && (
        <div className="mt-2 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700">
          <div>
            <span className="text-sm text-slate-500 dark:text-slate-400">Subtotal clínico</span>
            <p className="text-lg font-semibold">{formatCurrency(combinedSummary.subtotal)}</p>
          </div>
          <div>
            <span className="text-sm text-slate-500 dark:text-slate-400">IVA excluido (0%)</span>
            <p className="text-lg font-semibold">{formatCurrency(0)}</p>
          </div>
          <div>
            <FieldVoiceHeader
              label="Descuento global (COP)"
              targetInputId="budget-form-global-discount"
              disabled={disabled}
              getValue={() => String(budget.discount || '')}
              onValueChange={(text) => {
                const parsed = parseDictatedInteger(text)
                if (parsed != null) emitDiscountOnly(Math.max(0, parsed))
              }}
            />
            <input
              id="budget-form-global-discount"
              type="number"
              min={0}
              disabled={disabled}
              value={budget.discount}
              onChange={(e) => emitDiscountOnly(Number(e.target.value))}
              className="input-field"
            />
          </div>
          <div>
            <span className="text-sm text-slate-500 dark:text-slate-400">Total estimado</span>
            <p className="text-xl font-bold text-dental-700 dark:text-dental-400">
              {formatCurrency(combinedSummary.total)}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}

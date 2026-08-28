import { useMemo } from 'react'

import { useAuth } from '@/contexts/AuthContext'

import type {

  BudgetLineItem,

  BudgetSummary,

  DentalImplantsBudget,

  OrthodonticsBudget,

  TreatmentPlanItem,

} from '@/types/clinicalRecord'

import { DEFAULT_IVA_RATE } from '@/types/pricing'

import {

  CLINICAL_HISTORY_SECTION_NUMBERS,

  CLINICAL_SECTION_TITLE_CLASS,

  clinicalSectionTitle,

} from '@/constants/clinicalHistorySections'

import { computeBudgetTotals } from '@/hooks/useBudget'

import { BudgetModule } from '@/modules/budget/BudgetModule'

import { useTariffSync } from '@/modules/tariff/useTariffSync'

import {

  buildBudgetFromTreatmentPlan,

  calcSpecialtyBudgetTotal,

  formatCurrency,

  normalizeDentalImplantsBudget,

  normalizeOrthodonticsBudget,

} from '@/utils'

import {

  mapBudgetItemsToLines,

  mapLinesToBudgetItems,

} from '@/utils/budgetAdapter'

import { OrthodonticsBudgetSection } from './OrthodonticsBudgetSection'

import { DentalImplantsBudgetSection } from './DentalImplantsBudgetSection'

import { FieldVoiceHeader } from '@/components/voice'

import { parseDictatedInteger } from '@/utils/voiceDictation'



interface BudgetFormProps {

  budgetItems: BudgetLineItem[]

  orthodonticsBudget?: OrthodonticsBudget

  dentalImplantsBudget?: DentalImplantsBudget

  budget: BudgetSummary

  treatmentPlan: TreatmentPlanItem[]

  disabled?: boolean

  onChange: (patch: {

    budgetItems: BudgetLineItem[]

    orthodonticsBudget: OrthodonticsBudget

    dentalImplantsBudget: DentalImplantsBudget

    budget: BudgetSummary

  }) => void

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

  budget,

  treatmentPlan,

  disabled = false,

  onChange,

}: BudgetFormProps) {

  const orthodonticsBudget = normalizeOrthodonticsBudget(orthodonticsBudgetProp)

  const dentalImplantsBudget = normalizeDentalImplantsBudget(dentalImplantsBudgetProp)

  const { user } = useAuth()

  useTariffSync(user?.id)



  const moduleItems = useMemo(() => mapLinesToBudgetItems(budgetItems), [budgetItems])



  const lineTotals = useMemo(

    () => computeBudgetTotals(moduleItems, budget.discount, DEFAULT_IVA_RATE),

    [moduleItems, budget.discount],

  )



  const emitItemsWithDiscount = (

    items: ReturnType<typeof mapLinesToBudgetItems>,

    discount: number,

  ) => {

    const lines = mapBudgetItemsToLines(items, budgetItems)

    const subtotal = computeBudgetTotals(items, discount, DEFAULT_IVA_RATE).subtotal

    onChange({

      budgetItems: lines,

      orthodonticsBudget,

      dentalImplantsBudget,

      budget: buildClinicalBudgetSummary(subtotal, discount, orthodonticsBudget, dentalImplantsBudget),

    })

  }



  const emitOrtho = (ortho: OrthodonticsBudget) => {

    onChange({

      budgetItems,

      orthodonticsBudget: ortho,

      dentalImplantsBudget,

      budget: buildClinicalBudgetSummary(lineTotals.subtotal, budget.discount, ortho, dentalImplantsBudget),

    })

  }



  const emitImplants = (implants: DentalImplantsBudget) => {

    onChange({

      budgetItems,

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



  const importFromTreatmentPlan = () => {

    const lines = buildBudgetFromTreatmentPlan(treatmentPlan, budgetItems)

    const items = mapLinesToBudgetItems(lines)

    emitItemsWithDiscount(items, budget.discount)

  }



  const combinedSummary = buildClinicalBudgetSummary(

    lineTotals.subtotal,

    budget.discount,

    orthodonticsBudget,

    dentalImplantsBudget,

  )



  const hasSpecialtyBudget = orthodonticsBudget.active || dentalImplantsBudget.active



  return (

    <section className="card">

      <h3 className={`mb-2 ${CLINICAL_SECTION_TITLE_CLASS}`}>

        {clinicalSectionTitle(CLINICAL_HISTORY_SECTION_NUMBERS.presupuesto, 'Presupuesto')}{' '}

        <span className="text-red-500">*</span>

      </h3>

      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        Autocarga el precio desde Mis Precios y Procedimientos al seleccionar un tratamiento. El
        precio unitario en cada fila puede ajustarse para esta atención sin modificar el catálogo
        global.
      </p>

      {(!disabled || budgetItems.length > 0) && (
        <BudgetModule
          items={moduleItems}
          globalDiscount={budget.discount}
          disabled={disabled}
          onItemsChange={(items) => emitItemsWithDiscount(items, budget.discount)}
          onGlobalDiscountChange={(discount) => emitItemsWithDiscount(moduleItems, discount)}
          canImportFromTreatmentPlan={treatmentPlan.some((t) => (t.procedure ?? '').trim())}
          onImportFromTreatmentPlan={importFromTreatmentPlan}
          hideSummary
        />
      )}

      <OrthodonticsBudgetSection
        orthodonticsBudget={orthodonticsBudget}
        disabled={disabled}
        onChange={emitOrtho}
      />

      <DentalImplantsBudgetSection
        dentalImplantsBudget={dentalImplantsBudget}
        disabled={disabled}
        onChange={emitImplants}
      />



      {budgetItems.length === 0 && !hasSpecialtyBudget && disabled && (

        <p className="text-sm text-slate-500 dark:text-slate-400">Agregue tratamientos al presupuesto.</p>

      )}



      {(budgetItems.length > 0 || hasSpecialtyBudget) && (

        <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700">

          <div>

            <span className="text-sm text-slate-500 dark:text-slate-400">Subtotal clínico</span>

            <p className="text-lg font-semibold">{formatCurrency(combinedSummary.subtotal)}</p>

          </div>

          <div>

            <span className="text-sm text-slate-500 dark:text-slate-400">

              IVA excluido (0%)

            </span>

            <p className="text-lg font-semibold">

              {formatCurrency(0)}

            </p>

          </div>

          <div>

            <FieldVoiceHeader

              label="Descuento global (COP)"

              targetInputId="budget-form-global-discount"

              disabled={disabled}

              getValue={() => String(budget.discount || '')}

              onValueChange={(text) => {

                const parsed = parseDictatedInteger(text)

                if (parsed != null) emitItemsWithDiscount(moduleItems, Math.max(0, parsed))

              }}

            />

            <input

              id="budget-form-global-discount"

              type="number"

              min={0}

              disabled={disabled}

              value={budget.discount}

              onChange={(e) =>

                emitItemsWithDiscount(moduleItems, Number(e.target.value))

              }

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



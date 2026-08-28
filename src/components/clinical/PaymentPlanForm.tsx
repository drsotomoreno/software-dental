import type { BudgetLineItem, PaymentMethod, PaymentPlanItem, OrthodonticsBudget, DentalImplantsBudget } from '@/types/clinicalRecord'
import { PAYMENT_METHOD_LABELS } from '@/constants/dental'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { formatCurrency, generateId, syncPaymentPlanWithBudget } from '@/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useTariffSync } from '@/modules/tariff/useTariffSync'
import { PaymentPlanProcedureField } from './PaymentPlanProcedureField'

interface PaymentPlanFormProps {
  paymentPlan: PaymentPlanItem[]
  budgetItems: BudgetLineItem[]
  orthodonticsBudget?: OrthodonticsBudget
  dentalImplantsBudget?: DentalImplantsBudget
  disabled?: boolean
  onChange: (paymentPlan: PaymentPlanItem[]) => void
}

const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]

function isCustomPaymentPlanRow(item: PaymentPlanItem): boolean {
  return item.source === 'custom' || (!item.budgetItemId && item.source !== 'budget')
}

export function PaymentPlanForm({
  paymentPlan,
  budgetItems,
  orthodonticsBudget,
  dentalImplantsBudget,
  disabled = false,
  onChange,
}: PaymentPlanFormProps) {
  const { user } = useAuth()
  useTariffSync(user?.id)

  const syncWithBudget = () => {
    onChange(syncPaymentPlanWithBudget(budgetItems, paymentPlan, orthodonticsBudget, dentalImplantsBudget))
  }

  const updateItem = (id: string, patch: Partial<PaymentPlanItem>) => {
    onChange(paymentPlan.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const addCustomItem = () => {
    onChange([
      ...paymentPlan,
      {
        id: generateId(),
        source: 'custom',
        procedure: '',
        cupsCode: '',
        totalAmount: 0,
        paymentMethod: 'contado',
        scheduleNotes: '',
      },
    ])
  }

  const removeItem = (id: string) => {
    onChange(paymentPlan.filter((item) => item.id !== id))
  }

  return (
    <section className="card">
      <h3 className={`mb-2 ${CLINICAL_SECTION_TITLE_CLASS}`}>
        {clinicalSectionTitle(CLINICAL_HISTORY_SECTION_NUMBERS.planPagos, 'Plan de Pagos')}
      </h3>
      <p className="mb-4 text-xs text-slate-500">
        Describa cómo se pagará cada procedimiento del presupuesto: forma de pago, cuotas, abonos
        y fechas acordadas con el paciente.
      </p>

      {!disabled && (budgetItems.length > 0 || orthodonticsBudget?.active || dentalImplantsBudget?.active) && (
        <button type="button" onClick={syncWithBudget} className="btn-secondary mb-4 text-xs">
          Generar filas desde presupuesto
        </button>
      )}

      {!disabled && (
        <button type="button" onClick={addCustomItem} className="btn-secondary mb-4 ml-2 text-xs">
          + Fila personalizada
        </button>
      )}

      {paymentPlan.length === 0 ? (
        <p className="text-sm text-slate-500">
          {budgetItems.length > 0 || orthodonticsBudget?.active || dentalImplantsBudget?.active
            ? 'Use "Generar filas desde presupuesto" para definir el pago de cada tratamiento.'
            : 'Primero agregue tratamientos al presupuesto.'}
        </p>
      ) : (
        <div className="space-y-4">
          {paymentPlan.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-800">
                  {item.procedure || 'Procedimiento sin nombre'}
                </span>
                <span className="text-sm font-semibold text-dental-700">
                  {formatCurrency(item.totalAmount)}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-12">
                {isCustomPaymentPlanRow(item) ? (
                  <PaymentPlanProcedureField
                    procedure={item.procedure}
                    cupsCode={item.cupsCode}
                    totalAmount={item.totalAmount}
                    disabled={disabled}
                    onChange={(patch) => updateItem(item.id, patch)}
                  />
                ) : (
                  <div className="sm:col-span-4">
                    <label className="mb-0.5 block text-[10px] text-slate-500">Procedimiento</label>
                    <input
                      disabled={disabled}
                      value={item.procedure}
                      onChange={(e) => updateItem(item.id, { procedure: e.target.value })}
                      className="input-field text-sm"
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="mb-0.5 block text-[10px] text-slate-500">Valor total</label>
                  <input
                    type="number"
                    min={0}
                    disabled={disabled}
                    value={item.totalAmount}
                    onChange={(e) =>
                      updateItem(item.id, { totalAmount: Number(e.target.value) })
                    }
                    className="input-field"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="mb-0.5 block text-[10px] text-slate-500">Forma de pago</label>
                  <select
                    disabled={disabled}
                    value={item.paymentMethod}
                    onChange={(e) =>
                      updateItem(item.id, { paymentMethod: e.target.value as PaymentMethod })
                    }
                    className="input-field text-sm"
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="mb-0.5 block text-[10px] text-slate-500">
                    Fecha / 1ª cuota
                  </label>
                  <input
                    type="date"
                    disabled={disabled}
                    value={item.dueDate ?? ''}
                    onChange={(e) =>
                      updateItem(item.id, { dueDate: e.target.value || undefined })
                    }
                    className="input-field"
                  />
                </div>
              </div>

              {(item.paymentMethod === 'cuotas' ||
                item.paymentMethod === 'abono_inicial' ||
                item.paymentMethod === 'mixto') && (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-0.5 block text-[10px] text-slate-500">Nº cuotas</label>
                    <input
                      type="number"
                      min={1}
                      disabled={disabled}
                      value={item.installments ?? ''}
                      onChange={(e) =>
                        updateItem(item.id, {
                          installments: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-slate-500">
                      Abono inicial
                    </label>
                    <input
                      type="number"
                      min={0}
                      disabled={disabled}
                      value={item.initialPayment ?? ''}
                      onChange={(e) =>
                        updateItem(item.id, {
                          initialPayment: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-slate-500">
                      Valor cuota
                    </label>
                    <input
                      type="number"
                      min={0}
                      disabled={disabled}
                      value={item.installmentAmount ?? ''}
                      onChange={(e) =>
                        updateItem(item.id, {
                          installmentAmount: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      className="input-field"
                    />
                  </div>
                </div>
              )}

              <div className="mt-3">
                <label className="mb-0.5 block text-[10px] text-slate-500">
                  Descripción del plan de pago
                </label>
                <textarea
                  rows={2}
                  disabled={disabled}
                  value={item.scheduleNotes ?? ''}
                  onChange={(e) => updateItem(item.id, { scheduleNotes: e.target.value })}
                  placeholder="Ej.: 50% al iniciar tratamiento, 50% al finalizar. Cuota 2 el 15/03/2026..."
                  className="input-field resize-y text-sm"
                />
              </div>

              {!disabled && (
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="text-sm text-red-500 hover:text-red-700"
                  >
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

import type { PaymentMethod, PaymentPlanItem } from '@/types/clinicalRecord'
import { PAYMENT_METHOD_LABELS } from '@/constants/dental'

const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]

type AgreementFields = Pick<
  PaymentPlanItem,
  'paymentMethod' | 'dueDate' | 'installments' | 'initialPayment' | 'installmentAmount' | 'scheduleNotes'
>

interface PaymentAgreementFieldsProps {
  item: AgreementFields
  disabled?: boolean
  onChange: (patch: Partial<PaymentPlanItem>) => void
}

export function PaymentAgreementFields({ item, disabled = false, onChange }: PaymentAgreementFieldsProps) {
  const showsInstallments =
    item.paymentMethod === 'cuotas' ||
    item.paymentMethod === 'abono_inicial' ||
    item.paymentMethod === 'mixto'

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-0.5 block text-[10px] text-slate-500">Forma de pago</label>
          <select
            disabled={disabled}
            value={item.paymentMethod}
            onChange={(event) => onChange({ paymentMethod: event.target.value as PaymentMethod })}
            className="input-field text-sm"
          >
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] text-slate-500">Fecha / 1ª cuota</label>
          <input
            type="date"
            disabled={disabled}
            value={item.dueDate ?? ''}
            onChange={(event) => onChange({ dueDate: event.target.value || undefined })}
            className="input-field"
          />
        </div>
      </div>

      {showsInstallments && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-0.5 block text-[10px] text-slate-500">Nº cuotas</label>
            <input
              type="number"
              min={1}
              disabled={disabled}
              value={item.installments ?? ''}
              onChange={(event) =>
                onChange({
                  installments: event.target.value ? Number(event.target.value) : undefined,
                })
              }
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-slate-500">Abono inicial</label>
            <input
              type="number"
              min={0}
              disabled={disabled}
              value={item.initialPayment ?? ''}
              onChange={(event) =>
                onChange({
                  initialPayment: event.target.value ? Number(event.target.value) : undefined,
                })
              }
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-slate-500">Valor cuota</label>
            <input
              type="number"
              min={0}
              disabled={disabled}
              value={item.installmentAmount ?? ''}
              onChange={(event) =>
                onChange({
                  installmentAmount: event.target.value ? Number(event.target.value) : undefined,
                })
              }
              className="input-field"
            />
          </div>
        </div>
      )}

      <div>
        <label className="mb-0.5 block text-[10px] text-slate-500">Descripción del plan de pago</label>
        <textarea
          rows={2}
          disabled={disabled}
          value={item.scheduleNotes ?? ''}
          onChange={(event) => onChange({ scheduleNotes: event.target.value })}
          placeholder="Ej.: 50% al iniciar tratamiento, 50% al finalizar. Cuota 2 el 15/03/2026..."
          className="input-field resize-y text-sm"
        />
      </div>
    </div>
  )
}

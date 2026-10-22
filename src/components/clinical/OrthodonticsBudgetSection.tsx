import { CreditCard } from 'lucide-react'
import type { OrthodonticsBudget, OrthodonticsBudgetLine } from '@/types/clinicalRecord'
import { formatCurrency, lineSubtotal } from '@/utils'
import type { OrthodonticsBudgetRowKey } from '@/utils/budget'
import { VoiceDictationButton } from '@/components/voice'
import { parseDictatedInteger, parseDictatedNumber } from '@/utils/voiceDictation'

interface OrthodonticsBudgetSectionProps {
  orthodonticsBudget: OrthodonticsBudget
  disabled?: boolean
  /** false: sección 8, edición del presupuesto. true: sección 9, registrar pago. */
  isPaymentMode?: boolean
  onChange?: (orthodonticsBudget: OrthodonticsBudget) => void
  onRegisterPayment?: (key: OrthodonticsBudgetRowKey) => void
  isRegisterPaymentDisabled?: (key: OrthodonticsBudgetRowKey) => boolean
  onRegisterFullPayment?: () => void
  isFullPaymentDisabled?: boolean
  fullPaymentAmount?: number
}

interface RowConfig {
  key: OrthodonticsBudgetRowKey
  label: string
  quantityMin: number
}

const ROWS: RowConfig[] = [
  { key: 'initialInstallment', label: 'Cuota inicial', quantityMin: 0 },
  { key: 'controls', label: 'Controles', quantityMin: 0 },
  { key: 'retainers', label: 'Retenedores', quantityMin: 0 },
]

function parseNonNegative(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, parsed)
}

function OrthoRow({
  config,
  line,
  readOnly,
  showPaymentAction,
  paymentDisabled,
  onChange,
  onRegisterPayment,
}: {
  config: RowConfig
  line: OrthodonticsBudgetLine
  readOnly: boolean
  showPaymentAction: boolean
  paymentDisabled: boolean
  onChange: (line: OrthodonticsBudgetLine) => void
  onRegisterPayment?: () => void
}) {
  const rowSubtotal = lineSubtotal(line)

  return (
    <tr className="group transition-colors hover:bg-emerald-50/40 dark:hover:bg-emerald-950/30">
      <td className="py-3 pl-1 font-medium text-slate-800 dark:text-slate-100">{config.label}</td>
      <td className="px-2 py-3">
        {readOnly ? (
          <span className="font-semibold text-slate-700 dark:text-slate-200">{line.quantity}</span>
        ) : (
          <div className="flex items-start gap-1">
            <input
              id={`ortho-qty-${config.key}`}
              type="number"
              min={config.quantityMin}
              aria-label={`Cantidad de ${config.label.toLowerCase()}`}
              value={line.quantity}
              onChange={(e) => onChange({ ...line, quantity: parseNonNegative(e.target.value) })}
              className="w-20 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
            <VoiceDictationButton
              targetInputId={`ortho-qty-${config.key}`}
              getValue={() => String(line.quantity || '')}
              onValueChange={(text) => {
                const parsed = parseDictatedInteger(text)
                if (parsed != null) {
                  onChange({ ...line, quantity: Math.max(config.quantityMin, parsed) })
                }
              }}
              className="shrink-0"
            />
          </div>
        )}
      </td>
      <td className="px-2 py-3">
        {readOnly ? (
          <span className="font-medium text-slate-600 dark:text-slate-300">
            {formatCurrency(line.unitPrice)}
          </span>
        ) : (
          <div className="flex items-start gap-1">
            <input
              id={`ortho-price-${config.key}`}
              type="number"
              min={0}
              aria-label={`Valor unitario de ${config.label.toLowerCase()}`}
              value={line.unitPrice}
              onChange={(e) => onChange({ ...line, unitPrice: parseNonNegative(e.target.value) })}
              className="w-full max-w-[200px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
            <VoiceDictationButton
              targetInputId={`ortho-price-${config.key}`}
              getValue={() => String(line.unitPrice || '')}
              onValueChange={(text) => {
                const parsed = parseDictatedNumber(text)
                if (parsed != null) {
                  onChange({ ...line, unitPrice: Math.max(0, Math.round(parsed)) })
                }
              }}
              className="shrink-0"
            />
          </div>
        )}
      </td>
      <td className="px-2 py-3 text-right font-bold text-slate-800 dark:text-slate-100">
        {formatCurrency(rowSubtotal)}
      </td>
      {showPaymentAction && (
        <td className="py-3 pl-4 text-center">
          <button
            type="button"
            disabled={paymentDisabled}
            title={
              paymentDisabled
                ? 'Este concepto no tiene saldo por registrar'
                : `Registrar pago de ${config.label.toLowerCase()}`
            }
            onClick={() => onRegisterPayment?.()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CreditCard className="h-3.5 w-3.5" />
            Registrar Pago
          </button>
        </td>
      )}
    </tr>
  )
}

export function OrthodonticsBudgetSection({
  orthodonticsBudget,
  disabled = false,
  isPaymentMode = false,
  onChange,
  onRegisterPayment,
  isRegisterPaymentDisabled,
  onRegisterFullPayment,
  isFullPaymentDisabled = false,
  fullPaymentAmount = 0,
}: OrthodonticsBudgetSectionProps) {
  const readOnly = disabled || isPaymentMode
  const orthoTotal = ROWS.reduce(
    (sum, config) => sum + lineSubtotal(orthodonticsBudget[config.key]),
    0,
  )

  const updateLine = (key: OrthodonticsBudgetRowKey, line: OrthodonticsBudgetLine) => {
    onChange?.({ ...orthodonticsBudget, [key]: line })
  }

  return (
    <div
      className={`w-full rounded-2xl border border-emerald-200 bg-emerald-50/20 p-5 shadow-sm transition-all dark:border-emerald-900/70 dark:bg-emerald-950/20 ${
        isPaymentMode ? 'mt-6' : 'mb-6'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 pb-3 dark:border-emerald-900/60">
        <div>
          <h3 className="text-lg font-bold text-emerald-950 dark:text-emerald-100">
            Presupuesto De Ortodoncia
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cuota inicial, controles y retenedores con su valor unitario.
          </p>
        </div>
        {!isPaymentMode && (
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              disabled={disabled}
              checked={orthodonticsBudget.active}
              onChange={(e) => onChange?.({ ...orthodonticsBudget, active: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Incluir en presupuesto
          </label>
        )}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-700 dark:text-slate-200">
          <thead>
            <tr className="border-b border-emerald-100 text-xs font-semibold text-slate-500 dark:border-emerald-900/60 dark:text-slate-400">
              <th className="w-1/4 py-2 pl-1">Concepto</th>
              <th className="w-1/6 px-2 py-2">Cantidad</th>
              <th className="w-1/3 px-2 py-2">Valor unitario</th>
              <th className="px-2 py-2 text-right">Subtotal</th>
              {isPaymentMode && <th className="py-2 pl-4 text-center">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-50 dark:divide-emerald-950/40">
            {ROWS.map((config) => (
              <OrthoRow
                key={config.key}
                config={config}
                line={orthodonticsBudget[config.key]}
                readOnly={readOnly}
                showPaymentAction={isPaymentMode}
                paymentDisabled={
                  disabled ||
                  !onRegisterPayment ||
                  (isRegisterPaymentDisabled?.(config.key) ??
                    lineSubtotal(orthodonticsBudget[config.key]) <= 0)
                }
                onChange={(line) => updateLine(config.key, line)}
                onRegisterPayment={
                  onRegisterPayment ? () => onRegisterPayment(config.key) : undefined
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      <div
        className={`mt-4 flex flex-wrap items-center gap-3 border-t border-emerald-100 pt-3 dark:border-emerald-900/60 ${
          isPaymentMode && onRegisterFullPayment ? 'justify-between' : 'justify-end'
        }`}
      >
        {isPaymentMode && onRegisterFullPayment ? (
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              disabled={isFullPaymentDisabled || fullPaymentAmount <= 0}
              title={
                fullPaymentAmount <= 0
                  ? 'El tratamiento ya está pagado'
                  : 'Registrar el saldo del tratamiento en un solo pago de contado'
              }
              onClick={() => onRegisterFullPayment()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CreditCard className="h-3.5 w-3.5" />
              Pagar de contado
              {fullPaymentAmount > 0 ? ` · ${formatCurrency(fullPaymentAmount)}` : ''}
            </button>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Un solo pago por el saldo del tratamiento
            </span>
          </div>
        ) : null}
        <div className="text-right">
          <span className="text-sm text-slate-600 dark:text-slate-300">Subtotal ortodoncia: </span>
          <span className="ml-1 text-lg font-extrabold text-slate-900 dark:text-slate-50">
            {formatCurrency(orthoTotal)}
          </span>
        </div>
      </div>
    </div>
  )
}

import type {
  DentalImplantsBudget,
  DentalImplantsBudgetLine,
} from '@/types/clinicalRecord'
import { calcDentalImplantsBudgetTotal, formatCurrency, lineSubtotal } from '@/utils'
import { VoiceDictationButton } from '@/components/voice'
import { parseDictatedInteger, parseDictatedNumber } from '@/utils/voiceDictation'

interface DentalImplantsBudgetSectionProps {
  dentalImplantsBudget: DentalImplantsBudget
  disabled?: boolean
  onChange: (dentalImplantsBudget: DentalImplantsBudget) => void
}

interface RowConfig {
  key: 'implantPlacement' | 'prosthetics'
  label: string
  quantityMin: number
}

const ROWS: RowConfig[] = [
  {
    key: 'implantPlacement',
    label: 'Colocación de implantes',
    quantityMin: 0,
  },
  {
    key: 'prosthetics',
    label: 'Prótesis definitiva sobre implantes',
    quantityMin: 0,
  },
]

function parseNonNegative(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, parsed)
}

function ImplantBudgetRow({
  config,
  line,
  disabled,
  onChange,
}: {
  config: RowConfig
  line: DentalImplantsBudgetLine
  disabled?: boolean
  onChange: (line: DentalImplantsBudgetLine) => void
}) {
  const rowSubtotal = lineSubtotal(line)

  return (
    <tr className="group transition-colors hover:bg-teal-50/40 dark:hover:bg-teal-950/30">
      <td className="py-3 pl-1 font-medium text-slate-800 dark:text-slate-100">{config.label}</td>
      <td className="px-2 py-3">
        {disabled ? (
          <span className="font-semibold text-slate-700 dark:text-slate-200">{line.quantity}</span>
        ) : (
          <div className="flex items-start gap-1">
            <input
              id={`implants-qty-${config.key}`}
              type="number"
              min={config.quantityMin}
              aria-label={`Cantidad de ${config.label.toLowerCase()}`}
              value={line.quantity}
              onChange={(e) => onChange({ ...line, quantity: parseNonNegative(e.target.value) })}
              className="w-20 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
            <VoiceDictationButton
              targetInputId={`implants-qty-${config.key}`}
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
        {disabled ? (
          <span className="font-medium text-slate-600 dark:text-slate-300">
            {formatCurrency(line.unitPrice)}
          </span>
        ) : (
          <div className="flex items-start gap-1">
            <input
              id={`implants-price-${config.key}`}
              type="number"
              min={0}
              aria-label={`Valor unitario de ${config.label.toLowerCase()}`}
              value={line.unitPrice}
              onChange={(e) => onChange({ ...line, unitPrice: parseNonNegative(e.target.value) })}
              className="w-full max-w-[200px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
            <VoiceDictationButton
              targetInputId={`implants-price-${config.key}`}
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
    </tr>
  )
}

export function DentalImplantsBudgetSection({
  dentalImplantsBudget,
  disabled = false,
  onChange,
}: DentalImplantsBudgetSectionProps) {
  const implantsTotal = calcDentalImplantsBudgetTotal(dentalImplantsBudget)

  return (
    <div className="mb-6 w-full rounded-2xl border border-teal-200 bg-teal-50/20 p-5 shadow-sm transition-all dark:border-teal-900/70 dark:bg-teal-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-100 pb-3 dark:border-teal-900/60">
        <div>
          <h3 className="text-lg font-bold text-teal-950 dark:text-teal-100">
            Presupuesto de implantes dentales
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Colocación y prótesis definitiva con su valor unitario.
          </p>
        </div>
        <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            disabled={disabled}
            checked={dentalImplantsBudget.active}
            onChange={(e) => onChange({ ...dentalImplantsBudget, active: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          Incluir en presupuesto
        </label>
      </div>

      {dentalImplantsBudget.active && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700 dark:text-slate-200">
              <thead>
                <tr className="border-b border-teal-100 text-xs font-semibold text-slate-500 dark:border-teal-900/60 dark:text-slate-400">
                  <th className="w-1/4 py-2 pl-1">Concepto</th>
                  <th className="w-1/6 px-2 py-2">Cantidad</th>
                  <th className="w-1/3 px-2 py-2">Valor unitario</th>
                  <th className="px-2 py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-teal-50 dark:divide-teal-950/40">
                {ROWS.map((config) => (
                  <ImplantBudgetRow
                    key={config.key}
                    config={config}
                    line={dentalImplantsBudget[config.key]}
                    disabled={disabled}
                    onChange={(line) => onChange({ ...dentalImplantsBudget, [config.key]: line })}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end border-t border-teal-100 pt-3 dark:border-teal-900/60">
            <div className="text-right">
              <span className="text-sm text-slate-600 dark:text-slate-300">Subtotal implantes: </span>
              <span className="ml-1 text-lg font-extrabold text-slate-900 dark:text-slate-50">
                {formatCurrency(implantsTotal)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

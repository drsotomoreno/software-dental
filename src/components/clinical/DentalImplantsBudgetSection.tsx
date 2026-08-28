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
  unitLabel: string
  quantityMin: number
}

const ROWS: RowConfig[] = [
  {
    key: 'implantPlacement',
    label: 'Colocación de implantes',
    unitLabel: 'Valor por implante',
    quantityMin: 0,
  },
  {
    key: 'prosthetics',
    label: 'Prótesis definitiva sobre implantes',
    unitLabel: 'Valor por prótesis',
    quantityMin: 0,
  },
]

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
  return (
    <tr>
      <td className="px-2 py-2 font-medium text-slate-700">{config.label}</td>
      <td className="px-2 py-2">
        {disabled ? (
          line.quantity
        ) : (
          <div className="flex items-start gap-1">
            <input
              id={`implants-qty-${config.key}`}
              type="number"
              min={config.quantityMin}
              value={line.quantity}
              onChange={(e) => onChange({ ...line, quantity: Number(e.target.value) })}
              className="input-field min-w-0 w-20 flex-1"
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
      <td className="px-2 py-2">
        {disabled ? (
          formatCurrency(line.unitPrice)
        ) : (
          <div className="flex items-start gap-1">
            <input
              id={`implants-price-${config.key}`}
              type="number"
              min={0}
              value={line.unitPrice}
              onChange={(e) => onChange({ ...line, unitPrice: Number(e.target.value) })}
              className="input-field min-w-0 w-32 flex-1"
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
      <td className="px-2 py-2 font-medium">
        {formatCurrency(lineSubtotal(line))}
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
    <div className="mb-6 rounded-lg border border-teal-200 bg-teal-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-teal-900">Presupuesto de implantes dentales</h4>
          <p className="text-xs text-teal-700">
            Colocación y prótesis definitiva con su valor unitario.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-teal-900">
          <input
            type="checkbox"
            disabled={disabled}
            checked={dentalImplantsBudget.active}
            onChange={(e) => onChange({ ...dentalImplantsBudget, active: e.target.checked })}
            className="rounded border-teal-300 text-teal-600 focus:ring-teal-500"
          />
          Incluir en presupuesto
        </label>
      </div>

      {dentalImplantsBudget.active && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-teal-200 text-left text-xs text-teal-800">
                  <th className="px-2 py-2 font-medium">Concepto</th>
                  <th className="px-2 py-2 font-medium">Cantidad</th>
                  <th className="px-2 py-2 font-medium">Valor unitario</th>
                  <th className="px-2 py-2 font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-teal-100">
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
          <div className="mt-3 flex justify-end border-t border-teal-200 pt-3">
            <span className="text-sm text-teal-800">
              Subtotal implantes:{' '}
              <strong className="text-base text-teal-900">{formatCurrency(implantsTotal)}</strong>
            </span>
          </div>
        </>
      )}
    </div>
  )
}

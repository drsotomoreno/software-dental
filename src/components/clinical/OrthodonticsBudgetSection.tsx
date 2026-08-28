import type { OrthodonticsBudget, OrthodonticsBudgetLine } from '@/types/clinicalRecord'
import { calcOrthodonticsBudgetTotal, formatCurrency, lineSubtotal } from '@/utils'
import { VoiceDictationButton } from '@/components/voice'
import { parseDictatedInteger, parseDictatedNumber } from '@/utils/voiceDictation'

interface OrthodonticsBudgetSectionProps {
  orthodonticsBudget: OrthodonticsBudget
  disabled?: boolean
  onChange: (orthodonticsBudget: OrthodonticsBudget) => void
}

interface RowConfig {
  key: 'initialInstallment' | 'controls' | 'retainers'
  label: string
  quantityLabel: string
  unitLabel: string
  quantityMin: number
  quantityStep?: number
  fixedQuantity?: number
}

const ROWS: RowConfig[] = [
  {
    key: 'initialInstallment',
    label: 'Cuota inicial',
    quantityLabel: 'Cantidad',
    unitLabel: 'Valor cuota inicial',
    quantityMin: 1,
    fixedQuantity: 1,
  },
  {
    key: 'controls',
    label: 'Controles',
    quantityLabel: 'Nº de controles',
    unitLabel: 'Valor por control',
    quantityMin: 0,
  },
  {
    key: 'retainers',
    label: 'Retenedores',
    quantityLabel: 'Nº de retenedores',
    unitLabel: 'Valor por retenedor',
    quantityMin: 0,
  },
]

function OrthoRow({
  config,
  line,
  disabled,
  onChange,
}: {
  config: RowConfig
  line: OrthodonticsBudgetLine
  disabled?: boolean
  onChange: (line: OrthodonticsBudgetLine) => void
}) {
  const quantity = config.fixedQuantity ?? line.quantity

  return (
    <tr>
      <td className="px-2 py-2 font-medium text-slate-700">{config.label}</td>
      <td className="px-2 py-2">
        {disabled || config.fixedQuantity !== undefined ? (
          quantity
        ) : (
          <div className="flex items-start gap-1">
            <input
              id={`ortho-qty-${config.key}`}
              type="number"
              min={config.quantityMin}
              value={line.quantity}
              onChange={(e) => onChange({ ...line, quantity: Number(e.target.value) })}
              className="input-field min-w-0 w-20 flex-1"
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
      <td className="px-2 py-2">
        {disabled ? (
          formatCurrency(line.unitPrice)
        ) : (
          <div className="flex items-start gap-1">
            <input
              id={`ortho-price-${config.key}`}
              type="number"
              min={0}
              value={line.unitPrice}
              onChange={(e) => onChange({ ...line, unitPrice: Number(e.target.value) })}
              className="input-field min-w-0 w-32 flex-1"
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
      <td className="px-2 py-2 font-medium">
        {formatCurrency(lineSubtotal({ quantity, unitPrice: line.unitPrice }))}
      </td>
    </tr>
  )
}

export function OrthodonticsBudgetSection({
  orthodonticsBudget,
  disabled = false,
  onChange,
}: OrthodonticsBudgetSectionProps) {
  const updateLine = (
    key: RowConfig['key'],
    line: OrthodonticsBudgetLine,
  ) => {
    const normalized =
      key === 'initialInstallment' ? { ...line, quantity: 1 } : line
    onChange({ ...orthodonticsBudget, [key]: normalized })
  }

  const orthoTotal = calcOrthodonticsBudgetTotal(orthodonticsBudget)

  return (
    <div className="mb-6 rounded-lg border border-teal-200 bg-teal-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-teal-900">Presupuesto de ortodoncia</h4>
          <p className="text-xs text-teal-700">
            Cuota inicial, controles y retenedores con su valor unitario.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-teal-900">
          <input
            type="checkbox"
            disabled={disabled}
            checked={orthodonticsBudget.active}
            onChange={(e) => onChange({ ...orthodonticsBudget, active: e.target.checked })}
            className="rounded border-teal-300 text-teal-600 focus:ring-teal-500"
          />
          Incluir en presupuesto
        </label>
      </div>

      {orthodonticsBudget.active && (
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
                  <OrthoRow
                    key={config.key}
                    config={config}
                    line={orthodonticsBudget[config.key]}
                    disabled={disabled}
                    onChange={(line) => updateLine(config.key, line)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end border-t border-teal-200 pt-3">
            <span className="text-sm text-teal-800">
              Subtotal ortodoncia:{' '}
              <strong className="text-base text-teal-900">{formatCurrency(orthoTotal)}</strong>
            </span>
          </div>
        </>
      )}
    </div>
  )
}

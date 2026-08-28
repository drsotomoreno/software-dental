import {
  calcBillableLineTotal,
  formatBillableLineSummary,
  getCupsQuantityBillingRule,
  getQuantityFieldLabel,
  isCupsQuantityLocked,
  isBridgeUnitBilling,
} from '@/utils/cupsBillingRules'
import { formatCurrency } from '@/utils/crypto'
import { FieldVoiceHeader } from '@/components/voice'
import { parseDictatedInteger } from '@/utils/voiceDictation'

interface CupsQuantityBillingFieldProps {
  cupsCode?: string
  quantity: number
  unitPrice?: number
  disabled?: boolean
  onQuantityChange: (quantity: number) => void
  compact?: boolean
  inputId?: string
}

export function CupsQuantityBillingField({
  cupsCode,
  quantity,
  unitPrice = 0,
  disabled = false,
  onQuantityChange,
  compact = false,
  inputId,
}: CupsQuantityBillingFieldProps) {
  const rule = getCupsQuantityBillingRule(cupsCode)
  const quantityLocked = isCupsQuantityLocked(cupsCode)
  const bridgeBilling = isBridgeUnitBilling(cupsCode)
  const lineTotal = calcBillableLineTotal(unitPrice, quantity, cupsCode)
  const fieldId = inputId
  const voiceLocked = disabled || quantityLocked

  return (
    <div>
      {fieldId ? (
        <FieldVoiceHeader
          label={getQuantityFieldLabel(cupsCode)}
          targetInputId={fieldId}
          disabled={voiceLocked}
          labelClassName="text-[10px] text-slate-500"
          className="mb-0.5 flex items-center justify-between gap-2"
          getValue={() => String(quantity || '')}
          onValueChange={(text) => {
            const parsed = parseDictatedInteger(text)
            if (parsed != null) onQuantityChange(Math.max(1, parsed))
          }}
        />
      ) : (
        <label className="mb-0.5 block text-[10px] text-slate-500">
          {getQuantityFieldLabel(cupsCode)}
        </label>
      )}
      <input
        id={fieldId}
        type="number"
        min={1}
        disabled={voiceLocked}
        value={quantity}
        onChange={(event) => onQuantityChange(Number(event.target.value))}
        className="input-field w-full"
        title={rule.hint}
      />
      {cupsCode && !compact && (
        <p className="mt-1 text-[10px] leading-snug text-slate-500">{rule.hint}</p>
      )}
      {bridgeBilling && unitPrice > 0 && (
        <p className="mt-1 text-[10px] font-medium text-dental-700">
          {formatBillableLineSummary(unitPrice, quantity, cupsCode)}
        </p>
      )}
      {!bridgeBilling && unitPrice > 0 && quantity > 0 && (
        <p className="mt-1 text-[10px] text-slate-600">{formatCurrency(lineTotal)}</p>
      )}
    </div>
  )
}

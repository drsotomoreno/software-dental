import { useMemo, useState } from 'react'
import { useTariffStore } from '@/store/useTariffStore'
import { formatCurrency } from '@/utils'

interface PaymentMotivoValorFieldsProps {
  cupsCode?: string
  paymentReason: string
  amount: number
  disabled?: boolean
  onChange: (patch: {
    cupsCode?: string
    paymentReason: string
    amount: number
  }) => void
}

export function PaymentMotivoValorFields({
  cupsCode,
  paymentReason,
  amount,
  disabled = false,
  onChange,
}: PaymentMotivoValorFieldsProps) {
  const tariffMap = useTariffStore((state) => state.tariffMap)
  const [cupsSearch, setCupsSearch] = useState('')

  const searchResults = useMemo(() => {
    const query = cupsSearch.trim().toLowerCase()
    if (!query) return []

    return Object.values(tariffMap)
      .filter(
        (item) =>
          item.isActive &&
          (item.code.toLowerCase().includes(query) ||
            item.name.toLowerCase().includes(query)),
      )
      .slice(0, 12)
  }, [tariffMap, cupsSearch])

  const applyTariff = (code: string) => {
    const tariff = tariffMap[code]
    if (!tariff) return

    onChange({
      cupsCode: tariff.code,
      paymentReason: `${tariff.code} — ${tariff.name}`,
      amount: tariff.price,
    })
    setCupsSearch('')
  }

  const clearCupsLink = () => {
    onChange({
      cupsCode: undefined,
      paymentReason,
      amount,
    })
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Motivo y valor del pago
        </p>
        {cupsCode && (
          <span className="inline-flex items-center gap-2 rounded-full bg-dental-100 px-2.5 py-0.5 text-[11px] font-medium text-dental-800">
            CUPS {cupsCode}
            {!disabled && (
              <button
                type="button"
                onClick={clearCupsLink}
                className="text-dental-600 hover:text-dental-900"
                title="Quitar vínculo CUPS"
              >
                ✕
              </button>
            )}
          </span>
        )}
      </div>

      {!disabled && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Autocarga desde CUPS (opcional)
          </label>
          <input
            type="search"
            value={cupsSearch}
            onChange={(event) => setCupsSearch(event.target.value)}
            placeholder="Buscar código CUPS o procedimiento..."
            className="input-field text-sm"
          />
          {cupsSearch && (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              {searchResults.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">
                  Sin coincidencias en el tarifario. Puede definir motivo y valor manualmente.
                </li>
              ) : (
                searchResults.map((tariff) => (
                  <li key={tariff.code}>
                    <button
                      type="button"
                      onClick={() => applyTariff(tariff.code)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span>
                        <span className="font-mono text-xs text-dental-700">{tariff.code}</span>
                        {' — '}
                        {tariff.name}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-slate-600">
                        {formatCurrency(tariff.price)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-12">
        <div className="sm:col-span-8">
          <label className="mb-0.5 block text-xs font-medium text-slate-700">
            Motivo del pago <span className="text-red-500">*</span>
          </label>
          {disabled ? (
            <p className="whitespace-pre-wrap text-sm text-slate-800">{paymentReason || '—'}</p>
          ) : (
            <textarea
              rows={2}
              value={paymentReason}
              onChange={(event) =>
                onChange({
                  cupsCode,
                  paymentReason: event.target.value,
                  amount,
                })
              }
              placeholder="Ej.: Cuota inicial, abono resina pieza 16, control mensual..."
              className="input-field resize-y text-sm"
            />
          )}
        </div>
        <div className="sm:col-span-4">
          <label className="mb-0.5 block text-xs font-medium text-slate-700">
            Valor pagado <span className="text-red-500">*</span>
          </label>
          {disabled ? (
            <p className="text-sm font-semibold text-dental-700">{formatCurrency(amount)}</p>
          ) : (
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(event) =>
                onChange({
                  cupsCode,
                  paymentReason,
                  amount: Number(event.target.value),
                })
              }
              className="input-field"
            />
          )}
        </div>
      </div>
    </div>
  )
}

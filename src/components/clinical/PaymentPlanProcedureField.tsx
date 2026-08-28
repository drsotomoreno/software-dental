import { useMemo, useState } from 'react'
import type { TariffItem } from '@/types/pricing'
import { useTariffStore } from '@/store/useTariffStore'
import { formatCurrency } from '@/utils'

type ProcedurePickerMode = 'cups' | 'propio' | 'manual'

interface PaymentPlanProcedureFieldProps {
  procedure: string
  cupsCode?: string
  totalAmount: number
  disabled?: boolean
  onChange: (patch: { procedure: string; cupsCode?: string; totalAmount?: number }) => void
}

function matchesQuery(item: TariffItem, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return false
  return (
    item.code.toLowerCase().includes(normalized) ||
    item.name.toLowerCase().includes(normalized)
  )
}

export function PaymentPlanProcedureField({
  procedure,
  cupsCode,
  totalAmount,
  disabled = false,
  onChange,
}: PaymentPlanProcedureFieldProps) {
  const tariffMap = useTariffStore((state) => state.tariffMap)
  const [mode, setMode] = useState<ProcedurePickerMode>('cups')
  const [search, setSearch] = useState('')

  const cupsResults = useMemo(() => {
    if (mode !== 'cups' || !search.trim()) return []
    return Object.values(tariffMap)
      .filter((item) => item.isActive && item.type === 'CUPS' && matchesQuery(item, search))
      .slice(0, 10)
  }, [mode, search, tariffMap])

  const customResults = useMemo(() => {
    if (mode !== 'propio' || !search.trim()) return []
    return Object.values(tariffMap)
      .filter((item) => item.isActive && item.type === 'CUSTOM' && matchesQuery(item, search))
      .slice(0, 10)
  }, [mode, search, tariffMap])

  const applyTariff = (tariff: TariffItem) => {
    onChange({
      procedure: `${tariff.code} — ${tariff.name}`,
      cupsCode: tariff.type === 'CUPS' ? tariff.code : undefined,
      totalAmount: tariff.price > 0 ? tariff.price : totalAmount,
    })
    setSearch('')
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:col-span-12">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Procedimiento
        </p>
        {!disabled && (
          <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
            {(
              [
                ['cups', 'CUPS'],
                ['propio', 'Propio'],
                ['manual', 'Manual'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value)
                  setSearch('')
                }}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                  mode === value
                    ? 'bg-dental-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {disabled ? (
        <div className="space-y-1 text-sm">
          <p className="whitespace-pre-wrap text-slate-800">{procedure || '—'}</p>
          {cupsCode && (
            <p className="font-mono text-xs text-slate-500">CUPS {cupsCode}</p>
          )}
        </div>
      ) : mode === 'manual' ? (
        <div className="grid gap-3 sm:grid-cols-12">
          <div className="sm:col-span-8">
            <label className="mb-0.5 block text-[10px] text-slate-500">
              Nombre del procedimiento
            </label>
            <input
              value={procedure}
              onChange={(event) =>
                onChange({
                  procedure: event.target.value,
                  cupsCode,
                  totalAmount,
                })
              }
              placeholder="Escriba el procedimiento manualmente..."
              className="input-field text-sm"
            />
          </div>
          <div className="sm:col-span-4">
            <label className="mb-0.5 block text-[10px] text-slate-500">
              Código CUPS (opcional)
            </label>
            <input
              value={cupsCode ?? ''}
              onChange={(event) =>
                onChange({
                  procedure,
                  cupsCode: event.target.value || undefined,
                  totalAmount,
                })
              }
              placeholder="Ej. 997201"
              className="input-field font-mono text-sm"
            />
          </div>
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {mode === 'cups'
              ? 'Buscar en catálogo CUPS'
              : 'Buscar procedimiento propio del tarifario'}
          </label>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              mode === 'cups'
                ? 'Código o descripción CUPS...'
                : 'Código o nombre del procedimiento propio...'
            }
            className="input-field text-sm"
          />
          {search.trim() && (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              {(mode === 'cups' ? cupsResults : customResults).length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">
                  Sin coincidencias. Use la pestaña Manual para escribir el procedimiento.
                </li>
              ) : (
                (mode === 'cups' ? cupsResults : customResults).map((tariff) => (
                  <li key={tariff.code}>
                    <button
                      type="button"
                      onClick={() => applyTariff(tariff)}
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
          {procedure && (
            <p className="mt-2 text-xs text-slate-600">
              Seleccionado: <span className="font-medium text-slate-800">{procedure}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

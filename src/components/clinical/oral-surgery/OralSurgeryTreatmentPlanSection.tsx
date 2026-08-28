import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { REHAB_ODONTOGRAM_TEETH } from '@/components/clinical/rehabilitation/rehab-odontogram/constants'
import { useCatalogMeta, useCatalogSearch } from '@/hooks/useCatalogSearch'
import {
  ORAL_SURGERY_CUPS_SHORTLIST,
  type OralSurgeryTreatmentPlanItem,
} from '@/types/oralSurgeryAnnex'
import { generateId } from '@/utils'

const FDI_TOOTH_OPTIONS = Object.values(REHAB_ODONTOGRAM_TEETH)
  .flat()
  .sort((a, b) => a - b)

interface ProcedureOption {
  cupsCode: string
  procedure: string
}

interface OralSurgeryTreatmentPlanSectionProps {
  value: OralSurgeryTreatmentPlanItem[]
  onChange: (value: OralSurgeryTreatmentPlanItem[]) => void
  disabled?: boolean
}

export function OralSurgeryTreatmentPlanSection({
  value,
  onChange,
  disabled = false,
}: OralSurgeryTreatmentPlanSectionProps) {
  const [procedureSearch, setProcedureSearch] = useState('')
  const [pendingProcedure, setPendingProcedure] = useState<ProcedureOption | null>(null)
  const [pendingTooth, setPendingTooth] = useState('')

  const cupsCatalog = useCatalogSearch('cups', procedureSearch, 40)
  const cupsMeta = useCatalogMeta('cups')

  const { user } = useAuth()
  const prices = useLiveQuery(
    () => (user?.id ? db.prices.where('userId').equals(user.id).toArray() : []),
    [user?.id],
  )

  const procedureOptions = useMemo(() => {
    const map = new Map<string, ProcedureOption>()

    for (const item of ORAL_SURGERY_CUPS_SHORTLIST) {
      map.set(`${item.procedure}|${item.cupsCode}`, item)
    }

    for (const price of prices ?? []) {
      map.set(`${price.procedure}|${price.cupsCode}`, {
        procedure: price.procedure,
        cupsCode: price.cupsCode,
      })
    }

    for (const item of cupsCatalog ?? []) {
      map.set(`${item.description}|${item.code}`, {
        procedure: item.description,
        cupsCode: item.code,
      })
    }

    return [...map.values()]
  }, [prices, cupsCatalog])

  const filteredProcedures = useMemo(() => {
    const q = procedureSearch.trim().toLowerCase()
    if (!q) return ORAL_SURGERY_CUPS_SHORTLIST
    return procedureOptions
      .filter(
        (option) =>
          option.procedure.toLowerCase().includes(q) || option.cupsCode.includes(q.replace(/\D/g, '')),
      )
      .slice(0, 12)
  }, [procedureOptions, procedureSearch])

  const resetPending = () => {
    setPendingProcedure(null)
    setPendingTooth('')
  }

  const selectProcedure = (option: ProcedureOption) => {
    setPendingProcedure(option)
    setPendingTooth('')
    setProcedureSearch('')
  }

  const addPendingItem = () => {
    if (!pendingProcedure || !pendingTooth) return

    const item: OralSurgeryTreatmentPlanItem = {
      id: generateId(),
      cupsCode: pendingProcedure.cupsCode,
      procedure: pendingProcedure.procedure,
      toothNumber: Number(pendingTooth),
    }

    onChange([...value, item])
    resetPending()
  }

  const removeItem = (id: string) => {
    onChange(value.filter((item) => item.id !== id))
  }

  const updateItem = (id: string, patch: Partial<OralSurgeryTreatmentPlanItem>) => {
    onChange(value.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Plan de tratamiento
      </h4>
      <p className="mt-1 text-[11px] text-slate-500">
        Agregue uno o varios procedimientos: busque el código CUPS, seleccione la pieza dental de la
        lista y confirme. Puede repetir el proceso para añadir más entradas al plan.
      </p>

      {!disabled && (
        <div className="mt-3 space-y-3">
          {!pendingProcedure ? (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">
                Buscar procedimiento CUPS
                {cupsMeta && (
                  <span className="ml-1 font-normal text-dental-600">
                    v{cupsMeta.version} ({cupsMeta.recordCount} códigos)
                  </span>
                )}
              </label>
              <input
                type="search"
                value={procedureSearch}
                onChange={(event) => setProcedureSearch(event.target.value)}
                placeholder="Código (ej. 231101) o nombre del procedimiento..."
                className="block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs text-slate-700"
              />
              <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                {filteredProcedures.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-slate-500">Sin coincidencias</li>
                ) : (
                  filteredProcedures.map((option) => (
                    <li key={`${option.procedure}-${option.cupsCode}`}>
                      <button
                        type="button"
                        onClick={() => selectProcedure(option)}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50"
                      >
                        <span className="font-mono text-dental-700">{option.cupsCode}</span>
                        <span className="ml-2 text-slate-700">{option.procedure}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
              {!procedureSearch.trim() && (
                <p className="mt-1 text-[10px] text-slate-400">
                  Lista abreviada de cirugía oral. Escriba para buscar en el catálogo completo.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dental-200 bg-dental-50/40 p-3">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold text-dental-800">Procedimiento seleccionado</p>
                  <p className="text-xs text-slate-700">
                    <span className="font-mono font-semibold text-dental-700">
                      {pendingProcedure.cupsCode}
                    </span>
                    {' — '}
                    {pendingProcedure.procedure}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetPending}
                  className="text-[11px] text-slate-500 hover:text-slate-700"
                >
                  Cambiar procedimiento
                </button>
              </div>

              <label className="mb-1 block text-[11px] font-medium text-slate-600">
                Pieza dental (FDI)
              </label>
              <select
                value={pendingTooth}
                onChange={(event) => setPendingTooth(event.target.value)}
                className="block w-full max-w-xs rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-700"
              >
                <option value="">Seleccione pieza...</option>
                {FDI_TOOTH_OPTIONS.map((fdi) => (
                  <option key={fdi} value={fdi}>
                    {fdi}
                  </option>
                ))}
              </select>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!pendingTooth}
                  onClick={addPendingItem}
                  className="rounded-lg bg-dental-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-dental-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Agregar al plan
                </button>
                <button
                  type="button"
                  onClick={resetPending}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {value.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">Sin procedimientos planificados.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-600">
            {value.length} procedimiento{value.length === 1 ? '' : 's'} en el plan
          </p>
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">CUPS</th>
                <th className="px-3 py-2 font-medium">Procedimiento</th>
                <th className="px-3 py-2 font-medium">Pieza FDI</th>
                <th className="px-3 py-2 font-medium">Notas</th>
                {!disabled && <th className="px-3 py-2 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {value.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-3 py-2 font-mono text-dental-700">{item.cupsCode}</td>
                  <td className="px-3 py-2 text-slate-700">{item.procedure}</td>
                  <td className="px-3 py-2">
                    {disabled ? (
                      <span className="font-semibold text-slate-800">{item.toothNumber}</span>
                    ) : (
                      <select
                        value={item.toothNumber}
                        onChange={(event) =>
                          updateItem(item.id, { toothNumber: Number(event.target.value) })
                        }
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                      >
                        {FDI_TOOTH_OPTIONS.map((fdi) => (
                          <option key={fdi} value={fdi}>
                            {fdi}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {disabled ? (
                      <span className="text-slate-600">{item.notes ?? '—'}</span>
                    ) : (
                      <input
                        type="text"
                        value={item.notes ?? ''}
                        onChange={(event) =>
                          updateItem(item.id, { notes: event.target.value || undefined })
                        }
                        placeholder="Opcional"
                        className="w-full min-w-[8rem] rounded border border-slate-200 px-2 py-1 text-xs"
                      />
                    )}
                  </td>
                  {!disabled && (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        Quitar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

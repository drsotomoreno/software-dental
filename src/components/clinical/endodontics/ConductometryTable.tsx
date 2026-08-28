import { useEffect, useRef } from 'react'
import {
  CONDUCTOMETRY_METHOD_OPTIONS,
  ENDO_REFERENCE_POINT_OPTIONS,
  type CanalMeasurement,
  type ConductometryMethod,
} from '@/types/endoAnnex.types'
import { buildDefaultCanalsForTooth, createEmptyCanalMeasurement } from '@/utils/endoAnnex'

interface ConductometryTableProps {
  toothNumber: number | null
  value: CanalMeasurement[]
  onChange: (value: CanalMeasurement[]) => void
  disabled?: boolean
}

function parseWorkingLength(raw: string): number {
  const parsed = Number(raw.replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed * 10) / 10
}

export function ConductometryTable({
  toothNumber,
  value,
  onChange,
  disabled = false,
}: ConductometryTableProps) {
  const lastToothRef = useRef<number | null>(null)

  useEffect(() => {
    if (!toothNumber || toothNumber === lastToothRef.current) return
    lastToothRef.current = toothNumber
    onChange(buildDefaultCanalsForTooth(toothNumber))
  }, [toothNumber, onChange])

  const updateRow = (index: number, patch: Partial<CanalMeasurement>) => {
    onChange(value.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }

  const removeRow = (index: number) => {
    onChange(value.filter((_, rowIndex) => rowIndex !== index))
  }

  const addRow = () => {
    onChange([...value, createEmptyCanalMeasurement('')])
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h6 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Conductometría
        </h6>
        {!disabled && (
          <button type="button" onClick={addRow} className="text-xs font-medium text-dental-600 hover:underline">
            + Conducto
          </button>
        )}
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-slate-500">
          {toothNumber
            ? 'Seleccione la pieza para precargar conductos probables.'
            : 'Indique primero el número de diente (FDI).'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-1 py-1.5 font-medium">Conducto</th>
                <th className="px-1 py-1.5 font-medium">Long. trabajo (mm)</th>
                <th className="px-1 py-1.5 font-medium">Método</th>
                <th className="px-1 py-1.5 font-medium">Ref.</th>
                <th className="px-1 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {value.map((row, index) => (
                <tr key={`${row.canalName}-${index}`} className="border-b border-slate-100">
                  <td className="px-1 py-1">
                    <input
                      disabled={disabled}
                      value={row.canalName}
                      onChange={(event) => updateRow(index, { canalName: event.target.value })}
                      placeholder="MB"
                      className="input-field w-16 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      disabled={disabled}
                      value={row.workingLength || ''}
                      onChange={(event) =>
                        updateRow(index, { workingLength: parseWorkingLength(event.target.value) })
                      }
                      className="input-field w-20 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      disabled={disabled}
                      value={row.method}
                      onChange={(event) =>
                        updateRow(index, { method: event.target.value as ConductometryMethod | '' })
                      }
                      className="input-field w-20 px-1 py-1 text-xs"
                    >
                      <option value="">—</option>
                      {CONDUCTOMETRY_METHOD_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <select
                      disabled={disabled}
                      value={row.referencePoint}
                      onChange={(event) => updateRow(index, { referencePoint: event.target.value })}
                      className="input-field min-w-[7rem] px-1 py-1 text-xs"
                    >
                      <option value="">—</option>
                      {ENDO_REFERENCE_POINT_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1 text-right">
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        className="text-slate-400 hover:text-red-600"
                        aria-label="Eliminar conducto"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

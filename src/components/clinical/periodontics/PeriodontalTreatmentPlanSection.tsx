import { memo } from 'react'
import { ClipboardList, Plus, Trash2 } from 'lucide-react'
import { generateId } from '@/utils'
import type {
  PeriodontalTreatmentPhase,
  PeriodontalTreatmentRow,
} from '@/types/periodonticsAnnex'
import { PERIODONTAL_TREATMENT_PHASE_LABELS, DEFAULT_PHASE_PROCEDURES } from '@/types/periodonticsAnnex'

interface PeriodontalTreatmentPlanSectionProps {
  rows: PeriodontalTreatmentRow[]
  disabled?: boolean
  onChange: (rows: PeriodontalTreatmentRow[]) => void
}

function PeriodontalTreatmentPlanSectionComponent({
  rows,
  disabled = false,
  onChange,
}: PeriodontalTreatmentPlanSectionProps) {
  const updateRow = (id: string, patch: Partial<PeriodontalTreatmentRow>) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const addRow = (phase: PeriodontalTreatmentPhase) => {
    onChange([
      ...rows,
      {
        id: generateId(),
        phase,
        procedure: DEFAULT_PHASE_PROCEDURES[phase],
        plannedDate: '',
        status: 'pendiente',
        notes: '',
      },
    ])
  }

  const removeRow = (id: string) => {
    onChange(rows.filter((row) => row.id !== id))
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-dental-600" />
          <h4 className="text-sm font-semibold text-slate-800">Plan de tratamiento periodontal</h4>
        </div>
        {!disabled && (
          <div className="flex flex-wrap gap-2">
            {(['fase_i', 'fase_ii', 'fase_iii'] as PeriodontalTreatmentPhase[]).map((phase) => (
              <button
                key={phase}
                type="button"
                onClick={() => addRow(phase)}
                className="btn-secondary inline-flex items-center gap-1 text-xs"
              >
                <Plus className="h-3 w-3" />
                {PERIODONTAL_TREATMENT_PHASE_LABELS[phase]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="px-2 py-2">Fase</th>
              <th className="px-2 py-2">Procedimiento</th>
              <th className="px-2 py-2">Fecha</th>
              <th className="px-2 py-2">Estado</th>
              <th className="px-2 py-2">Notas</th>
              {!disabled && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 align-top">
                <td className="px-2 py-2">
                  <select
                    disabled={disabled}
                    value={row.phase}
                    onChange={(e) =>
                      updateRow(row.id, {
                        phase: e.target.value as PeriodontalTreatmentPhase,
                        procedure: DEFAULT_PHASE_PROCEDURES[e.target.value as PeriodontalTreatmentPhase],
                      })
                    }
                    className="input-field min-w-[140px] text-xs"
                  >
                    {(['fase_i', 'fase_ii', 'fase_iii'] as PeriodontalTreatmentPhase[]).map((phase) => (
                      <option key={phase} value={phase}>
                        {PERIODONTAL_TREATMENT_PHASE_LABELS[phase]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <input
                    disabled={disabled}
                    value={row.procedure}
                    onChange={(e) => updateRow(row.id, { procedure: e.target.value })}
                    className="input-field min-w-[220px] text-xs"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="date"
                    disabled={disabled}
                    value={row.plannedDate}
                    onChange={(e) => updateRow(row.id, { plannedDate: e.target.value })}
                    className="input-field text-xs"
                  />
                </td>
                <td className="px-2 py-2">
                  <select
                    disabled={disabled}
                    value={row.status}
                    onChange={(e) =>
                      updateRow(row.id, {
                        status: e.target.value as PeriodontalTreatmentRow['status'],
                      })
                    }
                    className="input-field text-xs"
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="en_progreso">En progreso</option>
                    <option value="completado">Completado</option>
                  </select>
                </td>
                <td className="px-2 py-2">
                  <input
                    disabled={disabled}
                    value={row.notes}
                    onChange={(e) => updateRow(row.id, { notes: e.target.value })}
                    className="input-field min-w-[180px] text-xs"
                    placeholder="Observaciones..."
                  />
                </td>
                {!disabled && (
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="rounded p-1 text-red-500 hover:bg-red-50"
                      aria-label="Eliminar fila"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export const PeriodontalTreatmentPlanSection = memo(PeriodontalTreatmentPlanSectionComponent)

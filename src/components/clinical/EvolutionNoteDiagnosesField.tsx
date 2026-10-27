import type { EvolutionNote, EvolutionNotePatch } from '@/types/evolutionNote'
import { AnatomicalAssociationSelect } from '@/components/clinical/diagnostics/DiagnosisAssociationFields'
import { Cie10PrincipalCombobox } from '@/components/clinical/Cie10PrincipalCombobox'
import { diagnosisLocationLabel } from '@/utils/diagnosisAssociation'
import {
  editableEvolutionDiagnoses,
  evolutionDiagnosesPatch,
  withSinglePrincipalDiagnosis,
} from '@/utils/evolutionNoteAssociation'

interface EvolutionNoteDiagnosesFieldProps {
  note: EvolutionNote
  disabled?: boolean
  onChange: (patch: EvolutionNotePatch) => void
}

export function EvolutionNoteDiagnosesField({
  note,
  disabled = false,
  onChange,
}: EvolutionNoteDiagnosesFieldProps) {
  const rows = editableEvolutionDiagnoses(note)

  const commit = (next: ReturnType<typeof editableEvolutionDiagnoses>) => {
    onChange(evolutionDiagnosesPatch(next))
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h5 className="text-xs font-semibold uppercase text-slate-500">Diagnósticos de la sesión</h5>
          <p className="mt-1 text-[10px] text-slate-400">
            Cada diagnóstico se asocia a un diente, a un maxilar o a toda la dentición.
          </p>
        </div>
        {!disabled && (
          <button
            type="button"
            className="text-xs font-medium text-dental-700 hover:text-dental-900"
            onClick={() =>
              commit([
                ...rows,
                {
                  id: crypto.randomUUID(),
                  code: '',
                  description: '',
                  type: 'relacionado',
                },
              ])
            }
          >
            + Agregar diagnóstico
          </button>
        )}
      </div>

      <div className="space-y-3">
        {rows.map((diagnosis) => {
          const pending =
            !disabled && Boolean(diagnosis.code.trim()) && !diagnosisLocationLabel(diagnosis)
          return (
            <div key={diagnosis.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {diagnosis.type === 'principal' ? 'Principal' : 'Relacionado'}
                </span>
                {!disabled && rows.length > 1 && (
                  <button
                    type="button"
                    className="text-xs text-red-500 hover:text-red-700"
                    onClick={() => commit(rows.filter((item) => item.id !== diagnosis.id))}
                  >
                    Quitar
                  </button>
                )}
              </div>

              {!disabled && rows.length > 1 && (
                <div className="mb-2">
                  <label className="label-field">Tipo</label>
                  <select
                    className="input-field"
                    value={diagnosis.type}
                    aria-label={`Tipo del diagnóstico ${diagnosis.code || ''}`.trim()}
                    onChange={(event) => {
                      const type = event.target.value === 'principal' ? 'principal' : 'relacionado'
                      if (type === 'principal') {
                        commit(withSinglePrincipalDiagnosis(rows, diagnosis.id))
                        return
                      }
                      const demoted = rows.map((item) =>
                        item.id === diagnosis.id ? { ...item, type: 'relacionado' as const } : item,
                      )
                      const hasPrincipal = demoted.some((item) => item.type === 'principal')
                      commit(
                        hasPrincipal
                          ? demoted
                          : demoted.map((item, index) =>
                              index === demoted.findIndex((row) => row.id !== diagnosis.id)
                                ? { ...item, type: 'principal' }
                                : item,
                            ),
                      )
                    }}
                  >
                    <option value="principal">Principal</option>
                    <option value="relacionado">Relacionado</option>
                  </select>
                </div>
              )}

              <Cie10PrincipalCombobox
                value={diagnosis.code}
                disabled={disabled}
                required={diagnosis.type === 'principal'}
                label={
                  diagnosis.type === 'principal'
                    ? 'Diagnóstico principal (CIE-10)'
                    : 'Diagnóstico relacionado (CIE-10)'
                }
                onChange={(code, description) =>
                  commit(
                    rows.map((item) =>
                      item.id === diagnosis.id
                        ? {
                            ...item,
                            code,
                            description: description ?? (code === item.code ? item.description : ''),
                          }
                        : item,
                    ),
                  )
                }
              />

              <div className="mt-3">
                <AnatomicalAssociationSelect
                  toothNumber={diagnosis.toothNumber}
                  anatomicalScope={diagnosis.anatomicalScope}
                  disabled={disabled}
                  pending={pending}
                  ariaLabel={`Asociar el diagnóstico ${diagnosis.code || 'de la sesión'} a un diente, un maxilar o toda la dentición`}
                  onChange={(location) =>
                    commit(
                      rows.map((item) =>
                        item.id === diagnosis.id ? { ...item, ...location } : item,
                      ),
                    )
                  }
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

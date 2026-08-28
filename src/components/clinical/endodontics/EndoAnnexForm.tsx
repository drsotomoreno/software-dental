import { useMemo, useState } from 'react'
import {
  Cie10FindingSuggestions,
  SelectedCie10Badge,
} from '@/components/clinical/Cie10FindingSuggestions'
import type { EndoAnnexData, EndoDiagnosisEntry } from '@/types/endoAnnex.types'
import {
  ENDO_COMPLEXITY_OPTIONS,
  ENDO_FDI_TEETH,
} from '@/types/endoAnnex.types'
import { resolveEndoBudget, stampEndoAnnexAudit } from '@/utils/endoAnnex'
import { ClinicalTestsSemaphore } from './ClinicalTestsSemaphore'
import { ConductometryTable } from './ConductometryTable'
import { EndodonticBudgetSection } from './EndodonticBudgetSection'
import { RadiographicFindingsSection } from './RadiographicFindingsSection'

interface EndoAnnexFormProps {
  value: EndoAnnexData
  onChange: (value: EndoAnnexData) => void
  disabled?: boolean
  specialistId?: string
}

export function EndoAnnexForm({
  value,
  onChange,
  disabled = false,
  specialistId = '',
}: EndoAnnexFormProps) {
  const [diagnosisQuery, setDiagnosisQuery] = useState('')

  const diagnosisCodes = useMemo(
    () => value.diagnosis.map((item) => item.code),
    [value.diagnosis],
  )

  const emit = (patch: Partial<EndoAnnexData>) => {
    const merged = { ...value, ...patch }
    if (
      patch.complexityLevel !== undefined ||
      patch.isRetreatment !== undefined ||
      patch.toothNumber !== undefined
    ) {
      merged.budget = resolveEndoBudget(
        merged.complexityLevel,
        merged.isRetreatment,
        merged.toothNumber,
        merged.budget,
      )
    }
    onChange(stampEndoAnnexAudit(merged, specialistId))
  }

  const addDiagnosis = (entry: EndoDiagnosisEntry) => {
    if (value.diagnosis.some((item) => item.code === entry.code)) return
    emit({ diagnosis: [...value.diagnosis, entry] })
    setDiagnosisQuery('')
  }

  const removeDiagnosis = (code: string) => {
    emit({ diagnosis: value.diagnosis.filter((item) => item.code !== code) })
  }

  return (
    <div className="max-w-3xl space-y-3 rounded-xl border border-teal-200 bg-gradient-to-b from-teal-50/50 to-white p-4">
      <div>
        <h5 className="text-sm font-semibold text-slate-800">Anexo de Endodoncia</h5>
        <p className="text-xs text-slate-500">
          Diagnóstico, conductometría y presupuesto en flujo compacto.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label-field" htmlFor="endo-tooth-number">
            Pieza FDI
          </label>
          <select
            id="endo-tooth-number"
            disabled={disabled}
            value={value.toothNumber ?? ''}
            onChange={(event) =>
              emit({
                toothNumber: event.target.value ? Number(event.target.value) : null,
              })
            }
            className="input-field text-sm"
          >
            <option value="">Seleccione...</option>
            {ENDO_FDI_TEETH.map((tooth) => (
              <option key={tooth} value={tooth}>
                {tooth}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2 flex items-end">
          <label className="clinical-todo-normal-label">
            <input
              type="checkbox"
              disabled={disabled}
              checked={value.isRetreatment}
              onChange={(event) => emit({ isRetreatment: event.target.checked })}
              className="rounded border-green-300 text-dental-600 focus:ring-dental-500"
            />
            Reendodoncia
          </label>
        </div>
      </div>

      <div className="relative">
        <label className="label-field" htmlFor="endo-diagnosis-search">
          Diagnóstico CIE-10 (Pulpar / Periapical)
        </label>
        {value.diagnosis.map((item) => (
          <SelectedCie10Badge
            key={item.code}
            value={item}
            disabled={disabled}
            onClear={() => removeDiagnosis(item.code)}
          />
        ))}
        <input
          id="endo-diagnosis-search"
          disabled={disabled}
          value={diagnosisQuery}
          onChange={(event) => setDiagnosisQuery(event.target.value)}
          placeholder="Buscar K04.0, K04.5, necrosis..."
          className="input-field text-sm"
        />
        <Cie10FindingSuggestions
          query={diagnosisQuery}
          disabled={disabled}
          onSelect={(option) => addDiagnosis(option)}
        />
      </div>

      <ClinicalTestsSemaphore
        value={value.clinicalTests}
        diagnosisCodes={diagnosisCodes}
        onChange={(clinicalTests) => emit({ clinicalTests })}
        disabled={disabled}
      />

      <RadiographicFindingsSection
        value={value.radiographicFindings}
        onChange={(radiographicFindings) => emit({ radiographicFindings })}
        disabled={disabled}
      />

      <ConductometryTable
        toothNumber={value.toothNumber}
        value={value.canals}
        onChange={(canals) => emit({ canals })}
        disabled={disabled}
      />

      <div>
        <p className="label-field mb-2">Nivel de Complejidad</p>
        <div className="flex flex-wrap gap-2">
          {ENDO_COMPLEXITY_OPTIONS.map((option) => {
            const active = value.complexityLevel === option.value
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                onClick={() =>
                  emit({
                    complexityLevel: active ? '' : option.value,
                  })
                }
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  active
                    ? 'border-teal-400 bg-teal-50 text-teal-900 ring-2 ring-teal-200 ring-offset-1'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <EndodonticBudgetSection
        complexityLevel={value.complexityLevel}
        isRetreatment={value.isRetreatment}
        currentToothNumber={value.toothNumber}
        value={value.budget}
        onChange={(budget) => emit({ budget })}
        disabled={disabled}
      />

      <div>
        <label className="label-field" htmlFor="endo-notes">
          Notas del Anexo
        </label>
        <textarea
          id="endo-notes"
          rows={2}
          disabled={disabled}
          value={value.notes}
          onChange={(event) => emit({ notes: event.target.value })}
          placeholder="Observaciones clínicas adicionales..."
          className="input-field resize-y text-sm"
        />
      </div>
    </div>
  )
}

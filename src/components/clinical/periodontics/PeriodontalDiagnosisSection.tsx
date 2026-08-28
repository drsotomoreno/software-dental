import { memo } from 'react'
import { Stethoscope } from 'lucide-react'
import { VoiceDictationButton } from '@/components/voice'
import type { PeriodontalDiagnosis } from '@/types/periodonticsAnnex'

interface PeriodontalDiagnosisSectionProps {
  diagnosis: PeriodontalDiagnosis
  disabled?: boolean
  onChange: (diagnosis: PeriodontalDiagnosis) => void
}

function PeriodontalDiagnosisSectionComponent({
  diagnosis,
  disabled = false,
  onChange,
}: PeriodontalDiagnosisSectionProps) {
  const update = (patch: Partial<PeriodontalDiagnosis>) =>
    onChange({ ...diagnosis, ...patch })

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <Stethoscope className="h-4 w-4 text-dental-600" />
        <h4 className="text-sm font-semibold text-slate-800">Diagnóstico periodontal y pronóstico</h4>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-slate-600">
          Estadio (AAP/EFP)
          <select
            disabled={disabled}
            value={diagnosis.staging}
            onChange={(e) => update({ staging: e.target.value as PeriodontalDiagnosis['staging'] })}
            className="input-field mt-1 text-sm"
          >
            <option value="">Seleccione...</option>
            <option value="I">Estadio I</option>
            <option value="II">Estadio II</option>
            <option value="III">Estadio III</option>
            <option value="IV">Estadio IV</option>
          </select>
        </label>

        <label className="text-xs text-slate-600">
          Grado (A, B, C)
          <select
            disabled={disabled}
            value={diagnosis.grading}
            onChange={(e) => update({ grading: e.target.value as PeriodontalDiagnosis['grading'] })}
            className="input-field mt-1 text-sm"
          >
            <option value="">Seleccione...</option>
            <option value="A">Grado A</option>
            <option value="B">Grado B</option>
            <option value="C">Grado C</option>
          </select>
        </label>

        <label className="text-xs text-slate-600">
          Extensión / tipo
          <select
            disabled={disabled}
            value={diagnosis.extent}
            onChange={(e) => update({ extent: e.target.value as PeriodontalDiagnosis['extent'] })}
            className="input-field mt-1 text-sm"
          >
            <option value="">Seleccione...</option>
            <option value="gingivitis">Gingivitis</option>
            <option value="localizada">Periodontitis localizada</option>
            <option value="generalizada">Periodontitis generalizada</option>
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="label-field mb-0" htmlFor="perio-clinical-observations">
              Observaciones clínicas
            </label>
            {!disabled && (
              <VoiceDictationButton
                targetInputId="perio-clinical-observations"
                getValue={() => diagnosis.clinicalObservations}
                onValueChange={(clinicalObservations) => update({ clinicalObservations })}
              />
            )}
          </div>
          <textarea
            id="perio-clinical-observations"
            rows={4}
            disabled={disabled}
            value={diagnosis.clinicalObservations}
            onChange={(e) => update({ clinicalObservations: e.target.value })}
            placeholder="Hallazgos clínicos, pronóstico por sextantes, compromiso óseo..."
            className="input-field resize-y text-sm"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="label-field mb-0" htmlFor="perio-systemic-risk">
              Factores de riesgo sistémico
            </label>
            {!disabled && (
              <VoiceDictationButton
                targetInputId="perio-systemic-risk"
                getValue={() => diagnosis.systemicRiskFactors}
                onValueChange={(systemicRiskFactors) => update({ systemicRiskFactors })}
              />
            )}
          </div>
          <textarea
            id="perio-systemic-risk"
            rows={4}
            disabled={disabled}
            value={diagnosis.systemicRiskFactors}
            onChange={(e) => update({ systemicRiskFactors: e.target.value })}
            placeholder="Tabaquismo, diabetes, estrés, medicamentos..."
            className="input-field resize-y text-sm"
          />
        </div>
      </div>
    </section>
  )
}

export const PeriodontalDiagnosisSection = memo(PeriodontalDiagnosisSectionComponent)

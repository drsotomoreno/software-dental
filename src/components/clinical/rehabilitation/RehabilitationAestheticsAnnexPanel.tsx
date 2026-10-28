import { useEffect, useMemo } from 'react'
import { VoiceDictationButton } from '@/components/voice'
import { AnnexProcedureBudgetSection } from '@/components/clinical/AnnexProcedureBudgetSection'
import { RehabOdontogram } from '@/components/clinical/rehabilitation/rehab-odontogram'
import { InitialFindingsSection } from '@/components/clinical/rehabilitation/InitialFindingsSection'
import { DentalWhiteningSection } from '@/components/clinical/rehabilitation/DentalWhiteningSection'
import type { RehabilitationAestheticsAnnex } from '@/types/rehabilitationAestheticsAnnex'
import { normalizeRehabilitationAestheticsAnnex } from '@/types/rehabilitationAestheticsAnnex'
import { SPECIALIZED_ANNEX_LABELS } from '@/types/specializedAnnexes'
import {
  canImportRehabPlanningBudget,
  importRehabPlanningIntoBudget,
} from '@/utils/rehabAnnexBudget'

interface RehabilitationAestheticsAnnexPanelProps {
  data: RehabilitationAestheticsAnnex | null | undefined
  onChange: (data: RehabilitationAestheticsAnnex) => void
  disabled?: boolean
}

function rehabAnnexNeedsHeal(
  raw: RehabilitationAestheticsAnnex | null | undefined,
): boolean {
  if (!raw || typeof raw !== 'object') return true
  return (
    raw.budget == null ||
    raw.initialFindings == null ||
    raw.dentalWhitening == null ||
    !Array.isArray(raw.visualTreatmentPlan)
  )
}

interface FieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  multiline?: boolean
  inputId: string
  voiceEnabled?: boolean
}

function AnnexField({
  label,
  value,
  onChange,
  disabled = false,
  placeholder,
  multiline = false,
  inputId,
  voiceEnabled = false,
}: FieldProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="label-field mb-0" htmlFor={inputId}>
          {label}
        </label>
        {voiceEnabled && !disabled && (
          <VoiceDictationButton
            targetInputId={inputId}
            getValue={() => value}
            onValueChange={onChange}
          />
        )}
      </div>
      {multiline ? (
        <textarea
          id={inputId}
          rows={3}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input-field resize-y text-sm"
        />
      ) : (
        <input
          id={inputId}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input-field text-sm"
        />
      )}
    </div>
  )
}

export function RehabilitationAestheticsAnnexPanel({
  data: dataProp,
  onChange,
  disabled = false,
}: RehabilitationAestheticsAnnexPanelProps) {
  const data = useMemo(
    () => normalizeRehabilitationAestheticsAnnex(dataProp ?? undefined),
    [dataProp],
  )

  // Historias/borradores previos al campo `budget` (u otros campos nuevos):
  // al abrir el anexo se reescribe la forma completa para que no vuelva a fallar.
  useEffect(() => {
    if (disabled || !rehabAnnexNeedsHeal(dataProp)) return
    onChange(data)
  }, [data, dataProp, disabled, onChange])

  const update = (patch: Partial<RehabilitationAestheticsAnnex>) =>
    onChange({ ...data, ...patch })

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-slate-800">
        {SPECIALIZED_ANNEX_LABELS.rehabilitationAesthetics}
      </h4>
      <p className="text-xs text-slate-500">
        Documentación mínima recomendada para casos de rehabilitación oral, estética dental y aclaramiento.
      </p>

      <InitialFindingsSection
        value={data.initialFindings}
        onChange={(initialFindings) => update({ initialFindings })}
        disabled={disabled}
      />

      <RehabOdontogram
        value={data.visualTreatmentPlan}
        protesisTotal={data.protesisTotal}
        protesisParcialRemovible={data.protesisParcialRemovible}
        onChange={(visualTreatmentPlan) => update({ visualTreatmentPlan })}
        onProtesisTotalChange={(protesisTotal) => update({ protesisTotal })}
        onProtesisParcialRemovibleChange={(protesisParcialRemovible) =>
          update({ protesisParcialRemovible })
        }
        restorationDetails={data.restorationDetails}
        onRestorationDetailsChange={(restorationDetails) => update({ restorationDetails })}
        disabled={disabled}
        className="mb-1"
      />

      <DentalWhiteningSection
        value={data.dentalWhitening}
        onChange={(dentalWhitening) => update({ dentalWhitening })}
        disabled={disabled}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <AnnexField
            label="Contraindicaciones y limitaciones"
            value={data.contraindications}
            onChange={(contraindications) => update({ contraindications })}
            disabled={disabled}
            placeholder="Bruxismo severo, expectativas irreales, compromiso periodontal..."
            multiline
            inputId="rehab-contraindications"
          />
        </div>

        <div className="sm:col-span-2">
          <AnnexField
            label="Notas adicionales"
            value={data.notes}
            onChange={(notes) => update({ notes })}
            disabled={disabled}
            placeholder="Observaciones del anexo de rehabilitación, estética y aclaramiento..."
            multiline
            inputId="rehab-notes"
            voiceEnabled
          />
        </div>
      </div>

      <AnnexProcedureBudgetSection
        title="Presupuesto de Rehabilitación Estética y Aclaramiento"
        description="Tabla resumida según el Resumen Tratamiento Restaurador. Asigne precios, defina el plan de pagos y consulte el total."
        value={data.budget}
        onChange={(budget) => update({ budget })}
        disabled={disabled}
        importButtonLabel="Importar Desde Resumen Tratamiento Restaurador"
        canImport={canImportRehabPlanningBudget(data)}
        onImport={() => {
          const result = importRehabPlanningIntoBudget(data, data.budget)
          update({ budget: result.budget })
          return { added: result.added, skipped: result.skipped }
        }}
        emptyHint="Importe el Resumen Tratamiento Restaurador o agregue un procedimiento."
        className="mt-1"
      />
    </div>
  )
}

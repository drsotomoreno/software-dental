import type { Anamnesis } from '@/types/anamnesis'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { VoiceDictationButton } from '@/components/voice'

interface ChiefComplaintSectionProps {
  data: Anamnesis
  onChange: (data: Anamnesis) => void
  disabled?: boolean
}

export function ChiefComplaintSection({
  data,
  onChange,
  disabled = false,
}: ChiefComplaintSectionProps) {
  const update = (patch: Partial<Anamnesis>) => onChange({ ...data, ...patch })

  return (
    <section className="card">
      <h3 className={`mb-4 ${CLINICAL_SECTION_TITLE_CLASS}`}>
        {clinicalSectionTitle(CLINICAL_HISTORY_SECTION_NUMBERS.anamnesis, 'Motivo de Consulta')}
      </h3>
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="label-field mb-0" htmlFor="rapid-chief-complaint">
              Motivo de consulta
            </label>
            {!disabled && (
              <VoiceDictationButton
                targetInputId="rapid-chief-complaint"
                getValue={() => data.chiefComplaint}
                onValueChange={(chiefComplaint) => update({ chiefComplaint })}
              />
            )}
          </div>
          <textarea
            id="rapid-chief-complaint"
            rows={2}
            disabled={disabled}
            value={data.chiefComplaint}
            onChange={(event) => update({ chiefComplaint: event.target.value })}
            placeholder="En palabras del paciente..."
            className="input-field resize-y"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="label-field mb-0" htmlFor="rapid-current-illness">
              Enfermedad actual
            </label>
            {!disabled && (
              <VoiceDictationButton
                targetInputId="rapid-current-illness"
                getValue={() => data.currentIllness}
                onValueChange={(currentIllness) => update({ currentIllness })}
              />
            )}
          </div>
          <textarea
            id="rapid-current-illness"
            rows={2}
            disabled={disabled}
            value={data.currentIllness}
            onChange={(event) => update({ currentIllness: event.target.value })}
            placeholder="Evolución breve del cuadro..."
            className="input-field resize-y"
          />
        </div>
      </div>
    </section>
  )
}

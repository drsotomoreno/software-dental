import type { Patient, PatientFormData } from '@/types/patient'
import { PATIENT_PHASE_LABELS, normalizePatientPhase, isValuatedOnlyPatient, isCompletedPatient } from '@/types/patient'
import { differenceInYears } from 'date-fns'
import { REGIME_TYPES } from '@/constants/dental'
import { CLINICAL_SECTION_TITLE_CLASS } from '@/constants/clinicalHistorySections'
import { PatientRegistrationSection } from './PatientRegistrationSection'

interface PatientIdentificationSummaryProps {
  patient: Patient
  form?: PatientFormData | null
  onChange?: (data: PatientFormData) => void
  disabled?: boolean
  canEdit?: boolean
  saving?: boolean
  onSave?: () => void
}

function PhaseBadge({ patient }: { patient: Patient }) {
  const phase = normalizePatientPhase(patient.phase)
  const phaseLabel = PATIENT_PHASE_LABELS[phase]
  const valuatedOnly = isValuatedOnlyPatient(patient)
  const treatmentCompleted = isCompletedPatient(patient)

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        treatmentCompleted
          ? 'bg-teal-100 text-teal-800'
          : valuatedOnly
            ? 'bg-amber-100 text-amber-800'
            : phase === 'TRATAMIENTO_ACEPTADO'
              ? 'bg-teal-100 text-teal-800'
              : 'bg-amber-100 text-amber-800'
      }`}
    >
      {treatmentCompleted
        ? 'Tratamiento terminado'
        : valuatedOnly
          ? 'Paciente valorado'
          : phaseLabel}
    </span>
  )
}

export function PatientIdentificationSummary({
  patient,
  form,
  onChange,
  disabled = false,
  canEdit = false,
  saving = false,
  onSave,
}: PatientIdentificationSummaryProps) {
  const age = patient.birthDate
    ? differenceInYears(new Date(), new Date(form?.birthDate || patient.birthDate))
    : null

  const regimeLabel =
    REGIME_TYPES.find((r) => r.value === patient.regime)?.label ?? patient.regime

  const genderLabel =
    patient.gender === 'M' ? 'Masculino' : patient.gender === 'F' ? 'Femenino' : 'Otro'

  if (canEdit && form && onChange) {
    return (
      <div className="space-y-3">
        <PatientRegistrationSection
          value={form}
          onChange={onChange}
          disabled={disabled}
          sectionTitle="Datos de Identificación del Paciente"
          description="Teléfono, dirección y demás datos se pueden actualizar o corregir en cualquier momento. El cambio queda en el expediente del paciente, no en un folio firmado."
          headerExtra={
            <div className="flex flex-wrap items-center gap-2">
              {age !== null && (
                <span className="text-xs text-slate-500">{age} años</span>
              )}
              <PhaseBadge patient={patient} />
            </div>
          }
        />
        {onSave && !disabled && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="btn-secondary text-sm"
            >
              {saving ? 'Guardando...' : 'Guardar datos de identificación'}
            </button>
          </div>
        )}
      </div>
    )
  }

  const fields = [
    { label: 'Documento', value: `${patient.documentType} ${patient.documentNumber}` },
    { label: 'Edad', value: age !== null ? `${age} años` : '—' },
    { label: 'Género', value: genderLabel },
    { label: 'Teléfono', value: patient.phone },
    { label: 'Ciudad / Municipio', value: patient.city || '—' },
    { label: 'Código DANE', value: patient.municipalityCode || '—' },
    { label: 'Dirección', value: patient.address || '—' },
    { label: 'EPS', value: patient.insurer || '—' },
    { label: 'Régimen', value: regimeLabel || '—' },
    { label: 'Ocupación', value: patient.occupation || '—' },
    {
      label: 'Responsable / Acompañante',
      value: patient.companionName
        ? `${patient.companionName}${patient.companionRelationship ? ` (${patient.companionRelationship})` : ''}${patient.companionPhone ? ` — ${patient.companionPhone}` : ''}`
        : '—',
    },
  ]

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className={CLINICAL_SECTION_TITLE_CLASS}>Datos de Identificación del Paciente</h3>
        <PhaseBadge patient={patient} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map(({ label, value }) => (
          <div key={label}>
            <span className="text-xs font-medium uppercase text-slate-500">{label}</span>
            <p className="text-sm text-slate-800">{value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

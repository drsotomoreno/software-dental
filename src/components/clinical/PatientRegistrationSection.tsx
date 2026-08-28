import type { ReactNode } from 'react'
import type { PatientFormData } from '@/types/patient'
import { DOCUMENT_TYPES, REGIME_TYPES } from '@/constants/dental'
import { CLINICAL_SECTION_TITLE_CLASS } from '@/constants/clinicalHistorySections'
import { DaneMunicipalityFields } from '@/components/clinical/DaneMunicipalityFields'

interface PatientRegistrationSectionProps {
  value: PatientFormData
  onChange: (value: PatientFormData) => void
  disabled?: boolean
  sectionTitle?: string
  description?: string
  headerExtra?: ReactNode
}

export function PatientRegistrationSection({
  value,
  onChange,
  disabled = false,
  sectionTitle = 'Datos del Paciente',
  description,
  headerExtra,
}: PatientRegistrationSectionProps) {
  const update = (patch: Partial<PatientFormData>) => onChange({ ...value, ...patch })

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className={CLINICAL_SECTION_TITLE_CLASS}>{sectionTitle}</h3>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
        {headerExtra}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label-field" htmlFor="patient-document-type">
            Tipo de documento *
          </label>
          <select
            id="patient-document-type"
            value={value.documentType}
            onChange={(event) =>
              update({ documentType: event.target.value as PatientFormData['documentType'] })
            }
            className="input-field"
            disabled={disabled}
            required
          >
            {DOCUMENT_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-field" htmlFor="patient-document-number">
            Número de documento *
          </label>
          <input
            id="patient-document-number"
            value={value.documentNumber}
            onChange={(event) => update({ documentNumber: event.target.value })}
            className="input-field"
            disabled={disabled}
            required
          />
        </div>
        <div>
          <label className="label-field" htmlFor="patient-first-name">
            Nombres *
          </label>
          <input
            id="patient-first-name"
            value={value.firstName}
            onChange={(event) => update({ firstName: event.target.value })}
            className="input-field"
            disabled={disabled}
            required
          />
        </div>
        <div>
          <label className="label-field" htmlFor="patient-last-name">
            Apellidos *
          </label>
          <input
            id="patient-last-name"
            value={value.lastName}
            onChange={(event) => update({ lastName: event.target.value })}
            className="input-field"
            disabled={disabled}
            required
          />
        </div>
        <div>
          <label className="label-field" htmlFor="patient-birth-date">
            Fecha de nacimiento *
          </label>
          <input
            id="patient-birth-date"
            type="date"
            value={value.birthDate}
            onChange={(event) => update({ birthDate: event.target.value })}
            className="input-field"
            disabled={disabled}
            required
          />
        </div>
        <div>
          <label className="label-field" htmlFor="patient-gender">
            Género *
          </label>
          <select
            id="patient-gender"
            value={value.gender}
            onChange={(event) => update({ gender: event.target.value as PatientFormData['gender'] })}
            className="input-field"
            disabled={disabled}
            required
          >
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
            <option value="O">Otro</option>
          </select>
        </div>
        <div>
          <label className="label-field" htmlFor="patient-phone">
            Teléfono *
          </label>
          <input
            id="patient-phone"
            type="tel"
            value={value.phone}
            onChange={(event) => update({ phone: event.target.value })}
            className="input-field"
            disabled={disabled}
            required
          />
        </div>
        <div>
          <label className="label-field" htmlFor="patient-email">
            Correo electrónico
          </label>
          <input
            id="patient-email"
            type="email"
            value={value.email}
            onChange={(event) => update({ email: event.target.value })}
            className="input-field"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="label-field" htmlFor="patient-insurer">
            EPS / Aseguradora
          </label>
          <input
            id="patient-insurer"
            value={value.insurer}
            onChange={(event) => update({ insurer: event.target.value })}
            className="input-field"
            placeholder="Nombre de la EPS"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="label-field" htmlFor="patient-regime">
            Régimen
          </label>
          <select
            id="patient-regime"
            value={value.regime}
            onChange={(event) =>
              update({ regime: event.target.value as PatientFormData['regime'] })
            }
            className="input-field"
            disabled={disabled}
          >
            {REGIME_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label-field" htmlFor="patient-address">
            Dirección
          </label>
          <input
            id="patient-address"
            value={value.address}
            onChange={(event) => update({ address: event.target.value })}
            className="input-field"
            disabled={disabled}
          />
        </div>
        <DaneMunicipalityFields
          city={value.city ?? ''}
          municipalityCode={value.municipalityCode ?? ''}
          onChange={(patch) => update(patch)}
          disabled={disabled}
        />
        <div>
          <label className="label-field" htmlFor="patient-occupation">
            Ocupación
          </label>
          <input
            id="patient-occupation"
            value={value.occupation}
            onChange={(event) => update({ occupation: event.target.value })}
            className="input-field"
            placeholder="Profesión u oficio"
            disabled={disabled}
          />
        </div>
        <div className="sm:col-span-2">
          <h4 className="mb-2 text-sm font-semibold text-slate-700">Responsable / Acompañante</h4>
        </div>
        <div>
          <label className="label-field" htmlFor="patient-companion-name">
            Nombre del acompañante
          </label>
          <input
            id="patient-companion-name"
            value={value.companionName}
            onChange={(event) => update({ companionName: event.target.value })}
            className="input-field"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="label-field" htmlFor="patient-companion-phone">
            Teléfono del acompañante
          </label>
          <input
            id="patient-companion-phone"
            type="tel"
            value={value.companionPhone}
            onChange={(event) => update({ companionPhone: event.target.value })}
            className="input-field"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="label-field" htmlFor="patient-companion-relationship">
            Parentesco / relación
          </label>
          <input
            id="patient-companion-relationship"
            value={value.companionRelationship}
            onChange={(event) => update({ companionRelationship: event.target.value })}
            className="input-field"
            placeholder="Ej: madre, esposo, hijo..."
            disabled={disabled}
          />
        </div>
      </div>
    </section>
  )
}

import type { ReactNode } from 'react'
import {
  ORAL_SURGERY_ALLERGY_OPTIONS,
  ORAL_SURGERY_CARDIOVASCULAR_OPTIONS,
  ORAL_SURGERY_COAGULATION_DISEASE_OPTIONS,
  ORAL_SURGERY_COAGULATION_MEDICATION_OPTIONS,
  ORAL_SURGERY_ENDOCRINE_DISEASE_OPTIONS,
  ORAL_SURGERY_ENDOCRINE_MEDICATION_OPTIONS,
  ORAL_SURGERY_IMMUNOSUPPRESSION_DISEASE_OPTIONS,
  ORAL_SURGERY_IMMUNOSUPPRESSION_MEDICATION_OPTIONS,
  ORAL_SURGERY_LOCAL_FACTOR_OPTIONS,
  ORAL_SURGERY_MRONJ_DISEASE_OPTIONS,
  ORAL_SURGERY_MRONJ_MEDICATION_OPTIONS,
  type OralSurgeryAnnex,
  type OralSurgeryBooleanMap,
  type OralSurgeryCheckOption,
} from '@/types/oralSurgeryAnnex'
import { OralSurgeryRiskAlert } from './OralSurgeryRiskAlert'
import { OralSurgeryTreatmentPlanSection } from './OralSurgeryTreatmentPlanSection'

interface OralSurgeryAnnexSectionProps {
  value: OralSurgeryAnnex
  onChange: (value: OralSurgeryAnnex) => void
  disabled?: boolean
  variant?: 'standalone' | 'implants'
}

function toggleOption(
  map: OralSurgeryBooleanMap,
  optionId: string,
  checked: boolean,
): OralSurgeryBooleanMap {
  return { ...map, [optionId]: checked }
}

function CheckboxGroup({
  options,
  value,
  disabled,
  onChange,
  namePrefix,
}: {
  options: OralSurgeryCheckOption[]
  value: OralSurgeryBooleanMap
  disabled?: boolean
  onChange: (next: OralSurgeryBooleanMap) => void
  namePrefix: string
}) {
  return (
    <ul className="mt-3 space-y-2">
      {options.map((option) => {
        const checked = Boolean(value[option.id])
        const isHighRisk = option.riskLevel === 'high'
        return (
          <li key={option.id}>
            <label
              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                checked
                  ? isHighRisk
                    ? 'border-red-300 bg-red-50 text-red-900'
                    : 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <input
                type="checkbox"
                name={`${namePrefix}-${option.id}`}
                checked={checked}
                disabled={disabled}
                onChange={(event) =>
                  onChange(toggleOption(value, option.id, event.target.checked))
                }
                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
              />
              <span>
                <span className="font-medium">{option.label}</span>
                <span className="mt-0.5 block text-[10px] leading-snug opacity-80">
                  {option.alert}
                </span>
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

function CategoryBlock({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <p className="mt-1 text-[11px] text-slate-500">{description}</p>
      {children}
    </div>
  )
}

export function OralSurgeryAnnexSection({
  value,
  onChange,
  disabled = false,
  variant = 'standalone',
}: OralSurgeryAnnexSectionProps) {
  const isImplantsVariant = variant === 'implants'

  const content = (
    <>
      <OralSurgeryRiskAlert annex={value} />

      <div className="space-y-5 p-4">
        <CategoryBlock
          title="1. Trastornos de la coagulación y fármacos antitrombóticos"
          description="Enfermedades hemorrágicas y medicación que altera la hemostasia."
        >
          <p className="mt-3 text-[11px] font-medium text-slate-600">Enfermedades</p>
          <CheckboxGroup
            namePrefix="coag-disease"
            options={ORAL_SURGERY_COAGULATION_DISEASE_OPTIONS}
            value={value.coagulationDiseases}
            disabled={disabled}
            onChange={(coagulationDiseases) => onChange({ ...value, coagulationDiseases })}
          />
          <p className="mt-4 text-[11px] font-medium text-slate-600">Medicamentos de riesgo</p>
          <CheckboxGroup
            namePrefix="coag-med"
            options={ORAL_SURGERY_COAGULATION_MEDICATION_OPTIONS}
            value={value.coagulationMedications}
            disabled={disabled}
            onChange={(coagulationMedications) => onChange({ ...value, coagulationMedications })}
          />
        </CategoryBlock>

        <CategoryBlock
          title="2. Riesgo de osteonecrosis de los maxilares (MRONJ)"
          description="Indicaciones oncológicas / metabólicas y antirresortivos o antiangiogénicos."
        >
          <p className="mt-3 text-[11px] font-medium text-slate-600">Enfermedades / indicaciones</p>
          <CheckboxGroup
            namePrefix="mronj-disease"
            options={ORAL_SURGERY_MRONJ_DISEASE_OPTIONS}
            value={value.mronjDiseases}
            disabled={disabled}
            onChange={(mronjDiseases) => onChange({ ...value, mronjDiseases })}
          />
          <p className="mt-4 text-[11px] font-medium text-slate-600">Medicamentos de riesgo</p>
          <CheckboxGroup
            namePrefix="mronj-med"
            options={ORAL_SURGERY_MRONJ_MEDICATION_OPTIONS}
            value={value.mronjMedications}
            disabled={disabled}
            onChange={(mronjMedications) => onChange({ ...value, mronjMedications })}
          />
        </CategoryBlock>

        <CategoryBlock
          title="3. Patologías cardiovasculares y riesgo hemodinámico"
          description="Condiciones que comprometen la estabilidad cardiovascular perioperatoria."
        >
          <CheckboxGroup
            namePrefix="cardio"
            options={ORAL_SURGERY_CARDIOVASCULAR_OPTIONS}
            value={value.cardiovascularDiseases}
            disabled={disabled}
            onChange={(cardiovascularDiseases) => onChange({ ...value, cardiovascularDiseases })}
          />
        </CategoryBlock>

        <CategoryBlock
          title="4. Alteraciones endocrinas y metabolismo"
          description="Diabetes, insuficiencia suprarrenal y corticosteroides sistémicos crónicos."
        >
          <p className="mt-3 text-[11px] font-medium text-slate-600">Enfermedades</p>
          <CheckboxGroup
            namePrefix="endo-disease"
            options={ORAL_SURGERY_ENDOCRINE_DISEASE_OPTIONS}
            value={value.endocrineDiseases}
            disabled={disabled}
            onChange={(endocrineDiseases) => onChange({ ...value, endocrineDiseases })}
          />
          <p className="mt-4 text-[11px] font-medium text-slate-600">Medicamentos de riesgo</p>
          <CheckboxGroup
            namePrefix="endo-med"
            options={ORAL_SURGERY_ENDOCRINE_MEDICATION_OPTIONS}
            value={value.endocrineMedications}
            disabled={disabled}
            onChange={(endocrineMedications) => onChange({ ...value, endocrineMedications })}
          />
        </CategoryBlock>

        <CategoryBlock
          title="5. Inmunosupresión y enfermedades infecciosas"
          description="VIH avanzado, trasplante, discrasias y terapias inmunosupresoras."
        >
          <p className="mt-3 text-[11px] font-medium text-slate-600">Enfermedades</p>
          <CheckboxGroup
            namePrefix="immuno-disease"
            options={ORAL_SURGERY_IMMUNOSUPPRESSION_DISEASE_OPTIONS}
            value={value.immunosuppressionDiseases}
            disabled={disabled}
            onChange={(immunosuppressionDiseases) =>
              onChange({ ...value, immunosuppressionDiseases })
            }
          />
          <p className="mt-4 text-[11px] font-medium text-slate-600">Medicamentos de riesgo</p>
          <CheckboxGroup
            namePrefix="immuno-med"
            options={ORAL_SURGERY_IMMUNOSUPPRESSION_MEDICATION_OPTIONS}
            value={value.immunosuppressionMedications}
            disabled={disabled}
            onChange={(immunosuppressionMedications) =>
              onChange({ ...value, immunosuppressionMedications })
            }
          />
        </CategoryBlock>

        <CategoryBlock
          title="6. Alergias e hipersensibilidades críticas"
          description="Antibióticos, anestésicos locales y analgésicos de uso frecuente."
        >
          <CheckboxGroup
            namePrefix="allergy"
            options={ORAL_SURGERY_ALLERGY_OPTIONS}
            value={value.allergies}
            disabled={disabled}
            onChange={(allergies) => onChange({ ...value, allergies })}
          />
        </CategoryBlock>

        <CategoryBlock
          title="7. Factores anatómicos e infecciosos locales"
          description="Contraindicaciones temporales o absolutas de cirugía oral en la zona afectada."
        >
          <CheckboxGroup
            namePrefix="local"
            options={ORAL_SURGERY_LOCAL_FACTOR_OPTIONS}
            value={value.localFactors}
            disabled={disabled}
            onChange={(localFactors) => onChange({ ...value, localFactors })}
          />
        </CategoryBlock>

        {!isImplantsVariant && (
          <OralSurgeryTreatmentPlanSection
            value={value.treatmentPlan}
            onChange={(treatmentPlan) => onChange({ ...value, treatmentPlan })}
            disabled={disabled}
          />
        )}

        <label className="block text-[11px] text-slate-500">
          {isImplantsVariant ? 'Notas adicionales de riesgo quirúrgico' : 'Notas adicionales del anexo'}
          <textarea
            value={value.notes}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, notes: event.target.value })}
            rows={3}
            placeholder="Observaciones, coordinación con especialistas, protocolos planificados..."
            className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs text-slate-700"
          />
        </label>
      </div>
    </>
  )

  if (isImplantsVariant) {
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">
            Evaluación de Riesgo Quirúrgico y Farmacológico Pre-Implante
          </h3>
          <p className="text-xs text-slate-500">
            Complementa la anamnesis médica con el detalle de coagulación, MRONJ, alergias,
            inmunosupresión y contraindicaciones locales para cirugía de implantes.
          </p>
        </header>
        {content}
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">Anexo de Cirugía Oral General</h3>
        <p className="text-xs text-slate-500">
          Evaluación de factores críticos, patologías y fármacos de riesgo para prevenir
          complicaciones quirúrgicas, hemorrágicas, infecciosas o de cicatrización.
        </p>
      </header>
      {content}
    </section>
  )
}

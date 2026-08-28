import { APP_NAME } from '@/constants/branding'
import { toClinicalTitleCase } from '@/utils/clinicalLabels'
import {
  CLINICAL_HISTORY_PRINT_SECTIONS,
  clinicalPrintSectionLabel,
  type ClinicalHistoryPrintSectionId,
} from '@/constants/clinicalHistorySections'
import { CONSENT_TEMPLATES } from '@/constants/consentTemplates'
import {
  DIAGNOSIS_CERTAINTY_LABELS,
  PAYMENT_METHOD_LABELS,
  TREATMENT_PHASE_LABELS,
} from '@/constants/dental'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import { formatClinicalDiagnosticChartSummary, normalizeClinicalDiagnosticChart } from '@/types/clinicalDiagnosticChart'
import { NO_REPORTA_LABEL } from '@/types/anamnesis'
import { formatVitalSignsSummary } from '@/types/stomatologicalExam'
import {
  EDENTULISM_SCOPE_LABELS,
  ODONTOGRAM_SUPPLEMENTARY_LABELS,
  TOOTH_FACE_STATE_LABELS,
  TOOTH_GLOBAL_STATE_LABELS,
  type OdontogramData,
  type ToothFaceState,
} from '@/types/odontogram'
import type { Patient } from '@/types/patient'
import { SPECIALIZED_ANNEX_LABELS } from '@/types/specializedAnnexes'
import { formatRehabArchToothColor } from '@/constants/vitaClassicShades'
import { formatDentalWhiteningPlan, hasDentalWhiteningSelection } from '@/constants/dentalWhitening'
import { formatSmileAnalysis, hasSmileAnalysisSelection } from '@/constants/smileAnalysis'
import { getEvolutionCatalogServices } from '@/utils/evolutionCatalogServices'
import {
  formatDentalImplantPlanningSummaryLines,
  formatRehabMidlineDeviation,
  formatRehabPlanningSummaryLines,
} from '@/types/rehabilitationAestheticsAnnex'
import { formatEdentulousImplantPlanSummary } from '@/types/dentalImplantsPlanning'
import { formatImplantMedicalAnamnesisSummary } from '@/types/implantMedicalAnamnesis'
import { formatImplantPeriodontalAssessmentSummary } from '@/types/implantPeriodontalAssessment'
import { formatOralSurgeryAnnexSummary } from '@/types/oralSurgeryAnnex'
import { formatEndoAnnexSummary } from '@/utils/endoAnnex'
import { formatOrthodonticBudgetSummary } from '@/components/clinical/orthodontics/calculator/types'
import {
  formatFacialAnalysis,
  formatOrthodonticTreatmentDurationMonths,
  formatOrthodonticTreatmentPlan,
} from '@/types/orthodonticsAnnex'
import {
  formatMalocclusionDentalSummary,
  formatMalocclusionSkeletalSummary,
} from '@/utils/orthodonticsAnnex'
import {
  ATM_DEVIATION_MOVEMENT_OPTIONS,
  ATM_LATERALITY_OPTIONS,
  ORAL_HYGIENE_OPTIONS,
  PERIODONTIUM_YES_NO_OPTIONS,
  formatExamFindingCie10Suffix,
  getExamFindingCie10,
  type ExamField,
  type ExamFindingCie10Map,
} from '@/types/stomatologicalExam'
import type { UserProfile } from '@/types/user'
import { REGIME_TYPES } from '@/constants/dental'
import { formatDate } from './crypto'
import { openPortabilityHtmlForPrint } from './portabilityHtml'
import { differenceInYears } from 'date-fns'

export interface ClinicalHistoryPrintInput {
  patient: Patient
  professional: UserProfile
  clinicalData: ClinicalRecordFormData
  odontogram?: OdontogramData | null
  sections: ClinicalHistoryPrintSectionId[]
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function printSectionHeading(id: ClinicalHistoryPrintSectionId): string {
  const section = CLINICAL_HISTORY_PRINT_SECTIONS.find((item) => item.id === id)
  return section ? escapeHtml(clinicalPrintSectionLabel(section)) : ''
}

function paragraph(value: string | undefined | null, fallback = '—'): string {
  const text = value?.trim()
  return `<p>${escapeHtml(text || fallback)}</p>`
}

function buildOralSurgeryTreatmentPlanTable(
  items: ClinicalRecordFormData['specializedAnnexes']['oralSurgery']['treatmentPlan'],
): string {
  if (items.length === 0) return ''
  const rows = items
    .map(
      (item) =>
        `<tr>
          <td>${escapeHtml(item.cupsCode)}</td>
          <td>${escapeHtml(item.procedure)}</td>
          <td>${item.toothNumber}</td>
          <td>${escapeHtml(item.notes || '—')}</td>
        </tr>`,
    )
    .join('')
  return `
    <h4>${subheading('Plan de tratamiento quirúrgico')}</h4>
    <table>
      <thead>
        <tr>
          <th>CUPS</th>
          <th>Procedimiento</th>
          <th>Pieza FDI</th>
          <th>Notas</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

function fieldRow(label: string, value: string | undefined | null): string {
  return `<tr><th>${escapeHtml(toClinicalTitleCase(label))}</th><td>${escapeHtml(value?.trim() || '—')}</td></tr>`
}

function subheading(text: string): string {
  return escapeHtml(toClinicalTitleCase(text))
}

function examFieldRow(label: string, field: ExamField): string {
  if (field.isNormal) {
    return fieldRow(label, 'Normal')
  }
  return fieldRow(label, field.description || 'Alterado')
}

function examFieldRowWithCie10(
  label: string,
  field: ExamField,
  findingCie10: ExamFindingCie10Map,
  key: string,
): string {
  const base = field.isNormal ? 'Normal' : field.description || 'Alterado'
  return fieldRow(label, base + formatExamFindingCie10Suffix(getExamFindingCie10(findingCie10, key)))
}

function fieldRowWithCie10(
  label: string,
  value: string | undefined | null,
  findingCie10: ExamFindingCie10Map,
  key: string,
): string {
  const text = value?.trim() || '—'
  return fieldRow(label, text + formatExamFindingCie10Suffix(getExamFindingCie10(findingCie10, key)))
}

function lateralityLabel(value: string, options: { value: string; label: string }[]): string {
  return (options.find((option) => option.value === value)?.label ?? value) || '—'
}

function yesNoLabel(value: string): string {
  return (PERIODONTIUM_YES_NO_OPTIONS.find((option) => option.value === value)?.label ?? value) || '—'
}

function hygieneLabel(value: string): string {
  return (ORAL_HYGIENE_OPTIONS.find((option) => option.value === value)?.label ?? value) || '—'
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount)
}

function buildIdentificationSection(patient: Patient): string {
  const age = patient.birthDate
    ? differenceInYears(new Date(), new Date(patient.birthDate))
    : null
  const regimeLabel =
    REGIME_TYPES.find((regime) => regime.value === patient.regime)?.label ?? patient.regime
  const genderLabel =
    patient.gender === 'M' ? 'Masculino' : patient.gender === 'F' ? 'Femenino' : 'Otro'

  return `
    <section class="print-section">
      <h2>Datos de Identificación del Paciente</h2>
      <table>
        ${fieldRow('Nombre completo', `${patient.firstName} ${patient.lastName}`)}
        ${fieldRow('Documento', `${patient.documentType} ${patient.documentNumber}`)}
        ${fieldRow('Edad', age !== null ? `${age} años` : '—')}
        ${fieldRow('Género', genderLabel)}
        ${fieldRow('Teléfono', patient.phone)}
        ${fieldRow('Dirección', patient.address)}
        ${fieldRow('EPS', patient.insurer)}
        ${fieldRow('Régimen', regimeLabel)}
        ${fieldRow('Ocupación', patient.occupation)}
        ${fieldRow(
          'Responsable / Acompañante',
          patient.companionName
            ? `${patient.companionName}${patient.companionRelationship ? ` (${patient.companionRelationship})` : ''}${patient.companionPhone ? ` — ${patient.companionPhone}` : ''}`
            : '—',
        )}
      </table>
    </section>`
}

function buildAnamnesisSection(data: ClinicalRecordFormData): string {
  const { anamnesis } = data
  const allergies = anamnesis.allergiesNoReporta
    ? NO_REPORTA_LABEL
    : [
        anamnesis.allergies.medications && `Medicamentos: ${anamnesis.allergies.medications}`,
        anamnesis.allergies.anesthesia && `Anestesia: ${anamnesis.allergies.anesthesia}`,
        anamnesis.allergies.other && `Otras: ${anamnesis.allergies.other}`,
      ]
        .filter(Boolean)
        .join(' · ') || '—'

  const systemic = anamnesis.systemicDiseasesNoReporta
    ? NO_REPORTA_LABEL
    : [
        ...anamnesis.systemicDiseases,
        anamnesis.systemicDiseasesOther ? `Otras: ${anamnesis.systemicDiseasesOther}` : '',
      ]
        .filter(Boolean)
        .join(', ') || '—'

  const textValue = (value: string, noReporta?: boolean) =>
    noReporta ? NO_REPORTA_LABEL : value.trim() || '—'

  return `
    <section class="print-section">
      <h2>${printSectionHeading('anamnesis')}</h2>
      <table>
        ${fieldRow('Motivo de Consulta', anamnesis.chiefComplaint)}
        ${fieldRow('Enfermedad Actual', anamnesis.currentIllness)}
        ${fieldRow('Alergias', allergies)}
        ${fieldRow('Enfermedades sistémicas', systemic)}
        ${fieldRow(
          'Medicamentos actuales',
          textValue(anamnesis.currentMedications, anamnesis.currentMedicationsNoReporta),
        )}
        ${fieldRow(
          'Antecedentes odontológicos',
          textValue(anamnesis.dentalHistory, anamnesis.dentalHistoryNoReporta),
        )}
        ${fieldRow(
          'Antecedentes familiares',
          textValue(anamnesis.familyHistory, anamnesis.familyHistoryNoReporta),
        )}
      </table>
    </section>`
}

function buildExamSection(data: ClinicalRecordFormData): string {
  const exam = data.stomatologicalExam
  const findingCie10 = exam.findingCie10 ?? {}
  const atm = exam.atm
  const atmSummary = atm.isNormal
    ? 'Todo Normal'
    : [
        atm.clicks &&
          `Clics: ${lateralityLabel(atm.clicks, ATM_LATERALITY_OPTIONS)}${formatExamFindingCie10Suffix(getExamFindingCie10(findingCie10, 'atm.clicks'))}`,
        atm.pain &&
          `Dolor: ${lateralityLabel(atm.pain, ATM_LATERALITY_OPTIONS)}${formatExamFindingCie10Suffix(getExamFindingCie10(findingCie10, 'atm.pain'))}`,
        atm.deviation &&
          `Desviación: ${lateralityLabel(atm.deviation, ATM_DEVIATION_MOVEMENT_OPTIONS)}${formatExamFindingCie10Suffix(getExamFindingCie10(findingCie10, 'atm.deviation'))}`,
        atm.notes &&
          `Notas: ${atm.notes}${formatExamFindingCie10Suffix(getExamFindingCie10(findingCie10, 'atm.notes'))}`,
      ]
        .filter(Boolean)
        .join(' · ')

  const periodontium = exam.periodontium
  const vitalSignsSummary =
    formatVitalSignsSummary(exam.vitalSigns) +
    formatExamFindingCie10Suffix(getExamFindingCie10(findingCie10, 'vitalSigns.abnormal'))
  const gingivitisType =
    periodontium.gingivitis.present === 'si'
      ? periodontium.gingivitis.type === 'cronica'
        ? 'Crónica'
        : periodontium.gingivitis.type === 'aguda'
          ? 'Aguda'
          : '—'
      : '—'

  return `
    <section class="print-section">
      <h2>${printSectionHeading('examen')}</h2>
      <h3>${subheading('Signos vitales y estado general')}</h3>
      ${paragraph(vitalSignsSummary || 'Sin registro de signos vitales.')}
      <h3>ATM</h3>
      ${paragraph(atmSummary)}
      <h3>${subheading('Tejidos blandos')}</h3>
      <table>
        ${examFieldRowWithCie10('Labios', exam.softTissues.lips, findingCie10, 'softTissues.lips')}
        ${examFieldRowWithCie10('Mejillas', exam.softTissues.cheeks, findingCie10, 'softTissues.cheeks')}
        ${examFieldRowWithCie10('Lengua', exam.softTissues.tongue, findingCie10, 'softTissues.tongue')}
        ${examFieldRowWithCie10('Piso de boca', exam.softTissues.floorOfMouth, findingCie10, 'softTissues.floorOfMouth')}
        ${examFieldRowWithCie10('Paladar duro', exam.softTissues.hardPalate, findingCie10, 'softTissues.hardPalate')}
        ${examFieldRowWithCie10('Paladar blando', exam.softTissues.softPalate, findingCie10, 'softTissues.softPalate')}
        ${examFieldRowWithCie10('Amígdalas', exam.softTissues.tonsils, findingCie10, 'softTissues.tonsils')}
        ${examFieldRowWithCie10('Glándulas salivales', exam.softTissues.salivaryGlands, findingCie10, 'softTissues.salivaryGlands')}
      </table>
      <h3>Oclusión</h3>
      <table>
        ${fieldRow('Estado', exam.occlusion.isNormal ? 'Normal' : 'Alterada')}
        ${fieldRowWithCie10('Molar derecho', exam.occlusion.molarRight, findingCie10, 'occlusion.molarRight')}
        ${fieldRowWithCie10('Molar izquierdo', exam.occlusion.molarLeft, findingCie10, 'occlusion.molarLeft')}
        ${fieldRowWithCie10('Canino izquierdo', exam.occlusion.canineLeft, findingCie10, 'occlusion.canineLeft')}
        ${fieldRowWithCie10('Canino derecho', exam.occlusion.canineRight, findingCie10, 'occlusion.canineRight')}
        ${fieldRowWithCie10('Mordida cruzada', exam.occlusion.crossbite ? 'Sí' : 'No', findingCie10, 'occlusion.crossbite')}
        ${fieldRowWithCie10('Mordida abierta', exam.occlusion.openbite ? 'Sí' : 'No', findingCie10, 'occlusion.openbite')}
        ${fieldRowWithCie10('Mordida profunda', exam.occlusion.deepBite ? 'Sí' : 'No', findingCie10, 'occlusion.deepBite')}
        ${fieldRowWithCie10('Notas', exam.occlusion.notes, findingCie10, 'occlusion.notes')}
      </table>
      <h3>Periodonto</h3>
      <table>
        ${fieldRowWithCie10('Higiene bucal', hygieneLabel(periodontium.plaqueCalculus.hygiene), findingCie10, 'periodontium.hygiene')}
        ${fieldRowWithCie10('Cálculo presente', yesNoLabel(periodontium.plaqueCalculus.calculusPresent), findingCie10, 'periodontium.calculus')}
        ${fieldRowWithCie10('Sangrado al cepillado', yesNoLabel(periodontium.inflammationBleeding.bleedingOnBrushing), findingCie10, 'periodontium.bleedingOnBrushing')}
        ${fieldRowWithCie10('Sangrado al sondaje', yesNoLabel(periodontium.inflammationBleeding.bleedingOnProbing), findingCie10, 'periodontium.bleedingOnProbing')}
        ${fieldRowWithCie10('Eritema', yesNoLabel(periodontium.inflammationBleeding.erythema), findingCie10, 'periodontium.erythema')}
        ${fieldRowWithCie10('Edema', yesNoLabel(periodontium.inflammationBleeding.edema), findingCie10, 'periodontium.edema')}
        ${fieldRowWithCie10('Gingivitis', yesNoLabel(periodontium.gingivitis.present), findingCie10, 'periodontium.gingivitis')}
        ${fieldRow('Tipo de gingivitis', gingivitisType)}
        ${fieldRowWithCie10('Movilidad dental', yesNoLabel(periodontium.mobility.present), findingCie10, 'periodontium.mobility')}
        ${fieldRow('Dientes con movilidad', periodontium.mobility.affectedTeeth)}
        ${fieldRowWithCie10('Notas', periodontium.notes, findingCie10, 'periodontium.notes')}
      </table>
    </section>`
}

function buildOdontogramSection(odontogram?: OdontogramData | null): string {
  if (!odontogram) {
    return `
      <section class="print-section">
        <h2>${printSectionHeading('odontograma')}</h2>
        <p>Sin odontograma registrado.</p>
      </section>`
  }

  const teethRows = odontogram.teeth
    .map((tooth) => {
      const faceDetails = (Object.entries(tooth.faces) as [string, ToothFaceState][])
        .filter(([, state]) => state !== 'sano')
        .map(([face, state]) => `${face}: ${TOOTH_FACE_STATE_LABELS[state]}`)
        .join(', ')

      const hasFinding =
        tooth.globalState !== 'presente' || faceDetails.length > 0

      if (!hasFinding) return ''

      return `<tr>
        <td>${tooth.number}</td>
        <td>${escapeHtml(TOOTH_GLOBAL_STATE_LABELS[tooth.globalState])}</td>
        <td>${escapeHtml(faceDetails || '—')}</td>
      </tr>`
    })
    .filter(Boolean)
    .join('')

  const supplementary = odontogram.supplementaryFindings
    ? Object.entries(odontogram.supplementaryFindings)
        .filter(([, finding]) => finding.present)
        .map(
          ([key, finding]) =>
            `<li><strong>${escapeHtml(ODONTOGRAM_SUPPLEMENTARY_LABELS[key as keyof typeof ODONTOGRAM_SUPPLEMENTARY_LABELS])}:</strong> ${escapeHtml(finding.description || 'Presente')}</li>`,
        )
        .join('')
    : ''

  return `
    <section class="print-section">
      <h2>${printSectionHeading('odontograma')}</h2>
      <p><strong>Dentición:</strong> ${escapeHtml(odontogram.dentitionType)}</p>
      ${
        odontogram.edentulismScope
          ? `<p><strong>Edentulismo:</strong> ${escapeHtml(EDENTULISM_SCOPE_LABELS[odontogram.edentulismScope])}</p>`
          : ''
      }
      ${
        teethRows
          ? `<table>
        <thead><tr><th>Pieza FDI</th><th>Estado global</th><th>Superficies</th></tr></thead>
        <tbody>${teethRows}</tbody>
      </table>`
          : '<p>Sin hallazgos marcados en piezas dentales.</p>'
      }
      ${supplementary ? `<h3>Hallazgos complementarios</h3><ul>${supplementary}</ul>` : ''}
    </section>`
}

function buildDiagnosticChartSection(data: ClinicalRecordFormData): string {
  const summary = formatClinicalDiagnosticChartSummary(
    normalizeClinicalDiagnosticChart(data.diagnosticChart),
  )

  const additionalDiagnoses = data.diagnoses
    .filter((diagnosis) => diagnosis.source === 'manual')
    .filter((diagnosis) => !(diagnosis.affectedTeeth?.length))
    .map(
      (diagnosis) =>
        `<li><strong>${escapeHtml(diagnosis.code)}</strong> — ${escapeHtml(diagnosis.description)} (${escapeHtml(diagnosis.type)}, ${escapeHtml(DIAGNOSIS_CERTAINTY_LABELS[diagnosis.certainty])})</li>`,
    )
    .join('')

  const chartDiagnoses = data.diagnoses
    .filter(
      (diagnosis) =>
        diagnosis.source === 'manual' && (diagnosis.affectedTeeth?.length ?? 0) > 0,
    )
    .map(
      (diagnosis) =>
        `<li><strong>${escapeHtml(diagnosis.code)}</strong> — ${escapeHtml(diagnosis.description)} (${escapeHtml(diagnosis.type)}, ${escapeHtml(DIAGNOSIS_CERTAINTY_LABELS[diagnosis.certainty])})${diagnosis.affectedTeeth?.length ? ` · Piezas: ${diagnosis.affectedTeeth.join(', ')}` : ''}</li>`,
    )
    .join('')

  return `
    <section class="print-section">
      <h2>${printSectionHeading('diagnosticos')}</h2>
      ${paragraph(summary || 'Sin diagnósticos asignados por pieza en el esquema gráfico.')}
      ${chartDiagnoses ? `<h3>Diagnósticos por pieza / odontograma</h3><ul>${chartDiagnoses}</ul>` : ''}
      ${additionalDiagnoses ? `<h3>Diagnosticos Adicionales</h3><ul>${additionalDiagnoses}</ul>` : ''}
      ${data.diagnosisNotes ? `<h3>Observaciones</h3>${paragraph(data.diagnosisNotes)}` : ''}
      ${data.findings ? `<h3>${subheading('Hallazgos adicionales')}</h3>${paragraph(data.findings)}` : ''}
    </section>`
}

function buildAnnexesSection(data: ClinicalRecordFormData): string {
  const { specializedAnnexes } = data
  const periodontics = specializedAnnexes.periodontics
  const orthodontics = specializedAnnexes.orthodontics
  const endodontics = specializedAnnexes.endodontics
  const implants = specializedAnnexes.dentalImplants
  const oralSurgery = specializedAnnexes.oralSurgery
  const rehabilitation = specializedAnnexes.rehabilitationAesthetics

  const periodonticsSummary = [
    periodontics.diagnosis.staging && `Estadio ${periodontics.diagnosis.staging}`,
    periodontics.diagnosis.grading && `Grado ${periodontics.diagnosis.grading}`,
    periodontics.diagnosis.extent && `Extensión: ${periodontics.diagnosis.extent}`,
    periodontics.diagnosis.clinicalObservations,
    periodontics.diagnosis.systemicRiskFactors,
  ]
    .filter(Boolean)
    .join(' · ')

  const malocclusionDentalSummary = formatMalocclusionDentalSummary(
    orthodontics.malocclusionAssessment,
  )
  const malocclusionSkeletalSummary = formatMalocclusionSkeletalSummary(
    orthodontics.malocclusionAssessment,
  )

  const facialAnalysisSummary = formatFacialAnalysis(orthodontics.facialProfile)

  const orthodonticTreatmentPlanSummary = formatOrthodonticTreatmentPlan({
    treatmentType: orthodontics.treatmentType,
    conventionalBracketType: orthodontics.conventionalBracketType,
    alignerTreatmentMode: orthodontics.alignerTreatmentMode,
    alignerPhaseCount: orthodontics.alignerPhaseCount,
    maxillaryOrthopedicsAppliance: orthodontics.maxillaryOrthopedicsAppliance,
  })

  const treatmentDurationSummary = formatOrthodonticTreatmentDurationMonths(
    orthodontics.treatmentDurationMonths,
  )

  const orthodonticBudgetSummary = formatOrthodonticBudgetSummary(orthodontics.orthodonticBudget)

  const orthodonticsSummary = [
    orthodonticTreatmentPlanSummary &&
      `Tipo de tratamiento: ${orthodonticTreatmentPlanSummary}`,
    treatmentDurationSummary && `Duración: ${treatmentDurationSummary}`,
    orthodonticBudgetSummary && `Presupuesto: ${orthodonticBudgetSummary}`,
    orthodontics.notes,
  ]
    .filter((value) => value?.trim())
    .join(' · ')

  const endodonticsSummary = formatEndoAnnexSummary(endodontics)

  const implantsSummary = [
    formatImplantMedicalAnamnesisSummary(implants.medicalAnamnesis),
    formatOralSurgeryAnnexSummary(implants.surgicalRiskAssessment),
    formatImplantPeriodontalAssessmentSummary(implants.periodontalAssessment),
    formatEdentulousImplantPlanSummary(implants.implantPlacementPlan),
    ...formatDentalImplantPlanningSummaryLines(implants),
    implants.notes,
  ]
    .filter((value) => value?.trim())
    .join(' · ')

  const oralSurgerySummary = formatOralSurgeryAnnexSummary(oralSurgery)
  const oralSurgeryTreatmentPlanTable = buildOralSurgeryTreatmentPlanTable(oralSurgery.treatmentPlan)

  const rehabilitationSummary = [
    rehabilitation.initialFindings.upperToothColor
      ? `Color sup.: ${formatRehabArchToothColor(rehabilitation.initialFindings.upperToothColor)}`
      : '',
    rehabilitation.initialFindings.lowerToothColor
      ? `Color inf.: ${formatRehabArchToothColor(rehabilitation.initialFindings.lowerToothColor)}`
      : '',
    rehabilitation.initialFindings.darkenedTeeth.length > 0
      ? `Dientes oscurecidos: ${rehabilitation.initialFindings.darkenedTeeth.join(', ')}`
      : '',
    (() => {
      const midline = formatRehabMidlineDeviation(rehabilitation.initialFindings.midlineDeviation)
      return midline ? `Desv. línea media: ${midline}` : ''
    })(),
    hasSmileAnalysisSelection(rehabilitation.initialFindings.smileAnalysis)
      ? `Análisis de sonrisa: ${formatSmileAnalysis(rehabilitation.initialFindings.smileAnalysis)}`
      : '',
    ...formatRehabPlanningSummaryLines(rehabilitation),
    hasDentalWhiteningSelection(rehabilitation.dentalWhitening)
      ? `Blanqueamiento: ${formatDentalWhiteningPlan(rehabilitation.dentalWhitening)}`
      : '',
    rehabilitation.contraindications,
    rehabilitation.notes,
  ]
    .filter((value) => value.trim())
    .join(' · ')

  return `
    <section class="print-section">
      <h2>${printSectionHeading('anexos')}</h2>
      <h3>${escapeHtml(SPECIALIZED_ANNEX_LABELS.periodontics)}</h3>
      ${paragraph(periodonticsSummary || 'Sin información registrada.')}
      <h3>${escapeHtml(SPECIALIZED_ANNEX_LABELS.orthodontics)}</h3>
      <h4>Análisis Facial</h4>
      ${paragraph(facialAnalysisSummary || 'Sin información registrada.')}
      <h4>Maloclusión Dental</h4>
      ${paragraph(malocclusionDentalSummary || 'Sin información registrada.')}
      <h4>Maloclusión Esquelética</h4>
      ${paragraph(malocclusionSkeletalSummary || 'Sin información registrada.')}
      ${orthodonticsSummary ? `<h4>${subheading('Plan y observaciones')}</h4>${paragraph(orthodonticsSummary)}` : ''}
      <h3>${escapeHtml(SPECIALIZED_ANNEX_LABELS.endodontics)}</h3>
      ${paragraph(endodonticsSummary || 'Sin información registrada.')}
      <h3>${escapeHtml(SPECIALIZED_ANNEX_LABELS.dentalImplants)}</h3>
      ${paragraph(implantsSummary || 'Sin información registrada.')}
      <h3>${escapeHtml(SPECIALIZED_ANNEX_LABELS.oralSurgery)}</h3>
      ${paragraph(oralSurgerySummary || 'Sin información registrada.')}
      ${oralSurgeryTreatmentPlanTable}
      <h3>${escapeHtml(SPECIALIZED_ANNEX_LABELS.rehabilitationAesthetics)}</h3>
      ${paragraph(rehabilitationSummary || 'Sin información registrada.')}
    </section>`
}

function buildTreatmentSection(data: ClinicalRecordFormData): string {
  const rows = data.treatmentPlan
    .filter((item) => item.procedure.trim())
    .map(
      (item) =>
        `<tr>
          <td>${escapeHtml(TREATMENT_PHASE_LABELS[item.phase])}</td>
          <td>${escapeHtml(item.procedure)}</td>
          <td>${item.toothNumber ?? '—'}</td>
          <td>${item.quantity}</td>
          <td>${escapeHtml(item.notes || '—')}</td>
        </tr>`,
    )
    .join('')

  return `
    <section class="print-section">
      <h2>${printSectionHeading('tratamiento')}</h2>
      ${
        rows
          ? `<table>
        <thead><tr><th>Fase</th><th>Procedimiento</th><th>Pieza</th><th>Cant.</th><th>Notas</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`
          : '<p>Sin procedimientos en el plan de tratamiento.</p>'
      }
      ${data.treatmentPlanNotes ? `<h3>Observaciones</h3>${paragraph(data.treatmentPlanNotes)}` : ''}
    </section>`
}

function buildBudgetSection(data: ClinicalRecordFormData): string {
  const rows = data.budgetItems
    .filter((item) => item.procedure.trim())
    .map(
      (item) =>
        `<tr>
          <td>${escapeHtml(item.procedure)}</td>
          <td>${item.toothNumber ?? '—'}</td>
          <td>${item.quantity}</td>
          <td>${formatCurrency(item.unitPrice)}</td>
          <td>${formatCurrency(item.quantity * item.unitPrice)}</td>
        </tr>`,
    )
    .join('')

  return `
    <section class="print-section">
      <h2>${printSectionHeading('presupuesto')}</h2>
      ${
        rows
          ? `<table>
        <thead><tr><th>Procedimiento</th><th>Pieza</th><th>Cant.</th><th>Valor unit.</th><th>Subtotal</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`
          : '<p>Sin ítems de presupuesto.</p>'
      }
      <table>
        ${fieldRow('Subtotal', formatCurrency(data.budget.subtotal))}
        ${fieldRow('Descuento', formatCurrency(data.budget.discount))}
        ${fieldRow('Total', formatCurrency(data.budget.total))}
      </table>
    </section>`
}

function buildPaymentPlanSection(data: ClinicalRecordFormData): string {
  const rows = data.paymentPlan
    .filter((item) => item.procedure.trim())
    .map(
      (item) =>
        `<tr>
          <td>${escapeHtml(item.procedure)}</td>
          <td>${formatCurrency(item.totalAmount)}</td>
          <td>${escapeHtml(PAYMENT_METHOD_LABELS[item.paymentMethod])}</td>
          <td>${item.installments ?? '—'}</td>
          <td>${item.dueDate ? formatDate(item.dueDate) : '—'}</td>
          <td>${escapeHtml(item.scheduleNotes || '—')}</td>
        </tr>`,
    )
    .join('')

  return `
    <section class="print-section">
      <h2>${printSectionHeading('planPagos')}</h2>
      ${
        rows
          ? `<table>
        <thead><tr><th>Procedimiento</th><th>Total</th><th>Forma de pago</th><th>Cuotas</th><th>Fecha</th><th>Observaciones</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`
          : '<p>Sin plan de pagos registrado.</p>'
      }
    </section>`
}

function buildPaymentControlSection(data: ClinicalRecordFormData): string {
  const rows = data.paymentControl
    .map(
      (payment) =>
        `<tr>
          <td>${formatDate(payment.paymentDate)}</td>
          <td>${formatCurrency(payment.amount)}</td>
          <td>${escapeHtml(PAYMENT_METHOD_LABELS[payment.paymentMethod])}</td>
          <td>${escapeHtml(payment.treatingDentistName || '—')}</td>
          <td>${escapeHtml(payment.paymentReason)}</td>
          <td>${escapeHtml(payment.notes || '—')}</td>
        </tr>`,
    )
    .join('')

  return `
    <section class="print-section">
      <h2>${printSectionHeading('controlPagos')}</h2>
      ${
        rows
          ? `<table>
        <thead><tr><th>Fecha</th><th>Valor</th><th>Método</th><th>Odontólogo tratante</th><th>Concepto</th><th>Notas</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`
          : '<p>Sin pagos registrados.</p>'
      }
    </section>`
}

function buildEvolutionSection(data: ClinicalRecordFormData): string {
  const rows = data.evolutionNotes
    .map((note) => {
      const catalogServices = getEvolutionCatalogServices(note)
      const isNonRips = note.requiereCupsRips === false
      const evolutionNoteText = note.clinicalNote?.trim()
      const noteOrRx = isNonRips
        ? escapeHtml(evolutionNoteText || '—')
        : escapeHtml(
            [evolutionNoteText, note.prescriptions?.trim()].filter(Boolean).join(' · ') || '—',
          )
      const procedureFallback = escapeHtml(note.procedure || '—')
      const serviceLabel =
        catalogServices.length > 0
          ? catalogServices
              .map((service) => {
                const suffix = service.requiereCupsRips === false ? ' (sin RIPS)' : ''
                return `${escapeHtml(service.serviceName || service.procedure)}${suffix}`
              })
              .join('<br>')
          : note.serviceName
            ? `${escapeHtml(note.serviceName)}${isNonRips ? ' (sin RIPS)' : ''}`
            : procedureFallback

      return `<tr>
          <td>${formatDate(note.date || note.createdAt)}</td>
          <td>${serviceLabel}</td>
          <td>${noteOrRx}</td>
          <td>${escapeHtml(note.professionalName)}</td>
        </tr>`
    })
    .join('')

  return `
    <section class="print-section">
      <h2>${printSectionHeading('evolucion')}</h2>
      ${
        rows
          ? `<table>
        <thead><tr><th>Fecha</th><th>Procedimiento</th><th>Nota de evolución / Prescripciones</th><th>Profesional</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`
          : '<p>Sin notas de evolución.</p>'
      }
    </section>`
}

function buildConsentSection(data: ClinicalRecordFormData): string {
  const consent = data.informedConsent
  const selectedConsents = consent.selectedConsentIds
    .map((id) => CONSENT_TEMPLATES.find((template) => template.id === id)?.label ?? id)
    .join(', ')

  return `
    <section class="print-section">
      <h2>${printSectionHeading('consentimiento')}</h2>
      <table>
        ${fieldRow('Consentimientos seleccionados', selectedConsents || '—')}
        ${fieldRow('Texto aceptado', consent.textAccepted ? 'Sí' : 'No')}
        ${fieldRow('Registro profesional', consent.professionalLicense)}
        ${fieldRow('Tarjeta profesional', consent.professionalRegistry)}
        ${fieldRow('Fecha de firma', consent.signedAt ? formatDate(consent.signedAt) : '—')}
      </table>
      <div class="signatures">
        ${
          consent.patientSignatureDataUrl
            ? `<div class="signature-box"><p>Firma del paciente</p><img src="${consent.patientSignatureDataUrl}" alt="Firma del paciente" /></div>`
            : ''
        }
        ${
          consent.professionalSignatureDataUrl
            ? `<div class="signature-box"><p>Firma del profesional</p><img src="${consent.professionalSignatureDataUrl}" alt="Firma del profesional" /></div>`
            : ''
        }
      </div>
    </section>`
}

function buildDiagnosticAidsSection(): string {
  return `
    <section class="print-section">
      <h2>${printSectionHeading('examenesComplementarios')}</h2>
      <p>Los estudios complementarios y escaneos se registran por referencia de archivo en el equipo local (ruta absoluta y hash SHA-256). Consulte la aplicación para el inventario detallado y la trazabilidad de apertura.</p>
    </section>`
}

function buildExportSection(): string {
  return `
    <section class="print-section">
      <h2>${printSectionHeading('exportacionHistoria')}</h2>
      <p>La exportación de historia clínica y el resumen digital de atención (RDA) se generan desde la aplicación con verificación de integridad y cadena de custodia.</p>
    </section>`
}

const SECTION_BUILDERS: Record<
  ClinicalHistoryPrintSectionId,
  (input: ClinicalHistoryPrintInput) => string
> = {
  identificacion: ({ patient }) => buildIdentificationSection(patient),
  anamnesis: ({ clinicalData }) => buildAnamnesisSection(clinicalData),
  examen: ({ clinicalData }) => buildExamSection(clinicalData),
  odontograma: ({ odontogram }) => buildOdontogramSection(odontogram),
  diagnosticos: ({ clinicalData }) => buildDiagnosticChartSection(clinicalData),
  examenesComplementarios: () => buildDiagnosticAidsSection(),
  anexos: ({ clinicalData }) => buildAnnexesSection(clinicalData),
  tratamiento: ({ clinicalData }) => buildTreatmentSection(clinicalData),
  presupuesto: ({ clinicalData }) => buildBudgetSection(clinicalData),
  planPagos: ({ clinicalData }) => buildPaymentPlanSection(clinicalData),
  controlPagos: ({ clinicalData }) => buildPaymentControlSection(clinicalData),
  evolucion: ({ clinicalData }) => buildEvolutionSection(clinicalData),
  consentimiento: ({ clinicalData }) => buildConsentSection(clinicalData),
  exportacionHistoria: () => buildExportSection(),
}

export function buildClinicalHistoryPrintHtml(input: ClinicalHistoryPrintInput): string {
  const { patient, professional, sections } = input
  const fullName = `${patient.firstName} ${patient.lastName}`
  const orderedSections = CLINICAL_HISTORY_PRINT_SECTIONS.filter((section) =>
    sections.includes(section.id),
  )

  const bodySections = orderedSections
    .map((section) => SECTION_BUILDERS[section.id](input))
    .join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Impresión Historia Clínica — ${escapeHtml(fullName)}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; max-width: 900px; margin: 2rem auto; color: #1e293b; line-height: 1.5; }
    h1 { font-size: 1.5rem; color: #0369a1; border-bottom: 2px solid #0369a1; padding-bottom: 0.5rem; }
    h2 { font-size: 1.05rem; margin-top: 1.5rem; color: #0369a1; font-weight: 700; }
    h3 { font-size: 0.95rem; margin: 1rem 0 0.35rem; color: #0f172a; }
    .meta { font-size: 0.85rem; color: #475569; margin-bottom: 1.5rem; }
    .print-section { page-break-inside: avoid; margin-bottom: 1.25rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.5rem; }
    th, td { border: 1px solid #e2e8f0; padding: 0.4rem 0.55rem; text-align: left; vertical-align: top; }
    th { background: #f8fafc; width: 32%; font-weight: 600; }
    ul { margin: 0.35rem 0 0; padding-left: 1.25rem; }
    p { margin: 0.35rem 0; }
    .signatures { display: flex; flex-wrap: wrap; gap: 1.5rem; margin-top: 1rem; }
    .signature-box { flex: 1 1 220px; }
    .signature-box img { max-width: 260px; max-height: 120px; border: 1px solid #e2e8f0; background: #fff; }
    footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; font-size: 0.75rem; color: #64748b; }
    @media print {
      body { margin: 1cm; }
      .print-section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Historia Clínica Odontológica</h1>
  <p class="meta">
    Paciente: <strong>${escapeHtml(fullName)}</strong> — ${escapeHtml(patient.documentType)} ${escapeHtml(patient.documentNumber)}<br />
    Impreso: ${formatDate(new Date().toISOString())} · Profesional: ${escapeHtml(`${professional.firstName} ${professional.lastName}`)}${professional.professionalLicense ? ` · R.P. ${escapeHtml(professional.professionalLicense)}` : ''}
  </p>
  ${bodySections}
  <footer>
    Documento generado por ${APP_NAME}. Secciones impresas: ${orderedSections.map((section) => escapeHtml(clinicalPrintSectionLabel(section))).join(' · ')}.
  </footer>
</body>
</html>`
}

export function printClinicalHistorySections(input: ClinicalHistoryPrintInput): void {
  if (input.sections.length === 0) {
    throw new Error('Seleccione al menos una sección para imprimir.')
  }

  const html = buildClinicalHistoryPrintHtml(input)
  openPortabilityHtmlForPrint(html)
}

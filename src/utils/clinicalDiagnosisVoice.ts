import type { ClinicalRecordFormData, DiagnosisAnatomicalScope } from '@/types/clinicalRecord'
import {
  getDiagnosisChartColor,
  normalizeClinicalDiagnosticChart,
} from '@/types/clinicalDiagnosticChart'
import { assignCieToTooth, detachTeethFromDiagnoses } from '@/utils/importedCieEdit'

export function ensureDiagnosisOnTooth(
  clinical: ClinicalRecordFormData,
  toothId: string,
  code: string,
  description: string,
): ClinicalRecordFormData {
  const toothNumber = Number(toothId)
  const chart = normalizeClinicalDiagnosticChart(clinical.diagnosticChart)
  const withoutCurrent = chart.entries.filter((entry) => entry.dienteId !== toothId)
  const existingEntry = chart.entries.find((entry) => entry.dienteId === toothId)

  if (existingEntry?.diagnosisCode === code) {
    return {
      ...clinical,
      diagnoses: detachTeethFromDiagnoses(clinical.diagnoses, [toothNumber]),
      diagnosticChart: { ...chart, entries: withoutCurrent },
    }
  }

  const diagnoses = assignCieToTooth(clinical.diagnoses, {
    code,
    description,
    toothNumber,
  })
  const knownColor = chart.entries.find((entry) => entry.diagnosisCode === code)?.color
  const codes = [
    ...new Set([
      ...diagnoses.map((diagnosis) => diagnosis.code),
      ...chart.entries.map((entry) => entry.diagnosisCode),
      code,
    ]),
  ]

  return {
    ...clinical,
    diagnoses,
    diagnosticChart: {
      ...chart,
      entries: [
        ...withoutCurrent,
        {
          dienteId: toothId,
          diagnosisCode: code,
          diagnosisDescription: description,
          color: knownColor ?? getDiagnosisChartColor(Math.max(codes.indexOf(code), 0)),
        },
      ],
    },
  }
}

export function addAdditionalDiagnosisToClinical(
  clinical: ClinicalRecordFormData,
  code: string,
  description: string,
  anatomicalScope?: DiagnosisAnatomicalScope,
): ClinicalRecordFormData {
  const existing = clinical.diagnoses.find((diagnosis) => diagnosis.code === code)
  if (existing) {
    if (
      !anatomicalScope ||
      existing.anatomicalScope ||
      (existing.affectedTeeth?.length ?? 0) > 0
    ) {
      return clinical
    }
    return {
      ...clinical,
      diagnoses: clinical.diagnoses.map((diagnosis) =>
        diagnosis.code === code ? { ...diagnosis, anatomicalScope } : diagnosis,
      ),
    }
  }

  return {
    ...clinical,
    diagnoses: [
      ...clinical.diagnoses,
      {
        code,
        description,
        type: clinical.diagnoses.length === 0 ? 'principal' : 'relacionado',
        certainty: 'impresion',
        source: 'manual',
        anatomicalScope,
      },
    ],
  }
}

import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import {
  getDiagnosisChartColor,
  normalizeClinicalDiagnosticChart,
} from '@/types/clinicalDiagnosticChart'

export function ensureDiagnosisOnTooth(
  clinical: ClinicalRecordFormData,
  toothId: string,
  code: string,
  description: string,
): ClinicalRecordFormData {
  const toothNumber = Number(toothId)
  const chart = normalizeClinicalDiagnosticChart(clinical.diagnosticChart)

  let diagnoses = clinical.diagnoses
  const existing = diagnoses.find((diagnosis) => diagnosis.code === code)
  if (!existing) {
    diagnoses = [
      ...diagnoses,
      {
        code,
        description,
        type: diagnoses.length === 0 ? 'principal' : 'relacionado',
        certainty: 'impresion',
        source: 'manual',
        affectedTeeth: [toothNumber],
      },
    ]
  } else {
    diagnoses = diagnoses.map((diagnosis) =>
      diagnosis.code === code
        ? {
            ...diagnosis,
            affectedTeeth: [...new Set([...(diagnosis.affectedTeeth ?? []), toothNumber])].sort(
              (a, b) => a - b,
            ),
          }
        : diagnosis,
    )
  }

  const withoutCurrent = chart.entries.filter((entry) => entry.dienteId !== toothId)
  const existingEntry = chart.entries.find((entry) => entry.dienteId === toothId)
  const codes = [
    ...new Set([
      ...diagnoses.map((diagnosis) => diagnosis.code),
      ...chart.entries.map((entry) => entry.diagnosisCode),
      code,
    ]),
  ]
  const color = getDiagnosisChartColor(codes.indexOf(code))

  const entries =
    existingEntry?.diagnosisCode === code
      ? withoutCurrent
      : [
          ...withoutCurrent,
          {
            dienteId: toothId,
            diagnosisCode: code,
            diagnosisDescription: description,
            color,
          },
        ]

  return {
    ...clinical,
    diagnoses,
    diagnosticChart: { ...chart, entries },
  }
}

export function addAdditionalDiagnosisToClinical(
  clinical: ClinicalRecordFormData,
  code: string,
  description: string,
): ClinicalRecordFormData {
  if (clinical.diagnoses.some((diagnosis) => diagnosis.code === code)) {
    return clinical
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
      },
    ],
  }
}

import { AlertTriangle } from 'lucide-react'
import {
  getImplantClinicalRiskAlerts,
  hasImplantClinicalRiskAlerts,
  type ImplantMedicalAnamnesis,
} from '@/types/implantMedicalAnamnesis'
import {
  getPeriodontalPlanningAlerts,
  hasPeriodontalPlanningAlerts,
  type ImplantPeriodontalAssessment,
} from '@/types/implantPeriodontalAssessment'

import {
  getOralSurgeryRiskAlerts,
  hasOralSurgeryRiskAlerts,
  type OralSurgeryAnnex,
} from '@/types/oralSurgeryAnnex'

interface ImplantClinicalRiskAlertProps {
  anamnesis?: ImplantMedicalAnamnesis
  surgicalRiskAssessment?: OralSurgeryAnnex
  periodontalAssessment?: ImplantPeriodontalAssessment
}

export function ImplantClinicalRiskAlert({
  anamnesis,
  surgicalRiskAssessment,
  periodontalAssessment,
}: ImplantClinicalRiskAlertProps) {
  const medicalAlerts = anamnesis ? getImplantClinicalRiskAlerts(anamnesis) : { highRisk: [], standardRisk: [] }
  const surgicalAlerts = surgicalRiskAssessment
    ? getOralSurgeryRiskAlerts(surgicalRiskAssessment)
    : { highRisk: [], standardRisk: [] }
  const periodontalAlerts = periodontalAssessment ? getPeriodontalPlanningAlerts(periodontalAssessment) : []

  const hasMedicalAlerts = anamnesis ? hasImplantClinicalRiskAlerts(anamnesis) : false
  const hasSurgicalAlerts = surgicalRiskAssessment
    ? hasOralSurgeryRiskAlerts(surgicalRiskAssessment)
    : false
  const hasPeriodontalAlerts = periodontalAssessment
    ? hasPeriodontalPlanningAlerts(periodontalAssessment)
    : false

  if (!hasMedicalAlerts && !hasSurgicalAlerts && !hasPeriodontalAlerts) return null

  const highRisk = [...medicalAlerts.highRisk, ...surgicalAlerts.highRisk]
  const standardRisk = [
    ...medicalAlerts.standardRisk,
    ...surgicalAlerts.standardRisk,
    ...periodontalAlerts,
  ]

  return (
    <>
      {highRisk.length > 0 && (
        <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold text-red-900">Alto riesgo clínico identificado</p>
              <ul className="mt-2 space-y-1">
                {highRisk.map((alert) => (
                  <li key={alert} className="text-[11px] leading-snug text-red-900">
                    • {alert}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {standardRisk.length > 0 && (
        <div role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold text-amber-900">
                Precaución: requiere evaluación o tratamiento previo
              </p>
              <p className="mt-0.5 text-[11px] text-amber-800">
                Revise la anamnesis y evaluación periodontal antes de planificar cirugía de implantes.
              </p>
              <ul className="mt-2 space-y-1">
                {standardRisk.map((alert) => (
                  <li key={alert} className="text-[11px] leading-snug text-amber-900">
                    • {alert}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

import { AlertTriangle } from 'lucide-react'
import {
  getOralSurgeryRiskAlerts,
  hasOralSurgeryRiskAlerts,
  type OralSurgeryAnnex,
} from '@/types/oralSurgeryAnnex'

interface OralSurgeryRiskAlertProps {
  annex: OralSurgeryAnnex
}

export function OralSurgeryRiskAlert({ annex }: OralSurgeryRiskAlertProps) {
  if (!hasOralSurgeryRiskAlerts(annex)) return null

  const { highRisk, standardRisk } = getOralSurgeryRiskAlerts(annex)

  return (
    <>
      {highRisk.length > 0 && (
        <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold text-red-900">
                Alto riesgo quirúrgico identificado
              </p>
              <p className="mt-0.5 text-[11px] text-red-800">
                Revise manejo perioperatorio, contraindicaciones y coordinación interdisciplinaria
                antes de programar cirugía oral.
              </p>
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
                Precauciones quirúrgicas adicionales
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

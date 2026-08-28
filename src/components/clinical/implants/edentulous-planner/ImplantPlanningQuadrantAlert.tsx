import { AlertTriangle } from 'lucide-react'

interface ImplantPlanningQuadrantAlertProps {
  highRisk: string[]
  standardRisk: string[]
  quadrant: string
}

export function ImplantPlanningQuadrantAlert({
  highRisk,
  standardRisk,
  quadrant,
}: ImplantPlanningQuadrantAlertProps) {
  if (highRisk.length === 0 && standardRisk.length === 0) return null

  return (
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
      {highRisk.length > 0 && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden />
          <div>
            <p className="text-[11px] font-semibold text-red-900">
              Alerta en {quadrant}: antecedente crítico de radiación
            </p>
            <ul className="mt-1 space-y-0.5">
              {highRisk.map((alert) => (
                <li key={alert} className="text-[10px] text-red-800">
                  • {alert}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {standardRisk.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
          <div>
            <p className="text-[11px] font-semibold text-amber-900">
              Alerta en {quadrant}: foco infeccioso o patología local no tratada
            </p>
            <ul className="mt-1 space-y-0.5">
              {standardRisk.map((alert) => (
                <li key={alert} className="text-[10px] text-amber-800">
                  • {alert}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

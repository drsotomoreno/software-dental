import { memo } from 'react'
import { Droplets, Layers } from 'lucide-react'
import type { ToothNumber } from '@/types/odontogram'
import type { PeriodontalSiteKey, PeriodontalToothRecord } from '@/types/periodonticsAnnex'
import { PERIODONTAL_SITE_KEYS, PERIODONTAL_SITE_LABELS } from '@/types/periodonticsAnnex'
import {
  calcClinicalAttachmentLevel,
  isImplantTooth,
  isMolarOrPremolar,
  isToothEvaluable,
  isUpperTooth,
} from '@/utils/periodonticsAnnex'

interface PeriodontogramSiteGridProps {
  tooth: PeriodontalToothRecord
  disabled?: boolean
  onUpdateTooth: (patch: Partial<PeriodontalToothRecord>) => void
  onUpdateSite: (siteKey: PeriodontalSiteKey, patch: Partial<PeriodontalToothRecord['sites'][PeriodontalSiteKey]>) => void
}

function lingualLabel(number: ToothNumber): string {
  return isUpperTooth(number) ? 'Palatino' : 'Lingual'
}

function PeriodontogramSiteGridComponent({
  tooth,
  disabled = false,
  onUpdateTooth,
  onUpdateSite,
}: PeriodontogramSiteGridProps) {
  const evaluable = isToothEvaluable(tooth)
  const implant = isImplantTooth(tooth)
  const showFurcation = isMolarOrPremolar(tooth.number) && !implant && tooth.clinicalStatus === 'presente'

  const siteLabel = (key: PeriodontalSiteKey): string => {
    if (key === 'mesiolingual') return `Mesiolingual / ${lingualLabel(tooth.number)}`
    if (key === 'lingual') return lingualLabel(tooth.number)
    if (key === 'distolingual') return `Distolingual / Distopalatino`
    return PERIODONTAL_SITE_LABELS[key]
  }

  return (
    <div className="rounded-xl border border-dental-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-800">Pieza {tooth.number}</h4>
          <p className="text-xs text-slate-500">
            {implant
              ? 'Implante — sondaje periimplantario (PBS/BoP/placa). MG deshabilitado.'
              : 'Registro de 6 sitios — NIC = PBS + MG'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="text-xs text-slate-600">
            Estado
            <select
              disabled={disabled}
              value={tooth.clinicalStatus}
              onChange={(e) =>
                onUpdateTooth({
                  clinicalStatus: e.target.value as PeriodontalToothRecord['clinicalStatus'],
                })
              }
              className="ml-1 rounded border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="presente">Presente</option>
              <option value="ausente">Ausente</option>
              <option value="implante">Implante</option>
              <option value="corona">Corona</option>
              <option value="retenido">Retenido</option>
            </select>
          </label>

          {evaluable && (
            <label className="text-xs text-slate-600">
              Movilidad
              <select
                disabled={disabled}
                value={tooth.mobility}
                onChange={(e) =>
                  onUpdateTooth({ mobility: Number(e.target.value) as PeriodontalToothRecord['mobility'] })
                }
                className="ml-1 rounded border border-slate-300 px-2 py-1 text-xs"
              >
                {[0, 1, 2, 3].map((grade) => (
                  <option key={grade} value={grade}>
                    Grado {grade}
                  </option>
                ))}
              </select>
            </label>
          )}

          {showFurcation && (
            <label className="text-xs text-slate-600">
              Furca
              <select
                disabled={disabled}
                value={tooth.furcation}
                onChange={(e) =>
                  onUpdateTooth({
                    furcation: e.target.value as PeriodontalToothRecord['furcation'],
                  })
                }
                className="ml-1 rounded border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="0">0</option>
                <option value="I">I</option>
                <option value="II">II</option>
                <option value="III">III</option>
              </select>
            </label>
          )}
        </div>
      </div>

      {!evaluable ? (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">
          Pieza no evaluable periodontalmente con el estado actual ({tooth.clinicalStatus}).
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-2 py-2 font-semibold">Sitio</th>
                <th className="px-2 py-2 font-semibold">PBS (mm)</th>
                <th className="px-2 py-2 font-semibold">MG (mm)</th>
                <th className="px-2 py-2 font-semibold">NIC (mm)</th>
                <th className="px-2 py-2 font-semibold">BoP</th>
                <th className="px-2 py-2 font-semibold">Placa</th>
              </tr>
            </thead>
            <tbody>
              {PERIODONTAL_SITE_KEYS.map((key) => {
                const site = tooth.sites[key]
                const nic = calcClinicalAttachmentLevel(site)
                const rowBleeding = site.bop

                return (
                  <tr
                    key={key}
                    className={`border-b border-slate-100 ${rowBleeding ? 'bg-red-50/80' : ''}`}
                  >
                    <td className="px-2 py-2 font-medium text-slate-700">{siteLabel(key)}</td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        max={15}
                        step={0.5}
                        disabled={disabled}
                        value={site.pbs ?? ''}
                        onChange={(e) =>
                          onUpdateSite(key, {
                            pbs: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        className="w-16 rounded border border-slate-300 px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={-5}
                        max={10}
                        step={0.5}
                        disabled={disabled || implant}
                        value={site.mg ?? ''}
                        onChange={(e) =>
                          onUpdateSite(key, {
                            mg: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        className="w-16 rounded border border-slate-300 px-2 py-1 disabled:bg-slate-100"
                        title={implant ? 'No aplica en implantes' : '+ recesión / − hipertrofia'}
                      />
                    </td>
                    <td className="px-2 py-2 font-semibold text-dental-700">
                      {nic !== null ? nic.toFixed(1) : '—'}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onUpdateSite(key, { bop: !site.bop })}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
                          site.bop
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-red-50'
                        }`}
                      >
                        <Droplets className="h-3 w-3" />
                        {site.bop ? 'Sí' : 'No'}
                      </button>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onUpdateSite(key, { plaque: !site.plaque })}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
                          site.plaque
                            ? 'bg-amber-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-amber-50'
                        }`}
                      >
                        <Layers className="h-3 w-3" />
                        {site.plaque ? 'Sí' : 'No'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export const PeriodontogramSiteGrid = memo(PeriodontogramSiteGridComponent)

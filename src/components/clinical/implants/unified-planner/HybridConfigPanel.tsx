import { useEffect, useId, useRef } from 'react'
import {
  UNIFIED_ABUTMENT_TYPE_OPTIONS,
  UNIFIED_IMPLANT_BRAND_SUGGESTIONS,
  UNIFIED_IMPLANT_MEASURE_OPTIONS,
  UNIFIED_RESTORATION_MATERIAL_OPTIONS,
} from '@/constants/unifiedImplantPlanning'
import type {
  UnifiedImplantTreatment,
  UnifiedTreatmentTipo,
} from '@/types/unifiedImplantPlan'
import { treatmentPositionLabel } from '@/types/unifiedImplantPlan'
import {
  fieldControlClass,
  fieldControlCompactClass,
  fieldLabelClass,
  secondaryButtonClass,
} from './fieldStyles'

interface HybridConfigPanelProps {
  treatment: UnifiedImplantTreatment | null
  selectionLabel?: string
  disabled?: boolean
  /** Primer tabIndex del panel; el resto sigue en secuencia lógica */
  tabIndexBase?: number
  onChange: (patch: Partial<UnifiedImplantTreatment>) => void
  onRemove: () => void
}

/**
 * Orden de Tab (sin fricción):
 * 1 Tipo · 2 Medida · 3 Marca implante · 4 Tipo pilar · 5 Marca pilar · 6 Material · 7 Quitar
 * En póntico se omiten los campos quirúrgicos/pilar (tabIndex=-1) y Tab salta a Material.
 */
export function HybridConfigPanel({
  treatment,
  selectionLabel,
  disabled = false,
  tabIndexBase = 40,
  onChange,
  onRemove,
}: HybridConfigPanelProps) {
  const brandListId = useId()
  const firstFieldRef = useRef<HTMLSelectElement>(null)
  const prevTreatmentId = useRef<string | null>(null)

  useEffect(() => {
    if (!treatment || disabled) return
    if (prevTreatmentId.current === treatment.id) return
    prevTreatmentId.current = treatment.id
    // Enfoca el primer control editable al cambiar de posición
    requestAnimationFrame(() => firstFieldRef.current?.focus())
  }, [treatment, disabled])

  if (!treatment) {
    return (
      <div
        className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center"
        role="status"
      >
        <p className="text-sm font-medium text-slate-600">Panel de configuración</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
          Seleccione una pieza FDI o una posición del reborde edéntulo. Luego use Tab para recorrer
          medida, marcas y materiales en orden.
        </p>
      </div>
    )
  }

  const isPontic = treatment.tipo === 'pontico'
  const title = selectionLabel ?? treatmentPositionLabel(treatment)
  const ti = (offset: number) => (disabled ? -1 : tabIndexBase + offset)

  return (
    <section
      aria-labelledby={`hybrid-config-${treatment.id}`}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 id={`hybrid-config-${treatment.id}`} className="text-sm font-semibold text-slate-800">
            {title}
          </h4>
          <p className="text-xs text-slate-500">
            Configuración híbrida · Tab navega selects → inputs manuales
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="font-medium">Tipo</span>
            <select
              ref={firstFieldRef}
              value={treatment.tipo}
              disabled={disabled}
              tabIndex={ti(0)}
              aria-label="Tipo de tratamiento"
              onChange={(e) => onChange({ tipo: e.target.value as UnifiedTreatmentTipo })}
              className={fieldControlCompactClass}
            >
              <option value="implante_unitario">Implante</option>
              <option value="pontico">Póntico sobre implante</option>
            </select>
          </label>
        </div>
      </div>

      {!isPontic ? (
        <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
          <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Fase quirúrgica
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={fieldLabelClass}>
              <span>Medida del implante</span>
              <select
                value={treatment.faseQuirurgica.medida}
                disabled={disabled}
                tabIndex={ti(1)}
                aria-label="Medida del implante"
                onChange={(e) =>
                  onChange({
                    faseQuirurgica: { ...treatment.faseQuirurgica, medida: e.target.value },
                  })
                }
                className={fieldControlClass}
              >
                <option value="">Seleccionar medida…</option>
                {UNIFIED_IMPLANT_MEASURE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={fieldLabelClass}>
              <span>Marca del implante</span>
              <input
                type="text"
                list={brandListId}
                value={treatment.faseQuirurgica.marcaManual}
                disabled={disabled}
                tabIndex={ti(2)}
                aria-label="Marca del implante"
                placeholder="Ej. Neodent, Straumann…"
                autoComplete="off"
                onChange={(e) =>
                  onChange({
                    faseQuirurgica: {
                      ...treatment.faseQuirurgica,
                      marcaManual: e.target.value,
                    },
                  })
                }
                className={fieldControlClass}
              />
              <datalist id={brandListId}>
                {UNIFIED_IMPLANT_BRAND_SUGGESTIONS.map((brand) => (
                  <option key={brand} value={brand} />
                ))}
              </datalist>
            </label>
          </div>
        </fieldset>
      ) : (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          role="note"
        >
          Póntico sobre implante: la fase quirúrgica no aplica. Solo se cotiza el material de la
          corona.
        </p>
      )}

      <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-3.5">
        <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden />
            Fase protésica
          </span>
        </legend>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className={fieldLabelClass}>
            <span>Tipo de pilar</span>
            <select
              value={treatment.faseProtesica.tipoPilar}
              disabled={disabled || isPontic}
              tabIndex={isPontic ? -1 : ti(3)}
              aria-label="Tipo de pilar"
              onChange={(e) =>
                onChange({
                  faseProtesica: { ...treatment.faseProtesica, tipoPilar: e.target.value },
                })
              }
              className={fieldControlClass}
            >
              <option value="">Seleccionar pilar…</option>
              {UNIFIED_ABUTMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={fieldLabelClass}>
            <span>Marca del pilar</span>
            <input
              type="text"
              value={treatment.faseProtesica.marcaPilarManual}
              disabled={disabled || isPontic}
              tabIndex={isPontic ? -1 : ti(4)}
              aria-label="Marca del pilar"
              placeholder="Marca libre…"
              autoComplete="off"
              onChange={(e) =>
                onChange({
                  faseProtesica: {
                    ...treatment.faseProtesica,
                    marcaPilarManual: e.target.value,
                  },
                })
              }
              className={fieldControlClass}
            />
          </label>

          <label className={fieldLabelClass}>
            <span>Material de restauración</span>
            <select
              value={treatment.faseProtesica.material}
              disabled={disabled}
              tabIndex={ti(5)}
              aria-label="Material de restauración"
              onChange={(e) =>
                onChange({
                  faseProtesica: { ...treatment.faseProtesica, material: e.target.value },
                })
              }
              className={fieldControlClass}
            >
              <option value="">Seleccionar material…</option>
              {UNIFIED_RESTORATION_MATERIAL_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={disabled}
          tabIndex={ti(6)}
          onClick={onRemove}
          className={secondaryButtonClass}
        >
          Quitar posición
        </button>
      </div>
    </section>
  )
}

import { useMemo, useState } from 'react'
import { Layers3 } from 'lucide-react'
import type {
  UnifiedArchKey,
  UnifiedArchPlan,
  UnifiedImplantPlan,
  UnifiedImplantTreatment,
  UnifiedImplantUnitPrices,
  UnifiedSelectionTarget,
} from '@/types/unifiedImplantPlan'
import {
  createEmptyUnifiedTreatment,
  getArchActiveTreatments,
  normalizeUnifiedImplantPlan,
  treatmentPositionLabel,
} from '@/types/unifiedImplantPlan'
import { ArchEdentulousToggle } from './ArchEdentulousToggle'
import { EdentulousRidgeCanvas } from './EdentulousRidgeCanvas'
import { fieldControlClass, fieldLabelClass } from './fieldStyles'
import { FinancialSummaryPanel } from './FinancialSummaryPanel'
import { HybridConfigPanel } from './HybridConfigPanel'
import {
  OdontogramaFDI,
  type OdontogramaFdiToothState,
} from './OdontogramaFDI'

interface UnifiedImplantPlannerProps {
  value: UnifiedImplantPlan
  onChange: (value: UnifiedImplantPlan) => void
  disabled?: boolean
}

const TAB = {
  upperToggle: 10,
  upperRidge: 11,
  upperRehab: 18,
  lowerToggle: 20,
  lowerRidge: 21,
  lowerRehab: 28,
  config: 40,
  prices: 60,
} as const

function archKeyForFdi(piezaFDI: number): UnifiedArchKey {
  return piezaFDI >= 31 && piezaFDI <= 48 ? 'mandibula' : 'maxilarSuperior'
}

function treatmentTipoToToothState(
  tipo: UnifiedImplantTreatment['tipo'] | undefined,
): OdontogramaFdiToothState {
  if (tipo === 'implante_unitario') return 'implante'
  if (tipo === 'pontico') return 'pontico'
  return 'vacio'
}

function toothStateToTreatmentTipo(
  state: Exclude<OdontogramaFdiToothState, 'vacio'>,
): UnifiedImplantTreatment['tipo'] {
  return state === 'pontico' ? 'pontico' : 'implante_unitario'
}

export function UnifiedImplantPlanner({
  value,
  onChange,
  disabled = false,
}: UnifiedImplantPlannerProps) {
  const plan = normalizeUnifiedImplantPlan(value)
  const [selection, setSelection] = useState<UnifiedSelectionTarget>(null)

  const updatePlan = (patch: Partial<UnifiedImplantPlan>) => {
    onChange({ ...plan, ...patch })
  }

  const updateArch = (archKey: UnifiedArchKey, patch: Partial<UnifiedArchPlan>) => {
    updatePlan({
      [archKey]: {
        ...plan[archKey],
        ...patch,
      },
    })
  }

  const setArchEstado = (archKey: UnifiedArchKey, edentulo: boolean) => {
    updateArch(archKey, { estado: edentulo ? 'edentulo' : 'dentado' })
    setSelection((current) => (current?.arch === archKey ? null : current))
  }

  const selectedTreatment = useMemo((): UnifiedImplantTreatment | null => {
    if (!selection) return null
    const arch = plan[selection.arch]
    const items = getArchActiveTreatments(arch)
    if (selection.mode === 'tooth') {
      return items.find((item) => item.piezaFDI === selection.piezaFDI) ?? null
    }
    return items.find((item) => item.id === selection.treatmentId) ?? null
  }, [plan, selection])

  const dentateToothStates = useMemo(() => {
    const states: Partial<Record<number, OdontogramaFdiToothState>> = {}
    for (const archKey of ['maxilarSuperior', 'mandibula'] as const) {
      if (plan[archKey].estado !== 'dentado') continue
      for (const item of plan[archKey].tratamientos) {
        if (item.piezaFDI == null) continue
        states[item.piezaFDI] = treatmentTipoToToothState(item.tipo)
      }
    }
    return states
  }, [plan])

  const upsertArchTreatment = (
    archKey: UnifiedArchKey,
    listKey: 'implantes' | 'tratamientos',
    nextItems: UnifiedImplantTreatment[],
  ) => {
    updateArch(archKey, { [listKey]: nextItems })
  }

  /** Bridge OdontogramaFDI → estado IndexedDB del planner */
  const handleToothStateChange = (
    piezaFDI: number,
    nuevoEstado: OdontogramaFdiToothState,
  ) => {
    if (disabled) return
    const archKey = archKeyForFdi(piezaFDI)
    const arch = plan[archKey]
    if (arch.estado === 'edentulo') return

    const without = arch.tratamientos.filter((item) => item.piezaFDI !== piezaFDI)

    if (nuevoEstado === 'vacio') {
      upsertArchTreatment(archKey, 'tratamientos', without)
      setSelection((current) =>
        current?.mode === 'tooth' && current.piezaFDI === piezaFDI ? null : current,
      )
      return
    }

    const existing = arch.tratamientos.find((item) => item.piezaFDI === piezaFDI)
    const nextTipo = toothStateToTreatmentTipo(nuevoEstado)

    if (existing) {
      upsertArchTreatment(
        archKey,
        'tratamientos',
        arch.tratamientos.map((item) =>
          item.piezaFDI === piezaFDI ? { ...item, tipo: nextTipo } : item,
        ),
      )
    } else {
      upsertArchTreatment(archKey, 'tratamientos', [
        ...without,
        createEmptyUnifiedTreatment({ piezaFDI, tipo: nextTipo }),
      ])
    }

    setSelection({ arch: archKey, mode: 'tooth', piezaFDI })
  }

  const handleRidgeSlotClick = (archKey: UnifiedArchKey, slotIndex: number) => {
    if (disabled) return
    const arch = plan[archKey]
    const existing = arch.implantes.find((item) => item.posicionReborde === slotIndex)
    if (existing) {
      setSelection({ arch: archKey, mode: 'ridge', treatmentId: existing.id })
      return
    }
    const created = createEmptyUnifiedTreatment({
      posicionReborde: slotIndex,
      tipo: 'implante_unitario',
    })
    upsertArchTreatment(archKey, 'implantes', [...arch.implantes, created])
    setSelection({ arch: archKey, mode: 'ridge', treatmentId: created.id })
  }

  const handleTreatmentPatch = (patch: Partial<UnifiedImplantTreatment>) => {
    if (!selection || !selectedTreatment) return
    const archKey = selection.arch
    const arch = plan[archKey]
    const listKey = arch.estado === 'edentulo' ? 'implantes' : 'tratamientos'
    const list = arch[listKey]
    upsertArchTreatment(
      archKey,
      listKey,
      list.map((item) =>
        item.id === selectedTreatment.id
          ? {
              ...item,
              ...patch,
              faseQuirurgica: patch.faseQuirurgica
                ? { ...item.faseQuirurgica, ...patch.faseQuirurgica }
                : item.faseQuirurgica,
              faseProtesica: patch.faseProtesica
                ? { ...item.faseProtesica, ...patch.faseProtesica }
                : item.faseProtesica,
            }
          : item,
      ),
    )
  }

  const handleRemoveSelected = () => {
    if (!selection || !selectedTreatment) return
    const archKey = selection.arch
    const arch = plan[archKey]
    const listKey = arch.estado === 'edentulo' ? 'implantes' : 'tratamientos'
    upsertArchTreatment(
      archKey,
      listKey,
      arch[listKey].filter((item) => item.id !== selectedTreatment.id),
    )
    setSelection(null)
  }

  const renderArchShell = (
    archKey: UnifiedArchKey,
    title: string,
    svgArch: 'upper' | 'lower',
  ) => {
    const arch = plan[archKey]
    const isEdentulous = arch.estado === 'edentulo'
    const isUpper = archKey === 'maxilarSuperior'

    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
          <ArchEdentulousToggle
            id={`edentulous-toggle-${archKey}`}
            checked={isEdentulous}
            disabled={disabled}
            tabIndex={isUpper ? TAB.upperToggle : TAB.lowerToggle}
            onChange={(checked) => setArchEstado(archKey, checked)}
          />
        </div>

        {isEdentulous ? (
          <div className="space-y-3">
            <EdentulousRidgeCanvas
              arch={svgArch}
              implants={arch.implantes}
              selectedTreatmentId={
                selection?.arch === archKey && selection.mode === 'ridge'
                  ? selection.treatmentId
                  : null
              }
              disabled={disabled}
              tabIndexBase={isUpper ? TAB.upperRidge : TAB.lowerRidge}
              onSelectSlot={(slot) => handleRidgeSlotClick(archKey, slot)}
              onSelectImplant={(id) =>
                setSelection({ arch: archKey, mode: 'ridge', treatmentId: id })
              }
            />
            <label className={fieldLabelClass}>
              <span>Rehabilitación global del arco</span>
              <input
                type="text"
                value={arch.rehabilitacionGlobal}
                disabled={disabled}
                tabIndex={disabled ? -1 : isUpper ? TAB.upperRehab : TAB.lowerRehab}
                placeholder="Ej. All-on-4, sobredentadura Locator…"
                onChange={(e) => updateArch(archKey, { rehabilitacionGlobal: e.target.value })}
                className={fieldControlClass}
              />
            </label>
          </div>
        ) : (
          <OdontogramaFDI
            arcada={isUpper ? 'superior' : 'inferior'}
            toothStates={dentateToothStates}
            selectedPiezaFDI={
              selection?.mode === 'tooth' ? selection.piezaFDI : null
            }
            disabled={disabled}
            onToothStateChange={handleToothStateChange}
          />
        )}
      </div>
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers3 className="h-5 w-5 shrink-0 text-teal-600" aria-hidden />
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              Planificación unificada de implantes
            </h3>
            <p className="text-xs text-slate-500">
              OdontogramaFDI · vacío → implante → póntico · offline-first
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {renderArchShell('maxilarSuperior', 'Maxilar superior', 'upper')}

          <div className="flex items-center justify-center" aria-hidden>
            <div className="h-px w-full max-w-3xl border-t-2 border-dashed border-slate-300" />
          </div>

          {renderArchShell('mandibula', 'Mandíbula', 'lower')}

          <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-500" aria-hidden /> Implante
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-500" aria-hidden /> Póntico
            </span>
            <span className="text-slate-400">
              1.er clic = implante · 2.º = póntico · 3.º = vacío
            </span>
          </div>

          <HybridConfigPanel
            treatment={selectedTreatment}
            selectionLabel={
              selectedTreatment
                ? `${selection?.arch === 'mandibula' ? 'Mandíbula' : 'Maxilar superior'} · ${treatmentPositionLabel(selectedTreatment)}`
                : undefined
            }
            disabled={disabled}
            tabIndexBase={TAB.config}
            onChange={handleTreatmentPatch}
            onRemove={handleRemoveSelected}
          />
        </div>

        <FinancialSummaryPanel
          plan={plan}
          disabled={disabled}
          tabIndexBase={TAB.prices}
          onPricesChange={(preciosReferencia: UnifiedImplantUnitPrices) =>
            updatePlan({ preciosReferencia })
          }
        />
      </div>
    </section>
  )
}

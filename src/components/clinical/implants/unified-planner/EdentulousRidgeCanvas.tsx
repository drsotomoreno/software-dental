import type { UnifiedImplantTreatment } from '@/types/unifiedImplantPlan'
import { EDENTULOUS_RIDGE_SLOT_COUNT } from '@/constants/unifiedImplantPlanning'

interface EdentulousRidgeCanvasProps {
  arch: 'upper' | 'lower'
  implants: UnifiedImplantTreatment[]
  selectedTreatmentId: string | null
  disabled?: boolean
  /** Base tabIndex para el primer slot; el resto incrementa en +1 */
  tabIndexBase?: number
  onSelectSlot: (slotIndex: number) => void
  onSelectImplant: (treatmentId: string) => void
}

const IMPLANT_COLOR = '#6B7280'
const PONTIC_COLOR = '#F97316'

export function EdentulousRidgeCanvas({
  arch,
  implants,
  selectedTreatmentId,
  disabled = false,
  tabIndexBase = 0,
  onSelectSlot,
  onSelectImplant,
}: EdentulousRidgeCanvasProps) {
  const bySlot = new Map(
    implants
      .filter((item) => item.posicionReborde != null)
      .map((item) => [item.posicionReborde as number, item]),
  )

  const archLabel = arch === 'upper' ? 'maxilar' : 'mandibular'

  return (
    <div className="rounded-xl border border-dashed border-teal-300 bg-gradient-to-b from-teal-50/80 to-white p-3">
      <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wide text-teal-800">
        Reborde {archLabel} edéntulo
      </p>

      <div
        role="group"
        aria-label={`Slots de reborde ${archLabel}`}
        className="relative mx-auto flex max-w-xl items-end justify-between gap-1 px-2 pb-1 pt-6"
      >
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-4 top-1/2 h-3 -translate-y-1/2 rounded-full bg-teal-200/70 ${
            arch === 'upper' ? 'origin-center -rotate-[2deg]' : 'origin-center rotate-[2deg]'
          }`}
        />

        {Array.from({ length: EDENTULOUS_RIDGE_SLOT_COUNT }, (_, slot) => {
          const existing = bySlot.get(slot)
          const selected = existing?.id === selectedTreatmentId
          const isPontic = existing?.tipo === 'pontico'
          const accent = isPontic ? PONTIC_COLOR : existing ? IMPLANT_COLOR : undefined

          return (
            <button
              key={slot}
              type="button"
              disabled={disabled}
              tabIndex={disabled ? -1 : tabIndexBase + slot}
              aria-pressed={selected}
              aria-label={
                existing
                  ? `Reborde ${archLabel} posición ${slot + 1}${isPontic ? ' — Póntico' : ' — Implante'}`
                  : `Añadir implante en reborde ${archLabel} posición ${slot + 1}`
              }
              onClick={() => {
                if (existing) onSelectImplant(existing.id)
                else onSelectSlot(slot)
              }}
              className={`relative z-[1] flex h-12 w-12 flex-col items-center justify-center rounded-full border-2 bg-white text-[10px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? 'border-teal-600 shadow-md ring-2 ring-teal-200'
                  : accent
                    ? 'border-current shadow-sm'
                    : 'border-dashed border-slate-300 text-slate-500 hover:border-teal-400 hover:text-teal-700'
              }`}
              style={accent ? { color: accent, borderColor: accent } : undefined}
            >
              {existing?.tipo === 'implante_unitario' ? (
                <svg viewBox="0 0 16 20" className="h-5 w-4" aria-hidden>
                  <line x1="8" y1="2" x2="8" y2="18" stroke="currentColor" strokeWidth="1.6" />
                  <line x1="4" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="1.4" />
                  <line x1="4" y1="10" x2="12" y2="10" stroke="currentColor" strokeWidth="1.4" />
                  <line x1="4" y1="14" x2="12" y2="14" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              ) : existing?.tipo === 'pontico' ? (
                <span className="h-3 w-5 rounded-sm border border-dashed border-current bg-orange-100/80" />
              ) : (
                <span className="text-base leading-none text-slate-400">+</span>
              )}
              <span className="mt-0.5 text-[9px] text-slate-500">{slot + 1}</span>
            </button>
          )
        })}
      </div>

      <p className="mt-2 text-center text-[10px] text-slate-500">
        Tab entre posiciones · Enter/Espacio para asignar o configurar
      </p>
    </div>
  )
}

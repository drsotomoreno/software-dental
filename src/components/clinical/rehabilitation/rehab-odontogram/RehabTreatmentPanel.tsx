import { useState } from 'react'
import { Eraser, Sparkles, Trash2 } from 'lucide-react'
import {
  IMPLANT_FIXTURE_SIZE_OPTIONS,
  DEFAULT_IMPLANT_FIXTURE_SIZE,
  type ImplantFixtureSize,
} from '@/constants/implantPlanning'
import {
  REHAB_ARCH_PROSTHESIS_SCOPE_OPTIONS,
  REHAB_ELIMINATED_TOOTH_TREATMENTS,
  REHAB_PROTESIS_PARCIAL_REMOVIBLE_COLOR,
  REHAB_PROTESIS_PARCIAL_REMOVIBLE_LABEL,
  REHAB_PROTESIS_PARCIAL_REMOVIBLE_OPTION,
  REHAB_PROTESIS_TOTAL_COLOR,
  REHAB_PROTESIS_TOTAL_LABEL,
  REHAB_PROTESIS_TOTAL_OPTION,
  REHAB_TREATMENT_OPTIONS,
} from './constants'
import type {
  RehabArchPlanningTreatmentId,
  RehabArchProsthesisPlan,
  RehabArchProsthesisScope,
  RehabOdontogramVariant,
  RehabTreatmentPlanEntry,
  RehabTreatmentType,
} from './types'

interface RehabTreatmentPanelProps {
  selectedToothId: string | null
  selectedEntry?: RehabTreatmentPlanEntry
  protesisTotal?: RehabArchProsthesisPlan | null
  protesisParcialRemovible?: RehabArchProsthesisPlan | null
  planningOptions: ReadonlyArray<{ id: string; label: string; color: string }>
  variant?: RehabOdontogramVariant
  disabled?: boolean
  onApplyTreatment: (treatment: RehabTreatmentType, color: string) => void
  onImplantSizeChange?: (size: ImplantFixtureSize) => void
  onProtesisTotalChange: (protesisTotal: RehabArchProsthesisPlan | null) => void
  onProtesisParcialRemovibleChange: (protesisParcialRemovible: RehabArchProsthesisPlan | null) => void
  onDeleteTooth: () => void
  onClearTooth: () => void
  onClearAll: () => void
}

const ARCH_PLANNING_CONFIG: Record<
  RehabArchPlanningTreatmentId,
  {
    label: string
    color: string
    activeClass: string
    scopeActiveClass: string
  }
> = {
  protesis_total: {
    label: REHAB_PROTESIS_TOTAL_LABEL,
    color: REHAB_PROTESIS_TOTAL_COLOR,
    activeClass: 'border-teal-400 bg-teal-50 font-medium text-teal-900',
    scopeActiveClass: 'border-teal-400 bg-teal-50 font-medium text-teal-900',
  },
  protesis_parcial_removible: {
    label: REHAB_PROTESIS_PARCIAL_REMOVIBLE_LABEL,
    color: REHAB_PROTESIS_PARCIAL_REMOVIBLE_COLOR,
    activeClass: 'border-amber-500 bg-amber-50 font-medium text-amber-900',
    scopeActiveClass: 'border-amber-500 bg-amber-50 font-medium text-amber-900',
  },
}

function getArchPlan(
  treatmentId: RehabArchPlanningTreatmentId,
  protesisTotal: RehabArchProsthesisPlan | null,
  protesisParcialRemovible: RehabArchProsthesisPlan | null,
): RehabArchProsthesisPlan | null {
  if (treatmentId === 'protesis_total') return protesisTotal
  return protesisParcialRemovible
}

export function RehabTreatmentPanel({
  selectedToothId,
  selectedEntry,
  protesisTotal = null,
  protesisParcialRemovible = null,
  planningOptions,
  variant = 'rehabilitation',
  disabled = false,
  onApplyTreatment,
  onImplantSizeChange,
  onProtesisTotalChange,
  onProtesisParcialRemovibleChange,
  onDeleteTooth,
  onClearTooth,
  onClearAll,
}: RehabTreatmentPanelProps) {
  const isImplantsVariant = variant === 'implants'
  const treatmentLabelById = new Map(planningOptions.map((option) => [option.id, option.label]))
  const isEliminated = Boolean(selectedEntry?.eliminado)
  const [expandedArchTreatment, setExpandedArchTreatment] =
    useState<RehabArchPlanningTreatmentId | null>(null)

  const handleArchTreatmentClick = (treatmentId: RehabArchPlanningTreatmentId) => {
    if (disabled) return
    const currentPlan = getArchPlan(treatmentId, protesisTotal, protesisParcialRemovible)
    if (currentPlan) {
      if (treatmentId === 'protesis_total') onProtesisTotalChange(null)
      else onProtesisParcialRemovibleChange(null)
      setExpandedArchTreatment(null)
      return
    }
    setExpandedArchTreatment(treatmentId)
  }

  const handleArchScopeSelect = (
    treatmentId: RehabArchPlanningTreatmentId,
    scope: RehabArchProsthesisScope,
  ) => {
    if (disabled) return
    const currentPlan = getArchPlan(treatmentId, protesisTotal, protesisParcialRemovible)
    const config = ARCH_PLANNING_CONFIG[treatmentId]

    if (currentPlan?.scope === scope) {
      if (treatmentId === 'protesis_total') onProtesisTotalChange(null)
      else onProtesisParcialRemovibleChange(null)
      setExpandedArchTreatment(null)
      return
    }

    const nextPlan = { scope, color: config.color }
    if (treatmentId === 'protesis_total') onProtesisTotalChange(nextPlan)
    else onProtesisParcialRemovibleChange(nextPlan)
    setExpandedArchTreatment(null)
  }

  const activeArchTreatment =
    expandedArchTreatment ??
    (protesisTotal ? 'protesis_total' : protesisParcialRemovible ? 'protesis_parcial_removible' : null)

  const showArchScopes = Boolean(activeArchTreatment)

  return (
    <section className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="rounded-lg bg-dental-100 p-2 text-dental-700">
            <Sparkles className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Planificación de tratamientos</h4>
            <p className="text-xs text-slate-500">
              {selectedToothId
                ? `Pieza seleccionada: ${selectedToothId}${isEliminated ? ' (eliminada)' : ''}`
                : 'Seleccione una pieza o un tratamiento de arcada en el esquema'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || !selectedToothId}
            onClick={onDeleteTooth}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar diente
          </button>
          <button
            type="button"
            disabled={disabled || !selectedToothId}
            onClick={onClearTooth}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Eraser className="h-3.5 w-3.5" />
            Limpiar pieza
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onClearAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Eraser className="h-3.5 w-3.5" />
            Limpiar todo
          </button>
        </div>
      </div>

      {isEliminated && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Pieza eliminada: se conserva el número FDI. Puede asignar{' '}
          {isImplantsVariant ? (
            <>
              <strong>Implante Dental</strong> o{' '}
              <strong>Póntico de Prótesis Fija Sobre Implantes</strong>.
            </>
          ) : (
            <>
              <strong>Implante Dental</strong> o <strong>Póntico de PPF</strong>.
            </>
          )}
        </p>
      )}

      <div className={`grid gap-2 ${isImplantsVariant ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
        {planningOptions.map((option) => {
          const isArchTreatment =
            !isImplantsVariant &&
            (option.id === REHAB_PROTESIS_TOTAL_OPTION.id ||
              option.id === REHAB_PROTESIS_PARCIAL_REMOVIBLE_OPTION.id)

          if (isArchTreatment) {
            const treatmentId = option.id as RehabArchPlanningTreatmentId
            const currentPlan = getArchPlan(treatmentId, protesisTotal, protesisParcialRemovible)
            const isActive = Boolean(currentPlan) || expandedArchTreatment === treatmentId

            return (
              <button
                key={option.id}
                type="button"
                disabled={disabled}
                onClick={() => handleArchTreatmentClick(treatmentId)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  isActive
                    ? 'border-slate-300 bg-white shadow-sm ring-2 ring-offset-1'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
                style={isActive ? { boxShadow: `0 0 0 2px ${option.color}55` } : undefined}
              >
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-white shadow-sm"
                  style={{ backgroundColor: option.color }}
                />
                <span className="font-medium leading-tight text-slate-700">{option.label}</span>
              </button>
            )
          }

          const isActive = selectedEntry?.tratamiento === option.id
          const isAllowedOnEliminated = REHAB_ELIMINATED_TOOTH_TREATMENTS.includes(
            option.id as RehabTreatmentType,
          )
          const isOptionDisabled =
            disabled || !selectedToothId || (isEliminated && !isAllowedOnEliminated)

          return (
            <button
              key={option.id}
              type="button"
              disabled={isOptionDisabled}
              onClick={() => onApplyTreatment(option.id as RehabTreatmentType, option.color)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-45 ${
                isActive
                  ? 'border-slate-300 bg-white shadow-sm ring-2 ring-offset-1'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              }`}
              style={isActive ? { boxShadow: `0 0 0 2px ${option.color}55` } : undefined}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: option.color }}
              />
              <span className="font-medium leading-tight text-slate-700">{option.label}</span>
            </button>
          )
        })}
      </div>

      {isImplantsVariant && selectedEntry?.tratamiento === 'implante' && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <label className="text-[11px] font-medium text-slate-600">
            Medidas del implante — pieza {selectedEntry.dienteId}
            <select
              value={selectedEntry.implantSize ?? DEFAULT_IMPLANT_FIXTURE_SIZE}
              disabled={disabled}
              onChange={(event) =>
                onImplantSizeChange?.(event.target.value as ImplantFixtureSize)
              }
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
            >
              {IMPLANT_FIXTURE_SIZE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {showArchScopes && activeArchTreatment && !isImplantsVariant && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {REHAB_ARCH_PROSTHESIS_SCOPE_OPTIONS.map((option) => {
            const currentPlan = getArchPlan(
              activeArchTreatment,
              protesisTotal,
              protesisParcialRemovible,
            )
            const isActive = currentPlan?.scope === option.id
            const scopeClass = ARCH_PLANNING_CONFIG[activeArchTreatment].scopeActiveClass

            return (
              <button
                key={`${activeArchTreatment}-${option.id}`}
                type="button"
                disabled={disabled}
                onClick={() => handleArchScopeSelect(activeArchTreatment, option.id)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  isActive
                    ? scopeClass
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      )}

      {selectedEntry?.eliminado && !selectedEntry.tratamiento && (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          Pieza <strong>{selectedEntry.dienteId}</strong> marcada como eliminada (sin imagen).
        </p>
      )}

      {selectedEntry?.tratamiento && (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          Tratamiento actual en pieza <strong>{selectedEntry.dienteId}</strong>:{' '}
          <span className="font-medium" style={{ color: selectedEntry.color }}>
            {treatmentLabelById.get(selectedEntry.tratamiento) ??
              REHAB_TREATMENT_OPTIONS.find((item) => item.id === selectedEntry.tratamiento)?.label}
          </span>
          {selectedEntry.tratamiento === 'implante' && selectedEntry.implantSize && (
            <span className="text-slate-500">
              {' '}
              —{' '}
              {
                IMPLANT_FIXTURE_SIZE_OPTIONS.find((item) => item.id === selectedEntry.implantSize)
                  ?.label
              }
            </span>
          )}
          {selectedEntry.eliminado ? ' sobre pieza eliminada' : ''}
        </p>
      )}

      {!isImplantsVariant && protesisTotal && (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          Tratamiento actual:{' '}
          <span className="font-medium" style={{ color: protesisTotal.color }}>
            {REHAB_PROTESIS_TOTAL_LABEL} —{' '}
            {REHAB_ARCH_PROSTHESIS_SCOPE_OPTIONS.find((item) => item.id === protesisTotal.scope)?.label}
          </span>
        </p>
      )}

      {!isImplantsVariant && protesisParcialRemovible && (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          Tratamiento actual:{' '}
          <span className="font-medium" style={{ color: protesisParcialRemovible.color }}>
            {REHAB_PROTESIS_PARCIAL_REMOVIBLE_LABEL} —{' '}
            {REHAB_ARCH_PROSTHESIS_SCOPE_OPTIONS.find((item) => item.id === protesisParcialRemovible.scope)
              ?.label}
          </span>
        </p>
      )}
    </section>
  )
}

import type { ReactNode } from 'react'
import {
  IMPLANT_ODONTOGRAM_TREATMENT_OPTIONS,
  REHAB_ARCH_PROSTHESIS_SCOPE_OPTIONS,
  REHAB_PROTESIS_PARCIAL_REMOVIBLE_LABEL,
  REHAB_PROTESIS_TOTAL_LABEL,
  REHAB_TREATMENT_OPTIONS,
} from './constants'
import {
  REHAB_FIXED_RESTORATION_MATERIALS,
  REHAB_FIXED_RESTORATION_TREATMENTS,
  REHAB_PPR_MATERIALS,
  IMPLANT_FIXED_RESTORATION_MATERIALS,
  createEmptyRestorationSpec,
  type RehabRestorationDetailKey,
  type RehabRestorationDetails,
  type RehabTreatmentRestorationSpec,
} from '@/constants/rehabilitationRestoration'
import { VITA_3D_MASTER_SHADE_GROUPS } from '@/constants/vita3dMasterShades'
import { VITA_CLASSIC_SHADE_GROUPS, VITA_CLASSIC_SHADES } from '@/constants/vitaClassicShades'
import { implantFixtureSizeLabel } from '@/constants/implantPlanning'
import type {
  RehabArchProsthesisPlan,
  RehabOdontogramVariant,
  RehabTreatmentPlanEntry,
  RehabTreatmentType,
} from './types'

interface SummaryPillProps {
  color: string
  label: string
  detail: string
  dashedDot?: boolean
}

function SummaryPill({ color, label, detail, dashedDot = false }: SummaryPillProps) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
      {dashedDot ? (
        <span className="h-2.5 w-2.5 rounded-full border border-dashed border-slate-400 bg-slate-100" />
      ) : (
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      )}
      <span>
        {label}: {detail}
      </span>
    </span>
  )
}

interface SummarySelectPillProps {
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
  children: ReactNode
}

function SummarySelectPill({
  label,
  value,
  disabled = false,
  onChange,
  children,
}: SummarySelectPillProps) {
  return (
    <label className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
      <span className="text-slate-500">{label}</span>
      <select
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[10rem] cursor-pointer border-0 bg-transparent py-0 pl-0 pr-4 text-[11px] font-medium text-slate-800 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {children}
      </select>
    </label>
  )
}

function sortTeethIds(teeth: string[]): string[] {
  return teeth.slice().sort((a, b) => Number(a) - Number(b))
}

function groupPlanByTreatment(plan: RehabTreatmentPlanEntry[]) {
  const eliminatedOnly: string[] = []
  const byTreatment = new Map<
    RehabTreatmentType,
    { color: string; teeth: string[]; hasEliminated: boolean }
  >()

  for (const entry of plan) {
    if (entry.eliminado && !entry.tratamiento) {
      eliminatedOnly.push(entry.dienteId)
      continue
    }
    if (!entry.tratamiento) continue

    const current = byTreatment.get(entry.tratamiento) ?? {
      color: entry.color ?? '#64748b',
      teeth: [],
      hasEliminated: false,
    }
    current.teeth.push(entry.dienteId)
    if (entry.eliminado) current.hasEliminated = true
    byTreatment.set(entry.tratamiento, current)
  }

  return { eliminatedOnly: sortTeethIds(eliminatedOnly), byTreatment }
}

function SummarySelectCell({
  label,
  value,
  disabled = false,
  onChange,
  children,
}: {
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <select
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {children}
      </select>
    </div>
  )
}

function ImplantPlanningSummaryTable({
  groups,
  restorationDetails,
  disabled,
  onRestorationChange,
}: {
  groups: Array<{
    key: RehabRestorationDetailKey
    color: string
    label: string
    detail: string
  }>
  restorationDetails: RehabRestorationDetails
  disabled?: boolean
  onRestorationChange: (
    key: RehabRestorationDetailKey,
    patch: Partial<RehabTreatmentRestorationSpec>,
  ) => void
}) {
  const colorSelectOptions = (
    <>
      <option value="">— Seleccionar —</option>
      {VITA_CLASSIC_SHADE_GROUPS.map((group) => (
        <optgroup key={group.id} label={`VITA Clásica — ${group.label}`}>
          {VITA_CLASSIC_SHADES.filter((shade) => shade.group === group.id).map((shade) => (
            <option key={`classic-${shade.id}`} value={`classic:${shade.id}`}>
              {shade.id}
            </option>
          ))}
        </optgroup>
      ))}
      {VITA_3D_MASTER_SHADE_GROUPS.map((group) => (
        <optgroup key={group.id} label={`3D Master — ${group.label}`}>
          {group.shades.map((shade) => (
            <option key={`3d-${shade}`} value={`3d:${shade}`}>
              {shade}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  )

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-1 gap-px bg-slate-200 sm:grid-cols-3">
        <div className="bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Tratamiento
        </div>
        <div className="bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Material de la Restauración
        </div>
        <div className="bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Color de la Restauración
        </div>
      </div>

      {groups.map((group) => {
        const spec = restorationDetails[group.key] ?? createEmptyRestorationSpec()
        const updateSpec = (patch: Partial<RehabTreatmentRestorationSpec>) => {
          onRestorationChange(group.key, patch)
        }

        return (
          <div
            key={group.key}
            className="grid grid-cols-1 gap-3 border-t border-slate-200 p-3 sm:grid-cols-3 sm:gap-4"
          >
            <div className="flex min-w-0 items-start">
              <SummaryPill color={group.color} label={group.label} detail={group.detail} />
            </div>
            <SummarySelectCell
              label="Material"
              value={spec.material}
              disabled={disabled}
              onChange={(material) =>
                updateSpec({ material: material as RehabTreatmentRestorationSpec['material'] })
              }
            >
              <option value="">— Seleccionar —</option>
              {IMPLANT_FIXED_RESTORATION_MATERIALS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </SummarySelectCell>
            <SummarySelectCell
              label="Color"
              value={spec.restorationColor}
              disabled={disabled}
              onChange={(restorationColor) =>
                updateSpec({
                  restorationColor:
                    restorationColor as RehabTreatmentRestorationSpec['restorationColor'],
                })
              }
            >
              {colorSelectOptions}
            </SummarySelectCell>
          </div>
        )
      })}
    </div>
  )
}

interface TreatmentSummaryRowProps {
  restorationKey?: RehabRestorationDetailKey
  restoration?: RehabTreatmentRestorationSpec
  showMaterial?: boolean
  showColor?: boolean
  materialOptions?: { id: string; label: string }[]
  disabled?: boolean
  onRestorationChange?: (
    key: RehabRestorationDetailKey,
    patch: Partial<RehabTreatmentRestorationSpec>,
  ) => void
  treatmentColor: string
  treatmentLabel: string
  treatmentDetail: string
  dashedDot?: boolean
}

function TreatmentSummaryRow({
  restorationKey,
  restoration,
  showMaterial = false,
  showColor = false,
  materialOptions = [],
  disabled = false,
  onRestorationChange,
  treatmentColor,
  treatmentLabel,
  treatmentDetail,
  dashedDot = false,
}: TreatmentSummaryRowProps) {
  const spec = restoration ?? createEmptyRestorationSpec()

  const updateSpec = (patch: Partial<RehabTreatmentRestorationSpec>) => {
    if (!restorationKey || !onRestorationChange) return
    onRestorationChange(restorationKey, patch)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SummaryPill
        color={treatmentColor}
        label={treatmentLabel}
        detail={treatmentDetail}
        dashedDot={dashedDot}
      />
      {showMaterial && restorationKey && (
        <SummarySelectPill
          label="Material Restaurador"
          value={spec.material}
          disabled={disabled}
          onChange={(material) =>
            updateSpec({ material: material as RehabTreatmentRestorationSpec['material'] })
          }
        >
          <option value="">— Seleccionar —</option>
          {materialOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </SummarySelectPill>
      )}
      {showColor && restorationKey && (
        <SummarySelectPill
          label="Color de la Restauración"
          value={spec.restorationColor}
          disabled={disabled}
          onChange={(restorationColor) =>
            updateSpec({
              restorationColor: restorationColor as RehabTreatmentRestorationSpec['restorationColor'],
            })
          }
        >
          <option value="">— Seleccionar —</option>
          {VITA_CLASSIC_SHADE_GROUPS.map((group) => (
            <optgroup key={group.id} label={`VITA Clásica — ${group.label}`}>
              {VITA_CLASSIC_SHADES.filter((shade) => shade.group === group.id).map((shade) => (
                <option key={`classic-${shade.id}`} value={`classic:${shade.id}`}>
                  {shade.id}
                </option>
              ))}
            </optgroup>
          ))}
          {VITA_3D_MASTER_SHADE_GROUPS.map((group) => (
            <optgroup key={group.id} label={`3D Master — ${group.label}`}>
              {group.shades.map((shade) => (
                <option key={`3d-${shade}`} value={`3d:${shade}`}>
                  {shade}
                </option>
              ))}
            </optgroup>
          ))}
        </SummarySelectPill>
      )}
    </div>
  )
}

interface RehabTreatmentSummaryProps {
  plan: RehabTreatmentPlanEntry[]
  protesisTotal?: RehabArchProsthesisPlan | null
  protesisParcialRemovible?: RehabArchProsthesisPlan | null
  restorationDetails?: RehabRestorationDetails
  variant?: RehabOdontogramVariant
  disabled?: boolean
  onRestorationDetailsChange?: (details: RehabRestorationDetails) => void
}

export function RehabTreatmentSummary({
  plan,
  protesisTotal = null,
  protesisParcialRemovible = null,
  restorationDetails = {},
  variant = 'rehabilitation',
  disabled = false,
  onRestorationDetailsChange,
}: RehabTreatmentSummaryProps) {
  const isImplantsVariant = variant === 'implants'
  const treatmentOptions = isImplantsVariant ? IMPLANT_ODONTOGRAM_TREATMENT_OPTIONS : REHAB_TREATMENT_OPTIONS
  const { eliminatedOnly, byTreatment } = groupPlanByTreatment(plan)

  const toothTreatmentGroups = treatmentOptions
    .filter((option) => byTreatment.has(option.id))
    .map((option) => {
      const group = byTreatment.get(option.id)!
      const detail = sortTeethIds(group.teeth)
        .map((toothId) => {
          if (variant === 'implants' && option.id === 'implante') {
            const entry = plan.find((item) => item.dienteId === toothId)
            const sizeLabel = entry?.implantSize ? implantFixtureSizeLabel(entry.implantSize) : ''
            return sizeLabel ? `${toothId} (${sizeLabel})` : toothId
          }
          return toothId
        })
        .join(', ')
      const suffix = group.hasEliminated ? ' (con piezas eliminadas)' : ''
      return {
        key: option.id,
        color: group.color ?? option.color,
        label: option.label,
        detail: `${detail}${suffix}`,
        showMaterial: !isImplantsVariant && REHAB_FIXED_RESTORATION_TREATMENTS.includes(option.id),
        showColor: !isImplantsVariant && REHAB_FIXED_RESTORATION_TREATMENTS.includes(option.id),
      }
    })

  const implantPlanningGroups = isImplantsVariant
    ? toothTreatmentGroups.filter(
        (group) => group.key === 'implante' || group.key === 'pontico_ppf',
      )
    : []

  const hasContent =
    (!isImplantsVariant && Boolean(protesisTotal)) ||
    (!isImplantsVariant && Boolean(protesisParcialRemovible)) ||
    toothTreatmentGroups.length > 0 ||
    eliminatedOnly.length > 0

  if (!hasContent) return null

  const handleRestorationChange = (
    key: RehabRestorationDetailKey,
    patch: Partial<RehabTreatmentRestorationSpec>,
  ) => {
    if (!onRestorationDetailsChange) return
    const current = restorationDetails[key] ?? createEmptyRestorationSpec()
    onRestorationDetailsChange({
      ...restorationDetails,
      [key]: { ...current, ...patch },
    })
  }

  return (
    <footer className="border-t border-slate-200 bg-slate-50 px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {isImplantsVariant
          ? 'Resumen de Planificacion de Implantes en Arcos Dentados'
          : 'Resumen Tratamiento Restaurador'}
      </p>
      <div className="flex flex-col gap-2">
        {!isImplantsVariant && protesisTotal && (
          <TreatmentSummaryRow
            treatmentColor={protesisTotal.color}
            treatmentLabel={REHAB_PROTESIS_TOTAL_LABEL}
            treatmentDetail={
              REHAB_ARCH_PROSTHESIS_SCOPE_OPTIONS.find((item) => item.id === protesisTotal.scope)
                ?.label ?? protesisTotal.scope
            }
          />
        )}
        {!isImplantsVariant && protesisParcialRemovible && (
          <TreatmentSummaryRow
            restorationKey="protesis_parcial_removible"
            restoration={restorationDetails.protesis_parcial_removible}
            showMaterial
            materialOptions={[...REHAB_PPR_MATERIALS]}
            disabled={disabled}
            onRestorationChange={handleRestorationChange}
            treatmentColor={protesisParcialRemovible.color}
            treatmentLabel={REHAB_PROTESIS_PARCIAL_REMOVIBLE_LABEL}
            treatmentDetail={
              REHAB_ARCH_PROSTHESIS_SCOPE_OPTIONS.find(
                (item) => item.id === protesisParcialRemovible.scope,
              )?.label ?? protesisParcialRemovible.scope
            }
          />
        )}
        {isImplantsVariant && implantPlanningGroups.length > 0 && (
          <ImplantPlanningSummaryTable
            groups={implantPlanningGroups}
            restorationDetails={restorationDetails}
            disabled={disabled}
            onRestorationChange={handleRestorationChange}
          />
        )}
        {!isImplantsVariant &&
          toothTreatmentGroups.map((group) => (
            <TreatmentSummaryRow
              key={group.key}
              restorationKey={group.key}
              restoration={restorationDetails[group.key]}
              showMaterial={group.showMaterial}
              showColor={group.showColor}
              materialOptions={[...REHAB_FIXED_RESTORATION_MATERIALS]}
              disabled={disabled}
              onRestorationChange={handleRestorationChange}
              treatmentColor={group.color}
              treatmentLabel={group.label}
              treatmentDetail={group.detail}
            />
          ))}
        {eliminatedOnly.length > 0 && (
          <TreatmentSummaryRow
            treatmentColor="#94a3b8"
            treatmentLabel="Eliminado"
            treatmentDetail={eliminatedOnly.join(', ')}
            dashedDot
          />
        )}
      </div>
    </footer>
  )
}

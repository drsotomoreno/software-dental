import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import type { Cie10Diagnosis, TreatmentPlanItem } from '@/types/clinicalRecord'
import type { OdontogramData } from '@/types/odontogram'
import type { SpecializedAnnexes } from '@/types/specializedAnnexes'
import { COMMON_CIE10_CODES } from '@/constants/dental'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { useCatalogSearch } from '@/hooks/useCatalogSearch'
import { useTariffSync } from '@/modules/tariff/useTariffSync'
import { useTariffStore } from '@/store/useTariffStore'
import { formatCurrency, generateId } from '@/utils'
import {
  mergeSuggestedTreatments,
  suggestTreatmentFromOdontogram,
} from '@/utils/odontogramTreatmentPlan'
import { resolveTariffUnitPrice } from '@/utils/tariffLookup'
import { getDefaultQuantityForCups } from '@/utils/cupsBillingRules'
import { formatCupsCodeDotted } from '@/services/catalogService'
import { searchGeneralDentistryCups } from '@/utils/cupsGeneralDentistry'
import { importAnnexesToTreatmentPlan, previewAnnexTreatmentImports } from '@/utils/treatmentPlanAnnexImport'
import { sumTreatmentPlanPrices } from '@/utils/treatmentPlanPricing'
import {
  ANATOMICAL_ZONE_PRESETS,
  formatAnatomicalZone,
  parseAnatomicalZone,
} from '@/utils/treatmentPlanZone'

interface TreatmentPlanFormProps {
  treatmentPlan: TreatmentPlanItem[]
  treatmentPlanNotes?: string
  diagnoses?: Cie10Diagnosis[]
  odontogram?: OdontogramData | null
  affectedTeeth?: number[]
  specializedAnnexes?: SpecializedAnnexes
  budgetLinkedItemIds?: string[]
  disabled?: boolean
  onChange: (patch: { treatmentPlan: TreatmentPlanItem[]; treatmentPlanNotes?: string }) => void
  onMoveToBudget?: (itemId: string) => void
}

const DEFAULT_TREATMENT_PHASE = 'fase_ii' as const

interface CieOption {
  code: string
  description: string
}

function formatCieLabel(item: Pick<TreatmentPlanItem, 'diagnosisCode' | 'diagnosisDescription'>): string {
  return [item.diagnosisCode, item.diagnosisDescription].filter(Boolean).join(' ')
}

function parseCieLabel(value: string): { diagnosisCode?: string; diagnosisDescription?: string } {
  const text = value.trim()
  if (!text) return { diagnosisCode: undefined, diagnosisDescription: undefined }
  const match = text.match(/^([A-Z]\d{2}(?:\.\d{1,2})?)\b\s*[-—:]?\s*(.*)$/i)
  if (!match) return { diagnosisCode: undefined, diagnosisDescription: text }
  return {
    diagnosisCode: match[1].toUpperCase(),
    diagnosisDescription: match[2]?.trim() || undefined,
  }
}

function PriceCell({
  value,
  disabled,
  onCommit,
}: {
  value: number
  disabled?: boolean
  onCommit: (amount: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  return (
    <input
      inputMode="numeric"
      disabled={disabled}
      aria-label="Precio"
      className="input-field h-8 px-2 text-right text-sm tabular-nums"
      value={editing ? draft : formatCurrency(value || 0)}
      onFocus={() => {
        if (disabled) return
        setEditing(true)
        setDraft(value ? String(Math.round(value)) : '')
      }}
      onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ''))}
      onBlur={() => {
        const parsed = Number(draft.replace(/[^\d]/g, ''))
        onCommit(Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0)
        setEditing(false)
      }}
    />
  )
}

export function TreatmentPlanForm({
  treatmentPlan,
  treatmentPlanNotes = '',
  odontogram,
  specializedAnnexes,
  disabled = false,
  onChange,
}: TreatmentPlanFormProps) {
  const [openMenu, setOpenMenu] = useState<{ id: string; field: 'cie' | 'cups'; query: string } | null>(
    null,
  )
  const cieQuery = openMenu?.field === 'cie' ? openMenu.query : ''
  const cupsQuery = openMenu?.field === 'cups' ? openMenu.query : ''
  const cieCatalog = useCatalogSearch('cie10', cieQuery, 20)

  const { user } = useAuth()
  useTariffSync(user?.id)
  const tariffMap = useTariffStore((state) => state.tariffMap)
  const prices = useLiveQuery(
    () => (user?.id ? db.prices.where('userId').equals(user.id).toArray() : []),
    [user?.id],
  )

  const emit = (plan: TreatmentPlanItem[]) => {
    onChange({ treatmentPlan: plan, treatmentPlanNotes })
  }

  const catalogUnitPrice = (cupsCode?: string) =>
    tariffMap[cupsCode ?? '']?.price ??
    tariffMap[cupsCode?.trim().toUpperCase() ?? '']?.price ??
    resolveTariffUnitPrice(cupsCode)

  const annexPreview = useMemo(
    () => previewAnnexTreatmentImports(specializedAnnexes, treatmentPlan),
    [specializedAnnexes, treatmentPlan],
  )

  const cieOptions = useMemo(() => {
    const map = new Map<string, CieOption>()
    const query = cieQuery.trim().toLowerCase()
    const pool = query.length >= 2 ? [...(cieCatalog ?? []), ...COMMON_CIE10_CODES] : COMMON_CIE10_CODES
    for (const item of pool) {
      const code = item.code.trim().toUpperCase()
      if (!code) continue
      if (
        query &&
        !code.toLowerCase().includes(query) &&
        !item.description.toLowerCase().includes(query)
      ) {
        continue
      }
      map.set(code, { code, description: item.description })
    }
    return [...map.values()].slice(0, 8)
  }, [cieCatalog, cieQuery])

  const cupsOptions = useMemo(
    () =>
      searchGeneralDentistryCups(
        cupsQuery,
        (prices ?? []).map((price) => ({ procedure: price.procedure, cupsCode: price.cupsCode })),
      ),
    [cupsQuery, prices],
  )

  const total = sumTreatmentPlanPrices(treatmentPlan)

  const addTreatmentItem = () => {
    const item: TreatmentPlanItem = {
      id: generateId(),
      phase: DEFAULT_TREATMENT_PHASE,
      procedure: '',
      quantity: 1,
      unitPrice: 0,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
      source: 'manual',
    }
    emit([...treatmentPlan, item])
  }

  const suggestFromOdontogram = () => {
    if (!odontogram) return
    const suggested = suggestTreatmentFromOdontogram(odontogram).map((item) => ({
      ...item,
      anatomicalZone: item.toothNumber ? String(item.toothNumber) : item.anatomicalZone,
      unitPrice: catalogUnitPrice(item.cupsCode) || item.unitPrice,
    }))
    emit(mergeSuggestedTreatments(treatmentPlan, suggested))
  }

  const importFromAnnexes = () => {
    emit(importAnnexesToTreatmentPlan(specializedAnnexes, treatmentPlan, catalogUnitPrice))
  }

  const updateTreatmentItem = (id: string, patch: Partial<TreatmentPlanItem>) => {
    emit(treatmentPlan.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const removeTreatmentItem = (id: string) => {
    emit(treatmentPlan.filter((item) => item.id !== id))
  }

  const focusRow = (id: string) => {
    document.getElementById(`plan-zone-${id}`)?.focus()
  }

  const closeMenuSoon = (id: string, field: 'cie' | 'cups') => {
    window.setTimeout(() => {
      setOpenMenu((current) => (current?.id === id && current.field === field ? null : current))
    }, 120)
  }

  return (
    <section className="card">
      <h3 className={`mb-3 ${CLINICAL_SECTION_TITLE_CLASS}`}>
        {clinicalSectionTitle(CLINICAL_HISTORY_SECTION_NUMBERS.tratamiento, 'Plan de Tratamiento')}{' '}
        <span className="text-red-500">*</span>
      </h3>

      {!disabled && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={suggestFromOdontogram}
            disabled={!odontogram}
            className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Importar desde odontograma
          </button>
          <button
            type="button"
            onClick={importFromAnnexes}
            disabled={annexPreview.length === 0}
            className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Importar desde anexos
          </button>
          <button type="button" onClick={addTreatmentItem} className="btn-primary text-xs">
            Agregar Nuevo Procedimiento
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">Diente / Zona</th>
              <th className="px-2 py-2">Diagnóstico CIE</th>
              <th className="px-2 py-2">Procedimiento</th>
              <th className="w-36 px-2 py-2 text-right">Precio</th>
              <th className="w-28 px-2 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {treatmentPlan.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-sm text-slate-400">
                  —
                </td>
              </tr>
            ) : (
              treatmentPlan.map((item) => {
                const cieOpen = openMenu?.id === item.id && openMenu.field === 'cie'
                const cupsOpen = openMenu?.id === item.id && openMenu.field === 'cups'
                return (
                  <tr key={item.id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-1.5">
                      <input
                        id={`plan-zone-${item.id}`}
                        list="plan-zone-presets"
                        disabled={disabled}
                        value={formatAnatomicalZone(item)}
                        onChange={(event) => updateTreatmentItem(item.id, parseAnatomicalZone(event.target.value))}
                        placeholder="16, 14-18, Q1"
                        className="input-field h-8 px-2 text-sm"
                        aria-label="Diente o zona"
                      />
                    </td>
                    <td className="relative px-2 py-1.5">
                      <input
                        disabled={disabled}
                        value={cieOpen ? openMenu.query : formatCieLabel(item)}
                        onFocus={() => {
                          if (disabled) return
                          setOpenMenu({ id: item.id, field: 'cie', query: formatCieLabel(item) })
                        }}
                        onBlur={() => closeMenuSoon(item.id, 'cie')}
                        onChange={(event) => {
                          const query = event.target.value
                          setOpenMenu({ id: item.id, field: 'cie', query })
                          updateTreatmentItem(item.id, parseCieLabel(query))
                        }}
                        placeholder="CIE-10"
                        className="input-field h-8 px-2 text-sm"
                        aria-label="Diagnóstico CIE"
                        autoComplete="off"
                      />
                      {cieOpen && (
                        <ul className="absolute z-20 mt-1 max-h-40 w-[min(20rem,70vw)] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-md">
                          {cieOptions.length === 0 ? (
                            <li className="px-2 py-1.5 text-xs text-slate-400">—</li>
                          ) : (
                            cieOptions.map((option) => (
                              <li key={`${item.id}-${option.code}`}>
                                <button
                                  type="button"
                                  className="flex w-full gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    updateTreatmentItem(item.id, {
                                      diagnosisCode: option.code,
                                      diagnosisDescription: option.description,
                                    })
                                    setOpenMenu(null)
                                  }}
                                >
                                  <span className="font-mono text-dental-700">{option.code}</span>
                                  <span className="truncate text-slate-600">{option.description}</span>
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      )}
                    </td>
                    <td className="relative px-2 py-1.5">
                      <input
                        disabled={disabled}
                        value={cupsOpen ? openMenu.query : item.procedure}
                        onFocus={() => {
                          if (disabled) return
                          setOpenMenu({ id: item.id, field: 'cups', query: item.procedure })
                        }}
                        onBlur={() => closeMenuSoon(item.id, 'cups')}
                        onChange={(event) => {
                          const query = event.target.value
                          setOpenMenu({ id: item.id, field: 'cups', query })
                          updateTreatmentItem(item.id, { procedure: query })
                        }}
                        placeholder="CUPS .03"
                        title={item.procedure || undefined}
                        className="input-field h-8 px-2 pr-24 text-sm"
                        aria-label="Procedimiento"
                        autoComplete="off"
                      />
                      {item.cupsCode && !cupsOpen && (
                        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[10px] text-slate-400">
                          {formatCupsCodeDotted(item.cupsCode)}
                        </span>
                      )}
                      {cupsOpen && (
                        <ul className="absolute z-20 mt-1 max-h-44 w-[min(24rem,80vw)] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-md">
                          {cupsOptions.length === 0 ? (
                            <li className="px-2 py-1.5 text-xs text-slate-400">—</li>
                          ) : (
                            cupsOptions.map((option) => (
                              <li key={`${item.id}-${option.cupsCode}-${option.procedure}`}>
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    const price = catalogUnitPrice(option.cupsCode)
                                    updateTreatmentItem(item.id, {
                                      procedure: option.procedure,
                                      cupsCode: option.cupsCode,
                                      quantity: getDefaultQuantityForCups(option.cupsCode),
                                      unitPrice: price > 0 ? price : item.unitPrice,
                                    })
                                    setOpenMenu(null)
                                  }}
                                >
                                  <span className="truncate">
                                    {option.procedure}
                                    <span className="ml-2 font-mono text-slate-400">
                                      {formatCupsCodeDotted(option.cupsCode)}
                                    </span>
                                  </span>
                                  {catalogUnitPrice(option.cupsCode) > 0 && (
                                    <span className="shrink-0 text-dental-700">
                                      {formatCurrency(catalogUnitPrice(option.cupsCode))}
                                    </span>
                                  )}
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <PriceCell
                        value={item.unitPrice}
                        disabled={disabled}
                        onCommit={(unitPrice) => updateTreatmentItem(item.id, { unitPrice })}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {!disabled && (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => focusRow(item.id)}
                            className="text-xs font-medium text-dental-700 hover:text-dental-800"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => removeTreatmentItem(item.id)}
                            className="text-xs font-medium text-red-600 hover:text-red-700"
                          >
                            Eliminar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200">
              <td colSpan={3} className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Valor Total
              </td>
              <td className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-slate-900">
                {formatCurrency(total)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <datalist id="plan-zone-presets">
        {ANATOMICAL_ZONE_PRESETS.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
    </section>
  )
}

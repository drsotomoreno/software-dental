import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import type { ClinicalDiagnosticChart } from '@/types/clinicalDiagnosticChart'
import type { BudgetLineItem, Cie10Diagnosis, TreatmentPlanItem } from '@/types/clinicalRecord'
import type { OrthodonticsAnnex, SpecializedAnnexes } from '@/types/specializedAnnexes'
import { COMMON_CIE10_CODES, COMMON_DENTAL_PROCEDURES } from '@/constants/dental'
import { OrthodonticTreatmentPlanAndBudget } from './orthodontics'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { Toast } from '@/components/ui/Toast'
import { FieldVoiceHeader } from '@/components/voice'
import { useCatalogSearch } from '@/hooks/useCatalogSearch'
import { useToast } from '@/hooks/useToast'
import { useTariffSync } from '@/modules/tariff/useTariffSync'
import { useTariffStore } from '@/store/useTariffStore'
import { formatCurrency, generateId } from '@/utils'
import { resolveTariffUnitPrice } from '@/utils/tariffLookup'
import { getDefaultQuantityForCups } from '@/utils/cupsBillingRules'
import { formatCupsCodeDotted } from '@/services/catalogService'
import { searchGeneralDentistryCups } from '@/utils/cupsGeneralDentistry'
import {
  applyAnnexCatalogPrices,
  mergeAnnexImportsIntoTreatmentPlan,
  previewAnnexTreatmentImports,
} from '@/utils/treatmentPlanAnnexImport'
import {
  importDiagnosesToTreatmentPlan,
  previewDiagnosisTreatmentImports,
} from '@/utils/treatmentPlanDiagnosisImport'
import { collapseTreatmentPlanByProcedure } from '@/utils/treatmentPlanCollapse'
import { sumTreatmentPlanPrices } from '@/utils/treatmentPlanPricing'
import {
  ANATOMICAL_ZONE_PRESETS,
  formatAnatomicalZone,
  parseAnatomicalZone,
} from '@/utils/treatmentPlanZone'
import {
  patchBudgetOrphanLine,
  resolveUnifiedTreatmentBudgetRows,
} from '@/utils/unifiedTreatmentBudget'

interface TreatmentPlanFormProps {
  treatmentPlan: TreatmentPlanItem[]
  treatmentPlanNotes?: string
  /** Líneas de presupuesto legado — lectura híbrida sin borrar datos antiguos. */
  budgetItems?: BudgetLineItem[]
  diagnoses?: Cie10Diagnosis[]
  /** Esquema de la sección 4. Cada pieza asignada se importa como fila del plan. */
  diagnosticChart?: ClinicalDiagnosticChart | null
  affectedTeeth?: number[]
  specializedAnnexes?: SpecializedAnnexes
  budgetLinkedItemIds?: string[]
  disabled?: boolean
  onChange: (patch: { treatmentPlan: TreatmentPlanItem[]; treatmentPlanNotes?: string }) => void
  /** Edición/eliminación de huérfanas del presupuesto (registros antiguos). */
  onBudgetItemsChange?: (budgetItems: BudgetLineItem[]) => void
  onMoveToBudget?: (itemId: string) => void
  onOrthodonticsAnnexChange?: (patch: Partial<OrthodonticsAnnex>) => void
  /** Estado de sync nube (auto-guardado Sección 7). */
  cloudSyncStatus?: 'idle' | 'syncing' | 'saved' | 'pending_offline' | 'conflict' | 'error'
}

const DEFAULT_TREATMENT_PHASE = 'fase_ii' as const

const ANNEX_SOURCE_LABEL: Record<string, string> = {
  endodontics_annex: 'Endodoncia',
  orthodontics_annex: 'Ortodoncia',
  oral_surgery_annex: 'Cirugía oral / implantes',
  periodontics_annex: 'Periodoncia',
}

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
      aria-label="Precio unitario de esta atención"
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
  budgetItems = [],
  diagnoses = [],
  diagnosticChart,
  specializedAnnexes,
  disabled = false,
  onChange,
  onBudgetItemsChange,
  onOrthodonticsAnnexChange,
  cloudSyncStatus = 'idle',
}: TreatmentPlanFormProps) {
  const [openMenu, setOpenMenu] = useState<{ id: string; field: 'cie' | 'cups'; query: string } | null>(
    null,
  )
  const [annexPickerOpen, setAnnexPickerOpen] = useState(false)
  const [annexChoices, setAnnexChoices] = useState<TreatmentPlanItem[]>([])
  const [selectedAnnexIds, setSelectedAnnexIds] = useState<string[]>([])
  const [showOrthodonticBlock, setShowOrthodonticBlock] = useState(false)
  const [procedureSearch, setProcedureSearch] = useState('')
  const { toastMessage, showToast, clearToast } = useToast()
  const orthodontics = specializedAnnexes?.orthodontics
  const orthodonticBlockVisible =
    showOrthodonticBlock ||
    Boolean(orthodontics?.treatmentType) ||
    Boolean(orthodontics?.orthodonticBudget)
  const cieQuery = openMenu?.field === 'cie' ? openMenu.query : ''
  const cupsQuery = openMenu?.field === 'cups' ? openMenu.query : ''
  const cieCatalog = useCatalogSearch('cie10', cieQuery, 20)

  const { user } = useAuth()
  useTariffSync(user?.id)
  const tariffMap = useTariffStore((state) => state.tariffMap)
  const tariffUserId = user?.id != null && String(user.id).trim() ? String(user.id) : ''
  const prices = useLiveQuery(
    () => (tariffUserId ? db.prices.where('userId').equals(tariffUserId).toArray() : []),
    [tariffUserId],
  )

  const emit = (plan: TreatmentPlanItem[]) => {
    onChange({
      treatmentPlan: collapseTreatmentPlanByProcedure(plan),
      treatmentPlanNotes,
    })
  }

  const catalogUnitPrice = (cupsCode?: string) =>
    tariffMap[cupsCode ?? '']?.price ??
    tariffMap[cupsCode?.trim().toUpperCase() ?? '']?.price ??
    resolveTariffUnitPrice(cupsCode)

  const diagnosisPreview = useMemo(
    () =>
      previewDiagnosisTreatmentImports(
        diagnoses,
        treatmentPlan,
        diagnosticChart?.entries ?? [],
      ),
    [diagnoses, treatmentPlan, diagnosticChart],
  )

  const unifiedRows = useMemo(
    () => resolveUnifiedTreatmentBudgetRows(treatmentPlan, budgetItems),
    [treatmentPlan, budgetItems],
  )

  const tariffSearchResults = useMemo(() => {
    const query = procedureSearch.trim().toLowerCase()
    if (!query) return []
    return Object.values(tariffMap)
      .filter(
        (item) =>
          item.isActive &&
          (item.code.toLowerCase().includes(query) || item.name.toLowerCase().includes(query)),
      )
      .slice(0, 15)
  }, [tariffMap, procedureSearch])

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
      searchGeneralDentistryCups(cupsQuery, [
        ...COMMON_DENTAL_PROCEDURES.map((item) => ({
          procedure: item.procedure,
          cupsCode: item.cupsCode,
        })),
        ...(prices ?? []).map((price) => ({ procedure: price.procedure, cupsCode: price.cupsCode })),
      ]),
    [cupsQuery, prices],
  )

  const total = sumTreatmentPlanPrices(unifiedRows.map((row) => row.view))

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

  const addFromTariff = (code: string) => {
    const tariff = tariffMap[code]
    if (!tariff) return
    const item: TreatmentPlanItem = {
      id: generateId(),
      phase: DEFAULT_TREATMENT_PHASE,
      procedure: tariff.name,
      cupsCode: tariff.code,
      quantity: getDefaultQuantityForCups(tariff.code),
      unitPrice: tariff.price > 0 ? tariff.price : 0,
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
      source: 'manual',
    }
    emit([...treatmentPlan, item])
    setProcedureSearch('')
  }

  const importFromDiagnoses = () => {
    emit(
      importDiagnosesToTreatmentPlan(diagnoses, treatmentPlan, diagnosticChart?.entries ?? []),
    )
  }

  const importFromAnnexes = () => {
    const plan = collapseTreatmentPlanByProcedure(treatmentPlan)
    const fresh = previewAnnexTreatmentImports(specializedAnnexes, plan)
    if (fresh.length === 0) {
      const stored = previewAnnexTreatmentImports(specializedAnnexes, [])
      showToast(
        stored.length === 0
          ? 'No se encontraron planes de tratamiento en los anexos'
          : 'Los procedimientos de los anexos ya están en el plan de tratamiento',
      )
      if (plan.length !== treatmentPlan.length) emit(plan)
      return
    }
    const priced = applyAnnexCatalogPrices(fresh, catalogUnitPrice)
    setAnnexChoices(priced)
    setSelectedAnnexIds(priced.map((item) => item.id))
    setAnnexPickerOpen(true)
  }

  const toggleAnnexChoice = (id: string) => {
    setSelectedAnnexIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  const confirmAnnexImport = () => {
    const chosen = annexChoices.filter((item) => selectedAnnexIds.includes(item.id))
    if (chosen.length === 0) {
      showToast('Seleccione al menos un procedimiento para importar')
      return
    }
    emit(mergeAnnexImportsIntoTreatmentPlan(treatmentPlan, chosen))
    setAnnexPickerOpen(false)
  }

  const updateTreatmentItem = (id: string, patch: Partial<TreatmentPlanItem>) => {
    emit(treatmentPlan.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const updateUnifiedRow = (
    kind: 'plan' | 'budget_orphan',
    rowId: string,
    patch: Partial<TreatmentPlanItem>,
  ) => {
    if (kind === 'plan') {
      updateTreatmentItem(rowId, patch)
      return
    }
    if (!onBudgetItemsChange) return
    onBudgetItemsChange(patchBudgetOrphanLine(budgetItems, rowId, patch))
  }

  const removeUnifiedRow = (kind: 'plan' | 'budget_orphan', rowId: string) => {
    if (kind === 'plan') {
      emit(treatmentPlan.filter((item) => item.id !== rowId))
      return
    }
    if (!onBudgetItemsChange) return
    onBudgetItemsChange(budgetItems.filter((item) => item.id !== rowId))
  }

  const focusRow = (id: string) => {
    document.getElementById(`plan-zone-${id}`)?.focus()
  }

  const closeMenuSoon = (id: string, field: 'cie' | 'cups') => {
    window.setTimeout(() => {
      setOpenMenu((current) => (current?.id === id && current.field === field ? null : current))
    }, 120)
  }

  const syncBadge =
    cloudSyncStatus === 'syncing' ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
        <span
          className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent"
          aria-hidden
        />
        Sincronizando...
      </span>
    ) : cloudSyncStatus === 'saved' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        Guardado en la nube ✓
      </span>
    ) : cloudSyncStatus === 'pending_offline' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
        Pendiente de sincronizar (Sin red)
      </span>
    ) : cloudSyncStatus === 'conflict' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
        Conflicto de versión — recargue
      </span>
    ) : cloudSyncStatus === 'error' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
        Error al guardar
      </span>
    ) : null

  return (
    <section className="card">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <h3 className={CLINICAL_SECTION_TITLE_CLASS}>
          {clinicalSectionTitle(
            CLINICAL_HISTORY_SECTION_NUMBERS.tratamiento,
            'Plan de Tratamiento y Presupuesto',
          )}{' '}
          <span className="text-red-500">*</span>
        </h3>
        {syncBadge}
      </div>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        Autocarga el precio desde Mis Precios y Procedimientos al seleccionar un tratamiento. El
        precio unitario en cada fila puede ajustarse para esta atención sin modificar el catálogo
        global.
      </p>

      {!disabled && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={importFromDiagnoses}
            disabled={diagnosisPreview.length === 0}
            className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Importar diagnósticos
          </button>
          <button type="button" onClick={importFromAnnexes} className="btn-secondary text-xs">
            Importar desde anexos
          </button>
          {onOrthodonticsAnnexChange && !orthodonticBlockVisible ? (
            <button
              type="button"
              onClick={() => setShowOrthodonticBlock(true)}
              className="btn-secondary text-xs"
              aria-label="Añadir Presupuesto de Ortodoncia"
              title="Añadir Presupuesto de Ortodoncia (plan y calculadora del anexo)"
            >
              + Plan / Presupuesto de Ortodoncia
            </button>
          ) : null}
          <button type="button" onClick={addTreatmentItem} className="btn-primary text-xs">
            Agregar Nuevo Procedimiento
          </button>
        </div>
      )}

      {orthodonticBlockVisible && orthodontics && onOrthodonticsAnnexChange ? (
        <div id="clinical-orthodontics-budget-box" className="mb-4">
          <OrthodonticTreatmentPlanAndBudget
            mode="full"
            treatmentType={orthodontics.treatmentType}
            conventionalBracketType={orthodontics.conventionalBracketType}
            alignerTreatmentMode={orthodontics.alignerTreatmentMode}
            alignerPhaseCount={orthodontics.alignerPhaseCount}
            maxillaryOrthopedicsAppliance={orthodontics.maxillaryOrthopedicsAppliance}
            treatmentDurationMonths={orthodontics.treatmentDurationMonths}
            orthodonticBudget={orthodontics.orthodonticBudget}
            onTreatmentPlanChange={(patch) => onOrthodonticsAnnexChange(patch)}
            onBudgetChange={(orthodonticBudget) => onOrthodonticsAnnexChange({ orthodonticBudget })}
            disabled={disabled}
          />
        </div>
      ) : null}

      {!disabled && (
        <div className="mb-4 space-y-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/40">
          <FieldVoiceHeader
            label="Autocarga desde tarifario (CUPS / personalizados)"
            targetInputId="unified-plan-budget-tariff-search"
            labelClassName="text-xs font-medium text-slate-600 dark:text-slate-300"
            getValue={() => procedureSearch}
            onValueChange={setProcedureSearch}
          />
          <input
            id="unified-plan-budget-tariff-search"
            type="search"
            value={procedureSearch}
            onChange={(event) => setProcedureSearch(event.target.value)}
            placeholder="Código CUPS o descripción..."
            className="input-field"
          />
          {procedureSearch && (
            <ul className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
              {tariffSearchResults.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">
                  Sin coincidencias — puede agregar manualmente con precio 0.
                </li>
              ) : (
                tariffSearchResults.map((tariff) => (
                  <li key={tariff.code}>
                    <button
                      type="button"
                      onClick={() => addFromTariff(tariff.code)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <span className="truncate">
                        {tariff.name}
                        <span className="ml-2 font-mono text-xs text-slate-400">
                          {formatCupsCodeDotted(tariff.code)}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-dental-700">
                        {formatCurrency(tariff.price)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">Diente / Zona</th>
              <th className="px-2 py-2">Diagnóstico CIE-10</th>
              <th className="px-2 py-2">Procedimiento / CUPS</th>
              <th className="w-40 px-2 py-2 text-right">Precio unitario (Editable por atención)</th>
              <th className="w-28 px-2 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {unifiedRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-sm text-slate-400">
                  —
                </td>
              </tr>
            ) : (
              unifiedRows.map((row) => {
                const item = row.view
                const cieOpen = openMenu?.id === row.rowId && openMenu.field === 'cie'
                const cupsOpen = openMenu?.id === row.rowId && openMenu.field === 'cups'
                return (
                  <tr key={`${row.kind}-${row.rowId}`} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-1.5">
                      <input
                        id={`plan-zone-${row.rowId}`}
                        list="plan-zone-presets"
                        disabled={disabled}
                        value={formatAnatomicalZone(item)}
                        onChange={(event) =>
                          updateUnifiedRow(row.kind, row.rowId, parseAnatomicalZone(event.target.value))
                        }
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
                          setOpenMenu({ id: row.rowId, field: 'cie', query: formatCieLabel(item) })
                        }}
                        onBlur={() => closeMenuSoon(row.rowId, 'cie')}
                        onChange={(event) => {
                          const query = event.target.value
                          setOpenMenu({ id: row.rowId, field: 'cie', query })
                          updateUnifiedRow(row.kind, row.rowId, parseCieLabel(query))
                        }}
                        placeholder="CIE-10"
                        className="input-field h-8 px-2 text-sm"
                        aria-label="Diagnóstico CIE-10"
                        autoComplete="off"
                      />
                      {cieOpen && (
                        <ul className="absolute z-20 mt-1 max-h-40 w-[min(20rem,70vw)] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-md">
                          {cieOptions.length === 0 ? (
                            <li className="px-2 py-1.5 text-xs text-slate-400">—</li>
                          ) : (
                            cieOptions.map((option) => (
                              <li key={`${row.rowId}-${option.code}`}>
                                <button
                                  type="button"
                                  className="flex w-full gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    updateUnifiedRow(row.kind, row.rowId, {
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
                          setOpenMenu({ id: row.rowId, field: 'cups', query: item.procedure })
                        }}
                        onBlur={() => closeMenuSoon(row.rowId, 'cups')}
                        onChange={(event) => {
                          const query = event.target.value
                          setOpenMenu({ id: row.rowId, field: 'cups', query })
                          updateUnifiedRow(row.kind, row.rowId, { procedure: query })
                        }}
                        placeholder="CUPS .03"
                        title={item.procedure || undefined}
                        className="input-field h-8 px-2 pr-24 text-sm"
                        aria-label="Procedimiento / CUPS"
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
                              <li key={`${row.rowId}-${option.cupsCode}-${option.procedure}`}>
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    const price = catalogUnitPrice(option.cupsCode)
                                    updateUnifiedRow(row.kind, row.rowId, {
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
                        onCommit={(unitPrice) =>
                          updateUnifiedRow(row.kind, row.rowId, { unitPrice })
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {!disabled && (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => focusRow(row.rowId)}
                            className="text-xs font-medium text-dental-700 hover:text-dental-800"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => removeUnifiedRow(row.kind, row.rowId)}
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
              <td
                colSpan={3}
                className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
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

      {annexPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="annex-import-title"
            className="flex max-h-[min(36rem,90vh)] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <h4 id="annex-import-title" className="text-base font-semibold text-slate-900">
                Importar desde anexos
              </h4>
              <p className="mt-1 text-sm text-slate-600">
                Elija los procedimientos del paciente que desea agregar al plan. El valor total se
                recalcula al insertarlos.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="w-8 py-2">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos"
                        checked={
                          selectedAnnexIds.length === annexChoices.length && annexChoices.length > 0
                        }
                        onChange={() =>
                          setSelectedAnnexIds(
                            selectedAnnexIds.length === annexChoices.length
                              ? []
                              : annexChoices.map((item) => item.id),
                          )
                        }
                      />
                    </th>
                    <th className="px-2 py-2">Diente / Zona</th>
                    <th className="px-2 py-2">Diagnóstico CIE</th>
                    <th className="px-2 py-2">Procedimiento</th>
                    <th className="px-2 py-2 text-right">Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {annexChoices.map((item) => {
                    const checked = selectedAnnexIds.includes(item.id)
                    const source = item.source ? ANNEX_SOURCE_LABEL[item.source] : ''
                    return (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="py-2">
                          <input
                            type="checkbox"
                            aria-label={`Importar ${item.procedure}`}
                            checked={checked}
                            onChange={() => toggleAnnexChoice(item.id)}
                          />
                        </td>
                        <td className="px-2 py-2">{formatAnatomicalZone(item) || '—'}</td>
                        <td className="px-2 py-2">{formatCieLabel(item) || '—'}</td>
                        <td className="px-2 py-2">
                          <span className="block">{item.procedure}</span>
                          {source && <span className="text-xs text-slate-400">{source}</span>}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatCurrency(item.unitPrice || 0)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setAnnexPickerOpen(false)} className="btn-secondary">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmAnnexImport}
                disabled={selectedAnnexIds.length === 0}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Importar seleccionados
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toastMessage} onDismiss={clearToast} />
    </section>
  )
}

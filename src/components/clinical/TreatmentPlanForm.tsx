import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import type { Cie10Diagnosis, TreatmentPlanItem } from '@/types/clinicalRecord'
import type { OdontogramData } from '@/types/odontogram'
import { COMMON_DENTAL_PROCEDURES } from '@/constants/dental'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { useCatalogMeta, useCatalogSearch } from '@/hooks/useCatalogSearch'
import { useTariffSync } from '@/modules/tariff/useTariffSync'
import { useTariffStore } from '@/store/useTariffStore'
import { VoiceDictationButton, FieldVoiceHeader } from '@/components/voice'
import { formatCurrency, generateId } from '@/utils'
import { parseDictatedNumber } from '@/utils/voiceDictation'
import {
  mergeSuggestedTreatments,
  suggestTreatmentFromOdontogram,
} from '@/utils/odontogramTreatmentPlan'
import { importDiagnosesToTreatmentPlan } from '@/utils/treatmentPlanDiagnosisImport'
import { resolveTariffUnitPrice } from '@/utils/tariffLookup'
import {
  getDefaultQuantityForCups,
  normalizeQuantityForCups,
} from '@/utils/cupsBillingRules'
import { CupsQuantityBillingField } from '@/components/billing/CupsQuantityBillingField'
import { CupsAnatomicalLocationField } from '@/components/billing/CupsAnatomicalLocationField'

interface ProcedureOption {
  procedure: string
  cupsCode: string
}

interface TreatmentPlanFormProps {
  treatmentPlan: TreatmentPlanItem[]
  treatmentPlanNotes?: string
  diagnoses?: Cie10Diagnosis[]
  odontogram?: OdontogramData | null
  affectedTeeth?: number[]
  budgetLinkedItemIds?: string[]
  disabled?: boolean
  onChange: (patch: { treatmentPlan: TreatmentPlanItem[]; treatmentPlanNotes?: string }) => void
  onMoveToBudget?: (itemId: string) => void
}

const DEFAULT_TREATMENT_PHASE = 'fase_ii' as const

export function TreatmentPlanForm({
  treatmentPlan,
  treatmentPlanNotes = '',
  diagnoses = [],
  odontogram,
  affectedTeeth = [],
  budgetLinkedItemIds = [],
  disabled = false,
  onChange,
  onMoveToBudget,
}: TreatmentPlanFormProps) {
  const [procedureSearch, setProcedureSearch] = useState('')
  const [rowProcedureSearch, setRowProcedureSearch] = useState<Record<string, string>>({})
  const budgetLinkedIds = useMemo(() => new Set(budgetLinkedItemIds), [budgetLinkedItemIds])

  const catalogSearchQuery = useMemo(() => {
    const candidates = [procedureSearch, ...Object.values(rowProcedureSearch)].filter(Boolean)
    if (candidates.length === 0) return ''
    return candidates.sort((a, b) => b.length - a.length)[0]
  }, [procedureSearch, rowProcedureSearch])

  const cupsCatalog = useCatalogSearch('cups', catalogSearchQuery, 40)
  const cupsMeta = useCatalogMeta('cups')

  const { user } = useAuth()
  useTariffSync(user?.id)
  const tariffMap = useTariffStore((state) => state.tariffMap)
  const prices = useLiveQuery(
    () => (user?.id ? db.prices.where('userId').equals(user.id).toArray() : []),
    [user?.id],
  )

  const procedureOptions = useMemo(() => {
    const map = new Map<string, ProcedureOption>()

    for (const item of COMMON_DENTAL_PROCEDURES) {
      map.set(`${item.procedure}|${item.cupsCode}`, item)
    }

    for (const price of prices ?? []) {
      map.set(`${price.procedure}|${price.cupsCode}`, {
        procedure: price.procedure,
        cupsCode: price.cupsCode,
      })
    }

    for (const item of cupsCatalog ?? []) {
      map.set(`${item.description}|${item.code}`, {
        procedure: item.description,
        cupsCode: item.code,
      })
    }

    return [...map.values()]
  }, [prices, cupsCatalog])

  const filterProcedureOptions = (query: string, limit = 12) => {
    const q = query.trim().toLowerCase()
    if (!q) return procedureOptions.slice(0, limit)
    return procedureOptions
      .filter(
        (option) =>
          option.procedure.toLowerCase().includes(q) || option.cupsCode.toLowerCase().includes(q),
      )
      .slice(0, limit)
  }

  const filteredProcedures = useMemo(
    () => filterProcedureOptions(procedureSearch),
    [procedureOptions, procedureSearch],
  )

  const emit = (plan: TreatmentPlanItem[], notes = treatmentPlanNotes) => {
    onChange({ treatmentPlan: plan, treatmentPlanNotes: notes })
  }

  const catalogUnitPrice = (cupsCode?: string) =>
    tariffMap[cupsCode ?? '']?.price ??
    tariffMap[cupsCode?.trim().toUpperCase() ?? '']?.price ??
    resolveTariffUnitPrice(cupsCode)

  const withCatalogPrice = (
    values: Pick<TreatmentPlanItem, 'cupsCode' | 'unitPrice'> & Partial<TreatmentPlanItem>,
    force = false,
  ): Partial<TreatmentPlanItem> => {
    if (!values.cupsCode?.trim()) return values
    if (!force && (values.unitPrice ?? 0) > 0) return values
    const price = catalogUnitPrice(values.cupsCode)
    return price > 0 ? { ...values, unitPrice: price } : values
  }

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

  const addFromCatalog = (option: ProcedureOption) => {
    const item: TreatmentPlanItem = {
      id: generateId(),
      phase: DEFAULT_TREATMENT_PHASE,
      procedure: option.procedure,
      cupsCode: option.cupsCode,
      quantity: getDefaultQuantityForCups(option.cupsCode),
      unitPrice: catalogUnitPrice(option.cupsCode),
      patientApproved: 'pendiente',
      executionStatus: 'pendiente',
      source: 'manual',
    }
    emit([...treatmentPlan, item])
    setProcedureSearch('')
  }

  const suggestFromOdontogram = () => {
    if (!odontogram) return
    const suggested = suggestTreatmentFromOdontogram(odontogram).map((item) => ({
      ...item,
      unitPrice: catalogUnitPrice(item.cupsCode) || item.unitPrice,
    }))
    emit(mergeSuggestedTreatments(treatmentPlan, suggested))
  }

  const importFromDiagnoses = () => {
    if (diagnoses.length === 0) return
    emit(importDiagnosesToTreatmentPlan(diagnoses, treatmentPlan))
  }

  const pendingDiagnosisImportCount = diagnoses.filter(
    (diagnosis) => !treatmentPlan.some((item) => item.diagnosisCode === diagnosis.code),
  ).length

  const updateTreatmentItem = (id: string, patch: Partial<TreatmentPlanItem>) => {
    emit(
      treatmentPlan.map((item) => {
        if (item.id !== id) return item
        const next = { ...item, ...patch }
        const cupsCode = patch.cupsCode ?? item.cupsCode
        if (patch.cupsCode !== undefined || patch.quantity !== undefined) {
          next.quantity = normalizeQuantityForCups(
            cupsCode,
            patch.quantity ?? item.quantity,
          )
        }
        if (patch.cupsCode !== undefined) {
          Object.assign(next, withCatalogPrice(next, true))
        }
        return next
      }),
    )
  }

  const removeTreatmentItem = (id: string) => {
    emit(treatmentPlan.filter((item) => item.id !== id))
  }

  const applyProcedureOption = (itemId: string, option: ProcedureOption) => {
    updateTreatmentItem(itemId, {
      procedure: option.procedure,
      cupsCode: option.cupsCode,
      quantity: getDefaultQuantityForCups(option.cupsCode),
      unitPrice: catalogUnitPrice(option.cupsCode),
    })
    setRowProcedureSearch((current) => ({ ...current, [itemId]: '' }))
  }

  const toothOptions = useMemo(() => {
    const fromDiagnoses = diagnoses.flatMap((diagnosis) => diagnosis.affectedTeeth ?? [])
    const fromOdontogram = odontogram?.teeth.map((t) => t.number) ?? []
    return [...new Set([...affectedTeeth, ...fromDiagnoses, ...fromOdontogram])].sort(
      (a, b) => a - b,
    )
  }, [affectedTeeth, diagnoses, odontogram])

  const diagnosisLinkedItems = treatmentPlan.filter((item) => item.diagnosisCode)
  const otherItems = treatmentPlan.filter((item) => !item.diagnosisCode)

  const renderProcedureFields = (item: TreatmentPlanItem) => {
    const searchValue = rowProcedureSearch[item.id] ?? item.procedure
    const options = filterProcedureOptions(searchValue || item.procedure)

    return (
      <div className="grid gap-2 sm:grid-cols-12">
        <div className="sm:col-span-7">
          <FieldVoiceHeader
            label="Procedimiento"
            targetInputId={`plan-proc-${item.id}`}
            disabled={disabled}
            labelClassName="text-[10px] text-slate-500"
            className="mb-0.5 flex items-center justify-between gap-2"
            getValue={() => item.procedure}
            onValueChange={(procedure) => {
              updateTreatmentItem(item.id, { procedure })
              setRowProcedureSearch((current) => ({ ...current, [item.id]: procedure }))
            }}
          />
          <input
            id={`plan-proc-${item.id}`}
            disabled={disabled}
            value={item.procedure}
            onChange={(event) => {
              updateTreatmentItem(item.id, { procedure: event.target.value })
              setRowProcedureSearch((current) => ({
                ...current,
                [item.id]: event.target.value,
              }))
            }}
            placeholder="Buscar CUPS o escribir manualmente..."
            className="input-field text-sm"
          />
          {!disabled && searchValue.trim() && (
            <ul className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              {options.length === 0 ? (
                <li className="px-3 py-2 text-xs text-slate-500">
                  Sin coincidencias — puede dejar el texto manual.
                </li>
              ) : (
                options.map((option) => (
                  <li key={`${item.id}-${option.procedure}-${option.cupsCode}`}>
                    <button
                      type="button"
                      onClick={() => applyProcedureOption(item.id, option)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
                    >
                      <span>
                        {option.procedure}
                        <span className="ml-2 font-mono text-slate-500">{option.cupsCode}</span>
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
        </div>
        <div className="sm:col-span-5">
          <FieldVoiceHeader
            label="Código CUPS"
            targetInputId={`plan-cups-${item.id}`}
            disabled={disabled}
            labelClassName="text-[10px] text-slate-500"
            className="mb-0.5 flex items-center justify-between gap-2"
            getValue={() => item.cupsCode ?? ''}
            onValueChange={(cupsCode) => updateTreatmentItem(item.id, { cupsCode })}
          />
          <input
            id={`plan-cups-${item.id}`}
            disabled={disabled}
            value={item.cupsCode ?? ''}
            onChange={(event) => updateTreatmentItem(item.id, { cupsCode: event.target.value })}
            onBlur={(event) => {
              const code = event.target.value.trim()
              if (!code || item.unitPrice > 0) return
              const price = catalogUnitPrice(code)
              if (price > 0) {
                updateTreatmentItem(item.id, { unitPrice: price })
              }
            }}
            placeholder="Manual o desde catálogo"
            className="input-field font-mono text-sm"
          />
        </div>
      </div>
    )
  }

  const renderUnitPriceField = (item: TreatmentPlanItem) => (
    <div>
      <FieldVoiceHeader
        label="Precio unit. (COP)"
        targetInputId={`plan-price-${item.id}`}
        disabled={disabled}
        labelClassName="text-[10px] text-slate-500"
        className="mb-0.5 flex items-center justify-between gap-2"
        getValue={() => String(item.unitPrice || '')}
        onValueChange={(text) => {
          const parsed = parseDictatedNumber(text)
          if (parsed != null) {
            updateTreatmentItem(item.id, { unitPrice: Math.max(0, Math.round(parsed)) })
          }
        }}
      />
      <input
        id={`plan-price-${item.id}`}
        type="number"
        min={0}
        step={1000}
        disabled={disabled}
        value={item.unitPrice}
        onChange={(event) =>
          updateTreatmentItem(item.id, { unitPrice: Math.max(0, Number(event.target.value)) })
        }
        className="input-field text-sm"
        title="Precio de esta atención (no modifica el tarifario global)"
      />
      {item.cupsCode && catalogUnitPrice(item.cupsCode) > 0 && item.unitPrice !== catalogUnitPrice(item.cupsCode) && (
        <p className="mt-0.5 text-[10px] text-slate-500">
          Tarifario: {formatCurrency(catalogUnitPrice(item.cupsCode))}
        </p>
      )}
    </div>
  )

  const renderItemActions = (item: TreatmentPlanItem, removeLabel: 'Quitar' | 'Eliminar') => {
    const isInBudget = budgetLinkedIds.has(item.id)
    const canMove = Boolean(item.procedure.trim()) && !isInBudget

    return (
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        {!disabled && onMoveToBudget && (
          <button
            type="button"
            onClick={() => onMoveToBudget(item.id)}
            disabled={!canMove}
            className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
            title={
              isInBudget
                ? 'Ya está en el presupuesto'
                : !item.procedure.trim()
                  ? 'Indique el procedimiento primero'
                  : 'Agregar este procedimiento al presupuesto'
            }
          >
            {isInBudget ? 'En presupuesto' : 'Pasar a Presupuesto'}
          </button>
        )}
        {!disabled && (
          <button
            type="button"
            onClick={() => removeTreatmentItem(item.id)}
            className="text-sm text-red-500 hover:text-red-700"
          >
            {removeLabel}
          </button>
        )}
      </div>
    )
  }

  const renderDiagnosisLinkedItem = (item: TreatmentPlanItem) => (
    <div
      key={item.id}
      className="rounded-lg border border-dental-200 bg-dental-50/40 p-3"
    >
      <div className="grid gap-3 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Diagnóstico CIE-10
          </p>
          <p className="mt-1 text-sm font-medium text-slate-800">
            <span className="font-mono text-dental-700">{item.diagnosisCode}</span>
            {' — '}
            {item.diagnosisDescription}
          </p>
          {(item.toothNumber || item.notes) && (
            <p className="mt-1 text-xs text-slate-600">
              {item.toothNumber ? `Pieza FDI ${item.toothNumber}` : ''}
              {item.toothNumber && item.notes ? ' · ' : ''}
              {item.notes ?? ''}
            </p>
          )}
        </div>
        <div className="lg:col-span-7">
          {renderProcedureFields(item)}
          <div className="mt-3 grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-4">{renderUnitPriceField(item)}</div>
          </div>
          <div className="mt-2">
            <FieldVoiceHeader
              label="Notas del procedimiento"
              targetInputId={`tx-notes-${item.id}`}
              disabled={disabled}
              labelClassName="text-[10px] text-slate-500"
              className="mb-0.5 flex items-center justify-between gap-2"
              getValue={() => item.notes ?? ''}
              onValueChange={(notes) => updateTreatmentItem(item.id, { notes })}
            />
            <input
              id={`tx-notes-${item.id}`}
              disabled={disabled}
              value={item.notes ?? ''}
              onChange={(event) => updateTreatmentItem(item.id, { notes: event.target.value })}
              placeholder="Indicaciones, alternativas, observaciones..."
              className="input-field text-sm"
            />
          </div>
        </div>
      </div>

      {renderItemActions(item, 'Quitar')}
    </div>
  )

  const renderStandardItem = (item: TreatmentPlanItem) => (
    <div key={item.id} className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {item.source === 'sugerencia' && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            Sugerencia
          </span>
        )}
      </div>

      {renderProcedureFields(item)}

      <div className="mt-3 grid gap-3 sm:grid-cols-12">
        <div className="sm:col-span-2">
          <CupsQuantityBillingField
            cupsCode={item.cupsCode}
            quantity={item.quantity}
            unitPrice={item.unitPrice}
            disabled={disabled}
            inputId={`plan-qty-${item.id}`}
            onQuantityChange={(quantity) => updateTreatmentItem(item.id, { quantity })}
          />
        </div>
        <div className="sm:col-span-2">{renderUnitPriceField(item)}</div>
        <div className="sm:col-span-2">
          <label className="mb-0.5 block text-[10px] text-slate-500">Aprobación</label>
          <select
            disabled={disabled}
            value={item.patientApproved}
            onChange={(event) =>
              updateTreatmentItem(item.id, {
                patientApproved: event.target.value as TreatmentPlanItem['patientApproved'],
              })
            }
            className="input-field text-xs"
          >
            <option value="pendiente">Pendiente</option>
            <option value="aprobado">Aprobado</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-0.5 block text-[10px] text-slate-500">Ejecución</label>
          <select
            disabled={disabled}
            value={item.executionStatus}
            onChange={(event) =>
              updateTreatmentItem(item.id, {
                executionStatus: event.target.value as TreatmentPlanItem['executionStatus'],
              })
            }
            className="input-field text-xs"
          >
            <option value="pendiente">Pendiente</option>
            <option value="en_progreso">En progreso</option>
            <option value="completado">Completado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <CupsAnatomicalLocationField
            cupsCode={item.cupsCode}
            toothNumber={item.toothNumber}
            fdiQuadrant={item.fdiQuadrant}
            arch={item.arch}
            disabled={disabled}
            onToothNumberChange={(toothNumber) => updateTreatmentItem(item.id, { toothNumber })}
            onFdiQuadrantChange={(fdiQuadrant) => updateTreatmentItem(item.id, { fdiQuadrant })}
            onArchChange={(arch) => updateTreatmentItem(item.id, { arch })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-0.5 block text-[10px] text-slate-500">Fecha de sesión</label>
          <input
            type="date"
            disabled={disabled}
            value={item.sessionDate ?? ''}
            onChange={(event) =>
              updateTreatmentItem(item.id, { sessionDate: event.target.value || undefined })
            }
            className="input-field"
          />
        </div>
      </div>

      <div className="mt-2">
        <div className="mb-0.5 flex items-center justify-between gap-2">
          <label className="block text-[10px] text-slate-500">Notas del procedimiento</label>
          {!disabled && (
            <VoiceDictationButton
              targetInputId={`tx-notes-${item.id}`}
              getValue={() => item.notes ?? ''}
              onValueChange={(notes) => updateTreatmentItem(item.id, { notes })}
            />
          )}
        </div>
        <input
          id={`tx-notes-${item.id}`}
          disabled={disabled}
          value={item.notes ?? ''}
          onChange={(event) => updateTreatmentItem(item.id, { notes: event.target.value })}
          placeholder="Indicaciones, alternativas, observaciones..."
          className="input-field text-sm"
        />
      </div>

      {renderItemActions(item, 'Eliminar')}
    </div>
  )

  return (
    <section className="card">
      <h3 className={`mb-2 ${CLINICAL_SECTION_TITLE_CLASS}`}>
        {clinicalSectionTitle(
          CLINICAL_HISTORY_SECTION_NUMBERS.tratamiento,
          'Plan de Tratamiento',
        )}{' '}
        <span className="text-red-500">*</span>
      </h3>
      <p className="mb-4 text-xs text-slate-500">
        Defina el plan clínico según su criterio. Al seleccionar un procedimiento se autocarga el
        precio del tarifario; puede ajustarlo para esta atención sin modificar Mis Precios y
        Procedimientos.
      </p>

      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="label-field mb-0">Objetivos y criterio clínico del plan</label>
          {!disabled && (
            <VoiceDictationButton
              targetInputId="treatment-plan-notes"
              getValue={() => treatmentPlanNotes}
              onValueChange={(notes) => emit(treatmentPlan, notes)}
            />
          )}
        </div>
        <textarea
          id="treatment-plan-notes"
          rows={3}
          disabled={disabled}
          value={treatmentPlanNotes}
          onChange={(e) => emit(treatmentPlan, e.target.value)}
          placeholder="Ej.: priorizar control de enfermedad periodontal antes de rehabilitación..."
          className="input-field resize-y text-sm"
        />
      </div>

      {!disabled && (
        <div className="mb-4 space-y-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={() => addTreatmentItem()}
              className="btn-secondary text-xs"
            >
              + Procedimiento en blanco
            </button>
            <button
              type="button"
              onClick={importFromDiagnoses}
              disabled={diagnoses.length === 0 || pendingDiagnosisImportCount === 0}
              className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
              title={
                diagnoses.length === 0
                  ? 'Registre diagnósticos CIE-10 en la sección 4'
                  : pendingDiagnosisImportCount === 0
                    ? 'Todos los diagnósticos ya están en el plan'
                    : undefined
              }
            >
              Importar diagnósticos CIE-10
              {pendingDiagnosisImportCount > 0 ? ` (${pendingDiagnosisImportCount})` : ''}
            </button>
            {odontogram && (
              <button
                type="button"
                onClick={suggestFromOdontogram}
                className="btn-secondary text-xs"
              >
                Sugerir desde odontograma
              </button>
            )}
          </div>

          <div>
            <FieldVoiceHeader
              label={
                <>
                  Buscar en catálogo CUPS
                  {cupsMeta && (
                    <span className="ml-1 text-dental-600">
                      v{cupsMeta.version} ({cupsMeta.recordCount} códigos)
                    </span>
                  )}
                  {' '}/ mis precios
                </>
              }
              targetInputId="plan-catalog-search"
              disabled={disabled}
              labelClassName="text-xs text-slate-500"
              getValue={() => procedureSearch}
              onValueChange={setProcedureSearch}
            />
            <input
              id="plan-catalog-search"
              type="search"
              value={procedureSearch}
              onChange={(e) => setProcedureSearch(e.target.value)}
              placeholder="Escriba procedimiento o código CUPS..."
              className="input-field"
            />
            {procedureSearch && (
              <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                {filteredProcedures.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-500">Sin coincidencias</li>
                ) : (
                  filteredProcedures.map((option) => (
                    <li key={`${option.procedure}-${option.cupsCode}`}>
                      <button
                        type="button"
                        onClick={() => addFromCatalog(option)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span>
                          {option.procedure}
                          <span className="ml-2 font-mono text-xs text-slate-500">
                            {option.cupsCode}
                          </span>
                        </span>
                        {catalogUnitPrice(option.cupsCode) > 0 && (
                          <span className="shrink-0 text-xs font-medium text-dental-700">
                            {formatCurrency(catalogUnitPrice(option.cupsCode))}
                          </span>
                        )}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
      )}

      {treatmentPlan.length === 0 ? (
        <p className="text-sm text-slate-500">
          Agregue procedimientos, importe diagnósticos CIE-10 o sugerencias desde el odontograma.
        </p>
      ) : (
        <div className="space-y-4">
          {diagnosisLinkedItems.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Procedimientos por diagnóstico
              </h4>
              {diagnosisLinkedItems.map(renderDiagnosisLinkedItem)}
            </div>
          )}

          {otherItems.length > 0 && (
            <div className="space-y-3">
              {diagnosisLinkedItems.length > 0 && (
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Otros procedimientos
                </h4>
              )}
              {otherItems.map(renderStandardItem)}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

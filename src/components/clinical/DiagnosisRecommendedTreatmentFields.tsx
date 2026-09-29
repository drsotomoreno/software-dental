import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { COMMON_DENTAL_PROCEDURES } from '@/constants/dental'
import type {
  BudgetLineItem,
  Cie10Diagnosis,
  DiagnosisRecommendedTreatment,
  TreatmentPlanItem,
} from '@/types/clinicalRecord'
import { useCatalogMeta, useCatalogSearch } from '@/hooks/useCatalogSearch'
import { useTariffSync } from '@/modules/tariff/useTariffSync'
import { useTariffStore } from '@/store/useTariffStore'
import { formatCurrency, generateId } from '@/utils'
import {
  isRecommendedTreatmentInPlanAndBudget,
  procedureCodeKey,
  resolveRecommendedTreatmentUnitPrice,
} from '@/utils/diagnosisRecommendedTreatment'
import { VoiceDictationButton } from '@/components/voice'

interface ProcedureOption {
  procedure: string
  cupsCode: string
}

interface DiagnosisRecommendedTreatmentFieldsProps {
  diagnosis: Cie10Diagnosis
  treatmentPlan: TreatmentPlanItem[]
  budgetItems: BudgetLineItem[]
  disabled?: boolean
  onChange: (treatments: DiagnosisRecommendedTreatment[]) => void
  onTransfer: (recommendationId: string) => void
}

export function DiagnosisRecommendedTreatmentFields({
  diagnosis,
  treatmentPlan,
  budgetItems,
  disabled = false,
  onChange,
  onTransfer,
}: DiagnosisRecommendedTreatmentFieldsProps) {
  const [search, setSearch] = useState('')
  const recommendations = diagnosis.recommendedTreatments ?? []
  const searchId = `dx-tx-search-${diagnosis.code.replace(/[^a-zA-Z0-9_-]/g, '-')}`

  const cupsCatalog = useCatalogSearch('cups', search, 40)
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
      map.set(`${item.procedure}|${item.cupsCode}`, {
        procedure: item.procedure,
        cupsCode: item.cupsCode,
      })
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

  const filteredProcedures = useMemo(() => {
    const query = search.trim().toLowerCase()
    const matches = query
      ? procedureOptions.filter(
          (option) =>
            option.procedure.toLowerCase().includes(query) ||
            option.cupsCode.toLowerCase().includes(query),
        )
      : procedureOptions
    return matches.slice(0, 12)
  }, [procedureOptions, search])

  const unitPriceFor = (cupsCode: string) =>
    tariffMap[cupsCode]?.price ??
    tariffMap[cupsCode.trim().toUpperCase()]?.price ??
    resolveRecommendedTreatmentUnitPrice(cupsCode)

  const addRecommendation = (option: ProcedureOption) => {
    const key = procedureCodeKey(option.cupsCode)
    if (recommendations.some((item) => procedureCodeKey(item.cupsCode) === key)) {
      setSearch('')
      return
    }

    onChange([
      ...recommendations,
      {
        id: generateId(),
        procedure: option.procedure,
        cupsCode: option.cupsCode,
      },
    ])
    setSearch('')
  }

  const removeRecommendation = (id: string) => {
    onChange(recommendations.filter((item) => item.id !== id))
  }

  return (
    <div className="space-y-2 border-t border-slate-200 pt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Tratamiento recomendado
      </p>

      {recommendations.length === 0 ? (
        <p className="text-xs text-slate-500">Sin tratamiento recomendado para este diagnóstico.</p>
      ) : (
        <ul className="space-y-2">
          {recommendations.map((recommendation) => {
            const transferred = isRecommendedTreatmentInPlanAndBudget(
              diagnosis,
              recommendation,
              treatmentPlan,
              budgetItems,
            )
            const price = unitPriceFor(recommendation.cupsCode)
            return (
              <li
                key={recommendation.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 text-sm text-slate-800">
                  {recommendation.procedure}
                  <span className="ml-2 font-mono text-xs text-dental-700">
                    {recommendation.cupsCode}
                  </span>
                  {price > 0 && (
                    <span className="ml-2 text-xs text-slate-500">{formatCurrency(price)}</span>
                  )}
                </span>
                {!disabled && (
                  <>
                    <button
                      type="button"
                      onClick={() => onTransfer(recommendation.id)}
                      disabled={transferred}
                      className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-60"
                      title={
                        transferred
                          ? 'Este tratamiento ya está en el plan y en el presupuesto'
                          : 'Copiar este tratamiento al plan de tratamiento y al presupuesto'
                      }
                    >
                      {transferred ? 'En plan y presupuesto' : 'Pasar a plan y presupuesto'}
                    </button>
                    {!transferred && (
                      <button
                        type="button"
                        onClick={() => removeRecommendation(recommendation.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Quitar
                      </button>
                    )}
                  </>
                )}
                {disabled && transferred && (
                  <span className="text-xs text-dental-700">En plan y presupuesto</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!disabled && (
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-slate-600" htmlFor={searchId}>
              Buscar procedimiento
              {cupsMeta && (
                <span className="ml-1 font-normal text-slate-400">
                  CUPS v{cupsMeta.version} ({cupsMeta.recordCount}) / mis precios
                </span>
              )}
            </label>
            <VoiceDictationButton
              targetInputId={searchId}
              getValue={() => search}
              onValueChange={setSearch}
            />
          </div>
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Escriba procedimiento o código CUPS..."
            className="input-field text-sm"
          />
          {search && (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              {filteredProcedures.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">Sin coincidencias</li>
              ) : (
                filteredProcedures.map((option) => {
                  const price = unitPriceFor(option.cupsCode)
                  return (
                    <li key={`${option.procedure}-${option.cupsCode}`}>
                      <button
                        type="button"
                        onClick={() => addRecommendation(option)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span>
                          {option.procedure}
                          <span className="ml-2 font-mono text-xs text-slate-500">
                            {option.cupsCode}
                          </span>
                        </span>
                        {price > 0 && (
                          <span className="shrink-0 text-xs font-medium text-dental-700">
                            {formatCurrency(price)}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Stethoscope } from 'lucide-react'
import type { Cie10Diagnosis, DiagnosisCertainty } from '@/types/clinicalRecord'
import type { ClinicalDiagnosticChart, ClinicalDiagnosticToothEntry } from '@/types/clinicalDiagnosticChart'
import {
  getDiagnosisChartColor,
  normalizeClinicalDiagnosticChart,
} from '@/types/clinicalDiagnosticChart'
import { DIAGNOSIS_CERTAINTY_LABELS } from '@/constants/dental'
import { REHAB_ODONTOGRAM_TEETH } from '@/components/clinical/rehabilitation/rehab-odontogram/constants'
import { RehabOdontogramQuadrant } from '@/components/clinical/rehabilitation/rehab-odontogram/RehabOdontogramQuadrant'
import type { RehabTreatmentPlanEntry } from '@/components/clinical/rehabilitation/rehab-odontogram/types'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { useCatalogMeta, useCatalogSearch } from '@/hooks/useCatalogSearch'
import { VoiceDictationButton } from '@/components/voice'

function isAdditionalDiagnosis(diagnosis: Cie10Diagnosis): boolean {
  return diagnosis.source === 'manual' && !(diagnosis.affectedTeeth?.length)
}

function isQuickAssignableDiagnosis(diagnosis: Cie10Diagnosis): boolean {
  return diagnosis.source === 'manual'
}

interface DiagnosticOdontogramSectionProps {
  value: ClinicalDiagnosticChart
  diagnoses: Cie10Diagnosis[]
  onChange: (value: ClinicalDiagnosticChart) => void
  onEnsureDiagnosis?: (payload: { code: string; description: string; toothId: string }) => void
  onAddAdditionalDiagnosis?: (code: string, description: string) => void
  onUpdateDiagnosis?: (code: string, patch: Partial<Cie10Diagnosis>) => void
  onRemoveAdditionalDiagnosis?: (code: string) => void
  disabled?: boolean
}

function toVisualPlan(entries: ClinicalDiagnosticToothEntry[]): RehabTreatmentPlanEntry[] {
  return entries.map((entry) => ({
    dienteId: entry.dienteId,
    color: entry.color,
  }))
}

export function DiagnosticOdontogramSection({
  value,
  diagnoses,
  onChange,
  onEnsureDiagnosis,
  onAddAdditionalDiagnosis,
  onUpdateDiagnosis,
  onRemoveAdditionalDiagnosis,
  disabled = false,
}: DiagnosticOdontogramSectionProps) {
  const chart = normalizeClinicalDiagnosticChart(value)
  const [selectedToothId, setSelectedToothId] = useState<string | null>(null)
  const [cieSearch, setCieSearch] = useState('')
  const [additionalCieSearch, setAdditionalCieSearch] = useState('')

  const cie10Results = useCatalogSearch('cie10', cieSearch, 30)
  const additionalCie10Results = useCatalogSearch('cie10', additionalCieSearch, 30)
  const cie10Meta = useCatalogMeta('cie10')
  const filteredCie10 = cie10Results ?? []
  const filteredAdditionalCie10 = additionalCie10Results ?? []
  const additionalDiagnoses = diagnoses.filter(isAdditionalDiagnosis)
  const quickAssignableDiagnoses = diagnoses.filter(isQuickAssignableDiagnosis)

  const visualPlan = useMemo(() => toVisualPlan(chart.entries), [chart.entries])
  const selectedEntry = chart.entries.find((entry) => entry.dienteId === selectedToothId)

  const diagnosisColorMap = useMemo(() => {
    const map = new Map<string, string>()
    const codes = new Set([
      ...diagnoses.map((diagnosis) => diagnosis.code),
      ...chart.entries.map((entry) => entry.diagnosisCode),
    ])
    let index = 0
    for (const code of codes) {
      map.set(code, getDiagnosisChartColor(index))
      index += 1
    }
    return map
  }, [diagnoses, chart.entries])

  const updateChart = (patch: Partial<ClinicalDiagnosticChart>) => {
    onChange({ ...chart, ...patch })
  }

  const handleSelectTooth = (dienteId: string) => {
    if (disabled) return
    setSelectedToothId((current) => (current === dienteId ? null : dienteId))
    setCieSearch('')
  }

  const assignDiagnosisCode = (code: string, description: string) => {
    if (!selectedToothId || disabled) return

    onEnsureDiagnosis?.({ code, description, toothId: selectedToothId })

    const withoutCurrent = chart.entries.filter((entry) => entry.dienteId !== selectedToothId)
    const existing = chart.entries.find((entry) => entry.dienteId === selectedToothId)
    if (existing?.diagnosisCode === code) {
      updateChart({ entries: withoutCurrent })
      return
    }

    updateChart({
      entries: [
        ...withoutCurrent,
        {
          dienteId: selectedToothId,
          diagnosisCode: code,
          diagnosisDescription: description,
          color: diagnosisColorMap.get(code) ?? getDiagnosisChartColor(diagnosisColorMap.size),
        },
      ],
    })
    setCieSearch('')
  }

  const assignDiagnosis = (diagnosis: Cie10Diagnosis) => {
    assignDiagnosisCode(diagnosis.code, diagnosis.description)
  }

  const addAdditionalDiagnosis = (code: string, description: string) => {
    if (disabled) return
    onAddAdditionalDiagnosis?.(code, description)
    setAdditionalCieSearch('')
  }

  const clearSelectedTooth = () => {
    if (!selectedToothId || disabled) return
    updateChart({
      entries: chart.entries.filter((entry) => entry.dienteId !== selectedToothId),
    })
  }

  const clearAll = () => {
    if (disabled) return
    updateChart({ entries: [] })
    setSelectedToothId(null)
  }

  const quadrantProps = {
    selectedToothId,
    plan: visualPlan,
    disabled,
    onSelectTooth: handleSelectTooth,
  }

  const assignedDiagnoses = [...new Set(chart.entries.map((entry) => entry.diagnosisCode))]

  return (
    <section id="clinical-section-diagnosticos" className="card space-y-4">
      <div>
        <h3 className={CLINICAL_SECTION_TITLE_CLASS}>
          {clinicalSectionTitle(CLINICAL_HISTORY_SECTION_NUMBERS.diagnosticos, 'Diagnósticos')}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Esquema gráfico por pieza FDI para ubicar diagnósticos CIE-10 en la dentición.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-dental-600" aria-hidden />
            <div>
              <h4 className="text-sm font-semibold text-slate-800">Esquema de Diagnósticos por Pieza</h4>
              <p className="text-xs text-slate-500">
                32 piezas permanentes (FDI) · Vista sagital/lateral · 8 piezas por cuadrante en fila única
              </p>
            </div>
          </div>
        </header>

        <div className="space-y-5 p-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <RehabOdontogramQuadrant
              quadrantId="upperRight"
              teeth={REHAB_ODONTOGRAM_TEETH.upperRight}
              arch="upper"
              {...quadrantProps}
            />
            <RehabOdontogramQuadrant
              quadrantId="upperLeft"
              teeth={REHAB_ODONTOGRAM_TEETH.upperLeft}
              arch="upper"
              {...quadrantProps}
            />
          </div>

          <div className="flex items-center justify-center">
            <div className="h-px w-full max-w-3xl border-t-2 border-dashed border-slate-300" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <RehabOdontogramQuadrant
              quadrantId="lowerLeft"
              teeth={REHAB_ODONTOGRAM_TEETH.lowerLeft}
              arch="lower"
              {...quadrantProps}
            />
            <RehabOdontogramQuadrant
              quadrantId="lowerRight"
              teeth={REHAB_ODONTOGRAM_TEETH.lowerRight}
              arch="lower"
              {...quadrantProps}
            />
          </div>

          {assignedDiagnoses.length > 0 && (
            <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              {assignedDiagnoses.map((code) => {
                const diagnosis = diagnoses.find((item) => item.code === code)
                const color = diagnosisColorMap.get(code) ?? getDiagnosisChartColor(0)
                return (
                  <div key={code} className="flex items-center gap-2 text-xs text-slate-600">
                    <span
                      className="h-3 w-3 rounded-full border border-white shadow-sm"
                      style={{ backgroundColor: color }}
                    />
                    <span>
                      {code} — {diagnosis?.description ?? 'Diagnóstico'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <footer className="border-t border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Asignación por pieza
              </p>
              {selectedToothId ? (
                <p className="mt-1 text-sm text-slate-700">
                  Pieza seleccionada: <strong>{selectedToothId}</strong>
                  {selectedEntry && (
                    <span className="ml-2 text-slate-500">
                      — {selectedEntry.diagnosisCode} {selectedEntry.diagnosisDescription}
                    </span>
                  )}
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-500">
                  Seleccione una pieza en el esquema para asignar un diagnóstico.
                </p>
              )}

              {selectedToothId && !disabled && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-slate-600" htmlFor="diagnostic-chart-cie-search">
                      Buscar diagnóstico CIE-10
                      {cie10Meta && (
                        <span className="ml-1 font-normal text-slate-400">
                          (v{cie10Meta.version} — {cie10Meta.recordCount} códigos)
                        </span>
                      )}
                    </label>
                    <VoiceDictationButton
                      targetInputId="diagnostic-chart-cie-search"
                      getValue={() => cieSearch}
                      onValueChange={setCieSearch}
                    />
                  </div>
                  <input
                    id="diagnostic-chart-cie-search"
                    type="search"
                    placeholder="Buscar código o descripción CIE-10..."
                    value={cieSearch}
                    onChange={(e) => setCieSearch(e.target.value)}
                    className="input-field text-sm"
                  />
                  {cieSearch && (
                    <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                      {filteredCie10.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-slate-500">Sin resultados en el catálogo.</li>
                      ) : (
                        filteredCie10.map((item) => (
                          <li key={item.code}>
                            <button
                              type="button"
                              onClick={() => assignDiagnosisCode(item.code, item.description)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            >
                              <span className="font-mono font-medium text-dental-700">{item.code}</span>
                              {' — '}
                              {item.description}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              )}

              {selectedToothId && quickAssignableDiagnoses.length > 0 && !disabled && (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-medium text-slate-600">
                    Diagnósticos ya registrados en la historia
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {quickAssignableDiagnoses.map((diagnosis) => {
                      const isActive = selectedEntry?.diagnosisCode === diagnosis.code
                      const color = diagnosisColorMap.get(diagnosis.code) ?? getDiagnosisChartColor(0)
                      return (
                        <button
                          key={diagnosis.code}
                          type="button"
                          onClick={() => assignDiagnosis(diagnosis)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                            isActive
                              ? 'border-slate-300 bg-white text-slate-800 shadow-sm ring-2 ring-offset-1'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                          style={isActive ? { boxShadow: `0 0 0 2px ${color}55` } : undefined}
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full border border-white shadow-sm"
                            style={{ backgroundColor: color }}
                          />
                          {diagnosis.code}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {!disabled && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!selectedToothId}
                  onClick={clearSelectedTooth}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Limpiar pieza
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Limpiar todo
                </button>
              </div>
            )}
          </div>

          {chart.entries.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {[...chart.entries]
                .sort((a, b) => Number(a.dienteId) - Number(b.dienteId))
                .map((entry) => (
                  <span
                    key={entry.dienteId}
                    className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    Pieza {entry.dienteId}: {entry.diagnosisCode}
                  </span>
                ))}
            </div>
          )}
        </footer>
      </div>

      <div>
        <h4 className="label-field mb-1">Diagnosticos Adicionales</h4>
        <p className="mb-3 text-xs text-slate-500">
          Agregue diagnósticos CIE-10 generales mediante búsqueda abreviada por código o descripción
          {cie10Meta && (
            <span className="ml-1 text-dental-600">
              (v{cie10Meta.version} — {cie10Meta.recordCount} códigos)
            </span>
          )}
          .
        </p>

        {!disabled && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-600" htmlFor="clinical-additional-diagnosis-search">
                Buscar diagnóstico adicional CIE-10
              </label>
              <VoiceDictationButton
                targetInputId="clinical-additional-diagnosis-search"
                getValue={() => additionalCieSearch}
                onValueChange={setAdditionalCieSearch}
              />
            </div>
            <input
              id="clinical-additional-diagnosis-search"
              type="search"
              placeholder="Buscar código abreviado o descripción CIE-10..."
              value={additionalCieSearch}
              onChange={(e) => setAdditionalCieSearch(e.target.value)}
              className="input-field text-sm"
            />
            {additionalCieSearch && (
              <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                {filteredAdditionalCie10.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-500">Sin resultados en el catálogo.</li>
                ) : (
                  filteredAdditionalCie10.map((item) => (
                    <li key={item.code}>
                      <button
                        type="button"
                        onClick={() => addAdditionalDiagnosis(item.code, item.description)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="font-mono font-medium text-dental-700">{item.code}</span>
                        {' — '}
                        {item.description}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        )}

        {additionalDiagnoses.length === 0 ? (
          <p className="text-sm text-slate-500">
            Sin diagnosticos adicionales. Use la búsqueda para agregar códigos CIE-10.
          </p>
        ) : (
          <ul className="space-y-2">
            {additionalDiagnoses.map((diagnosis) => (
              <li
                key={diagnosis.code}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="font-mono font-medium text-dental-700">{diagnosis.code}</span>
                <span>— {diagnosis.description}</span>
                {!disabled ? (
                  <>
                    <select
                      value={diagnosis.type}
                      onChange={(e) =>
                        onUpdateDiagnosis?.(diagnosis.code, {
                          type: e.target.value as Cie10Diagnosis['type'],
                        })
                      }
                      className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                    >
                      <option value="principal">Principal</option>
                      <option value="relacionado">Relacionado</option>
                    </select>
                    <select
                      value={diagnosis.certainty}
                      onChange={(e) =>
                        onUpdateDiagnosis?.(diagnosis.code, {
                          certainty: e.target.value as DiagnosisCertainty,
                        })
                      }
                      className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                    >
                      {Object.entries(DIAGNOSIS_CERTAINTY_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onRemoveAdditionalDiagnosis?.(diagnosis.code)}
                      className="ml-auto text-red-500 hover:text-red-700"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <span className="rounded bg-dental-100 px-1.5 py-0.5 text-xs text-dental-700">
                      {diagnosis.type}
                    </span>
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                      {DIAGNOSIS_CERTAINTY_LABELS[diagnosis.certainty]}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

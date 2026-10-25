import { useMemo, useState } from 'react'
import { Download, Stethoscope } from 'lucide-react'
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

function formatImportNotice(added: number, updated: number): string {
  if (added === 0 && updated === 0) {
    return 'Esos diagnósticos CIE del odontograma ya estaban registrados en esta sección.'
  }
  if (added > 0 && updated > 0) {
    const addedText =
      added === 1 ? 'Se importó 1 diagnóstico CIE' : `Se importaron ${added} diagnósticos CIE`
    const updatedText =
      updated === 1
        ? 'se actualizó 1 diagnóstico ya registrado'
        : `se actualizaron ${updated} diagnósticos ya registrados`
    return `${addedText} y ${updatedText} desde el odontograma.`
  }
  if (added > 0) {
    return added === 1
      ? 'Se importó 1 diagnóstico CIE desde el odontograma.'
      : `Se importaron ${added} diagnósticos CIE desde el odontograma.`
  }
  return updated === 1
    ? 'Se actualizaron las piezas de 1 diagnóstico CIE del odontograma.'
    : `Se actualizaron las piezas de ${updated} diagnósticos CIE del odontograma.`
}

interface DiagnosticOdontogramSectionProps {
  value: ClinicalDiagnosticChart
  diagnoses: Cie10Diagnosis[]
  /** CIE-10 derivados del odontograma. El botón importa esta lista si tiene elementos. */
  odontogramCieDiagnoses?: Cie10Diagnosis[]
  onImportOdontogramDiagnoses?: () => { added: number; updated: number }
  onChange: (value: ClinicalDiagnosticChart) => void
  onEnsureDiagnosis?: (payload: { code: string; description: string; toothId: string }) => void
  onAddAdditionalDiagnosis?: (code: string, description: string) => void
  onUpdateDiagnosis?: (code: string, patch: Partial<Cie10Diagnosis>) => void
  onRemoveAdditionalDiagnosis?: (code: string) => void
  onDetachTeeth?: (toothIds: string[]) => void
  onReassignImportedCie?: (payload: {
    fromCode: string
    toCode: string
    toDescription: string
    toothNumber?: number
  }) => void
  disabled?: boolean
}

interface DiagnosisRow {
  code: string
  description: string
  diagnosis?: Cie10Diagnosis
  pieces: string[]
  color: string
}

function toVisualPlan(entries: ClinicalDiagnosticToothEntry[]): RehabTreatmentPlanEntry[] {
  return entries.map((entry) => ({
    dienteId: entry.dienteId,
    color: entry.color,
  }))
}

/** Cada pieza aparece una sola vez: el esquema manda si ya tiene otro código. */
function piecesForDiagnosis(
  code: string,
  affectedTeeth: number[] | undefined,
  entries: ClinicalDiagnosticToothEntry[],
): string[] {
  const paintedHere = entries
    .filter((entry) => entry.diagnosisCode === code)
    .map((entry) => entry.dienteId)
  const paintedElsewhere = new Set(
    entries.filter((entry) => entry.diagnosisCode !== code).map((entry) => entry.dienteId),
  )
  const fromRecord = (affectedTeeth ?? [])
    .map(String)
    .filter((toothId) => !paintedElsewhere.has(toothId))
  return [...new Set([...paintedHere, ...fromRecord])].sort((a, b) => Number(a) - Number(b))
}

function CieSearchResults({
  query,
  results,
  onSelect,
}: {
  query: string
  results: Array<{ code: string; description: string }>
  onSelect: (code: string, description: string) => void
}) {
  if (!query) return null
  return (
    <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      {results.length === 0 ? (
        <li className="px-3 py-2 text-sm text-slate-500">Sin resultados en el catálogo.</li>
      ) : (
        results.map((item) => (
          <li key={item.code}>
            <button
              type="button"
              onClick={() => onSelect(item.code, item.description)}
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
  )
}

export function DiagnosticOdontogramSection({
  value,
  diagnoses,
  odontogramCieDiagnoses = [],
  onImportOdontogramDiagnoses,
  onChange,
  onEnsureDiagnosis,
  onAddAdditionalDiagnosis,
  onUpdateDiagnosis,
  onRemoveAdditionalDiagnosis,
  onDetachTeeth,
  onReassignImportedCie,
  disabled = false,
}: DiagnosticOdontogramSectionProps) {
  const chart = normalizeClinicalDiagnosticChart(value)
  const [selectedToothId, setSelectedToothId] = useState<string | null>(null)
  const [cieSearch, setCieSearch] = useState('')
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [editQuery, setEditQuery] = useState('')
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  const cie10Results = useCatalogSearch('cie10', cieSearch, 30)
  const editResults = useCatalogSearch('cie10', editingCode ? editQuery : '', 30)
  const cie10Meta = useCatalogMeta('cie10')
  const filteredCie10 = cie10Results ?? []
  const filteredEditCie10 = editResults ?? []
  const canImportOdontogramCie = odontogramCieDiagnoses.length > 0

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

  const rows = useMemo<DiagnosisRow[]>(() => {
    const known = new Set(diagnoses.map((diagnosis) => diagnosis.code))
    const listed: DiagnosisRow[] = diagnoses.map((diagnosis) => ({
      code: diagnosis.code,
      description: diagnosis.description,
      diagnosis,
      pieces: piecesForDiagnosis(diagnosis.code, diagnosis.affectedTeeth, chart.entries),
      color: diagnosisColorMap.get(diagnosis.code) ?? getDiagnosisChartColor(0),
    }))

    const extras = new Map<string, { description: string; pieces: string[] }>()
    for (const entry of chart.entries) {
      if (known.has(entry.diagnosisCode)) continue
      const current = extras.get(entry.diagnosisCode) ?? {
        description: entry.diagnosisDescription,
        pieces: [],
      }
      current.pieces.push(entry.dienteId)
      extras.set(entry.diagnosisCode, current)
    }
    for (const [code, extra] of extras) {
      listed.push({
        code,
        description: extra.description,
        pieces: [...new Set(extra.pieces)].sort((a, b) => Number(a) - Number(b)),
        color: diagnosisColorMap.get(code) ?? getDiagnosisChartColor(0),
      })
    }
    return listed
  }, [diagnoses, chart.entries, diagnosisColorMap])

  const legendCodes = useMemo(
    () => [...new Set(chart.entries.map((entry) => entry.diagnosisCode))],
    [chart.entries],
  )

  const updateChart = (patch: Partial<ClinicalDiagnosticChart>) => {
    onChange({ ...chart, ...patch })
  }

  const handleSelectTooth = (dienteId: string) => {
    if (disabled) return
    setSelectedToothId((current) => (current === dienteId ? null : dienteId))
    setCieSearch('')
    setActionNotice(null)
  }

  const assignDiagnosisCode = (code: string, description: string) => {
    if (!selectedToothId || disabled) return

    const withoutCurrent = chart.entries.filter((entry) => entry.dienteId !== selectedToothId)
    onEnsureDiagnosis?.({ code, description, toothId: selectedToothId })
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
    setActionNotice(null)
  }

  const addGeneralDiagnosis = (code: string, description: string) => {
    if (disabled) return
    if (diagnoses.some((diagnosis) => diagnosis.code === code)) {
      setActionNotice(`${code} ya está en la lista. Seleccione una pieza del esquema para asignarlo.`)
      setCieSearch('')
      return
    }
    onAddAdditionalDiagnosis?.(code, description)
    setCieSearch('')
    setActionNotice(null)
  }

  const applySearchResult = (code: string, description: string) => {
    if (selectedToothId) {
      assignDiagnosisCode(code, description)
      return
    }
    addGeneralDiagnosis(code, description)
  }

  const clearSelectedTooth = () => {
    if (!selectedToothId || disabled) return
    updateChart({
      entries: chart.entries.filter((entry) => entry.dienteId !== selectedToothId),
    })
  }

  const removeSelectedTooth = () => {
    if (!selectedToothId || disabled) return
    onDetachTeeth?.([selectedToothId])
    clearSelectedTooth()
  }

  const clearAll = () => {
    if (disabled || chart.entries.length === 0) return
    updateChart({ entries: [] })
    setSelectedToothId(null)
  }

  const importOdontogramCie = () => {
    if (disabled || !canImportOdontogramCie || !onImportOdontogramDiagnoses) return
    const result = onImportOdontogramDiagnoses()
    setImportNotice(formatImportNotice(result.added, result.updated))
  }

  const applyCodeChange = (fromCode: string, code: string, description: string) => {
    onReassignImportedCie?.({
      fromCode,
      toCode: code,
      toDescription: description,
    })
    setEditingCode(null)
    setEditQuery('')
  }

  const quadrantProps = {
    selectedToothId,
    plan: visualPlan,
    disabled,
    onSelectTooth: handleSelectTooth,
  }

  const catalogHint = cie10Meta
    ? `(v${cie10Meta.version} — ${cie10Meta.recordCount} códigos)`
    : undefined

  return (
    <section id="clinical-section-diagnosticos" className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={CLINICAL_SECTION_TITLE_CLASS}>
            {clinicalSectionTitle(CLINICAL_HISTORY_SECTION_NUMBERS.diagnosticos, 'Diagnósticos')}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Elija una pieza en el esquema y asígnele el CIE-10. Sin pieza seleccionada, el código
            queda como diagnóstico general.
          </p>
        </div>
        {!disabled && onImportOdontogramDiagnoses && (
          <button
            type="button"
            onClick={importOdontogramCie}
            disabled={!canImportOdontogramCie}
            className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Importar diagnósticos CIE del odontograma
          </button>
        )}
      </div>

      {!disabled && onImportOdontogramDiagnoses && (
        <div className="space-y-1">
          {canImportOdontogramCie ? (
            <p className="text-xs text-slate-500">
              El odontograma tiene{' '}
              {odontogramCieDiagnoses.length === 1
                ? '1 diagnóstico CIE'
                : `${odontogramCieDiagnoses.length} diagnósticos CIE`}{' '}
              disponible{odontogramCieDiagnoses.length === 1 ? '' : 's'} para importar.
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              El odontograma no tiene diagnósticos CIE para importar.
            </p>
          )}
          {importNotice && (
            <p className="text-xs font-medium text-dental-700" role="status">
              {importNotice}
            </p>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-dental-600" aria-hidden />
            <div>
              <h4 className="text-sm font-semibold text-slate-800">Esquema de diagnósticos por pieza</h4>
              <p className="text-xs text-slate-500">
                32 piezas permanentes (FDI) · Vista sagital/lateral · 8 piezas por cuadrante
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

          {legendCodes.length > 0 && (
            <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              {legendCodes.map((code) => {
                const diagnosis = diagnoses.find((item) => item.code === code)
                const entry = chart.entries.find((item) => item.diagnosisCode === code)
                const color = diagnosisColorMap.get(code) ?? getDiagnosisChartColor(0)
                return (
                  <div key={code} className="flex items-center gap-2 text-xs text-slate-600">
                    <span
                      className="h-3 w-3 rounded-full border border-white shadow-sm"
                      style={{ backgroundColor: color }}
                    />
                    <span>
                      {code} — {diagnosis?.description ?? entry?.diagnosisDescription ?? 'Diagnóstico'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <footer className="space-y-4 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {selectedToothId ? (
                <p className="text-sm text-slate-700">
                  Pieza <strong>{selectedToothId}</strong>
                  {selectedEntry ? (
                    <span className="text-slate-500">
                      {' '}
                      — {selectedEntry.diagnosisCode} {selectedEntry.diagnosisDescription}
                    </span>
                  ) : (
                    <span className="text-slate-500"> — sin diagnóstico en el esquema</span>
                  )}
                </p>
              ) : (
                <p className="text-sm text-slate-500">
                  Seleccione una pieza para asignarle un CIE-10, o busque un código general.
                </p>
              )}

              {!disabled && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-slate-600" htmlFor="diagnostic-chart-cie-search">
                      {selectedToothId
                        ? `Asignar CIE-10 a la pieza ${selectedToothId}`
                        : 'Agregar diagnóstico general'}
                      {catalogHint && (
                        <span className="ml-1 font-normal text-slate-400">{catalogHint}</span>
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
                    onChange={(event) => {
                      setCieSearch(event.target.value)
                      setActionNotice(null)
                    }}
                    className="input-field text-sm"
                  />
                  <CieSearchResults
                    query={cieSearch}
                    results={filteredCie10}
                    onSelect={applySearchResult}
                  />
                  {actionNotice && (
                    <p className="text-xs font-medium text-dental-700" role="status">
                      {actionNotice}
                    </p>
                  )}
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
                  disabled={chart.entries.length === 0}
                  title="Quita las marcas de color del esquema. Los diagnósticos de la lista se conservan."
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Limpiar todo
                </button>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-800">Diagnósticos registrados</h4>
            {rows.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                Todavía no hay diagnósticos. Use la búsqueda o importe los del odontograma.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {rows.map((row) => {
                  const onSelectedTooth =
                    selectedToothId != null && row.pieces.includes(selectedToothId)
                  const editing = editingCode === row.code
                  return (
                    <li
                      key={row.code}
                      className={`space-y-2 rounded-lg border px-3 py-2 text-sm ${
                        onSelectedTooth
                          ? 'border-dental-300 bg-dental-50/70'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-sm"
                          style={{ backgroundColor: row.color }}
                        />
                        <span className="font-mono font-medium text-dental-700">{row.code}</span>
                        <span className="text-slate-700">— {row.description}</span>
                        {row.diagnosis && !disabled ? (
                          <>
                            <select
                              value={row.diagnosis.type}
                              onChange={(event) =>
                                onUpdateDiagnosis?.(row.code, {
                                  type: event.target.value as Cie10Diagnosis['type'],
                                })
                              }
                              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs"
                              aria-label={`Tipo de ${row.code}`}
                            >
                              <option value="principal">Principal</option>
                              <option value="relacionado">Relacionado</option>
                            </select>
                            <select
                              value={row.diagnosis.certainty}
                              onChange={(event) =>
                                onUpdateDiagnosis?.(row.code, {
                                  certainty: event.target.value as DiagnosisCertainty,
                                })
                              }
                              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs"
                              aria-label={`Certeza de ${row.code}`}
                            >
                              {Object.entries(DIAGNOSIS_CERTAINTY_LABELS).map(([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </>
                        ) : row.diagnosis ? (
                          <>
                            <span className="rounded bg-dental-100 px-1.5 py-0.5 text-xs text-dental-700">
                              {row.diagnosis.type}
                            </span>
                            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                              {DIAGNOSIS_CERTAINTY_LABELS[row.diagnosis.certainty]}
                            </span>
                          </>
                        ) : null}
                        {!disabled && selectedToothId && (
                          <button
                            type="button"
                            onClick={() => {
                              const painted =
                                selectedEntry?.dienteId === selectedToothId &&
                                selectedEntry.diagnosisCode === row.code
                              if (painted) {
                                removeSelectedTooth()
                                return
                              }
                              assignDiagnosisCode(row.code, row.description)
                            }}
                            className="rounded border border-dental-200 bg-white px-2 py-0.5 text-xs font-medium text-dental-700 hover:bg-dental-50"
                          >
                            {selectedEntry?.diagnosisCode === row.code
                              ? `Quitar de la pieza ${selectedToothId}`
                              : onSelectedTooth
                                ? 'Marcar en el esquema'
                                : `Asignar a la pieza ${selectedToothId}`}
                          </button>
                        )}
                        {!disabled && row.diagnosis && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCode((current) => (current === row.code ? null : row.code))
                              setEditQuery('')
                            }}
                            className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            aria-expanded={editing}
                          >
                            Cambiar código
                          </button>
                        )}
                        {!disabled && (
                          <button
                            type="button"
                            onClick={() => onRemoveAdditionalDiagnosis?.(row.code)}
                            className="ml-auto text-red-500 hover:text-red-700"
                            aria-label={`Quitar ${row.code}`}
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {row.pieces.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {row.pieces.map((toothId) => {
                            const selected = selectedToothId === toothId
                            return (
                              <button
                                key={toothId}
                                type="button"
                                disabled={disabled}
                                onClick={() => handleSelectTooth(toothId)}
                                aria-pressed={selected}
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                                  selected
                                    ? 'border-dental-400 bg-white text-dental-800'
                                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                                } disabled:cursor-default`}
                              >
                                Pieza {toothId}
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500">Diagnóstico general, sin pieza</p>
                      )}

                      {editing && !disabled && (
                        <div className="rounded-lg border border-slate-200 bg-white p-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <label
                              className="text-xs font-medium text-slate-600"
                              htmlFor={`diagnosis-code-edit-${row.code}`}
                            >
                              Nuevo CIE para {row.code}
                              {catalogHint && (
                                <span className="ml-1 font-normal text-slate-400">{catalogHint}</span>
                              )}
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCode(null)
                                setEditQuery('')
                              }}
                              className="text-xs text-slate-500 hover:text-slate-700"
                            >
                              Cancelar
                            </button>
                          </div>
                          <input
                            id={`diagnosis-code-edit-${row.code}`}
                            type="search"
                            autoFocus
                            placeholder="Buscar código o descripción CIE-10..."
                            value={editQuery}
                            onChange={(event) => setEditQuery(event.target.value)}
                            className="input-field text-sm"
                          />
                          <CieSearchResults
                            query={editQuery}
                            results={filteredEditCie10}
                            onSelect={(code, description) =>
                              applyCodeChange(row.code, code, description)
                            }
                          />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </footer>
      </div>
    </section>
  )
}

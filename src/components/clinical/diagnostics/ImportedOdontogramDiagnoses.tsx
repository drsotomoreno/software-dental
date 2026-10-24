import { useState } from 'react'
import type { Cie10Diagnosis, DiagnosisCertainty } from '@/types/clinicalRecord'
import { DIAGNOSIS_CERTAINTY_LABELS } from '@/constants/dental'
import { useCatalogMeta, useCatalogSearch } from '@/hooks/useCatalogSearch'
import { VoiceDictationButton } from '@/components/voice'

interface CieEditTarget {
  code: string
  toothNumber?: number
}

interface ImportedOdontogramDiagnosesProps {
  diagnoses: Cie10Diagnosis[]
  disabled?: boolean
  onUpdateDiagnosis?: (code: string, patch: Partial<Cie10Diagnosis>) => void
  onRemoveDiagnosis?: (code: string) => void
  onReassignCie?: (payload: {
    fromCode: string
    toCode: string
    toDescription: string
    toothNumber?: number
  }) => void
}

function sameTarget(left: CieEditTarget | null, code: string, toothNumber?: number): boolean {
  return left?.code === code && left.toothNumber === toothNumber
}

export function ImportedOdontogramDiagnoses({
  diagnoses,
  disabled = false,
  onUpdateDiagnosis,
  onRemoveDiagnosis,
  onReassignCie,
}: ImportedOdontogramDiagnosesProps) {
  const [editTarget, setEditTarget] = useState<CieEditTarget | null>(null)
  const [cieQuery, setCieQuery] = useState('')
  const cieResults = useCatalogSearch('cie10', editTarget ? cieQuery : '', 30)
  const cie10Meta = useCatalogMeta('cie10')
  const filteredCie = cieResults ?? []

  const openEditor = (code: string, toothNumber?: number) => {
    setEditTarget((current) => (sameTarget(current, code, toothNumber) ? null : { code, toothNumber }))
    setCieQuery('')
  }

  const applyCie = (fromCode: string, code: string, description: string, toothNumber?: number) => {
    onReassignCie?.({
      fromCode,
      toCode: code,
      toDescription: description,
      toothNumber,
    })
    setEditTarget(null)
    setCieQuery('')
  }

  return (
    <div>
      <h4 className="label-field mb-1">Diagnósticos CIE importados del odontograma</h4>
      <p className="mb-2 text-xs text-slate-500">
        Puede cambiar el CIE de cada pieza. Las demás conservan el código importado.
      </p>
      <ul className="space-y-2">
        {diagnoses.map((diagnosis) => {
          const teeth = [...(diagnosis.affectedTeeth ?? [])].sort((a, b) => a - b)
          const editingDiagnosis = sameTarget(editTarget, diagnosis.code, undefined)
          return (
            <li
              key={diagnosis.code}
              className="space-y-2 rounded-lg bg-amber-50 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-medium text-dental-700">{diagnosis.code}</span>
                <span>— {diagnosis.description}</span>
                {!disabled ? (
                  <>
                    <select
                      value={diagnosis.type}
                      onChange={(event) =>
                        onUpdateDiagnosis?.(diagnosis.code, {
                          type: event.target.value as Cie10Diagnosis['type'],
                        })
                      }
                      className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                      aria-label={`Tipo de ${diagnosis.code}`}
                    >
                      <option value="principal">Principal</option>
                      <option value="relacionado">Relacionado</option>
                    </select>
                    <select
                      value={diagnosis.certainty}
                      onChange={(event) =>
                        onUpdateDiagnosis?.(diagnosis.code, {
                          certainty: event.target.value as DiagnosisCertainty,
                        })
                      }
                      className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                      aria-label={`Certeza de ${diagnosis.code}`}
                    >
                      {Object.entries(DIAGNOSIS_CERTAINTY_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {teeth.length === 0 && (
                      <button
                        type="button"
                        onClick={() => openEditor(diagnosis.code)}
                        className="rounded border border-dental-200 bg-white px-2 py-0.5 text-xs font-medium text-dental-700 hover:bg-dental-50"
                        aria-expanded={editingDiagnosis}
                      >
                        Cambiar CIE
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveDiagnosis?.(diagnosis.code)}
                      className="ml-auto text-red-500 hover:text-red-700"
                      aria-label={`Quitar ${diagnosis.code}`}
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
              </div>

              {teeth.length > 0 && (
                <ul className="space-y-1.5">
                  {teeth.map((tooth) => {
                    const editingTooth = sameTarget(editTarget, diagnosis.code, tooth)
                    return (
                      <li key={tooth} className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-xs text-slate-700">
                            Pieza {tooth}
                          </span>
                          {!disabled && (
                            <button
                              type="button"
                              onClick={() => openEditor(diagnosis.code, tooth)}
                              className="rounded border border-dental-200 bg-white px-2 py-0.5 text-xs font-medium text-dental-700 hover:bg-dental-50"
                              aria-expanded={editingTooth}
                              aria-label={`Cambiar CIE de la pieza ${tooth}`}
                            >
                              Cambiar CIE
                            </button>
                          )}
                        </div>
                        {editingTooth && (
                          <CieCodeSearch
                            inputId={`imported-cie-${diagnosis.code}-${tooth}`}
                            label={`Nuevo CIE para la pieza ${tooth}`}
                            query={cieQuery}
                            onQueryChange={setCieQuery}
                            results={filteredCie}
                            metaLabel={
                              cie10Meta
                                ? `(v${cie10Meta.version} — ${cie10Meta.recordCount} códigos)`
                                : undefined
                            }
                            onSelect={(code, description) =>
                              applyCie(diagnosis.code, code, description, tooth)
                            }
                            onCancel={() => setEditTarget(null)}
                          />
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              {editingDiagnosis && teeth.length === 0 && (
                <CieCodeSearch
                  inputId={`imported-cie-${diagnosis.code}`}
                  label={`Nuevo CIE para ${diagnosis.code}`}
                  query={cieQuery}
                  onQueryChange={setCieQuery}
                  results={filteredCie}
                  metaLabel={
                    cie10Meta
                      ? `(v${cie10Meta.version} — ${cie10Meta.recordCount} códigos)`
                      : undefined
                  }
                  onSelect={(code, description) => applyCie(diagnosis.code, code, description)}
                  onCancel={() => setEditTarget(null)}
                />
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function CieCodeSearch({
  inputId,
  label,
  query,
  onQueryChange,
  results,
  metaLabel,
  onSelect,
  onCancel,
}: {
  inputId: string
  label: string
  query: string
  onQueryChange: (value: string) => void
  results: Array<{ code: string; description: string }>
  metaLabel?: string
  onSelect: (code: string, description: string) => void
  onCancel: () => void
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-white p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-slate-600" htmlFor={inputId}>
          {label}
          {metaLabel && <span className="ml-1 font-normal text-slate-400">{metaLabel}</span>}
        </label>
        <div className="flex items-center gap-2">
          <VoiceDictationButton
            targetInputId={inputId}
            getValue={() => query}
            onValueChange={onQueryChange}
          />
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Cancelar
          </button>
        </div>
      </div>
      <input
        id={inputId}
        type="search"
        autoFocus
        placeholder="Buscar código o descripción CIE-10..."
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        className="input-field text-sm"
      />
      {query && (
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
      )}
    </div>
  )
}

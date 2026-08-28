import { useState } from 'react'
import type { Cie10Diagnosis, DiagnosisCertainty } from '@/types/clinicalRecord'
import { DIAGNOSIS_CERTAINTY_LABELS } from '@/constants/dental'
import { ENDO_FDI_TEETH } from '@/types/endoAnnex.types'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { useCatalogMeta, useCatalogSearch } from '@/hooks/useCatalogSearch'
import { VoiceDictationButton, FieldVoiceHeader } from '@/components/voice'

interface Cie10DiagnosisSearchSectionProps {
  diagnoses: Cie10Diagnosis[]
  onAddDiagnosis: (code: string, description: string, affectedTeeth?: number[]) => void
  onUpdateDiagnosis: (code: string, patch: Partial<Cie10Diagnosis>) => void
  onRemoveDiagnosis: (code: string) => void
  disabled?: boolean
  /** Permite asociar piezas FDI mediante lista desplegable */
  enableToothSelection?: boolean
}

export function Cie10DiagnosisSearchSection({
  diagnoses,
  onAddDiagnosis,
  onUpdateDiagnosis,
  onRemoveDiagnosis,
  disabled = false,
  enableToothSelection = false,
}: Cie10DiagnosisSearchSectionProps) {
  const [search, setSearch] = useState('')
  const [selectedTooth, setSelectedTooth] = useState('')
  const results = useCatalogSearch('cie10', search, 30)
  const cie10Meta = useCatalogMeta('cie10')

  const addDiagnosis = (code: string, description: string) => {
    const toothNumber = selectedTooth ? Number(selectedTooth) : undefined
    const affectedTeeth = toothNumber ? [toothNumber] : undefined
    const existing = diagnoses.find((item) => item.code === code)

    if (existing) {
      if (!toothNumber) return
      const mergedTeeth = [...new Set([...(existing.affectedTeeth ?? []), toothNumber])].sort(
        (a, b) => a - b,
      )
      onUpdateDiagnosis(code, { affectedTeeth: mergedTeeth })
      setSearch('')
      return
    }

    onAddDiagnosis(code, description, affectedTeeth)
    setSearch('')
  }

  const addToothToDiagnosis = (code: string, toothValue: string) => {
    if (!toothValue) return
    const toothNumber = Number(toothValue)
    const existing = diagnoses.find((item) => item.code === code)
    if (!existing) return
    const mergedTeeth = [...new Set([...(existing.affectedTeeth ?? []), toothNumber])].sort(
      (a, b) => a - b,
    )
    onUpdateDiagnosis(code, { affectedTeeth: mergedTeeth })
  }

  const removeToothFromDiagnosis = (code: string, toothNumber: number) => {
    const existing = diagnoses.find((item) => item.code === code)
    if (!existing) return
    const nextTeeth = (existing.affectedTeeth ?? []).filter((tooth) => tooth !== toothNumber)
    onUpdateDiagnosis(code, { affectedTeeth: nextTeeth.length > 0 ? nextTeeth : undefined })
  }

  return (
    <section className="card">
      <h3 className={`mb-1 ${CLINICAL_SECTION_TITLE_CLASS}`}>
        {clinicalSectionTitle(CLINICAL_HISTORY_SECTION_NUMBERS.diagnosticos, 'Diagnóstico CIE-10')}
      </h3>
      <p className="mb-3 text-xs text-slate-500">
        Busque por código o descripción
        {cie10Meta && (
          <span className="ml-1 text-dental-600">
            (v{cie10Meta.version} — {cie10Meta.recordCount} códigos)
          </span>
        )}
        .
      </p>

      {!disabled && (
        <div className="mb-4 space-y-3">
          {enableToothSelection && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="rapid-cie10-tooth">
                Pieza FDI (opcional)
              </label>
              <select
                id="rapid-cie10-tooth"
                value={selectedTooth}
                onChange={(event) => setSelectedTooth(event.target.value)}
                className="input-field text-sm"
              >
                <option value="">Sin pieza específica</option>
                {ENDO_FDI_TEETH.map((tooth) => (
                  <option key={tooth} value={tooth}>
                    Pieza {tooth}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-slate-600" htmlFor="rapid-cie10-search">
              Buscador CIE-10
            </label>
            <VoiceDictationButton
              targetInputId="rapid-cie10-search"
              getValue={() => search}
              onValueChange={setSearch}
            />
          </div>
          <input
            id="rapid-cie10-search"
            type="search"
            placeholder="Ej.: K02.1, caries, pulpitis..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="input-field text-sm"
          />
          {search && (
            <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              {(results ?? []).length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">Sin resultados en el catálogo.</li>
              ) : (
                (results ?? []).map((item) => (
                  <li key={item.code}>
                    <button
                      type="button"
                      onClick={() => addDiagnosis(item.code, item.description)}
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
        </div>
      )}

      {diagnoses.length === 0 ? (
        <p className="text-sm text-slate-500">Sin diagnósticos registrados.</p>
      ) : (
        <ul className="space-y-2">
          {diagnoses.map((diagnosis) => {
            const descId = `cie10-desc-${diagnosis.code.replace(/[^a-zA-Z0-9_-]/g, '-')}`
            return (
            <li
              key={diagnosis.code}
              className="space-y-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-medium text-dental-700">{diagnosis.code}</span>
                {enableToothSelection && (diagnosis.affectedTeeth?.length ?? 0) > 0 && (
                  <span className="flex flex-wrap items-center gap-1">
                    {(diagnosis.affectedTeeth ?? []).map((tooth) => (
                      <span
                        key={tooth}
                        className="inline-flex items-center gap-1 rounded-full bg-dental-100 px-2 py-0.5 text-xs text-dental-800"
                      >
                        Pieza {tooth}
                        {!disabled && (
                          <button
                            type="button"
                            onClick={() => removeToothFromDiagnosis(diagnosis.code, tooth)}
                            className="text-dental-600 hover:text-red-600"
                            aria-label={`Quitar pieza ${tooth}`}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </span>
                )}
                {!disabled && (
                  <>
                    {enableToothSelection && (
                      <select
                        defaultValue=""
                        onChange={(event) => {
                          addToothToDiagnosis(diagnosis.code, event.target.value)
                          event.target.value = ''
                        }}
                        className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                        aria-label={`Agregar pieza a ${diagnosis.code}`}
                      >
                        <option value="">+ Pieza</option>
                        {ENDO_FDI_TEETH.filter(
                          (tooth) => !(diagnosis.affectedTeeth ?? []).includes(tooth),
                        ).map((tooth) => (
                          <option key={tooth} value={tooth}>
                            {tooth}
                          </option>
                        ))}
                      </select>
                    )}
                    <select
                      value={diagnosis.type}
                      onChange={(event) =>
                        onUpdateDiagnosis(diagnosis.code, {
                          type: event.target.value as Cie10Diagnosis['type'],
                        })
                      }
                      className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                    >
                      <option value="principal">Principal</option>
                      <option value="relacionado">Relacionado</option>
                    </select>
                    <select
                      value={diagnosis.certainty}
                      onChange={(event) =>
                        onUpdateDiagnosis(diagnosis.code, {
                          certainty: event.target.value as DiagnosisCertainty,
                        })
                      }
                      className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                    >
                      {Object.entries(DIAGNOSIS_CERTAINTY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onRemoveDiagnosis(diagnosis.code)}
                      className="ml-auto text-xs text-red-600 hover:underline"
                    >
                      Quitar
                    </button>
                  </>
                )}
              </div>
              <div>
                <FieldVoiceHeader
                  label="Descripción"
                  targetInputId={descId}
                  disabled={disabled}
                  labelClassName="text-[10px] text-slate-500"
                  getValue={() => diagnosis.description}
                  onValueChange={(description) =>
                    onUpdateDiagnosis(diagnosis.code, { description })
                  }
                />
                {disabled ? (
                  <p className="text-sm text-slate-700">{diagnosis.description}</p>
                ) : (
                  <textarea
                    id={descId}
                    rows={2}
                    value={diagnosis.description}
                    onChange={(event) =>
                      onUpdateDiagnosis(diagnosis.code, { description: event.target.value })
                    }
                    placeholder="Descripción del diagnóstico..."
                    className="input-field resize-y text-sm"
                  />
                )}
              </div>
            </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

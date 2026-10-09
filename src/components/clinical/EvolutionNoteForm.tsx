import { useMemo, useState } from 'react'
import { PURPOSE_OF_CARE_OPTIONS } from '@/constants/purposeOfCare'
import { isOdontologyConsultationCups } from '@/constants/rips'
import { COMMON_DENTAL_PROCEDURES } from '@/constants/dental'
import { useCatalogSearch } from '@/hooks/useCatalogSearch'
import {
  useSaveEvolutionNote,
  type EvolutionNoteCupsSelection,
  type SavedEvolutionNoteResult,
} from '@/hooks/useSaveEvolutionNote'
import { formatCupsCodeDotted } from '@/services/catalogService'
import {
  Cie10FindingSuggestions,
  SelectedCie10Badge,
  type Cie10Option,
} from './Cie10FindingSuggestions'

interface EvolutionNoteFormProps {
  patientId: string
  clinicalRecordId?: string
  professionalId?: string
  clinicId?: string
  disabled?: boolean
}

interface SelectedCups extends EvolutionNoteCupsSelection {
  id: string
}

function toDateTimeLocalValue(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function emptyFormState() {
  return {
    clinicalNote: '',
    dateTime: toDateTimeLocalValue(),
    diagnosisQuery: '',
    diagnosis: null as Cie10Option | null,
    purposeOfCare: '',
    cupsQuery: '',
    selectedCups: [] as SelectedCups[],
  }
}

export function EvolutionNoteForm({
  patientId,
  clinicalRecordId,
  professionalId,
  clinicId,
  disabled = false,
}: EvolutionNoteFormProps) {
  const { saveEvolutionNote, saving, error } = useSaveEvolutionNote()
  const [form, setForm] = useState(emptyFormState)
  const [saved, setSaved] = useState<SavedEvolutionNoteResult | null>(null)
  const cupsCatalog = useCatalogSearch('cups', form.cupsQuery, 20)

  const cupsOptions = useMemo(() => {
    const query = form.cupsQuery.trim().toLowerCase()
    const merged = new Map<string, { cupsCode: string; description: string }>()
    for (const item of COMMON_DENTAL_PROCEDURES) {
      merged.set(item.cupsCode, { cupsCode: item.cupsCode, description: item.procedure })
    }
    for (const item of cupsCatalog ?? []) {
      merged.set(item.code, { cupsCode: item.code, description: item.description })
    }
    return [...merged.values()].filter((item) => {
      if (!query) return COMMON_DENTAL_PROCEDURES.some((common) => common.cupsCode === item.cupsCode)
      return (
        item.cupsCode.includes(query.replace(/\D/g, '')) ||
        item.description.toLowerCase().includes(query)
      )
    })
  }, [cupsCatalog, form.cupsQuery])

  const locked = disabled || saving || !patientId

  const addCups = (cupsCode: string, description: string) => {
    setForm((current) => ({
      ...current,
      cupsQuery: '',
      selectedCups: [
        ...current.selectedCups,
        { id: crypto.randomUUID(), cupsCode, description, toothNumber: null },
      ],
    }))
    setSaved(null)
  }

  const signAndSave = async () => {
    setSaved(null)
    try {
      const result = await saveEvolutionNote({
        patientId,
        clinicalRecordId,
        professionalId,
        clinicId,
        clinicalNote: form.clinicalNote,
        mainDiagnosisCie10: form.diagnosis?.code ?? '',
        purposeOfCare: form.purposeOfCare,
        dateTime: form.dateTime ? new Date(form.dateTime).toISOString() : '',
        selectedCups: form.selectedCups.map(({ cupsCode, description, toothNumber }) => ({
          cupsCode,
          description,
          toothNumber,
        })),
      })
      setSaved(result)
      setForm(emptyFormState())
    } catch {
      // El hook expone el mensaje.
    }
  }

  return (
    <form
      className="card mb-4"
      onSubmit={(event) => {
        event.preventDefault()
        void signAndSave()
      }}
    >
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">Firmar nota de evolución</h3>
        <p className="mt-1 text-xs text-slate-500">
          Al firmar se guarda la nota y, en la misma operación, se generan los RIPS de consulta o
          procedimientos. No hay un registro RIPS manual.
        </p>
      </div>

      {!patientId && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Abra la historia de un paciente para firmar la nota.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="label-field">Nota de evolución</span>
          <textarea
            required
            disabled={locked}
            rows={5}
            value={form.clinicalNote}
            onChange={(event) =>
              setForm((current) => ({ ...current, clinicalNote: event.target.value }))
            }
            className="input-field"
            placeholder="Hallazgos, procedimiento realizado y evolución del paciente"
          />
        </label>

        <label>
          <span className="label-field">Fecha y hora</span>
          <input
            required
            disabled={locked}
            type="datetime-local"
            value={form.dateTime}
            onChange={(event) =>
              setForm((current) => ({ ...current, dateTime: event.target.value }))
            }
            className="input-field"
          />
        </label>

        <label>
          <span className="label-field">Finalidad de la atención</span>
          <select
            required
            disabled={locked}
            value={form.purposeOfCare}
            onChange={(event) =>
              setForm((current) => ({ ...current, purposeOfCare: event.target.value }))
            }
            className="input-field"
          >
            <option value="">Seleccione la finalidad</option>
            {PURPOSE_OF_CARE_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code} — {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="relative md:col-span-2">
          <span className="label-field">Diagnóstico principal (CIE-10)</span>
          {form.diagnosis && (
            <SelectedCie10Badge
              value={form.diagnosis}
              disabled={locked}
              onClear={() => setForm((current) => ({ ...current, diagnosis: null }))}
            />
          )}
          <input
            required={!form.diagnosis}
            disabled={locked}
            value={form.diagnosisQuery}
            onChange={(event) =>
              setForm((current) => ({ ...current, diagnosisQuery: event.target.value }))
            }
            className="input-field"
            placeholder="Busque por código o descripción CIE-10"
            aria-label="Diagnóstico principal CIE-10"
          />
          <Cie10FindingSuggestions
            query={form.diagnosisQuery}
            disabled={locked}
            onSelect={(option) =>
              setForm((current) => ({
                ...current,
                diagnosis: option,
                diagnosisQuery: '',
              }))
            }
          />
        </div>

        <div className="md:col-span-2">
          <span className="label-field">Procedimientos realizados (CUPS)</span>
          <input
            disabled={locked}
            value={form.cupsQuery}
            onChange={(event) =>
              setForm((current) => ({ ...current, cupsQuery: event.target.value }))
            }
            className="input-field"
            placeholder="Buscar código CUPS o procedimiento"
            aria-label="Procedimientos realizados CUPS"
          />
          {!locked && form.cupsQuery.trim() && (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              {cupsOptions.length === 0 ? (
                <li className="px-3 py-2 text-xs text-slate-500">Sin procedimientos para esa búsqueda</li>
              ) : (
                cupsOptions.slice(0, 12).map((option) => (
                  <li key={option.cupsCode}>
                    <button
                      type="button"
                      onClick={() => addCups(option.cupsCode, option.description)}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50"
                    >
                      <span className="font-mono font-medium text-dental-700">
                        {formatCupsCodeDotted(option.cupsCode)}
                      </span>
                      <span className="ml-1.5 text-slate-700">{option.description}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}

          {form.selectedCups.length > 0 && (
            <ul className="mt-3 space-y-2">
              {form.selectedCups.map((item) => {
                const consultation = isOdontologyConsultationCups(item.cupsCode)
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <span className="font-mono text-xs font-semibold text-dental-800">
                      {formatCupsCodeDotted(item.cupsCode)}
                    </span>
                    <span className="text-xs text-slate-700">{item.description}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      {consultation ? 'Genera consulta RIPS' : 'Genera procedimiento RIPS'}
                    </span>
                    {!consultation && (
                      <label className="ml-auto flex items-center gap-1 text-xs text-slate-600">
                        Pieza
                        <input
                          disabled={locked}
                          inputMode="numeric"
                          value={item.toothNumber ?? ''}
                          onChange={(event) => {
                            const raw = event.target.value.replace(/\D/g, '')
                            const toothNumber = raw ? Number(raw) : null
                            setForm((current) => ({
                              ...current,
                              selectedCups: current.selectedCups.map((selected) =>
                                selected.id === item.id ? { ...selected, toothNumber } : selected,
                              ),
                            }))
                          }}
                          className="input-field w-16 py-1"
                          aria-label={`Pieza FDI de ${item.cupsCode}`}
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          selectedCups: current.selectedCups.filter((selected) => selected.id !== item.id),
                        }))
                      }
                      className="text-xs font-medium text-slate-500 hover:text-red-600"
                    >
                      Quitar
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {saved && (
        <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Nota {saved.evolutionNoteId} firmada.
          {saved.consultationId ? ' Se generó 1 consulta RIPS.' : ''}
          {saved.procedureIds.length > 0
            ? ` Se generaron ${saved.procedureIds.length} procedimiento(s) RIPS.`
            : ''}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={locked} className="btn-primary">
          {saving ? 'Firmando…' : 'Firmar y Guardar Nota'}
        </button>
      </div>
    </form>
  )
}

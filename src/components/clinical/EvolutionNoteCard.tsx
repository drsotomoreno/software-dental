import type { EvolutionNote } from '@/types/evolutionNote'
import {
  isEvolutionNoteAddendum,
  isEvolutionNoteImmutable,
} from '@/types/evolutionNote'
import { formatDate } from '@/utils'
import { VoiceDictationButton } from '@/components/voice'
import { DigitalSignatureCanvas } from '@/components/signature'
import { useAuth } from '@/contexts/AuthContext'
import { CupsProcedurePicker } from './CupsProcedurePicker'
import { EvolutionCatalogServicesField } from './EvolutionCatalogServicesField'
import { EvolutionNoteAddendumPanel } from './EvolutionNoteAddendumPanel'
import {
  noteHasCatalogServices,
  resolveEvolutionNoteRipsMode,
} from '@/utils/evolutionCatalogServices'

interface EvolutionNoteCardProps {
  note: EvolutionNote
  index: number
  disabled?: boolean
  patientId?: string
  parentRecordId?: string
  allowAddendums?: boolean
  onChange: (patch: Partial<EvolutionNote>) => void
  onRemove: () => void
  onSign: () => void
  onAddAddendum: () => void
}

export function EvolutionNoteCard({
  note,
  index,
  disabled = false,
  patientId = '',
  parentRecordId,
  allowAddendums = true,
  onChange,
  onRemove,
  onSign,
  onAddAddendum,
}: EvolutionNoteCardProps) {
  const { user } = useAuth()
  const immutable = isEvolutionNoteImmutable(note)
  const readOnly = immutable
  const isAddendum = isEvolutionNoteAddendum(note)
  const ripsMode = resolveEvolutionNoteRipsMode(note)
  const nonRips = ripsMode === 'non_rips' || isAddendum
  const hasServices = noteHasCatalogServices(note)
  const showLegacyRipsForm = !hasServices && Boolean(note.procedure?.trim()) && !nonRips
  const showRipsForm =
    (hasServices && (ripsMode === 'rips' || ripsMode === 'mixed')) || showLegacyRipsForm
  const showClinicalNoteForm = nonRips || ripsMode === 'mixed'
  const evolutionFormReady =
    nonRips || showRipsForm || isAddendum || ripsMode === 'mixed'

  return (
    <div
      className={`rounded-lg border p-4 ${
        isAddendum
          ? 'border-amber-300 bg-amber-50/40'
          : nonRips
            ? 'border-violet-200 bg-violet-50/40'
            : 'border-slate-200 bg-slate-50'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-700">
            {isAddendum ? 'Aclaratoria' : `Nota #${index + 1}`}
            {note.date && (
              <span className="ml-2 font-normal text-slate-500">— {formatDate(note.date)}</span>
            )}
          </span>
          {immutable && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
              Firmada — inmutable
            </span>
          )}
          {isAddendum && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              Addendum
            </span>
          )}
          {ripsMode === 'mixed' && !isAddendum && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              RIPS + sin RIPS
            </span>
          )}
          {nonRips && !isAddendum && ripsMode !== 'mixed' && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
              Sin reporte RIPS
            </span>
          )}
          {!nonRips && note.isBillable === false && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
              RIPS $0 — sin FEV
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && !isAddendum && (
            <button
              type="button"
              onClick={onSign}
              className="text-xs font-medium text-dental-700 hover:text-dental-900"
            >
              Firmar y grabar
            </button>
          )}
          {!readOnly && !immutable && (
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Eliminar
            </button>
          )}
          {immutable && allowAddendums && (
            <button
              type="button"
              onClick={onAddAddendum}
              className="btn-secondary text-xs"
            >
              Agregar Nota de Aclaración
            </button>
          )}
        </div>
      </div>

      {immutable && note.contentHash && (
        <p className="mb-3 font-mono text-[10px] text-slate-400">
          SHA-256: {note.contentHash.slice(0, 32)}…
          {note.signedAt && (
            <span className="ml-2 text-slate-500">UTC: {formatDate(note.signedAt)}</span>
          )}
        </p>
      )}

      <div className="space-y-4">
        {isAddendum ? (
          <>
            <div>
              <label className="label-field">
                Motivo de la aclaratoria <span className="text-red-500">*</span>
              </label>
              <input
                disabled={readOnly}
                value={note.addendumReason ?? ''}
                onChange={(event) => onChange({ addendumReason: event.target.value })}
                className="input-field"
                placeholder="Motivo de la corrección o complemento"
              />
            </div>
            <div>
              <label className="label-field">
                Contenido de la aclaratoria <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={5}
                disabled={readOnly}
                value={note.clinicalNote ?? ''}
                onChange={(event) => onChange({ clinicalNote: event.target.value })}
                className="input-field min-h-[8rem] resize-y"
              />
            </div>
            <DigitalSignatureCanvas
              onSignatureChange={(result) =>
                onChange({
                  professionalSignatureDataUrl: result?.dataUrl,
                  professionalSignatureMeta: result?.metadata,
                })
              }
              disabled={readOnly}
              width={480}
              height={160}
            />
            {!readOnly && (
              <button type="button" onClick={onSign} className="btn-primary text-xs">
                Firmar nota aclaratoria
              </button>
            )}
          </>
        ) : (
          <>
            <EvolutionCatalogServicesField
              note={note}
              disabled={readOnly}
              onChange={(patch) => onChange(patch)}
            />

            <div>
              <label className="label-field">Fecha y hora de la sesión</label>
              <input
                type="datetime-local"
                disabled={readOnly}
                value={note.date}
                onChange={(event) => onChange({ date: event.target.value })}
                className="input-field"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label-field">Costo de la atención (COP)</label>
                <input
                  type="number"
                  min={0}
                  disabled={readOnly}
                  value={note.cost ?? ''}
                  onChange={(event) =>
                    onChange({
                      cost: event.target.value === '' ? undefined : Number(event.target.value),
                    })
                  }
                  placeholder="0 = control / garantía"
                  className="input-field"
                />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={note.isBillable !== false && (note.cost ?? 0) > 0}
                  onChange={(event) =>
                    onChange({
                      isBillable: event.target.checked,
                      cost: event.target.checked ? note.cost || 0 : 0,
                    })
                  }
                />
                Genera factura DIAN (FEV)
              </label>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="label-field mb-0">
                  Nota de Evolución <span className="text-red-500">*</span>
                </label>
                {!readOnly && (
                  <VoiceDictationButton
                    targetInputId={`evo-evolution-note-${note.id}`}
                    getValue={() => note.clinicalNote ?? ''}
                    onValueChange={(clinicalNote) => onChange({ clinicalNote })}
                  />
                )}
              </div>
              <p className="mb-2 text-[10px] text-slate-400">
                Registre la evolución del paciente, hallazgos, procedimiento realizado y recomendaciones.
                Puede dictar por voz o escribir con el teclado.
              </p>
              <textarea
                id={`evo-evolution-note-${note.id}`}
                rows={8}
                disabled={readOnly}
                value={note.clinicalNote ?? ''}
                onChange={(event) => onChange({ clinicalNote: event.target.value })}
                placeholder="Escriba o dicte la nota de evolución del profesional tratante…"
                className="input-field min-h-[10rem] resize-y"
              />
            </div>

            {!evolutionFormReady ? (
              <p className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-500">
                Busque un CUPS o tratamiento personalizado arriba, o escriba el procedimiento
                manualmente para continuar con la evolución.
              </p>
            ) : (
              <>
                {showClinicalNoteForm && (
                  <>
                    <div className="rounded-lg border border-violet-100 bg-white/80 p-3 text-xs text-violet-900">
                      {ripsMode === 'mixed'
                        ? 'Algunos procedimientos no requieren CUPS para RIPS. Firme digitalmente antes de grabar la nota.'
                        : 'Este servicio no requiere código CUPS para RIPS. Firme digitalmente; no se generarán advertencias de radicación.'}
                    </div>

                    <DigitalSignatureCanvas
                      onSignatureChange={(result) =>
                        onChange({
                          professionalSignatureDataUrl: result?.dataUrl,
                          professionalSignatureMeta: result?.metadata,
                        })
                      }
                      disabled={readOnly}
                      width={480}
                      height={160}
                    />

                    {note.professionalSignatureDataUrl && readOnly && (
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="mb-2 text-xs font-medium text-slate-600">Firma del profesional</p>
                        <img
                          src={note.professionalSignatureDataUrl}
                          alt="Firma profesional"
                          className="max-h-24"
                        />
                      </div>
                    )}
                  </>
                )}

                {showRipsForm && (
                  <>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="label-field mb-0">Procedimiento / CUPS</label>
                    {!readOnly && (
                      <VoiceDictationButton
                        targetInputId={`evo-procedure-${note.id}`}
                        getValue={() => note.procedure}
                        onValueChange={(procedure) => onChange({ procedure })}
                      />
                    )}
                  </div>
                  <CupsProcedurePicker
                    inputId={`evo-procedure-${note.id}`}
                    disabled={readOnly}
                    value={note.procedure}
                    onChange={(procedure) => onChange({ procedure })}
                  />
                </div>

                <div>
                  <h5 className="mb-2 text-xs font-semibold uppercase text-slate-500">Anestesia</h5>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="label-field">Tipo</label>
                      <input
                        disabled={readOnly}
                        value={note.anesthesia.type}
                        onChange={(event) =>
                          onChange({
                            anesthesia: { ...note.anesthesia, type: event.target.value },
                          })
                        }
                        placeholder="Lidocaína 2%..."
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="label-field">Carpules</label>
                      <input
                        type="number"
                        min={0}
                        disabled={readOnly}
                        value={note.anesthesia.carpules}
                        onChange={(event) =>
                          onChange({
                            anesthesia: {
                              ...note.anesthesia,
                              carpules: Number(event.target.value),
                            },
                          })
                        }
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="label-field">Vasoconstrictor</label>
                      <input
                        disabled={readOnly}
                        value={note.anesthesia.vasoconstrictor}
                        onChange={(event) =>
                          onChange({
                            anesthesia: {
                              ...note.anesthesia,
                              vasoconstrictor: event.target.value,
                            },
                          })
                        }
                        placeholder="Epinefrina 1:100.000..."
                        className="input-field"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="label-field mb-0">Medicamentos recetados</label>
                    {!readOnly && (
                      <VoiceDictationButton
                        targetInputId={`evo-rx-${note.id}`}
                        getValue={() => note.prescriptions}
                        onValueChange={(prescriptions) => onChange({ prescriptions })}
                      />
                    )}
                  </div>
                  <textarea
                    id={`evo-rx-${note.id}`}
                    rows={2}
                    disabled={readOnly}
                    value={note.prescriptions}
                    onChange={(event) => onChange({ prescriptions: event.target.value })}
                    className="input-field resize-y"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label-field">Profesional tratante</label>
                    <input
                      disabled={readOnly}
                      value={note.professionalName}
                      onChange={(event) => onChange({ professionalName: event.target.value })}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="label-field">Registro profesional</label>
                    <input
                      disabled={readOnly}
                      value={note.professionalLicense}
                      onChange={(event) => onChange({ professionalLicense: event.target.value })}
                      className="input-field"
                    />
                  </div>
                </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      {immutable && allowAddendums && user && patientId && (
        <EvolutionNoteAddendumPanel
          parentNote={note}
          patientId={patientId}
          parentRecordId={parentRecordId}
          user={user}
        />
      )}
    </div>
  )
}

import { DemoSignatureCanvas } from './DemoSignatureCanvas'

interface DemoStepEvolutionProps {
  note: string
  professionalName: string
  rethus: string
  signatureDataUrl: string | null
  signedAt: string | null
  onNoteChange: (value: string) => void
  onProfessionalNameChange: (value: string) => void
  onRethusChange: (value: string) => void
  onSignatureChange: (dataUrl: string | null) => void
  onSignedAtChange: (iso: string | null) => void
}

function formatSignedAt(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'long',
    timeStyle: 'medium',
  }).format(new Date(iso))
}

/**
 * Paso 8 — Nota de evolución + firma exclusiva del profesional
 * (ReTHUS + timestamp). Sin firma de paciente (Res. 1995/1999).
 */
export function DemoStepEvolution({
  note,
  professionalName,
  rethus,
  signatureDataUrl,
  signedAt,
  onNoteChange,
  onProfessionalNameChange,
  onRethusChange,
  onSignatureChange,
  onSignedAtChange,
}: DemoStepEvolutionProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-dental-600">Paso 8 de 9</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-800">Notas de evolución</h2>
      <p className="mt-2 text-sm text-slate-500">
        La suscripción paga de mihistoriadental optimiza la práctica clínica al permitir el
        diligenciamiento de notas de evolución 100% por dictado de voz, integrando la firma digital
        del odontólogo con plena validez jurídica, inalterabilidad y valor probatorio para
        garantizar un registro ágil, seguro y en cumplimiento estricto de la Ley 527 de 1999, la
        Resolución 1995 de 1999 y la Ley 2015 de 2020.
      </p>

      <div className="mt-8 space-y-2">
        <label htmlFor="demo-evolution-note" className="text-sm font-medium text-slate-700">
          Nota de evolución
        </label>
        <textarea
          id="demo-evolution-note"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          rows={8}
          placeholder="Ej. Paciente asiste a control. Se realiza procedimiento planificado sin complicaciones. Se dan indicaciones de higiene y analgesia."
          className="input-field min-h-[12rem] resize-y"
        />
        <p className="text-xs text-slate-500">{note.trim().length} caracteres</p>
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-slate-800">
          Firma del odontólogo tratante
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Registro ReTHUS y firma electrónica con timestamp al guardar (Res. 1995/1999).
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="demo-evolution-professional"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Nombre del profesional
            </label>
            <input
              id="demo-evolution-professional"
              type="text"
              value={professionalName}
              onChange={(event) => onProfessionalNameChange(event.target.value)}
              placeholder="Dr. / Dra. …"
              className="input-field"
              autoComplete="name"
            />
          </div>
          <div>
            <label
              htmlFor="demo-evolution-rethus"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Registro ReTHUS
            </label>
            <input
              id="demo-evolution-rethus"
              type="text"
              value={rethus}
              onChange={(event) => onRethusChange(event.target.value)}
              placeholder="Ej. 438265"
              className="input-field"
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="mt-5">
          <DemoSignatureCanvas
            height={180}
            initialDataUrl={signatureDataUrl}
            savedDataUrl={signatureDataUrl}
            onSave={(dataUrl) => {
              onSignatureChange(dataUrl)
              onSignedAtChange(new Date().toISOString())
            }}
            onClearSaved={() => {
              onSignatureChange(null)
              onSignedAtChange(null)
            }}
          />
        </div>

        {signedAt && signatureDataUrl ? (
          <div className="mt-4 rounded-lg border border-dental-200 bg-white px-4 py-3 text-sm text-dental-900">
            <p>
              <span className="font-semibold">Firmado electrónicamente</span>
              {professionalName.trim() ? ` por ${professionalName.trim()}` : ''}
              {rethus.trim() ? ` · ReTHUS ${rethus.trim()}` : ''}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Timestamp: {formatSignedAt(signedAt)}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-amber-800">
            Dibuje la firma y pulse «Guardar firma» para asociar el timestamp inmutable.
          </p>
        )}
      </div>
    </div>
  )
}

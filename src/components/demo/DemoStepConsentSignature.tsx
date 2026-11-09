import { DemoSignatureCanvas } from './DemoSignatureCanvas'

interface DemoStepConsentSignatureProps {
  signatureDataUrl: string | null
  onChange: (dataUrl: string | null) => void
}

/** Paso 6 — Consentimiento y firma digital (lienzo HTML5). */
export function DemoStepConsentSignature({
  signatureDataUrl,
  onChange,
}: DemoStepConsentSignatureProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-dental-600">Paso 6 de 9</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-800">Consentimiento y firma digital</h2>
      <p className="mt-2 text-sm text-slate-500">
        mihistoriadental garantiza la plena validez jurídica e inalterabilidad de historias clínicas
        y consentimientos mediante firma digital, integrando un Kiosco de Recepción que permite a
        los pacientes autorizar documentos y datos personales en sala de espera sin papel,
        cumpliendo rigurosamente con la Ley 527 de 1999, el Decreto 2364 de 2012, la Ley 2015 de
        2020 y la Ley 1581 de Habeas Data.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Al firmar, el usuario declara haber leído y aceptado el consentimiento informado de la
        demostración (versión de prueba reducida).
      </div>

      <div className="mt-6">
        <DemoSignatureCanvas
          initialDataUrl={signatureDataUrl}
          savedDataUrl={signatureDataUrl}
          onSave={onChange}
          onClearSaved={() => onChange(null)}
        />
      </div>
    </div>
  )
}

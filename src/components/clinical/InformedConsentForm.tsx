import { useMemo, useState } from 'react'
import type { InformedConsent } from '@/types/consent'
import {
  CONSENT_MENU_OPTIONS,
  getConsentLabel,
  getConsentTemplate,
  type ConsentTemplateId,
} from '@/constants/consentTemplates'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { DigitalSignatureCanvas } from '@/components/signature'

interface InformedConsentFormProps {
  data: InformedConsent
  onChange: (data: InformedConsent) => void
  disabled?: boolean
}

export function InformedConsentForm({
  data,
  onChange,
  disabled = false,
}: InformedConsentFormProps) {
  const [activeConsentId, setActiveConsentId] = useState<ConsentTemplateId | null>(null)
  const [pickerValue, setPickerValue] = useState('')

  const selectedIds = data.selectedConsentIds ?? []

  const activeId = useMemo(() => {
    if (activeConsentId && selectedIds.includes(activeConsentId)) return activeConsentId
    return selectedIds[0] ?? null
  }, [activeConsentId, selectedIds])

  const activeText = activeId ? getConsentTemplate(activeId)?.text : ''

  const availableOptions = CONSENT_MENU_OPTIONS.filter((t) => !selectedIds.includes(t.id))

  const update = (patch: Partial<InformedConsent>) => onChange({ ...data, ...patch })

  const addConsent = (id: ConsentTemplateId) => {
    if (selectedIds.includes(id)) return
    const next = [...selectedIds, id]
    update({ selectedConsentIds: next, textAccepted: false })
    setActiveConsentId(id)
    setPickerValue('')
  }

  const removeConsent = (id: ConsentTemplateId) => {
    const next = selectedIds.filter((item) => item !== id)
    update({
      selectedConsentIds: next,
      textAccepted: next.length === 0 ? false : data.textAccepted,
    })
    if (activeConsentId === id) setActiveConsentId(next[0] ?? null)
  }

  return (
    <section className="card">
      <h3 className={`mb-2 ${CLINICAL_SECTION_TITLE_CLASS}`}>
        {clinicalSectionTitle(
          CLINICAL_HISTORY_SECTION_NUMBERS.consentimiento,
          'Consentimiento Informado y Firmas',
        )}
      </h3>
      <p className="mb-4 text-xs text-slate-500">
        Seleccione uno o más consentimientos según el procedimiento a realizar. El paciente debe
        leer y aceptar el texto correspondiente antes de firmar.
      </p>

      {!disabled && (
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs text-slate-500">
              Agregar consentimiento por procedimiento
            </label>
            <select
              value={pickerValue}
              onChange={(e) => {
                const id = e.target.value as ConsentTemplateId
                if (id) addConsent(id)
              }}
              className="input-field"
            >
              <option value="">Seleccione un procedimiento...</option>
              {availableOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {selectedIds.length > 0 ? (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {selectedIds.map((id) => (
              <span
                key={id}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                  activeId === id
                    ? 'bg-dental-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveConsentId(id)}
                  className="text-left"
                >
                  {getConsentLabel(id)}
                </button>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeConsent(id)}
                    className={`ml-1 ${activeId === id ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-red-500'}`}
                    aria-label={`Quitar ${getConsentLabel(id)}`}
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>

          <div className="mb-4 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed whitespace-pre-line text-slate-700">
            {activeText}
          </div>
        </>
      ) : (
        <p className="mb-4 text-sm text-slate-500">
          No hay consentimientos seleccionados. Elija al menos uno del menú.
        </p>
      )}

      <label className="mb-6 flex items-start gap-2">
        <input
          type="checkbox"
          disabled={disabled || selectedIds.length === 0}
          checked={data.textAccepted}
          onChange={(e) => update({ textAccepted: e.target.checked })}
          className="mt-0.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
        />
        <span className="text-sm text-slate-700">
          El paciente ha leído y acepta el(los) consentimiento(s) informado(s) seleccionado(s){' '}
          <span className="text-red-500">*</span>
        </span>
      </label>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">Firma del paciente</h4>
          <DigitalSignatureCanvas
            onSignatureChange={(result) =>
              update({
                patientSignatureDataUrl: result?.dataUrl,
                patientSignatureMeta: result?.metadata,
              })
            }
            disabled={disabled}
            width={400}
            height={150}
          />
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">Firma del profesional</h4>
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label-field">Tarjeta profesional</label>
              <input
                disabled={disabled}
                value={data.professionalLicense}
                onChange={(e) => update({ professionalLicense: e.target.value })}
                placeholder="Ej: OD-12345"
                className="input-field"
              />
            </div>
            <div>
              <label className="label-field">Registro médico</label>
              <input
                disabled={disabled}
                value={data.professionalRegistry}
                onChange={(e) => update({ professionalRegistry: e.target.value })}
                placeholder="Número de registro"
                className="input-field"
              />
            </div>
          </div>
          <DigitalSignatureCanvas
            onSignatureChange={(result) =>
              update({
                professionalSignatureDataUrl: result?.dataUrl,
                professionalSignatureMeta: result?.metadata,
              })
            }
            disabled={disabled}
            width={400}
            height={150}
          />
        </div>
      </div>
    </section>
  )
}

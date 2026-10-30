import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { InformedConsent } from '@/types/consent'
import {
  keepStoredConsentSignatures,
  restoreMissingConsentSignatures,
  signedConsentTemplateIds,
  type StoredConsentSignatures,
} from '@/types/consent'
import {
  CONSENT_MENU_OPTIONS,
  getConsentLabel,
  getConsentTemplate,
  getConsentTexts,
  type ConsentTemplateId,
} from '@/constants/consentTemplates'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { DigitalSignatureCanvas } from '@/components/signature'
import {
  MinorPatientAuthorizationFields,
  patientOrGuardianSignatureHeading,
} from '@/components/clinical/MinorPatientAuthorizationFields'
import { KioskRemoteTrigger } from '@/components/kiosk/KioskRemoteTrigger'
import { findLedgerConsentSignatures } from '@/services/signatureService'
import type { SignatureCaptureResult } from '@/types/signature'
import { listPatientClinicalRecords } from '@/utils/clinicalRecordSnapshot'
import {
  esMenorDeEdad,
  guardianAuthorizationComplete,
} from '@/utils/patientMinorAge'

const NO_CONSENT_IDS: ConsentTemplateId[] = []

interface InformedConsentFormProps {
  data: InformedConsent
  onChange: (data: InformedConsent) => void
  disabled?: boolean
  /** Paciente de la historia clínica actual (Dexie). */
  patientId?: string
  /** Fecha de nacimiento del paciente (`birthDate` / fechaNacimiento). */
  patientBirthDate?: string
}

function signedConsentLabels(
  consents: Array<Partial<InformedConsent> | null | undefined>,
): string[] {
  return signedConsentTemplateIds(consents).map((id) => getConsentLabel(id))
}

export function InformedConsentForm({
  data,
  onChange,
  disabled = false,
  patientId = '',
  patientBirthDate = '',
}: InformedConsentFormProps) {
  const [activeConsentId, setActiveConsentId] = useState<ConsentTemplateId | null>(null)
  const [pickerValue, setPickerValue] = useState('')
  const dataRef = useRef(data)
  const onChangeRef = useRef(onChange)
  dataRef.current = data
  onChangeRef.current = onChange

  const esMenor = useMemo(() => esMenorDeEdad(patientBirthDate), [patientBirthDate])
  const patientSignatureLabel = patientOrGuardianSignatureHeading(esMenor)
  const guardianOk = guardianAuthorizationComplete(
    esMenor,
    data.guardianName,
    data.guardianDocument,
  )

  const selectedIds = data.selectedConsentIds ?? NO_CONSENT_IDS
  const selectedKey = selectedIds.join('|')

  const persisted = useLiveQuery(async () => {
    if (!patientId) return { labels: [] as string[], stored: null as StoredConsentSignatures | null }
    const records = await listPatientClinicalRecords(patientId)
    const ordered = [...records].sort((a, b) =>
      (b.informedConsent?.signedAt ?? b.signedAt ?? b.updatedAt ?? '').localeCompare(
        a.informedConsent?.signedAt ?? a.signedAt ?? a.updatedAt ?? '',
      ),
    )
    let stored: StoredConsentSignatures | null = null
    const mergedConsents: Array<Partial<InformedConsent> | null> = []
    for (const record of ordered) {
      let ledger: StoredConsentSignatures | null = null
      try {
        ledger = await findLedgerConsentSignatures([record])
      } catch {
        ledger = null
      }
      const bodyIds = record.informedConsent?.selectedConsentIds ?? []
      const ledgerIds = (ledger?.selectedConsentIds ?? []) as ConsentTemplateId[]
      const merged = keepStoredConsentSignatures(
        ledger,
        {
          ...(record.informedConsent ?? {}),
          // Si el cuerpo perdió firmas/fecha pero el ledger o el cierre las tienen,
          // el listado de la sección 10 debe seguir reconociendo el consentimiento.
          signedAt: record.informedConsent?.signedAt ?? record.signedAt ?? ledger?.signedAt,
          selectedConsentIds: bodyIds.length > 0 ? bodyIds : ledgerIds,
        } as InformedConsent,
      )
      mergedConsents.push(merged && typeof merged === 'object' ? merged : record.informedConsent)
      if (!merged || typeof merged !== 'object') continue
      const candidate = merged as StoredConsentSignatures & Partial<InformedConsent>
      if (!candidate.patientSignatureDataUrl && !candidate.professionalSignatureDataUrl) continue
      const ids = (candidate.selectedConsentIds ?? []) as ConsentTemplateId[]
      const overlapsSelection =
        selectedIds.length === 0 ||
        ids.length === 0 ||
        ids.some((id) => selectedIds.includes(id))
      if (!overlapsSelection) continue
      if (stored) continue
      stored = {
        selectedConsentIds: ids,
        patientSignatureDataUrl: candidate.patientSignatureDataUrl,
        patientSignatureMeta: candidate.patientSignatureMeta,
        professionalSignatureDataUrl: candidate.professionalSignatureDataUrl,
        professionalSignatureMeta: candidate.professionalSignatureMeta,
        signedAt: candidate.signedAt ?? record.signedAt,
        textAccepted: candidate.textAccepted === true || record.informedConsent?.textAccepted === true,
      }
    }
    return {
      // Incluye firmas reconstruidas desde el ledger, no solo el JSON del registro.
      labels: signedConsentLabels(mergedConsents),
      stored,
    }
  }, [patientId, selectedKey])

  const persistedLabels = persisted?.labels
  const storedSignatures = persisted?.stored ?? null
  const storedRef = useRef(storedSignatures)
  storedRef.current = storedSignatures
  const storedKey = [
    storedSignatures?.patientSignatureDataUrl ?? '',
    storedSignatures?.professionalSignatureDataUrl ?? '',
    storedSignatures?.signedAt ?? '',
    (storedSignatures?.selectedConsentIds ?? []).join(','),
  ].join('|')

  useEffect(() => {
    const stored = storedRef.current
    if (!stored) return
    const current = dataRef.current
    const restored = restoreMissingConsentSignatures(current, stored)
    const sameIds =
      (restored.selectedConsentIds ?? []).join('|') ===
      (current.selectedConsentIds ?? []).join('|')
    if (
      restored.patientSignatureDataUrl === current.patientSignatureDataUrl &&
      restored.professionalSignatureDataUrl === current.professionalSignatureDataUrl &&
      restored.patientSignatureMeta === current.patientSignatureMeta &&
      restored.professionalSignatureMeta === current.professionalSignatureMeta &&
      restored.signedAt === current.signedAt &&
      restored.textAccepted === current.textAccepted &&
      sameIds
    ) {
      return
    }
    onChangeRef.current(restored)
  }, [storedKey, selectedKey])

  const currentLabels = useMemo(() => signedConsentLabels([data]), [data])

  const signedLabels = useMemo(() => {
    const labels: string[] = []
    const seen = new Set<string>()
    for (const label of [...currentLabels, ...(persistedLabels ?? [])]) {
      if (seen.has(label)) continue
      seen.add(label)
      labels.push(label)
    }
    return labels
  }, [currentLabels, persistedLabels])

  const signedStatusReady = persisted !== undefined

  const activeId = useMemo(() => {
    if (activeConsentId && selectedIds.includes(activeConsentId)) return activeConsentId
    return selectedIds[0] ?? null
  }, [activeConsentId, selectedIds])

  const activeText = activeId ? getConsentTemplate(activeId)?.text : ''

  const availableOptions = CONSENT_MENU_OPTIONS.filter((t) => !selectedIds.includes(t.id))

  const update = (patch: Partial<InformedConsent>) => onChange({ ...data, ...patch })

  const applySignature = (
    field: 'patient' | 'professional',
    result: SignatureCaptureResult | null,
  ) => {
    if (!result?.dataUrl) return
    if (field === 'patient' && !guardianOk) return
    const signedAt = data.signedAt?.trim() || new Date().toISOString()
    if (field === 'patient') {
      update({
        patientSignatureDataUrl: result.dataUrl,
        patientSignatureMeta: result.metadata,
        signedAt,
        textAccepted: true,
      })
      return
    }
    update({
      professionalSignatureDataUrl: result.dataUrl,
      professionalSignatureMeta: result.metadata,
      signedAt,
    })
  }

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

  const activeTemplate = activeConsentId ? getConsentTemplate(activeConsentId) : null
  const consentDocumentId = `${patientId || 'patient'}:${activeConsentId || selectedIds.join(',') || 'consent'}`
  const consentContent =
    activeTemplate?.text ||
    (selectedIds.length > 0 ? getConsentTexts(selectedIds) : '') ||
    ''

  return (
    <section className="card">
      <h3 className={`mb-2 ${CLINICAL_SECTION_TITLE_CLASS}`}>
        {clinicalSectionTitle(
          CLINICAL_HISTORY_SECTION_NUMBERS.consentimiento,
          'Consentimiento Informado y Firmas',
        )}
      </h3>

      {!disabled && patientId && guardianOk && (activeConsentId || selectedIds.length > 0) && (
        <div className="mb-4">
          <KioskRemoteTrigger
            type="CONSENT"
            documentId={consentDocumentId}
            patientId={patientId}
            dataToSign={{
              title: activeTemplate?.label || getConsentLabel(activeConsentId || selectedIds[0]),
              contentText: consentContent,
              formData: {
                selectedConsentIds: selectedIds,
                activeConsentId,
                guardianName: data.guardianName ?? '',
                guardianDocument: data.guardianDocument ?? '',
                esMenorDeEdad: esMenor,
              },
            }}
            onSigned={({ signatureBase64 }) => {
              if (!guardianOk) return
              update({
                patientSignatureDataUrl: signatureBase64,
                textAccepted: true,
                signedAt: new Date().toISOString(),
              })
            }}
          />
        </div>
      )}
      {!disabled && patientId && esMenor && !guardianOk && (activeConsentId || selectedIds.length > 0) && (
        <p className="mb-4 text-xs text-amber-700">
          Complete los datos del acudiente antes de enviar el consentimiento a la tableta.
        </p>
      )}

      {signedStatusReady && signedLabels.length === 0 ? (
        <div
          role="alert"
          className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded mb-4"
        >
          ⚠️ Atención: No hay consentimientos informados firmados para este paciente.
        </div>
      ) : signedLabels.length > 0 ? (
        <ul
          aria-label="Consentimientos informados firmados"
          className="mb-4 list-disc space-y-1 pl-5 text-emerald-700 marker:text-emerald-700"
        >
          {signedLabels.map((label) => (
            <li key={label} className="font-medium">
              {label}
            </li>
          ))}
        </ul>
      ) : null}

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
          {esMenor
            ? 'El representante legal ha leído y acepta el(los) consentimiento(s) informado(s) seleccionado(s) '
            : 'El paciente ha leído y acepta el(los) consentimiento(s) informado(s) seleccionado(s) '}
          <span className="text-red-500">*</span>
        </span>
      </label>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <MinorPatientAuthorizationFields
            esMenorDeEdad={esMenor}
            guardianName={data.guardianName ?? ''}
            guardianDocument={data.guardianDocument ?? ''}
            disabled={disabled}
            idPrefix="consent-guardian"
            onGuardianNameChange={(guardianName) => update({ guardianName })}
            onGuardianDocumentChange={(guardianDocument) => update({ guardianDocument })}
          />
          <DigitalSignatureCanvas
            title={patientSignatureLabel}
            value={data.patientSignatureDataUrl}
            onSignatureChange={(result) => applySignature('patient', result)}
            disabled={disabled || !guardianOk}
            width={400}
            height={150}
            ariaLabel={patientSignatureLabel}
            showDetails={false}
          />
          {esMenor && !guardianOk && !disabled && (
            <p className="mt-2 text-xs text-amber-700">
              Complete nombre y documento del acudiente para habilitar la firma y el guardado.
            </p>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">Firma del profesional</h4>
          <div className="mb-3">
            <label className="label-field">Número de Documento (Cédula / ReTHUS)</label>
            <input
              disabled={disabled}
              value={data.professionalLicense}
              onChange={(e) =>
                update({
                  professionalLicense: e.target.value,
                  professionalRegistry: e.target.value,
                })
              }
              placeholder="Cédula del profesional"
              className="input-field font-mono"
            />
          </div>
          <DigitalSignatureCanvas
            value={data.professionalSignatureDataUrl}
            onSignatureChange={(result) => applySignature('professional', result)}
            disabled={disabled}
            width={400}
            height={150}
            ariaLabel="Firma del profesional"
          />
        </div>
      </div>
    </section>
  )
}

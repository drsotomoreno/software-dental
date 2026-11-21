import { useEffect, useMemo, useRef, useState } from 'react'
import type { InformedConsent, SignedConsentRecord } from '@/types/consent'
import {
  ConsentMedicolegalError,
  createConsentDraft,
  getNormalizedConsents,
  patchConsentDraft,
  revokeConsentRecord,
  signConsentRecord,
} from '@/utils/consentHelpers'
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
import { SignatureImage } from '@/components/signature/SignatureImage'
import { KioskRemoteTrigger } from '@/components/kiosk/KioskRemoteTrigger'
import { signatureMetaFromKioskForm } from '@/utils/kioskSignatureMeta'
import {
  emitKioskTriggerAction,
  onClinicKioskSignatureReceived,
} from '@/services/clinicKioskSocket'
import type { KioskConsentQueueItem } from '@/kiosk/kioskTypes'
import type { SignatureCaptureResult } from '@/types/signature'
import { formatDate } from '@/utils'
import { esMenorDeEdad } from '@/utils/patientMinorAge'

interface InformedConsentFormProps {
  informedConsent?: InformedConsent | null
  informedConsents?: SignedConsentRecord[]
  onConsentsChange: (consents: SignedConsentRecord[]) => void
  /** Persistencia inmediata en Dexie + sync tras sellar o revocar. */
  onImmediatePersist?: (consents: SignedConsentRecord[]) => void | Promise<void>
  disabled?: boolean
  patientId?: string
  patientBirthDate?: string
  patientName?: string
  patientDocument?: string
  professionalId?: string
  professionalName?: string
  professionalDocument?: string
  professionalRethus?: string
  savedSignature?: SignatureCaptureResult | null
}

function buildRenderedSnapshot(
  templateId: ConsentTemplateId,
  patientName: string,
  patientDocument: string,
): string {
  const template = getConsentTemplate(templateId)
  const stamp = new Date().toLocaleString('es-CO')
  const header = [
    `Consentimiento: ${template?.label ?? getConsentLabel(templateId)}`,
    patientName.trim() ? `Paciente: ${patientName.trim()}` : null,
    patientDocument.trim() ? `Documento: ${patientDocument.trim()}` : null,
    `Generado: ${stamp}`,
  ]
    .filter(Boolean)
    .join('\n')
  return `${header}\n\n${template?.text ?? ''}`.trim()
}

function shortHash(hash?: string): string {
  const value = String(hash || '').trim()
  if (!value) return '—'
  return `${value.slice(0, 12)}…`
}

function LockIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 2a4 4 0 00-4 4v2H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-1V6a4 4 0 00-4-4zm-2 6V6a2 2 0 114 0v2H8z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function chipClasses(record: SignedConsentRecord, active: boolean): string {
  const base =
    'inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition border'
  if (record.isLegacyUnified) {
    return `${base} ${
      active
        ? 'border-slate-500 bg-slate-600 text-white'
        : 'border-slate-300 bg-slate-100 text-slate-700'
    }`
  }
  if (record.status === 'signed') {
    return `${base} ${
      active
        ? 'border-emerald-700 bg-emerald-600 text-white'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800'
    }`
  }
  if (record.status === 'revoked') {
    return `${base} ${
      active
        ? 'border-rose-700 bg-rose-700 text-white'
        : 'border-rose-200 bg-rose-50 text-rose-800'
    }`
  }
  return `${base} ${
    active
      ? 'border-amber-600 bg-amber-500 text-white'
      : 'border-amber-200 bg-amber-50 text-amber-900'
  }`
}

function chipLabel(record: SignedConsentRecord): string {
  const title = record.title || getConsentLabel(record.templateId)
  if (record.isLegacyUnified) return `${title} · Histórico`
  if (record.status === 'signed') {
    return `${title} · Firmado${record.signedAt ? ` · ${formatDate(record.signedAt)}` : ''}`
  }
  if (record.status === 'revoked') {
    return `${title} · Revocado${record.revokedAt ? ` · ${formatDate(record.revokedAt)}` : ''}`
  }
  return `${title} · Pendiente`
}

export function InformedConsentForm({
  informedConsent = null,
  informedConsents = [],
  onConsentsChange,
  onImmediatePersist,
  disabled = false,
  patientId = '',
  patientBirthDate = '',
  patientName = '',
  patientDocument = '',
  professionalId = '',
  professionalName = '',
  professionalDocument = '',
  professionalRethus = '',
  savedSignature = null,
}: InformedConsentFormProps) {
  const records = useMemo(
    () => getNormalizedConsents({ informedConsent, informedConsents }),
    [informedConsent, informedConsents],
  )

  const [activeConsentId, setActiveConsentId] = useState<string | null>(null)
  const [pickerValue, setPickerValue] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [revokeReason, setRevokeReason] = useState('')
  const [professionalCapture, setProfessionalCapture] = useState<SignatureCaptureResult | null>(
    null,
  )
  const [forceProfessionalCanvas, setForceProfessionalCanvas] = useState(false)
  const informedConsentsRef = useRef(informedConsents)
  const sealingIdsRef = useRef(new Set<string>())
  informedConsentsRef.current = informedConsents

  const esMenor = useMemo(() => esMenorDeEdad(patientBirthDate), [patientBirthDate])
  const rethusOk = Boolean(String(professionalRethus || '').trim())
  const profileSignatureUrl = savedSignature?.dataUrl?.trim() || ''

  useEffect(() => {
    if (records.length === 0) {
      setActiveConsentId(null)
      return
    }
    if (activeConsentId && records.some((item) => item.id === activeConsentId)) return
    const preferred =
      records.find((item) => item.status === 'draft' && !item.isLegacyUnified) ?? records[0]
    setActiveConsentId(preferred?.id ?? null)
  }, [records, activeConsentId])

  const active = records.find((item) => item.id === activeConsentId) ?? null
  const editableDraft =
    active && active.status === 'draft' && !active.isLegacyUnified && !disabled ? active : null
  const readOnly =
    !active ||
    active.isLegacyUnified === true ||
    active.status === 'signed' ||
    active.status === 'revoked' ||
    disabled

  const signedCount = records.filter(
    (item) => item.status === 'signed' || item.isLegacyUnified === true,
  ).length
  const draftCount = records.filter(
    (item) => item.status === 'draft' && !item.isLegacyUnified,
  ).length

  const replaceConsent = (next: SignedConsentRecord) => {
    const modern = informedConsents.filter((item) => item.id !== next.id)
    // Los legacy no viven en informedConsents; solo mutamos el arreglo moderno.
    if (next.isLegacyUnified) return
    onConsentsChange([...modern.filter((item) => !item.isLegacyUnified), next])
  }

  useEffect(() => {
    if (!editableDraft || !esMenor || editableDraft.signerRole === 'guardian') return
    try {
      replaceConsent(patchConsentDraft(editableDraft, { signerRole: 'guardian' }))
    } catch {
      /* borrador sellado en carrera */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al detectar menor + borrador paciente
  }, [editableDraft?.id, esMenor, editableDraft?.signerRole])

  const publishModernList = (list: SignedConsentRecord[]) => {
    onConsentsChange(list.filter((item) => !item.isLegacyUnified))
  }

  const persistNow = async (list: SignedConsentRecord[]) => {
    if (!onImmediatePersist) return
    await onImmediatePersist(list.filter((item) => !item.isLegacyUnified))
  }

  const addConsent = (templateId: ConsentTemplateId) => {
    setActionError('')
    if (!rethusOk) {
      setActionError(
        'Configure su registro ReTHUS en el perfil profesional antes de crear consentimientos.',
      )
      setPickerValue('')
      return
    }
    if (!professionalId.trim() || !professionalName.trim() || !professionalDocument.trim()) {
      setActionError('Faltan datos del odontólogo en sesión (id, nombre o documento).')
      setPickerValue('')
      return
    }

    const existingDraft = informedConsents.find(
      (item) =>
        item.status === 'draft' &&
        !item.isLegacyUnified &&
        item.templateId === templateId,
    )
    if (existingDraft) {
      setActiveConsentId(existingDraft.id)
      setPickerValue('')
      return
    }

    try {
      const draft = createConsentDraft({
        templateId,
        title: getConsentLabel(templateId),
        renderedTextSnapshot: buildRenderedSnapshot(templateId, patientName, patientDocument),
        professionalId: professionalId.trim(),
        professionalName: professionalName.trim(),
        professionalDocument: professionalDocument.trim(),
        professionalRethus: professionalRethus.trim(),
        signerRole: esMenor ? 'guardian' : 'patient',
      })
      const next = [...informedConsents.filter((item) => !item.isLegacyUnified), draft]
      publishModernList(next)
      setActiveConsentId(draft.id)
      setPickerValue('')
    } catch (error) {
      setActionError(
        error instanceof ConsentMedicolegalError
          ? error.message
          : 'No se pudo crear el borrador de consentimiento.',
      )
      setPickerValue('')
    }
  }

  const updateDraft = (patch: Parameters<typeof patchConsentDraft>[1]) => {
    if (!editableDraft) return
    try {
      replaceConsent(patchConsentDraft(editableDraft, patch))
      setActionError('')
    } catch (error) {
      setActionError(
        error instanceof ConsentMedicolegalError ? error.message : 'No se pudo actualizar el borrador.',
      )
    }
  }

  const discardDraft = () => {
    if (!editableDraft) return
    const next = informedConsents.filter(
      (item) => item.id !== editableDraft.id && !item.isLegacyUnified,
    )
    publishModernList(next)
    setActionError('')
  }

  const draftRecords = useMemo(
    () =>
      records.filter((item) => item.status === 'draft' && !item.isLegacyUnified) as SignedConsentRecord[],
    [records],
  )

  const professionalSignatureForSeal =
    professionalCapture?.dataUrl?.trim() ||
    editableDraft?.professionalSignatureDataUrl?.trim() ||
    (!forceProfessionalCanvas ? profileSignatureUrl : '')

  const sealDraftRecord = async (
    draft: SignedConsentRecord,
    extras: {
      patientSignatureDataUrl?: string
      guardianName?: string
      guardianDocument?: string
      guardianRelationship?: string
      signerRole?: 'patient' | 'guardian'
    } = {},
  ) => {
    if (!rethusOk) {
      throw new ConsentMedicolegalError(
        'No se puede sellar: configure el registro ReTHUS del odontólogo en sesión.',
      )
    }
    const professionalSig =
      professionalCapture?.dataUrl?.trim() ||
      draft.professionalSignatureDataUrl?.trim() ||
      profileSignatureUrl
    if (!professionalSig) {
      throw new ConsentMedicolegalError(
        'Falta la firma del odontólogo en el perfil para auto-estampar el sello ReTHUS.',
      )
    }
    const signerRole =
      extras.signerRole || draft.signerRole || (esMenor ? 'guardian' : 'patient')
    const guardianName = extras.guardianName ?? draft.guardianName
    const guardianDocument = extras.guardianDocument ?? draft.guardianDocument
    const guardianRelationship = extras.guardianRelationship ?? draft.guardianRelationship
    if (
      (esMenor || signerRole === 'guardian') &&
      !(guardianName?.trim() && guardianDocument?.trim() && guardianRelationship?.trim())
    ) {
      throw new ConsentMedicolegalError(
        'Complete nombre, documento y parentesco del acudiente / representante legal.',
      )
    }
    const prepared = patchConsentDraft(draft, {
      textAccepted: true,
      patientSignatureDataUrl:
        extras.patientSignatureDataUrl?.trim() || draft.patientSignatureDataUrl,
      signerRole,
      guardianName,
      guardianDocument,
      guardianRelationship,
      professionalSignatureDataUrl: professionalSig,
    })
    return signConsentRecord({
      record: prepared,
      patientIsMinor: esMenor,
      textAccepted: true,
      signerRole,
      guardianName,
      guardianDocument,
      guardianRelationship,
      patientSignatureDataUrl: prepared.patientSignatureDataUrl,
      professionalSignatureDataUrl: professionalSig,
      professionalId: professionalId.trim() || draft.professionalId,
      professionalName: professionalName.trim() || draft.professionalName,
      professionalDocument: professionalDocument.trim() || draft.professionalDocument,
      professionalRethus: professionalRethus.trim() || draft.professionalRethus,
    })
  }

  const applyKioskPatientSignatureAndSeal = async (
    consentId: string,
    signatureBase64: string,
    formData?: Record<string, unknown>,
  ) => {
    if (!consentId || sealingIdsRef.current.has(consentId)) return
    const draft = informedConsentsRef.current.find(
      (item) => item.id === consentId && item.status === 'draft' && !item.isLegacyUnified,
    )
    if (!draft) return
    sealingIdsRef.current.add(consentId)
    setBusy(true)
    setActionError('')
    try {
      const meta = signatureMetaFromKioskForm(formData)
      void meta
      const signed = await sealDraftRecord(draft, {
        patientSignatureDataUrl: signatureBase64,
        signerRole:
          formData?.signerRole === 'guardian' || formData?.esMenorDeEdad === true
            ? 'guardian'
            : draft.signerRole,
        guardianName: String(formData?.guardianName || draft.guardianName || ''),
        guardianDocument: String(formData?.guardianDocument || draft.guardianDocument || ''),
        guardianRelationship: String(
          formData?.guardianRelationship || draft.guardianRelationship || '',
        ),
      })
      const next = [
        ...informedConsentsRef.current.filter(
          (item) => item.id !== signed.id && !item.isLegacyUnified,
        ),
        signed,
      ]
      publishModernList(next)
      await persistNow(next)
      setActiveConsentId(signed.id)
    } catch (error) {
      setActionError(
        error instanceof ConsentMedicolegalError
          ? error.message
          : 'No se pudo sellar el consentimiento recibido desde la tableta.',
      )
    } finally {
      sealingIdsRef.current.delete(consentId)
      setBusy(false)
    }
  }

  const applyKioskSealRef = useRef(applyKioskPatientSignatureAndSeal)
  applyKioskSealRef.current = applyKioskPatientSignatureAndSeal

  // Cola secuencial: cada firma CONSENT de la tableta sella su SignedConsentRecord.
  useEffect(() => {
    if (disabled) return
    return onClinicKioskSignatureReceived((event) => {
      if (String(event.documentType) !== 'CONSENT') return
      const formData = (event.formData || {}) as Record<string, unknown>
      const fromForm = String(formData.activeConsentId || '').trim()
      const fromDoc = String(event.documentId || '')
      const consentId =
        fromForm ||
        (fromDoc.includes(':') ? fromDoc.slice(fromDoc.indexOf(':') + 1) : fromDoc)
      if (!consentId) return
      void applyKioskSealRef.current(consentId, event.signatureBase64, formData)
    })
  }, [disabled])

  const sendAllDraftsToTablet = async () => {
    if (draftRecords.length === 0 || disabled) return
    if (!rethusOk || !profileSignatureUrl) {
      setActionError(
        'Para enviar la cola a la tableta configure ReTHUS y la rúbrica del odontólogo en el perfil (auto-sello).',
      )
      return
    }
    setBusy(true)
    setActionError('')
    try {
      const queue: KioskConsentQueueItem[] = draftRecords.map((item) => ({
        id: item.id,
        title: item.title || getConsentLabel(item.templateId),
        renderedTextSnapshot: item.renderedTextSnapshot,
        signerRole: esMenor ? 'guardian' : item.signerRole,
        guardianName: item.guardianName,
        guardianDocument: item.guardianDocument,
        guardianRelationship: item.guardianRelationship,
        templateId: item.templateId,
      }))
      const first = queue[0]
      const documentId = `${patientId || 'patient'}:${first.id}`
      const result = await emitKioskTriggerAction({
        actionType: 'CONSENT',
        payload: {
          documentId,
          patientId: patientId || 'borrador',
          title: first.title,
          contentText: first.renderedTextSnapshot,
          consentQueue: queue,
          formData: {
            consentQueue: queue,
            queueIndex: 0,
            queueTotal: queue.length,
            activeConsentId: first.id,
            templateId: first.templateId,
            signerRole: first.signerRole,
            guardianName: first.guardianName ?? '',
            guardianDocument: first.guardianDocument ?? '',
            guardianRelationship: first.guardianRelationship ?? '',
            esMenorDeEdad: esMenor,
            professionalId: professionalId.trim(),
            professionalName: professionalName.trim(),
            professionalDocument: professionalDocument.trim(),
            professionalRethus: professionalRethus.trim(),
            professionalSignatureDataUrl: profileSignatureUrl,
          },
        },
      })
      if (!result.ok) {
        throw new Error(result.message || 'No se pudo enviar la cola a la tableta.')
      }
      setActiveConsentId(first.id)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Error al enviar consentimientos a la tableta.',
      )
    } finally {
      setBusy(false)
    }
  }

  const sealActive = async () => {
    if (!editableDraft) return
    setBusy(true)
    setActionError('')
    try {
      if (!professionalSignatureForSeal && !profileSignatureUrl) {
        throw new ConsentMedicolegalError(
          'Falta la firma del odontólogo. Use la rúbrica del perfil o dibújela antes de sellar.',
        )
      }
      if (!editableDraft.textAccepted) {
        throw new ConsentMedicolegalError(
          'Debe aceptarse el texto del consentimiento informado antes de firmar.',
        )
      }
      const signed = await sealDraftRecord(editableDraft)
      const next = [
        ...informedConsents.filter((item) => item.id !== signed.id && !item.isLegacyUnified),
        signed,
      ]
      publishModernList(next)
      await persistNow(next)
      setActiveConsentId(signed.id)
      setProfessionalCapture(null)
      setForceProfessionalCanvas(false)
    } catch (error) {
      setActionError(
        error instanceof ConsentMedicolegalError
          ? error.message
          : 'No se pudo sellar el consentimiento.',
      )
    } finally {
      setBusy(false)
    }
  }

  const confirmRevoke = async () => {
    if (!active || active.status !== 'signed' || active.isLegacyUnified) return
    setBusy(true)
    setActionError('')
    try {
      const revoked = revokeConsentRecord({
        record: active,
        revokedReason: revokeReason,
        revokedByUserId: professionalId.trim() || 'unknown-professional',
      })
      const next = [
        ...informedConsents.filter((item) => item.id !== revoked.id && !item.isLegacyUnified),
        revoked,
      ]
      publishModernList(next)
      await persistNow(next)
      setRevokeOpen(false)
      setRevokeReason('')
      setActiveConsentId(revoked.id)
    } catch (error) {
      setActionError(
        error instanceof ConsentMedicolegalError
          ? error.message
          : 'No se pudo registrar el desistimiento.',
      )
    } finally {
      setBusy(false)
    }
  }

  const consentDocumentId = `${patientId || 'patient'}:${active?.id || 'consent'}`
  const showGuardianFields =
    Boolean(editableDraft) && (esMenor || editableDraft?.signerRole === 'guardian')

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={CLINICAL_SECTION_TITLE_CLASS}>
            {clinicalSectionTitle(
              CLINICAL_HISTORY_SECTION_NUMBERS.consentimiento,
              'Consentimiento Informado y Firmas',
            )}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Cada procedimiento tiene su propio consentimiento inmutable (Res. 1995/1999). Firmados:{' '}
            <span className="font-semibold text-emerald-700">{signedCount}</span>
            {draftCount > 0 ? (
              <>
                {' '}
                · Pendientes:{' '}
                <span className="font-semibold text-amber-700">{draftCount}</span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {!disabled && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <KioskRemoteTrigger
              type="CONSENT"
              documentId={consentDocumentId}
              patientId={patientId || 'borrador'}
              disabled={!editableDraft || !rethusOk}
              dataToSign={{
                title: editableDraft?.title || 'Consentimiento informado',
                contentText: editableDraft?.renderedTextSnapshot || '',
                consentQueue: editableDraft
                  ? [
                      {
                        id: editableDraft.id,
                        title: editableDraft.title,
                        renderedTextSnapshot: editableDraft.renderedTextSnapshot,
                        signerRole: esMenor ? 'guardian' : editableDraft.signerRole,
                        guardianName: editableDraft.guardianName,
                        guardianDocument: editableDraft.guardianDocument,
                        guardianRelationship: editableDraft.guardianRelationship,
                        templateId: editableDraft.templateId,
                      },
                    ]
                  : undefined,
                formData: {
                  activeConsentId: editableDraft?.id ?? null,
                  templateId: editableDraft?.templateId,
                  guardianName: editableDraft?.guardianName ?? '',
                  guardianDocument: editableDraft?.guardianDocument ?? '',
                  guardianRelationship: editableDraft?.guardianRelationship ?? '',
                  esMenorDeEdad: esMenor,
                  signerRole: editableDraft?.signerRole ?? 'patient',
                  professionalSignatureDataUrl: profileSignatureUrl,
                },
              }}
            />
            {draftRecords.length > 1 ? (
              <button
                type="button"
                disabled={busy || !rethusOk || !profileSignatureUrl}
                onClick={() => void sendAllDraftsToTablet()}
                className="inline-flex items-center gap-2 rounded-lg border border-dental-300 bg-dental-50 px-3 py-2 text-sm font-semibold text-dental-900 hover:bg-dental-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enviar todos los pendientes a Tableta ({draftRecords.length})
              </button>
            ) : null}
          </div>
          <p className="text-xs text-slate-500">
            {draftRecords.length > 1
              ? 'La tableta mostrará Documento 1 de N…; al firmar cada uno se sella aquí con ReTHUS y SHA-256.'
              : editableDraft
                ? 'La tableta captura la firma del paciente/acudiente. Al recibirla se auto-estampa el odontólogo y se sella el documento.'
                : 'Seleccione o cree un consentimiento en borrador para enviarlo a la tableta.'}
          </p>
        </div>
      )}

      {!rethusOk && !disabled && (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Configure su registro ReTHUS en el perfil para poder crear y sellar consentimientos.
        </div>
      )}

      {signedCount === 0 && records.length === 0 ? (
        <div
          role="alert"
          className="rounded-lg border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-800"
        >
          No hay consentimientos informados firmados para este paciente.
        </div>
      ) : null}

      {!disabled && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs text-slate-500">
              Agregar consentimiento por procedimiento
            </label>
            <select
              value={pickerValue}
              onChange={(event) => {
                const id = event.target.value as ConsentTemplateId
                if (id) addConsent(id)
              }}
              className="input-field"
            >
              <option value="">Seleccione un procedimiento...</option>
              {CONSENT_MENU_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {records.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Consentimientos">
          {records.map((record) => {
            const activeChip = record.id === activeConsentId
            return (
              <button
                key={record.id}
                type="button"
                role="tab"
                aria-selected={activeChip}
                onClick={() => setActiveConsentId(record.id)}
                className={chipClasses(record, activeChip)}
              >
                {(record.status !== 'draft' || record.isLegacyUnified) && (
                  <LockIcon className={activeChip ? 'h-3.5 w-3.5 text-white/90' : 'h-3.5 w-3.5'} />
                )}
                <span className="truncate">{chipLabel(record)}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          No hay consentimientos. Elija un procedimiento para crear el primero.
        </p>
      )}

      {actionError ? (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {actionError}
        </div>
      ) : null}

      {active ? (
        <div className="space-y-4 rounded-xl border border-sky-100 bg-gradient-to-b from-sky-50/80 to-white p-4">
          {active.isLegacyUnified ? (
            <div className="flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-800">
              <LockIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Registro Histórico Unificado (Solo Lectura). Conserva firmas y textos de la versión
                anterior del sistema.
              </span>
            </div>
          ) : active.status === 'revoked' ? (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              <LockIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Consentimiento revocado el{' '}
                {active.revokedAt ? formatDate(active.revokedAt) : '—'} · Motivo:{' '}
                {active.revokedReason || '—'}
                {active.revokedByUserId
                  ? ` · Registrado por ${active.revokedByUserId}`
                  : ''}
              </span>
            </div>
          ) : active.status === 'signed' ? (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <LockIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Documento medicolegal inmutable · Firmado el{' '}
                {active.signedAt ? formatDate(active.signedAt) : '—'} · Hash SHA-256:{' '}
                <span className="font-mono">{shortHash(active.contentHash)}</span>
              </span>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Borrador pendiente de firma. Al sellar se congela el texto y se genera el hash SHA-256.
            </div>
          )}

          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 text-xs leading-relaxed whitespace-pre-line text-slate-700">
            {active.renderedTextSnapshot}
          </div>

          {editableDraft ? (
            <>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={editableDraft.textAccepted === true}
                  onChange={(event) => updateDraft({ textAccepted: event.target.checked })}
                  className="mt-0.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
                />
                <span className="text-sm text-slate-700">
                  Confirmo que el paciente/acudiente ha leído y comprendido este consentimiento
                  informado <span className="text-red-500">*</span>
                </span>
              </label>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Firmante
                </p>
                <div className="flex flex-wrap gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name={`signer-${editableDraft.id}`}
                      checked={editableDraft.signerRole === 'patient'}
                      disabled={esMenor}
                      onChange={() => updateDraft({ signerRole: 'patient' })}
                    />
                    Paciente
                    {esMenor ? ' (bloqueado: menor de edad)' : ''}
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name={`signer-${editableDraft.id}`}
                      checked={editableDraft.signerRole === 'guardian'}
                      onChange={() => updateDraft({ signerRole: 'guardian' })}
                    />
                    Acudiente / representante legal
                  </label>
                </div>
              </div>

              {showGuardianFields && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {esMenor && (
                    <div
                      role="alert"
                      className="sm:col-span-3 rounded border-l-4 border-amber-500 bg-amber-100 p-3 text-sm text-amber-900"
                    >
                      Paciente menor de 18 años: la firma debe ser del acudiente / representante
                      legal (nombre, documento y parentesco obligatorios).
                    </div>
                  )}
                  <div>
                    <label className="label-field">
                      Nombre del acudiente <span className="text-red-500">*</span>
                    </label>
                    <input
                      className="input-field"
                      value={editableDraft.guardianName ?? ''}
                      onChange={(event) => updateDraft({ guardianName: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label-field">
                      Documento del acudiente <span className="text-red-500">*</span>
                    </label>
                    <input
                      className="input-field font-mono"
                      value={editableDraft.guardianDocument ?? ''}
                      onChange={(event) => updateDraft({ guardianDocument: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label-field">
                      Parentesco <span className="text-red-500">*</span>
                    </label>
                    <input
                      className="input-field"
                      value={editableDraft.guardianRelationship ?? ''}
                      onChange={(event) =>
                        updateDraft({ guardianRelationship: event.target.value })
                      }
                      placeholder="Padre, madre, tutor…"
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <DigitalSignatureCanvas
                    title={
                      editableDraft.signerRole === 'guardian'
                        ? 'Firma del acudiente / representante legal'
                        : 'Firma del paciente'
                    }
                    value={editableDraft.patientSignatureDataUrl}
                    onSignatureChange={(result) => {
                      if (!result?.dataUrl) return
                      updateDraft({
                        patientSignatureDataUrl: result.dataUrl,
                        textAccepted: true,
                      })
                    }}
                    width={400}
                    height={150}
                    ariaLabel="Firma paciente o acudiente"
                    showDetails={false}
                  />
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700">
                    Sello del odontólogo tratante
                  </h4>
                  <dl className="rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs text-slate-700">
                    <div>
                      <dt className="font-medium text-slate-500">Nombre</dt>
                      <dd>{professionalName || editableDraft.professionalName || '—'}</dd>
                    </div>
                    <div className="mt-1">
                      <dt className="font-medium text-slate-500">Documento / ReTHUS</dt>
                      <dd className="font-mono">
                        {professionalDocument || editableDraft.professionalDocument || '—'}
                        {rethusOk
                          ? ` · ReTHUS ${professionalRethus || editableDraft.professionalRethus}`
                          : ' · ReTHUS pendiente'}
                      </dd>
                    </div>
                  </dl>
                  {profileSignatureUrl && !forceProfessionalCanvas ? (
                    <div className="space-y-2">
                      <p className="text-xs text-emerald-700">
                        Rúbrica del perfil lista para auto-estampa al sellar.
                      </p>
                      <SignatureImage
                        src={profileSignatureUrl}
                        alt="Firma del perfil profesional"
                        className="max-h-28 rounded-lg border border-slate-200 bg-white p-2"
                      />
                      <button
                        type="button"
                        className="text-xs text-dental-700 underline"
                        onClick={() => {
                          setForceProfessionalCanvas(true)
                          setProfessionalCapture(null)
                        }}
                      >
                        Dibujar otra firma para este consentimiento
                      </button>
                    </div>
                  ) : (
                    <DigitalSignatureCanvas
                      title="Firma del odontólogo (si no hay rúbrica en perfil)"
                      value={
                        professionalCapture?.dataUrl ||
                        editableDraft.professionalSignatureDataUrl
                      }
                      onSignatureChange={(result) => {
                        if (!result?.dataUrl) return
                        setProfessionalCapture(result)
                        updateDraft({ professionalSignatureDataUrl: result.dataUrl })
                      }}
                      width={400}
                      height={150}
                      ariaLabel="Firma del odontólogo"
                      showDetails={false}
                    />
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !rethusOk}
                  onClick={() => void sealActive()}
                  className="rounded-lg bg-dental-600 px-4 py-2 text-sm font-semibold text-white hover:bg-dental-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? 'Sellando…' : 'Sellar y Firmar Consentimiento'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={discardDraft}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Descartar borrador
                </button>
              </div>
            </>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-700">
                  {active.signerRole === 'guardian'
                    ? 'Firma del acudiente / representante legal'
                    : 'Firma del paciente'}
                </h4>
                {active.signerRole === 'guardian' && (
                  <p className="mb-2 text-xs text-slate-500">
                    {[active.guardianName, active.guardianDocument, active.guardianRelationship]
                      .filter(Boolean)
                      .join(' · ') || 'Acudiente'}
                  </p>
                )}
                {active.patientSignatureDataUrl ? (
                  <SignatureImage
                    src={active.patientSignatureDataUrl}
                    alt="Firma paciente/acudiente"
                    className="max-h-32 rounded-lg border border-slate-200 bg-white p-2"
                  />
                ) : (
                  <p className="text-sm text-slate-500">Sin imagen de firma del paciente.</p>
                )}
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-700">Firma del odontólogo</h4>
                <p className="mb-2 text-xs text-slate-500">
                  {active.professionalName || '—'}
                  {active.professionalDocument ? ` · ${active.professionalDocument}` : ''}
                  {active.professionalRethus ? ` · ReTHUS ${active.professionalRethus}` : ''}
                </p>
                {active.professionalSignatureDataUrl ? (
                  <SignatureImage
                    src={active.professionalSignatureDataUrl}
                    alt="Firma odontólogo"
                    className="max-h-32 rounded-lg border border-slate-200 bg-white p-2"
                  />
                ) : (
                  <p className="text-sm text-slate-500">Sin imagen de firma profesional.</p>
                )}
              </div>
            </div>
          )}

          {active.status === 'signed' && !active.isLegacyUnified && !disabled && (
            <div>
              <button
                type="button"
                onClick={() => {
                  setRevokeOpen(true)
                  setRevokeReason('')
                  setActionError('')
                }}
                className="text-sm text-rose-700 underline hover:text-rose-900"
              >
                Registrar desistimiento / revocar
              </button>
            </div>
          )}

          {readOnly && active.status === 'draft' && disabled ? (
            <p className="text-xs text-slate-500">Historia en solo lectura.</p>
          ) : null}
        </div>
      ) : null}

      {revokeOpen && active?.status === 'signed' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="revoke-consent-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h4 id="revoke-consent-title" className="text-base font-semibold text-slate-900">
              Confirmar desistimiento medicolegal
            </h4>
            <p className="mt-2 text-sm text-slate-600">
              El consentimiento firmado no se elimina. Se marcará como revocado conservando texto,
              firmas y hash originales. Indique el motivo (mínimo 10 caracteres).
            </p>
            <textarea
              className="input-field mt-3 min-h-[100px]"
              value={revokeReason}
              onChange={(event) => setRevokeReason(event.target.value)}
              placeholder="Motivo del desistimiento del paciente…"
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setRevokeOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy || revokeReason.trim().length < 10}
                onClick={() => void confirmRevoke()}
                className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Confirmar revocatoria
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'

import { useParams, Link, useLocation, useNavigate } from 'react-router-dom'

import { useLiveQuery } from 'dexie-react-hooks'

import { db } from '@/db/database'

import {

  ClinicalHistoryForm,

  ClinicalRecordList,

  PatientIdentificationSummary,

  RapidValuationForm,

  createEmptyClinicalForm,

} from '@/components/clinical'

import type { PatientFormData } from '@/types/patient'
import {
  DEFAULT_PATIENT_PHASE,
  isCompletedPatient,
  isValuatedOnlyPatient,
} from '@/types/patient'
import type { ValuationConsentMetadata } from '@/types/valuationConsent'

import {
  normalizeClinicalDiagnosticChart,
} from '@/types/clinicalDiagnosticChart'

import type { OdontogramData } from '@/types/odontogram'

import type { ClinicalRecordFormData, ClinicalRecord } from '@/types/clinicalRecord'

import { createDefaultOdontogram, ensureOdontogramTeeth } from '@/types/odontogram'

import { ALL_TEETH_NUMBERS, ALL_DECIDUOUS_TEETH } from '@/constants/dental'
import {
  CLINICAL_HISTORY_PAGE_TITLE_CLASS,
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'

import {

  computeContentHash,

  serializeForHash,

  getPatientByRouteId,

  getOdontogramByPatientRouteId,

  toDexiePrimaryKey,

  toPatientForeignKey,

  calcOrthodonticsBudgetTotal,
} from '@/utils'
import { getFirstBlockingClinicalBudgetIssue } from '@/utils/clinicalRipsValidation'
import { sortEvolutionNotesChronologically, verifyClinicalRecordIntegrity } from '@/utils/recordIntegrity'
import {
  ensureEvolutionNoteOutboxCreate,
  finalizeEvolutionNote,
} from '@/services/evolutionNoteService'
import { isEvolutionNoteImmutable } from '@/types/evolutionNote'
import { validateEvolutionNote } from '@/utils/evolutionNoteValidation'
import {
  clearPatientClinicalDraft,
  getPatientClinicalDraft,
  savePatientValuationDraft,
} from '@/utils/patientClinicalDraft'
import { validateAcceptTreatment } from '@/utils/patientPhase'
import {
  buildValuationConsentMetadata,
  recordValuationConsentAudit,
} from '@/utils/valuationConsent'
import {
  clinicalRecordToFormData,
  getLatestClinicalRecord,
  getLatestSignedClinicalRecord,
  normalizeClinicalRecordForExport,
} from '@/utils/clinicalRecordSnapshot'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { RipsExportForm } from '@/components/rips'
import { FhirExportForm } from '@/components/fhir'
import { ClinicalHistoryExportPanel } from '@/components/portability'
import { InvoiceLedgerPanel } from '@/components/invoices/InvoiceLedgerPanel'
import { ClinicalRecordAddendumPanel } from '@/components/clinical/ClinicalRecordAddendumPanel'
import { SignatureAuditTrail } from '@/components/clinical/SignatureAuditTrail'
import { SignConfirmationModal } from '@/components/signature/SignConfirmationModal'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import { normalizeClinicalRecordPayments } from '@/services/paymentInvoiceService'
import { useClinicalVoiceRegistry } from '@/hooks/useClinicalVoiceRegistry'
import { useClinicalAutoSave } from '@/hooks/useClinicalAutoSave'
import { VoiceClinicalAssistant, type ClinicalVoiceContext } from '@/components/voice'
import { confirmUserPassword } from '@/services/authService'
import { createDigitalSignature, validateSignatureCapture } from '@/services/signatureService'
import type { ClinicalHistoryExportFormat } from '@/types/portability'
import { EXPORT_FORMAT_LABELS } from '@/types/portability'



type ViewMode = 'edit' | 'view-record'

type ClinicalNavSection = {
  id: string
  label: string
  row?: 1 | 2
}

function validatePatientForm(form: PatientFormData): string | null {
  if (!form.documentNumber.trim()) return 'El número de documento es obligatorio.'
  if (!form.firstName.trim()) return 'Los nombres son obligatorios.'
  if (!form.lastName.trim()) return 'Los apellidos son obligatorios.'
  if (!form.birthDate) return 'La fecha de nacimiento es obligatoria.'
  if (!form.phone.trim()) return 'El teléfono es obligatorio.'
  return null
}

function patientToFormData(patient: NonNullable<Awaited<ReturnType<typeof getPatientByRouteId>>>): PatientFormData {
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...formData
  } = patient
  return formData
}



export function PatientDetailPage() {

  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const draftClinicalData = (location.state as { draftClinicalData?: ClinicalRecordFormData } | null)
    ?.draftClinicalData

  const patient = useLiveQuery(async () => {

    if (!id) return null

    return getPatientByRouteId(id)

  }, [id])

  const { user, can } = useAuth()
  const { audit } = useAudit()
  const canViewClinical = can('clinical.read')

  const [odontogram, setOdontogram] = useState<OdontogramData | null>(null)

  const [clinicalData, setClinicalData] = useState<ClinicalRecordFormData | null>(null)

  const [isLocked, setIsLocked] = useState(false)

  const [saving, setSaving] = useState(false)

  const [message, setMessage] = useState('')

  const [viewMode, setViewMode] = useState<ViewMode>('edit')

  const [viewingRecord, setViewingRecord] = useState<ClinicalRecord | null>(null)

  const [integrityStatus, setIntegrityStatus] = useState<{
    valid: boolean
    computedHash: string
  } | null>(null)

  const [showSignConfirm, setShowSignConfirm] = useState(false)

  const [activeSection, setActiveSection] = useState<string>('all')

  const [patientForm, setPatientForm] = useState<PatientFormData | null>(null)

  const [consentAccepted, setConsentAccepted] = useState(false)

  const [consentMetadata, setConsentMetadata] = useState<ValuationConsentMetadata | null>(null)

  const [budgetAccepted, setBudgetAccepted] = useState(false)

  const viewedPatientRef = useRef<string | null>(null)
  const clinicalInitForPatientRef = useRef<string | null>(null)
  const skipPatientIdentificationAutoSaveRef = useRef(true)

  const clinicalVoiceContext: ClinicalVoiceContext =
    activeSection === 'examen'
      ? 'examen'
      : activeSection === 'odontograma'
        ? 'odontograma'
        : activeSection === 'diagnosticos'
          ? 'diagnosticos'
          : 'general'

  const showClinicalVoiceAssistant =
    activeSection === 'all' ||
    activeSection === 'examen' ||
    activeSection === 'odontograma' ||
    activeSection === 'diagnosticos'

  useEffect(() => {
    setClinicalData(null)
    setIsLocked(false)
    setViewMode('edit')
    setViewingRecord(null)
    setIntegrityStatus(null)
    setMessage('')
    viewedPatientRef.current = null
    clinicalInitForPatientRef.current = null
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [id])

  useEffect(() => {
    setActiveSection(canViewClinical ? 'all' : 'identificacion')
  }, [id, canViewClinical])

  const resetHistoryView = Boolean(
    (location.state as { resetHistoryView?: boolean } | null)?.resetHistoryView,
  )

  useEffect(() => {
    if (!resetHistoryView || !canViewClinical) return
    setActiveSection('all')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [resetHistoryView, canViewClinical, location.key])

  useEffect(() => {
    if (activeSection === 'all') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    const timer = window.setTimeout(() => {
      document.getElementById(`clinical-section-${activeSection}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 50)

    return () => window.clearTimeout(timer)
  }, [activeSection])



  const professionalName = user ? `${user.firstName} ${user.lastName}` : ''

  const professionalLicense = user?.professionalLicense ?? ''

  const patientForeignKey = id ? toPatientForeignKey(id) : ''

  const clinicalEncounterId = viewingRecord?.id
    ? String(viewingRecord.id)
    : `draft-${patientForeignKey}`

  const isValuationOnly = patient ? isValuatedOnlyPatient(patient) : false
  const isTreatmentCompleted = patient ? isCompletedPatient(patient) : false

  const isArchiveView = viewMode === 'view-record'
  const livingChartLocked = false

  const showRapidValuation =
    isValuationOnly &&
    !isTreatmentCompleted &&
    viewMode === 'edit' &&
    canViewClinical &&
    Boolean(clinicalData)

  useEffect(() => {
    if (!patient) {
      setPatientForm(null)
      skipPatientIdentificationAutoSaveRef.current = true
      return
    }
    skipPatientIdentificationAutoSaveRef.current = true
    setPatientForm(patientToFormData(patient))
  }, [patient?.id])

  useEffect(() => {
    const metadata = patient?.valuationConsent ?? clinicalData?.valuationConsent ?? null
    setConsentMetadata(metadata)
    setConsentAccepted(Boolean(metadata?.consentimientoValoracionAceptado))
    setBudgetAccepted(Boolean(metadata?.consentimientoValoracionAceptado))
  }, [patient?.valuationConsent, clinicalData?.valuationConsent])

  useClinicalVoiceRegistry(
    odontogram,
    setOdontogram,
    clinicalData,
    setClinicalData,
    livingChartLocked,
  )

  const { lastSavedAt: clinicalAutoSavedAt, saving: clinicalAutoSaving } = useClinicalAutoSave({
    patientRouteId: id,
    clinicalData,
    odontogram,
    enabled: Boolean(id) && Boolean(clinicalData) && !isArchiveView,
    onOdontogramPersisted: (persisted) => {
      setOdontogram((prev) => {
        if (!prev || prev.id === persisted.id) return prev
        return persisted
      })
    },
  })

  const clinicalAutoSaveLabel = clinicalAutoSaving
    ? 'Guardando…'
    : clinicalAutoSavedAt
      ? `Guardado automáticamente ${new Date(clinicalAutoSavedAt).toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
        })}`
      : null



  useEffect(() => {
    if (!id || patient === undefined || patient === null) return
    if (patient.treatmentCompleted) return

    let cancelled = false

    async function loadOdontogram() {
      const draft = await getPatientClinicalDraft(patientForeignKey)
      if (cancelled) return

      if (draft?.odontogramDraft) {
        setOdontogram(
          ensureOdontogramTeeth({
            ...draft.odontogramDraft,
            dentitionType: draft.odontogramDraft.dentitionType ?? 'permanente',
            isInitialState: draft.odontogramDraft.isInitialState ?? true,
          }),
        )
        return
      }

      const existing = await getOdontogramByPatientRouteId(id)
      if (cancelled) return

      if (existing) {
        setOdontogram(
          ensureOdontogramTeeth({
            ...existing,
            dentitionType: existing.dentitionType ?? 'permanente',
            isInitialState: existing.isInitialState ?? true,
          }),
        )
      } else {
        setOdontogram(
          createDefaultOdontogram(
            patientForeignKey,
            [...ALL_TEETH_NUMBERS, ...ALL_DECIDUOUS_TEETH],
            'mixta',
          ),
        )
      }
    }

    void loadOdontogram()

    return () => {
      cancelled = true
    }
  }, [id, patientForeignKey, patient?.id, patient?.treatmentCompleted])

  useEffect(() => {
    if (!patient || !id) return
    if (viewedPatientRef.current === id) return
    viewedPatientRef.current = id
    audit({
      action: 'VIEW_PATIENT',
      resourceType: 'patient',
      resourceId: id,
      details: `${patient.documentType} ${patient.documentNumber} — ${patient.firstName} ${patient.lastName}`,
    })
  }, [patient?.id, id, audit])

  useEffect(() => {
    if (!id || patient === undefined || patient === null) return
    if (clinicalInitForPatientRef.current === id) return

    let cancelled = false
    let loadCompleted = false

    async function loadOdontogramFromDb() {
      if (!id) return
      const existing = await getOdontogramByPatientRouteId(id)
      if (cancelled || !existing) return
      setOdontogram(
        ensureOdontogramTeeth({
          ...existing,
          dentitionType: existing.dentitionType ?? 'permanente',
          isInitialState: existing.isInitialState ?? true,
        }),
      )
    }

    async function applyClinicalRecord(record: ClinicalRecord, archive: boolean) {
      const safeRecord = normalizeClinicalRecordForExport(record)
      if (archive) {
        setViewingRecord(safeRecord)
        setViewMode('view-record')
      } else {
        setViewingRecord(null)
        setViewMode('edit')
      }
      let loadedWithWarning = false
      try {
        setClinicalData(clinicalRecordToFormData(safeRecord, professionalLicense))
      } catch {
        loadedWithWarning = true
        setClinicalData(createEmptyClinicalForm(professionalLicense, professionalLicense))
        setMessage('La historia guardada tiene un formato antiguo. Se muestra la estructura base.')
      }
      await loadOdontogramFromDb()
      setIsLocked(archive)
      setActiveSection('all')
      if (!loadedWithWarning) {
        setMessage(
          archive
            ? 'Atención firmada (snapshot). El odontograma, plan y exámenes del expediente siguen editables. Las evoluciones firmadas no se modifican.'
            : 'Historia clínica activa. Las evoluciones firmadas son inmutables (Res. 1995/1999); odontograma, demografía, plan y exámenes siguen editables.',
        )
      }
      clinicalInitForPatientRef.current = id
      loadCompleted = true
    }

    async function initClinicalData() {
      try {
        if (patientForeignKey && !draftClinicalData) {
          let hasInProgressDraft = false
          try {
            const draft = await getPatientClinicalDraft(patientForeignKey)
            hasInProgressDraft = Boolean(draft?.clinicalDraft || draft?.valuationDraft)
          } catch {
            hasInProgressDraft = false
          }

          if (!hasInProgressDraft) {
            const signedRecord = await getLatestSignedClinicalRecord(patientForeignKey)
            if (signedRecord) {
              if (cancelled) return
              await applyClinicalRecord(signedRecord, false)
              return
            }
          }
        }

        if (patient?.treatmentCompleted && patientForeignKey) {
          const signedRecord = await getLatestSignedClinicalRecord(patientForeignKey)
          if (signedRecord) {
            if (cancelled) return
            await applyClinicalRecord(signedRecord, false)
            return
          }

          const latestRecord = await getLatestClinicalRecord(patientForeignKey)
          if (latestRecord) {
            if (cancelled) return
            await applyClinicalRecord(latestRecord, false)
            return
          }
        }

        const emptyForm = createEmptyClinicalForm(professionalLicense, professionalLicense)
        const base: ClinicalRecordFormData = {
          ...emptyForm,
          ...(draftClinicalData ?? {}),
          diagnosticChart: normalizeClinicalDiagnosticChart(draftClinicalData?.diagnosticChart),
        }

        if (patient?.valuationConsent && !base.valuationConsent) {
          base.valuationConsent = patient.valuationConsent
        }

        let loadedAgendaNotes = false
        let loadedDraft = false

        if (patientForeignKey) {
          try {
            const draft = await getPatientClinicalDraft(patientForeignKey)
            if (draft?.clinicalDraft && !draftClinicalData) {
              const clinicalDraft = draft.clinicalDraft
              Object.assign(base, {
                ...clinicalDraft,
                budget: clinicalDraft.budget ?? base.budget,
                budgetItems: clinicalDraft.budgetItems ?? base.budgetItems,
                treatmentPlan: clinicalDraft.treatmentPlan ?? base.treatmentPlan,
                diagnoses: clinicalDraft.diagnoses ?? base.diagnoses,
                diagnosticChart: normalizeClinicalDiagnosticChart(clinicalDraft.diagnosticChart),
              })
              loadedDraft = true
            } else if (draft?.valuationDraft && !draftClinicalData) {
              Object.assign(base, {
                ...draft.valuationDraft,
                budget: draft.valuationDraft.budget ?? base.budget,
                budgetItems: draft.valuationDraft.budgetItems ?? base.budgetItems,
                treatmentPlan: draft.valuationDraft.treatmentPlan ?? base.treatmentPlan,
                diagnoses: draft.valuationDraft.diagnoses ?? base.diagnoses,
                diagnosticChart: normalizeClinicalDiagnosticChart(
                  draft.valuationDraft.diagnosticChart,
                ),
              })
              loadedDraft = true
            }
            if (draft?.evolutionNotes?.length) {
              const existingIds = new Set((base.evolutionNotes ?? []).map((note) => note.id))
              const pendingNotes = draft.evolutionNotes.filter((note) => !existingIds.has(note.id))
              if (pendingNotes.length > 0) {
                base.evolutionNotes = sortEvolutionNotesChronologically([
                  ...(base.evolutionNotes ?? []),
                  ...pendingNotes,
                ])
                loadedAgendaNotes = true
              }
            }
          } catch {
            // Borrador opcional: no bloquear la carga de la historia.
          }
        }

        if (cancelled) return

        if (patient?.treatmentCompleted) {
          await loadOdontogramFromDb()
        }

        setClinicalData(base)
        clinicalInitForPatientRef.current = id
        loadCompleted = true
        if (patient?.treatmentCompleted) {
          setActiveSection('all')
          if (loadedDraft) {
            setMessage('Historia clínica cargada desde borrador guardado.')
          }
        }

        if (draftClinicalData) {
          setMessage('Borrador de historia clínica cargado desde el registro del paciente.')
          setActiveSection('all')
        } else if (loadedAgendaNotes) {
          setMessage(
            'Se cargaron notas de evolución pendientes desde la agenda (p. ej. inasistencias).',
          )
        }
      } catch {
        if (cancelled) return
        setClinicalData(createEmptyClinicalForm(professionalLicense, professionalLicense))
        clinicalInitForPatientRef.current = id
        loadCompleted = true
        setMessage('No se pudo cargar la historia clínica. Intente abrir el paciente de nuevo.')
      }
    }

    void initClinicalData()

    return () => {
      cancelled = true
      if (!loadCompleted) {
        clinicalInitForPatientRef.current = null
      }
    }
  }, [
    id,
    patient?.id,
    patient?.treatmentCompleted,
    patient?.valuationConsent,
    professionalLicense,
    draftClinicalData,
    patientForeignKey,
  ])



  const handleSaveOdontogram = useCallback(async () => {

    if (!odontogram || !patientForeignKey) return

    const payload = {

      ...odontogram,

      patientId: patientForeignKey,

      updatedAt: new Date().toISOString(),

    }

    if (odontogram.id) {

      await db.odontograms.update(odontogram.id, payload)

    } else {

      const newId = await db.odontograms.add(payload)

      setOdontogram({ ...payload, id: String(newId) })

    }

    setMessage('Odontograma guardado correctamente.')

    await audit({
      action: 'UPDATE_ODONTOGRAM',
      resourceType: 'odontogram',
      resourceId: String(odontogram.id ?? patientForeignKey),
      details: `Paciente ${patientForeignKey}`,
    })

  }, [odontogram, patientForeignKey, audit])

  const persistPatientIdentification = useCallback(async () => {
    if (!id || !patientForm) {
      return { ok: false as const, error: 'No hay datos de identificación para guardar.' }
    }
    if (!can('patients.write')) {
      return { ok: false as const, error: 'No tiene permisos para actualizar datos del paciente.' }
    }

    const validationError = validatePatientForm(patientForm)
    if (validationError) {
      return { ok: false as const, error: validationError }
    }

    const key = toDexiePrimaryKey(id)
    const current = await db.patients.get(key)
    if (!current) {
      return { ok: false as const, error: 'Paciente no encontrado.' }
    }

    const documentNumber = patientForm.documentNumber.trim()
    const duplicate = await db.patients.where('documentNumber').equals(documentNumber).first()
    if (duplicate && String(duplicate.id) !== String(current.id)) {
      return {
        ok: false as const,
        error: 'Ya existe otro paciente con este número de documento.',
      }
    }

    await db.patients.update(key, {
      ...patientForm,
      documentNumber,
      firstName: patientForm.firstName.trim(),
      lastName: patientForm.lastName.trim(),
      phone: patientForm.phone.trim(),
      email: patientForm.email?.trim() || undefined,
      address: patientForm.address?.trim() || undefined,
      city: patientForm.city?.trim() || undefined,
      insurer: patientForm.insurer?.trim() || undefined,
      occupation: patientForm.occupation?.trim() || undefined,
      companionName: patientForm.companionName?.trim() || undefined,
      companionPhone: patientForm.companionPhone?.trim() || undefined,
      companionRelationship: patientForm.companionRelationship?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    })

    await audit({
      action: 'UPDATE_PATIENT',
      resourceType: 'patient',
      resourceId: id,
      details: `${patientForm.documentType} ${documentNumber} — teléfono/dirección u otros datos de identificación`,
    })

    return { ok: true as const }
  }, [id, patientForm, can, audit])

  useEffect(() => {
    if (!id || !patientForm || !can('patients.write')) return
    if (skipPatientIdentificationAutoSaveRef.current) {
      skipPatientIdentificationAutoSaveRef.current = false
      return
    }
    if (validatePatientForm(patientForm)) return

    const timer = window.setTimeout(() => {
      void persistPatientIdentification()
    }, 1600)

    return () => window.clearTimeout(timer)
  }, [id, patientForm, persistPatientIdentification, can])

  const handleSavePatientIdentification = async () => {
    setSaving(true)
    setMessage('')
    try {
      const result = await persistPatientIdentification()
      setMessage(
        result.ok
          ? 'Datos de identificación actualizados.'
          : result.error,
      )
    } catch {
      setMessage('No se pudieron guardar los datos de identificación.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveDraft = async () => {
    setSaving(true)
    setMessage('')
    try {
      const patientResult = patientForm ? await persistPatientIdentification() : { ok: true as const }
      if (!patientResult.ok) {
        setMessage(patientResult.error)
        return
      }
      if (odontogram && patientForeignKey) {
        await handleSaveOdontogram()
        setMessage('Datos de identificación y borrador clínico guardados.')
      } else {
        setMessage('Datos de identificación actualizados.')
      }
    } catch {
      setMessage('No se pudo guardar el borrador.')
    } finally {
      setSaving(false)
    }
  }

  const persistValuationDraft = useCallback(async () => {
    if (!id || !clinicalData || !patientForm || !odontogram) return

    const metadata = consentMetadata ?? clinicalData.valuationConsent ?? undefined
    const valuationDraft: ClinicalRecordFormData = {
      ...clinicalData,
      valuationConsent: metadata ?? null,
    }

    await db.patients.update(toDexiePrimaryKey(id), {
      ...patientForm,
      valuationConsent: metadata,
      updatedAt: new Date().toISOString(),
    })

    await savePatientValuationDraft(id, valuationDraft)

    const odontogramPayload = {
      ...odontogram,
      patientId: patientForeignKey,
      updatedAt: new Date().toISOString(),
    }

    if (odontogram.id) {
      await db.odontograms.update(odontogram.id, odontogramPayload)
    } else {
      const newId = await db.odontograms.add(odontogramPayload)
      setOdontogram({ ...odontogramPayload, id: String(newId) })
    }
  }, [
    id,
    clinicalData,
    patientForm,
    odontogram,
    consentMetadata,
    patientForeignKey,
  ])

  const handleSaveValuation = async () => {
    if (!patientForm) return

    const validationError = validatePatientForm(patientForm)
    if (validationError) {
      setMessage(validationError)
      return
    }

    setSaving(true)
    try {
      await persistValuationDraft()
      setMessage('Valoración guardada correctamente.')
    } catch {
      setMessage('Error al guardar la valoración.')
    } finally {
      setSaving(false)
    }
  }

  const handleAcceptTreatmentValuation = async () => {
    if (!patientForm || !clinicalData) return

    const patientError = validatePatientForm(patientForm)
    if (patientError) {
      setMessage(`Complete los datos del paciente: ${patientError}`)
      return
    }

    if (!consentAccepted) {
      setMessage('Debe aceptar el consentimiento de valoración.')
      return
    }

    const validationError = validateAcceptTreatment(clinicalData)
    if (validationError) {
      setMessage(validationError)
      return
    }

    const metadata = buildValuationConsentMetadata(user?.id)
    setConsentMetadata(metadata)
    setClinicalData({ ...clinicalData, valuationConsent: metadata })
    setBudgetAccepted(true)
    setMessage(
      'Consentimiento y presupuesto registrados. Puede pasar a la historia completa cuando lo desee.',
    )
  }

  const handleConvertToFullHistory = async () => {
    if (!id || !patientForm) return

    const validationError = validatePatientForm(patientForm)
    if (validationError) {
      setMessage(validationError)
      return
    }

    setSaving(true)
    try {
      await persistValuationDraft()

      if (consentMetadata) {
        await recordValuationConsentAudit({
          user: user ?? null,
          resourceId: id,
          metadata: consentMetadata,
          patientLabel: `${patientForm.documentType} ${patientForm.documentNumber}`,
        })
      }

      await db.patients.update(toDexiePrimaryKey(id), {
        valuationOnly: false,
        phase: budgetAccepted ? 'TRATAMIENTO_ACEPTADO' : DEFAULT_PATIENT_PHASE,
        updatedAt: new Date().toISOString(),
      })

      setMessage('Paciente pasó a historia clínica completa.')
      setActiveSection('all')
    } catch {
      setMessage('Error al pasar a historia completa.')
    } finally {
      setSaving(false)
    }
  }

  const handleMoveToCompletedPatients = async () => {
    if (!id || !patient) return

    if (!can('patients.write')) {
      setMessage('No tiene permisos para actualizar el estado del paciente.')
      return
    }

    setSaving(true)
    try {
      if (odontogram) {
        await handleSaveOdontogram()
      }

      if (clinicalData) {
        await savePatientValuationDraft(id, clinicalData)
      }

      await db.patients.update(toDexiePrimaryKey(id), {
        treatmentCompleted: true,
        updatedAt: new Date().toISOString(),
      })

      await audit({
        action: 'VIEW_PATIENT',
        resourceType: 'patient',
        resourceId: id,
        details: `${patient.documentType} ${patient.documentNumber} — tratamiento marcado como terminado`,
      })

      navigate('/pacientes-terminados')
    } catch {
      setMessage('Error al pasar el paciente a tratamientos terminados.')
    } finally {
      setSaving(false)
    }
  }

  const handleReactivatePatient = async () => {
    if (!id || !patient) return

    if (!can('patients.write')) {
      setMessage('No tiene permisos para actualizar el estado del paciente.')
      return
    }

    setSaving(true)
    try {
      await db.patients.update(toDexiePrimaryKey(id), {
        treatmentCompleted: false,
        updatedAt: new Date().toISOString(),
      })

      setMessage('Paciente reactivado en Pacientes Activos.')
      navigate('/pacientes')
    } catch {
      setMessage('Error al reactivar el paciente.')
    } finally {
      setSaving(false)
    }
  }



  const validateClinical = (): boolean => {

    if (!clinicalData) return false

    if (!clinicalData.anamnesis.chiefComplaint.trim()) {

      setMessage('El motivo de consulta es obligatorio.')

      return false

    }

    if (
      clinicalData.diagnoses.length === 0 &&
      clinicalData.diagnosticChart.entries.length === 0
    ) {

      setMessage('Debe registrar al menos un diagnóstico en el esquema por pieza.')

      return false

    }

    if (!clinicalData.treatmentPlan.some((item) => item.procedure.trim())) {

      setMessage('El plan de tratamiento debe incluir al menos un procedimiento.')

      return false

    }

    const hasOrthodonticsBudget =
      clinicalData.orthodonticsBudget?.active &&
      calcOrthodonticsBudgetTotal(clinicalData.orthodonticsBudget) > 0

    if (
      !clinicalData.budgetItems.some((item) => item.procedure.trim()) &&
      !hasOrthodonticsBudget
    ) {

      setMessage('El presupuesto debe incluir al menos un tratamiento o el presupuesto de ortodoncia.')

      return false

    }

    const ripsLocationIssue = getFirstBlockingClinicalBudgetIssue(clinicalData.budgetItems)
    if (ripsLocationIssue) {
      setMessage(ripsLocationIssue.message)
      return false
    }

    if (!clinicalData.informedConsent.selectedConsentIds?.length) {

      setMessage('Debe seleccionar al menos un consentimiento informado según el procedimiento.')

      return false

    }

    if (!clinicalData.informedConsent.textAccepted) {

      setMessage('El paciente debe aceptar el consentimiento informado.')

      return false

    }

    if (!clinicalData.informedConsent.patientSignatureDataUrl) {

      setMessage('La firma del paciente es obligatoria.')

      return false

    }

    if (!clinicalData.informedConsent.professionalSignatureDataUrl) {

      setMessage('La firma del profesional es obligatoria.')

      return false

    }

    const patientSigError = validateSignatureCapture(
      clinicalData.informedConsent.patientSignatureDataUrl &&
        clinicalData.informedConsent.patientSignatureMeta
        ? {
            dataUrl: clinicalData.informedConsent.patientSignatureDataUrl,
            metadata: clinicalData.informedConsent.patientSignatureMeta,
          }
        : null,
    )
    if (patientSigError) {
      setMessage(patientSigError)
      return false
    }

    const professionalSigError = validateSignatureCapture(
      clinicalData.informedConsent.professionalSignatureDataUrl &&
        clinicalData.informedConsent.professionalSignatureMeta
        ? {
            dataUrl: clinicalData.informedConsent.professionalSignatureDataUrl,
            metadata: clinicalData.informedConsent.professionalSignatureMeta,
          }
        : null,
    )
    if (professionalSigError) {
      setMessage(professionalSigError)
      return false
    }

    return true

  }



  const handleSignAndLock = async () => {

    if (!id || !clinicalData || !odontogram || !user) return

    if (!can('clinical.sign')) {
      setMessage('No tiene permisos para firmar historias clínicas.')
      return
    }

    if (!validateClinical()) return

    setShowSignConfirm(true)

  }

  const executeSignAndLock = async (password: string) => {
    if (!id || !clinicalData || !odontogram || !user || !patient) {
      return { ok: false as const, error: 'Datos incompletos para firmar.' }
    }

    const valid = await confirmUserPassword(user.id, password)
    if (!valid) {
      return {
        ok: false as const,
        error: 'Contraseña incorrecta. La firma debe realizarse con su usuario personal.',
      }
    }

    await audit({
      action: 'CONFIRM_SIGN_PASSWORD',
      resourceType: 'clinical_record',
      resourceId: patientForeignKey,
      details: `Confirmación de identidad antes de firmar — ${user.email}`,
    })

    setSaving(true)
    setMessage('')

    try {
      await handleSaveOdontogram()

      const normalizedClinicalData = normalizeClinicalRecordPayments(clinicalData, user.id)

      const odontogramSnapshot = {
        ...odontogram,
        patientId: patientForeignKey,
        updatedAt: new Date().toISOString(),
      }

      const now = new Date().toISOString()

      const preparedNotes = (normalizedClinicalData.evolutionNotes ?? []).map((note) => ({
        ...note,
        authorUserId: note.authorUserId ?? user.id,
        authorEmail: note.authorEmail ?? user.email,
        professionalName: note.professionalName || professionalName,
        professionalLicense: note.professionalLicense || professionalLicense,
      }))

      const signedEvolutionNotes = await Promise.all(
        preparedNotes.map(async (note) => {
          if (isEvolutionNoteImmutable(note)) return note
          if (validateEvolutionNote(note).length > 0) return note
          return finalizeEvolutionNote(note, now)
        }),
      )
      const sortedEvolutionNotes = sortEvolutionNotesChronologically(signedEvolutionNotes)

      for (const note of sortedEvolutionNotes) {
        if (isEvolutionNoteImmutable(note)) {
          await ensureEvolutionNoteOutboxCreate(patientForeignKey, note)
        }
      }

      const recordPayload = {

        patientId: patientForeignKey,

        professionalId: user.id,

        anamnesis: normalizedClinicalData.anamnesis,

        stomatologicalExam: normalizedClinicalData.stomatologicalExam,

        specializedAnnexes: normalizedClinicalData.specializedAnnexes,

        diagnosticChart: normalizedClinicalData.diagnosticChart,

        odontogramSnapshot,

        diagnoses: normalizedClinicalData.diagnoses,

        diagnosisNotes: normalizedClinicalData.diagnosisNotes ?? '',

        findings: normalizedClinicalData.findings,

        treatmentPlan: normalizedClinicalData.treatmentPlan,

        treatmentPlanNotes: normalizedClinicalData.treatmentPlanNotes ?? '',

        budgetItems: normalizedClinicalData.budgetItems,

        orthodonticsBudget: normalizedClinicalData.orthodonticsBudget,

        dentalImplantsBudget: normalizedClinicalData.dentalImplantsBudget,

        budget: normalizedClinicalData.budget,

        paymentPlan: normalizedClinicalData.paymentPlan,

        paymentControl: normalizedClinicalData.paymentControl,

        orthodonticsPaymentControl: normalizedClinicalData.orthodonticsPaymentControl ?? [],

        evolutionNotes: sortedEvolutionNotes,

        informedConsent: normalizedClinicalData.informedConsent,

      }



      const contentHash = await computeContentHash(serializeForHash(recordPayload))


      const recordId = await db.clinicalRecords.add({

        patientId: patientForeignKey,

        professionalId: user.id,

        anamnesis: normalizedClinicalData.anamnesis,

        stomatologicalExam: normalizedClinicalData.stomatologicalExam,

        specializedAnnexes: normalizedClinicalData.specializedAnnexes,

        diagnosticChart: normalizedClinicalData.diagnosticChart,

        odontogramSnapshot,

        diagnoses: normalizedClinicalData.diagnoses,

        diagnosisNotes: normalizedClinicalData.diagnosisNotes ?? '',

        findings: normalizedClinicalData.findings,

        treatmentPlan: normalizedClinicalData.treatmentPlan,

        treatmentPlanNotes: normalizedClinicalData.treatmentPlanNotes ?? '',

        budgetItems: normalizedClinicalData.budgetItems,

        orthodonticsBudget: normalizedClinicalData.orthodonticsBudget,

        dentalImplantsBudget: normalizedClinicalData.dentalImplantsBudget,

        budget: normalizedClinicalData.budget,

        paymentPlan: normalizedClinicalData.paymentPlan,

        paymentControl: normalizedClinicalData.paymentControl,

        orthodonticsPaymentControl: normalizedClinicalData.orthodonticsPaymentControl ?? [],

        evolutionNotes: sortedEvolutionNotes,

        informedConsent: {

          ...normalizedClinicalData.informedConsent,

          signedAt: now,

        },

        contentHash,

        isLocked: true,

        signedAt: now,

        createdAt: now,

        updatedAt: now,

      })



      await createDigitalSignature({
        recordId: String(recordId),
        recordType: 'clinical_record',
        capture: {
          dataUrl: clinicalData.informedConsent.professionalSignatureDataUrl!,
          metadata: clinicalData.informedConsent.professionalSignatureMeta!,
        },
        contentHash,
        user,
        signedByName: professionalName,
        signedByDocument: user.documentNumber,
      })

      if (clinicalData.informedConsent.patientSignatureDataUrl) {
        await createDigitalSignature({
          recordId: String(recordId),
          recordType: 'consent',
          capture: {
            dataUrl: clinicalData.informedConsent.patientSignatureDataUrl,
            metadata: clinicalData.informedConsent.patientSignatureMeta!,
          },
          contentHash,
          user,
          signedByName: `${patient.firstName} ${patient.lastName}`,
          signedByDocument: patient.documentNumber,
        })
      }

      setClinicalData({ ...normalizedClinicalData, evolutionNotes: sortedEvolutionNotes })
      setViewMode('edit')
      setViewingRecord(null)
      setIsLocked(false)
      setShowSignConfirm(false)

      await clearPatientClinicalDraft(patientForeignKey)

      await audit({
        action: 'SIGN_CLINICAL_RECORD',
        resourceType: 'clinical_record',
        resourceId: String(recordId),
        details: `Paciente ${patient.documentType} ${patient.documentNumber} — usuario ${user.email}`,
      })

      setMessage(
        'Atención cerrada para facturación. Las evoluciones firmadas quedaron bloqueadas como folio (Res. 1995/1999). Odontograma, plan y exámenes siguen editables. Hash: ' +
          contentHash.slice(0, 16) +
          '…',
      )
      return { ok: true as const }
    } catch {
      setMessage('Error al firmar la historia clínica.')
      return { ok: false as const, error: 'Error al firmar la historia clínica.' }
    } finally {
      setSaving(false)
    }
  }



  const handleViewRecord = async (recordId: string) => {
    const key = toDexiePrimaryKey(recordId)
    const record = await db.clinicalRecords.get(key)

    if (!record) return

    const integrity = await verifyClinicalRecordIntegrity(record)
    setIntegrityStatus({ valid: integrity.valid, computedHash: integrity.computedHash })
    await audit({
      action: integrity.valid ? 'VIEW_CLINICAL_RECORD' : 'VERIFY_INTEGRITY',
      resourceType: 'clinical_record',
      resourceId: recordId,
      details: integrity.valid
        ? `Historia firmada ${record.signedAt?.slice(0, 10) ?? ''}`
        : 'Integridad comprometida — hash no coincide',
      success: integrity.valid,
    })

    const safeRecord = normalizeClinicalRecordForExport(record)

    setViewingRecord(safeRecord)

    setViewMode('view-record')

    setClinicalData(clinicalRecordToFormData(safeRecord, professionalLicense))

    const liveOdontogram = id ? await getOdontogramByPatientRouteId(id) : null
    if (liveOdontogram) {
      setOdontogram({
        ...liveOdontogram,
        dentitionType: liveOdontogram.dentitionType ?? 'permanente',
        isInitialState: liveOdontogram.isInitialState ?? false,
      })
    } else if (safeRecord.odontogramSnapshot) {
      setOdontogram(safeRecord.odontogramSnapshot)
    }

    setIsLocked(true)

  }

  const handleExportPortabilityAudit = async (
    format: ClinicalHistoryExportFormat,
    recordCount: number,
  ) => {
    if (!patient || !id) return
    await audit({
      action: 'EXPORT_PORTABILITY',
      resourceType: 'portability',
      resourceId: String(patient.id ?? id),
      details: `${EXPORT_FORMAT_LABELS[format]} — ${recordCount} atención(es) — ${patient.documentType} ${patient.documentNumber}`,
    })
    setMessage('Historia clínica exportada correctamente.')
  }

  const handleNewRecord = async () => {
    setViewMode('edit')
    setViewingRecord(null)
    setIntegrityStatus(null)
    setIsLocked(false)

    if (patientForeignKey) {
      const latest =
        (await getLatestSignedClinicalRecord(patientForeignKey)) ??
        (await getLatestClinicalRecord(patientForeignKey))
      if (latest) {
        setClinicalData(
          clinicalRecordToFormData(normalizeClinicalRecordForExport(latest), professionalLicense),
        )
      } else {
        setClinicalData(createEmptyClinicalForm(professionalLicense, professionalLicense))
      }
    } else {
      setClinicalData(createEmptyClinicalForm(professionalLicense, professionalLicense))
    }

    if (id) {
      const existing = await getOdontogramByPatientRouteId(id)
      if (existing) {
        setOdontogram({
          ...existing,
          dentitionType: existing.dentitionType ?? 'permanente',
          isInitialState: existing.isInitialState ?? false,
        })
      } else {
        setOdontogram(createDefaultOdontogram(patientForeignKey, ALL_TEETH_NUMBERS))
      }
    }

    setMessage(
      'Historia clínica activa. El bloqueo aplica solo a cada evolución firmada (Res. 1995/1999).',
    )
  }



  const sections: ClinicalNavSection[] = canViewClinical
    ? isValuationOnly && viewMode === 'edit' && !isTreatmentCompleted
      ? [{ id: 'all', label: 'Valoración rápida' }]
      : [
        { id: 'all', label: 'Historia completa', row: 1 },
        { id: 'identificacion', label: 'Identificación', row: 1 },
        { id: 'anamnesis', label: 'Anamnesis', row: 1 },
        { id: 'examen', label: 'Examen', row: 1 },
        { id: 'odontograma', label: 'Odontograma', row: 1 },
        { id: 'diagnosticos', label: 'Diagnósticos', row: 1 },
        { id: 'examenes', label: 'Exámenes', row: 1 },
        { id: 'anexos', label: 'Anexos', row: 1 },
        { id: 'tratamiento', label: 'Tratamiento', row: 1 },
        { id: 'plan-pagos', label: 'Plan de pagos', row: 1 },
        { id: 'consentimiento', label: 'Consentimiento', row: 1 },
        { id: 'evolucion', label: 'Evolución', row: 1 },
        { id: 'control-pagos', label: 'Control de pagos', row: 1 },
        ...(can('invoices.read')
          ? [
              {
                id: 'cuentas-facturas',
                label: 'Mis Cuentas y Facturas',
                row: 2 as const,
              },
            ]
          : []),
        ...(can('export.portability')
          ? [
              {
                id: 'exportacion',
                label: clinicalSectionTitle(
                  CLINICAL_HISTORY_SECTION_NUMBERS.exportacionHistoria,
                  'Exportación de Historia Clínica',
                ),
                row: 1 as const,
              },
            ]
          : []),
      ]
    : [{ id: 'identificacion', label: 'Identificación' }]

  const primarySections = sections.filter((section) => section.row !== 2)
  const secondarySections = sections.filter((section) => section.row === 2)



  if (patient === undefined) {

    return <p className="text-slate-500">Cargando paciente...</p>

  }



  if (patient === null) {

    return (

      <div className="space-y-4">

        <Link to="/pacientes" className="text-sm text-dental-600 hover:underline">

          ← Volver a pacientes

        </Link>

        <div className="card text-center">

          <p className="text-slate-700">No se encontró el paciente con ID: {id}</p>

          <Link to="/pacientes" className="btn-primary mt-4 inline-flex">

            Ir a lista de pacientes

          </Link>

        </div>

      </div>

    )

  }

  const exportPanel =
    can('export.portability') && user ? (
      <ClinicalHistoryExportPanel
        patientRouteId={id!}
        patient={patient}
        professional={user}
        clinicalData={clinicalData}
        odontogram={odontogram}
        onExported={handleExportPortabilityAudit}
      />
    ) : null

  return (

    <ErrorBoundary title="Error al cargar la historia clínica del paciente">

    <div className="space-y-6">

      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>

          <Link
            to={
              isValuationOnly
                ? '/pacientes-valorados'
                : isTreatmentCompleted
                  ? '/pacientes-terminados'
                  : '/pacientes'
            }
            className="text-sm text-dental-600 hover:underline"
          >

            ← Volver a{' '}
            {isValuationOnly
              ? 'pacientes valorados'
              : isTreatmentCompleted
                ? 'pacientes terminados'
                : 'pacientes activos'}

          </Link>

          <h1 className={`mt-1 ${CLINICAL_HISTORY_PAGE_TITLE_CLASS}`}>

            {canViewClinical
              ? showRapidValuation
                ? 'Valoración Rápida'
                : 'Historia Clínica Odontológica'
              : 'Registro del Paciente'}

          </h1>

          <p className="text-sm text-slate-500">

            {patient.firstName} {patient.lastName} — {patient.documentType}{' '}

            {patient.documentNumber}

            {patient.insurer && ` · ${patient.insurer}`}

          </p>

        </div>

        <div className="flex flex-wrap items-center gap-2">

          {clinicalAutoSaveLabel && !isArchiveView && (
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                clinicalAutoSaving
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {clinicalAutoSaveLabel}
            </span>
          )}

          {isArchiveView && (

            <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">

              Snapshot de atención firmada

            </span>

          )}

          {viewMode === 'view-record' && (

            <button type="button" onClick={() => void handleNewRecord()} className="btn-secondary text-sm">

              Volver a historia activa

            </button>

          )}

        </div>

      </div>



      {canViewClinical && !showRapidValuation && (
        <ClinicalRecordList patientId={patientForeignKey} onSelectRecord={handleViewRecord} />
      )}

      {canViewClinical && sections.length > 1 && (
      <div className="clinical-section-nav space-y-2">

        {primarySections.length > 0 && (
        <div className="flex flex-wrap gap-2">

        {primarySections.map((s) => (

          <button

            key={s.id}

            type="button"

            onClick={() => setActiveSection(s.id)}

            className={`nav-pill-sm ${

              activeSection === s.id ? 'nav-pill-active' : 'nav-pill-inactive'

            }`}

          >

            {s.label}

          </button>

        ))}

        </div>
        )}

        {secondarySections.length > 0 && (
        <div className="flex flex-wrap gap-2">

        {secondarySections.map((s) => (

          <button

            key={s.id}

            type="button"

            onClick={() => setActiveSection(s.id)}

            className={`nav-pill-sm ${

              activeSection === s.id ? 'nav-pill-active' : 'nav-pill-inactive'

            }`}

          >

            {s.label}

          </button>

        ))}

        </div>
        )}

      </div>
      )}

      {(activeSection === 'all' || activeSection === 'identificacion') && !showRapidValuation && (

        <div id="clinical-section-identificacion">

        <PatientIdentificationSummary
          patient={patient}
          form={patientForm}
          onChange={setPatientForm}
          canEdit={can('patients.write')}
          disabled={!can('patients.write')}
          saving={saving}
          onSave={() => void handleSavePatientIdentification()}
        />

        {!canViewClinical && (
          <div className="card mt-4 border-amber-200 bg-amber-50 text-sm text-amber-900">
            Su rol de recepción permite consultar y actualizar datos básicos del paciente. El acceso a
            historia clínica, odontograma y diagnósticos está restringido.
          </div>
        )}

        </div>

      )}



      {canViewClinical &&
        !clinicalData &&
        activeSection !== 'identificacion' &&
        activeSection !== 'exportacion' &&
        activeSection !== 'cuentas-facturas' && (
          <div className="card">
            <p className="text-sm text-slate-500">Cargando historia clínica...</p>
          </div>
        )}

      {canViewClinical &&
        clinicalData &&
        (activeSection === 'all' ||
          (activeSection !== 'identificacion' &&
            activeSection !== 'exportacion' &&
            activeSection !== 'cuentas-facturas')) && (

        <div className="space-y-4">

          {showClinicalVoiceAssistant && !showRapidValuation && (
            <VoiceClinicalAssistant disabled={livingChartLocked} context={clinicalVoiceContext} />
          )}

        {showRapidValuation && patientForm ? (
          <RapidValuationForm
            patientData={patientForm}
            onPatientDataChange={(data) => {
              setPatientForm(data)
              setBudgetAccepted(false)
              setConsentMetadata(null)
              setConsentAccepted(false)
            }}
            initialData={clinicalData}
            odontogram={odontogram}
            onChange={setClinicalData}
            consentAccepted={consentAccepted}
            onConsentAcceptedChange={(accepted) => {
              setConsentAccepted(accepted)
              if (!accepted) {
                setBudgetAccepted(false)
                setConsentMetadata(null)
              }
            }}
            consentRecordedAt={consentMetadata?.consentimientoTimestamp ?? null}
            onAcceptTreatment={handleAcceptTreatmentValuation}
            acceptingTreatment={saving}
            disabled={isArchiveView}
          />
        ) : (
        <ClinicalHistoryForm

          key={viewingRecord?.id ?? 'new'}

          initialData={clinicalData}

          odontogram={odontogram}

          onChange={setClinicalData}

          onOdontogramChange={setOdontogram}

          disabled={isArchiveView}
          lockLivingChart={livingChartLocked}

          professionalName={professionalName}

          professionalLicense={professionalLicense}

          authorUserId={user?.id}

          authorEmail={user?.email}

          activeSection={activeSection}

          exportSection={exportPanel}

          patientId={patientForeignKey}

          encounterId={clinicalEncounterId}

          clinicalRecordId={viewingRecord?.id}

          clinicalUser={user ?? null}

          patientName={`${patient.firstName} ${patient.lastName}`.trim()}

          patientDocument={`${patient.documentType} ${patient.documentNumber}`.trim()}

        />

        )}

        </div>

      )}



      {canViewClinical && viewingRecord && viewMode === 'view-record' && patient && user && (

        <div className="space-y-4">

          <div className="card bg-slate-50">

            <p className="text-sm text-slate-600">

              Snapshot de atención firmada el{' '}

              {viewingRecord.signedAt

                ? new Date(viewingRecord.signedAt).toLocaleString('es-CO')

                : '—'}

              {viewingRecord.contentHash && (

                <span className="ml-2 font-mono text-xs text-slate-400">

                  Hash: {viewingRecord.contentHash.slice(0, 24)}…

                </span>

              )}

            </p>
            <p className="mt-2 text-xs text-slate-500">
              Res. 1995/1999: este paquete no congela el expediente. Odontograma, plan futuro y
              exámenes siguen en la historia activa; las evoluciones firmadas solo se complementan
              con notas de aclaración.
            </p>

            {integrityStatus && (
              <p
                className={`mt-2 text-sm font-medium ${
                  integrityStatus.valid ? 'text-green-700' : 'text-red-700'
                }`}
              >
                {integrityStatus.valid
                  ? '✓ Integridad verificada — el contenido coincide con el hash de firma (Ley 527).'
                  : '⚠ Integridad comprometida — el registro pudo haber sido alterado.'}
              </p>
            )}

          </div>

          <SignatureAuditTrail recordId={String(viewingRecord.id ?? '')} />

          {can('clinical.sign') && (
            <ClinicalRecordAddendumPanel
              record={viewingRecord}
              patientId={patientForeignKey}
              user={user}
            />
          )}

          {can('export.rips') && (
          <div className="card">

            <h3 className={`mb-4 ${CLINICAL_SECTION_TITLE_CLASS}`}>

              Exportar RIPS de esta atención

            </h3>

            <RipsExportForm

              sources={[{ record: viewingRecord, patient }]}

              professional={user}

              onExported={() =>
                audit({
                  action: 'EXPORT_RIPS',
                  resourceType: 'rips',
                  resourceId: String(viewingRecord.id),
                  details: 'Exportación RIPS atención individual',
                })
              }

            />

          </div>
          )}

          {can('export.fhir') && (
          <div className="card">

            <h3 className={`mb-4 ${CLINICAL_SECTION_TITLE_CLASS}`}>

              Exportar FHIR de esta atención

            </h3>

            <FhirExportForm

              sources={[{ record: viewingRecord, patient }]}

              professional={user}

              onExported={() =>
                audit({
                  action: 'EXPORT_FHIR',
                  resourceType: 'fhir',
                  resourceId: String(viewingRecord.id),
                  details: 'Exportación FHIR atención individual',
                })
              }

            />

          </div>
          )}

        </div>

      )}



      {message && (

        <div

          className={`rounded-lg px-4 py-3 text-sm ${

            message.includes('correctamente') || message.includes('guardado')

              ? 'bg-green-50 text-green-800'

              : 'bg-red-50 text-red-700'

          }`}

        >

          {message}

        </div>

      )}



      {exportPanel && activeSection === 'exportacion' && (
        <div id="clinical-section-exportacion">{exportPanel}</div>
      )}

      {can('invoices.read') && activeSection === 'cuentas-facturas' && patient && (
        <div id="clinical-section-cuentas-facturas">
          <InvoiceLedgerPanel
            patientId={patientForeignKey}
            patient={patient}
            liveClinicalData={clinicalData}
            showPatientColumn={false}
            description="Facturas de este paciente registradas en control de pagos y ortodoncia, en orden consecutivo."
          />
        </div>
      )}

      {canViewClinical &&
        !showRapidValuation &&
        !isTreatmentCompleted &&
        can('patients.write') && (
          <div className="card border border-teal-200 bg-teal-50/50">
            <h3 className="text-sm font-semibold text-slate-800">Cierre de tratamiento</h3>
            <p className="mt-1 text-sm text-slate-600">
              Cuando el tratamiento del paciente haya finalizado, puede archivarlo en Pacientes
              Terminados. Dejará de aparecer en Pacientes Activos, pero su historia clínica seguirá
              disponible.
            </p>
            <button
              type="button"
              onClick={handleMoveToCompletedPatients}
              disabled={saving}
              className="btn-primary mt-4"
            >
              {saving ? 'Procesando...' : 'Pasar a Pacientes Terminados'}
            </button>
          </div>
        )}

      {canViewClinical &&
        !showRapidValuation &&
        isTreatmentCompleted &&
        can('patients.write') && (
          <div className="card border border-dental-200 bg-dental-50/50">
            <h3 className="text-sm font-semibold text-slate-800">Reactivar paciente</h3>
            <p className="mt-1 text-sm text-slate-600">
              Si el paciente requiere continuar tratamiento o nuevas atenciones, puede devolverlo a
              Pacientes Activos. Dejará de aparecer en Pacientes Terminados.
            </p>
            <button
              type="button"
              onClick={handleReactivatePatient}
              disabled={saving}
              className="btn-primary mt-4"
            >
              {saving ? 'Procesando...' : 'Reactivar en Pacientes Activos'}
            </button>
          </div>
        )}



      {!isArchiveView && showRapidValuation && (
        <div className="sticky bottom-4 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <button
            type="button"
            onClick={handleConvertToFullHistory}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Guardando...' : 'Pasar a Historia Completa'}
          </button>
          <button
            type="button"
            onClick={handleSaveValuation}
            disabled={saving}
            className="btn-secondary"
          >
            {saving ? 'Guardando...' : 'Guardar valoración'}
          </button>
        </div>
      )}

      {!isArchiveView && !showRapidValuation && (

        <div className="sticky bottom-4 flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">

          <button type="button" onClick={() => void handleSaveDraft()} className="btn-secondary">

            Guardar borrador

          </button>

          {can('clinical.sign') && (
          <button

            type="button"

            onClick={handleSignAndLock}

            disabled={saving}

            className="btn-primary"

          >

            {saving ? 'Cerrando atención...' : 'Cerrar atención (snapshot RIPS)'}

          </button>
          )}

        </div>

      )}

      <SignConfirmationModal
        open={showSignConfirm}
        title="Cerrar atención y firmar evoluciones"
        description="Se firmarán las evoluciones completas (folios inmutables, Res. 1995/1999) y se guardará un snapshot para facturación/RIPS. El odontograma, los datos demográficos, el plan futuro y los exámenes del expediente no se bloquean. Las correcciones de un folio firmado se hacen con notas de aclaración."
        userEmail={user?.email ?? ''}
        onConfirm={executeSignAndLock}
        onCancel={() => setShowSignConfirm(false)}
      />

    </div>

    </ErrorBoundary>

  )

}



import { useEffect, useRef, useState } from 'react'
import { Tablet } from 'lucide-react'
import type { DocumentType, KioskIntakeSignature, PatientFormData } from '@/types/patient'
import type { Anamnesis } from '@/types/anamnesis'
import { esMenorDeEdad } from '@/utils/patientMinorAge'
import {
  emitKioskTriggerAction,
  getClinicKioskSocket,
  onClinicKioskCancelled,
  onClinicKioskSignatureReceived,
} from '@/services/clinicKioskSocket'

const DOCUMENT_TYPES = new Set<DocumentType>(['CC', 'TI', 'CE', 'PA', 'RC', 'NIT'])

export interface TabletAnamnesisAnswers {
  allergicToMedication: boolean
  hasHypertension: boolean
  hasDiabetes: boolean
  takesAnticoagulants: boolean
}

interface FillIdentificationOnTabletProps {
  patientKey: string
  value: PatientFormData
  onChange: (value: PatientFormData) => void
  onAnamnesis?: (answers: TabletAnamnesisAnswers) => void
}

type UiState = 'idle' | 'sending' | 'waiting' | 'done' | 'error'

function asDocumentType(raw: unknown, fallback: DocumentType): DocumentType {
  const value = String(raw || '').trim().toUpperCase()
  return DOCUMENT_TYPES.has(value as DocumentType) ? (value as DocumentType) : fallback
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function applyTabletAnamnesis(current: Anamnesis, answers: TabletAnamnesisAnswers): Anamnesis {
  const diseases = new Set(current.systemicDiseases)
  if (answers.hasHypertension) diseases.add('Hipertensión arterial')
  if (answers.hasDiabetes) diseases.add('Diabetes mellitus')
  const medications = new Set(current.criticalMedications)
  if (answers.takesAnticoagulants) {
    medications.add('Anticoagulantes o antiagregantes plaquetarios')
  }
  return {
    ...current,
    allergies: answers.allergicToMedication
      ? {
          ...current.allergies,
          medications: current.allergies.medications.trim() || 'Reportada en tableta',
        }
      : current.allergies,
    allergiesNoReporta: answers.allergicToMedication ? false : current.allergiesNoReporta,
    systemicDiseases: [...diseases],
    systemicDiseasesNoReporta: diseases.size > 0 ? false : current.systemicDiseasesNoReporta,
    criticalMedications: [...medications],
  }
}

/**
 * Envía la identificación vacía o ya escrita a la tableta y rellena el formulario al volver.
 */
export function FillIdentificationOnTablet({
  patientKey,
  value,
  onChange,
  onAnamnesis,
}: FillIdentificationOnTabletProps) {
  const documentId = `identificacion:${patientKey}`
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const onAnamnesisRef = useRef(onAnamnesis)
  valueRef.current = value
  onChangeRef.current = onChange
  onAnamnesisRef.current = onAnamnesis
  const [ui, setUi] = useState<UiState>(value.kioskIntakeSignature?.patientSignatureDataUrl ? 'done' : 'idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getClinicKioskSocket()
    const stopSigned = onClinicKioskSignatureReceived((event) => {
      if (String(event.documentType) !== 'INTAKE') return
      if (String(event.documentId || '') !== documentId) return
      const current = valueRef.current
      const datos = asRecord(event.formData?.datosBasicos)
      const anamnesis = asRecord(event.formData?.anamnesis)
      if (!datos) return

      const firstName = String(datos.firstName || current.firstName || '').trim()
      const lastName = String(datos.lastName || current.lastName || '').trim()
      const documentNumber = String(datos.documentNumber || current.documentNumber || '').trim()
      const guardianName = String(datos.guardianName || '').trim()
      const guardianDocument = String(datos.guardianDocument || '').trim()
      const minor = datos.esMenorDeEdad === true || esMenorDeEdad(String(datos.birthDate || ''))
      const signedAt = event.signedAt || new Date().toISOString()
      const signature: KioskIntakeSignature = {
        patientSignatureDataUrl: event.signatureBase64,
        signedAt,
        signerName: minor && guardianName ? guardianName : `${firstName} ${lastName}`.trim(),
        signerDocument: minor && guardianDocument ? guardianDocument : documentNumber,
        signerIsGuardian: minor,
        ipAddress: event.ipAddress,
        kioskDeviceId: event.kioskDeviceId,
      }

      onChangeRef.current({
        ...current,
        firstName: firstName || current.firstName,
        lastName: lastName || current.lastName,
        documentType: asDocumentType(datos.documentType, current.documentType),
        documentNumber: documentNumber || current.documentNumber,
        birthDate: String(datos.birthDate || current.birthDate || ''),
        phone: String(datos.phone || current.phone || '').trim(),
        email: String(datos.email || current.email || '').trim(),
        companionName: minor && guardianName ? guardianName : current.companionName,
        companionRelationship:
          minor && guardianName ? current.companionRelationship || 'Acudiente' : current.companionRelationship,
        kioskIntakeSignature: signature,
      })

      if (anamnesis && onAnamnesisRef.current) {
        onAnamnesisRef.current({
          allergicToMedication: anamnesis.allergicToMedication === true,
          hasHypertension: anamnesis.hasHypertension === true,
          hasDiabetes: anamnesis.hasDiabetes === true,
          takesAnticoagulants: anamnesis.takesAnticoagulants === true,
        })
      }

      setError(null)
      setUi('done')
    })
    const stopCancelled = onClinicKioskCancelled((event) => {
      if (String(event.actionType) !== 'INTAKE') return
      if (event.documentId && String(event.documentId) !== documentId) return
      if (event.reason === 'viewed') return
      setUi('idle')
      setError('El paciente no terminó el registro en la tableta.')
    })
    return () => {
      stopSigned()
      stopCancelled()
    }
  }, [documentId])

  const send = async () => {
    if (ui === 'sending' || ui === 'waiting') return
    setError(null)
    setUi('sending')
    const result = await emitKioskTriggerAction({
      actionType: 'INTAKE',
      payload: {
        documentId,
        patientId: patientKey,
        title: 'Datos de identificación',
        contentText: 'Complete sus datos y firme al final.',
        formData: {
          esMenorDeEdad: esMenorDeEdad(value.birthDate),
          datosBasicos: {
            firstName: value.firstName || '',
            lastName: value.lastName || '',
            documentType: value.documentType || 'CC',
            documentNumber: value.documentNumber || '',
            birthDate: value.birthDate || '',
            phone: value.phone || '',
            email: value.email || '',
            esMenorDeEdad: esMenorDeEdad(value.birthDate),
          },
        },
      },
    })
    if (!result.ok) {
      setUi('error')
      setError(result.message || 'No se pudo abrir el formulario en la tableta.')
      return
    }
    setUi('waiting')
  }

  if (ui === 'done') {
    return (
      <div
        className="inline-flex max-w-md items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm"
        role="status"
      >
        <span aria-hidden>✓</span>
        Datos e identificación completados por el paciente
      </div>
    )
  }

  const waiting = ui === 'waiting' || ui === 'sending'

  return (
    <div className="flex max-w-xl flex-col items-stretch gap-2">
      <button
        type="button"
        onClick={() => {
          void send()
        }}
        disabled={waiting}
        className={`inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl px-5 py-3 text-base font-semibold shadow-md transition disabled:cursor-wait ${
          waiting
            ? 'border border-amber-300 bg-amber-50 text-amber-950 shadow-none'
            : 'bg-teal-700 text-white shadow-teal-900/15 hover:bg-teal-800'
        }`}
      >
        {waiting ? (
          <span className="h-3 w-3 animate-pulse rounded-full bg-amber-500" aria-hidden />
        ) : (
          <Tablet className="h-6 w-6" aria-hidden />
        )}
        {ui === 'sending'
          ? 'Abriendo la tableta…'
          : waiting
            ? 'Esperando que el paciente complete sus datos...'
            : 'Diligenciar en Tableta'}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}

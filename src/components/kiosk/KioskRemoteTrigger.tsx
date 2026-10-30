import { useEffect, useMemo, useState } from 'react'
import { Tablet } from 'lucide-react'
import type { KioskActionType, KioskTriggerPayload } from '@/kiosk/kioskTypes'
import {
  emitKioskTriggerAction,
  getClinicKioskSocket,
  onClinicKioskCancelled,
  onClinicKioskSignatureReceived,
} from '@/services/clinicKioskSocket'

export interface KioskRemoteTriggerProps {
  type: KioskActionType
  documentId: string
  patientId: string
  /** Texto o campos a mostrar/firmar en la tableta. */
  dataToSign: KioskTriggerPayload
  disabled?: boolean
  className?: string
  /** Se llama cuando la tableta confirma la firma de este documento. */
  onSigned?: (input: {
    signatureBase64: string
    formData?: Record<string, unknown>
    documentType: KioskActionType
  }) => void
}

type TriggerUiState = 'idle' | 'sending' | 'waiting' | 'signed' | 'error'

/**
 * Botón reutilizable: envía el documento a la tableta esclava de la clínica.
 */
export function KioskRemoteTrigger({
  type,
  documentId,
  patientId,
  dataToSign,
  disabled = false,
  className = '',
  onSigned,
}: KioskRemoteTriggerProps) {
  const [ui, setUi] = useState<TriggerUiState>('idle')
  const [error, setError] = useState<string | null>(null)

  const payload = useMemo<KioskTriggerPayload>(
    () => ({
      documentId,
      patientId,
      title: dataToSign.title || '',
      contentText: dataToSign.contentText || '',
      formData: {
        ...(dataToSign.formData || {}),
        documentId,
        patientId,
      },
    }),
    [dataToSign.contentText, dataToSign.formData, dataToSign.title, documentId, patientId],
  )

  useEffect(() => {
    getClinicKioskSocket()
    const stopSigned = onClinicKioskSignatureReceived((event) => {
      const sameDocument =
        String(event.documentId || '') === String(documentId) ||
        (type === 'INTAKE' && String(event.documentType) === 'INTAKE')
      const sameType = String(event.documentType) === type
      if (!sameType) return
      if (type !== 'INTAKE' && !sameDocument) return

      setUi('signed')
      setError(null)
      onSigned?.({
        signatureBase64: event.signatureBase64,
        formData: event.formData,
        documentType: type,
      })
    })
    const stopCancelled = onClinicKioskCancelled((event) => {
      const sameType = String(event.actionType) === type
      const sameDocument =
        !event.documentId ||
        String(event.documentId) === String(documentId) ||
        type === 'INTAKE'
      if (!sameType || !sameDocument) return
      setUi('idle')
      setError('El paciente no completó la firma en la tableta (tiempo agotado).')
    })
    return () => {
      stopSigned()
      stopCancelled()
    }
  }, [documentId, onSigned, type])

  const sendToTablet = async () => {
    if (disabled || ui === 'sending' || ui === 'waiting') return
    setError(null)
    setUi('sending')
    const result = await emitKioskTriggerAction({ actionType: type, payload })
    if (!result.ok) {
      setUi('error')
      setError(result.message || 'No se pudo enviar a la tableta.')
      return
    }
    setUi('waiting')
  }

  if (ui === 'signed') {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 ${className}`}
        role="status"
      >
        <span aria-hidden>✓</span>
        Firmado digitalmente en tableta
      </div>
    )
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <button
        type="button"
        disabled={disabled || ui === 'sending' || ui === 'waiting'}
        onClick={() => {
          void sendToTablet()
        }}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
          ui === 'waiting'
            ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
            : 'border-slate-200 bg-white text-slate-800 hover:border-dental-400 hover:bg-dental-50'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <Tablet
          className={`h-4 w-4 ${ui === 'waiting' ? 'animate-pulse text-emerald-600' : 'text-dental-700'}`}
          aria-hidden
        />
        {ui === 'sending'
          ? 'Enviando…'
          : ui === 'waiting'
            ? 'Enviado a tableta (Esperando firma del paciente…)'
            : 'Enviar a Tableta'}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}

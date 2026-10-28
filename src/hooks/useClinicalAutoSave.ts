import { useEffect, useRef, useState } from 'react'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { OdontogramData } from '@/types/odontogram'
import { registerClinicalDraftFlush } from '@/services/clinicalSyncState'
import { savePatientClinicalDraft } from '@/utils/patientClinicalDraft'
import { upsertPatientOdontogram } from '@/utils/patientId'
import { normalizeClinicalRecordPayments } from '@/services/paymentInvoiceService'

const AUTO_SAVE_DELAY_MS = 1200

async function persistOdontogram(
  patientRouteId: string,
  odontogram: OdontogramData,
): Promise<OdontogramData> {
  return upsertPatientOdontogram(patientRouteId, {
    ...odontogram,
    updatedAt: new Date().toISOString(),
  })
}

export function useClinicalAutoSave(options: {
  patientRouteId: string | undefined
  clinicalData: ClinicalRecordFormData | null
  odontogram: OdontogramData | null
  enabled: boolean
  onOdontogramPersisted?: (odontogram: OdontogramData) => void
}): { lastSavedAt: string | null; saving: boolean } {
  const { patientRouteId, clinicalData, odontogram, enabled, onOdontogramPersisted } = options
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef(false)
  const skipNextSaveRef = useRef(true)
  const onOdontogramPersistedRef = useRef(onOdontogramPersisted)
  const clinicalDataRef = useRef(clinicalData)
  const odontogramRef = useRef(odontogram)
  const enabledRef = useRef(enabled)
  const patientRouteIdRef = useRef(patientRouteId)
  onOdontogramPersistedRef.current = onOdontogramPersisted
  clinicalDataRef.current = clinicalData
  odontogramRef.current = odontogram
  enabledRef.current = enabled
  patientRouteIdRef.current = patientRouteId

  const flushAutoSave = useRef(async () => {
    if (!enabledRef.current || !patientRouteIdRef.current || !clinicalDataRef.current) return
    const patientRouteId = patientRouteIdRef.current
    const clinicalData = normalizeClinicalRecordPayments(clinicalDataRef.current)
    const odontogramToSave = odontogramRef.current
    try {
      await savePatientClinicalDraft(patientRouteId, clinicalData, odontogramToSave)
    } catch {
      // El borrador clínico se intenta primero: un fallo del odontograma no lo borra.
    }
    if (!odontogramToSave) return
    try {
      const persisted = await persistOdontogram(patientRouteId, odontogramToSave)
      onOdontogramPersistedRef.current?.(persisted)
    } catch {
      // Autoguardado silencioso.
    }
  })

  useEffect(() => {
    skipNextSaveRef.current = true
    pendingRef.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    setLastSavedAt(null)
  }, [patientRouteId])

  useEffect(() => {
    if (!enabled || !patientRouteId || !clinicalData) return

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    pendingRef.current = true

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      pendingRef.current = false
      setSaving(true)
      void flushAutoSave
        .current()
        .then(() => setLastSavedAt(new Date().toISOString()))
        .catch(() => {})
        .finally(() => setSaving(false))
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [patientRouteId, clinicalData, odontogram, enabled])

  useEffect(() => {
    const cancelScheduled = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      pendingRef.current = false
    }

    /** Documento legal: al salir / ocultar siempre persiste el borrador actual. */
    const flushNow = () => {
      cancelScheduled()
      void flushAutoSave.current()
    }

    const flushNowAndWait = async () => {
      cancelScheduled()
      await flushAutoSave.current()
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushNow()
    }

    registerClinicalDraftFlush(flushNowAndWait)
    window.addEventListener('beforeunload', flushNow)
    window.addEventListener('pagehide', flushNow)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      registerClinicalDraftFlush(null)
      window.removeEventListener('beforeunload', flushNow)
      window.removeEventListener('pagehide', flushNow)
      document.removeEventListener('visibilitychange', onVisibility)
      flushNow()
    }
  }, [])

  return { lastSavedAt, saving }
}

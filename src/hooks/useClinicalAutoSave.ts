import { useEffect, useRef, useState } from 'react'
import { db } from '@/db/database'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { OdontogramData } from '@/types/odontogram'
import { savePatientClinicalDraft } from '@/utils/patientClinicalDraft'
import { toPatientForeignKey } from '@/utils/patientId'
import { normalizeClinicalRecordPayments } from '@/services/paymentInvoiceService'

const AUTO_SAVE_DELAY_MS = 1200

async function persistOdontogram(
  patientRouteId: string,
  odontogram: OdontogramData,
): Promise<OdontogramData> {
  const patientId = toPatientForeignKey(patientRouteId)
  const payload = {
    ...odontogram,
    patientId,
    updatedAt: new Date().toISOString(),
  }

  if (odontogram.id) {
    await db.odontograms.update(odontogram.id, payload)
    return payload
  }

  const newId = await db.odontograms.add(payload)
  return { ...payload, id: String(newId) }
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
    try {
      let odontogramToSave = odontogramRef.current
      if (odontogramToSave) {
        odontogramToSave = await persistOdontogram(patientRouteIdRef.current, odontogramToSave)
        onOdontogramPersistedRef.current?.(odontogramToSave)
      }
      await savePatientClinicalDraft(
        patientRouteIdRef.current,
        normalizeClinicalRecordPayments(clinicalDataRef.current),
        odontogramToSave,
      )
    } catch {
      // Autoguardado silencioso.
    }
  })

  useEffect(() => {
    skipNextSaveRef.current = true
    setLastSavedAt(null)
  }, [patientRouteId])

  useEffect(() => {
    if (!enabled || !patientRouteId || !clinicalData) return

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      setSaving(true)
      void flushAutoSave
        .current()
        .then(() => setLastSavedAt(new Date().toISOString()))
        .catch(() => {})
        .finally(() => setSaving(false))
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [patientRouteId, clinicalData, odontogram, enabled])

  useEffect(() => {
    const flush = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      void flushAutoSave.current()
    }

    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [])

  return { lastSavedAt, saving }
}

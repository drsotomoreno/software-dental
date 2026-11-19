import { useEffect, useRef, useState } from 'react'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { OdontogramData } from '@/types/odontogram'
import { registerClinicalDraftFlush } from '@/services/clinicalSyncState'
import {
  resolveCanonicalDraftPatientId,
  savePatientClinicalDraft,
  savePatientValuationDraft,
} from '@/utils/patientClinicalDraft'
import { writeEmergencyClinicalDraft } from '@/utils/clinicalEmergencyDraft'
import { upsertPatientOdontogram } from '@/utils/patientId'
import { normalizeClinicalRecordPayments } from '@/services/paymentInvoiceService'
import { computeClinicalFormHash } from '../../shared/clinicalFormHash.js'

const AUTO_SAVE_DELAY_MS = 1200

export type ClinicalAutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

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
  /** Pacientes Valorados: persiste valuationDraft (no un clinicalDraft fino que lo tapa). */
  valuationOnly?: boolean
  /** Hash del formulario recién hidratado: evita autosave fantasma. */
  hydrationHash?: string | null
  onOdontogramPersisted?: (odontogram: OdontogramData) => void
  onSaveError?: (reason: string) => void
}): {
  lastSavedAt: string | null
  saving: boolean
  saveStatus: ClinicalAutoSaveStatus
  saveError: string | null
  markHydratedHash: (hash: string) => void
  flushNowAndWait: () => Promise<boolean>
} {
  const {
    patientRouteId,
    clinicalData,
    odontogram,
    enabled,
    valuationOnly = false,
    hydrationHash = null,
    onOdontogramPersisted,
    onSaveError,
  } = options
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<ClinicalAutoSaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef(false)
  const onOdontogramPersistedRef = useRef(onOdontogramPersisted)
  const onSaveErrorRef = useRef(onSaveError)
  const clinicalDataRef = useRef(clinicalData)
  const odontogramRef = useRef(odontogram)
  const enabledRef = useRef(enabled)
  const valuationOnlyRef = useRef(valuationOnly)
  const patientRouteIdRef = useRef(patientRouteId)
  const lastPersistedHashRef = useRef('')
  const clinicalRevisionRef = useRef(0)
  onOdontogramPersistedRef.current = onOdontogramPersisted
  onSaveErrorRef.current = onSaveError
  clinicalDataRef.current = clinicalData
  odontogramRef.current = odontogram
  enabledRef.current = enabled
  valuationOnlyRef.current = valuationOnly
  patientRouteIdRef.current = patientRouteId

  const markHydratedHash = (hash: string) => {
    lastPersistedHashRef.current = hash
  }

  useEffect(() => {
    if (hydrationHash) {
      lastPersistedHashRef.current = hydrationHash
    }
  }, [hydrationHash, patientRouteId])

  const writeEmergencyBackup = async (sourceHash: string) => {
    const routeId = patientRouteIdRef.current
    const data = clinicalDataRef.current
    if (!routeId || !data) return
    try {
      const { canonicalId, patientSyncId } = await resolveCanonicalDraftPatientId(routeId)
      writeEmergencyClinicalDraft({
        patientId: canonicalId,
        patientSyncId,
        clinicalRevision: clinicalRevisionRef.current + 1,
        contentHash: sourceHash,
        timestamp: new Date().toISOString(),
        clinicalData: normalizeClinicalRecordPayments(data),
        odontogram: odontogramRef.current,
        valuationOnly: valuationOnlyRef.current,
      })
    } catch {
      // Quota / private mode: el flush async sigue siendo el camino principal.
    }
  }

  const flushAutoSave = useRef(async (source: 'autosave' | 'manual_flush' = 'autosave') => {
    if (!enabledRef.current || !patientRouteIdRef.current || !clinicalDataRef.current) {
      return false
    }
    const patientRouteId = patientRouteIdRef.current
    const clinicalData = normalizeClinicalRecordPayments(clinicalDataRef.current)
    const currentHash = computeClinicalFormHash(clinicalData)
    if (currentHash && currentHash === lastPersistedHashRef.current) {
      return true
    }

    const odontogramToSave = odontogramRef.current
    setSaving(true)
    setSaveStatus('saving')
    try {
      const result = valuationOnlyRef.current
        ? await savePatientValuationDraft(patientRouteId, clinicalData, { source })
        : await savePatientClinicalDraft(patientRouteId, clinicalData, odontogramToSave, {
            source,
          })

      if (!result.ok) {
        setSaveStatus('error')
        setSaveError(result.reason)
        onSaveErrorRef.current?.(result.reason)
        await writeEmergencyBackup(currentHash)
        return false
      }

      lastPersistedHashRef.current = result.contentHash || currentHash
      clinicalRevisionRef.current = result.clinicalRevision
      setLastSavedAt(new Date().toISOString())
      setSaveStatus('saved')
      setSaveError(null)

      if (odontogramToSave) {
        try {
          const persisted = await persistOdontogram(patientRouteId, odontogramToSave)
          onOdontogramPersistedRef.current?.(persisted)
        } catch {
          // El borrador clínico ya está seguro en Dexie.
        }
      }
      return true
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Error de autoguardado'
      setSaveStatus('error')
      setSaveError(reason)
      onSaveErrorRef.current?.(reason)
      await writeEmergencyBackup(currentHash)
      return false
    } finally {
      setSaving(false)
    }
  })

  const flushNowAndWait = async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    pendingRef.current = false
    return flushAutoSave.current('manual_flush')
  }

  // Al cambiar de paciente: respaldo + persistencia del anterior (refs ya apuntan al nuevo).
  const prevRouteForFlushRef = useRef(patientRouteId)
  const prevDataForFlushRef = useRef(clinicalData)
  const prevOdontogramForFlushRef = useRef(odontogram)
  const prevValuationOnlyRef = useRef(valuationOnly)

  useEffect(() => {
    const prevRoute = prevRouteForFlushRef.current
    const prevData = prevDataForFlushRef.current
    if (prevRoute && prevRoute !== patientRouteId && prevData && enabledRef.current) {
      const hash = computeClinicalFormHash(prevData)
      if (hash && hash !== lastPersistedHashRef.current) {
        const normalized = normalizeClinicalRecordPayments(prevData)
        void writeEmergencyClinicalDraft({
          patientId: prevRoute,
          clinicalRevision: clinicalRevisionRef.current + 1,
          contentHash: hash,
          timestamp: new Date().toISOString(),
          clinicalData: normalized,
          odontogram: prevOdontogramForFlushRef.current,
          valuationOnly: prevValuationOnlyRef.current,
        })
        void (
          prevValuationOnlyRef.current
            ? savePatientValuationDraft(prevRoute, normalized, { source: 'manual_flush' })
            : savePatientClinicalDraft(
                prevRoute,
                normalized,
                prevOdontogramForFlushRef.current,
                { source: 'manual_flush' },
              )
        )
      }
      lastPersistedHashRef.current = ''
      clinicalRevisionRef.current = 0
    }
    prevRouteForFlushRef.current = patientRouteId
    prevDataForFlushRef.current = clinicalData
    prevOdontogramForFlushRef.current = odontogram
    prevValuationOnlyRef.current = valuationOnly
  }, [patientRouteId, clinicalData, odontogram, valuationOnly])

  useEffect(() => {
    pendingRef.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    setLastSavedAt(null)
    setSaveStatus('idle')
    setSaveError(null)
  }, [patientRouteId])

  useEffect(() => {
    if (!enabled || !patientRouteId || !clinicalData) return

    const hash = computeClinicalFormHash(clinicalData)
    if (!hash || hash === lastPersistedHashRef.current) return

    if (timerRef.current) clearTimeout(timerRef.current)
    pendingRef.current = true

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      pendingRef.current = false
      void flushAutoSave.current('autosave')
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

    const flushNow = () => {
      cancelScheduled()
      const data = clinicalDataRef.current
      if (data && enabledRef.current) {
        const hash = computeClinicalFormHash(data)
        if (hash && hash !== lastPersistedHashRef.current) {
          void writeEmergencyBackup(hash)
        }
      }
      void flushAutoSave.current('manual_flush')
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

  return {
    lastSavedAt,
    saving,
    saveStatus,
    saveError,
    markHydratedHash,
    flushNowAndWait,
  }
}

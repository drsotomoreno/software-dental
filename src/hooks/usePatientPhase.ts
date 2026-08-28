import { useCallback, useState } from 'react'
import { db } from '@/db/database'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { Patient, PatientPhase } from '@/types/patient'
import { normalizePatientPhase } from '@/types/patient'
import { toDexiePrimaryKey } from '@/utils'
import { validateAcceptTreatment } from '@/utils/patientPhase'

export interface AcceptTreatmentResult {
  ok: boolean
  error?: string
}

export function usePatientPhase(patient: Patient | null | undefined) {
  const phase: PatientPhase = normalizePatientPhase(patient?.phase)
  const [accepting, setAccepting] = useState(false)

  const acceptTreatment = useCallback(
    async (clinicalData: ClinicalRecordFormData): Promise<AcceptTreatmentResult> => {
      if (!patient?.id) {
        return { ok: false, error: 'Paciente no encontrado.' }
      }

      if (phase === 'TRATAMIENTO_ACEPTADO') {
        return { ok: true }
      }

      const validationError = validateAcceptTreatment(clinicalData)
      if (validationError) {
        return { ok: false, error: validationError }
      }

      setAccepting(true)
      try {
        const key = toDexiePrimaryKey(String(patient.id))
        await db.patients.update(key, {
          phase: 'TRATAMIENTO_ACEPTADO',
          updatedAt: new Date().toISOString(),
        })
        return { ok: true }
      } catch {
        return { ok: false, error: 'No se pudo guardar el cambio de fase del paciente.' }
      } finally {
        setAccepting(false)
      }
    },
    [patient?.id, phase],
  )

  return { phase, acceptTreatment, accepting }
}

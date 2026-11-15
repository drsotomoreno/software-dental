/**
 * Clasificación canónica de listados (Activos / Valorados / Terminados).
 * Usar en cliente, scripts de auditoría y smoke multi-tenant.
 * No inventar otros criterios por página.
 */

export function coerceOptionalBoolean(value) {
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'si') {
      return true
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false
  }
  return undefined
}

export function isCompletedPatient(patient) {
  return coerceOptionalBoolean(patient?.treatmentCompleted) === true
}

/**
 * Valorados: valuationOnly true gana; false (historia completa) nunca es valorado
 * aunque conserve phase VALORACION_RAPIDA.
 */
export function isValuatedOnlyPatient(patient) {
  if (isCompletedPatient(patient)) return false
  const raw = patient?.valuationOnly
  if (raw === true || raw === 'true') return true
  if (raw === false || raw === 'false') return false
  return patient?.phase === 'VALORACION_RAPIDA'
}

export function isActivePatient(patient) {
  return !isValuatedOnlyPatient(patient) && !isCompletedPatient(patient)
}

/** @returns {'activo'|'valorado'|'terminado'} */
export function classifyPatientListBucket(patient) {
  if (isCompletedPatient(patient)) return 'terminado'
  if (isValuatedOnlyPatient(patient)) return 'valorado'
  return 'activo'
}

/** Extrae flags desde registro sync { payload } o fila Dexie plana. */
export function patientFlagsFromSyncRecord(record) {
  const pay =
    record?.payload && typeof record.payload === 'object' ? record.payload : record || {}
  return {
    valuationOnly: pay.valuationOnly,
    phase: pay.phase,
    treatmentCompleted: pay.treatmentCompleted,
    documentNumber: pay.documentNumber,
    firstName: pay.firstName,
    lastName: pay.lastName,
    syncId: record?.syncId || pay.syncId,
  }
}

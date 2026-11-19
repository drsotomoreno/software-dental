/**
 * Notificaciones ligeras EMR v2 → Socket.IO (sala clinic:${clinicaId}).
 */
import { clinicEmrV2Room, getKioskIo } from '../socket/kioskSocket.js'

export const EMR_V2_PATIENT_UPDATED = 'emr:v2:patient-updated'

/**
 * Emite invalidación/frescura tras COMMIT exitoso (sin payloads clínicos pesados).
 */
export function emitEmrV2PatientUpdated({
  clinicaId,
  patientSyncId,
  section = null,
  newVersion = null,
  actorEmail = null,
  updatedAt = null,
}) {
  const clinic = String(clinicaId || '').trim()
  const syncId = String(patientSyncId || '').trim()
  if (!clinic || !syncId) return false

  const io = getKioskIo()
  const room = clinicEmrV2Room(clinic)
  if (!io || !room) return false

  const payload = {
    patientSyncId: syncId,
    section: section == null ? null : String(section),
    newVersion: newVersion == null ? null : Number(newVersion),
    actorEmail: actorEmail == null ? null : String(actorEmail),
    updatedAt: String(updatedAt || new Date().toISOString()),
  }
  io.to(room).emit(EMR_V2_PATIENT_UPDATED, payload)
  return true
}

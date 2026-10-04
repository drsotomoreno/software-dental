import { db } from '@/db/database'
import type { ClinicalRecord, ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { LocalRipsRecord, LocalRipsValidationStatus } from '@/types/localRips'
import type { Patient } from '@/types/patient'
import type { RipsUsuario } from '@/types/rips'
import type { UserProfile } from '@/types/user'
import { buildDefaultRipsMetadata, buildRipsFromRecords, normalizeNit } from '@/utils/rips'

/** Consecutivo interno MUV: prefijo RS + dígitos, sin guiones. */
export function suggestNumNotaRs(now = Date.now()): string {
  return `RS${String(now).slice(-6)}`
}

export function resolveCierreRipsHeader(input: {
  esSinFactura: boolean
  numFactura: string
  numNota: string
  numDocumentoIdObligado: string
}): {
  numDocumentoIdObligado: string
  numFactura: string | null
  tipoNota: 'RS' | null
  numNota: string | null
} {
  const nit = normalizeNit(input.numDocumentoIdObligado)
  if (input.esSinFactura) {
    return {
      numDocumentoIdObligado: nit,
      numFactura: null,
      tipoNota: 'RS',
      numNota: input.numNota.trim() || null,
    }
  }
  return {
    numDocumentoIdObligado: nit,
    numFactura: input.numFactura.trim() || null,
    tipoNota: null,
    numNota: null,
  }
}

/**
 * Arma los usuarios RIPS de la atención en curso (consulta odontológica y procedimientos).
 * Si aún no hay diagnóstico principal, el arreglo puede salir sin consultas; el validador lo rechaza.
 */
export function buildUsuariosCierreAtencion(input: {
  patient: Patient
  professional: UserProfile
  clinicalData: ClinicalRecordFormData
  clinicalRecordId?: string | number | null
}): RipsUsuario[] {
  const now = new Date().toISOString()
  const record: ClinicalRecord = {
    id: input.clinicalRecordId ?? undefined,
    patientId: String(input.patient.id ?? ''),
    professionalId: input.professional.id,
    ...input.clinicalData,
    orthodonticsPaymentControl: input.clinicalData.orthodonticsPaymentControl ?? [],
    isLocked: false,
    createdAt: now,
    updatedAt: now,
  }
  const metadata = buildDefaultRipsMetadata(input.professional)
  const result = buildRipsFromRecords(
    [{ record, patient: input.patient }],
    input.professional,
    metadata,
  )
  return result.rips.usuarios
}

export async function insertLocalRipsRecord(
  record: Omit<LocalRipsRecord, 'id' | 'createdAt'> & { createdAt?: Date },
): Promise<number> {
  const id = await db.localRipsRecords.add({
    ...record,
    createdAt: record.createdAt ?? new Date(),
  })
  return Number(id)
}

export async function updateLocalRipsRecord(
  id: number,
  patch: Partial<Pick<LocalRipsRecord, 'estadoValidacion' | 'cuv' | 'payloadJson'>>,
): Promise<void> {
  await db.localRipsRecords.update(id, patch)
}

export function validationStatusFromProcesar(data: {
  success?: boolean
  cuv?: string | null
  estadoValidacion?: string
}): LocalRipsValidationStatus {
  if (data.estadoValidacion === 'PENDIENTE' || data.estadoValidacion === 'VALIDO' || data.estadoValidacion === 'APROBADO_MSPS' || data.estadoValidacion === 'RECHAZADO') {
    return data.estadoValidacion
  }
  if (data.success && data.cuv) return 'APROBADO_MSPS'
  if (data.success) return 'VALIDO'
  return 'RECHAZADO'
}

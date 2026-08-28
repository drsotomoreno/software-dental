import { v4 as uuidv4 } from 'uuid'
import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { Patient } from '@/types/patient'
import type { UserProfile } from '@/types/user'
import type { RipsExportMetadata, RipsExportResult } from '@/types/rips'
import type { RipsValidateRequestMetadatos } from '@/types/ripsCuv'
import { buildRipsFromRecords, type RipsSourceRecord } from './rips'

export interface EncounterRipsPackage {
  /** Paquete JSON RIPS listo para validación MinSalud */
  result: RipsExportResult
  /** UUID de trazabilidad del paciente (metadatos ministerio) */
  patientUuid: string
  metadatos: RipsValidateRequestMetadatos
}

/**
 * Compila el paquete RIPS JSON tras finalizar una atención (historia firmada).
 * Incluye prestador, paciente (UUID), CIE-10 y CUPS odontológicos.
 */
export function buildRipsPackageFromEncounter(
  record: ClinicalRecord,
  patient: Patient,
  professional: UserProfile,
  metadata: RipsExportMetadata,
): EncounterRipsPackage {
  const patientUuid = uuidv4()
  const sources: RipsSourceRecord[] = [{ record, patient }]
  const result = buildRipsFromRecords(sources, professional, metadata)

  return {
    result,
    patientUuid,
    metadatos: {
      patientUuid,
      clinicalRecordIds: record.id != null ? [String(record.id)] : [],
      patientDocument: `${patient.documentType} ${patient.documentNumber}`,
    },
  }
}

import type { FiscalProfile } from '@/utils/fiscalProfile'
import type { RipsTransaction } from './rips'

/** Ciclo de vida de un RIPS temporal (pre-FEV o prestador no obligado). */
export type TemporaryRipsStatus = 'draft' | 'ready' | 'pendiente' | 'submitted' | 'linked_to_invoice'

/**
 * Registro RIPS temporal persistido en IndexedDB (`ripsTemporales`) y en
 * `rips_temporales` (SQLite de referencia). `numFactura` admite null.
 */
export interface TemporaryRipsRecord {
  id: string
  clinicId: string
  patientId?: string | null
  professionalId?: string | null
  clinicalRecordId?: string | null
  /** NIT del obligado a reportar (solo dígitos o con DV). */
  numDocumentoIdObligado: string
  /**
   * Número FEV. Null cuando el prestador es No_Obligado o cuando el RIPS
   * aún no tiene factura electrónica asociada (Res. 2275).
   */
  numFactura: string | null
  tipoNota?: string | null
  numNota?: string | null
  perfilFiscal: FiscalProfile
  status: TemporaryRipsStatus
  ripsJson: RipsTransaction
  invoiceId?: string | null
  createdAt: string
  updatedAt: string
  submittedAt?: string | null
}

export interface SaveTemporaryRipsInput {
  id?: string
  clinicId?: string
  patientId?: string | null
  professionalId?: string | null
  clinicalRecordId?: string | null
  numDocumentoIdObligado: string
  numFactura?: string | null
  tipoNota?: string | null
  numNota?: string | null
  perfilFiscal?: FiscalProfile | boolean | string | null
  status?: TemporaryRipsStatus
  ripsJson: RipsTransaction
  invoiceId?: string | null
  submittedAt?: string | null
}

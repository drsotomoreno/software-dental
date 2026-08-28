import type { EvolutionNote } from '@/types/evolutionNote'
import type { EvolutionNoteAddendum } from '@/types/evolutionNoteAddendum'
import type { ElectronicCreditNote } from '@/types/creditNote'
import type { HealthElectronicInvoiceDocument } from '@/types/healthElectronicInvoice'

/** Solo se permiten inserciones — Res. 1995/1999 y normativa DIAN (append-only). */
export type SyncOutboxAction = 'CREATE'

export type SyncOutboxEntityType =
  | 'evolution_note'
  | 'evolution_note_addendum'
  | 'electronic_invoice'
  | 'electronic_credit_note'

export type SyncOutboxPayload =
  | EvolutionNote
  | EvolutionNoteAddendum
  | HealthElectronicInvoiceDocument
  | ElectronicCreditNote

export interface SyncOutboxEntry {
  id: string
  entityType: SyncOutboxEntityType
  action: SyncOutboxAction
  patientId: string
  /** ID de entidad vinculada (nota de evolución o factura electrónica). */
  evolutionNoteId: string
  payload: SyncOutboxPayload
  createdAt: string
}

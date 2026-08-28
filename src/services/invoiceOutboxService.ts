import { db } from '@/db/database'
import type { ElectronicCreditNote } from '@/types/creditNote'
import type { HealthElectronicInvoiceDocument } from '@/types/healthElectronicInvoice'
import type { SyncOutboxEntry } from '@/types/syncOutbox'
import { generateId } from '@/utils/crypto'

export async function enqueueElectronicInvoiceOutbox(
  invoiceId: string,
  patientId: string,
  document: HealthElectronicInvoiceDocument,
): Promise<SyncOutboxEntry> {
  const entry: SyncOutboxEntry = {
    id: generateId(),
    entityType: 'electronic_invoice',
    action: 'CREATE',
    patientId,
    evolutionNoteId: invoiceId,
    payload: document,
    createdAt: new Date().toISOString(),
  }
  await db.syncOutbox.add(entry)
  return entry
}

export async function enqueueCreditNoteOutbox(
  creditNote: ElectronicCreditNote,
): Promise<SyncOutboxEntry> {
  const entry: SyncOutboxEntry = {
    id: generateId(),
    entityType: 'electronic_credit_note',
    action: 'CREATE',
    patientId: creditNote.patientId,
    evolutionNoteId: creditNote.id,
    payload: creditNote,
    createdAt: new Date().toISOString(),
  }
  await db.syncOutbox.add(entry)
  return entry
}

export async function listPendingInvoiceOutbox(): Promise<SyncOutboxEntry[]> {
  return db.syncOutbox
    .where('entityType')
    .equals('electronic_invoice')
    .toArray()
}

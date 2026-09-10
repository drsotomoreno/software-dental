import { db } from '@/db/database'
import type { SaveTemporaryRipsInput, TemporaryRipsRecord, TemporaryRipsStatus } from '@/types/ripsTemporal'
import type { RipsTransaction } from '@/types/rips'
import { generateId } from '@/utils/crypto'
import {
  DEFAULT_PERFIL_FISCAL,
  normalizePerfilFiscal,
  normalizeRipsNumFactura,
} from '@/utils/fiscalProfile'

function stampRipsJson(rips: RipsTransaction, numFactura: string | null): RipsTransaction {
  return {
    ...rips,
    numFactura,
    tipoNota: rips.tipoNota ?? null,
    numNota: rips.numNota ?? null,
  }
}

export function buildTemporaryRipsRecord(
  input: SaveTemporaryRipsInput,
  previous?: TemporaryRipsRecord | null,
): TemporaryRipsRecord {
  const now = new Date().toISOString()
  const numFactura = normalizeRipsNumFactura(input.numFactura ?? input.ripsJson.numFactura)
  const perfilFiscal = normalizePerfilFiscal(input.perfilFiscal ?? previous?.perfilFiscal)
  const status: TemporaryRipsStatus = input.status ?? previous?.status ?? 'draft'
  const clinicId = String(input.clinicId || previous?.clinicId || '').trim()

  return {
    id: input.id || previous?.id || generateId(),
    clinicId,
    patientId: input.patientId ?? previous?.patientId ?? null,
    professionalId: input.professionalId ?? previous?.professionalId ?? null,
    clinicalRecordId: input.clinicalRecordId ?? previous?.clinicalRecordId ?? null,
    numDocumentoIdObligado: String(
      input.numDocumentoIdObligado || input.ripsJson.numDocumentoIdObligado || '',
    ).trim(),
    numFactura,
    tipoNota: input.tipoNota ?? input.ripsJson.tipoNota ?? previous?.tipoNota ?? null,
    numNota: input.numNota ?? input.ripsJson.numNota ?? previous?.numNota ?? null,
    perfilFiscal: perfilFiscal || DEFAULT_PERFIL_FISCAL,
    status,
    ripsJson: stampRipsJson(input.ripsJson, numFactura),
    invoiceId: input.invoiceId ?? previous?.invoiceId ?? null,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    submittedAt: input.submittedAt ?? previous?.submittedAt ?? null,
  }
}

export async function saveTemporaryRips(input: SaveTemporaryRipsInput): Promise<TemporaryRipsRecord> {
  const previous = input.id ? ((await db.ripsTemporales.get(input.id)) ?? null) : null
  const record = buildTemporaryRipsRecord(input, previous)
  await db.ripsTemporales.put(record)
  return record
}

export async function listTemporaryRips(clinicId?: string): Promise<TemporaryRipsRecord[]> {
  const rows = clinicId
    ? await db.ripsTemporales.where('clinicId').equals(clinicId).toArray()
    : await db.ripsTemporales.toArray()
  return rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

export async function getTemporaryRips(id: string): Promise<TemporaryRipsRecord | undefined> {
  return db.ripsTemporales.get(id)
}

export async function linkTemporaryRipsToInvoice(
  id: string,
  invoiceId: string,
  numFactura: string,
): Promise<TemporaryRipsRecord | null> {
  const previous = await db.ripsTemporales.get(id)
  if (!previous) return null
  return saveTemporaryRips({
    ...previous,
    invoiceId,
    numFactura,
    status: 'linked_to_invoice',
    ripsJson: stampRipsJson(previous.ripsJson, normalizeRipsNumFactura(numFactura)),
  })
}

export async function markTemporaryRipsSubmitted(
  id: string,
  submittedAt = new Date().toISOString(),
): Promise<TemporaryRipsRecord | null> {
  const previous = await db.ripsTemporales.get(id)
  if (!previous) return null
  return saveTemporaryRips({
    ...previous,
    status: 'submitted',
    submittedAt,
    ripsJson: previous.ripsJson,
  })
}

export async function deleteTemporaryRips(id: string): Promise<void> {
  await db.ripsTemporales.delete(id)
}

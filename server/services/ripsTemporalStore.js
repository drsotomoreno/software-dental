/**
 * Persistencia servidor de RIPS temporales (numFactura nullable).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { config } from '../config.js'
import {
  normalizePerfilFiscal,
  normalizeRipsNumFactura,
  DEFAULT_PERFIL_FISCAL,
} from '../../shared/fiscalProfile.js'

const STORE_FILE = join(config.dataDir, 'rips-temporales.json')

const STATUSES = new Set(['draft', 'ready', 'submitted', 'linked_to_invoice'])

async function ensureStore() {
  await mkdir(config.dataDir, { recursive: true })
  try {
    await readFile(STORE_FILE, 'utf8')
  } catch {
    await writeFile(STORE_FILE, '[]', 'utf8')
  }
}

async function readAll() {
  await ensureStore()
  const raw = await readFile(STORE_FILE, 'utf8')
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed) ? parsed : []
}

async function writeAll(records) {
  await ensureStore()
  await writeFile(STORE_FILE, JSON.stringify(records, null, 2), 'utf8')
}

function normalizeRecord(entry = {}, previous = null) {
  const now = new Date().toISOString()
  const ripsJson = entry.ripsJson ?? entry.rips ?? previous?.ripsJson ?? {
    numDocumentoIdObligado: '',
    numFactura: null,
    tipoNota: null,
    numNota: null,
    usuarios: [],
  }
  const numFactura = normalizeRipsNumFactura(
    entry.numFactura !== undefined ? entry.numFactura : ripsJson.numFactura,
  )
  const status = STATUSES.has(entry.status) ? entry.status : previous?.status ?? 'draft'
  const perfilFiscal = normalizePerfilFiscal(entry.perfilFiscal ?? previous?.perfilFiscal)

  return {
    id: entry.id || previous?.id || randomUUID(),
    clinicId: String(entry.clinicId || previous?.clinicId || '').trim(),
    patientId: entry.patientId ?? previous?.patientId ?? null,
    professionalId: entry.professionalId ?? previous?.professionalId ?? null,
    clinicalRecordId: entry.clinicalRecordId ?? previous?.clinicalRecordId ?? null,
    numDocumentoIdObligado: String(
      entry.numDocumentoIdObligado || ripsJson.numDocumentoIdObligado || previous?.numDocumentoIdObligado || '',
    ).trim(),
    numFactura,
    tipoNota: entry.tipoNota ?? ripsJson.tipoNota ?? previous?.tipoNota ?? null,
    numNota: entry.numNota ?? ripsJson.numNota ?? previous?.numNota ?? null,
    perfilFiscal: perfilFiscal || DEFAULT_PERFIL_FISCAL,
    status,
    ripsJson: {
      ...ripsJson,
      numFactura,
      tipoNota: ripsJson.tipoNota ?? null,
      numNota: ripsJson.numNota ?? null,
    },
    invoiceId: entry.invoiceId ?? previous?.invoiceId ?? null,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    submittedAt: entry.submittedAt ?? previous?.submittedAt ?? null,
  }
}

export async function saveTemporaryRipsRecord(entry) {
  const records = await readAll()
  const index = entry?.id ? records.findIndex((item) => item.id === entry.id) : -1
  const previous = index >= 0 ? records[index] : null
  const record = normalizeRecord(entry, previous)
  if (index >= 0) records[index] = record
  else records.unshift(record)
  await writeAll(records)
  return record
}

export async function listTemporaryRipsRecords({ clinicId, limit = 100 } = {}) {
  const records = await readAll()
  const filtered = clinicId
    ? records.filter((item) => String(item.clinicId) === String(clinicId))
    : records
  return filtered.slice(0, limit)
}

export async function getTemporaryRipsRecord(id) {
  const records = await readAll()
  return records.find((item) => item.id === id) ?? null
}

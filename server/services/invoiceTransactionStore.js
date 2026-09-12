/**
 * Persistencia de transacciones/facturas con estados independientes DIAN y MUV.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { config } from '../config.js'
import {
  DEFAULT_ESTADO_DIAN,
  DEFAULT_ESTADO_MUV,
  emptyDualValidationFields,
  normalizeEstadoDian,
  normalizeEstadoMuv,
} from '../../shared/dualValidation.js'

const REGISTRY_FILE = join(config.dataDir, 'invoice-transactions.json')

async function ensureStore() {
  await mkdir(config.dataDir, { recursive: true })
  try {
    await readFile(REGISTRY_FILE, 'utf8')
  } catch {
    await writeFile(REGISTRY_FILE, '[]', 'utf8')
  }
}

async function readAll() {
  await ensureStore()
  const raw = await readFile(REGISTRY_FILE, 'utf8')
  return JSON.parse(raw)
}

async function writeAll(records) {
  await ensureStore()
  await writeFile(REGISTRY_FILE, JSON.stringify(records, null, 2), 'utf8')
}

function withDefaults(entry = {}) {
  const dual = emptyDualValidationFields()
  return {
    id: entry.id ?? randomUUID(),
    numFactura: entry.numFactura ?? null,
    numDocumentoIdObligado: entry.numDocumentoIdObligado ?? null,
    payableAmount: entry.payableAmount ?? null,
    status: entry.status ?? 'draft',
    estado_dian: normalizeEstadoDian(entry.estado_dian ?? dual.estado_dian),
    codigo_cufe: entry.codigo_cufe ?? entry.cufe ?? null,
    estado_muv: normalizeEstadoMuv(entry.estado_muv ?? dual.estado_muv),
    codigo_cuv: entry.codigo_cuv ?? entry.cuv ?? null,
    detalles_rechazo_muv: Array.isArray(entry.detalles_rechazo_muv) ? entry.detalles_rechazo_muv : [],
    dianXml: entry.dianXml ?? null,
    rips: entry.rips ?? null,
    dianErrors: Array.isArray(entry.dianErrors) ? entry.dianErrors : [],
    metadatos: entry.metadatos ?? {},
    createdAt: entry.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export async function saveInvoiceTransaction(entry) {
  const records = await readAll()
  const next = withDefaults(entry)
  const index = records.findIndex(
    (row) => row.id === next.id || (next.numFactura && row.numFactura === next.numFactura),
  )
  if (index >= 0) {
    next.id = records[index].id
    next.createdAt = records[index].createdAt
    records[index] = { ...records[index], ...next }
    await writeAll(records)
    return records[index]
  }
  records.unshift(next)
  await writeAll(records)
  return next
}

export async function getInvoiceTransaction({ id, numFactura } = {}) {
  const records = await readAll()
  if (id) return records.find((row) => row.id === id) ?? null
  if (numFactura) return records.find((row) => row.numFactura === numFactura) ?? null
  return null
}

export async function listInvoiceTransactions({ limit = 50 } = {}) {
  const records = await readAll()
  return records.slice(0, limit)
}

export { DEFAULT_ESTADO_DIAN, DEFAULT_ESTADO_MUV }

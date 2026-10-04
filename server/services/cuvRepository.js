import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { config } from '../config.js'

const REGISTRY_FILE = join(config.dataDir, 'cuv-registry.json')

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

/**
 * Persiste de forma segura un CUV aprobado por el Ministerio.
 * @param {object} entry
 */
export async function saveCuvRecord(entry) {
  const records = await readAll()
  const record = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  }
  records.unshift(record)
  await writeAll(records)
  return record
}

export async function getCuvByFactura(numFactura) {
  const records = await readAll()
  return records.find((r) => r.numFactura === numFactura && r.status === 'approved') ?? null
}

/** Cualquier registro de la factura, sin filtrar por estado. El más reciente va primero. */
export async function findCuvRecordByFactura(numFactura) {
  const records = await readAll()
  return records.find((r) => r.numFactura === numFactura) ?? null
}

export async function findPendingCuvByFactura(numFactura) {
  const records = await readAll()
  return records.find((r) => r.numFactura === numFactura && r.status === 'pending') ?? null
}

/**
 * Actualiza un registro existente conservando id y createdAt.
 * @param {string} id
 * @param {object} patch
 */
export async function updateCuvRecord(id, patch) {
  const records = await readAll()
  const index = records.findIndex((r) => r.id === id)
  if (index === -1) return null
  const current = records[index]
  const updated = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  }
  records[index] = updated
  await writeAll(records)
  return updated
}

export async function listCuvRecords({ limit = 50 } = {}) {
  const records = await readAll()
  return records.slice(0, limit)
}

export async function getCuvById(id) {
  const records = await readAll()
  return records.find((r) => r.id === id) ?? null
}

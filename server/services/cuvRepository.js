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
 * RIPS sin factura (tipoNota RS) se identifica por numNota.
 * El resto de transacciones se identifica por numFactura.
 * @param {object} entry
 * @returns {{ campo: 'numNota' | 'numFactura', valor: string }}
 */
export function resolveCuvLookupKey(entry) {
  const tipoNota = String(entry?.tipoNota ?? '').trim().toUpperCase()
  if (tipoNota === 'RS') {
    return { campo: 'numNota', valor: String(entry?.numNota ?? '').trim() }
  }
  const numFactura = entry?.numFactura == null ? '' : String(entry.numFactura).trim()
  return { campo: 'numFactura', valor: numFactura }
}

function sameCuvIdentity(item, campo, valor) {
  if (!valor) return false
  if (campo === 'numNota') {
    return (
      String(item?.tipoNota ?? '').trim().toUpperCase() === 'RS' &&
      String(item?.numNota ?? '').trim() === valor
    )
  }
  if (String(item?.tipoNota ?? '').trim().toUpperCase() === 'RS') return false
  return item?.numFactura === valor
}

/**
 * Guarda o actualiza un CUV. En RIPS sin factura la clave es numNota; si no, numFactura.
 * @param {object} entry
 */
export async function saveCuvRecord(entry) {
  const records = await readAll()
  const { campo, valor } = resolveCuvLookupKey(entry)
  const index = records.findIndex((item) => sameCuvIdentity(item, campo, valor))
  const now = new Date().toISOString()

  if (index >= 0) {
    const updated = {
      ...records[index],
      ...entry,
      id: records[index].id,
      createdAt: records[index].createdAt,
      updatedAt: now,
    }
    records[index] = updated
    await writeAll(records)
    return updated
  }

  const record = {
    id: randomUUID(),
    createdAt: now,
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

export async function getCuvByNota(numNota) {
  const nota = String(numNota ?? '').trim()
  if (!nota) return null
  const records = await readAll()
  return (
    records.find(
      (r) =>
        r.status === 'approved' &&
        String(r.tipoNota ?? '').trim().toUpperCase() === 'RS' &&
        String(r.numNota ?? '').trim() === nota,
    ) ?? null
  )
}

export async function listCuvRecords({ limit = 50 } = {}) {
  const records = await readAll()
  return records.slice(0, limit)
}

export async function getCuvById(id) {
  const records = await readAll()
  return records.find((r) => r.id === id) ?? null
}

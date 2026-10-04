import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { config } from '../config.js'
import {
  ESTADO_DIAN,
  ESTADO_MINSALUD_MUV,
  syncDualValidationAliases,
} from '../../shared/dualValidation.js'

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

function matchRecordIndex(records, entry) {
  if (entry?.id) {
    const byId = records.findIndex((record) => record.id === entry.id)
    if (byId >= 0) return byId
  }
  if (entry?.numFactura) {
    return records.findIndex((record) => record.numFactura === entry.numFactura)
  }
  return -1
}

/**
 * Crea o actualiza la transacción FEV con estados DIAN y MUV independientes.
 * Se puede persistir apenas llega el CUFE, antes del CUV.
 */
export async function upsertFevTransaction(entry = {}) {
  const records = await readAll()
  const existingIndex = matchRecordIndex(records, entry)
  const base =
    existingIndex >= 0
      ? records[existingIndex]
      : {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          estado_dian: ESTADO_DIAN.PENDIENTE,
          estado_minsalud_muv: ESTADO_MINSALUD_MUV.PENDIENTE_ENVIO,
          codigo_cufe: null,
          codigo_cuv: null,
          detalles_rechazo_muv: [],
          status: 'pending',
        }

  const record = syncDualValidationAliases({
    ...base,
    ...entry,
    id: base.id,
    createdAt: base.createdAt,
    updatedAt: new Date().toISOString(),
    estado_dian: entry.estado_dian ?? base.estado_dian ?? ESTADO_DIAN.PENDIENTE,
    estado_minsalud_muv:
      entry.estado_minsalud_muv ?? base.estado_minsalud_muv ?? ESTADO_MINSALUD_MUV.PENDIENTE_ENVIO,
    detalles_rechazo_muv: Array.isArray(entry.detalles_rechazo_muv)
      ? entry.detalles_rechazo_muv
      : (base.detalles_rechazo_muv ?? []),
  })

  if (existingIndex >= 0) {
    records[existingIndex] = record
  } else {
    records.unshift(record)
  }
  await writeAll(records)
  return record
}

/**
 * Persiste de forma segura un CUV aprobado por el Ministerio.
 * @param {object} entry
 */
export async function saveCuvRecord(entry) {
  return upsertFevTransaction({
    ...entry,
    codigo_cuv: entry.cuv ?? entry.codigo_cuv ?? null,
    estado_minsalud_muv:
      entry.estado_minsalud_muv ??
      (entry.status === 'rejected'
        ? ESTADO_MINSALUD_MUV.RECHAZADO_CON_GLOSAS
        : ESTADO_MINSALUD_MUV.APROBADO),
    status: entry.status ?? 'approved',
  })
}

export async function getCuvByFactura(numFactura) {
  const records = await readAll()
  return (
    records.find(
      (record) =>
        record.numFactura === numFactura &&
        (record.status === 'approved' ||
          record.estado_minsalud_muv === ESTADO_MINSALUD_MUV.APROBADO),
    ) ?? null
  )
}

export async function getFevTransactionByFactura(numFactura) {
  const records = await readAll()
  return records.find((record) => record.numFactura === numFactura) ?? null
}

export async function listCuvRecords({ limit = 50 } = {}) {
  const records = await readAll()
  return records.slice(0, limit)
}

export async function getCuvById(id) {
  const records = await readAll()
  return records.find((record) => record.id === id) ?? null
}

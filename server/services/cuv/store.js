import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { config, DATABASE_URL } from '../../config.js'
import { postgresSslOption } from '../durableStore.js'
import { applyCuvMigration } from '../../db/migrate.js'

const require = createRequire(import.meta.url)
const FILE_PATH = join(config.dataDir, 'cuv-expedientes.json')
const LEGACY_PATH = join(config.dataDir, 'cuv-registry.json')

/**
 * @param {unknown} value
 */
function clone(value) {
  return value == null ? value : structuredClone(value)
}

/**
 * @param {{ expedientes?: object[], intentos?: object[] }} [initial]
 */
export function createMemoryCuvStore(initial = {}) {
  const data = {
    expedientes: [...(initial.expedientes ?? [])],
    intentos: [...(initial.intentos ?? [])],
  }

  return {
    async list() {
      return data.expedientes.map((item) => clone(item))
    },
    async get(id) {
      return clone(data.expedientes.find((item) => item.id === id) ?? null)
    },
    async findMatch(query) {
      return clone(matchExpediente(data.expedientes, query))
    },
    async save(expediente) {
      const index = data.expedientes.findIndex((item) => item.id === expediente.id)
      if (index >= 0) data.expedientes[index] = clone(expediente)
      else data.expedientes.unshift(clone(expediente))
      return clone(expediente)
    },
    async addIntento(intento) {
      data.intentos.push(clone(intento))
      return clone(intento)
    },
    async intentosDe(expedienteId) {
      return data.intentos
        .filter((item) => item.expedienteId === expedienteId)
        .sort((a, b) => a.numero - b.numero)
        .map((item) => clone(item))
    },
  }
}

/**
 * @param {object[]} expedientes
 * @param {{ id?: string, invoiceId?: string, numFactura?: string, numDocumentoIdObligado?: string, cuv?: string }} query
 */
function matchExpediente(expedientes, query) {
  if (query.id) return expedientes.find((item) => item.id === query.id) ?? null
  if (query.invoiceId) {
    const found = expedientes.find((item) => item.invoiceId === query.invoiceId)
    if (found) return found
  }
  if (query.numFactura) {
    const nit = query.numDocumentoIdObligado
    const found = expedientes.find((item) => item.numFactura === query.numFactura && (!nit || item.numDocumentoIdObligado === nit))
    if (found) return found
  }
  if (query.cuv) return expedientes.find((item) => item.cuv === query.cuv) ?? null
  return null
}

/**
 * @param {string} filePath
 * @param {string} [legacyPath]
 */
export function createFileCuvStore(filePath = FILE_PATH, legacyPath = LEGACY_PATH) {
  const memory = createMemoryCuvStore()
  let loaded = false

  async function load() {
    if (loaded) return
    await mkdir(dirname(filePath), { recursive: true })
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8'))
      const expedientes = Array.isArray(parsed?.expedientes) ? parsed.expedientes : []
      const intentos = Array.isArray(parsed?.intentos) ? parsed.intentos : []
      for (const expediente of expedientes) await memory.save(expediente)
      for (const intento of intentos) await memory.addIntento(intento)
      loaded = true
    } catch {
      await importLegacy(memory, legacyPath)
      loaded = true
      await persist()
    }
  }

  async function persist() {
    const expedientes = await memory.list()
    const intentos = []
    for (const expediente of expedientes) {
      intentos.push(...await memory.intentosDe(expediente.id))
    }
    await writeFile(filePath, JSON.stringify({ expedientes, intentos }, null, 2), 'utf8')
  }

  return {
    async list() {
      await load()
      return memory.list()
    },
    async get(id) {
      await load()
      return memory.get(id)
    },
    async findMatch(query) {
      await load()
      return memory.findMatch(query)
    },
    async save(expediente) {
      await load()
      const saved = await memory.save(expediente)
      await persist()
      return saved
    },
    async addIntento(intento) {
      await load()
      const saved = await memory.addIntento(intento)
      await persist()
      return saved
    },
    async intentosDe(expedienteId) {
      await load()
      return memory.intentosDe(expedienteId)
    },
  }
}

/**
 * @param {ReturnType<typeof createMemoryCuvStore>} memory
 * @param {string} legacyPath
 */
async function importLegacy(memory, legacyPath) {
  let legacy = []
  try {
    const parsed = JSON.parse(await readFile(legacyPath, 'utf8'))
    legacy = Array.isArray(parsed) ? parsed : []
  } catch {
    legacy = []
  }
  for (const record of legacy) {
    const id = record.id ?? randomUUID()
    const estado = record.status === 'rejected' ? 'rechazado' : 'aprobado'
    await memory.save({
      id,
      invoiceId: record.invoiceId ?? null,
      clinicalRecordId: record.clinicalRecordIds?.[0] ?? record.clinicalRecordId ?? null,
      patientId: record.patientUuid ?? record.patientId ?? null,
      numFactura: record.numFactura ?? null,
      numDocumentoIdObligado: record.numDocumentoIdObligado ?? '',
      cuv: record.cuv ?? null,
      estado,
      procesoId: record.procesoId ?? null,
      fechaRadicacion: record.fechaRadicacion ?? null,
      ambiente: record.ambiente ?? null,
      modulo: record.modulo ?? null,
      source: record.source ?? null,
      tienePaquete: false,
      paquete: null,
      createdAt: record.createdAt ?? new Date().toISOString(),
      updatedAt: record.createdAt ?? new Date().toISOString(),
    })
    await memory.addIntento({
      id: randomUUID(),
      expedienteId: id,
      numero: 1,
      estado,
      httpStatus: null,
      cuv: record.cuv ?? null,
      notificaciones: [],
      rechazos: [],
      respuestaCruda: null,
      source: record.source ?? null,
      startedAt: record.createdAt ?? new Date().toISOString(),
      finishedAt: record.createdAt ?? new Date().toISOString(),
    })
  }
}

function rowToExpediente(row) {
  if (!row) return null
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    clinicalRecordId: row.clinical_record_id,
    patientId: row.patient_id,
    numFactura: row.num_factura,
    numDocumentoIdObligado: row.num_documento_id_obligado,
    cuv: row.cuv,
    estado: row.estado,
    procesoId: row.proceso_id,
    fechaRadicacion: row.fecha_radicacion,
    ambiente: row.ambiente,
    modulo: row.modulo,
    source: row.source,
    tienePaquete: row.tiene_paquete === true,
    paquete: row.package_json ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }
}

function rowToIntento(row) {
  return {
    id: row.id,
    expedienteId: row.expediente_id,
    numero: row.numero,
    estado: row.estado,
    httpStatus: row.http_status,
    cuv: row.cuv,
    notificaciones: row.notificaciones ?? [],
    rechazos: row.rechazos ?? [],
    respuestaCruda: row.respuesta_cruda ?? null,
    source: row.source,
    startedAt: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
    finishedAt: row.finished_at instanceof Date ? row.finished_at.toISOString() : row.finished_at,
  }
}

/**
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows?: object[] }>} query
 */
export function createPostgresCuvStore(query) {
  return {
    async list() {
      const { rows } = await query(`
        SELECT id, invoice_id, clinical_record_id, patient_id, num_factura,
               num_documento_id_obligado, cuv, estado, proceso_id, fecha_radicacion,
               ambiente, modulo, source, tiene_paquete, created_at, updated_at
        FROM cuv_expedientes
        ORDER BY updated_at DESC
      `)
      return (rows ?? []).map((row) => ({ ...rowToExpediente(row), paquete: null }))
    },
    async get(id) {
      const { rows } = await query('SELECT * FROM cuv_expedientes WHERE id = $1', [id])
      return rowToExpediente(rows?.[0])
    },
    async findMatch(lookup) {
      if (lookup.id) return this.get(lookup.id)
      if (lookup.invoiceId) {
        const { rows } = await query(
          'SELECT * FROM cuv_expedientes WHERE invoice_id = $1 ORDER BY updated_at DESC LIMIT 1',
          [lookup.invoiceId],
        )
        if (rows?.[0]) return rowToExpediente(rows[0])
      }
      if (lookup.numFactura) {
        const { rows } = await query(
          `SELECT * FROM cuv_expedientes
           WHERE num_factura = $1
             AND ($2::text IS NULL OR num_documento_id_obligado = $2)
           ORDER BY updated_at DESC LIMIT 1`,
          [lookup.numFactura, lookup.numDocumentoIdObligado ?? null],
        )
        if (rows?.[0]) return rowToExpediente(rows[0])
      }
      if (lookup.cuv) {
        const { rows } = await query(
          'SELECT * FROM cuv_expedientes WHERE cuv = $1 ORDER BY updated_at DESC LIMIT 1',
          [lookup.cuv],
        )
        return rowToExpediente(rows?.[0])
      }
      return null
    },
    async save(expediente) {
      await query(
        `INSERT INTO cuv_expedientes (
           id, invoice_id, clinical_record_id, patient_id, num_factura,
           num_documento_id_obligado, cuv, estado, proceso_id, fecha_radicacion,
           ambiente, modulo, source, tiene_paquete, package_json, created_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::timestamptz,$17::timestamptz
         )
         ON CONFLICT (id) DO UPDATE SET
           invoice_id = EXCLUDED.invoice_id,
           clinical_record_id = EXCLUDED.clinical_record_id,
           patient_id = EXCLUDED.patient_id,
           num_factura = EXCLUDED.num_factura,
           num_documento_id_obligado = EXCLUDED.num_documento_id_obligado,
           cuv = EXCLUDED.cuv,
           estado = EXCLUDED.estado,
           proceso_id = EXCLUDED.proceso_id,
           fecha_radicacion = EXCLUDED.fecha_radicacion,
           ambiente = EXCLUDED.ambiente,
           modulo = EXCLUDED.modulo,
           source = EXCLUDED.source,
           tiene_paquete = EXCLUDED.tiene_paquete,
           package_json = EXCLUDED.package_json,
           updated_at = EXCLUDED.updated_at`,
        [
          expediente.id,
          expediente.invoiceId,
          expediente.clinicalRecordId,
          expediente.patientId,
          expediente.numFactura,
          expediente.numDocumentoIdObligado,
          expediente.cuv,
          expediente.estado,
          expediente.procesoId,
          expediente.fechaRadicacion,
          expediente.ambiente,
          expediente.modulo,
          expediente.source,
          Boolean(expediente.paquete),
          JSON.stringify(expediente.paquete ?? null),
          expediente.createdAt,
          expediente.updatedAt,
        ],
      )
      return expediente
    },
    async addIntento(intento) {
      await query(
        `INSERT INTO cuv_intentos (
           id, expediente_id, numero, estado, http_status, cuv,
           notificaciones, rechazos, respuesta_cruda, source, started_at, finished_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11::timestamptz,$12::timestamptz
         )`,
        [
          intento.id,
          intento.expedienteId,
          intento.numero,
          intento.estado,
          intento.httpStatus,
          intento.cuv,
          JSON.stringify(intento.notificaciones ?? []),
          JSON.stringify(intento.rechazos ?? []),
          JSON.stringify(intento.respuestaCruda ?? null),
          intento.source,
          intento.startedAt,
          intento.finishedAt,
        ],
      )
      return intento
    },
    async intentosDe(expedienteId) {
      const { rows } = await query(
        'SELECT * FROM cuv_intentos WHERE expediente_id = $1 ORDER BY numero ASC',
        [expedienteId],
      )
      return (rows ?? []).map(rowToIntento)
    },
  }
}

let activeStore = createFileCuvStore()
let ready

function poolConfig(url) {
  const ssl = postgresSslOption(url)
  try {
    const parsed = new URL(url)
    return {
      max: 2,
      connectionTimeoutMillis: 8_000,
      idleTimeoutMillis: 20_000,
      ssl,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 5432,
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    }
  } catch {
    return { max: 2, connectionTimeoutMillis: 8_000, connectionString: url, ssl: false }
  }
}

/**
 * Intenta crear las tablas en PostgreSQL. Si la base no responde, el
 * expediente sigue en el archivo local.
 */
export function initCuvPersistence() {
  if (!ready) {
    ready = (async () => {
      try {
        const pg = require('pg')
        const pool = new pg.Pool(poolConfig(DATABASE_URL))
        pool.on('error', (error) => {
          console.error('[cuv] PostgreSQL:', error instanceof Error ? error.message : error)
        })
        const query = async (sql, params = []) => pool.query(sql, params)
        await applyCuvMigration(query)
        activeStore = createPostgresCuvStore(query)
        console.log('[cuv] Expedientes en PostgreSQL.')
      } catch (error) {
        activeStore = createFileCuvStore()
        console.error(
          '[cuv] PostgreSQL no disponible; expedientes en archivo local:',
          error instanceof Error ? error.message : error,
        )
      }
      return activeStore
    })()
  }
  return ready
}

export async function getCuvStore() {
  if (ready) return ready
  return activeStore
}

/** Solo para pruebas. */
export function useCuvStore(store) {
  activeStore = store
  ready = Promise.resolve(store)
}

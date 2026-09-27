import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { config } from '../config.js'
import { readDurableJson, writeDurableJson } from './durableStore.js'
import { ValidadorRipsOdontologia2275 } from '../../shared/ripsOdontologia2275.js'
import {
  mapearRipsParaValidador,
  normalizarDocumentoRipsValidador,
} from '../../shared/ripsValidadorMap.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'

const FILE = join(config.dataDir, 'rips-validador.json')
const STORE_KEY = 'rips-validador'

async function readAll() {
  const value = await readDurableJson(FILE, [], STORE_KEY)
  return Array.isArray(value) ? value : []
}

async function writeAll(records) {
  await writeDurableJson(FILE, records, STORE_KEY)
}

function evaluar(rips) {
  const localIssues = validateRipsPackageLocally(rips, { crossValidateAgeSex: true })
  const odontologia = new ValidadorRipsOdontologia2275().validar(rips)
  const erroresOdontologia = odontologia.errores.filter((item) => item.level === 'error')
  return {
    valido: !hasBlockingValidationErrors(localIssues) && odontologia.valido,
    localIssues,
    odontologia: erroresOdontologia,
  }
}

/**
 * Persiste el documento local y adjunta el JSON ya mapeado para el validador.
 * @param {object} input
 */
export async function guardarRipsValidador(input = {}) {
  const documento = normalizarDocumentoRipsValidador(input.documento ?? input)
  const records = await readAll()
  const id = String(input.id ?? '').trim() || randomUUID()
  const previous = records.find((item) => item.id === id) ?? null
  const now = new Date().toISOString()
  const profesional = input.profesional ?? previous?.profesional ?? null
  const registro = {
    id,
    clinicId: input.clinicId ?? previous?.clinicId ?? null,
    patientId: input.patientId ?? previous?.patientId ?? null,
    profesional,
    documento,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  }
  const next = previous ? records.map((item) => (item.id === id ? registro : item)) : [registro, ...records]
  await writeAll(next)
  const rips = mapearRipsParaValidador(documento, { profesional: profesional ?? undefined })
  return { registro, documento, rips, validacion: evaluar(rips) }
}

export async function listarRipsValidador(clinicId) {
  const records = await readAll()
  const filtered = clinicId ? records.filter((item) => item.clinicId === clinicId) : records
  return filtered.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

export async function obtenerRipsValidador(id) {
  const records = await readAll()
  const registro = records.find((item) => item.id === id) ?? null
  if (!registro) return null
  const rips = mapearRipsParaValidador(registro.documento, { profesional: registro.profesional ?? undefined })
  return { registro, documento: registro.documento, rips, validacion: evaluar(rips) }
}

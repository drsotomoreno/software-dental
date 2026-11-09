/**
 * OTP de registro aislados del almacén subscription-users.
 * - Memoria del proceso (rápido, misma instancia)
 * - Fila propia en app_json_store por correo (sobrevive merges / saves concurrentes)
 * - Archivo local de respaldo si Postgres no está disponible
 */
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { config } from '../config.js'
import {
  deleteJsonDocument,
  readJsonDocument,
  writeJsonDocument,
} from './durableStore.js'

const memory = new Map()
const OTP_DIR = join(config.dataDir, 'email-otps')

function otpPgKey(email) {
  return `email-otp:${String(email || '')
    .trim()
    .toLowerCase()}`
}

function otpFilePath(email) {
  const digest = createHash('sha256')
    .update(String(email || '').trim().toLowerCase())
    .digest('hex')
    .slice(0, 40)
  return join(OTP_DIR, `${digest}.json`)
}

async function readFileOtp(email) {
  try {
    const parsed = JSON.parse(await readFile(otpFilePath(email), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

async function writeFileOtp(email, record) {
  await mkdir(OTP_DIR, { recursive: true })
  await writeFile(otpFilePath(email), JSON.stringify(record, null, 2), 'utf8')
}

async function deleteFileOtp(email) {
  try {
    await unlink(otpFilePath(email))
  } catch {
    // ignore
  }
}

function isUsable(record, now = Date.now()) {
  if (!record || typeof record !== 'object') return false
  if (!record.email || !record.codeHash) return false
  if (!record.expiresAt) return false
  return new Date(record.expiresAt).getTime() > now
}

export async function saveEmailOtp(record) {
  const email = String(record?.email || '')
    .trim()
    .toLowerCase()
  if (!email) {
    return { ok: false, error: 'Correo OTP inválido.' }
  }
  const payload = {
    ...record,
    email,
    updatedAt: new Date().toISOString(),
  }
  memory.set(email, payload)

  let pgOk = false
  try {
    await writeJsonDocument(otpPgKey(email), payload)
    pgOk = true
  } catch (error) {
    console.error(
      '[Auth] OTP no pudo guardarse en Postgres; se usará archivo local:',
      error instanceof Error ? error.message : error,
    )
  }

  try {
    await writeFileOtp(email, payload)
  } catch (error) {
    console.error(
      '[Auth] OTP no pudo guardarse en archivo local:',
      error instanceof Error ? error.message : error,
    )
    if (!pgOk) {
      return { ok: false, error: 'No se pudo persistir el código de verificación.' }
    }
  }

  const confirmed = await loadEmailOtp(email)
  if (!confirmed || confirmed.codeHash !== payload.codeHash) {
    return { ok: false, error: 'El código no quedó confirmado tras guardarlo.' }
  }
  return { ok: true, record: confirmed, via: pgOk ? 'postgres' : 'file' }
}

export async function loadEmailOtp(email) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase()
  if (!normalized) return null
  const now = Date.now()

  const fromMemory = memory.get(normalized)
  if (isUsable(fromMemory, now)) return fromMemory

  try {
    const fromPg = await readJsonDocument(otpPgKey(normalized))
    if (isUsable(fromPg, now)) {
      memory.set(normalized, fromPg)
      return fromPg
    }
  } catch {
    // fallback abajo
  }

  const fromFile = await readFileOtp(normalized)
  if (isUsable(fromFile, now)) {
    memory.set(normalized, fromFile)
    return fromFile
  }

  return null
}

export async function touchEmailOtp(record) {
  return saveEmailOtp(record)
}

export async function deleteEmailOtp(email) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase()
  if (!normalized) return
  memory.delete(normalized)
  await deleteJsonDocument(otpPgKey(normalized))
  await deleteFileOtp(normalized)
}

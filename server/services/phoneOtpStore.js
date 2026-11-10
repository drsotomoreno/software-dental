/**
 * OTP de WhatsApp del registro. Solo se persiste el hash (memoria, Postgres y archivo).
 * La clave es el celular normalizado, no el código en claro.
 */
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, timingSafeEqual } from 'node:crypto'
import { config } from '../config.js'
import { deleteJsonDocument, readJsonDocument, writeJsonDocument } from './durableStore.js'
import { normalizeWhatsAppRecipient, WHATSAPP_OTP_TTL_MS } from './metaWhatsappOtp.service.js'

const memory = new Map()
const OTP_DIR = join(config.dataDir, 'whatsapp-otps')
const MAX_ATTEMPTS = 5

function otpPgKey(phone) {
  return `whatsapp-otp:${phone}`
}

function otpFilePath(phone) {
  const digest = createHash('sha256').update(phone).digest('hex').slice(0, 40)
  return join(OTP_DIR, `${digest}.json`)
}

export function hashPhoneOtp(phone, code) {
  return createHash('sha256')
    .update(`${config.jwtSecret}|whatsapp-otp|${phone}|${code}`)
    .digest('hex')
}

function hashesMatch(stored, computed) {
  try {
    const left = Buffer.from(String(stored || ''), 'hex')
    const right = Buffer.from(String(computed || ''), 'hex')
    if (left.length === 0 || left.length !== right.length) return false
    return timingSafeEqual(left, right)
  } catch {
    return false
  }
}

function isUsable(record, now = Date.now()) {
  if (!record || typeof record !== 'object') return false
  if (!record.phone || !record.codeHash) return false
  if (!record.expiresAt) return false
  return new Date(record.expiresAt).getTime() > now
}

async function readFileOtp(phone) {
  try {
    const parsed = JSON.parse(await readFile(otpFilePath(phone), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

async function writeFileOtp(phone, record) {
  await mkdir(OTP_DIR, { recursive: true })
  await writeFile(otpFilePath(phone), JSON.stringify(record, null, 2), 'utf8')
}

async function deleteFileOtp(phone) {
  try {
    await unlink(otpFilePath(phone))
  } catch {
    // ignore
  }
}

export async function savePhoneOtp(record) {
  const phone = normalizeWhatsAppRecipient(record?.phone)
  if (!phone) return { ok: false, error: 'Celular OTP inválido.' }
  const code = String(record?.code ?? '').replace(/\D/g, '')
  const codeHash = record?.codeHash || (code ? hashPhoneOtp(phone, code) : '')
  if (!codeHash) return { ok: false, error: 'No se pudo proteger el código.' }

  const payload = {
    phone,
    email: String(record?.email || '')
      .trim()
      .toLowerCase(),
    codeHash,
    attempts: Number(record?.attempts) || 0,
    createdAt: record?.createdAt || new Date().toISOString(),
    expiresAt:
      record?.expiresAt || new Date(Date.now() + WHATSAPP_OTP_TTL_MS).toISOString(),
    updatedAt: new Date().toISOString(),
  }
  memory.set(phone, payload)

  let pgOk = false
  try {
    await writeJsonDocument(otpPgKey(phone), payload)
    pgOk = true
  } catch (error) {
    console.error(
      '[WhatsApp OTP] No se pudo guardar en Postgres; se usará archivo local:',
      error instanceof Error ? error.message : error,
    )
  }

  try {
    await writeFileOtp(phone, payload)
  } catch (error) {
    console.error(
      '[WhatsApp OTP] No se pudo guardar en archivo local:',
      error instanceof Error ? error.message : error,
    )
    if (!pgOk) return { ok: false, error: 'No se pudo persistir el código de WhatsApp.' }
  }

  const confirmed = await readPhoneOtpRecord(phone)
  if (!confirmed || confirmed.codeHash !== payload.codeHash) {
    return { ok: false, error: 'El código de WhatsApp no quedó confirmado tras guardarlo.' }
  }
  return { ok: true, record: confirmed }
}

async function readPhoneOtpRecord(phone) {
  const normalized = normalizeWhatsAppRecipient(phone)
  if (!normalized) return null

  const fromMemory = memory.get(normalized)
  if (fromMemory && fromMemory.codeHash) return fromMemory

  try {
    const fromPg = await readJsonDocument(otpPgKey(normalized))
    if (fromPg && fromPg.codeHash) {
      memory.set(normalized, fromPg)
      return fromPg
    }
  } catch {
    // archivo local
  }

  const fromFile = await readFileOtp(normalized)
  if (fromFile && fromFile.codeHash) {
    memory.set(normalized, fromFile)
    return fromFile
  }
  return null
}

export async function loadPhoneOtp(phone) {
  const record = await readPhoneOtpRecord(phone)
  if (!isUsable(record)) return null
  return record
}

export async function deletePhoneOtp(phone) {
  const normalized = normalizeWhatsAppRecipient(phone)
  if (!normalized) return
  memory.delete(normalized)
  await deleteJsonDocument(otpPgKey(normalized))
  await deleteFileOtp(normalized)
}

export async function checkPhoneOtp(phone, code) {
  const normalized = normalizeWhatsAppRecipient(phone)
  const otp = String(code ?? '').replace(/\D/g, '')
  if (!normalized) {
    return {
      ok: false,
      status: 400,
      error: 'Indique un celular colombiano válido (+57), por ejemplo 3001234567.',
    }
  }
  if (otp.length !== 6) {
    return { ok: false, status: 400, error: 'El código debe tener 6 dígitos, sin espacios.' }
  }

  const record = await readPhoneOtpRecord(normalized)
  if (!record) {
    return {
      ok: false,
      status: 400,
      error: 'Solicite el código de WhatsApp antes de verificar el celular.',
    }
  }
  if (!isUsable(record)) {
    await deletePhoneOtp(normalized)
    return { ok: false, status: 400, error: 'El código expiró. Solicite uno nuevo.' }
  }
  if ((record.attempts ?? 0) >= MAX_ATTEMPTS) {
    await deletePhoneOtp(normalized)
    return { ok: false, status: 400, error: 'Demasiados intentos. Solicite un código nuevo.' }
  }

  if (!hashesMatch(record.codeHash, hashPhoneOtp(normalized, otp))) {
    const attempts = (record.attempts ?? 0) + 1
    if (attempts >= MAX_ATTEMPTS) {
      await deletePhoneOtp(normalized)
      return { ok: false, status: 400, error: 'Demasiados intentos. Solicite un código nuevo.' }
    }
    await savePhoneOtp({ ...record, attempts, codeHash: record.codeHash })
    return { ok: false, status: 400, error: 'El código de WhatsApp no es válido.' }
  }

  return { ok: true, record }
}

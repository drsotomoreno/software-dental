/**
 * Registros aún no convertidos en cuenta.
 * Archivo: server/data/pending-registrations.json (sobrevive un reinicio de PM2).
 * Espejo opcional en app_json_store, clave propia, sin mezclarse con subscription-users.
 * Cada lectura descarta lo que tenga más de 15 minutos.
 */
import { randomInt, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { config } from '../config.js'
import { readJsonDocument, writeJsonDocument } from './durableStore.js'
import { mobileDigitsMatch } from '../../shared/mobilePhone.js'
import { generateActivationToken } from './whatsappClickToChat.service.js'

export const PENDING_TTL_MS = 15 * 60 * 1000
export const EMAIL_RESEND_COOLDOWN_MS = 60 * 1000
export const MAX_EMAIL_ATTEMPTS = 5

const FILE = process.env.PENDING_REGISTRATIONS_FILE || join(config.dataDir, 'pending-registrations.json')
const STORE_KEY = process.env.PENDING_REGISTRATIONS_KEY || 'pending-registrations'

let queue = Promise.resolve()

function locked(task) {
  const run = queue.then(task, task)
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export function purgeExpiredRecords(records, now = Date.now()) {
  const list = Array.isArray(records) ? records : []
  return list.filter((item) => {
    const expires = Date.parse(item?.expiresAt || '')
    return Number.isFinite(expires) && expires > now
  })
}

async function writeFileAtomic(value) {
  await mkdir(dirname(FILE), { recursive: true })
  const tmpPath = `${FILE}.tmp`
  await writeFile(tmpPath, JSON.stringify({ records: value }, null, 2), 'utf8')
  try {
    await rename(tmpPath, FILE)
  } catch (error) {
    try {
      await unlink(FILE)
    } catch {
      /* el archivo puede no existir */
    }
    try {
      await rename(tmpPath, FILE)
    } catch (retryError) {
      try {
        await unlink(tmpPath)
      } catch {
        /* ignore */
      }
      throw retryError || error
    }
  }
}

async function readFileRecords() {
  try {
    const parsed = JSON.parse(await readFile(FILE, 'utf8'))
    if (Array.isArray(parsed?.records)) return parsed.records
    if (Array.isArray(parsed)) return parsed
    return []
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    return []
  }
}

async function mirrorPostgres(records) {
  if (process.env.PENDING_REGISTRATIONS_DISABLE_PG === '1') return
  try {
    await writeJsonDocument(STORE_KEY, { records })
  } catch (error) {
    if (error?.code !== 'PG_UNAVAILABLE' && error?.code !== 'PG_COOLDOWN') {
      console.error(
        '[Auth] No se pudo espejar pending-registrations en Postgres:',
        error instanceof Error ? error.message : error,
      )
    }
  }
}

async function writeAll(records) {
  const fresh = purgeExpiredRecords(records)
  await writeFileAtomic(fresh)
  await mirrorPostgres(fresh)
  return fresh
}

async function readAll() {
  const fromFile = await readFileRecords()
  if (fromFile) {
    const fresh = purgeExpiredRecords(fromFile)
    if (fresh.length !== fromFile.length) await writeAll(fresh)
    return fresh
  }
  let fromPg = []
  if (process.env.PENDING_REGISTRATIONS_DISABLE_PG !== '1') {
    try {
      const doc = await readJsonDocument(STORE_KEY)
      fromPg = Array.isArray(doc?.records) ? doc.records : []
    } catch {
      fromPg = []
    }
  }
  const fresh = purgeExpiredRecords(fromPg)
  if (fresh.length) await writeAll(fresh)
  return fresh
}

function numericCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export async function savePendingRegistration({ nombre, email, phoneNumber, passwordHash }) {
  return locked(async () => {
    const records = await readAll()
    const now = new Date()
    const existing = records.find((item) => item.email === email)
    const record = {
      pendingId: existing?.pendingId || randomUUID(),
      nombre: String(nombre || '').trim(),
      email,
      phone_number: phoneNumber,
      passwordHash,
      emailCode: numericCode(),
      emailVerified: false,
      emailAttempts: 0,
      whatsappCode: generateActivationToken(6),
      whatsappVerified: false,
      whatsappVerifiedAt: null,
      expiresAt: new Date(now.getTime() + PENDING_TTL_MS).toISOString(),
      lastEmailSentAt: now.toISOString(),
      createdAt: existing?.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
    }
    const next = records.filter(
      (item) => item.email !== email && !mobileDigitsMatch(item.phone_number, phoneNumber),
    )
    next.push(record)
    await writeAll(next)
    return record
  })
}

export async function readPendingStatus(pendingId) {
  return locked(async () => {
    const id = String(pendingId || '').trim()
    const records = await readAll()
    const record = records.find((item) => item.pendingId === id)
    if (!record) {
      return { emailVerified: false, whatsappVerified: false, expired: true }
    }
    return {
      emailVerified: record.emailVerified === true,
      whatsappVerified: record.whatsappVerified === true,
      expired: false,
    }
  })
}

export async function rotatePendingEmailCode(pendingId) {
  return locked(async () => {
    const id = String(pendingId || '').trim()
    const records = await readAll()
    const index = records.findIndex((item) => item.pendingId === id)
    if (index === -1) {
      return {
        ok: false,
        status: 400,
        error: 'El registro expiró o no existe. Vuelva a empezar.',
      }
    }
    const current = records[index]
    const last = Date.parse(current.lastEmailSentAt || '')
    const elapsed = Date.now() - last
    if (Number.isFinite(last) && elapsed < EMAIL_RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        status: 429,
        error: 'Espere un momento antes de reenviar el código.',
        retryAfterSeconds: Math.ceil((EMAIL_RESEND_COOLDOWN_MS - elapsed) / 1000),
      }
    }
    const previous = { ...current }
    const updated = {
      ...current,
      emailCode: numericCode(),
      emailVerified: false,
      emailAttempts: 0,
      lastEmailSentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    records[index] = updated
    await writeAll(records)
    return { ok: true, record: updated, previous }
  })
}

export async function restorePendingRecord(record) {
  if (!record?.pendingId) return
  return locked(async () => {
    const records = await readAll()
    const index = records.findIndex((item) => item.pendingId === record.pendingId)
    if (index === -1) {
      records.push(record)
    } else {
      records[index] = record
    }
    await writeAll(records)
  })
}

export async function verifyPendingWhatsApp({ codes, senderDigits }) {
  return locked(async () => {
    const wanted = new Set(
      (Array.isArray(codes) ? codes : [])
        .map((code) => String(code || '').trim().toUpperCase())
        .filter((code) => code.length === 6),
    )
    const senders = (Array.isArray(senderDigits) ? senderDigits : []).map((value) =>
      String(value || '').replace(/\D/g, ''),
    )
    if (!wanted.size || !senders.some(Boolean)) return { ok: true, verified: false }

    const records = await readAll()
    const index = records.findIndex((item) => {
      const code = String(item.whatsappCode || '').trim().toUpperCase()
      if (!wanted.has(code)) return false
      return senders.some((sender) => mobileDigitsMatch(item.phone_number, sender))
    })
    if (index === -1) return { ok: true, verified: false }

    const now = new Date().toISOString()
    records[index] = {
      ...records[index],
      whatsappVerified: true,
      whatsappVerifiedAt: now,
      updatedAt: now,
    }
    await writeAll(records)
    return { ok: true, verified: true }
  })
}

export async function beginPendingCompletion({ pendingId, emailCode }) {
  return locked(async () => {
    const id = String(pendingId || '').trim()
    const records = await readAll()
    const index = records.findIndex((item) => item.pendingId === id)
    if (index === -1) {
      return {
        ok: false,
        status: 400,
        error: 'El registro expiró o no existe. Vuelva a empezar.',
      }
    }
    const record = records[index]
    if (record.completing === true) {
      return {
        ok: false,
        status: 409,
        error: 'La cuenta se está creando. Espere un momento.',
      }
    }
    const attempts = Number(record.emailAttempts) || 0
    if (attempts >= MAX_EMAIL_ATTEMPTS) {
      return {
        ok: false,
        status: 400,
        error: 'Demasiados intentos con el código de correo. Solicite uno nuevo.',
      }
    }
    const given = String(emailCode || '').replace(/\D/g, '').slice(0, 6)
    if (given.length !== 6 || given !== String(record.emailCode || '')) {
      const nextAttempts = attempts + 1
      records[index] = {
        ...record,
        emailAttempts: nextAttempts,
        updatedAt: new Date().toISOString(),
      }
      await writeAll(records)
      if (nextAttempts >= MAX_EMAIL_ATTEMPTS) {
        return {
          ok: false,
          status: 400,
          error: 'Demasiados intentos con el código de correo. Solicite uno nuevo.',
        }
      }
      return {
        ok: false,
        status: 400,
        error: 'El código del correo no es válido.',
        emailAttempts: nextAttempts,
      }
    }
    if (record.whatsappVerified !== true) {
      return {
        ok: false,
        status: 400,
        error: 'Falta la verificación de WhatsApp. Envíe el mensaje desde el celular registrado.',
      }
    }
    const updated = {
      ...record,
      emailVerified: true,
      completing: true,
      updatedAt: new Date().toISOString(),
    }
    records[index] = updated
    await writeAll(records)
    return { ok: true, record: updated }
  })
}

export async function releasePendingCompletion(pendingId) {
  return locked(async () => {
    const id = String(pendingId || '').trim()
    const records = await readAll()
    const index = records.findIndex((item) => item.pendingId === id)
    if (index === -1) return
    const next = { ...records[index] }
    delete next.completing
    records[index] = next
    await writeAll(records)
  })
}

export async function deletePendingRegistration(pendingId) {
  return locked(async () => {
    const id = String(pendingId || '').trim()
    const records = await readAll()
    const next = records.filter((item) => item.pendingId !== id)
    if (next.length === records.length) return false
    await writeAll(next)
    return true
  })
}

/**
 * Caché resiliente de credenciales Google Drive (t3.micro).
 * Memoria + disco: si RDS falla/enfría, status/upload/file siguen operando.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'

const CACHE_FILE = join(config.dataDir || join(dirname(fileURLToPath(import.meta.url)), '../data'), 'google-drive-cache.json')

/** @type {Map<string, object>} */
const memory = new Map()
let diskLoaded = false
let writeChain = Promise.resolve()

function emptyDisk() {
  return { clinics: {}, updatedAt: null }
}

async function ensureDiskLoaded() {
  if (diskLoaded) return
  diskLoaded = true
  try {
    const raw = await readFile(CACHE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    const clinics = parsed?.clinics && typeof parsed.clinics === 'object' ? parsed.clinics : {}
    for (const [key, row] of Object.entries(clinics)) {
      if (key && row && typeof row === 'object') memory.set(String(key), row)
    }
  } catch {
    // primera vez / archivo ausente
  }
}

function enqueueDiskWrite(fn) {
  const next = writeChain.then(fn, fn)
  writeChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

async function persistDisk() {
  await mkdir(dirname(CACHE_FILE), { recursive: true })
  const clinics = {}
  for (const [key, row] of memory.entries()) clinics[key] = row
  await writeFile(
    CACHE_FILE,
    JSON.stringify({ clinics, updatedAt: new Date().toISOString() }, null, 2),
    'utf8',
  )
}

function cacheKeysFor(id) {
  const value = String(id || '').trim()
  if (!value) return []
  const keys = [value]
  if (value.startsWith('clinic:')) keys.push(value.slice('clinic:'.length))
  else keys.push(`clinic:${value}`)
  return [...new Set(keys)]
}

/** Guarda credenciales tras connect/status exitoso. */
export async function putGoogleDriveCredentialCache(storageKey, record) {
  await ensureDiskLoaded()
  const key = String(storageKey || record?.clinicId || '').trim()
  if (!key || !record) return
  const row = {
    clinicId: key,
    status: record.status || 'connected',
    googleDriveEmail: record.googleDriveEmail || null,
    refreshTokenEnc: record.refreshTokenEnc || null,
    accessTokenEnc: record.accessTokenEnc || null,
    tokenExpiresAt: record.tokenExpiresAt || null,
    rootFolderId: record.rootFolderId || null,
    clinicName: record.clinicName || null,
    connectedAt: record.connectedAt || null,
    connectedByUserId: record.connectedByUserId || null,
    cachedAt: new Date().toISOString(),
  }
  for (const alias of cacheKeysFor(key)) memory.set(alias, row)
  await enqueueDiskWrite(persistDisk)
}

export async function getGoogleDriveCredentialCache(candidateIds = []) {
  await ensureDiskLoaded()
  for (const raw of candidateIds) {
    for (const key of cacheKeysFor(raw)) {
      const hit = memory.get(key)
      if (hit?.refreshTokenEnc) return { record: hit, storageKey: hit.clinicId || key }
    }
  }
  return null
}

export async function clearGoogleDriveCredentialCache(storageKey) {
  await ensureDiskLoaded()
  for (const key of cacheKeysFor(storageKey)) memory.delete(key)
  await enqueueDiskWrite(persistDisk)
}

export async function listCachedConnectedDriveRecords() {
  await ensureDiskLoaded()
  const byClinic = new Map()
  for (const row of memory.values()) {
    if (!row?.refreshTokenEnc) continue
    if (String(row.status || '') !== 'connected') continue
    const key = String(row.clinicId || '').trim()
    if (key) byClinic.set(key, row)
  }
  return [...byClinic.entries()].map(([storageKey, record]) => ({ storageKey, record }))
}

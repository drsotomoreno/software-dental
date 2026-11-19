/**
 * Saca data:image / base64 > 50 KB de clinicalDraft y lo deja en disco.
 * clinical-sync.json guarda solo mediaRef. La ficha individual rehidrata.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from '../config.js'
import { extractClinicalDraftMedia } from '../../shared/clinicalInlineMedia.js'

const MEDIA_DIR = join(config.dataDir, 'clinical-media')

async function writeBlobOnce(blob) {
  await mkdir(MEDIA_DIR, { recursive: true })
  const file = join(MEDIA_DIR, blob.id)
  try {
    await stat(file)
    return
  } catch {
    await writeFile(file, blob.dataUrl, 'utf8')
  }
}

/**
 * @param {unknown} value
 * @returns {Promise<{ value: unknown, extracted: number }>}
 */
export async function persistExtractedClinicalMedia(value) {
  const blobs = []
  const next = extractClinicalDraftMedia(value, blobs)
  if (blobs.length === 0) return { value: next, extracted: 0 }
  for (const blob of blobs) {
    await writeBlobOnce(blob)
  }
  return { value: next, extracted: blobs.length }
}

async function readMediaDataUrl(mediaRef) {
  const id = String(mediaRef || '').trim()
  if (!/^[a-f0-9]{16,64}$/i.test(id)) return null
  try {
    const dataUrl = await readFile(join(MEDIA_DIR, id), 'utf8')
    if (typeof dataUrl === 'string' && dataUrl.length > 0) return dataUrl
  } catch {
    return null
  }
  return null
}

function isMediaRef(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return value.storage === 'clinical-media' && typeof value.mediaRef === 'string'
}

/** Devuelve el dataURL de un solo paciente. El listado no pasa por aquí. */
export async function rehydrateClinicalMedia(value) {
  if (Array.isArray(value)) {
    const rows = []
    for (const item of value) rows.push(await rehydrateClinicalMedia(item))
    return rows
  }
  if (isMediaRef(value)) {
    const dataUrl = await readMediaDataUrl(value.mediaRef)
    return dataUrl || value
  }
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [key, entry] of Object.entries(value)) {
    out[key] = await rehydrateClinicalMedia(entry)
  }
  return out
}

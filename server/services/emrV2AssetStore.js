/**
 * EMR v2 — binarios clínicos fuera de PostgreSQL (S3 o disco).
 * Solo metadatos + SHA-256 viven en emr_v2_clinical_assets.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { z } from 'zod'
import { config } from '../config.js'
import { withPgClient } from './durableStore.js'
import { appendForensicAudit, ensureEmrV2Schema } from './emrV2Store.js'

const HEAVY_BASE64_CHARS = 16 * 1024
const ASSETS_ROOT = join(config.dataDir, 'clinical-assets')

export const ASSET_TYPES = Object.freeze([
  'radiografia',
  'foto_clinica',
  'firma_paciente',
  'firma_profesional',
  'consentimiento_pdf',
  'anexo',
])

const assetTypeSchema = z.enum([
  'radiografia',
  'foto_clinica',
  'firma_paciente',
  'firma_profesional',
  'consentimiento_pdf',
  'anexo',
])

function safePathSegment(value) {
  return String(value || 'unknown')
    .replace(/[^a-zA-Z0-9._@:/-]+/g, '_')
    .replace(/[/\\]+/g, '_')
    .slice(0, 180)
}

function extensionForMime(mime, fileName = '') {
  const fromName = extname(String(fileName || '')).replace(/^\./, '').toLowerCase()
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'image/svg+xml': 'svg',
  }
  return map[String(mime || '').toLowerCase()] || 'bin'
}

function parseDataUrl(value) {
  const text = String(value || '')
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(text)
  if (!match) return null
  const mime = match[1] || 'application/octet-stream'
  const isBase64 = Boolean(match[2])
  const data = match[3] || ''
  try {
    const buffer = isBase64 ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data), 'utf8')
    return { mime, buffer }
  } catch {
    return null
  }
}

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Detecta data:image / base64 pesado en JSON de mutaciones /api/v2/.
 * @returns {{ ok: true } | { ok: false, status: 400, code: string, error: string, path: string }}
 */
export function rejectHeavyBase64InJson(value, path = '$') {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^data:image\//i.test(trimmed) || /^data:application\/pdf/i.test(trimmed)) {
      return {
        ok: false,
        status: 400,
        code: 'BASE64_NOT_ALLOWED',
        error:
          'Prohibido enviar data:image/PDF base64 en JSON de /api/v2/. Use POST /api/v2/patients/:id/assets y guarde solo la referencia del asset.',
        path,
      }
    }
    if (
      trimmed.length > HEAVY_BASE64_CHARS &&
      /^[A-Za-z0-9+/=\s]+$/.test(trimmed) &&
      !trimmed.includes(' ')
    ) {
      return {
        ok: false,
        status: 400,
        code: 'BASE64_NOT_ALLOWED',
        error:
          'Payload base64 > 16KB rechazado. Suba el binario con POST /api/v2/patients/:id/assets.',
        path,
      }
    }
    return { ok: true }
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const child = rejectHeavyBase64InJson(value[i], `${path}[${i}]`)
      if (!child.ok) return child
    }
    return { ok: true }
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      const child = rejectHeavyBase64InJson(entry, `${path}.${key}`)
      if (!child.ok) return child
    }
  }
  return { ok: true }
}

function s3Configured() {
  const bucket = String(process.env.S3_CLINICAL_BUCKET || process.env.AWS_S3_BUCKET || '').trim()
  const keyId = String(process.env.AWS_ACCESS_KEY_ID || '').trim()
  const secret = String(process.env.AWS_SECRET_ACCESS_KEY || '').trim()
  return Boolean(bucket && keyId && secret)
}

async function putObjectS3(storageKey, buffer, mimeType) {
  const bucket = String(process.env.S3_CLINICAL_BUCKET || process.env.AWS_S3_BUCKET || '').trim()
  const region = String(process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1').trim()
  try {
    const mod = await import('@aws-sdk/client-s3')
    const client = new mod.S3Client({ region })
    await client.send(
      new mod.PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
      }),
    )
    return { driver: 's3', storageKey }
  } catch (error) {
    console.warn(
      '[emr-v2-assets] S3 no disponible; fallback a disco:',
      error instanceof Error ? error.message : error,
    )
    return null
  }
}

async function putObjectDisk(clinicaId, patientId, assetId, ext, buffer) {
  const clinicSeg = safePathSegment(clinicaId)
  const patientSeg = safePathSegment(patientId)
  const fileName = `${assetId}.${ext}`
  const absDir = join(ASSETS_ROOT, clinicSeg, patientSeg)
  await mkdir(absDir, { recursive: true })
  const absPath = join(absDir, fileName)
  await writeFile(absPath, buffer)
  const storageKey = join(clinicSeg, patientSeg, fileName).replace(/\\/g, '/')
  return { driver: 'disk', storageKey, absPath }
}

async function readObjectDisk(storageKey) {
  const abs = join(ASSETS_ROOT, ...String(storageKey).split('/').filter(Boolean))
  return readFile(abs)
}

async function readObjectS3(storageKey) {
  const bucket = String(process.env.S3_CLINICAL_BUCKET || process.env.AWS_S3_BUCKET || '').trim()
  const region = String(process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1').trim()
  const mod = await import('@aws-sdk/client-s3')
  const client = new mod.S3Client({ region })
  const out = await client.send(
    new mod.GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    }),
  )
  const chunks = []
  for await (const chunk of out.Body) chunks.push(chunk)
  return Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c))))
}

/**
 * Persiste bytes y registra metadatos en emr_v2_clinical_assets.
 */
export async function persistClinicalAsset(input) {
  const clinicaId = String(input?.clinicaId || '').trim()
  const patientId = String(input?.patientId || '').trim()
  const assetType = assetTypeSchema.parse(String(input?.assetType || 'anexo'))
  const fileName = String(input?.fileName || 'asset.bin').trim() || 'asset.bin'
  const mimeType = String(input?.mimeType || 'application/octet-stream').trim()
  const uploadedBy = String(input?.uploadedBy || input?.actor?.email || '').trim() || null
  const buffer = Buffer.isBuffer(input?.buffer)
    ? input.buffer
    : Buffer.from(input?.buffer || input?.bytes || [])
  if (!clinicaId || !patientId || buffer.length === 0) {
    return {
      ok: false,
      status: 400,
      code: 'BAD_REQUEST',
      error: 'clinicaId, patientId y buffer son obligatorios',
    }
  }

  const assetId = String(input?.id || randomUUID())
  const sha256 = sha256Buffer(buffer)
  const ext = extensionForMime(mimeType, fileName)
  const preferredKey = `${safePathSegment(clinicaId)}/${safePathSegment(patientId)}/${assetId}.${ext}`

  let stored = null
  if (s3Configured()) {
    stored = await putObjectS3(preferredKey, buffer, mimeType)
  }
  if (!stored) {
    stored = await putObjectDisk(clinicaId, patientId, assetId, ext, buffer)
  }

  await ensureEmrV2Schema()
  const runInsert = async (client) => {
    const { rows } = await client.query(
      `INSERT INTO emr_v2_clinical_assets (
         id, clinica_id, patient_id, asset_type, file_name, mime_type, byte_size,
         sha256_hash, storage_driver, storage_key, uploaded_by, created_at
       ) VALUES (
         $1::uuid, $2::text, $3::uuid, $4::text, $5::text, $6::text, $7::integer,
         $8::text, $9::text, $10::text, $11::text, NOW()
       )
       RETURNING id, clinica_id, patient_id, asset_type, file_name, mime_type, byte_size,
                 sha256_hash, storage_driver, storage_key, uploaded_by, created_at`,
      [
        assetId,
        clinicaId,
        patientId,
        assetType,
        fileName,
        mimeType,
        buffer.length,
        sha256,
        stored.driver,
        stored.storageKey,
        uploadedBy,
      ],
    )
    const row = rows[0]
    if (input?.skipAudit !== true) {
      await appendForensicAudit(client, {
        clinicaId,
        patientId,
        entityTable: 'emr_v2_clinical_assets',
        entityId: String(row.id),
        action: 'asset.upload',
        actor: input?.actor || { email: uploadedBy || '' },
        beforeState: null,
        afterState: {
          id: row.id,
          asset_type: row.asset_type,
          sha256_hash: row.sha256_hash,
          storage_driver: row.storage_driver,
          byte_size: row.byte_size,
        },
      })
    }
    return row
  }

  if (input?.client && typeof input.client.query === 'function') {
    const row = await runInsert(input.client)
    return { ok: true, status: 201, asset: row }
  }

  return withPgClient(async (client) => {
    await client.query('BEGIN')
    try {
      const row = await runInsert(client)
      await client.query('COMMIT')
      return { ok: true, status: 201, asset: row }
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw error
    }
  })
}

export async function getClinicalAssetRow(clinicaId, assetId) {
  const clinic = String(clinicaId || '').trim()
  const id = String(assetId || '').trim()
  if (!clinic || !id) return null
  await ensureEmrV2Schema()
  return withPgClient(async (client) => {
    const { rows } = await client.query(
      `SELECT id, clinica_id, patient_id, asset_type, file_name, mime_type, byte_size,
              sha256_hash, storage_driver, storage_key, uploaded_by, created_at
         FROM emr_v2_clinical_assets
        WHERE id = $1::uuid AND clinica_id = $2::text
        LIMIT 1`,
      [id, clinic],
    )
    return rows[0] || null
  })
}

export async function readClinicalAssetContent(clinicaId, assetId) {
  const row = await getClinicalAssetRow(clinicaId, assetId)
  if (!row) {
    return { ok: false, status: 404, code: 'NOT_FOUND', error: 'Asset no encontrado' }
  }
  let buffer
  if (row.storage_driver === 's3') {
    buffer = await readObjectS3(row.storage_key)
  } else {
    buffer = await readObjectDisk(row.storage_key)
  }
  const digest = sha256Buffer(buffer)
  if (digest !== String(row.sha256_hash || '')) {
    return {
      ok: false,
      status: 409,
      code: 'INTEGRITY_MISMATCH',
      error: 'SHA-256 del archivo no coincide con el registro forense',
    }
  }
  return { ok: true, status: 200, asset: row, buffer }
}

function guessAssetTypeFromPath(path) {
  const p = String(path || '').toLowerCase()
  if (p.includes('firma') && p.includes('pacient')) return 'firma_paciente'
  if (p.includes('firma') || p.includes('signature') || p.includes('professional')) {
    return 'firma_profesional'
  }
  if (p.includes('consent') || p.includes('pdf')) return 'consentimiento_pdf'
  if (p.includes('radio') || p.includes('xray') || p.includes('rx')) return 'radiografia'
  if (p.includes('foto') || p.includes('photo') || p.includes('image')) return 'foto_clinica'
  return 'anexo'
}

/**
 * Recorre un valor JSON, extrae dataURLs/base64 pesados, los persiste y deja refs.
 */
export async function extractAndPersistHeavyBinaries({
  clinicaId,
  patientId,
  value,
  actor,
  defaultAssetType = 'anexo',
  client = null,
  path = '$',
}) {
  const assets = []

  async function walk(node, currentPath) {
    if (typeof node === 'string') {
      const trimmed = node.trim()
      const dataUrl = parseDataUrl(trimmed)
      const heavyBase64 =
        !dataUrl &&
        trimmed.length > HEAVY_BASE64_CHARS &&
        /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)

      if (!dataUrl && !heavyBase64) return node

      const buffer = dataUrl
        ? dataUrl.buffer
        : Buffer.from(trimmed.replace(/\s+/g, ''), 'base64')
      const mimeType = dataUrl?.mime || 'application/octet-stream'
      const assetType = guessAssetTypeFromPath(currentPath) || defaultAssetType
      const persisted = await persistClinicalAsset({
        clinicaId,
        patientId,
        assetType,
        fileName: `${assetType}-${randomUUID().slice(0, 8)}.${extensionForMime(mimeType)}`,
        mimeType,
        buffer,
        actor,
        client,
        skipAudit: false,
      })
      if (!persisted.ok) return node
      assets.push(persisted.asset)
      return {
        storage: 'emr_v2_asset',
        assetId: persisted.asset.id,
        sha256: persisted.asset.sha256_hash,
        mimeType: persisted.asset.mime_type,
      }
    }
    if (Array.isArray(node)) {
      const out = []
      for (let i = 0; i < node.length; i += 1) {
        out.push(await walk(node[i], `${currentPath}[${i}]`))
      }
      return out
    }
    if (node && typeof node === 'object') {
      const out = {}
      for (const [key, entry] of Object.entries(node)) {
        out[key] = await walk(entry, `${currentPath}.${key}`)
      }
      return out
    }
    return node
  }

  const next = await walk(value, path)
  return { value: next, assets }
}

/**
 * Referencia liviana de firmas clínicas.
 * El PNG deja de vivir como data:image/...;base64 dentro del JSON
 * y pasa a /api/drive/file/<id> (alias del proxy OAuth drive.file).
 */
import { sha256HexBytes } from './sha256Hex.js'

export const SIGNATURE_PROXY_PREFIX = '/api/drive/file/'
export const SIGNATURE_LEGACY_PROXY_PREFIX = '/api/integrations/google-drive/file/'
export const SIGNATURES_FOLDER_NAME = 'Firmas_Clinicas'

const DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+;base64,/i
const SIGNATURE_KEY_RE = /(signature|firma)/i

export function isSignatureDataUrl(value) {
  return typeof value === 'string' && DATA_IMAGE_RE.test(value.trim())
}

export function isSignatureDriveRef(value) {
  if (typeof value !== 'string') return false
  const raw = value.trim()
  return (
    raw.startsWith(SIGNATURE_PROXY_PREFIX) || raw.startsWith(SIGNATURE_LEGACY_PROXY_PREFIX)
  )
}

export function driveFileIdFromSignatureRef(value) {
  const raw = String(value || '').trim()
  let rest = ''
  if (raw.startsWith(SIGNATURE_PROXY_PREFIX)) rest = raw.slice(SIGNATURE_PROXY_PREFIX.length)
  else if (raw.startsWith(SIGNATURE_LEGACY_PROXY_PREFIX)) {
    rest = raw.slice(SIGNATURE_LEGACY_PROXY_PREFIX.length)
  } else return ''
  const id = rest.split('?')[0].split('/')[0] || ''
  try {
    return decodeURIComponent(id).trim()
  } catch {
    return id.trim()
  }
}

export function signatureProxyUrl(driveFileId, mimeType = 'image/png') {
  const id = encodeURIComponent(String(driveFileId || '').trim())
  const mime = encodeURIComponent(String(mimeType || 'image/png'))
  return `${SIGNATURE_PROXY_PREFIX}${id}?mimeType=${mime}`
}

export function signatureDriveMetaKey(fieldKey) {
  const key = String(fieldKey || '')
  if (key.endsWith('DataUrl')) return `${key.slice(0, -'DataUrl'.length)}Drive`
  if (key.endsWith('Base64')) return `${key.slice(0, -'Base64'.length)}Drive`
  return `${key}Drive`
}

/**
 * Campo que guarda un PNG/JPEG de firma (no un adjunto diagnóstico).
 * @param {string} key
 * @param {string[]} [path]
 */
export function isSignatureImageFieldKey(key, path = []) {
  const name = String(key || '')
  if (!name || /(?:Meta|Drive)$/.test(name)) return false
  if (SIGNATURE_KEY_RE.test(name)) return true
  if (name === 'dataUrl' && path.some((part) => SIGNATURE_KEY_RE.test(String(part)))) return true
  return false
}

export function decodeSignatureDataUrlBytes(dataUrl) {
  const raw = String(dataUrl || '').trim()
  const match = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i)
  if (!match) return null
  const clean = match[2].replace(/\s/g, '')
  const padLength = clean.length % 4 === 0 ? 0 : 4 - (clean.length % 4)
  try {
    const bin = atob(clean + '='.repeat(padLength))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i) & 0xff
    if (!bytes.length) return null
    return { mimeType: match[1].toLowerCase(), bytes }
  } catch {
    return null
  }
}

export function imageSha256OfDataUrl(dataUrl) {
  const decoded = decodeSignatureDataUrlBytes(dataUrl)
  if (!decoded) return ''
  return sha256HexBytes(decoded.bytes)
}

/**
 * Token estable del sello: el mismo PNG en base64 o en Drive produce el mismo token.
 * Así extraer la firma no se lee como una mutación de la historia firmada.
 */
export function signatureSealToken(value, meta) {
  if (isSignatureDataUrl(value)) {
    const hex = imageSha256OfDataUrl(value)
    return hex ? `sig:${hex}` : value ?? null
  }
  if (isSignatureDriveRef(value)) {
    const hex =
      meta && typeof meta === 'object' && typeof meta.imageSha256 === 'string'
        ? meta.imageSha256.trim().toLowerCase()
        : ''
    if (/^[a-f0-9]{64}$/.test(hex)) return `sig:${hex}`
    const id = driveFileIdFromSignatureRef(value)
    return id ? `sig-ref:${id}` : value ?? null
  }
  return value ?? null
}

export function jsonUtf8Bytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length
  } catch {
    return 0
  }
}

function nextPatientSyncId(node, current) {
  if (!node || typeof node !== 'object') return current
  const preferred = String(node.patientSyncId || node.patientId || '').trim()
  if (preferred) return preferred.slice(0, 120)
  const syncId = String(node.syncId || '').trim()
  if (syncId && current === 'sin-paciente') return syncId.slice(0, 120)
  return current
}

/**
 * Visita cada string de firma. `parent[key]` sigue siendo el valor mutable.
 * @param {unknown} value
 * @param {(hit: { parent: Record<string, unknown>, key: string, value: string, path: string[], patientSyncId: string }) => void} visitor
 */
export function forEachSignatureField(value, visitor, state) {
  const path = state?.path || []
  const patientSyncId = state?.patientSyncId || 'sin-paciente'
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      forEachSignatureField(entry, visitor, {
        path: [...path, String(index)],
        patientSyncId,
      })
    })
    return
  }
  if (!value || typeof value !== 'object') return
  const nextId = nextPatientSyncId(value, patientSyncId)
  for (const [key, entry] of Object.entries(value)) {
    if (isSignatureImageFieldKey(key, path) && typeof entry === 'string') {
      visitor({
        parent: value,
        key,
        value: entry,
        path: [...path, key],
        patientSyncId: nextId,
      })
    }
    if (entry && typeof entry === 'object') {
      forEachSignatureField(entry, visitor, {
        path: [...path, key],
        patientSyncId: nextId,
      })
    }
  }
}

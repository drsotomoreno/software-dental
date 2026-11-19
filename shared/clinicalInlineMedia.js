/**
 * Corta dataURL/base64 del listado clínico y los saca de clinicalDraft
 * antes de que JSON.stringify (V8 SerializeString) tumbe el proceso.
 *
 * valuationDraft no se nullifica y no es raíz de extracción: la historia
 * abreviada de Pacientes Valorados sigue en el borrador.
 * Las firmas (claves *signature* / *firma*) no se tocan.
 */
import { isSignatureImageFieldKey } from './signatureDriveRef.js'
import { sha256HexBytes } from './sha256Hex.js'

/** Listado /api/sync/pull (también full=1): no viaja inline. */
export const LISTING_HEAVY_STRING_CHARS = 30 * 1024

/** Persistencia clinical-sync.json: umbral de extracción dentro de clinicalDraft. */
export const EMBEDDED_BINARY_CHARS = 50 * 1024

export function isInlineHeavyString(value, minChars) {
  if (typeof value !== 'string' || value.length <= minChars) return false
  if (/^data:/i.test(value)) return true
  const sample = value.slice(0, 180).replace(/\s/g, '')
  return sample.length > 80 && /^[A-Za-z0-9+/=]+$/.test(sample)
}

function shouldKeepString(key, path) {
  return isSignatureImageFieldKey(key, path)
}

/**
 * Sustituye strings largos por vacío. No asigna null a valuationDraft ni a clinicalDraft.
 * @param {unknown} value
 * @param {string[]} [path]
 */
export function stripListingHeavyStrings(value, path = []) {
  if (typeof value === 'string') {
    const key = path.length ? path[path.length - 1] : ''
    if (shouldKeepString(key, path)) return value
    if (!isInlineHeavyString(value, LISTING_HEAVY_STRING_CHARS)) return value
    return ''
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => stripListingHeavyStrings(item, path.concat(String(index))))
  }
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [key, entry] of Object.entries(value)) {
    out[key] = stripListingHeavyStrings(entry, path.concat(key))
  }
  return out
}

function mimeOfDataUrl(value) {
  const match = /^data:([^;,]+)/i.exec(value)
  return match ? match[1].toLowerCase() : 'application/octet-stream'
}

function walkExtract(node, path, blobs) {
  if (typeof node === 'string') {
    const key = path.length ? path[path.length - 1] : ''
    if (shouldKeepString(key, path)) return node
    if (!isInlineHeavyString(node, EMBEDDED_BINARY_CHARS)) return node
    const id = sha256HexBytes(node).slice(0, 40)
    blobs.push({ id, mime: mimeOfDataUrl(node), dataUrl: node })
    return {
      mediaRef: id,
      mime: mimeOfDataUrl(node),
      byteLength: node.length,
      storage: 'clinical-media',
    }
  }
  if (Array.isArray(node)) {
    return node.map((item, index) => walkExtract(item, path.concat(String(index)), blobs))
  }
  if (!node || typeof node !== 'object') return node
  const out = {}
  for (const [key, entry] of Object.entries(node)) {
    out[key] = walkExtract(entry, path.concat(key), blobs)
  }
  return out
}

/**
 * Dentro de cada `clinicalDraft`, cambia data:image / base64 > 50 KB por mediaRef.
 * valuationDraft se copia tal cual.
 * @param {unknown} value
 * @param {{ id: string, mime: string, dataUrl: string }[]} [blobs]
 */
export function extractClinicalDraftMedia(value, blobs = []) {
  if (Array.isArray(value)) {
    return value.map((item) => extractClinicalDraftMedia(item, blobs))
  }
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'clinicalDraft' && entry && typeof entry === 'object') {
      out[key] = walkExtract(entry, ['clinicalDraft'], blobs)
      continue
    }
    if (key === 'valuationDraft') {
      out[key] = entry
      continue
    }
    out[key] = entry && typeof entry === 'object' ? extractClinicalDraftMedia(entry, blobs) : entry
  }
  return out
}

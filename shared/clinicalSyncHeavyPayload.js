/**
 * Evita que clinical-sync.json crezca por borradores locales pesados.
 *
 * INVARIANTE Pacientes Valorados (Colombia / Res. 1995):
 * - `valuationDraft` NUNCA se nullifica aquí. Es la única copia servidor de la
 *   historia abreviada; sin ella el listado abre ficha vacía tras wipe Dexie.
 * - Solo `clinicalDraft` (historia completa) puede omitirse si supera el umbral.
 */

export const MAX_SYNC_DRAFT_JSON_CHARS = 50 * 1024

/** Solo clinicalDraft es omitible; valuationDraft se conserva siempre. */
const OMITTABLE_HEAVY_DRAFT_KEYS = ['clinicalDraft']

export function measureJsonChars(value) {
  if (value == null) return 0
  try {
    return JSON.stringify(value).length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function isHeavySyncJson(value, maxChars = MAX_SYNC_DRAFT_JSON_CHARS) {
  return measureJsonChars(value) > maxChars
}

/**
 * Nullifica clinicalDraft pesado. Nunca toca valuationDraft.
 * Recorre payloads de sync, mapas drafts y clinics del store.
 */
export function omitHeavyClinicalDraftForms(value, maxChars = MAX_SYNC_DRAFT_JSON_CHARS) {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map((row) => omitHeavyClinicalDraftForms(row, maxChars))
  }

  const out = { ...value }

  if (out.payload && typeof out.payload === 'object' && !Array.isArray(out.payload)) {
    out.payload = omitHeavyClinicalDraftForms(out.payload, maxChars)
  }

  for (const key of OMITTABLE_HEAVY_DRAFT_KEYS) {
    if (key in out && isHeavySyncJson(out[key], maxChars)) {
      out[key] = null
    }
  }

  if (out.drafts && typeof out.drafts === 'object' && !Array.isArray(out.drafts)) {
    const drafts = {}
    for (const [id, row] of Object.entries(out.drafts)) {
      drafts[id] = omitHeavyClinicalDraftForms(row, maxChars)
    }
    out.drafts = drafts
  }

  if (out.clinics && typeof out.clinics === 'object' && !Array.isArray(out.clinics)) {
    const clinics = {}
    for (const [id, clinic] of Object.entries(out.clinics)) {
      clinics[id] = omitHeavyClinicalDraftForms(clinic, maxChars)
    }
    out.clinics = clinics
  }

  return out
}

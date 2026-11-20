/**
 * Notas legadas sin `id` rompen Dexie (`.equals(undefined)` → Invalid key)
 * y React keys. Asigna un id de recuperación determinístico y estable entre
 * dispositivos (derivado de contentHash / sellos temporales), sin alterar el
 * texto clínico ni recalcular contentHash.
 */

export const RECOVERED_EVOLUTION_NOTE_ID_PREFIX = 'recovered-'

export function isRecoveredEvolutionNoteId(id) {
  return String(id || '').startsWith(RECOVERED_EVOLUTION_NOTE_ID_PREFIX)
}

function recoveryStamp(note, index) {
  const hash = String(note?.contentHash || '').trim()
  if (hash) return hash
  const parts = [
    String(note?.signedAt || '').trim(),
    String(note?.date || '').trim(),
    String(note?.createdAt || '').trim(),
    String(note?.procedure || '').trim(),
    String(index),
  ].filter(Boolean)
  return parts.join('|') || `orphan-${index}`
}

/**
 * @param {unknown[]|null|undefined} notes
 * @returns {any[]}
 */
export function ensureEvolutionNoteIds(notes) {
  if (!Array.isArray(notes) || notes.length === 0) return []
  return notes.map((note, index) => {
    const id = String(note?.id ?? '').trim()
    if (id) return note
    const stamp = recoveryStamp(note, index)
    return {
      ...note,
      id: `${RECOVERED_EVOLUTION_NOTE_ID_PREFIX}${stamp}`.slice(0, 120),
      /** Sidecar no clínico: marca que el id no formaba parte del sello original. */
      idRecoveredFromLegacy: true,
    }
  })
}

/** true si se asignó al menos un id de recuperación. */
export function evolutionNoteIdsWereRepaired(before, after) {
  const prev = Array.isArray(before) ? before : []
  const next = Array.isArray(after) ? after : []
  if (prev.length !== next.length) return next.some((note) => isRecoveredEvolutionNoteId(note?.id))
  for (let i = 0; i < next.length; i += 1) {
    const beforeId = String(prev[i]?.id ?? '').trim()
    const afterId = String(next[i]?.id ?? '').trim()
    if (!beforeId && afterId && isRecoveredEvolutionNoteId(afterId)) return true
  }
  return false
}

/**
 * Los sellos firmados sin `id` omitían la clave en JSON.stringify.
 * Un id `recovered-*` no debe entrar al SHA-256 ni invalidar contentHash.
 */
export function stripRecoveredEvolutionNoteIdForHash(note) {
  if (!note || typeof note !== 'object') return note
  const id = String(note.id ?? '').trim()
  const recovered =
    !id || isRecoveredEvolutionNoteId(id) || Boolean(note.idRecoveredFromLegacy)
  if (!recovered) return note
  const next = { ...note }
  delete next.id
  delete next.idRecoveredFromLegacy
  return next
}

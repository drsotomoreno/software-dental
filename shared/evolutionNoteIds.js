/**
 * Notas legadas sin `id` rompen Dexie (`.equals(undefined)` → Invalid key)
 * y React keys. Asigna un id de recuperación estable sin alterar contentHash.
 */
export function ensureEvolutionNoteIds(notes) {
  if (!Array.isArray(notes) || notes.length === 0) return []
  return notes.map((note, index) => {
    const id = String(note?.id ?? '').trim()
    if (id) return note
    const stamp = String(
      note?.contentHash || note?.signedAt || note?.date || note?.createdAt || `orphan-${index}`,
    ).trim()
    return {
      ...note,
      id: `recovered-${stamp}`.slice(0, 120),
    }
  })
}

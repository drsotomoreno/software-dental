const HOME_DISPLAY_TITLE_PREFIX = 'dental_emr_home_display_title_'
const MAX_TITLE_LENGTH = 120

/** Se dispara al guardar el nombre de clínica / titular (Top Bar, etc.). */
export const HOME_DISPLAY_TITLE_CHANGED_EVENT = 'dental-emr:home-display-title-changed'

function storageKey(userId: string): string {
  return `${HOME_DISPLAY_TITLE_PREFIX}${userId}`
}

export function getHomeDisplayTitle(userId: string | undefined): string {
  if (!userId || typeof window === 'undefined') return ''
  try {
    return localStorage.getItem(storageKey(userId))?.trim() ?? ''
  } catch {
    return ''
  }
}

export function setHomeDisplayTitle(userId: string, title: string): string {
  const normalized = title.trim().slice(0, MAX_TITLE_LENGTH)
  if (normalized) {
    localStorage.setItem(storageKey(userId), normalized)
  } else {
    localStorage.removeItem(storageKey(userId))
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(HOME_DISPLAY_TITLE_CHANGED_EVENT, { detail: { userId, title: normalized } }),
    )
  }
  return normalized
}

export const HOME_DISPLAY_TITLE_PLACEHOLDER =
  'Toque para agregar su nombre o el de su clínica'

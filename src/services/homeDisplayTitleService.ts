const HOME_DISPLAY_TITLE_PREFIX = 'dental_emr_home_display_title_'
const MAX_TITLE_LENGTH = 120

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
  return normalized
}

export const HOME_DISPLAY_TITLE_PLACEHOLDER =
  'Toque para agregar su nombre o el de su clínica'

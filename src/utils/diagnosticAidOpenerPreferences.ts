import type { DiagnosticAidFileType } from '@/types/diagnosticAid'

export interface DiagnosticAidOpenerPreference {
  programPath: string
  programName: string
}

export type DiagnosticAidOpenerMap = Partial<
  Record<DiagnosticAidFileType, DiagnosticAidOpenerPreference>
>

const STORAGE_KEY = 'dental.diagnosticAidOpeners'

export function loadDiagnosticAidOpenerPreferences(): DiagnosticAidOpenerMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as DiagnosticAidOpenerMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveDiagnosticAidOpenerPreference(
  fileType: DiagnosticAidFileType,
  preference: DiagnosticAidOpenerPreference | null,
): DiagnosticAidOpenerMap {
  const current = loadDiagnosticAidOpenerPreferences()
  if (preference) {
    current[fileType] = preference
  } else {
    delete current[fileType]
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  return current
}

export function getDiagnosticAidOpenerPreference(
  fileType: DiagnosticAidFileType,
): DiagnosticAidOpenerPreference | null {
  return loadDiagnosticAidOpenerPreferences()[fileType] ?? null
}

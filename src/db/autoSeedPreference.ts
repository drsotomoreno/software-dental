/** Si está en `true`, no se vuelven a insertar pacientes ficticios al recargar. */
export const HAS_CLEARED_TEST_DATA_KEY = 'has_cleared_test_data'
const LEGACY_SKIP_AUTO_SEED_KEY = 'dental_emr_skip_auto_seed'

export function hasClearedTestData(): boolean {
  try {
    const flag = localStorage.getItem(HAS_CLEARED_TEST_DATA_KEY)
    if (flag === 'true' || flag === '1') return true
    return localStorage.getItem(LEGACY_SKIP_AUTO_SEED_KEY) === '1'
  } catch {
    return false
  }
}

/** Alias de lectura para el inicializador de IndexedDB. */
export function isAutoTestSeedDisabled(): boolean {
  return hasClearedTestData()
}

export function markTestDataCleared(): void {
  localStorage.setItem(HAS_CLEARED_TEST_DATA_KEY, 'true')
}

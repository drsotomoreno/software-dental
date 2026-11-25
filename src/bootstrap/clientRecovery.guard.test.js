import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const recoverySrc = readFileSync(join(here, 'clientRecovery.ts'), 'utf8')
const mainSrc = readFileSync(join(here, '../main.tsx'), 'utf8')
const appRouterSrc = readFileSync(join(here, '../AppRouter.tsx'), 'utf8')
const boundarySrc = readFileSync(
  join(here, '../components/common/GlobalErrorBoundary.tsx'),
  'utf8',
)

test('APP_BUILD_VERSION usa __APP_BUILD_VERSION__ de Vite con fallback', () => {
  assert.match(recoverySrc, /__APP_BUILD_VERSION__/)
  assert.match(recoverySrc, /2026-11-25-v2/)
  assert.match(recoverySrc, /mhd_build_version/)
  const viteCfg = readFileSync(join(here, '../../vite.config.ts'), 'utf8')
  assert.match(viteCfg, /__APP_BUILD_VERSION__/)
  assert.match(viteCfg, /toISOString/)
})

test('ensureAppBuildVersion purga caché, SW e IndexedDB y recarga una vez', () => {
  assert.match(recoverySrc, /caches\.keys/)
  assert.match(recoverySrc, /serviceWorker\.getRegistrations/)
  assert.match(recoverySrc, /indexedDB\.deleteDatabase/)
  assert.match(recoverySrc, /mhd_build_reload_once/)
  assert.match(recoverySrc, /doctorSEO_token/)
})

test('main.tsx arranca con ensureAppBuildVersion + chunk recovery antes de React', () => {
  assert.match(mainSrc, /ensureAppBuildVersion/)
  assert.match(mainSrc, /installChunkLoadRecovery/)
  assert.match(mainSrc, /createRoot/)
})

test('vite:preloadError y ChunkLoadError fuerzan reload de sesión', () => {
  assert.match(recoverySrc, /vite:preloadError/)
  assert.match(recoverySrc, /ChunkLoadError/)
  assert.match(recoverySrc, /unhandledrejection/)
  assert.match(recoverySrc, /mhd_chunk_reload_once/)
})

test('GlobalErrorBoundary envuelve AppRouter con auto-reparación', () => {
  assert.match(appRouterSrc, /GlobalErrorBoundary/)
  assert.match(boundarySrc, /Restaurar y sincronizar ahora/)
  assert.match(boundarySrc, /Estamos actualizando los datos locales de tu clínica/)
  assert.match(boundarySrc, /recoverFromRuntimeErrorAndReload/)
})

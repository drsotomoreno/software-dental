import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))

describe('clinical logout guard', () => {
  it('bloquea el cierre de sesión con mensaje médico-legal explícito', () => {
    const src = readFileSync(join(dir, 'clinicalLogoutGuard.ts'), 'utf8')
    assert.match(src, /No se puede cerrar sesión todavía/)
    assert.match(src, /guardClinicalLogout/)
    assert.match(src, /flushEmrV2Outbox/)
    assert.match(src, /forzarSincronizacionLocal/)
  })

  it('AuthContext usa la guardia antes de limpiar tokens', () => {
    const auth = readFileSync(join(dir, '../contexts/AuthContext.tsx'), 'utf8')
    assert.match(auth, /guardClinicalLogout/)
    assert.match(auth, /ok: false/)
  })

  it('autosave usa debounce 1\.5s e indicador de nube', () => {
    const autosave = readFileSync(join(dir, '../hooks/useClinicalAutoSave.ts'), 'utf8')
    assert.match(autosave, /AUTO_SAVE_DELAY_MS = 1500/)
    assert.match(autosave, /pending_offline/)
    assert.match(autosave, /onVersionConflict/)
  })

  it('EMR v2 409 no sobrescribe el borrador local', () => {
    const client = readFileSync(join(dir, 'emrV2Client.ts'), 'utf8')
    const idx = client.indexOf('if (response.status === 409)')
    assert.ok(idx >= 0)
    const block = client.slice(idx, idx + 700)
    assert.match(block, /VERSION_CONFLICT/)
    assert.equal(block.includes('fetchPatientChartV2'), false)
  })
})

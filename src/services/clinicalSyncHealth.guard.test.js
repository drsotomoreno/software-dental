import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')

test('listados cablean ClinicalSyncHealthBanner cuando vacíos', async () => {
  for (const rel of [
    'src/pages/PatientListPage.tsx',
    'src/pages/ValuatedPatientsPage.tsx',
    'src/pages/CompletedPatientsPage.tsx',
  ]) {
    const src = await readFile(join(root, rel), 'utf8')
    assert.match(src, /ClinicalSyncHealthBanner/, rel)
    assert.match(src, /listEmpty=\{Boolean\(patients && patients\.length === 0\)\}/, rel)
  }
})

test('pull login y forzar sync registran salud clínica', async () => {
  const src = await readFile(join(here, 'clinicalSyncService.ts'), 'utf8')
  assert.match(src, /recordPullSuccess/)
  assert.match(src, /recordPullFailure/)
  assert.match(src, /clinicalSyncHealth/)
})

test('banner distingue fallo de sync vs clínica sin pacientes', async () => {
  const banner = await readFile(
    join(root, 'src/components/patients/ClinicalSyncHealthBanner.tsx'),
    'utf8',
  )
  assert.match(banner, /emptyListLooksLikeSyncFailure/)
  assert.match(banner, /Reintentar sincronización/)
  const health = await readFile(join(here, 'clinicalSyncHealth.ts'), 'utf8')
  assert.match(health, /meta_missing/)
  assert.match(health, /SYNC_META_MISSING/)
})

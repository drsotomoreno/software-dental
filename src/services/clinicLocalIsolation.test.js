import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function normalizeClinicKey(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  return raw.startsWith('clinic:') ? raw : `clinic:${raw}`
}

function clinicIdsMatch(a, b) {
  const left = normalizeClinicKey(a)
  const right = normalizeClinicKey(b)
  return Boolean(left && right && left === right)
}

test('adoptLocalRecords no debe reasignar clinicId ajeno', async () => {
  const src = await readFile(join(here, 'clinicalSyncService.ts'), 'utf8')
  assert.match(src, /NUNCA reasigna clinicId ajeno/)
  assert.match(src, /if \(row\.clinicId && !clinicIdsMatch\(row\.clinicId, clinicId\)\) continue/)
  assert.doesNotMatch(
    src,
    /if \(row\.clinicId !== clinicId\) patch\.clinicId = clinicId/,
    'No debe quedar el patrón que robaba pacientes de otra clínica',
  )
})

test('clinicIdsMatch aísla Superadmin de un registro nuevo', () => {
  assert.equal(clinicIdsMatch('clinic:doctormauriciosoto@gmail.com', 'clinic:delasso-uuid'), false)
  assert.equal(clinicIdsMatch('clinic:abc', 'abc'), true)
  assert.equal(clinicIdsMatch('', 'clinic:nuevo'), false)
})

test('purge elimina historias/RIPS huérfanos sin clinicId (fuga Exportación RIPS)', async () => {
  const src = await readFile(join(here, 'clinicLocalIsolation.ts'), 'utf8')
  assert.match(src, /Sin clinicId = huérfano/)
  assert.match(src, /db\.rips_submissions\.clear/)
  assert.match(src, /rips_submissions\.toArray/)
  assert.match(src, /patientClinicalDrafts/)
  // No debe quedar el patrón que conservaba clinicalRecords sin clinicId.
  assert.doesNotMatch(
    src,
    /if \(row\.clinicId && !clinicIdsMatch\(row\.clinicId, clinicId\)\) \{\s*await db\.clinicalRecords\.delete/,
  )
})

test('RipsExportPage filtra por clínica antes de listar atenciones', async () => {
  const page = await readFile(join(here, '../pages/RipsExportPage.tsx'), 'utf8')
  assert.match(page, /belongsToCurrentClinic/)
  assert.match(page, /ensureClinicLocalIsolation/)
  assert.match(page, /allowed\.has\(String\(record\.patientId/)
})

test('pullCompleteClinicOnLogin aísla caché por clínica', async () => {
  const src = await readFile(join(here, 'clinicalSyncService.ts'), 'utf8')
  assert.match(src, /ensureClinicLocalIsolation/)
  assert.match(src, /cached\.clinicId === clinicId/)
})

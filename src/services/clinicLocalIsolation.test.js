import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveClinicSyncId } from '../../shared/clinicalSyncScope.js'
import {
  isOrphanUuidDentalEmrDb,
  orphanUuidDentalEmrDbName,
  resolveDentalEmrDbNameFromUser,
} from '../../shared/dentalEmrDbName.js'

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

test('purgeForeignClinicRecords usa getCurrentClinicId canónico y clinicIdsMatch', async () => {
  const src = await readFile(join(here, 'clinicLocalIsolation.ts'), 'utf8')
  assert.match(src, /export async function purgeForeignClinicRecords/)
  assert.match(src, /clinicId = getCurrentClinicId\(\)/)
  assert.match(src, /belongsToCurrentClinic/)
  assert.match(src, /retireOrphanUuidDentalEmrDatabase/)
  assert.match(src, /resolveClinicSyncId/)
  assert.match(src, /patientClinicalDrafts/)
  assert.match(src, /odontograms/)
})

test('AuthContext abre Dexie con resolveClinicSyncId, no clinicId\|\|id UUID', async () => {
  const src = await readFile(join(here, '../contexts/AuthContext.tsx'), 'utf8')
  assert.match(src, /resolveClinicSyncId\(sessionUser\)/)
  assert.match(src, /retireOrphanUuidDentalEmrDatabase/)
  assert.match(src, /ensureDentalDatabaseForAuth\(sessionUser\.id, clinicSyncId\)/)
  assert.doesNotMatch(
    src,
    /ensureDentalDatabaseForAuth\(sessionUser\.id,\s*sessionUser\.clinicId\s*\|\|\s*sessionUser\.id\)/,
  )
  assert.doesNotMatch(
    src,
    /clinicId:\s*String\(sessionUser\.clinicId\s*\|\|\s*sessionUser\.id\)/,
  )
})

test('RipsExportPage filtra por clínica antes de listar atenciones', async () => {
  const page = await readFile(join(here, '../pages/RipsExportPage.tsx'), 'utf8')
  assert.match(page, /belongsToCurrentClinic/)
  assert.match(page, /ensureClinicLocalIsolation/)
  assert.match(page, /allowed\.has\(String\(record\.patientId/)
})

test('pullCompleteClinicOnLogin aísla caché por clínica canónica', async () => {
  const src = await readFile(join(here, 'clinicalSyncService.ts'), 'utf8')
  assert.match(src, /ensureClinicLocalIsolation/)
  assert.match(src, /getCurrentClinicId\(\)/)
  assert.match(src, /clinicIdsMatch\(cached\.clinicId, clinicId\)/)
  assert.doesNotMatch(
    src,
    /ensureDentalDatabaseForAuth\(auth\.user\?\.id,\s*clinicId\s*\|\|\s*auth\.user\?\.clinicId\s*\|\|\s*auth\.user\?\.id\)/,
  )
})

test('login + pull + reload: pacientes/odontogramas/drafts canónicos no se purgan', () => {
  const masterUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const master = {
    id: masterUuid,
    clinicId: masterUuid,
    email: 'doctormauriciosoto@gmail.com',
  }
  const canonical = resolveClinicSyncId(master)
  const canonicalDb = resolveDentalEmrDbNameFromUser(master)
  const orphanDb = orphanUuidDentalEmrDbName(masterUuid)

  assert.equal(canonical, 'clinic:doctormauriciosoto@gmail.com')
  assert.equal(canonicalDb, `DentalEMR_${masterUuid}_doctormauriciosoto@gmail.com`)
  assert.notEqual(orphanDb, canonicalDb)
  assert.equal(isOrphanUuidDentalEmrDb(orphanDb, masterUuid, canonicalDb), true)

  // Simula filas ya en el cubo canónico tras sync/pull (como en EC2).
  const patients = [
    { id: 'p-activo-1', clinicId: canonical, status: 'activo' },
    { id: 'p-activo-2', clinicId: 'doctormauriciosoto@gmail.com', status: 'activo' },
    { id: 'p-ajeno', clinicId: 'clinic:otra@clinica.test', status: 'activo' },
  ]
  const odontograms = [
    { id: 'o1', patientId: 'p-activo-1', clinicId: canonical },
    { id: 'o2', patientId: 'p-activo-2', clinicId: canonical },
    { id: 'o-ajeno', patientId: 'p-ajeno', clinicId: 'clinic:otra@clinica.test' },
  ]
  const drafts = [
    { patientId: 'p-activo-1' },
    { patientId: 'p-activo-2' },
    { patientId: 'p-ajeno' },
  ]

  const keptPatients = patients.filter((row) => clinicIdsMatch(row.clinicId, canonical))
  const keptPatientIds = new Set(keptPatients.map((p) => p.id))
  const keptOdontograms = odontograms.filter(
    (row) => clinicIdsMatch(row.clinicId, canonical) && keptPatientIds.has(row.patientId),
  )
  const keptDrafts = drafts.filter((row) => keptPatientIds.has(row.patientId))

  assert.equal(keptPatients.length, 2)
  assert.equal(keptOdontograms.length, 2)
  assert.equal(keptDrafts.length, 2)
  // Recarga: misma resolución → mismos ids → purge no toca el cubo propio.
  assert.equal(resolveClinicSyncId(master), canonical)
  assert.equal(resolveDentalEmrDbNameFromUser(master), canonicalDb)
})

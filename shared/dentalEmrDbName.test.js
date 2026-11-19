import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveClinicSyncId } from './clinicalSyncScope.js'
import {
  isOrphanUuidDentalEmrDb,
  orphanUuidDentalEmrDbName,
  resolveCanonicalClinicDbKey,
  resolveDentalEmrDbNameFromUser,
  sanitizeDentalDbSegment,
} from './dentalEmrDbName.js'

const MASTER_EMAIL = 'doctormauriciosoto@gmail.com'
const MASTER_UUID = '11111111-2222-3333-4444-555555555555'

test('Superadmin: Dexie canónica por correo, nunca UUID ni superadmin-session', () => {
  const master = {
    id: MASTER_UUID,
    clinicId: MASTER_UUID,
    email: MASTER_EMAIL,
  }
  assert.equal(resolveClinicSyncId(master), `clinic:${MASTER_EMAIL}`)
  const dbName = resolveDentalEmrDbNameFromUser(master)
  assert.equal(dbName, `DentalEMR_canonical_${MASTER_EMAIL}`)
  assert.notEqual(dbName, orphanUuidDentalEmrDbName(MASTER_UUID))
  assert.ok(!dbName.includes('superadmin-session'))
  assert.equal(
    isOrphanUuidDentalEmrDb(orphanUuidDentalEmrDbName(MASTER_UUID), MASTER_UUID, dbName),
    true,
  )
})

test('Superadmin: override clinicId UUID no abre DentalEMR_{uid}_{uid}', () => {
  const master = {
    id: MASTER_UUID,
    clinicId: MASTER_UUID,
    email: MASTER_EMAIL,
  }
  const dbName = resolveDentalEmrDbNameFromUser(master, {
    userId: MASTER_UUID,
    clinicaId: MASTER_UUID,
  })
  assert.equal(dbName, `DentalEMR_canonical_${MASTER_EMAIL}`)
  assert.equal(sanitizeDentalDbSegment(`clinic:${MASTER_EMAIL}`), MASTER_EMAIL)
})

test('superadmin-session como id no contamina el nombre de BD', () => {
  const user = {
    id: 'superadmin-session',
    clinicId: 'superadmin-session',
    email: MASTER_EMAIL,
  }
  const dbName = resolveDentalEmrDbNameFromUser(user)
  assert.equal(dbName, `DentalEMR_canonical_${MASTER_EMAIL}`)
  assert.equal(resolveCanonicalClinicDbKey(user), MASTER_EMAIL)
})

test('clínica multi-tenant conserva aislamiento (una BD canónica por clínica)', () => {
  const dentist = {
    id: 'user-b',
    clinicId: 'clinic-b',
    email: 'odontologo@clinica.test',
  }
  const other = {
    id: 'user-a',
    clinicId: 'clinic-a',
    email: 'otra@clinica.test',
  }
  const masterDb = resolveDentalEmrDbNameFromUser({
    id: MASTER_UUID,
    clinicId: MASTER_UUID,
    email: MASTER_EMAIL,
  })
  const dentistDb = resolveDentalEmrDbNameFromUser(dentist)
  const otherDb = resolveDentalEmrDbNameFromUser(other)
  assert.equal(dentistDb, 'DentalEMR_canonical_clinic-b')
  assert.equal(otherDb, 'DentalEMR_canonical_clinic-a')
  assert.notEqual(dentistDb, otherDb)
  assert.notEqual(dentistDb, masterDb)
  assert.equal(isOrphanUuidDentalEmrDb(dentistDb, dentist.id, dentistDb), false)
})

test('dueño con clinicId === userId usa DentalEMR_canonical_${ownerId}', () => {
  const ownerId = 'owner-uuid-999'
  const owner = { id: ownerId, clinicId: ownerId, email: 'dueno@clinica.test' }
  const dbName = resolveDentalEmrDbNameFromUser(owner)
  assert.equal(dbName, `DentalEMR_canonical_${ownerId}`)
  assert.equal(isOrphanUuidDentalEmrDb(dbName, ownerId, dbName), false)
})

test('purge/belongs: pacientes del cubo canónico no se eliminan vs UUID de sesión', () => {
  const canonical = resolveClinicSyncId({
    id: MASTER_UUID,
    clinicId: MASTER_UUID,
    email: MASTER_EMAIL,
  })
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
  const patients = [
    { id: 'p1', clinicId: canonical },
    { id: 'p2', clinicId: MASTER_EMAIL },
    { id: 'foreign', clinicId: 'clinic:otra-clinica' },
  ]
  const kept = patients.filter((row) => clinicIdsMatch(row.clinicId, canonical))
  assert.equal(kept.length, 2)
  assert.deepEqual(
    kept.map((p) => p.id),
    ['p1', 'p2'],
  )
})

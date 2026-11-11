import assert from 'node:assert/strict'
import test from 'node:test'
import { clinicKeyInScope, clinicSyncAliasIds, resolveClinicSyncId } from './clinicalSyncScope.js'

test('cada odontólogo queda en su propia clínica, no en la del superadministrador', () => {
  const dentist = { id: 'user-b', clinicId: 'clinic-b', email: 'odontologo@clinica.test' }
  const other = { id: 'user-a', clinicId: 'clinic-a', email: 'otra@clinica.test' }
  const master = { id: 'master-id', clinicId: 'master-id', email: 'doctormauriciosoto@gmail.com' }

  assert.equal(resolveClinicSyncId(dentist), 'clinic:clinic-b')
  assert.equal(resolveClinicSyncId(other), 'clinic:clinic-a')
  assert.notEqual(resolveClinicSyncId(dentist), resolveClinicSyncId(other))
  assert.equal(resolveClinicSyncId(master), 'clinic:doctormauriciosoto@gmail.com')

  const scope = clinicSyncAliasIds(dentist)
  assert.equal(clinicKeyInScope('clinic:clinic-b', scope.canonical, scope.aliases), true)
  assert.equal(clinicKeyInScope('clinic-b', scope.canonical, scope.aliases), true)
  assert.equal(clinicKeyInScope('', scope.canonical, scope.aliases), true)
  assert.equal(clinicKeyInScope('clinic:clinic-a', scope.canonical, scope.aliases), false)
  assert.equal(
    clinicKeyInScope('clinic:doctormauriciosoto@gmail.com', scope.canonical, scope.aliases),
    false,
  )
})

test('un colaborador usa la clínica del titular', () => {
  const assistant = { id: 'assistant-1', clinicId: 'clinic-b', email: 'recepcion@clinica.test' }
  assert.equal(resolveClinicSyncId(assistant), 'clinic:clinic-b')
  const scope = clinicSyncAliasIds(assistant)
  assert.equal(clinicKeyInScope('clinic:clinic-b', scope.canonical, scope.aliases), true)
  assert.equal(clinicKeyInScope('assistant-1', scope.canonical, scope.aliases), true)
  assert.equal(clinicKeyInScope('clinic:clinic-a', scope.canonical, scope.aliases), false)
})

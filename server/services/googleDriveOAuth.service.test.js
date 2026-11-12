import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canManageClinicGoogleDrive,
  isGoogleDriveSuperAdmin,
  resolveManagedClinicId,
} from './googleDriveOAuth.service.js'

test('superadmin maestro puede gestionar Drive', () => {
  const master = {
    id: 'master-id',
    email: 'doctormauriciosoto@gmail.com',
    rol: 'superadmin',
    clinicId: null,
  }
  assert.equal(isGoogleDriveSuperAdmin(master), true)
  assert.equal(canManageClinicGoogleDrive(master), true)
  assert.equal(resolveManagedClinicId(master), 'clinic:doctormauriciosoto@gmail.com')
  assert.equal(
    resolveManagedClinicId(master, 'otra-clinica-uuid'),
    'clinic:otra-clinica-uuid',
  )
})

test('dueño y admin de clínica pueden gestionar Drive', () => {
  const owner = { id: 'c1', clinicId: 'c1', email: 'owner@clinic.com', rol: 'odontologo' }
  const admin = { id: 'u2', clinicId: 'c1', email: 'admin@clinic.com', rol: 'admin' }
  assert.equal(canManageClinicGoogleDrive(owner), true)
  assert.equal(canManageClinicGoogleDrive(admin), true)
})

test('odontólogo colaborador no puede gestionar Drive', () => {
  const doc = { id: 'u3', clinicId: 'c1', email: 'doc@clinic.com', rol: 'odontologo' }
  assert.equal(canManageClinicGoogleDrive(doc), false)
})

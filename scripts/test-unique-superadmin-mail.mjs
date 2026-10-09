import assert from 'node:assert/strict'
import { isUniqueSuperAdminAccount } from '../shared/uniqueSuperAdmin.js'

assert.equal(isUniqueSuperAdminAccount('doctormauriciosoto@gmail.com'), true)
assert.equal(isUniqueSuperAdminAccount('  DoctorMauricioSoto@gmail.com '), true)
assert.equal(
  isUniqueSuperAdminAccount({ email: 'doctormauriciosoto@gmail.com', rol: 'superadmin' }),
  true,
)
assert.equal(isUniqueSuperAdminAccount({ email: 'otro@clinica.co', rol: 'superadmin' }), false)
assert.equal(isUniqueSuperAdminAccount({ rol: 'superadmin', estado_pago: 'exento' }), false)
assert.equal(isUniqueSuperAdminAccount('admin@clinica.co'), false)
assert.equal(isUniqueSuperAdminAccount(null), false)
assert.equal(isUniqueSuperAdminAccount(undefined), false)

console.log('unique superadmin mail access: ok')

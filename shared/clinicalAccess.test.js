import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyStoredAccessPolicy,
  clinicalAccessTier,
  countDistinctClinicalPatients,
} from './clinicalAccess.js'

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

test('delassostore sin plan pagado no entra al software completo', () => {
  const email = 'delassostore@gmail.com'
  assert.equal(clinicalAccessTier({ email, estado_pago: 'pendiente' }), 'none')
  assert.equal(clinicalAccessTier({ email, estado_pago: 'exento' }), 'none')
  assert.equal(
    clinicalAccessTier({ email, estado_pago: 'activo', fecha_vencimiento: future }),
    'none',
  )
  assert.equal(
    clinicalAccessTier({ email, rol: 'superadmin', estado_pago: 'exento' }),
    'none',
  )
  assert.equal(
    clinicalAccessTier({
      email,
      estado_pago: 'activo',
      plan: 'nomad',
      fecha_vencimiento: past,
    }),
    'none',
  )
})

test('la prueba vigente queda limitada y solo el plan pagado vigente abre todo', () => {
  const email = 'delassostore@gmail.com'
  assert.equal(
    clinicalAccessTier({ email, estado_pago: 'prueba', plan: 'prueba', fecha_vencimiento: future }),
    'trial',
  )
  assert.equal(
    clinicalAccessTier({
      email,
      estado_pago: 'activo',
      plan: 'smart',
      fecha_vencimiento: future,
    }),
    'full',
  )
  assert.equal(
    clinicalAccessTier({ email: 'doctormauriciosoto@gmail.com', estado_pago: 'pendiente' }),
    'full',
  )
})

test('el almacén baja a pendiente un activo o exento que no pagó', () => {
  const stripped = applyStoredAccessPolicy({
    email: 'delassostore@gmail.com',
    rol: 'superadmin',
    estado_pago: 'exento',
    plan: 'exento',
    fecha_vencimiento: future,
  })
  assert.equal(stripped.rol, 'admin')
  assert.equal(stripped.estado_pago, 'pendiente')
  assert.equal(stripped.plan, null)
  assert.equal(stripped.fecha_vencimiento, null)

  const fakePaid = applyStoredAccessPolicy({
    email: 'delassostore@gmail.com',
    rol: 'admin',
    estado_pago: 'activo',
    plan: null,
    fecha_vencimiento: future,
  })
  assert.equal(fakePaid.estado_pago, 'pendiente')
  assert.equal(clinicalAccessTier({ email: 'delassostore@gmail.com', ...fakePaid }), 'none')

  const paid = applyStoredAccessPolicy({
    email: 'colegio@clinica.com',
    rol: 'admin',
    estado_pago: 'activo',
    plan: 'bionic',
    fecha_vencimiento: future,
  })
  assert.equal(paid.estado_pago, 'activo')
  assert.equal(paid.plan, 'bionic')
})

test('la prueba no puede empujar más de un paciente', () => {
  assert.equal(countDistinctClinicalPatients({ patients: [{ id: '1' }] }), 1)
  assert.equal(
    countDistinctClinicalPatients({
      patients: [{ id: '1' }, { id: '2' }],
    }),
    2,
  )
  assert.equal(
    countDistinctClinicalPatients({
      patients: [{ id: '1' }],
      clinicalRecords: [{ patientId: '1' }, { patientId: '2' }],
    }),
    2,
  )
})

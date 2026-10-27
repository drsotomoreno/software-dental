import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PLAN_LIMITS,
  applyClinicAssistantLookup,
  checkRepsLimit,
  checkUserLimits,
  snapshotLimitError,
  userLimitMessage,
} from './subscriptionPlans.js'

const corporativo = { plan: 'corporativo', estado_pago: 'activo', rol: 'admin' }

test('el catálogo deja ReTHUS en 1, 4 y 6, y una sede REPS en todos los planes', () => {
  assert.deepEqual(PLAN_LIMITS.nomad, { name: 'Plan Nomad', maxRethus: 1, maxReps: 1 })
  assert.deepEqual(PLAN_LIMITS.smart, { name: 'Plan Smart', maxRethus: 4, maxReps: 1 })
  assert.deepEqual(PLAN_LIMITS.bionic, { name: 'Plan Bionic', maxRethus: 6, maxReps: 1 })
  assert.deepEqual(PLAN_LIMITS.corporativo, {
    name: 'Plan Corporativo',
    maxRethus: 'custom',
    maxReps: 1,
  })
})

test('un profesional cuenta contra ReTHUS y un auxiliar no', () => {
  const smart = { plan: 'smart', estado_pago: 'activo' }
  assert.equal(checkUserLimits(smart, false, 3).canAdd, true)
  assert.equal(checkUserLimits(smart, false, 4).canAdd, false)
  assert.equal(checkUserLimits(smart, false, 4).limit, 4)
  assert.equal(checkUserLimits(smart, true, 9).canAdd, true)
  assert.equal(checkUserLimits(smart, true, 9).limit, null)
  assert.equal(checkUserLimits({ plan: 'nomad', estado_pago: 'activo' }, false, 1).canAdd, false)
  assert.equal(checkUserLimits({ plan: 'bionic', estado_pago: 'activo' }, false, 6).limit, 6)
})

test('Corporativo lee custom_max_rethus y mantiene una sede REPS', () => {
  const clinic = { ...corporativo, custom_max_rethus: 12 }
  assert.equal(checkUserLimits(clinic, false, 11).canAdd, true)
  assert.equal(checkUserLimits(clinic, false, 12).canAdd, false)
  assert.equal(checkUserLimits({ ...corporativo, custom_max_rethus: null }, false, 0).limit, 0)
  assert.equal(checkRepsLimit(clinic, 1).canAdd, true)
  assert.equal(checkRepsLimit(clinic, 2).canAdd, false)
  assert.equal(checkRepsLimit(clinic, 2).limit, 1)
  assert.match(checkRepsLimit({ plan: 'nomad', estado_pago: 'activo' }, 2).planName, /Plan Nomad/)
})

test('Smart y BioniC ignoran el tope manual de ReTHUS', () => {
  assert.equal(
    checkUserLimits({ plan: 'smart', estado_pago: 'activo', custom_max_rethus: 80 }, false, 4).limit,
    4,
  )
  assert.equal(checkRepsLimit({ plan: 'bionic', estado_pago: 'activo' }, 1).limit, 1)
})

test('la fila de clinics pisa custom_max_rethus', () => {
  const account = { ...corporativo, customMaxRethus: 12 }
  const fromRow = applyClinicAssistantLookup(account, {
    found: true,
    custom_max_assistants: 6,
    custom_max_rethus: 2,
  })
  assert.equal(checkUserLimits(fromRow, false, 2).canAdd, false)
  assert.equal(checkUserLimits(fromRow, false, 1).canAdd, true)
})

test('el mensaje nombra profesionales ReTHUS o la sede REPS', () => {
  const seats = { planName: 'Plan Smart', rethusUsed: 4, maxRethus: 4, repsUsed: 1, maxReps: 1 }
  assert.match(snapshotLimitError(seats, false) ?? '', /Plan Smart permite máximo 4 profesionales/)
  assert.equal(snapshotLimitError(seats, true), null)
  const blocked = checkRepsLimit({ plan: 'smart', estado_pago: 'activo' }, 2, 1)
  assert.equal(blocked.canAdd, false)
  assert.match(userLimitMessage(blocked) ?? '', /1 sede REPS/)
  assert.equal(checkRepsLimit({ plan: 'smart', estado_pago: 'activo' }, 2, 2).canAdd, true)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PLAN_LIMITS,
  planLimitsForAccount,
  seatLimitForAccount,
  staffSeatBlock,
} from './subscriptionPlans.js'

test('cada plan declara el tope de auxiliares', () => {
  assert.deepEqual(
    {
      nomad: PLAN_LIMITS.nomad.maxAssistants,
      smart: PLAN_LIMITS.smart.maxAssistants,
      bionic: PLAN_LIMITS.bionic.maxAssistants,
      corporativo: PLAN_LIMITS.corporativo.maxAssistants,
    },
    { nomad: 1, smart: 2, bionic: 3, corporativo: 'custom' },
  )
  assert.equal(PLAN_LIMITS.nomad.maxRethus, 1)
  assert.equal(PLAN_LIMITS.smart.maxRethus, 4)
  assert.equal(PLAN_LIMITS.bionic.maxRethus, 6)
  assert.equal(PLAN_LIMITS.corporativo.maxRethus, 'custom')
  assert.equal(PLAN_LIMITS.corporativo.maxReps, 1)
})

test('Nomad acepta un auxiliar y rechaza el segundo', () => {
  const limits = planLimitsForAccount({ plan: 'nomad', estado_pago: 'activo', rol: 'admin' })
  const owner = { id: 'owner', rol: 'admin' }
  assert.equal(seatLimitForAccount({ plan: 'nomad', estado_pago: 'activo' }), 2)
  assert.equal(
    staffSeatBlock({
      members: [owner],
      role: 'recepcion',
      planName: 'Nomad',
      limits,
    }),
    null,
  )
  const blocked = staffSeatBlock({
    members: [owner, { id: 'aux', rol: 'recepcion' }],
    role: 'recepcion',
    planName: 'Nomad',
    limits,
  })
  assert.match(blocked, /máximo 1 auxiliar/)
})

test('Smart separa los 4 ReTHUS de los 2 auxiliares', () => {
  const limits = planLimitsForAccount({ plan: 'smart', estado_pago: 'activo' })
  const rethus = [
    { id: '1', rol: 'admin' },
    { id: '2', rol: 'odontologo' },
    { id: '3', rol: 'odontologo' },
    { id: '4', rol: 'odontologo' },
  ]
  assert.match(
    staffSeatBlock({ members: rethus, role: 'odontologo', planName: 'Smart', limits }),
    /máximo 4 profesionales con ReTHUS/,
  )
  assert.equal(
    staffSeatBlock({ members: rethus, role: 'recepcion', planName: 'Smart', limits }),
    null,
  )
})

test('Corporativo y la cuenta exenta no tienen tope automático', () => {
  assert.equal(seatLimitForAccount({ plan: 'corporativo', estado_pago: 'activo' }), null)
  assert.equal(planLimitsForAccount({ plan: 'corporativo', estado_pago: 'activo' }).maxReps, 1)
  assert.equal(seatLimitForAccount({ plan: 'smart', estado_pago: 'exento' }), null)
})

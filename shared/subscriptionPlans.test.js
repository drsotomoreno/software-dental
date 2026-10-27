import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyClinicAssistantLookup,
  checkUserLimits,
  snapshotLimitError,
  seatLimitForAccount,
} from './subscriptionPlans.js'

const corporativo = { plan: 'corporativo', estado_pago: 'activo', rol: 'admin' }

test('el rol elige el contador: auxiliares o profesionales ReTHUS', () => {
  const clinic = {
    ...corporativo,
    custom_max_assistants: 2,
    custom_max_rethus: 5,
  }
  assert.equal(checkUserLimits(clinic, true, 1).canAdd, true)
  assert.equal(checkUserLimits(clinic, true, 2).canAdd, false)
  assert.equal(checkUserLimits(clinic, true, 2).userType, 'Auxiliares')
  assert.equal(checkUserLimits(clinic, false, 4).canAdd, true)
  assert.equal(checkUserLimits(clinic, false, 5).canAdd, false)
  assert.equal(checkUserLimits(clinic, false, 5).userType, 'Profesionales (ReTHUS)')
  assert.match(checkUserLimits(clinic, false, 5).planName, /Corporativo/)
})

test('en corporativo la columna vacía vale 0 y no usa el otro tope', () => {
  const clinic = { ...corporativo, custom_max_assistants: null, custom_max_rethus: 8 }
  assert.equal(checkUserLimits(clinic, true, 0).limit, 0)
  assert.equal(checkUserLimits(clinic, true, 0).canAdd, false)
  assert.equal(checkUserLimits(clinic, false, 7).canAdd, true)
  assert.equal(checkUserLimits({ ...corporativo, customMaxRethus: 3 }, false, 3).limit, 3)
})

test('Nomad, Smart y BioniC ignoran las columnas manuales', () => {
  assert.equal(
    checkUserLimits(
      { plan: 'nomad', estado_pago: 'activo', custom_max_assistants: 40, custom_max_rethus: 40 },
      true,
      1,
    ).limit,
    1,
  )
  assert.equal(
    checkUserLimits({ plan: 'smart', estado_pago: 'activo', custom_max_rethus: 80 }, false, 2).limit,
    3,
  )
  assert.equal(
    checkUserLimits({ plan: 'bionic', estado_pago: 'activo', custom_max_assistants: 9 }, true, 0).limit,
    1,
  )
  assert.equal(checkUserLimits({ plan: 'smart', estado_pago: 'activo' }, false, 3).canAdd, false)
  assert.equal(checkUserLimits({ plan: 'smart', estado_pago: 'activo' }, true, 0).canAdd, true)
})

test('la prueba, el exento y el superadmin no usan el tope manual', () => {
  assert.equal(
    checkUserLimits({ ...corporativo, estado_pago: 'prueba', custom_max_rethus: 20 }, false, 1).limit,
    1,
  )
  assert.equal(
    checkUserLimits({ ...corporativo, estado_pago: 'exento', custom_max_assistants: 0 }, true, 9).canAdd,
    true,
  )
  assert.equal(
    checkUserLimits({ ...corporativo, rol: 'superadmin', custom_max_rethus: 0 }, false, 4).limit,
    null,
  )
})

test('la fila de clinics pisa auxiliares y ReTHUS, incluso si vienen NULL', () => {
  const account = { ...corporativo, customMaxAssistants: 30, customMaxRethus: 12 }
  const fromRow = applyClinicAssistantLookup(account, {
    found: true,
    custom_max_assistants: 6,
    custom_max_rethus: null,
  })
  assert.equal(checkUserLimits(fromRow, true, 5).canAdd, true)
  assert.equal(checkUserLimits(fromRow, false, 0).limit, 0)
  const kept = applyClinicAssistantLookup(account, { found: false })
  assert.equal(checkUserLimits(kept, true, 10).limit, 30)
  assert.equal(checkUserLimits(kept, false, 12).canAdd, false)
})

test('el cupo combinado del catálogo no cambia', () => {
  assert.equal(seatLimitForAccount({ plan: 'smart', estado_pago: 'activo' }), 4)
  assert.equal(seatLimitForAccount({ ...corporativo }), 100)
})

test('el mensaje de cupo lleno nombra el tipo de usuario', () => {
  const seats = {
    planName: 'Smart',
    assistantsUsed: 1,
    maxAssistants: 1,
    rethusUsed: 2,
    maxRethus: 3,
  }
  assert.match(snapshotLimitError(seats, true) ?? '', /máximo 1 auxiliares/)
  assert.equal(snapshotLimitError(seats, false), null)
  assert.match(snapshotLimitError({ ...seats, rethusUsed: 3 }, false) ?? '', /profesionales \(ReTHUS\)/)
})

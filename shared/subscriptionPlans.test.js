import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyClinicAssistantLookup,
  assistantLimitError,
  customMaxAssistantsForAccount,
  normalizeCustomMaxAssistants,
  seatLimitForAccount,
} from './subscriptionPlans.js'

const corporativo = { plan: 'corporativo', estado_pago: 'activo', rol: 'admin' }

test('normaliza el tope manual y descarta valores que no son enteros positivos o cero', () => {
  assert.equal(normalizeCustomMaxAssistants(null), null)
  assert.equal(normalizeCustomMaxAssistants(''), null)
  assert.equal(normalizeCustomMaxAssistants('8'), 8)
  assert.equal(normalizeCustomMaxAssistants(0), 0)
  assert.equal(normalizeCustomMaxAssistants(-1), null)
  assert.equal(normalizeCustomMaxAssistants(2.5), null)
})

test('el tope manual de auxiliares solo aplica al plan corporativo', () => {
  assert.equal(customMaxAssistantsForAccount({ ...corporativo, custom_max_assistants: 12 }), 12)
  assert.equal(customMaxAssistantsForAccount({ ...corporativo, customMaxAssistants: 4 }), 4)
  assert.equal(customMaxAssistantsForAccount({ ...corporativo, custom_max_assistants: null }), null)

  assert.equal(
    customMaxAssistantsForAccount({ plan: 'smart', estado_pago: 'activo', custom_max_assistants: 40 }),
    null,
  )
  assert.equal(
    customMaxAssistantsForAccount({ plan: 'nomad', estado_pago: 'activo', customMaxAssistants: 1 }),
    null,
  )
  assert.equal(
    customMaxAssistantsForAccount({ plan: 'bionic', estado_pago: 'activo', custom_max_assistants: 9 }),
    null,
  )
  assert.equal(
    customMaxAssistantsForAccount({ ...corporativo, estado_pago: 'prueba', custom_max_assistants: 20 }),
    null,
  )
  assert.equal(
    customMaxAssistantsForAccount({ ...corporativo, estado_pago: 'exento', custom_max_assistants: 20 }),
    null,
  )
  assert.equal(
    customMaxAssistantsForAccount({ ...corporativo, rol: 'superadmin', custom_max_assistants: 20 }),
    null,
  )
})

test('la fila de clinics pisa el valor guardado en la cuenta, incluso si es NULL', () => {
  const account = { ...corporativo, customMaxAssistants: 30 }
  assert.equal(
    customMaxAssistantsForAccount(applyClinicAssistantLookup(account, { found: true, value: 6 })),
    6,
  )
  assert.equal(
    customMaxAssistantsForAccount(applyClinicAssistantLookup(account, { found: true, value: null })),
    null,
  )
  assert.equal(
    customMaxAssistantsForAccount(applyClinicAssistantLookup(account, { found: false })),
    30,
  )
})

test('un plan que no es corporativo conserva su tope de colaboradores', () => {
  assert.equal(seatLimitForAccount({ plan: 'smart', estado_pago: 'activo', custom_max_assistants: 80 }), 4)
  assert.equal(seatLimitForAccount({ ...corporativo, custom_max_assistants: 80 }), 100)
})

test('bloquea el alta de auxiliares solo cuando el tope corporativo está lleno', () => {
  assert.match(assistantLimitError(3, 3) ?? '', /máximo 3 auxiliares/)
  assert.match(assistantLimitError(3, 3) ?? '', /Actualmente tiene 3/)
  assert.match(assistantLimitError(3, 4) ?? '', /Actualmente tiene 4/)
  assert.match(assistantLimitError(3, 3) ?? '', /exclusivo del plan corporativo/)
  assert.equal(assistantLimitError(3, 2), null)
  assert.equal(assistantLimitError(null, 9), null)
  assert.match(assistantLimitError(0, 0) ?? '', /máximo 0 auxiliares/)
  assert.equal(assistantLimitError(2, 2, false), null)
})

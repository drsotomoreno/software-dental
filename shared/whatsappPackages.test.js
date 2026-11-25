import assert from 'node:assert/strict'
import test from 'node:test'
import {
  creditsForWhatsappPackage,
  getWhatsappPackageById,
  hasActivePaidSubscription,
  whatsappSubscriptionSnapshot,
  WHATSAPP_PACKAGE_IDS,
  WHATSAPP_PACKAGES,
} from './whatsappPackages.js'

test('catálogo tiene los 4 paquetes prepago con montos COP', () => {
  assert.deepEqual(WHATSAPP_PACKAGE_IDS, [
    'REMINDERS_50',
    'REMINDERS_150',
    'CHATBOT_200',
    'CHATBOT_600',
  ])
  assert.equal(getWhatsappPackageById('reminders_50')?.amountCOP, 20000)
  assert.equal(getWhatsappPackageById('REMINDERS_150')?.amountCOP, 50000)
  assert.equal(getWhatsappPackageById('CHATBOT_200')?.amountCOP, 20000)
  assert.equal(getWhatsappPackageById('CHATBOT_600')?.amountCOP, 50000)
})

test('créditos acreditan el total del paquete (bonus solo marketing)', () => {
  assert.equal(creditsForWhatsappPackage(getWhatsappPackageById('REMINDERS_50')), 50)
  assert.equal(creditsForWhatsappPackage(getWhatsappPackageById('REMINDERS_150')), 150)
  assert.equal(getWhatsappPackageById('REMINDERS_150')?.bonusCredits, 25)
  assert.equal(creditsForWhatsappPackage(getWhatsappPackageById('CHATBOT_200')), 200)
  assert.equal(creditsForWhatsappPackage(getWhatsappPackageById('CHATBOT_600')), 600)
  assert.equal(getWhatsappPackageById('CHATBOT_600')?.bonusCredits, 100)
  assert.equal(WHATSAPP_PACKAGES.length, 4)
})

test('hasActivePaidSubscription bloquea free_trial / prueba', () => {
  assert.equal(
    hasActivePaidSubscription({
      estado_pago: 'prueba',
      plan: 'nomad',
      fecha_vencimiento: new Date(Date.now() + 86400000).toISOString(),
    }),
    false,
  )
  assert.equal(
    hasActivePaidSubscription({
      subscription_status: 'active',
      plan_type: 'free_trial',
    }),
    false,
  )
})

test('hasActivePaidSubscription acepta activo con plan pago vigente', () => {
  assert.equal(
    hasActivePaidSubscription({
      estado_pago: 'activo',
      plan: 'smart',
      fecha_vencimiento: new Date(Date.now() + 86400000).toISOString(),
    }),
    true,
  )
  assert.equal(
    hasActivePaidSubscription({
      email: 'doctormauriciosoto@gmail.com',
      estado_pago: 'exento',
    }),
    true,
  )
})

test('whatsappSubscriptionSnapshot normaliza trial vs active', () => {
  const trial = whatsappSubscriptionSnapshot({ estado_pago: 'prueba', plan: 'nomad' })
  assert.equal(trial.subscription_status, 'trial')
  assert.equal(trial.plan_type, 'free_trial')
  assert.equal(trial.paid_subscription_active, false)

  const paid = whatsappSubscriptionSnapshot({
    estado_pago: 'activo',
    plan: 'bionic',
    fecha_vencimiento: new Date(Date.now() + 86400000).toISOString(),
  })
  assert.equal(paid.subscription_status, 'active')
  assert.equal(paid.paid_subscription_active, true)
})

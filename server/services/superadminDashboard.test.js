import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fixtureMrrCop,
  getDashboardMetrics,
  listTenants,
  resetSuperadminOverrides,
  suspendTenant,
} from './superadminDashboard.js'
import router from '../routes/superadmin.routes.js'

test('el panel global exige token y soloSuperAdmin', () => {
  const names = router.stack.filter((layer) => !layer.route).map((layer) => layer.handle?.name)
  assert.ok(names.includes('verificarToken'))
  assert.ok(names.includes('soloSuperAdmin'))
  const paths = router.stack.filter((layer) => layer.route).map((layer) => layer.route.path)
  assert.ok(paths.includes('/metrics'))
  assert.ok(paths.includes('/tenants'))
  assert.ok(paths.includes('/tenants/:id/suspend'))
  assert.ok(paths.includes('/tenants/:id/sync'))
  assert.ok(paths.includes('/logs'))
  assert.ok(paths.includes('/ping/minsalud'))
  assert.ok(paths.includes('/infrastructure'))
})

test('sin cuentas de suscripción el panel usa clínicas de demostración y puede suspenderlas', async () => {
  resetSuperadminOverrides()
  const failing = async () => {
    throw Object.assign(new Error('PostgreSQL no está configurado.'), { code: 'PG_UNAVAILABLE' })
  }
  const isolated = { accounts: null, query: failing }

  const listed = await listTenants(isolated)
  assert.equal(listed.source, 'fixture')
  assert.equal(listed.tenants.filter((tenant) => tenant.status === 'activa').length, 3)

  const target = listed.tenants.find((tenant) => tenant.status === 'activa')
  const suspended = await suspendTenant(target.id, 'suspendida', isolated)
  assert.equal(suspended.status, 'suspendida')

  const again = await listTenants(isolated)
  assert.equal(again.tenants.find((tenant) => tenant.id === target.id).status, 'suspendida')

  const missing = await suspendTenant('no-existe', 'suspendida', isolated)
  assert.equal(missing, null)
  resetSuperadminOverrides()
})

test('solo la cuenta maestra y las clínicas con suscripción pagada son inquilinos', async () => {
  resetSuperadminOverrides()
  const renews = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const accounts = [
    {
      id: '2aae9ec2-4e41-4ea2-b932-0a6642894591',
      email: 'doctormauriciosoto@gmail.com',
      nombre: 'Elias Soto',
      clinicName: 'Consultorio Odontologico Soto',
      repsCode: '6800103898-01',
      rethusNumber: '438265',
      estado_pago: 'exento',
      plan: 'exento',
      rol: 'superadmin',
      clinicId: '2aae9ec2-4e41-4ea2-b932-0a6642894591',
    },
    {
      id: 'lead-1',
      email: 'lead@clinica.co',
      nombre: 'Lead Sin Pago',
      clinicName: 'Consultorio Sin Compra',
      repsCode: '1100100000-01',
      rethusNumber: '111111',
      estado_pago: 'pendiente',
      plan: null,
      clinicId: 'lead-1',
    },
    {
      id: 'trial-1',
      email: 'trial@clinica.co',
      nombre: 'Odontologo Trial',
      clinicName: 'Prueba Gratis',
      estado_pago: 'prueba',
      plan: 'prueba',
      clinicId: 'trial-1',
      fecha_vencimiento: renews,
    },
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'pago@clinica.co',
      nombre: 'Dra. Pago Real',
      clinicName: 'Clínica Pagada',
      repsCode: '0500102211-04',
      rethusNumber: '512883',
      estado_pago: 'activo',
      plan: 'smart',
      clinicId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      subscriptionPaidAt: '2026-11-01T00:00:00.000Z',
      fecha_vencimiento: renews,
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      email: 'aux@clinica.co',
      nombre: 'Auxiliar',
      clinicName: 'Clínica Pagada',
      estado_pago: 'activo',
      plan: 'smart',
      clinicId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      subscriptionPaidAt: '2026-11-01T00:00:00.000Z',
      fecha_vencimiento: renews,
    },
  ]

  const listed = await listTenants({
    accounts,
    query: async (sql) => {
      if (sql.includes('FROM pacientes')) {
        return [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', total: 4 }]
      }
      return []
    },
  })

  assert.equal(listed.source, 'postgres')
  assert.deepEqual(
    listed.tenants.map((tenant) => tenant.clinicName),
    ['Consultorio Odontologico Soto', 'Clínica Pagada'],
  )
  const master = listed.tenants[0]
  assert.equal(master.platformOwner, true)
  assert.equal(master.ownerName, 'Elias Soto')
  assert.equal(master.email, 'doctormauriciosoto@gmail.com')
  assert.equal(master.repsCode, '6800103898-01')
  assert.equal(master.rethus, '438265')
  assert.equal(master.plan, 'Exento')
  assert.equal(master.mrrCop, 0)
  const paid = listed.tenants[1]
  assert.equal(paid.ownerName, 'Dra. Pago Real')
  assert.equal(paid.email, 'pago@clinica.co')
  assert.equal(paid.plan, 'Smart')
  assert.equal(paid.patientCount, 4)
  assert.equal(paid.mrrCop, 100000)

  const blocked = await suspendTenant(master.id, 'suspendida', { accounts, query: async () => [] })
  assert.equal(blocked.status, 'activa')
  resetSuperadminOverrides()
})

test('las métricas cuentan inquilinos reales y no el MRR de demostración', async () => {
  resetSuperadminOverrides()
  const renews = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const metrics = await getDashboardMetrics({
    accounts: [
      {
        id: 'master-1',
        email: 'doctormauriciosoto@gmail.com',
        nombre: 'Elias Soto',
        clinicName: 'Consultorio Odontologico Soto',
        repsCode: '6800103898-01',
        rethusNumber: '438265',
        estado_pago: 'exento',
        plan: 'exento',
        clinicId: 'master-1',
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'pago@clinica.co',
        nombre: 'Dra. Pago Real',
        clinicName: 'Clínica Pagada',
        estado_pago: 'activo',
        plan: 'nomad',
        clinicId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        subscriptionPaidAt: '2026-11-01T00:00:00.000Z',
        fecha_vencimiento: renews,
      },
      {
        id: 'lead-1',
        email: 'lead@clinica.co',
        nombre: 'Lead',
        clinicName: 'Sin Compra',
        estado_pago: 'pendiente',
        clinicId: 'lead-1',
      },
    ],
    query: async (sql) => {
      if (sql.includes('FROM pacientes')) {
        return [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', total: 4 }]
      }
      return []
    },
  })

  assert.equal(metrics.source, 'postgres')
  assert.equal(metrics.activeClinics, 2)
  assert.equal(metrics.registeredPatients, 4)
  assert.equal(metrics.mrrSimulated, false)
  assert.equal(metrics.mrrCop, 50000)
  assert.notEqual(metrics.mrrCop, fixtureMrrCop())
  assert.equal(metrics.services.length, 3)
  resetSuperadminOverrides()
})

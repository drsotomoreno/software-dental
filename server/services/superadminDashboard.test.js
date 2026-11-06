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

test('sin PostgreSQL el panel usa clínicas de demostración y puede suspenderlas', async () => {
  resetSuperadminOverrides()
  const failing = async () => {
    throw Object.assign(new Error('PostgreSQL no está configurado.'), { code: 'PG_UNAVAILABLE' })
  }

  const listed = await listTenants({ query: failing })
  assert.equal(listed.source, 'fixture')
  assert.equal(listed.tenants.filter((tenant) => tenant.status === 'activa').length, 3)

  const target = listed.tenants.find((tenant) => tenant.status === 'activa')
  const suspended = await suspendTenant(target.id, 'suspendida', { query: failing })
  assert.equal(suspended.status, 'suspendida')

  const again = await listTenants({ query: failing })
  assert.equal(again.tenants.find((tenant) => tenant.id === target.id).status, 'suspendida')

  const missing = await suspendTenant('no-existe', 'suspendida', { query: failing })
  assert.equal(missing, null)
  resetSuperadminOverrides()
})

test('PostgreSQL alimenta clínicas y pacientes; el MRR sigue simulado', async () => {
  resetSuperadminOverrides()
  const metrics = await getDashboardMetrics({
    query: async (sql) => {
      if (sql.includes('FROM clinicas')) {
        return [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            clinic_name: 'Sede Real',
            owner_name: 'Dra. Real',
            reps_code: '1100103898-01',
            rethus: '438120',
            status: 'activo',
            patient_count: 4,
          },
        ]
      }
      if (sql.includes('FROM pacientes')) return [{ total: 9 }]
      return []
    },
  })

  assert.equal(metrics.source, 'postgres')
  assert.equal(metrics.activeClinics, 1)
  assert.equal(metrics.registeredPatients, 9)
  assert.equal(metrics.mrrSimulated, true)
  assert.equal(metrics.mrrCop, fixtureMrrCop())
  assert.equal(metrics.services.length, 3)
})

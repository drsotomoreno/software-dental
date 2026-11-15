#!/usr/bin/env node
/**
 * Smoke post-deploy multi-tenant: login maestro + GET /api/sync/pull?full=0.
 * Falla el deploy si el pull no es 200/slim (evita repetir Isabel: UI vacía con datos en disco).
 *
 *   PUBLIC_BASE_URL=http://127.0.0.1:3000 node scripts/smoke-clinical-sync-pull.cjs
 */
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const MASTER_EMAIL = 'doctormauriciosoto@gmail.com'

async function loadMasterPassword() {
  const storePath = path.resolve(process.cwd(), 'server/services/subscriptionAuthStore.js')
  const src = fs.readFileSync(storePath, 'utf8')
  const m = src.match(/MASTER_PASSWORD = '([^']+)'/)
  if (!m) throw new Error('MASTER_PASSWORD no encontrado')
  return m[1]
}

async function main() {
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_PUBLIC_URL ||
    'http://127.0.0.1:3000'
  const password = await loadMasterPassword()

  const loginRes = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: MASTER_EMAIL, password }),
  })
  const loginJson = await loginRes.json().catch(() => ({}))
  const token =
    loginJson.token || loginJson.accessToken || loginJson.data?.token || null
  if (!loginRes.ok || !token) {
    console.error('SMOKE_LOGIN_FAIL', loginRes.status, loginJson.error || loginJson)
    process.exit(2)
  }

  const pullRes = await fetch(`${base}/api/sync/pull?full=0`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Client-Email': MASTER_EMAIL,
    },
  })
  const pullJson = await pullRes.json().catch(() => ({}))
  const patients = Array.isArray(pullJson.patients) ? pullJson.patients : []
  const ok =
    pullRes.ok &&
    (pullJson.success === true || pullJson.ok === true) &&
    pullJson.slim === true &&
    patients.length === Number(pullJson.patientCount || patients.length)

  // Clasificación coherente (no solo phase).
  const { classifyPatientListBucket, patientFlagsFromSyncRecord } = await import(
    pathToFileURL(path.resolve(process.cwd(), 'shared/clinicalListBucket.js')).href
  )
  const buckets = { activo: 0, valorado: 0, terminado: 0 }
  for (const row of patients) {
    buckets[classifyPatientListBucket(patientFlagsFromSyncRecord(row))]++
  }

  console.log(
    JSON.stringify(
      {
        ok,
        base,
        pullStatus: pullRes.status,
        slim: pullJson.slim,
        patientCount: pullJson.patientCount ?? patients.length,
        buckets,
        code: pullJson.code || null,
        error: pullJson.error || null,
      },
      null,
      2,
    ),
  )

  if (!ok) process.exit(3)
  // Clínica maestra de producción debe tener cohort; en entorno vacío permitir 0.
  if (process.env.SMOKE_REQUIRE_PATIENTS === '1' && patients.length < 1) {
    console.error('SMOKE_REQUIRE_PATIENTS: patientCount=0')
    process.exit(4)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

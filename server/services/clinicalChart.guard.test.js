import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

async function readSrc(rel) {
  return readFile(join(root, rel), 'utf8')
}

test('patient_clinical_charts tiene PK compuesta y control optimista', async () => {
  const sql = await readSrc('server/db/migrations/20261119150000_patient_clinical_charts.sql')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS patient_clinical_charts/)
  assert.match(sql, /clinica_id TEXT NOT NULL/)
  assert.match(sql, /patient_sync_id TEXT NOT NULL/)
  assert.match(sql, /clinical_revision INTEGER NOT NULL DEFAULT 1/)
  assert.match(sql, /content_hash TEXT NOT NULL/)
  assert.match(sql, /chart_data JSONB NOT NULL/)
  assert.match(sql, /PRIMARY KEY \(clinica_id, patient_sync_id\)/)

  const src = await readSrc('server/services/clinicalPostgresStore.js')
  assert.match(src, /WHERE patient_clinical_charts\.clinical_revision <= \$4::integer/)
  assert.match(src, /await client\.query\('BEGIN'\)/)
  assert.match(src, /readOrMigratePatientChart/)
  assert.match(src, /pullPatientChart/)
})

test('pull streamea JSON y la ficha individual vive en /api/patients/:id/chart', async () => {
  const routes = await readSrc('server/routes/clinicalSync.routes.js')
  assert.match(routes, /sendJsonStream\(res, 200, snapshotResponse\(auth, snapshot\)\)/)
  assert.match(routes, /const slim = !includeBlobs/)
  const chart = await readSrc('server/routes/patientChart.routes.js')
  assert.match(chart, /router\.get\('\/:idOrSyncId\/chart'/)
  assert.match(chart, /readOrMigratePatientChart/)
  const server = await readSrc('server.js')
  assert.match(server, /app\.use\('\/api\/patients', patientChartRoutes\)/)
})

test('el cliente reconcilia UUID y manda localId + documentNumber', async () => {
  const draft = await readSrc('src/utils/patientClinicalDraft.ts')
  assert.match(draft, /export async function reconcilePatientDraftKeys/)
  assert.match(draft, /documentNumber/)
  const page = await readSrc('src/pages/PatientDetailPage.tsx')
  assert.match(page, /reconcilePatientDraftKeys/)
  assert.match(page, /localId:/)
  assert.match(page, /documentNumber:/)
  const sync = await readSrc('src/services/clinicalSyncService.ts')
  assert.match(sync, /\/api\/patients\/\$\{encodeURIComponent\(routeKey\)\}\/chart/)
  assert.match(sync, /params\.set\('localId', localId\)/)
  assert.match(sync, /params\.set\('documentNumber', documentNumber\)/)
})

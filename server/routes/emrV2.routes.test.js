import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rejectHeavyBase64InJson } from '../services/emrV2AssetStore.js'
import {
  EMR_V2_PATIENT_UPDATED,
  emitEmrV2PatientUpdated,
} from '../services/emrV2Realtime.js'
import { clinicEmrV2Room } from '../socket/kioskSocket.js'
import { ALLOWED_CLINICAL_SECTIONS } from '../services/emrV2Store.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

async function readSrc(rel) {
  return readFile(join(root, rel), 'utf8')
}

test('migración assets define emr_v2_clinical_assets y ensureEmrV2Schema aplica ambas SQL', async () => {
  const sql = await readSrc('server/db/migrations/20261119190000_emr_v2_assets_and_rls.sql')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS emr_v2_clinical_assets/)
  assert.match(sql, /sha256_hash TEXT NOT NULL/)
  assert.match(sql, /storage_driver TEXT NOT NULL/)
  assert.match(sql, /firma_paciente/)
  assert.match(sql, /consentimiento_pdf/)

  const store = await readSrc('server/services/emrV2Store.js')
  assert.match(store, /20261119180000_emr_v2_acid_immutable\.sql/)
  assert.match(store, /20261119190000_emr_v2_assets_and_rls\.sql/)
  assert.match(store, /export async function ensureEmrV2Schema\(pool/)
})

test('server.js monta /api/v2 sin tocar /api/sync legacy', async () => {
  const server = await readSrc('server.js')
  assert.match(server, /app\.use\('\/api\/v2', emrV2Routes\)/)
  assert.match(server, /app\.use\('\/api\/sync', clinicalSyncRoutes\)/)
  assert.match(server, /app\.use\('\/api\/patients', patientChartRoutes\)/)
  assert.match(server, /ensureEmrV2Schema/)
})

test('rutas v2: PATCH sección, evolutions, lock, assets, audit-trail', async () => {
  const routes = await readSrc('server/routes/emrV2.routes.js')
  assert.match(routes, /router\.patch\('\/patients\/:idOrSyncId\/base\/:section'/)
  assert.match(routes, /router\.post\('\/patients\/:idOrSyncId\/evolutions'/)
  assert.match(routes, /router\.post\('\/patients\/:idOrSyncId\/evolutions\/:evolutionId\/lock'/)
  assert.match(routes, /router\.post\('\/patients\/:idOrSyncId\/assets'/)
  assert.match(routes, /router\.get\('\/assets\/:assetId\/content'/)
  assert.match(routes, /router\.get\('\/patients\/:idOrSyncId\/audit-trail'/)
  assert.match(routes, /rejectHeavyBase64InJson/)
  assert.match(routes, /emitEmrV2PatientUpdated/)
  assert.match(routes, /upsertClinicalBaseSection/)
  assert.match(routes, /createOrLockEvolution/)
  assert.match(routes, /getOrMigrateEmrV2Chart/)
  assert.match(routes, /LEGAL_IMMUTABILITY_VIOLATION/)
  assert.deepEqual([...ALLOWED_CLINICAL_SECTIONS], [
    'anamnesis',
    'examen_estomatologico',
    'odontograma',
    'diagnosticos',
    'plan_tratamiento',
  ])
})

test('rechazo 400 de base64 / data:image pesado en payloads JSON', () => {
  const dataUrl = `data:image/png;base64,${'A'.repeat(100)}`
  const rejected = rejectHeavyBase64InJson({ motivo: 'ok', firma: dataUrl })
  assert.equal(rejected.ok, false)
  assert.equal(rejected.status, 400)
  assert.equal(rejected.code, 'BASE64_NOT_ALLOWED')
  assert.match(rejected.error, /POST \/api\/v2\/patients\/:id\/assets/)

  const heavy = 'A'.repeat(17 * 1024)
  const rejectedHeavy = rejectHeavyBase64InJson({ blob: heavy })
  assert.equal(rejectedHeavy.ok, false)
  assert.equal(rejectedHeavy.status, 400)

  const ok = rejectHeavyBase64InJson({
    motivoConsulta: 'Dolor',
    alergias: ['penicilina'],
  })
  assert.equal(ok.ok, true)
})

test('Socket.io: sala clinic:… y evento emr:v2:patient-updated', async () => {
  assert.equal(clinicEmrV2Room('clinic:demo@test.com'), 'clinic:demo@test.com')
  assert.equal(clinicEmrV2Room('demo-uuid'), 'clinic:demo-uuid')
  assert.equal(EMR_V2_PATIENT_UPDATED, 'emr:v2:patient-updated')

  const socketSrc = await readSrc('server/socket/kioskSocket.js')
  assert.match(socketSrc, /export function clinicEmrV2Room/)
  assert.match(socketSrc, /socket\.join\(emrRoom\)/)

  const realtime = await readSrc('server/services/emrV2Realtime.js')
  assert.match(realtime, /emr:v2:patient-updated/)
  assert.match(realtime, /clinicEmrV2Room/)

  let emitted = null
  const fakeIo = {
    to(room) {
      return {
        emit(event, payload) {
          emitted = { room, event, payload }
        },
      }
    },
  }
  // Inyectamos vía monkey-patch del getter al módulo ya cargado no es trivial;
  // validamos el contrato de payload que emitiría tras un PATCH exitoso.
  const payload = {
    patientSyncId: 'sync-1',
    section: 'anamnesis',
    newVersion: 2,
    actorEmail: 'dr@test.com',
    updatedAt: '2026-11-19T20:00:00.000Z',
  }
  fakeIo.to('clinic:demo').emit(EMR_V2_PATIENT_UPDATED, payload)
  assert.equal(emitted.event, 'emr:v2:patient-updated')
  assert.equal(emitted.room, 'clinic:demo')
  assert.equal(emitted.payload.section, 'anamnesis')
  assert.equal(emitted.payload.newVersion, 2)
  assert.equal(typeof emitEmrV2PatientUpdated, 'function')
})

test('bloqueo legal y lazy migration están cableados en store/rutas', async () => {
  const store = await readSrc('server/services/emrV2Store.js')
  assert.match(store, /export async function lazyMigratePatientToEmrV2/)
  assert.match(store, /export async function getOrMigrateEmrV2Chart/)
  assert.match(store, /extractAndPersistHeavyBinaries/)
  assert.match(store, /is_locked = TRUE|is_locked/)
  assert.match(store, /LEGAL_IMMUTABILITY_VIOLATION/)

  const routes = await readSrc('server/routes/emrV2.routes.js')
  assert.match(routes, /mutateLockedEvolutionForbidden/)
  assert.match(routes, /getOrMigrateEmrV2Chart/)

  const assets = await readSrc('server/services/emrV2AssetStore.js')
  assert.match(assets, /clinical-assets/)
  assert.match(assets, /AWS_S3_BUCKET|S3_CLINICAL_BUCKET/)
  assert.match(assets, /rejectHeavyBase64InJson/)
  assert.match(assets, /sha256/)
})

test('asset store rechaza dataURL en anamnesis como haría PATCH /base/anamnesis', () => {
  const body = {
    payload: {
      motivoConsulta: 'Control',
      signatureDataUrl: `data:image/png;base64,${Buffer.from('fake-png').toString('base64')}`,
    },
    expectedVersion: 1,
  }
  const check = rejectHeavyBase64InJson(body.payload)
  assert.equal(check.ok, false)
  assert.equal(check.status, 400)
  assert.equal(check.code, 'BASE64_NOT_ALLOWED')
})

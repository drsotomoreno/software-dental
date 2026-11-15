/**
 * Regresión: Pacientes Valorados debe poder abrir y recuperar la historia abreviada.
 * Si alguno de estos asserts falla, el bug de ficha vacía / sin botón puede volver.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

async function readSrc(rel) {
  return readFile(join(root, rel), 'utf8')
}

test('ValuatedPatientsPage expone Abrir valoración (acción siempre visible)', async () => {
  const src = await readSrc('src/pages/ValuatedPatientsPage.tsx')
  assert.match(src, /Abrir valoración/)
  assert.match(src, /to=\{valuationPath\}/)
  assert.match(src, /resetHistoryView:\s*true/)
  // No volver a una tabla donde Acciones quede fuera de viewport.
  assert.doesNotMatch(src, /Puede abrir la ficha o pasarlos a historia completa/)
})

test('PatientDetailPage recupera valuationDraft bajo demanda al abrir valorado', async () => {
  const src = await readSrc('src/pages/PatientDetailPage.tsx')
  assert.match(src, /pullPatientDraftOnDemand/)
  assert.match(src, /pickLivingDraftForm/)
  assert.match(src, /Valorados: el pull global ya no trae drafts/)
  assert.match(src, /ok:\$\{requestId\}/)
})

test('API sync expone GET /draft/:patientSyncId', async () => {
  const src = await readSrc('server/routes/clinicalSync.routes.js')
  assert.match(src, /router\.get\('\/draft\/:patientSyncId'/)
  assert.match(src, /pullPatientDraft/)
})

test('pullClinicSnapshot documenta drafts vacíos en HTTP y pullPatientDraft existe', async () => {
  const src = await readSrc('server/services/clinicalSyncStore.js')
  assert.match(src, /drafts:\s*\[\]/)
  assert.match(src, /export async function pullPatientDraft/)
  assert.match(src, /extractDraftRecordFromFile/)
})

test('omitHeavy no puede anular valuationDraft (fuente)', async () => {
  const src = await readSrc('shared/clinicalSyncHeavyPayload.js')
  assert.match(src, /valuationDraft.*NUNCA/i)
  assert.match(src, /OMITTABLE_HEAVY_DRAFT_KEYS/)
  assert.doesNotMatch(
    src,
    /const DRAFT_FORM_KEYS = \['clinicalDraft', 'valuationDraft'\]/,
  )
})

test('clinicalSyncService prefetch de valorados sin draft local', async () => {
  const src = await readSrc('src/services/clinicalSyncService.ts')
  assert.match(src, /prefetchMissingValuationDrafts/)
  assert.match(src, /pullPatientDraftOnDemand/)
})

test('nginx no cachea index.html ni rutas SPA (UI vieja de valorados)', async () => {
  const src = await readSrc('scripts/configure-nginx-spa-static.sh')
  assert.match(src, /location = \/index\.html/)
  assert.match(src, /@mhd_spa/)
  assert.match(src, /no-store, no-cache, must-revalidate/)
})

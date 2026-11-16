import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const storePath = join(here, 'ripsSubmissionsStore.ts')
const historyPath = join(here, '../components/rips/RipsSubmissionsHistory.tsx')
const evolutionPath = join(here, '../components/clinical/EvolutionRipsPanel.tsx')
const exportPagePath = join(here, '../pages/RipsExportPage.tsx')
const exportFormPath = join(here, '../components/rips/RipsExportForm.tsx')
const isolationPath = join(here, '../services/clinicLocalIsolation.ts')

test('el historial se escribe con clinicId canónico y deduplica por CUV', async () => {
  const src = await readFile(storePath, 'utf8')
  assert.match(src, /getCurrentClinicId/)
  assert.match(src, /registrarRadicacionRipsSiNueva/)
  assert.match(src, /reconciliarHistorialRipsDesdeHistorias/)
  assert.match(src, /yaExisteCuv/)
})

test('la tarjeta de historial reconcilia notas ya radicadas al montar', async () => {
  const src = await readFile(historyPath, 'utf8')
  assert.match(src, /reconciliarHistorialRipsDesdeHistorias/)
  assert.match(src, /rips_submissions/)
})

test('evolución y exportación guardan en el historial local al radicar', async () => {
  const evolution = await readFile(evolutionPath, 'utf8')
  const page = await readFile(exportPagePath, 'utf8')
  const form = await readFile(exportFormPath, 'utf8')
  assert.match(evolution, /guardarHistorialRadicacionRips/)
  assert.match(page, /guardarHistorialRadicacionRips/)
  assert.match(form, /guardarHistorialRadicacionRips/)
  assert.doesNotMatch(page, /db\.rips_submissions\.add/)
  assert.doesNotMatch(form, /db\.rips_submissions\.add/)
})

test('purge de rips_submissions reetiqueta filas sin clinicId en lugar de borrarlas', async () => {
  const src = await readFile(isolationPath, 'utf8')
  const block = src.slice(
    src.indexOf('for (const row of await db.rips_submissions.toArray())'),
    src.indexOf('for (const row of await db.ripsTemporales.toArray())'),
  )
  assert.match(block, /Sin clinicId: reetiquetar/)
  assert.match(block, /rips_submissions\.update/)
  assert.match(block, /clinicId: canonical/)
})

/**
 * Guard: /pacientes/:id no debe depender solo de Dexie.get(number).
 * Reproduce el fallo del video (lista OK → detalle «No se encontró»).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

function readSrc(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('patient route lookup guards (bug video No se encontró el paciente)', () => {
  test('getPatientByRouteId hace match flexible también para ids numéricos', () => {
    const src = readSrc('src/utils/patientId.ts')
    assert.match(src, /where\('syncId'\)\.equals\(needle\)/)
    assert.match(src, /String\(row\.id\) === needle/)
    assert.match(src, /legacyNumericIds/)
    // No limitar el filtro String(row.id) solo a rutas no numéricas
    assert.doesNotMatch(
      src,
      /if \(!patient && typeof numericKey === 'string'[\s\S]*?String\(row\.id\) === numericKey/,
    )
  })

  test('listados enlazan Ver historia con syncId canónico, no solo Dexie id', () => {
    const list = readSrc('src/pages/PatientListPage.tsx')
    const valuated = readSrc('src/pages/ValuatedPatientsPage.tsx')
    const completed = readSrc('src/pages/CompletedPatientsPage.tsx')
    assert.match(list, /p\.syncId \|\| p\.id/)
    assert.match(valuated, /patient\.syncId \|\| patient\.id/)
    assert.match(completed, /patient\.syncId \|\| patient\.id/)
  })

  test('detalle recupera ficha server-first antes de «No se encontró»', () => {
    const detail = readSrc('src/pages/PatientDetailPage.tsx')
    assert.match(detail, /pullPatientChartOnDemand/)
    assert.match(detail, /remotePatientLookup/)
    assert.match(detail, /useDentalEmrDbEpoch/)
    assert.match(detail, /No se encontró el paciente con ID/)
  })

  test('rebind IndexedDB notifica epoch para no dejar LiveQuery stale', () => {
    const db = readSrc('src/db/database.ts')
    const hook = readSrc('src/hooks/useDentalEmrDbEpoch.ts')
    assert.match(db, /DENTAL_EMR_DB_CHANGED_EVENT/)
    assert.match(db, /notifyDentalEmrDbChanged/)
    assert.match(hook, /DENTAL_EMR_DB_CHANGED_EVENT/)
  })
})

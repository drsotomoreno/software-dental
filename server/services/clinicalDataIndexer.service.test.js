import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  extractAnalyticsRows,
  splitSqlStatements,
} from './clinicalDataIndexer.service.js'

const MIGRATION = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/20261111163000_clinical_analytics_read_model.sql',
)

test('migración define tablas idx_* con llaves compuestas para UPSERT', async () => {
  const sql = await readFile(MIGRATION, 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS idx_pacientes/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS idx_evoluciones/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS idx_diagnosticos/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS idx_procedimientos/)
  assert.match(sql, /PRIMARY KEY \(clinic_id, patient_sync_id\)/)
  assert.match(sql, /PRIMARY KEY \(clinic_id, patient_sync_id, encounter_id\)/)
  assert.match(
    sql,
    /PRIMARY KEY \(clinic_id, patient_sync_id, encounter_id, cie10_code, tipo\)/,
  )
  assert.match(
    sql,
    /PRIMARY KEY \(clinic_id, patient_sync_id, encounter_id, procedure_sync_id\)/,
  )
  assert.ok(splitSqlStatements(sql).length > 4)
})

test('extractAnalyticsRows proyecta CIE-10, CUPS y facturas embebidas', () => {
  const rows = extractAnalyticsRows('clinic:demo', {
    patients: [
      {
        syncId: 'pac-1',
        payload: {
          firstName: 'Ana',
          lastName: 'Pérez',
          documentType: 'CC',
          documentNumber: '123',
          birthDate: '1990-01-15',
          gender: 'F',
        },
      },
    ],
    clinicalRecords: [
      {
        syncId: 'rec-1',
        payload: {
          patientSyncId: 'pac-1',
          professionalId: 'doc-1',
          diagnoses: [{ code: 'K02.1', type: 'principal', description: 'Caries' }],
          budgetItems: [{ id: 'b1', procedure: 'Resina', cupsCode: '232102', unitPrice: 150000, quantity: 1 }],
          paymentControl: [
            {
              id: 'pay-1',
              amount: 150000,
              cupsCode: '232102',
              paymentReason: 'Abono',
              invoices: [
                { id: 'inv-1', invoiceNumber: 'FV-001', amount: 150000 },
              ],
            },
          ],
          evolutionNotes: [
            {
              id: 'evo-1',
              date: '2026-11-10T15:00:00.000Z',
              procedure: 'Resina',
              cupsCode: '232102',
              cost: 150000,
              isBillable: true,
              signedAt: '2026-11-10T15:30:00.000Z',
              professionalName: 'Dr. Soto',
              authorUserId: 'doc-1',
              diagnoses: [{ code: 'K02.1', type: 'principal' }],
              catalogServices: [
                {
                  id: 'svc-1',
                  procedure: 'Resina',
                  cupsCode: '232102',
                  cost: 150000,
                  cie10Code: 'K02.1',
                },
              ],
            },
          ],
        },
      },
    ],
  })

  assert.equal(rows.patients.length, 1)
  assert.equal(rows.patients[0].patient_sync_id, 'pac-1')
  assert.equal(rows.patients[0].first_name, 'Ana')

  assert.equal(rows.evolutions.length, 1)
  assert.equal(rows.evolutions[0].encounter_id, 'evo-1')
  assert.equal(rows.evolutions[0].estado_firma, 'firmada')
  assert.equal(rows.evolutions[0].cups_principal, '232102')

  assert.ok(rows.diagnoses.some((d) => d.cie10_code === 'K021' && d.encounter_id === 'evo-1'))
  assert.ok(rows.procedures.some((p) => p.cups_code === '232102' && p.source === 'evolution'))
  assert.ok(rows.procedures.some((p) => p.source === 'budget' && p.valor_financiero === 150000))
  assert.ok(
    rows.procedures.some(
      (p) => p.source === 'invoice' && p.invoice_number === 'FV-001' && p.valor_financiero === 150000,
    ),
  )
})

test('extractAnalyticsRows no lanza con payload vacío o incompleto', () => {
  assert.deepEqual(extractAnalyticsRows('', null), {
    patients: [],
    evolutions: [],
    diagnoses: [],
    procedures: [],
  })
  assert.equal(extractAnalyticsRows('clinic:x', { clinicalRecords: [{ syncId: '' }] }).evolutions.length, 0)
})

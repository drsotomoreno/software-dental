/**
 * Indexador CQRS (Read Model) del snapshot clínico.
 * Escucha `snapshot:pushed` y proyecta CIE-10 / CUPS / demografía a tablas idx_*.
 *
 * Regla de oro: fallos o demoras NUNCA bloquean ni tumban el sync del frontend.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPgClient } from './durableStore.js'
import { clinicalSyncEvents, SNAPSHOT_PUSHED } from './clinicalSyncEvents.js'

const DIR = dirname(fileURLToPath(import.meta.url))
const MIGRATION_FILES = [
  join(DIR, '../db/migrations/20261111170000_cleanup_ghost_tables.sql'),
  join(DIR, '../db/migrations/20261111163000_clinical_analytics_read_model.sql'),
]

const CIE10_PATTERN = /^[A-Z]\d{2,3}[A-Z0-9]?$/i

let schemaReady = null
let listenerRegistered = false

/** Separa sentencias SQL respetando dollar-quotes (DO $$ … $$). */
export function splitSqlStatements(sql) {
  const statements = []
  let current = ''
  let index = 0
  let dollar = null

  while (index < sql.length) {
    if (!dollar && sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index)
      index = end === -1 ? sql.length : end + 1
      continue
    }

    if (!dollar && sql[index] === "'") {
      current += sql[index]
      index += 1
      while (index < sql.length) {
        current += sql[index]
        if (sql[index] === "'" && sql[index + 1] === "'") {
          current += sql[index + 1]
          index += 2
          continue
        }
        if (sql[index] === "'") {
          index += 1
          break
        }
        index += 1
      }
      continue
    }

    if (sql[index] === '$') {
      const match = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(index))
      if (match) {
        const tag = match[0]
        if (!dollar) dollar = tag
        else if (dollar === tag) dollar = null
        current += tag
        index += tag.length
        continue
      }
    }

    if (!dollar && sql[index] === ';') {
      const statement = current.trim()
      if (statement) statements.push(statement)
      current = ''
      index += 1
      continue
    }

    current += sql[index]
    index += 1
  }

  const tail = current.trim()
  if (tail) statements.push(tail)
  return statements
}

export async function ensureClinicalAnalyticsSchema() {
  if (!schemaReady) {
    schemaReady = withPgClient(async (client) => {
      for (const file of MIGRATION_FILES) {
        const sql = await readFile(file, 'utf8')
        for (const statement of splitSqlStatements(sql)) {
          await client.query(statement)
        }
      }
    }).catch((error) => {
      schemaReady = null
      throw error
    })
  }
  return schemaReady
}

function text(value, max = 255) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  return raw.slice(0, max)
}

function payloadOf(record) {
  if (!record || typeof record !== 'object') return null
  if (record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)) {
    return record.payload
  }
  return record
}

function syncIdOf(record, fallbackKeys = []) {
  const payload = payloadOf(record) || {}
  for (const key of ['syncId', 'id', ...fallbackKeys]) {
    const fromRecord = record?.[key]
    const fromPayload = payload[key]
    const value = text(fromRecord ?? fromPayload, 120)
    if (value) return value
  }
  return null
}

function normalizeCie10(code) {
  const compact = String(code ?? '')
    .replace(/[.\s]/g, '')
    .trim()
    .toUpperCase()
  if (!compact || !CIE10_PATTERN.test(compact)) return null
  return compact.slice(0, 7)
}

function normalizeCups(code) {
  const digits = String(code ?? '').replace(/\D/g, '')
  if (digits.length < 6) return null
  return digits.slice(-6)
}

function money(value) {
  if (value == null || value === '') return 0
  const number = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(number)) return 0
  return Math.round(number * 100) / 100
}

function asTimestamp(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function asDateOnly(value) {
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  return null
}

function estadoFirmaDeNota(note) {
  if (note?.signedAt || note?.isLocked === true || note?.professionalSignatureDataUrl) {
    return 'firmada'
  }
  return 'borrador'
}

/**
 * Proyecta filas del delta hacia el read model (sin I/O).
 * Exportado para pruebas unitarias.
 * @param {string} clinicId
 * @param {object} payload
 */
export function extractAnalyticsRows(clinicId, payload = {}) {
  const body = payload && typeof payload === 'object' ? payload : {}
  const clinic = text(clinicId, 120) || ''
  const patients = []
  const evolutions = []
  const diagnoses = []
  const procedures = []

  for (const raw of Array.isArray(body.patients) ? body.patients : []) {
    const body = payloadOf(raw)
    const patientSyncId = syncIdOf(raw)
    if (!clinic || !patientSyncId || !body) continue
    patients.push({
      clinic_id: clinic,
      patient_sync_id: patientSyncId,
      document_type: text(body.documentType, 5),
      document_number: text(body.documentNumber, 50),
      first_name: text(body.firstName, 100),
      last_name: text(body.lastName, 100),
      birth_date: asDateOnly(body.birthDate),
      gender: text(body.gender, 2),
      email: text(body.email, 255),
      phone: text(body.phone, 50),
      municipality_code: text(body.municipalityCode ?? body.codMunicipioResidencia, 10),
      regime: text(body.regime, 40),
      updated_at: asTimestamp(raw.updatedAt ?? body.updatedAt),
      deleted_at: asTimestamp(raw.deletedAt ?? body.deletedAt),
    })
  }

  for (const raw of Array.isArray(body.clinicalRecords) ? body.clinicalRecords : []) {
    const record = payloadOf(raw)
    if (!record) continue
    const clinicalRecordSyncId = syncIdOf(raw)
    const patientSyncId =
      text(record.patientSyncId ?? record.patientId ?? raw.patientSyncId ?? raw.patientId, 120) ||
      'sin-paciente'
    if (!clinic || !clinicalRecordSyncId) continue

    const recordDiagnoses = Array.isArray(record.diagnoses) ? record.diagnoses : []
    const notes = Array.isArray(record.evolutionNotes) ? record.evolutionNotes : []

    // Diagnósticos a nivel de historia: se anclan al syncId del registro si no hay notas.
    if (notes.length === 0 && recordDiagnoses.length > 0) {
      const encounterId = clinicalRecordSyncId
      evolutions.push({
        clinic_id: clinic,
        patient_sync_id: patientSyncId,
        encounter_id: encounterId,
        clinical_record_sync_id: clinicalRecordSyncId,
        fecha: asTimestamp(record.signedAt ?? record.updatedAt ?? record.createdAt),
        profesional_id: text(record.professionalId, 120),
        profesional_nombre: null,
        estado_firma: record.isSigned || record.signedAt || record.isLocked ? 'firmada' : 'borrador',
        firmado_en: asTimestamp(record.signedAt),
        costo: null,
        is_billable: null,
        cups_principal: null,
        updated_at: asTimestamp(raw.updatedAt ?? record.updatedAt),
        deleted_at: asTimestamp(raw.deletedAt ?? record.deletedAt),
      })
      for (const dx of recordDiagnoses) {
        const cie10 = normalizeCie10(dx?.code ?? dx?.codigo)
        if (!cie10) continue
        const tipo = String(dx?.type ?? dx?.tipo ?? 'principal').toLowerCase() === 'relacionado'
          ? 'relacionado'
          : 'principal'
        diagnoses.push({
          clinic_id: clinic,
          patient_sync_id: patientSyncId,
          encounter_id: encounterId,
          cie10_code: cie10,
          tipo,
          description: text(dx?.description ?? dx?.descripcion, 500),
          source: 'record',
          clinical_record_sync_id: clinicalRecordSyncId,
        })
      }
    }

    for (const note of notes) {
      const encounterId = text(note?.id, 120)
      if (!encounterId) continue

      const cupsPrincipal =
        normalizeCups(note.cupsCode) ||
        (Array.isArray(note.catalogServices)
          ? note.catalogServices.map((s) => normalizeCups(s?.cupsCode)).find(Boolean)
          : null) ||
        null

      evolutions.push({
        clinic_id: clinic,
        patient_sync_id: patientSyncId,
        encounter_id: encounterId,
        clinical_record_sync_id: clinicalRecordSyncId,
        fecha: asTimestamp(note.date ?? note.signedAt ?? note.createdAt),
        profesional_id: text(note.authorUserId ?? record.professionalId, 120),
        profesional_nombre: text(note.professionalName, 200),
        estado_firma: estadoFirmaDeNota(note),
        firmado_en: asTimestamp(note.signedAt),
        costo: money(note.cost),
        is_billable: note.isBillable !== false,
        cups_principal: cupsPrincipal,
        updated_at: asTimestamp(note.updatedAt ?? raw.updatedAt ?? record.updatedAt),
        deleted_at: asTimestamp(raw.deletedAt ?? record.deletedAt),
      })

      const noteDiagnoses = Array.isArray(note.diagnoses) ? note.diagnoses : []
      const dxSource = noteDiagnoses.length > 0 ? noteDiagnoses : recordDiagnoses
      for (const dx of dxSource) {
        const cie10 = normalizeCie10(dx?.code ?? dx?.codigo ?? dx?.cie10Code)
        if (!cie10) continue
        const tipo = String(dx?.type ?? dx?.tipo ?? 'principal').toLowerCase() === 'relacionado'
          ? 'relacionado'
          : 'principal'
        diagnoses.push({
          clinic_id: clinic,
          patient_sync_id: patientSyncId,
          encounter_id: encounterId,
          cie10_code: cie10,
          tipo,
          description: text(dx?.description ?? dx?.descripcion ?? dx?.cie10Description, 500),
          source: noteDiagnoses.length > 0 ? 'evolution' : 'record',
          clinical_record_sync_id: clinicalRecordSyncId,
        })
      }

      const pushProcedure = (row) => {
        if (!row?.procedure_sync_id) return
        procedures.push({
          clinic_id: clinic,
          patient_sync_id: patientSyncId,
          encounter_id: encounterId,
          procedure_sync_id: row.procedure_sync_id,
          cups_code: row.cups_code,
          description: row.description,
          valor_financiero: row.valor_financiero,
          invoice_id: row.invoice_id,
          invoice_number: row.invoice_number,
          source: row.source,
          clinical_record_sync_id: clinicalRecordSyncId,
          is_billable: row.is_billable,
        })
      }

      if (Array.isArray(note.catalogServices) && note.catalogServices.length > 0) {
        for (const service of note.catalogServices) {
          const cups = normalizeCups(service?.cupsCode)
          const serviceId = text(service?.id ?? `${encounterId}:${cups || service?.procedure}`, 120)
          pushProcedure({
            procedure_sync_id: serviceId,
            cups_code: cups,
            description: text(service?.procedure ?? service?.serviceName, 500),
            valor_financiero: money(service?.cost ?? note.cost),
            invoice_id: null,
            invoice_number: null,
            source: 'evolution',
            is_billable: service?.isBillable !== false && note.isBillable !== false,
          })
          const serviceCie = normalizeCie10(service?.cie10Code)
          if (serviceCie) {
            diagnoses.push({
              clinic_id: clinic,
              patient_sync_id: patientSyncId,
              encounter_id: encounterId,
              cie10_code: serviceCie,
              tipo: 'principal',
              description: text(service?.cie10Description, 500),
              source: 'evolution_service',
              clinical_record_sync_id: clinicalRecordSyncId,
            })
          }
        }
      } else if (cupsPrincipal || text(note.procedure)) {
        pushProcedure({
          procedure_sync_id: text(`note:${encounterId}`, 120),
          cups_code: cupsPrincipal,
          description: text(note.procedure ?? note.serviceName, 500),
          valor_financiero: money(note.cost),
          invoice_id: null,
          invoice_number: null,
          source: 'evolution',
          is_billable: note.isBillable !== false,
        })
      }
    }

    // Presupuesto / plan: procedimientos financieros asociados al registro.
    for (const item of Array.isArray(record.budgetItems) ? record.budgetItems : []) {
      const itemId = text(item?.id, 120)
      if (!itemId) continue
      procedures.push({
        clinic_id: clinic,
        patient_sync_id: patientSyncId,
        encounter_id: clinicalRecordSyncId,
        procedure_sync_id: `budget:${itemId}`,
        cups_code: normalizeCups(item.cupsCode),
        description: text(item.procedure, 500),
        valor_financiero: money(
          item.total ?? (Number(item.unitPrice || 0) * Number(item.quantity || 1)),
        ),
        invoice_id: null,
        invoice_number: null,
        source: 'budget',
        clinical_record_sync_id: clinicalRecordSyncId,
        is_billable: true,
      })
    }

    for (const line of Array.isArray(record.paymentControlLines) ? record.paymentControlLines : []) {
      const lineId = text(line?.id, 120)
      if (!lineId) continue
      procedures.push({
        clinic_id: clinic,
        patient_sync_id: patientSyncId,
        encounter_id: clinicalRecordSyncId,
        procedure_sync_id: `payline:${lineId}`,
        cups_code: normalizeCups(line.cupsCode),
        description: text(line.procedure, 500),
        valor_financiero: money(Number(line.unitPrice || 0) * Number(line.quantity || 1)),
        invoice_id: null,
        invoice_number: null,
        source: 'payment_control',
        clinical_record_sync_id: clinicalRecordSyncId,
        is_billable: true,
      })
      const lineCie = normalizeCie10(line.diagnosisCode)
      if (lineCie) {
        diagnoses.push({
          clinic_id: clinic,
          patient_sync_id: patientSyncId,
          encounter_id: clinicalRecordSyncId,
          cie10_code: lineCie,
          tipo: 'principal',
          description: text(line.diagnosisDescription, 500),
          source: 'payment_control',
          clinical_record_sync_id: clinicalRecordSyncId,
        })
      }
    }

    // Facturas embebidas en control de pagos (no hay entidad invoices top-level en el sync).
    for (const payment of Array.isArray(record.paymentControl) ? record.paymentControl : []) {
      const paymentId = text(payment?.id, 120) || 'pago'
      for (const invoice of Array.isArray(payment?.invoices) ? payment.invoices : []) {
        const invoiceId = text(invoice?.id ?? invoice?.invoiceNumber, 120)
        if (!invoiceId) continue
        procedures.push({
          clinic_id: clinic,
          patient_sync_id: patientSyncId,
          encounter_id: clinicalRecordSyncId,
          procedure_sync_id: `invoice:${invoiceId}:${paymentId}`,
          cups_code: normalizeCups(payment.cupsCode),
          description: text(invoice.notes ?? payment.paymentReason ?? 'Factura', 500),
          valor_financiero: money(invoice.amount ?? payment.amount),
          invoice_id: invoiceId,
          invoice_number: text(invoice.invoiceNumber, 60),
          source: 'invoice',
          clinical_record_sync_id: clinicalRecordSyncId,
          is_billable: true,
        })
      }
      for (const alloc of Array.isArray(payment?.lineAllocations) ? payment.lineAllocations : []) {
        const allocId = text(alloc?.lineId ?? alloc?.id, 120)
        if (!allocId) continue
        procedures.push({
          clinic_id: clinic,
          patient_sync_id: patientSyncId,
          encounter_id: clinicalRecordSyncId,
          procedure_sync_id: `alloc:${paymentId}:${allocId}`,
          cups_code: normalizeCups(alloc.cupsCode ?? payment.cupsCode),
          description: text(alloc.description, 500),
          valor_financiero: money(alloc.amount),
          invoice_id: text(payment.documentKind === 'factura' ? paymentId : null, 120),
          invoice_number: null,
          source: 'invoice_allocation',
          clinical_record_sync_id: clinicalRecordSyncId,
          is_billable: true,
        })
      }
    }
  }

  // Facturas sueltas si el cliente las envía en el delta (extensión futura / outbox).
  for (const invoice of Array.isArray(body.invoices) ? body.invoices : []) {
    const invoiceId = text(invoice?.id ?? invoice?.invoiceNumber, 120)
    const patientSyncId = text(invoice?.patientSyncId ?? invoice?.patientId, 120) || 'sin-paciente'
    if (!clinic || !invoiceId) continue
    const encounterId = text(invoice?.clinicalRecordId ?? invoice?.encounterId ?? invoiceId, 120)
    const items = Array.isArray(invoice?.items) ? invoice.items : [{ ...invoice, id: invoiceId }]
    for (const item of items) {
      const itemId = text(item?.id ?? item?.lineNumber ?? invoiceId, 120)
      procedures.push({
        clinic_id: clinic,
        patient_sync_id: patientSyncId,
        encounter_id: encounterId,
        procedure_sync_id: `fev:${invoiceId}:${itemId}`,
        cups_code: normalizeCups(item.cupsCode),
        description: text(item.description ?? item.procedure ?? invoice.invoiceNumber, 500),
        valor_financiero: money(item.totalAmount ?? item.amount ?? invoice.netPayable ?? invoice.amount),
        invoice_id: invoiceId,
        invoice_number: text(invoice.invoiceNumber, 60),
        source: 'invoice',
        clinical_record_sync_id: text(invoice.clinicalRecordId, 120),
        is_billable: true,
      })
    }
  }

  return { patients, evolutions, diagnoses, procedures }
}

async function upsertPatients(client, rows) {
  for (const row of rows) {
    await client.query(
      `INSERT INTO idx_pacientes (
         clinic_id, patient_sync_id, document_type, document_number,
         first_name, last_name, birth_date, gender, email, phone,
         municipality_code, regime, updated_at, deleted_at, indexed_at
       ) VALUES (
         $1::text, $2::text, $3::text, $4::text,
         $5::text, $6::text, $7::date, $8::text, $9::text, $10::text,
         $11::text, $12::text, $13::timestamptz, $14::timestamptz, NOW()
       )
       ON CONFLICT (clinic_id, patient_sync_id) DO UPDATE SET
         document_type = COALESCE(EXCLUDED.document_type, idx_pacientes.document_type),
         document_number = COALESCE(EXCLUDED.document_number, idx_pacientes.document_number),
         first_name = COALESCE(EXCLUDED.first_name, idx_pacientes.first_name),
         last_name = COALESCE(EXCLUDED.last_name, idx_pacientes.last_name),
         birth_date = COALESCE(EXCLUDED.birth_date, idx_pacientes.birth_date),
         gender = COALESCE(EXCLUDED.gender, idx_pacientes.gender),
         email = COALESCE(EXCLUDED.email, idx_pacientes.email),
         phone = COALESCE(EXCLUDED.phone, idx_pacientes.phone),
         municipality_code = COALESCE(EXCLUDED.municipality_code, idx_pacientes.municipality_code),
         regime = COALESCE(EXCLUDED.regime, idx_pacientes.regime),
         updated_at = COALESCE(EXCLUDED.updated_at, idx_pacientes.updated_at),
         deleted_at = EXCLUDED.deleted_at,
         indexed_at = NOW()`,
      [
        row.clinic_id,
        row.patient_sync_id,
        row.document_type,
        row.document_number,
        row.first_name,
        row.last_name,
        row.birth_date,
        row.gender,
        row.email,
        row.phone,
        row.municipality_code,
        row.regime,
        row.updated_at,
        row.deleted_at,
      ],
    )
  }
}

async function upsertEvolutions(client, rows) {
  for (const row of rows) {
    await client.query(
      `INSERT INTO idx_evoluciones (
         clinic_id, patient_sync_id, encounter_id, clinical_record_sync_id,
         fecha, profesional_id, profesional_nombre, estado_firma, firmado_en,
         costo, is_billable, cups_principal, updated_at, deleted_at, indexed_at
       ) VALUES (
         $1::text, $2::text, $3::text, $4::text,
         $5::timestamptz, $6::text, $7::text, $8::text, $9::timestamptz,
         $10::numeric, $11::boolean, $12::text, $13::timestamptz, $14::timestamptz, NOW()
       )
       ON CONFLICT (clinic_id, patient_sync_id, encounter_id) DO UPDATE SET
         clinical_record_sync_id = COALESCE(EXCLUDED.clinical_record_sync_id, idx_evoluciones.clinical_record_sync_id),
         fecha = COALESCE(EXCLUDED.fecha, idx_evoluciones.fecha),
         profesional_id = COALESCE(EXCLUDED.profesional_id, idx_evoluciones.profesional_id),
         profesional_nombre = COALESCE(EXCLUDED.profesional_nombre, idx_evoluciones.profesional_nombre),
         estado_firma = EXCLUDED.estado_firma,
         firmado_en = COALESCE(EXCLUDED.firmado_en, idx_evoluciones.firmado_en),
         costo = COALESCE(EXCLUDED.costo, idx_evoluciones.costo),
         is_billable = COALESCE(EXCLUDED.is_billable, idx_evoluciones.is_billable),
         cups_principal = COALESCE(EXCLUDED.cups_principal, idx_evoluciones.cups_principal),
         updated_at = COALESCE(EXCLUDED.updated_at, idx_evoluciones.updated_at),
         deleted_at = EXCLUDED.deleted_at,
         indexed_at = NOW()`,
      [
        row.clinic_id,
        row.patient_sync_id,
        row.encounter_id,
        row.clinical_record_sync_id,
        row.fecha,
        row.profesional_id,
        row.profesional_nombre,
        row.estado_firma,
        row.firmado_en,
        row.costo,
        row.is_billable,
        row.cups_principal,
        row.updated_at,
        row.deleted_at,
      ],
    )
  }
}

async function upsertDiagnoses(client, rows) {
  for (const row of rows) {
    await client.query(
      `INSERT INTO idx_diagnosticos (
         clinic_id, patient_sync_id, encounter_id, cie10_code, tipo,
         description, source, clinical_record_sync_id, indexed_at
       ) VALUES (
         $1::text, $2::text, $3::text, $4::text, $5::text,
         $6::text, $7::text, $8::text, NOW()
       )
       ON CONFLICT (clinic_id, patient_sync_id, encounter_id, cie10_code, tipo) DO UPDATE SET
         description = COALESCE(EXCLUDED.description, idx_diagnosticos.description),
         source = EXCLUDED.source,
         clinical_record_sync_id = COALESCE(EXCLUDED.clinical_record_sync_id, idx_diagnosticos.clinical_record_sync_id),
         indexed_at = NOW()`,
      [
        row.clinic_id,
        row.patient_sync_id,
        row.encounter_id,
        row.cie10_code,
        row.tipo,
        row.description,
        row.source,
        row.clinical_record_sync_id,
      ],
    )
  }
}

async function upsertProcedures(client, rows) {
  for (const row of rows) {
    await client.query(
      `INSERT INTO idx_procedimientos (
         clinic_id, patient_sync_id, encounter_id, procedure_sync_id,
         cups_code, description, valor_financiero, invoice_id, invoice_number,
         source, clinical_record_sync_id, is_billable, indexed_at
       ) VALUES (
         $1::text, $2::text, $3::text, $4::text,
         $5::text, $6::text, $7::numeric, $8::text, $9::text,
         $10::text, $11::text, $12::boolean, NOW()
       )
       ON CONFLICT (clinic_id, patient_sync_id, encounter_id, procedure_sync_id) DO UPDATE SET
         cups_code = COALESCE(EXCLUDED.cups_code, idx_procedimientos.cups_code),
         description = COALESCE(EXCLUDED.description, idx_procedimientos.description),
         valor_financiero = EXCLUDED.valor_financiero,
         invoice_id = COALESCE(EXCLUDED.invoice_id, idx_procedimientos.invoice_id),
         invoice_number = COALESCE(EXCLUDED.invoice_number, idx_procedimientos.invoice_number),
         source = EXCLUDED.source,
         clinical_record_sync_id = COALESCE(EXCLUDED.clinical_record_sync_id, idx_procedimientos.clinical_record_sync_id),
         is_billable = COALESCE(EXCLUDED.is_billable, idx_procedimientos.is_billable),
         indexed_at = NOW()`,
      [
        row.clinic_id,
        row.patient_sync_id,
        row.encounter_id,
        row.procedure_sync_id,
        row.cups_code,
        row.description,
        row.valor_financiero,
        row.invoice_id,
        row.invoice_number,
        row.source,
        row.clinical_record_sync_id,
        row.is_billable,
      ],
    )
  }
}

/**
 * Indexa un delta de push. Aislado: el caller no debe await-ear en el hot path HTTP
 * salvo pruebas. Errores se tragan / loguean.
 * @param {{ clinicId: string, payload?: object }} event
 */
export async function indexSnapshotDelta(event) {
  const clinicId = String(event?.clinicId ?? '').trim()
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {}
  if (!clinicId) return { ok: false, reason: 'missing_clinic' }

  const rows = extractAnalyticsRows(clinicId, payload)
  const total =
    rows.patients.length +
    rows.evolutions.length +
    rows.diagnoses.length +
    rows.procedures.length
  if (total === 0) return { ok: true, indexed: 0 }

  await ensureClinicalAnalyticsSchema()
  await withPgClient(async (client) => {
    await upsertPatients(client, rows.patients)
    await upsertEvolutions(client, rows.evolutions)
    await upsertDiagnoses(client, rows.diagnoses)
    await upsertProcedures(client, rows.procedures)
  })

  return {
    ok: true,
    indexed: total,
    patients: rows.patients.length,
    evolutions: rows.evolutions.length,
    diagnoses: rows.diagnoses.length,
    procedures: rows.procedures.length,
  }
}

function onSnapshotPushed(event) {
  // setImmediate: el emit del sync retorna al instante; el indexado corre después.
  setImmediate(() => {
    indexSnapshotDelta(event)
      .then((result) => {
        if (result?.indexed > 0) {
          console.log(
            `[Indexer] clinic=${event?.clinicId} pacientes=${result.patients} evoluciones=${result.evolutions} dx=${result.diagnoses} proc=${result.procedures}`,
          )
        }
      })
      .catch((error) => {
        console.error(
          '[Indexer] Falló el indexado del snapshot (el sync del cliente no se afecta):',
          error instanceof Error ? error.message : error,
        )
      })
  })
}

/** Registra el listener una sola vez (idempotente). */
export function startClinicalDataIndexer() {
  if (listenerRegistered) return
  listenerRegistered = true
  clinicalSyncEvents.on(SNAPSHOT_PUSHED, onSnapshotPushed)
  console.log('[Indexer] Escuchando snapshot:pushed → tablas idx_*')
}

/** Solo para pruebas. */
export function stopClinicalDataIndexer() {
  clinicalSyncEvents.off(SNAPSHOT_PUSHED, onSnapshotPushed)
  listenerRegistered = false
}

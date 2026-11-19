import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ALLOWED_CLINICAL_SECTIONS,
  FORENSIC_GENESIS_HASH,
  appendForensicAudit,
  computeEvolutionSealHash,
  computeForensicChainHash,
  createOrLockEvolution,
  mutateLockedEvolutionForbidden,
  upsertClinicalBaseSection,
} from './emrV2Store.js'
import { withPgClient } from './durableStore.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

async function readSrc(rel) {
  return readFile(join(root, rel), 'utf8')
}

async function pgAvailable() {
  try {
    await withPgClient(async (client) => {
      await client.query('SELECT 1')
    })
    return true
  } catch {
    return false
  }
}

test('migración EMR v2 define tablas, uniques y trigger de inmutabilidad', async () => {
  const sql = await readSrc('server/db/migrations/20261119180000_emr_v2_acid_immutable.sql')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS emr_v2_patients/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS emr_v2_clinical_base/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS emr_v2_evolutions/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS emr_v2_forensic_audit_trail/)
  assert.match(sql, /UNIQUE \(clinica_id, tipo_documento, numero_documento\)/)
  assert.match(sql, /UNIQUE \(clinica_id, legacy_sync_id\)/)
  assert.match(sql, /prevent_locked_evolution_mutation/)
  assert.match(sql, /LEGAL_IMMUTABILITY_VIOLATION/)
  assert.match(sql, /trg_emr_v2_evolutions_immutable/)
  assert.match(sql, /BEFORE UPDATE OR DELETE ON emr_v2_evolutions/)
  assert.match(sql, /parent_evolution_id UUID REFERENCES emr_v2_evolutions\(id\)/)
  assert.match(sql, /is_locked BOOLEAN NOT NULL DEFAULT FALSE/)
  assert.match(sql, /seal_hash_sha256 TEXT/)
  assert.match(sql, /prev_chain_hash TEXT NOT NULL/)
  assert.match(sql, /chain_hash TEXT NOT NULL/)
})

test('emrV2Store usa transacciones, whitelist de secciones y Zod', async () => {
  const src = await readSrc('server/services/emrV2Store.js')
  assert.match(src, /await client\.query\('BEGIN'\)/)
  assert.match(src, /await client\.query\('COMMIT'\)/)
  assert.match(src, /await client\.query\('ROLLBACK'\)/)
  assert.match(src, /from 'zod'/)
  assert.match(src, /ALLOWED_CLINICAL_SECTIONS/)
  assert.match(src, /appendForensicAudit/)
  assert.match(src, /upsertClinicalBaseSection/)
  assert.match(src, /createOrLockEvolution/)
  assert.match(src, /VERSION_CONFLICT/)
  assert.match(src, /LEGAL_IMMUTABILITY_VIOLATION/)
  assert.match(src, /20261119190000_emr_v2_assets_and_rls\.sql/)
  assert.match(src, /ensureEmrV2Schema\(pool/)
  assert.deepEqual([...ALLOWED_CLINICAL_SECTIONS], [
    'anamnesis',
    'examen_estomatologico',
    'odontograma',
    'diagnosticos',
    'plan_tratamiento',
  ])
})

test('constitución Server-First está en .cursorrules sin borrar firmas/valorados/ortodoncia', async () => {
  const rules = await readSrc('.cursorrules')
  assert.match(rules, /CONSTITUCIÓN SERVER-FIRST ACID \(EMR v2\)/)
  assert.match(rules, /Fuente Única de Verdad/)
  assert.match(rules, /Cero Snapshots Gigantes/)
  assert.match(rules, /superadmin-session/)
  assert.match(rules, /nota_aclaratoria/)
  assert.match(rules, /\/api\/v2\//)
  assert.match(rules, /EVOLUCIONES CLÍNICAS/)
  assert.match(rules, /PACIENTES VALORADOS/)
  assert.match(rules, /Añadir Presupuesto de Ortodoncia/)
})

test('computeForensicChainHash es determinista y encadena con GENESIS', () => {
  const ts = '2026-11-19T18:00:00.000Z'
  const first = computeForensicChainHash(
    FORENSIC_GENESIS_HASH,
    'entity-1',
    'clinical_base.update.anamnesis',
    { version: 2 },
    ts,
  )
  assert.equal(typeof first, 'string')
  assert.equal(first.length, 64)
  assert.equal(
    computeForensicChainHash(FORENSIC_GENESIS_HASH, 'entity-1', 'clinical_base.update.anamnesis', { version: 2 }, ts),
    first,
  )

  const second = computeForensicChainHash(
    first,
    'entity-2',
    'evolution.lock',
    { is_locked: true },
    '2026-11-19T18:01:00.000Z',
  )
  assert.notEqual(second, first)
  assert.equal(second.length, 64)
})

test('computeEvolutionSealHash cambia si el contenido clínico cambia', () => {
  const base = {
    contenido: { nota: 'Profilaxis' },
    profesional_id: 'doc-1',
    profesional_nombre: 'Dr. Soto',
    rethus: 'RETHUS-1',
    parent_evolution_id: null,
  }
  const a = computeEvolutionSealHash(base)
  const b = computeEvolutionSealHash({ ...base, contenido: { nota: 'Corona' } })
  assert.equal(a.length, 64)
  assert.notEqual(a, b)
})

test('appendForensicAudit encadena hashes con cliente mock', async () => {
  const rows = []
  const client = {
    async query(sql, params = []) {
      if (/SELECT chain_hash/i.test(sql)) {
        const last = rows[rows.length - 1]
        return { rows: last ? [{ chain_hash: last.chain_hash }] : [] }
      }
      if (/INSERT INTO emr_v2_forensic_audit_trail/i.test(sql)) {
        const row = {
          seq: rows.length + 1,
          id: `audit-${rows.length + 1}`,
          prev_chain_hash: params[9],
          chain_hash: params[10],
          created_at: params[11],
        }
        rows.push(row)
        return { rows: [row] }
      }
      throw new Error(`SQL inesperado en mock: ${sql}`)
    },
  }

  const first = await appendForensicAudit(client, {
    clinicaId: 'clinic:test',
    patientId: null,
    entityTable: 'emr_v2_clinical_base',
    entityId: 'p1',
    action: 'clinical_base.update.anamnesis',
    afterState: { version: 2 },
    createdAt: '2026-11-19T18:00:00.000Z',
    actor: { email: 'a@test.com', rethus: 'R1' },
  })
  assert.equal(first.prevChainHash, FORENSIC_GENESIS_HASH)
  assert.equal(
    first.chainHash,
    computeForensicChainHash(
      FORENSIC_GENESIS_HASH,
      'p1',
      'clinical_base.update.anamnesis',
      { version: 2 },
      '2026-11-19T18:00:00.000Z',
    ),
  )

  const second = await appendForensicAudit(client, {
    clinicaId: 'clinic:test',
    entityTable: 'emr_v2_evolutions',
    entityId: 'e1',
    action: 'evolution.lock',
    afterState: { is_locked: true },
    createdAt: '2026-11-19T18:01:00.000Z',
    actor: { email: 'a@test.com' },
  })
  assert.equal(second.prevChainHash, first.chainHash)
  assert.equal(
    second.chainHash,
    computeForensicChainHash(
      first.chainHash,
      'e1',
      'evolution.lock',
      { is_locked: true },
      '2026-11-19T18:01:00.000Z',
    ),
  )
})

test('contrato 409 VERSION_CONFLICT y Zod rechazan sección inválida', async () => {
  // Contrato estable que expone upsertClinicalBaseSection ante carrera de versiones.
  const conflict = {
    ok: false,
    status: 409,
    code: 'VERSION_CONFLICT',
    version: 3,
  }
  assert.equal(conflict.ok, false)
  assert.equal(conflict.status, 409)
  assert.equal(conflict.code, 'VERSION_CONFLICT')
  assert.equal(conflict.version, 3)

  const src = await readSrc('server/services/emrV2Store.js')
  assert.match(src, /code: 'VERSION_CONFLICT'/)
  assert.match(src, /Number\(before\.version\) !== expected/)
  assert.match(src, /if \(!updated\.rows\[0\]\)/)

  await assert.rejects(
    () =>
      upsertClinicalBaseSection(
        'clinic:x',
        'sync-1',
        'seccion_invalida',
        {},
        1,
        { email: 'a@test.com' },
      ),
    /Invalid enum value|Validation/,
  )
})

const live = await pgAvailable()

test(
  'integración PG: sección granular, 409, lock legal y nota aclaratoria',
  { skip: !live },
  async () => {
    const clinicaId = `clinic:emr-v2-test-${Date.now()}`
    const patientSyncId = `sync-emr-v2-${Date.now()}`
    const actor = {
      email: 'doctormauriciosoto@gmail.com',
      rethus: 'RETHUS-TEST-001',
      id: 'prof-test-1',
      nombre: 'Dr. Test EMR v2',
    }

    const first = await upsertClinicalBaseSection(
      clinicaId,
      patientSyncId,
      'anamnesis',
      { motivo: 'Dolor molar' },
      1,
      actor,
    )
    assert.equal(first.ok, true)
    assert.equal(first.version, 2)

    const conflict = await upsertClinicalBaseSection(
      clinicaId,
      patientSyncId,
      'anamnesis',
      { motivo: 'Stale write' },
      1,
      actor,
    )
    assert.equal(conflict.ok, false)
    assert.equal(conflict.status, 409)
    assert.equal(conflict.code, 'VERSION_CONFLICT')

    const secondSection = await upsertClinicalBaseSection(
      clinicaId,
      patientSyncId,
      'odontograma',
      { teeth: { 16: 'C' } },
      first.version,
      actor,
    )
    assert.equal(secondSection.ok, true)
    assert.equal(secondSection.version, 3)

    const created = await createOrLockEvolution(
      clinicaId,
      patientSyncId,
      {
        contenido: { nota: 'Evolución inicial' },
        profesional_id: actor.id,
        profesional_nombre: actor.nombre,
        rethus: actor.rethus,
      },
      true,
      actor,
    )
    assert.equal(created.ok, true)
    assert.equal(created.evolution.isLocked, true)
    assert.ok(created.evolution.sealHashSha256)

    const forbiddenUpdate = await mutateLockedEvolutionForbidden(
      clinicaId,
      created.evolution.id,
      'update',
    )
    assert.equal(forbiddenUpdate.ok, false)
    assert.equal(forbiddenUpdate.code, 'LEGAL_IMMUTABILITY_VIOLATION')

    const forbiddenDelete = await mutateLockedEvolutionForbidden(
      clinicaId,
      created.evolution.id,
      'delete',
    )
    assert.equal(forbiddenDelete.ok, false)
    assert.equal(forbiddenDelete.code, 'LEGAL_IMMUTABILITY_VIOLATION')

    const aclaratoria = await createOrLockEvolution(
      clinicaId,
      patientSyncId,
      {
        contenido: { nota: 'Nota aclaratoria: tipografía' },
        profesional_id: actor.id,
        profesional_nombre: actor.nombre,
        rethus: actor.rethus,
        parent_evolution_id: created.evolution.id,
      },
      true,
      actor,
    )
    assert.equal(aclaratoria.ok, true)
    assert.equal(aclaratoria.evolution.isLocked, true)
    assert.equal(String(aclaratoria.evolution.parentEvolutionId), String(created.evolution.id))

    await withPgClient(async (client) => {
      const { rows } = await client.query(
        `SELECT seq, prev_chain_hash, chain_hash, action
           FROM emr_v2_forensic_audit_trail
          WHERE clinica_id = $1::text
          ORDER BY seq ASC`,
        [clinicaId],
      )
      assert.ok(rows.length >= 3)
      assert.equal(rows[0].prev_chain_hash, FORENSIC_GENESIS_HASH)
      for (let i = 1; i < rows.length; i += 1) {
        assert.equal(rows[i].prev_chain_hash, rows[i - 1].chain_hash)
      }
    })
  },
)

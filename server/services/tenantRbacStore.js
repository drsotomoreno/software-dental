/**
 * Persistencia relacional multi-tenant: clinicas + usuarios (is_superadmin).
 * Complementa subscription-users.json / app_json_store; no lo reemplaza aún.
 */
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { withPgClient } from './durableStore.js'
import { splitSqlStatements } from './consultasRepository.js'

const MIGRATION_FILES = [
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../db/migrations/20261102143000_clinicas_usuarios_rbac.sql',
  ),
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../db/migrations/20261108190000_usuarios_whatsapp.sql',
  ),
]

export const MASTER_EMAIL = 'doctormauriciosoto@gmail.com'

const ROLE_MAP = {
  superadmin: 'superadmin',
  admin: 'admin_clinica',
  odontologo: 'odontologo',
  recepcion: 'asistente',
  asistente: 'asistente',
  admin_clinica: 'admin_clinica',
}

let schemaReady = null

function normalizeEmail(email) {
  return String(email ?? '')
    .trim()
    .toLowerCase()
}

function hashPasswordSha256(password) {
  return createHash('sha256').update(String(password)).digest('hex')
}

function mapRol(rol) {
  const key = String(rol ?? 'odontologo')
    .trim()
    .toLowerCase()
  return ROLE_MAP[key] || 'odontologo'
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? ''),
  )
}

function repsOrNull(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits || null
}

export async function ensureTenantRbacSchema() {
  if (!schemaReady) {
    schemaReady = withPgClient(async (client) => {
      for (const migrationFile of MIGRATION_FILES) {
        const sql = await readFile(migrationFile, 'utf8')
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

/**
 * Upsert de la cuenta maestra: is_superadmin=TRUE, clinica_id NULL.
 * Usa el hash SHA-256 del sistema (mismo que subscriptionAuthStore).
 */
export async function ensureMasterUsuarioRow() {
  try {
    await ensureTenantRbacSchema()
    const email = normalizeEmail(config.superAdmin?.email || MASTER_EMAIL)
    const passwordHash = hashPasswordSha256(config.superAdmin?.password || '')
    const nombre =
      String(config.superAdmin?.nombre || 'Dr. Elias Mauricio Soto Moreno').trim() ||
      'Dr. Elias Mauricio Soto Moreno'

    await withPgClient(async (client) => {
      await client.query(
        `INSERT INTO usuarios (
           id, clinica_id, email, password_hash, nombre_completo,
           registro_rethus, is_superadmin, rol, estado
         ) VALUES (
           $1::uuid, NULL, $2, $3, $4, NULL, TRUE, 'superadmin', 'activo'
         )
         ON CONFLICT (email) DO UPDATE SET
           is_superadmin = TRUE,
           rol = 'superadmin',
           clinica_id = NULL,
           nombre_completo = EXCLUDED.nombre_completo,
           password_hash = CASE
             WHEN usuarios.password_hash IS NULL OR btrim(usuarios.password_hash) = ''
               THEN EXCLUDED.password_hash
             ELSE usuarios.password_hash
           END,
           estado = 'activo'`,
        [randomUUID(), email, passwordHash, nombre],
      )
    })
    return { ok: true }
  } catch (error) {
    if (error?.code !== 'PG_UNAVAILABLE') {
      console.error(
        '[tenant-rbac] No se pudo asegurar la cuenta maestra en Postgres:',
        error instanceof Error ? error.message : error,
      )
    }
    return { ok: false, error }
  }
}

/**
 * Sincroniza un usuario del almacén de suscripciones hacia `clinicas` / `usuarios`.
 * El Superadmin nunca queda atado a un tenant.
 */
export async function syncAuthUserToTenantTables(user) {
  if (!user?.email || !user?.passwordHash) return { ok: false, skipped: true }
  const email = normalizeEmail(user.email)
  const isSuper = email === MASTER_EMAIL || email === normalizeEmail(config.superAdmin?.email)

  try {
    await ensureTenantRbacSchema()
    return await withPgClient(async (client) => {
      let clinicaId = null

      if (!isSuper) {
        const ownerId = String(user.clinicId || user.id || '')
        const clinicUuid = isUuid(ownerId) ? ownerId : null
        const clinicName =
          String(user.clinicName || user.legalName || user.nombre || 'Clínica').trim() || 'Clínica'
        const reps = repsOrNull(user.repsCode)

        if (clinicUuid) {
          await client.query(
            `INSERT INTO clinicas (id, nombre, codigo_reps)
             VALUES ($1::uuid, $2, $3)
             ON CONFLICT (id) DO UPDATE SET
               nombre = COALESCE(NULLIF(EXCLUDED.nombre, ''), clinicas.nombre),
               codigo_reps = COALESCE(EXCLUDED.codigo_reps, clinicas.codigo_reps)`,
            [clinicUuid, clinicName, reps],
          )
          clinicaId = clinicUuid
        } else if (reps) {
          const existing = await client.query(
            `SELECT id FROM clinicas WHERE codigo_reps = $1 LIMIT 1`,
            [reps],
          )
          if (existing.rows[0]?.id) {
            clinicaId = existing.rows[0].id
          } else {
            const inserted = await client.query(
              `INSERT INTO clinicas (nombre, codigo_reps)
               VALUES ($1, $2)
               RETURNING id`,
              [clinicName, reps],
            )
            clinicaId = inserted.rows[0].id
          }
        }
      }

      const userId = isUuid(user.id) ? user.id : randomUUID()
      const nombre =
        String(user.nombre || [user.firstName, user.lastName].filter(Boolean).join(' '))
          .trim() || email
      const rol = isSuper ? 'superadmin' : mapRol(user.rol)
      const estado =
        user.accessEnabled === false || user.estado_pago === 'pendiente' ? 'inactivo' : 'activo'
      const rethus = String(user.rethusNumber ?? '').trim() || null

      const phoneNumber =
        String(user.phone_number || user.phone || '')
          .replace(/\D/g, '')
          .trim() || null
      const whatsappStatus = String(user.whatsapp_status || 'pending').trim() || 'pending'
      const whatsappVerified = user.whatsapp_verified === true

      await client.query(
        `INSERT INTO usuarios (
           id, clinica_id, email, password_hash, nombre_completo,
           registro_rethus, is_superadmin, rol, estado,
           phone_number, whatsapp_verified, whatsapp_status
         ) VALUES (
           $1::uuid, $2::uuid, $3::text, $4::text, $5::text,
           $6::text, $7::boolean, $8::text, $9::text,
           $10::text, $11::boolean, $12::text
         )
         ON CONFLICT (email) DO UPDATE SET
           clinica_id = EXCLUDED.clinica_id,
           password_hash = EXCLUDED.password_hash,
           nombre_completo = EXCLUDED.nombre_completo,
           registro_rethus = EXCLUDED.registro_rethus,
           is_superadmin = EXCLUDED.is_superadmin,
           rol = EXCLUDED.rol,
           estado = EXCLUDED.estado,
           phone_number = COALESCE(EXCLUDED.phone_number, usuarios.phone_number),
           whatsapp_verified = EXCLUDED.whatsapp_verified,
           whatsapp_status = EXCLUDED.whatsapp_status`,
        [
          userId,
          isSuper ? null : clinicaId,
          email,
          user.passwordHash,
          nombre,
          rethus,
          isSuper,
          rol,
          estado,
          phoneNumber,
          whatsappVerified,
          whatsappStatus,
        ],
      )

      return { ok: true, clinicaId: isSuper ? null : clinicaId }
    })
  } catch (error) {
    if (error?.code !== 'PG_UNAVAILABLE') {
      console.error(
        '[tenant-rbac] Sync usuario falló:',
        email,
        error instanceof Error ? error.message : error,
      )
    }
    return { ok: false, error }
  }
}

/** Sincroniza todos los usuarios del store de suscripciones hacia Postgres. */
export async function syncAllAuthUsersToTenantTables(users) {
  const list = Array.isArray(users) ? users : []
  let ok = 0
  let failed = 0
  await ensureMasterUsuarioRow()
  for (const user of list) {
    const result = await syncAuthUserToTenantTables(user)
    if (result.ok) ok += 1
    else if (!result.skipped) failed += 1
  }
  return { ok, failed, total: list.length }
}

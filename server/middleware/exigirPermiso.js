/**
 * Permiso por rol de colaborador.
 * El bypass de God Mode es el mismo de aislarClinica: req.user.is_superadmin
 * (lo firma el JWT de la cuenta maestra). No basta con rol === 'superadmin'.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isSuperAdminUser } from '../services/subscriptionAuthStore.js'
import { withPgClientInteractive } from '../services/durableStore.js'
import { splitSqlStatements } from '../services/consultasRepository.js'

const MIGRATION_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/add_colaboradores_roles.sql',
)

let schemaReady = null

function deny(res, status, error) {
  return res.status(status).json({ success: false, ok: false, error })
}

export function esSuperAdminSesion(user) {
  if (!user) return false
  if (user.is_superadmin === true) return true
  return isSuperAdminUser(user)
}

/**
 * Titular efectivo: rol TITULAR, o el dueño de la clínica que ya existía
 * (su JWT trae clinica_id igual a su id y rol admin/odontologo).
 * Un colaborador y la cuenta maestra no califican.
 */
export function esTitularDeClinica(user) {
  if (!user || esSuperAdminSesion(user)) return false
  const rol = String(user.rol || '')
  if (rol === 'COLABORADOR_CLINICO' || rol === 'COLABORADOR_ADMIN') return false
  if (user.titular_id) return false
  if (rol === 'TITULAR') return true
  if (user.isClinicOwner === true) return true
  const id = String(user.id || '')
  const clinica = String(user.clinica_id || user.clinicId || '')
  return Boolean(id) && clinica === id
}

/**
 * Decisión pura. El middleware la aplica después de refrescar activo/rol/rethus.
 * @returns {{ ok: true, bypass?: boolean } | { ok: false, status: number, error: string }}
 */
export function evaluarPermiso(user, rolesPermitidos) {
  const permitidos = Array.isArray(rolesPermitidos) ? rolesPermitidos.map((rol) => String(rol)) : []
  if (!user) {
    return { ok: false, status: 401, error: 'Token inválido o expirado.' }
  }
  if (esSuperAdminSesion(user)) return { ok: true, bypass: true }
  if (user.activo !== true) {
    return { ok: false, status: 403, error: 'La cuenta está suspendida.' }
  }
  const rol = String(user.rol || '')
  const cubreTitular = permitidos.includes('TITULAR') && esTitularDeClinica(user)
  if (!permitidos.includes(rol) && !cubreTitular) {
    return { ok: false, status: 403, error: 'No tienes permiso para esta acción.' }
  }
  if (rol === 'COLABORADOR_CLINICO' && !String(user.rethus || '').trim()) {
    return {
      ok: false,
      status: 403,
      error: 'El colaborador clínico debe tener ReTHUS.',
    }
  }
  return { ok: true }
}

/** Aplica la migración de colaboradores. Idempotente; no toca rutas clínicas. */
export async function asegurarEsquemaColaboradores() {
  if (!schemaReady) {
    schemaReady = withPgClientInteractive(async (client) => {
      const sql = await readFile(MIGRATION_FILE, 'utf8')
      for (const statement of splitSqlStatements(sql)) {
        await client.query(statement)
      }
    }).catch((error) => {
      schemaReady = null
      throw error
    })
  }
  return schemaReady
}

/**
 * Refresca activo, rol y rethus desde usuarios.
 * is_superadmin no se promueve desde la fila: solo vale el JWT ya verificado.
 */
export async function refrescarUsuarioColaborador(req) {
  const id = String(req.user?.id || req.user?.userId || '').trim()
  const email = String(req.user?.email || '').trim()
  if (!id && !email) return null
  await asegurarEsquemaColaboradores()
  const row = await withPgClientInteractive(async (client) => {
    const porId = id
      ? await client.query(
          `SELECT id::text AS id,
                  email,
                  nombre_completo,
                  rol,
                  rethus,
                  activo,
                  titular_id::text AS titular_id,
                  clinica_id::text AS clinica_id,
                  codigo_sede_reps
             FROM usuarios
            WHERE id::text = $1::text
            LIMIT 1`,
          [id],
        )
      : { rows: [] }
    if (porId.rows[0]) return porId.rows[0]
    if (!email) return null
    const porCorreo = await client.query(
      `SELECT id::text AS id,
              email,
              nombre_completo,
              rol,
              rethus,
              activo,
              titular_id::text AS titular_id,
              clinica_id::text AS clinica_id,
              codigo_sede_reps
         FROM usuarios
        WHERE lower(email) = lower($1::text)
        LIMIT 1`,
      [email],
    )
    return porCorreo.rows[0] || null
  })
  if (!row) return null
  const jwtId = String(req.user?.id || req.user?.userId || '')
  const jwtClinica = String(req.user?.clinica_id || req.user?.clinicId || '')
  req.user = {
    ...req.user,
    id: row.id,
    email: row.email || req.user.email,
    nombre: row.nombre_completo || req.user.nombre || null,
    rol: String(row.rol || req.user.rol || ''),
    rethus: row.rethus == null ? null : String(row.rethus),
    activo: row.activo === true,
    titular_id: row.titular_id,
    clinica_id: req.user.clinica_id ?? row.clinica_id,
    codigo_sede_reps: row.codigo_sede_reps,
    isClinicOwner:
      req.user.isClinicOwner === true || (Boolean(jwtId) && jwtClinica === jwtId),
  }
  return row
}

/**
 * @param {string[]} rolesPermitidos
 */
export function exigirPermiso(rolesPermitidos) {
  return async function exigirPermisoMiddleware(req, res, next) {
    try {
      if (!req.user) return deny(res, 401, 'Token inválido o expirado.')
      if (!esSuperAdminSesion(req.user)) {
        let fila = null
        try {
          fila = await refrescarUsuarioColaborador(req)
        } catch (error) {
          if (error?.code === 'PG_UNAVAILABLE' || error?.code === 'PG_COOLDOWN') {
            return deny(res, 503, 'PostgreSQL no está disponible para verificar el permiso.')
          }
          throw error
        }
        if (!fila) return deny(res, 403, 'La cuenta no está registrada en usuarios.')
      }
      const decision = evaluarPermiso(req.user, rolesPermitidos)
      if (!decision.ok) return deny(res, decision.status, decision.error)
      return next()
    } catch (error) {
      return next(error)
    }
  }
}

export default exigirPermiso

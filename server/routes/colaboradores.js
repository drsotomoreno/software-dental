/**
 * Colaboradores del titular. No altera rutas de RIPS, pacientes ni historias.
 * Cupos: el titular cuenta como 1 profesional. El administrativo no cuenta ahí.
 */
import { createHmac, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from 'express'
import { config } from '../config.js'
import { resolveClinicSyncId } from '../../shared/clinicalSyncScope.js'
import { withPgClientInteractive } from '../services/durableStore.js'
import {
  listAllSubscriptionUsers,
  MASTER_EMAIL,
} from '../services/subscriptionAuthStore.js'
import { verificarToken } from '../middleware/tenantAuth.middleware.js'
import {
  asegurarEsquemaColaboradores,
  esSuperAdminSesion,
  esTitularDeClinica,
  exigirPermiso,
  perfilSuscripcionDeSesion,
} from '../middleware/exigirPermiso.js'
import { ensureMasterUsuarioRow } from '../services/tenantRbacStore.js'
import { splitSqlStatements } from '../services/consultasRepository.js'

const require = createRequire(import.meta.url)
const bcrypt = require('bcryptjs')

const ROLES_INVITABLES = new Set(['COLABORADOR_CLINICO', 'COLABORADOR_ADMIN'])
const INVITE_MS = 7 * 24 * 60 * 60 * 1000
const SESSION_TTL_SEC = 60 * 60 * 24 * 30
const BCRYPT_ROUNDS = 10

/** Profesionales incluyen al titular. Administrativos son un cupo aparte. */
export const CUPOS_PLAN = {
  NOMAD: { profesionales: 1, administrativos: 1 },
  SMART: { profesionales: 4, administrativos: 2 },
  BIONIC: { profesionales: 6, administrativos: 3 },
  CORPORATIVO: { profesionales: 99, administrativos: 99 },
}

const router = Router()

function fail(res, status, error) {
  return res.status(status).json({ success: false, ok: false, error })
}

function finish(res, next, error) {
  if (error?.code === '22P02') return fail(res, 400, 'El identificador no es válido.')
  return next(error)
}

function normalizeEmail(email) {
  return String(email ?? '')
    .trim()
    .toLowerCase()
}

function planCanonico(plan) {
  const key = String(plan ?? '')
    .trim()
    .toLowerCase()
  if (key === 'nomad') return 'NOMAD'
  if (key === 'smart') return 'SMART'
  if (key === 'bionic') return 'BIONIC'
  if (key === 'corporativo') return 'CORPORATIVO'
  return null
}

function expiresAt(from = new Date()) {
  return new Date(from.getTime() + INVITE_MS)
}

function esUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ''),
  )
}

/** REPS y ReTHUS del perfil (la ficha de arriba). El de la sede cabe en VARCHAR(20). */
export function datosDePerfil(perfil) {
  const reps = String(perfil?.repsCode || '').trim()
  const rethus = String(perfil?.rethusNumber || '').trim()
  return {
    codigo_sede_reps: reps || null,
    rethus: rethus || null,
    codigo_sede_reps_db: reps && reps.length <= 20 ? reps : null,
    rethus_db: rethus && rethus.length <= 50 ? rethus : null,
  }
}

/**
 * clinicSyncId del titular (correo o id de su clínica). Nunca el id del colaborador.
 */
export function identidadClinicaTitular(titular) {
  const email = normalizeEmail(titular?.email)
  const clinicaId = String(titular?.clinica_id || '').trim()
  const id = String(titular?.id || '').trim()
  const clave = clinicaId || email || id
  const clinicSyncId = resolveClinicSyncId({
    id,
    email,
    clinicId: clave,
  })
  const clinicId = clinicSyncId.startsWith('clinic:')
    ? clinicSyncId.slice('clinic:'.length)
    : clinicSyncId
  return { clinicId, clinicSyncId, clinicaId: clinicaId || null, email }
}

export function signColaboradorToken(claims) {
  const secret = String(config.jwtSecret || '').trim()
  if (!secret) {
    const error = new Error('JWT_SECRET no está configurado.')
    error.status = 500
    throw error
  }
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    id: String(claims.id),
    userId: String(claims.userId || claims.id),
    clinica_id: claims.clinica_id || null,
    clinicId: claims.clinicId || null,
    clinicSyncId: claims.clinicSyncId || null,
    is_superadmin: false,
    rol: String(claims.rol),
    nombre: claims.nombre || null,
    rethus: claims.rethus || null,
    activo: claims.activo === true,
    email: claims.email || null,
    iat: now,
    exp: now + SESSION_TTL_SEC,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const data = `${header}.${body}`
  const sig = createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

const TELEFONO_MIGRATION = join(
  dirname(fileURLToPath(import.meta.url)),
  '../db/migrations/add_colaboradores_telefono_verificacion.sql',
)
const CORREO_ESTRICTO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const ENLACE_ACTIVACION = 'https://mihistoriadental.com/activar?token='

let telefonoEsquemaListo = null

const USUARIO_COLUMNS = `id::text AS id,
       email,
       nombre_completo,
       rol,
       rethus,
       activo,
       titular_id::text AS titular_id,
       clinica_id::text AS clinica_id,
       codigo_sede_reps,
       telefono,
       email_verificado,
       invite_token,
       invite_expires_at`

async function queryUsuario(client, id) {
  const { rows } = await client.query(
    `SELECT ${USUARIO_COLUMNS}
       FROM usuarios
      WHERE id::text = $1::text
      LIMIT 1`,
    [id],
  )
  return rows[0] || null
}

async function queryUsuarioPorEmail(client, email) {
  const normalizado = normalizeEmail(email)
  if (!normalizado) return null
  const { rows } = await client.query(
    `SELECT ${USUARIO_COLUMNS}
       FROM usuarios
      WHERE lower(email) = lower($1::text)
      LIMIT 1`,
    [normalizado],
  )
  return rows[0] || null
}

async function filaDelPerfil(client, perfil, req) {
  const porCorreo = await queryUsuarioPorEmail(client, perfil?.email || req.user?.email)
  if (porCorreo) return porCorreo
  const id = String(perfil?.id || req.user?.id || '').trim()
  if (!id) return null
  return queryUsuario(client, id)
}

function esDuenoDelPerfil(perfil) {
  if (!perfil?.id) return false
  if (normalizeEmail(perfil.email) === MASTER_EMAIL) return true
  if (perfil.isClinicOwner === true) return true
  return String(perfil.clinicId || '') === String(perfil.id)
}

async function crearFilaTitular(client, perfil) {
  const email = normalizeEmail(perfil?.email)
  if (!email || !esDuenoDelPerfil(perfil)) return null
  const datos = datosDePerfil(perfil)
  const id = esUuid(perfil.id) ? perfil.id : randomUUID()
  const nombre = String(perfil.nombre || email).trim().slice(0, 255) || email
  const passwordHash = bcrypt.hashSync(randomUUID(), BCRYPT_ROUNDS)
  try {
    await client.query(
      `INSERT INTO usuarios (
         id, clinica_id, email, password_hash, nombre_completo,
         registro_rethus, is_superadmin, rol, estado,
         codigo_sede_reps, rethus, activo
       ) VALUES (
         $1::uuid, NULL, $2::text, $3::text, $4::text,
         $5::text, FALSE, 'admin', 'activo',
         $6::text, $5::text, TRUE
       )
       ON CONFLICT (email) DO NOTHING`,
      [id, email, passwordHash, nombre, datos.rethus_db, datos.codigo_sede_reps_db],
    )
  } catch (error) {
    if (error?.code !== '23505') throw error
  }
  return queryUsuarioPorEmail(client, email)
}

async function aplicarPerfilAlTitular(client, fila, perfil) {
  if (!fila) return fila
  const datos = datosDePerfil(perfil)
  const sedeDb = datos.codigo_sede_reps_db
  const rethusDb = datos.rethus_db
  let actual = fila
  if (sedeDb || rethusDb) {
    const { rows } = await client.query(
      `UPDATE usuarios
          SET codigo_sede_reps = CASE
                WHEN $2::text IS NOT NULL THEN $2::text
                ELSE codigo_sede_reps
              END,
              rethus = CASE
                WHEN $3::text IS NOT NULL THEN $3::text
                ELSE rethus
              END,
              registro_rethus = CASE
                WHEN $3::text IS NOT NULL THEN $3::text
                ELSE registro_rethus
              END
        WHERE id = $1::uuid
        RETURNING ${USUARIO_COLUMNS}`,
      [fila.id, sedeDb, rethusDb],
    )
    actual = rows[0] || fila
  }
  return {
    ...actual,
    codigo_sede_reps: datos.codigo_sede_reps || actual.codigo_sede_reps || null,
    rethus: datos.rethus || actual.rethus || null,
  }
}

async function titularConPerfil(client, fila) {
  if (!fila) return fila
  const perfil = await perfilSuscripcionDeSesion({ id: fila.id, email: fila.email })
  return aplicarPerfilAlTitular(client, fila, perfil)
}

async function queryUsuarioDeSesion(client, req) {
  const perfil = await perfilSuscripcionDeSesion(req.user)
  if (perfil?.email && !req.user?.email) req.user = { ...req.user, email: perfil.email }
  return filaDelPerfil(client, perfil, req)
}

function publico(row, { conInvitacion = false } = {}) {
  if (!row) return null
  const base = {
    id: row.id,
    userId: row.id,
    nombre: row.nombre_completo,
    email: row.email,
    rol: row.rol,
    rethus: row.rethus ?? null,
    activo: row.activo === true,
    titular_id: row.titular_id ?? null,
    clinica_id: row.clinica_id ?? null,
    codigo_sede_reps: row.codigo_sede_reps ?? null,
    telefono: row.telefono ?? null,
    email_verificado: row.email_verificado === true,
  }
  if (!conInvitacion) return base
  return {
    ...base,
    invite_token: row.invite_token ?? null,
    invite_expires_at: row.invite_expires_at ?? null,
  }
}

/** Plan de cupos. La cuenta maestra prueba con el tope corporativo. */
export function planEfectivo(titular, planAlmacenado) {
  const plan = planCanonico(planAlmacenado)
  if (plan) return plan
  if (normalizeEmail(titular?.email) === MASTER_EMAIL) return 'CORPORATIVO'
  return null
}

async function planDelTitular(titular) {
  const users = await listAllSubscriptionUsers()
  const email = normalizeEmail(titular.email)
  const match = users.find(
    (user) => normalizeEmail(user.email) === email || String(user.id) === String(titular.id),
  )
  return planEfectivo(titular, match?.plan)
}

async function contarActivos(client, titularId) {
  const { rows } = await client.query(
    `SELECT
        COUNT(*) FILTER (WHERE rol = 'COLABORADOR_CLINICO' AND activo IS TRUE)::int AS clinicos,
        COUNT(*) FILTER (WHERE rol = 'COLABORADOR_ADMIN' AND activo IS TRUE)::int AS admins
       FROM usuarios
      WHERE titular_id = $1::uuid`,
    [titularId],
  )
  return {
    clinicos: Number(rows[0]?.clinicos || 0),
    admins: Number(rows[0]?.admins || 0),
  }
}

export function cupoDisponible(plan, conteo, rol, { incluirEste = true } = {}) {
  const tope = CUPOS_PLAN[plan]
  if (!tope) {
    return {
      ok: false,
      status: 403,
      error: 'El titular no tiene un plan NOMAD, SMART, BIONIC o CORPORATIVO.',
    }
  }
  if (rol === 'COLABORADOR_CLINICO') {
    const usados = 1 + conteo.clinicos + (incluirEste ? 1 : 0)
    if (usados > tope.profesionales) {
      return {
        ok: false,
        status: 409,
        error: `El plan ${plan} admite ${tope.profesionales} profesional(es), titular incluido. No hay cupo clínico.`,
      }
    }
  }
  if (rol === 'COLABORADOR_ADMIN') {
    const usados = conteo.admins + (incluirEste ? 1 : 0)
    if (usados > tope.administrativos) {
      return {
        ok: false,
        status: 409,
        error: `El plan ${plan} admite ${tope.administrativos} administrativo(s). No hay cupo.`,
      }
    }
  }
  return { ok: true, tope }
}

async function resolverTitular(client, req) {
  const perfil = await perfilSuscripcionDeSesion(req.user)
  if (perfil?.email && !req.user?.email) req.user = { ...req.user, email: perfil.email }

  if (esSuperAdminSesion(req.user)) {
    const requested = String(req.body?.titular_id || req.query?.titular_id || '').trim()
    if (requested) {
      const indicado = await queryUsuario(client, requested)
      if (!indicado || indicado.titular_id || !esTitularDeClinica(indicado)) {
        return { error: 'El titular indicado no existe.', status: 404 }
      }
      return { titular: await titularConPerfil(client, indicado) }
    }
    let fila = await filaDelPerfil(client, perfil, req)
    if (!fila && (esDuenoDelPerfil(perfil) || normalizeEmail(perfil?.email) === MASTER_EMAIL)) {
      await ensureMasterUsuarioRow()
      fila = await queryUsuarioPorEmail(client, perfil?.email || MASTER_EMAIL)
    }
    if (!fila || fila.titular_id) {
      return { error: 'El titular indicado no existe.', status: 404 }
    }
    return { titular: await aplicarPerfilAlTitular(client, fila, perfil) }
  }

  let fila = await queryUsuarioDeSesion(client, req)
  if (!fila && esDuenoDelPerfil(perfil)) {
    fila = await crearFilaTitular(client, perfil)
  }
  if (!fila) return { error: 'La cuenta no está en usuarios.', status: 403 }

  const vista = {
    ...fila,
    clinica_id: req.user?.clinica_id || fila.clinica_id,
    clinicId: req.user?.clinicId || perfil?.clinicId,
    isClinicOwner: req.user?.isClinicOwner === true || perfil?.isClinicOwner === true,
  }
  if (esTitularDeClinica(vista) || esDuenoDelPerfil(perfil)) {
    return { titular: await aplicarPerfilAlTitular(client, fila, perfil) }
  }

  if (fila.titular_id && ROLES_INVITABLES.has(fila.rol)) {
    const titular = await queryUsuario(client, fila.titular_id)
    if (!titular) return { error: 'No se encontró el titular de esta cuenta.', status: 404 }
    return { titular: await titularConPerfil(client, titular), actor: fila }
  }

  return { error: 'Solo el titular puede administrar colaboradores.', status: 403 }
}

async function asegurarTelefonoVerificacion() {
  if (!telefonoEsquemaListo) {
    telefonoEsquemaListo = withPgClientInteractive(async (client) => {
      const sql = await readFile(TELEFONO_MIGRATION, 'utf8')
      for (const statement of splitSqlStatements(sql)) {
        await client.query(statement)
      }
    }).catch((error) => {
      telefonoEsquemaListo = null
      throw error
    })
  }
  return telefonoEsquemaListo
}

function enlaceActivacionPublico(token) {
  return `${ENLACE_ACTIVACION}${encodeURIComponent(token)}`
}

async function enviarCorreoActivacion({ email, nombre, token }) {
  const apiKey = String(config.mail?.resendApiKey || process.env.RESEND_API_KEY || '').trim()
  if (!apiKey || !token) return { sent: false }
  const enlace = enlaceActivacionPublico(token)
  const saludo = nombre ? `Hola ${nombre}.` : 'Hola.'
  const from = config.mail?.resendFrom || 'Doctor SEO Labs <notificaciones@mihistoriadental.com>'
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Activa tu acceso a MiHistoriaDental',
        text: `${saludo} Activa tu acceso con este enlace: ${enlace}`,
        html: `<p>${saludo}</p><p>Activa tu acceso a MiHistoriaDental con este enlace:</p><p><a href="${enlace}">${enlace}</a></p>`,
      }),
    })
    if (!response.ok) {
      console.error('[colaboradores] Resend no envió la invitación', response.status)
      return { sent: false }
    }
    return { sent: true }
  } catch (error) {
    console.error(
      '[colaboradores] Resend falló; la invitación queda disponible por WhatsApp',
      error instanceof Error ? error.message : error,
    )
    return { sent: false }
  }
}

async function withTx(fn) {
  await asegurarEsquemaColaboradores()
  await asegurarTelefonoVerificacion()
  return withPgClientInteractive(async (client) => {
    await client.query('BEGIN')
    try {
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // el error original es el que se informa
      }
      throw error
    }
  })
}

router.get(
  '/colaboradores',
  verificarToken,
  exigirPermiso(['TITULAR', 'COLABORADOR_CLINICO', 'COLABORADOR_ADMIN']),
  async (req, res, next) => {
    try {
      const data = await withTx(async (client) => {
        const resolved = await resolverTitular(client, req)
        if (resolved.error) return resolved
        const { titular } = resolved
        const { rows } = await client.query(
          `SELECT ${USUARIO_COLUMNS}
             FROM usuarios
            WHERE id = $1::uuid
               OR titular_id = $1::uuid
            ORDER BY CASE WHEN titular_id IS NULL THEN 0 ELSE 1 END, nombre_completo`,
          [titular.id],
        )
        const plan = await planDelTitular(titular)
        const verInvitacion = esSuperAdminSesion(req.user) || esTitularDeClinica(req.user)
        const titularRow = rows.find((row) => row.id === titular.id) || titular
        const titularVista = {
          ...titularRow,
          codigo_sede_reps: titular.codigo_sede_reps || titularRow.codigo_sede_reps,
          rethus: titular.rethus || titularRow.rethus,
          email: titular.email || titularRow.email,
        }
        const colaboradores = rows.filter((row) => row.titular_id === titular.id)
        const conteo = await contarActivos(client, titular.id)
        const tope = plan ? CUPOS_PLAN[plan] : null
        return {
          plan,
          cupos: tope
            ? {
                profesionales: { usados: 1 + conteo.clinicos, max: tope.profesionales },
                administrativos: { usados: conteo.admins, max: tope.administrativos },
              }
            : null,
          titular: publico(titularVista, { conInvitacion: false }),
          colaboradores: colaboradores.map((row) => publico(row, { conInvitacion: verInvitacion })),
          clinicSyncId: identidadClinicaTitular(titular).clinicSyncId,
        }
      })
      if (data.error) return fail(res, data.status, data.error)
      return res.json({ success: true, ok: true, ...data })
    } catch (error) {
      return finish(res, next, error)
    }
  },
)

router.post(
  '/colaboradores',
  verificarToken,
  exigirPermiso(['TITULAR']),
  async (req, res, next) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const nombre = String(body.nombre || body.nombre_completo || '').trim()
      const email = normalizeEmail(body.email)
      const rol = String(body.rol || '').trim()
      const rethus = String(body.rethus || '').trim()

      if (!nombre || nombre.length > 255) {
        return fail(res, 400, 'Indique el nombre del colaborador.')
      }
      if (!email || !CORREO_ESTRICTO.test(email) || email.length > 255) {
        return fail(res, 400, 'El correo electrónico no tiene un formato válido.')
      }
      const telefono = String(body.telefono || '').trim()
      const telefonoDigitos = telefono.replace(/\D/g, '')
      if (!telefono || telefono.length > 30 || telefonoDigitos.length < 10 || telefonoDigitos.length > 15) {
        return fail(res, 400, 'Indique un teléfono de WhatsApp válido, con indicativo.')
      }
      if (email === MASTER_EMAIL) {
        return fail(res, 403, 'Ese correo no se puede invitar como colaborador.')
      }
      if (!ROLES_INVITABLES.has(rol)) {
        return fail(res, 400, "El rol debe ser COLABORADOR_CLINICO o COLABORADOR_ADMIN.")
      }
      if (rol === 'COLABORADOR_CLINICO' && !rethus) {
        return fail(res, 400, 'El colaborador clínico exige ReTHUS.')
      }
      if (rol === 'COLABORADOR_ADMIN' && rethus) {
        return fail(res, 400, 'El colaborador administrativo no lleva ReTHUS.')
      }
      if (rethus.length > 50) return fail(res, 400, 'El ReTHUS no puede superar 50 caracteres.')

      const creado = await withTx(async (client) => {
        const resolved = await resolverTitular(client, req)
        if (resolved.error) return resolved
        const { titular } = resolved
        await client.query('SELECT id FROM usuarios WHERE id = $1::uuid FOR UPDATE', [titular.id])
        const plan = await planDelTitular(titular)
        const conteo = await contarActivos(client, titular.id)
        const cupo = cupoDisponible(plan, conteo, rol, { incluirEste: true })
        if (!cupo.ok) return { error: cupo.error, status: cupo.status }

        const sede = String(titular.codigo_sede_reps || '').trim()
        if (sede.length > 20) {
          return {
            error: 'El código REPS del titular supera los 20 caracteres y no se puede heredar.',
            status: 400,
          }
        }

        const id = randomUUID()
        const inviteToken = randomUUID()
        const vence = expiresAt()
        const passwordHash = bcrypt.hashSync(randomUUID(), BCRYPT_ROUNDS)
        const rethusDb = rol === 'COLABORADOR_CLINICO' ? rethus : null
        const duplicado = await queryUsuarioPorEmail(client, email)
        if (duplicado) {
          return { error: 'Ese correo ya está registrado en el sistema.', status: 409 }
        }

        try {
          const { rows } = await client.query(
            `INSERT INTO usuarios (
               id, clinica_id, email, password_hash, nombre_completo,
               registro_rethus, is_superadmin, rol, estado,
               titular_id, codigo_sede_reps, rethus,
               invite_token, invite_expires_at, activo,
               telefono, email_verificado
             ) VALUES (
               $1::uuid, $2::uuid, $3::text, $4::text, $5::text,
               $6::text, FALSE, $7::text, 'activo',
               $8::uuid, $9::text, $10::text,
               $11::text, $12::timestamp, TRUE,
               $13::text, FALSE
             )
             RETURNING ${USUARIO_COLUMNS}`,
            [
              id,
              titular.clinica_id,
              email,
              passwordHash,
              nombre,
              rethusDb,
              rol,
              titular.id,
              sede || null,
              rethusDb,
              inviteToken,
              vence.toISOString(),
              telefono,
            ],
          )
          return { usuario: rows[0], plan, inviteToken }
        } catch (error) {
          if (error?.code === '23505') {
            const detalle = `${error.constraint || ''} ${error.detail || ''}`
            if (/email/i.test(detalle)) {
              return { error: 'Ese correo ya está registrado en el sistema.', status: 409 }
            }
            return { error: 'Ya existe una cuenta con ese correo o ese enlace.', status: 409 }
          }
          throw error
        }
      })

      if (creado.error) return fail(res, creado.status, creado.error)
      await enviarCorreoActivacion({
        email,
        nombre,
        token: creado.inviteToken || creado.usuario?.invite_token,
      })
      return res.status(201).json({
        success: true,
        ok: true,
        plan: creado.plan,
        usuario: publico(creado.usuario, { conInvitacion: true }),
        invite_token: creado.usuario.invite_token,
        invite_expires_at: creado.usuario.invite_expires_at,
      })
    } catch (error) {
      return finish(res, next, error)
    }
  },
)

router.patch(
  '/colaboradores/:id/estado',
  verificarToken,
  exigirPermiso(['TITULAR']),
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim()
      const activo = req.body?.activo
      if (!id) return fail(res, 400, 'Falta el id del colaborador.')
      if (typeof activo !== 'boolean') {
        return fail(res, 400, 'Indique activo: true o false.')
      }

      const actualizado = await withTx(async (client) => {
        const resolved = await resolverTitular(client, req)
        if (resolved.error) return resolved
        const { titular } = resolved
        await client.query('SELECT id FROM usuarios WHERE id = $1::uuid FOR UPDATE', [titular.id])
        const colaborador = await queryUsuario(client, id)
        if (!colaborador || colaborador.titular_id !== titular.id) {
          return { error: 'Colaborador no encontrado en esta clínica.', status: 404 }
        }
        if (!ROLES_INVITABLES.has(colaborador.rol)) {
          return { error: 'Solo se activa o suspende a un colaborador.', status: 403 }
        }
        if (activo === true && colaborador.activo !== true) {
          const plan = await planDelTitular(titular)
          const conteo = await contarActivos(client, titular.id)
          const cupo = cupoDisponible(plan, conteo, colaborador.rol, { incluirEste: true })
          if (!cupo.ok) return { error: cupo.error, status: cupo.status }
        }
        const { rows } = await client.query(
          `UPDATE usuarios
              SET activo = $2::boolean
            WHERE id = $1::uuid
              AND titular_id = $3::uuid
          RETURNING ${USUARIO_COLUMNS}`,
          [id, activo, titular.id],
        )
        return { usuario: rows[0] }
      })

      if (actualizado.error) return fail(res, actualizado.status, actualizado.error)
      return res.json({
        success: true,
        ok: true,
        usuario: publico(actualizado.usuario, { conInvitacion: false }),
      })
    } catch (error) {
      return finish(res, next, error)
    }
  },
)

router.post(
  '/colaboradores/:id/regenerar-enlace',
  verificarToken,
  exigirPermiso(['TITULAR']),
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim()
      if (!id) return fail(res, 400, 'Falta el id del colaborador.')

      const renovado = await withTx(async (client) => {
        const resolved = await resolverTitular(client, req)
        if (resolved.error) return resolved
        const { titular } = resolved
        const inviteToken = randomUUID()
        const vence = expiresAt()
        const { rows } = await client.query(
          `UPDATE usuarios
              SET invite_token = $2::text,
                  invite_expires_at = $3::timestamp
            WHERE id = $1::uuid
              AND titular_id = $4::uuid
              AND rol IN ('COLABORADOR_CLINICO', 'COLABORADOR_ADMIN')
          RETURNING ${USUARIO_COLUMNS}`,
          [id, inviteToken, vence.toISOString(), titular.id],
        )
        if (!rows[0]) return { error: 'Colaborador no encontrado en esta clínica.', status: 404 }
        return { usuario: rows[0] }
      })

      if (renovado.error) return fail(res, renovado.status, renovado.error)
      return res.json({
        success: true,
        ok: true,
        usuario: publico(renovado.usuario, { conInvitacion: true }),
        invite_token: renovado.usuario.invite_token,
        invite_expires_at: renovado.usuario.invite_expires_at,
      })
    } catch (error) {
      return finish(res, next, error)
    }
  },
)

router.post('/auth/activar', async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const token = String(body.token || '').trim()
    const password = String(body.password || '')
    if (!token) return fail(res, 400, 'Indique el token de invitación.')
    if (password.length < 8) {
      return fail(res, 400, 'La contraseña debe tener al menos 8 caracteres.')
    }

    const activado = await withTx(async (client) => {
      const { rows } = await client.query(
        `SELECT ${USUARIO_COLUMNS},
                (invite_expires_at IS NOT NULL AND invite_expires_at > NOW()) AS invite_vigente
           FROM usuarios
          WHERE invite_token = $1::text
          LIMIT 1
          FOR UPDATE`,
        [token],
      )
      const cuenta = rows[0]
      if (!cuenta) return { error: 'El enlace de invitación no existe.', status: 400 }
      if (cuenta.invite_vigente !== true) {
        return { error: 'El enlace de invitación expiró.', status: 410 }
      }

      const titular = cuenta.titular_id
        ? await queryUsuario(client, cuenta.titular_id)
        : cuenta
      if (!titular) return { error: 'No se encontró el titular de esta invitación.', status: 404 }

      const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS)
      const { rows: updated } = await client.query(
        `UPDATE usuarios
            SET password_hash = $2::text,
                invite_token = NULL,
                invite_expires_at = NULL,
                email_verificado = TRUE,
                activo = TRUE
          WHERE id = $1::uuid
            AND invite_token = $3::text
        RETURNING ${USUARIO_COLUMNS}`,
        [cuenta.id, passwordHash, token],
      )
      const usuario = updated[0]
      if (!usuario) return { error: 'El enlace de invitación ya fue usado.', status: 409 }
      return { usuario, titular }
    })

    if (activado.error) return fail(res, activado.status, activado.error)

    const { usuario, titular } = activado
    const clinica = identidadClinicaTitular(titular)
    const sessionUser = {
      id: usuario.id,
      userId: usuario.id,
      nombre: usuario.nombre_completo,
      email: usuario.email,
      rol: usuario.rol,
      rethus: usuario.rethus ?? null,
      activo: usuario.activo === true,
      clinicId: clinica.clinicId,
      clinica_id: clinica.clinicaId,
      clinicSyncId: clinica.clinicSyncId,
      is_superadmin: false,
    }
    const jwt = signColaboradorToken({
      id: usuario.id,
      userId: usuario.id,
      clinica_id: titular.clinica_id,
      clinicId: clinica.clinicId,
      clinicSyncId: clinica.clinicSyncId,
      rol: usuario.rol,
      nombre: usuario.nombre_completo,
      rethus: usuario.rethus ?? null,
      activo: usuario.activo === true,
      email: usuario.email,
    })

    return res.json({
      success: true,
      ok: true,
      token: jwt,
      user: sessionUser,
      rol: usuario.rol,
      clinicSyncId: clinica.clinicSyncId,
    })
  } catch (error) {
    return finish(res, next, error)
  }
})

export default router

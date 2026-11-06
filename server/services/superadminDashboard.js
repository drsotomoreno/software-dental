/**
 * Panel global del superadministrador.
 * Clínicas y pacientes salen de PostgreSQL cuando RDS responde.
 * MRR, servicios sin credencial e infraestructura EC2 quedan simulados
 * hasta conectar suscripciones SaaS y CloudWatch.
 */
import { config, DATABASE_URL, hasMinsaludCredentials } from '../config.js'
import { withPgClient } from './durableStore.js'

const SQL_TENANTS = `
SELECT
  c.id::text AS id,
  c.nombre AS clinic_name,
  COALESCE(titular.nombre_completo, 'Sin titular') AS owner_name,
  COALESCE(c.codigo_reps, '') AS reps_code,
  COALESCE(titular.registro_rethus, '') AS rethus,
  COALESCE(titular.estado, 'activo') AS status,
  COALESCE(pac.total, 0)::int AS patient_count
FROM clinicas c
LEFT JOIN LATERAL (
  SELECT u.nombre_completo, u.registro_rethus, u.estado
  FROM usuarios u
  WHERE u.clinica_id = c.id
    AND u.is_superadmin = FALSE
  ORDER BY
    CASE WHEN u.rol IN ('admin', 'admin_clinica', 'odontologo') THEN 0 ELSE 1 END,
    u.created_at ASC
  LIMIT 1
) titular ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS total
  FROM pacientes p
  WHERE p.clinica_id = c.id
    AND p.deleted_at IS NULL
) pac ON TRUE
ORDER BY c.nombre ASC
LIMIT 200
`

const SQL_TENANTS_SIMPLE = `
SELECT
  c.id::text AS id,
  c.nombre AS clinic_name,
  COALESCE(titular.nombre_completo, 'Sin titular') AS owner_name,
  COALESCE(c.codigo_reps, '') AS reps_code,
  COALESCE(titular.registro_rethus, '') AS rethus,
  COALESCE(titular.estado, 'activo') AS status,
  0::int AS patient_count
FROM clinicas c
LEFT JOIN LATERAL (
  SELECT u.nombre_completo, u.registro_rethus, u.estado
  FROM usuarios u
  WHERE u.clinica_id = c.id
    AND u.is_superadmin = FALSE
  ORDER BY u.created_at ASC
  LIMIT 1
) titular ON TRUE
ORDER BY c.nombre ASC
LIMIT 200
`

const SQL_PATIENTS = `
SELECT COUNT(*)::int AS total
FROM pacientes
WHERE deleted_at IS NULL
`

const SQL_LOGS = `
SELECT
  id::text AS id,
  created_at,
  modo,
  canal,
  http_status,
  success,
  errors,
  duration_ms
FROM rips_logs
ORDER BY created_at DESC
LIMIT 50
`

const SQL_SET_STATUS = `
UPDATE usuarios
SET estado = $2
WHERE clinica_id = $1::uuid
  AND is_superadmin = FALSE
`

const FIXTURE_TENANTS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    clinicName: 'Clínica Dental Andes',
    ownerName: 'Dra. Laura Méndez',
    repsCode: '1100103898-01',
    rethus: '438120',
    plan: 'Profesional',
    status: 'activa',
    patientCount: 842,
    mrrCop: 189000,
    lastSyncAt: null,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    clinicName: 'Sonríe Centro Odontológico',
    ownerName: 'Dr. Andrés Pardo',
    repsCode: '0500102211-04',
    rethus: '512883',
    plan: 'Clínica',
    status: 'activa',
    patientCount: 1560,
    mrrCop: 349000,
    lastSyncAt: null,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    clinicName: 'Consultorio Ortodoncia Bahía',
    ownerName: 'Dra. Camila Ríos',
    repsCode: '1300107744-12',
    rethus: '390221',
    plan: 'Básico',
    status: 'activa',
    patientCount: 126,
    mrrCop: 99000,
    lastSyncAt: null,
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    clinicName: 'IPS Oral Nova',
    ownerName: 'Dr. Julián Herrera',
    repsCode: '7600108833-01',
    rethus: '601442',
    plan: 'Profesional',
    status: 'suspendida',
    patientCount: 410,
    mrrCop: 189000,
    lastSyncAt: null,
  },
]

const overrides = new Map()
const warned = new Set()
let postgresSkipUntil = 0

function warnOnce(key, error) {
  if (warned.has(key)) return
  warned.add(key)
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[superadmin] ${key}: ${message}`)
}

function rememberPostgresOutage(error) {
  const code = error?.code
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'PG_UNAVAILABLE' ||
    code === 'ENOTFOUND' ||
    /ECONNREFUSED|timeout|no está disponible|no está configurado/i.test(message)
  ) {
    postgresSkipUntil = Date.now() + 20_000
  }
}

async function defaultQuery(sql, params = []) {
  if (Date.now() < postgresSkipUntil) {
    const error = new Error('PostgreSQL no está disponible.')
    error.code = 'PG_UNAVAILABLE'
    throw error
  }
  try {
    return await withPgClient(async (client) => {
      const result = await client.query(sql, params)
      return result.rows
    })
  } catch (error) {
    rememberPostgresOutage(error)
    throw error
  }
}

function queryOf(deps) {
  return deps.query ?? defaultQuery
}

export function resetSuperadminOverrides() {
  overrides.clear()
}

function mapStatus(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'suspendida' || normalized === 'suspendido' || normalized === 'inactivo') {
    return 'suspendida'
  }
  return 'activa'
}

function applyOverride(tenant) {
  const extra = overrides.get(tenant.id)
  return extra ? { ...tenant, ...extra } : tenant
}

function mapTenantRow(row) {
  return applyOverride({
    id: String(row.id),
    clinicName: row.clinic_name || 'Clínica sin nombre',
    ownerName: row.owner_name || 'Sin titular',
    repsCode: row.reps_code || '',
    rethus: row.rethus || '',
    plan: 'Por conectar',
    status: mapStatus(row.status),
    patientCount: Number(row.patient_count) || 0,
    mrrCop: 0,
    lastSyncAt: null,
  })
}

function fixtureTenants() {
  return FIXTURE_TENANTS.map((tenant) => applyOverride({ ...tenant }))
}

function isMissingRelation(error) {
  return error?.code === '42P01' || error?.code === '42703'
}

async function readTenantRows(query) {
  try {
    const rows = await query(SQL_TENANTS, [])
    return Array.isArray(rows) ? rows : []
  } catch (error) {
    if (!isMissingRelation(error)) throw error
    const rows = await query(SQL_TENANTS_SIMPLE, [])
    return Array.isArray(rows) ? rows : []
  }
}

export async function listTenants(deps = {}) {
  try {
    const rows = await readTenantRows(queryOf(deps))
    if (rows.length > 0) {
      return { source: 'postgres', tenants: rows.map(mapTenantRow) }
    }
  } catch (error) {
    warnOnce('clinicas', error)
  }
  return { source: 'fixture', tenants: fixtureTenants() }
}

async function findTenant(id, deps) {
  const snapshot = await listTenants(deps)
  return snapshot.tenants.find((tenant) => tenant.id === id) ?? null
}

export async function suspendTenant(id, status = 'suspendida', deps = {}) {
  const current = await findTenant(id, deps)
  if (!current) return null
  const nextStatus = status === 'activa' ? 'activa' : 'suspendida'
  overrides.set(id, { ...(overrides.get(id) || {}), status: nextStatus })
  try {
    await queryOf(deps)(SQL_SET_STATUS, [id, nextStatus === 'suspendida' ? 'suspendido' : 'activo'])
  } catch (error) {
    warnOnce(`suspend:${id}`, error)
  }
  return applyOverride(current)
}

export async function forceGlobalOfflineSync(deps = {}) {
  const snapshot = await listTenants(deps)
  const queuedAt = new Date().toISOString()
  for (const tenant of snapshot.tenants) {
    overrides.set(tenant.id, { ...(overrides.get(tenant.id) || {}), lastSyncAt: queuedAt })
  }
  return {
    queued: snapshot.tenants.length,
    queuedAt,
    message: `Se registró la sincronización offline para ${snapshot.tenants.length} clínicas. Cada consultorio la aplicará en su próximo ciclo.`,
  }
}

export async function forceOfflineSync(id, deps = {}) {
  const current = await findTenant(id, deps)
  if (!current) return null
  const queuedAt = new Date().toISOString()
  overrides.set(id, { ...(overrides.get(id) || {}), lastSyncAt: queuedAt })
  return {
    tenant: applyOverride(current),
    queuedAt,
    message:
      'Se registró la orden de sincronización offline. Cada consultorio de esta clínica la aplicará en su próximo ciclo.',
  }
}

export function fixtureMrrCop() {
  return FIXTURE_TENANTS.filter((tenant) => tenant.status === 'activa').reduce(
    (sum, tenant) => sum + tenant.mrrCop,
    0,
  )
}

function buildServices() {
  const muvReady = hasMinsaludCredentials()
  const dianReady = Boolean(config.dian.technicalKey)
  const driveReady = Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  )
  return [
    {
      id: 'muv',
      label: 'MUV / SISPRO',
      status: muvReady ? 'operativo' : 'pendiente',
      detail: muvReady
        ? 'Credenciales de MinSalud presentes. El ping comprueba el endpoint.'
        : 'Faltan la URL base o las credenciales del MUV en el servidor.',
      simulated: !muvReady,
    },
    {
      id: 'dian',
      label: 'Facturación electrónica DIAN',
      status: dianReady ? 'operativo' : 'pendiente',
      detail: dianReady
        ? `Software DIAN ${config.dian.softwareId} con clave técnica configurada.`
        : 'La clave técnica DIAN no está configurada en este entorno.',
      simulated: !dianReady,
    },
    {
      id: 'googleDrive',
      label: 'Google Drive API',
      status: driveReady ? 'operativo' : 'pendiente',
      detail: driveReady
        ? 'Cuenta de servicio de Google Drive detectada.'
        : 'La API de Google Drive todavía no está conectada.',
      simulated: !driveReady,
    },
  ]
}

export async function getDashboardMetrics(deps = {}) {
  const tenantsResult = await listTenants(deps)
  const activeClinics = tenantsResult.tenants.filter((tenant) => tenant.status === 'activa').length
  let registeredPatients = tenantsResult.tenants.reduce(
    (sum, tenant) => sum + (Number(tenant.patientCount) || 0),
    0,
  )

  if (tenantsResult.source === 'postgres') {
    try {
      const rows = await queryOf(deps)(SQL_PATIENTS, [])
      const total = Number(rows?.[0]?.total)
      if (Number.isFinite(total)) registeredPatients = total
    } catch (error) {
      warnOnce('pacientes', error)
    }
  }

  return {
    source: tenantsResult.source,
    activeClinics,
    registeredPatients,
    mrrCop: fixtureMrrCop(),
    mrrSimulated: true,
    services: buildServices(),
  }
}

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function fixtureLogs() {
  return [
    {
      id: 'log-rips-json',
      at: minutesAgo(12),
      level: 'error',
      source: 'RIPS',
      message:
        'No se pudo armar el JSON de RIPS: tipoDocumento del usuario vino vacío en una atención de demostración.',
    },
    {
      id: 'log-minsalud',
      at: minutesAgo(36),
      level: 'error',
      source: 'MinSalud',
      message:
        'El MUV rechazó el paquete (HTTP 400). El código de habilitación REPS no coincide con el prestador.',
    },
    {
      id: 'log-dian',
      at: minutesAgo(80),
      level: 'error',
      source: 'DIAN',
      message:
        'Factura electrónica rechazada: la clave técnica del software no está configurada en este entorno.',
    },
    {
      id: 'log-rips-ok',
      at: minutesAgo(140),
      level: 'info',
      source: 'RIPS',
      message: 'Paquete FEV-RIPS de demostración validado en local. Aún no se radica.',
    },
  ]
}

function errorText(errors) {
  if (!errors) return ''
  if (typeof errors === 'string') return errors
  if (Array.isArray(errors)) {
    return errors
      .map((item) => item?.message || item?.descripcion || item?.Description || JSON.stringify(item))
      .join('; ')
  }
  if (typeof errors === 'object') {
    return errors.message || errors.descripcion || JSON.stringify(errors).slice(0, 400)
  }
  return String(errors)
}

function mapLogRow(row) {
  const canal = String(row.canal || '').toLowerCase()
  const source = canal.includes('dian') ? 'DIAN' : canal.includes('rips') ? 'RIPS' : 'MinSalud'
  const failed = row.success === false || (Number(row.http_status) >= 400)
  const detail = errorText(row.errors)
  const http = row.http_status ? `HTTP ${row.http_status}` : 'sin código HTTP'
  const message = failed
    ? detail || `Radicación ${source} rechazada (${http}, ${row.duration_ms ?? '—'} ms).`
    : `Radicación ${source} aceptada (${http}, ${row.duration_ms ?? '—'} ms).`
  return {
    id: String(row.id),
    at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    level: failed ? 'error' : 'info',
    source,
    message,
  }
}

export async function listIntegrationLogs(deps = {}) {
  try {
    const rows = await queryOf(deps)(SQL_LOGS, [])
    if (Array.isArray(rows) && rows.length > 0) {
      return { source: 'postgres', events: rows.map(mapLogRow) }
    }
  } catch (error) {
    warnOnce('logs', error)
  }
  return { source: 'fixture', events: fixtureLogs() }
}

function hostFevrips(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.includes('fevrips')
  } catch {
    return false
  }
}

function muvPingUrl() {
  const configured = String(config.minsalud.apiBaseUrl || '').replace(/\/$/, '')
  const base = hostFevrips(configured)
    ? configured
    : config.minsalud.sandbox
      ? 'https://stage-fevrips.sispropreprod.gov.co/fevrips-api'
      : 'https://fevrips.sispro.gov.co/fevrips-api'
  return `${base}/api/Auth/LoginSISPRO`
}

export async function pingMinsaludEndpoint() {
  const url = muvPingUrl()
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    const latencyMs = Date.now() - started
    const reachable = response.status > 0 && response.status < 500
    return {
      ok: reachable,
      url,
      httpStatus: response.status,
      latencyMs,
      sandbox: Boolean(config.minsalud.sandbox),
      event: {
        id: `ping-${started}`,
        at: new Date().toISOString(),
        level: reachable ? 'info' : 'error',
        source: 'MinSalud',
        message: reachable
          ? `Ping al endpoint MUV respondió HTTP ${response.status} en ${latencyMs} ms.`
          : `Ping al endpoint MUV falló con HTTP ${response.status} en ${latencyMs} ms.`,
      },
    }
  } catch (error) {
    const latencyMs = Date.now() - started
    const timedOut = error?.name === 'AbortError'
    const message = timedOut ? 'Tiempo de espera agotado (6 s).' : error?.message || 'Sin respuesta'
    return {
      ok: false,
      url,
      httpStatus: 0,
      latencyMs,
      sandbox: Boolean(config.minsalud.sandbox),
      error: message,
      event: {
        id: `ping-${started}`,
        at: new Date().toISOString(),
        level: 'error',
        source: 'MinSalud',
        message: `Ping al endpoint MUV no completó: ${message}`,
      },
    }
  } finally {
    clearTimeout(timer)
  }
}

export function getInfrastructure() {
  return {
    source: 'simulated',
    sampledAt: new Date().toISOString(),
    cpuPercent: 23,
    ramPercent: 41,
    rdsUsedGb: 18.4,
    rdsAllocatedGb: 100,
    note: 'Métricas simuladas. En EC2 se reemplazan por CloudWatch (CPUUtilization y memoria) y en RDS por FreeStorageSpace.',
  }
}

function addDays(days) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

export function listSubscriptions() {
  return {
    source: 'fixture',
    note: 'Ingresos de demostración. Se reemplazan cuando exista la tabla de suscripciones SaaS en PostgreSQL.',
    subscriptions: FIXTURE_TENANTS.map((tenant, index) => ({
      id: tenant.id,
      clinicName: tenant.clinicName,
      plan: tenant.plan,
      mrrCop: tenant.status === 'activa' ? tenant.mrrCop : 0,
      status: tenant.status,
      renewsAt: tenant.status === 'activa' ? addDays(12 + index * 5) : null,
    })),
  }
}

export function verifyDianCredentials() {
  const settings = getSystemSettings()
  return {
    ok: settings.dianConfigured,
    configured: settings.dianConfigured,
    softwareId: settings.dianSoftwareId,
    message: settings.dianConfigured
      ? `La clave técnica DIAN está presente para el software ${settings.dianSoftwareId}.`
      : 'La clave técnica DIAN no está configurada en este entorno.',
  }
}

export function getSystemSettings() {
  return {
    environment: config.nodeEnv,
    publicUrl: config.appPublicUrl,
    database: DATABASE_URL ? 'configurada' : 'no configurada',
    minsaludSandbox: Boolean(config.minsalud.sandbox),
    minsaludConfigured: hasMinsaludCredentials(),
    dianSoftwareId: config.dian.softwareId || '—',
    dianConfigured: Boolean(config.dian.technicalKey),
    googleDriveConfigured: Boolean(
      process.env.GOOGLE_DRIVE_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    ),
    ripsCron: '0 2 1 * * (America/Bogota)',
  }
}

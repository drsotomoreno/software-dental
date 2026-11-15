/**
 * Panel global del superadministrador.
 * Un inquilino es la cuenta maestra o una clínica con suscripción pagada.
 * Quien solo se registró (pendiente o prueba) no aparece en Clínicas.
 * MRR de demostración e infraestructura EC2 siguen simulados si no hay cuentas reales.
 */
import { join } from 'node:path'
import { config, DATABASE_URL, hasMinsaludCredentials } from '../config.js'
import { hasSubscriptionPaymentProof, isMasterAccessEmail } from '../../shared/clinicalAccess.js'
import { clinicSyncAliasIds } from '../../shared/clinicalSyncScope.js'
import { PAID_PLAN_IDS, PAID_PLANS, planDisplayName } from '../../shared/subscriptionPlans.js'
import { readDurableJson, withPgClient } from './durableStore.js'
import { clinicaUuidFromCanonical } from './clinicPatientMirror.js'

const USERS_FILE = join(config.dataDir, 'subscription-users.json')

const SQL_PATIENT_COUNTS = `
SELECT clinica_id::text AS id, COUNT(*)::int AS total
FROM pacientes
WHERE deleted_at IS NULL
GROUP BY clinica_id
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
    email: 'laura.mendez@andes.demo',
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
    email: 'andres.pardo@sonrie.demo',
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
    email: 'camila.rios@bahia.demo',
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
    email: 'julian.herrera@oralnova.demo',
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

function applyOverride(tenant) {
  const extra = overrides.get(tenant.id)
  return extra ? { ...tenant, ...extra } : tenant
}

function fixtureTenants() {
  return FIXTURE_TENANTS.map((tenant) => applyOverride({ ...tenant, platformOwner: false }))
}

function isMissingRelation(error) {
  return error?.code === '42P01' || error?.code === '42703'
}

function ownerNameOf(user) {
  const fromParts = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
  return String(user?.nombre || fromParts || '').trim() || 'Sin titular'
}

function clinicNameOf(user) {
  return String(user?.clinicName || user?.legalName || '').trim() || ownerNameOf(user)
}

function planPriceCop(planId) {
  const plan = PAID_PLANS.find((item) => item.id === planId)
  const digits = String(plan?.priceLabel || '').replace(/\D/g, '')
  return Number(digits) || 0
}

function isClinicOwnerAccount(user) {
  if (isMasterAccessEmail(user?.email)) return true
  const id = String(user?.id || '').trim()
  if (!id) return false
  return String(user?.clinicId || id).trim() === id
}

/** Compra real: plan de pago + sello subscriptionPaidAt. Prueba y pendiente no cuentan. */
function purchasedSubscription(user) {
  if (!user || isMasterAccessEmail(user.email)) return false
  if (!hasSubscriptionPaymentProof(user)) return false
  const plan = String(user.plan ?? '').trim().toLowerCase()
  if (!PAID_PLAN_IDS.includes(plan)) return false
  const estado = String(user.estado_pago ?? '').trim().toLowerCase()
  return estado === 'activo' || estado === 'vencido'
}

function tenantStatusOf(user) {
  if (isMasterAccessEmail(user?.email)) return 'activa'
  const estado = String(user?.estado_pago ?? '').trim().toLowerCase()
  if (estado === 'vencido' || user?.accessEnabled === false) return 'suspendida'
  if (user?.fecha_vencimiento && new Date(user.fecha_vencimiento).getTime() <= Date.now()) {
    return 'suspendida'
  }
  return 'activa'
}

function clinicaIdsFor(user) {
  const scope = clinicSyncAliasIds(user)
  const ids = new Set()
  for (const key of [scope.canonical, ...(scope.aliases || [])]) {
    const value = String(key || '').trim()
    if (!value) continue
    ids.add(clinicaUuidFromCanonical(value))
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      ids.add(value)
    }
  }
  return [...ids]
}

/**
 * La cuenta maestra siempre entra, con su titular, REPS y ReTHUS.
 * El resto solo si el titular compró un plan.
 */
export function tenantsFromAccounts(users) {
  const rows = []
  for (const user of Array.isArray(users) ? users : []) {
    const master = isMasterAccessEmail(user?.email)
    if (!master && !purchasedSubscription(user)) continue
    if (!isClinicOwnerAccount(user)) continue
    const planId = String(user.plan ?? '').trim().toLowerCase()
    const status = tenantStatusOf(user)
    rows.push({
      id: String(user.id),
      clinicName: clinicNameOf(user),
      ownerName: ownerNameOf(user),
      email: String(user.email ?? '').trim().toLowerCase(),
      repsCode: String(user.repsCode ?? '').trim(),
      rethus: String(user.rethusNumber ?? user.registro_rethus ?? '').trim(),
      plan: master ? 'Exento' : planDisplayName(planId, user.estado_pago),
      status,
      patientCount: 0,
      mrrCop: master || status !== 'activa' ? 0 : planPriceCop(planId),
      lastSyncAt: null,
      platformOwner: master,
    })
  }
  rows.sort((left, right) => {
    if (left.platformOwner !== right.platformOwner) return left.platformOwner ? -1 : 1
    return left.clinicName.localeCompare(right.clinicName, 'es')
  })
  return rows
}

async function loadSubscriptionAccounts() {
  try {
    const parsed = await readDurableJson(USERS_FILE, null)
    return Array.isArray(parsed?.users) ? parsed.users : null
  } catch (error) {
    warnOnce('cuentas', error)
    return null
  }
}

async function resolveAccounts(deps) {
  if (Object.prototype.hasOwnProperty.call(deps, 'accounts')) {
    return Array.isArray(deps.accounts) ? deps.accounts : null
  }
  return loadSubscriptionAccounts()
}

async function attachPatientCounts(tenants, accounts, query) {
  const byId = new Map((Array.isArray(accounts) ? accounts : []).map((user) => [String(user.id), user]))
  const clinicaToTenant = new Map()
  for (const tenant of tenants) {
    const user = byId.get(tenant.id)
    if (!user) continue
    for (const clinicaId of clinicaIdsFor(user)) clinicaToTenant.set(clinicaId, tenant)
  }
  if (clinicaToTenant.size === 0) return
  try {
    const rows = await query(SQL_PATIENT_COUNTS, [])
    for (const row of Array.isArray(rows) ? rows : []) {
      const tenant = clinicaToTenant.get(String(row.id))
      if (!tenant) continue
      tenant.patientCount += Number(row.total) || 0
    }
  } catch (error) {
    if (!isMissingRelation(error)) warnOnce('pacientes-por-clinica', error)
  }
}

export async function listTenants(deps = {}) {
  const accounts = await resolveAccounts(deps)
  if (accounts) {
    const tenants = tenantsFromAccounts(accounts).map((tenant) => applyOverride(tenant))
    await attachPatientCounts(tenants, accounts, queryOf(deps))
    return { source: 'postgres', tenants }
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
  if (current.platformOwner) return applyOverride(current)
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
    (process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID) &&
      (process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET),
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
        ? 'OAuth listo. Cada clínica conecta su propio Google Drive.'
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

  const simulated = tenantsResult.source !== 'postgres'
  return {
    source: tenantsResult.source,
    activeClinics,
    registeredPatients,
    mrrCop: simulated
      ? fixtureMrrCop()
      : tenantsResult.tenants
          .filter((tenant) => tenant.status === 'activa')
          .reduce((sum, tenant) => sum + (Number(tenant.mrrCop) || 0), 0),
    mrrSimulated: simulated,
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
      (process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID) &&
        (process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET),
    ),
    ripsCron: '0 2 1 * * (America/Bogota)',
  }
}

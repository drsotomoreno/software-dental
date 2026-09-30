import { PrismaClient } from '@prisma/client'
import { validateProviderNit } from '../../shared/nit.js'
import { PROVIDER_TYPE_INDEPENDIENTE } from '../../shared/providerType.js'
import { parseRepsCode } from '../../shared/repsCode.js'
import {
  SISPRO_ENCRYPTION_ALGORITHM,
  SISPRO_ENCRYPTION_KEY_VERSION,
  decryptSecret,
  encryptSecret,
  loadEncryptionKey,
} from '../security/sisproCipher.js'

/** Tipos de documento del catálogo SISPRO / RIPS (Res. 2275). */
const TIPOS_DOCUMENTO = ['CC', 'CE', 'PA', 'RC', 'TI', 'NV', 'CD', 'SC', 'PE', 'PT']
const AMBIENTES = ['sandbox', 'produccion']

const SECRET_COLUMNS = {
  usuario: 'sisproUsuarioCipher',
  clave: 'sisproClaveCipher',
  clientId: 'sisproClientIdCipher',
  clientSecret: 'sisproClientSecretCipher',
}

export class PrestadorMuvConfigError extends Error {
  /**
   * @param {string} message
   * @param {number} [status]
   */
  constructor(message, status = 400) {
    super(message)
    this.name = 'PrestadorMuvConfigError'
    this.status = status
  }
}

let defaultClient

export function getPrismaClient() {
  if (!defaultClient) {
    defaultClient = new PrismaClient()
  }
  return defaultClient
}

/**
 * @param {import('@prisma/client').PrismaClient} [prisma]
 */
export function createPrestadorMuvConfigModel(prisma = getPrismaClient()) {
  return {
    upsertForPrestador(prestadorId, input) {
      return upsertForPrestador(prisma, prestadorId, input)
    },
    findByPrestadorId(prestadorId) {
      return prisma.prestadorMuvConfig.findUnique({
        where: { prestadorId: normalizePrestadorId(prestadorId) },
      })
    },
    toSafeDto,
    getCredentials,
  }
}

/**
 * @param {string} prestadorId
 */
function normalizePrestadorId(prestadorId) {
  const id = String(prestadorId ?? '').trim()
  if (!id) {
    throw new PrestadorMuvConfigError('El identificador del prestador es obligatorio.')
  }
  return id
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string | null | undefined}
 */
function normalizeSecret(value, label) {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = String(value).trim()
  if (!trimmed) {
    throw new PrestadorMuvConfigError(`${label} no puede estar vacío.`)
  }
  return trimmed
}

/**
 * @param {Record<string, string | null | undefined>} secrets
 */
export function assertCredentialPair(secrets) {
  const passwordPair = Boolean(secrets.usuario) && Boolean(secrets.clave)
  const clientPair = Boolean(secrets.clientId) && Boolean(secrets.clientSecret)
  const passwordHalf = Boolean(secrets.usuario) !== Boolean(secrets.clave)
  const clientHalf = Boolean(secrets.clientId) !== Boolean(secrets.clientSecret)

  if (passwordHalf) {
    throw new PrestadorMuvConfigError('Usuario y clave SISPRO deben guardarse juntos.')
  }
  if (clientHalf) {
    throw new PrestadorMuvConfigError('Client id y client secret SISPRO deben guardarse juntos.')
  }
  if (!passwordPair && !clientPair) {
    throw new PrestadorMuvConfigError(
      'Indique usuario y clave SISPRO, o client id y client secret.',
    )
  }
}

/**
 * @param {object} input
 * @param {object | null} existing
 */
export function buildPrestadorMuvConfigData(input, existing = null) {
  const source = input ?? {}
  if (
    source.providerType != null &&
    source.providerType !== PROVIDER_TYPE_INDEPENDIENTE
  ) {
    throw new PrestadorMuvConfigError(
      'La configuración MUV cifrada solo aplica al profesional independiente.',
    )
  }

  const reps = parseRepsCode(source.repsCode ?? existing?.repsCode)
  if (!reps.valid) {
    throw new PrestadorMuvConfigError(reps.message)
  }

  const nit = validateProviderNit(source.nit ?? existing?.nit)
  if (!nit.valid) {
    throw new PrestadorMuvConfigError(nit.message)
  }

  const tipoDocumento = String(source.tipoDocumento ?? existing?.tipoDocumento ?? '')
    .trim()
    .toUpperCase()
  if (!TIPOS_DOCUMENTO.includes(tipoDocumento)) {
    throw new PrestadorMuvConfigError('tipoDocumento no pertenece al catálogo SISPRO.')
  }

  const ambiente = String(source.ambiente ?? existing?.ambiente ?? 'sandbox').trim()
  if (!AMBIENTES.includes(ambiente)) {
    throw new PrestadorMuvConfigError('ambiente debe ser sandbox o produccion.')
  }

  const credentials = source.credentials ?? {}
  const secrets = {
    usuario: normalizeSecret(credentials.usuario, 'El usuario SISPRO'),
    clave: normalizeSecret(credentials.clave, 'La clave SISPRO'),
    clientId: normalizeSecret(credentials.clientId, 'El client id SISPRO'),
    clientSecret: normalizeSecret(credentials.clientSecret, 'El client secret SISPRO'),
  }

  const resolved = {
    usuario: secrets.usuario === undefined ? cipherPresent(existing?.sisproUsuarioCipher) : secrets.usuario,
    clave: secrets.clave === undefined ? cipherPresent(existing?.sisproClaveCipher) : secrets.clave,
    clientId:
      secrets.clientId === undefined ? cipherPresent(existing?.sisproClientIdCipher) : secrets.clientId,
    clientSecret:
      secrets.clientSecret === undefined
        ? cipherPresent(existing?.sisproClientSecretCipher)
        : secrets.clientSecret,
  }
  assertCredentialPair(resolved)

  let key
  try {
    key = loadEncryptionKey()
  } catch (error) {
    throw new PrestadorMuvConfigError(
      error instanceof Error ? error.message : 'Llave de cifrado SISPRO inválida.',
      500,
    )
  }
  const encrypted = {}
  for (const [name, column] of Object.entries(SECRET_COLUMNS)) {
    const next = secrets[name]
    if (next === undefined) {
      encrypted[column] = existing?.[column] ?? null
    } else if (next === null) {
      encrypted[column] = null
    } else {
      encrypted[column] = encryptSecret(next, key)
    }
  }

  return {
    providerType: PROVIDER_TYPE_INDEPENDIENTE,
    repsCode: reps.digits,
    nit: nit.digits,
    tipoDocumento,
    ambiente,
    apiBaseUrl: normalizeOptionalUrl(source.apiBaseUrl, existing?.apiBaseUrl, 'apiBaseUrl'),
    authUrl: normalizeOptionalUrl(source.authUrl, existing?.authUrl, 'authUrl'),
    validatePath: normalizeOptionalPath(source.validatePath, existing?.validatePath),
    activo: normalizeActivo(source.activo, existing?.activo),
    encryptionKeyVersion: SISPRO_ENCRYPTION_KEY_VERSION,
    encryptionAlgorithm: SISPRO_ENCRYPTION_ALGORITHM,
    ...encrypted,
  }
}

function cipherPresent(value) {
  return value?.length ? 'configured' : null
}

function normalizeActivo(value, existing) {
  if (value === undefined) return existing ?? true
  if (typeof value !== 'boolean') {
    throw new PrestadorMuvConfigError('activo debe ser verdadero o falso.')
  }
  return value
}

function normalizeOptionalUrl(value, existing, field) {
  if (value === undefined) return existing ?? null
  if (value === null || String(value).trim() === '') return null
  const trimmed = String(value).trim().replace(/\/$/, '')
  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new PrestadorMuvConfigError(`${field} debe ser una URL http(s).`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new PrestadorMuvConfigError(`${field} debe ser una URL http(s).`)
  }
  return trimmed
}

function normalizeOptionalPath(value, existing) {
  if (value === undefined) return existing ?? null
  if (value === null || String(value).trim() === '') return null
  const trimmed = String(value).trim()
  if (!trimmed.startsWith('/')) {
    throw new PrestadorMuvConfigError('validatePath debe comenzar con /.')
  }
  return trimmed
}

/**
 * DTO sin secretos. Solo indica si cada credencial está configurada.
 * @param {object | null} row
 */
export function toSafeDto(row) {
  if (!row) return null
  return {
    id: row.id,
    prestadorId: row.prestadorId,
    providerType: row.providerType,
    repsCode: row.repsCode,
    nit: row.nit,
    tipoDocumento: row.tipoDocumento,
    ambiente: row.ambiente,
    apiBaseUrl: row.apiBaseUrl,
    authUrl: row.authUrl,
    validatePath: row.validatePath,
    activo: row.activo,
    encryptionKeyVersion: row.encryptionKeyVersion,
    encryptionAlgorithm: row.encryptionAlgorithm,
    hasSisproUsuario: Boolean(row.sisproUsuarioCipher?.length),
    hasSisproClave: Boolean(row.sisproClaveCipher?.length),
    hasSisproClientId: Boolean(row.sisproClientIdCipher?.length),
    hasSisproClientSecret: Boolean(row.sisproClientSecretCipher?.length),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Descifra credenciales solo en memoria. No forma parte del DTO público.
 * @param {object | null} row
 * @param {Buffer} [key]
 */
export function getCredentials(row, key = loadEncryptionKey()) {
  if (!row) return null
  if (row.encryptionAlgorithm !== SISPRO_ENCRYPTION_ALGORITHM) {
    throw new PrestadorMuvConfigError('Algoritmo de cifrado SISPRO no soportado.', 500)
  }
  if (row.encryptionKeyVersion !== SISPRO_ENCRYPTION_KEY_VERSION) {
    throw new PrestadorMuvConfigError('Versión de llave SISPRO no soportada.', 500)
  }

  return {
    usuario: row.sisproUsuarioCipher ? decryptSecret(row.sisproUsuarioCipher, key) : null,
    clave: row.sisproClaveCipher ? decryptSecret(row.sisproClaveCipher, key) : null,
    clientId: row.sisproClientIdCipher ? decryptSecret(row.sisproClientIdCipher, key) : null,
    clientSecret: row.sisproClientSecretCipher
      ? decryptSecret(row.sisproClientSecretCipher, key)
      : null,
  }
}

async function upsertForPrestador(prisma, prestadorId, input) {
  const id = normalizePrestadorId(prestadorId)
  const existing = await prisma.prestadorMuvConfig.findUnique({
    where: { prestadorId: id },
  })
  const data = buildPrestadorMuvConfigData(input, existing)
  const record = await prisma.prestadorMuvConfig.upsert({
    where: { prestadorId: id },
    create: { prestadorId: id, ...data },
    update: data,
  })
  return record
}

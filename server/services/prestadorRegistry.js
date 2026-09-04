import { join } from 'node:path'
import { config } from '../config.js'
import { readDurableJson, writeDurableJson } from './durableStore.js'
import {
  namesCorrespond,
  razonSocialCorresponds,
  validatePrestadorIdentityFields,
} from '../../shared/prestadorIdentity.js'
import { extractRepsDigits } from '../../shared/repsCode.js'
import { parseRepsCodeWithDane } from './repsDane.js'
import { extractNitDigits } from '../../shared/nit.js'
import { normalizeRethusNumber } from '../../shared/rethusNumber.js'
import { isInstitutionProvider } from '../../shared/providerType.js'

const REGISTRY_FILE = join(config.dataDir, 'prestador-registry.json')
const STORE_KEY = 'prestador-registry'

function normalizeDocument(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function emptyRegistry() {
  return { records: [] }
}

async function loadRegistry() {
  const parsed = await readDurableJson(REGISTRY_FILE, emptyRegistry(), STORE_KEY)
  const records = Array.isArray(parsed.records) ? parsed.records : []
  return { records }
}

async function saveRegistry(registry) {
  await writeDurableJson(REGISTRY_FILE, registry, STORE_KEY)
}

/**
 * El código REPS es el identificador central de la sede.
 * IPS: NIT + razón social; varios odontólogos pueden vincularse con su ReTHUS.
 * Independiente: cédula + ReTHUS del profesional.
 */
export async function verifyAndClaimPrestador({
  userId,
  providerType,
  firstName,
  lastName,
  legalName,
  documentType,
  documentNumber,
  rethusNumber,
  repsCode,
  providerNit,
  clinicName,
}) {
  const fields = validatePrestadorIdentityFields({
    providerType,
    firstName,
    lastName,
    legalName,
    documentType,
    documentNumber,
    rethusNumber,
    repsCode,
    providerNit,
    clinicName,
  })
  if (!fields.valid) {
    return { ok: false, status: 400, error: fields.message }
  }

  const identity = fields.identity
  const repsDane = parseRepsCodeWithDane(identity.repsDisplay || identity.repsCode)
  if (!repsDane.valid) {
    return { ok: false, status: 400, error: repsDane.message }
  }
  const institution = isInstitutionProvider(identity.providerType)
  const document = normalizeDocument(identity.documentNumber)
  const reps = extractRepsDigits(identity.repsCode)
  const nit = extractNitDigits(identity.providerNit)
  const rethus = identity.rethusNumber ? normalizeRethusNumber(identity.rethusNumber) : ''
  const registry = await loadRegistry()
  const uid = String(userId ?? '')

  const belongsToUser = (record) => {
    if (!record) return false
    const ids = new Set((record.linkedUserIds ?? []).map(String))
    if (record.claimedByUserId) ids.add(String(record.claimedByUserId))
    return ids.has(uid)
  }

  const byReps = registry.records.find((item) => extractRepsDigits(item.repsCode) === reps)
  const byDocument = document
    ? registry.records.find((item) => normalizeDocument(item.documentNumber) === document)
    : null
  const byRethus = rethus
    ? registry.records.find((item) => normalizeRethusNumber(item.rethusNumber) === rethus)
    : null
  const updatingOwnSede = belongsToUser(byReps)

  if (byReps && !updatingOwnSede && extractNitDigits(byReps.providerNit) !== nit) {
    return {
      ok: false,
      status: 409,
      error: 'El NIT no corresponde al prestador habilitado con ese código REPS de sede.',
    }
  }

  if (institution) {
    if (
      byReps &&
      !updatingOwnSede &&
      byReps.legalName &&
      !razonSocialCorresponds(identity.legalName, byReps.legalName)
    ) {
      return {
        ok: false,
        status: 409,
        error:
          `La razón social no coincide con la IPS habilitada en el REPS ${byReps.repsDisplay || reps}.`,
      }
    }
  } else {
    if (!document || !rethus) {
      return {
        ok: false,
        status: 400,
        error: 'El profesional independiente debe registrar cédula y ReTHUS.',
      }
    }
    if (byReps && isInstitutionProvider(byReps.providerType) && extractNitDigits(byReps.providerNit) === nit) {
      // Odontólogo vinculado a la IPS: misma sede, identidad profesional propia.
    } else if (
      byReps &&
      !updatingOwnSede &&
      normalizeDocument(byReps.documentNumber) &&
      normalizeDocument(byReps.documentNumber) !== document
    ) {
      return {
        ok: false,
        status: 409,
        error:
          'El nombre y el documento no corresponden al código REPS de habilitación de esta sede.',
      }
    }
    if (
      byReps &&
      !updatingOwnSede &&
      byReps.legalName &&
      !isInstitutionProvider(byReps.providerType) &&
      !namesCorrespond(identity.legalName, byReps.legalName)
    ) {
      return {
        ok: false,
        status: 409,
        error: `El nombre digitado no coincide con el profesional habilitado en el REPS ${byReps.repsDisplay || reps}.`,
      }
    }
    if (byDocument && !belongsToUser(byDocument) && extractRepsDigits(byDocument.repsCode) !== reps) {
      const sameNit = extractNitDigits(byDocument.providerNit) === nit
      if (!sameNit) {
        return {
          ok: false,
          status: 409,
          error: 'Esta cédula ya está vinculada a otro prestador (NIT/REPS distinto).',
        }
      }
    }
    if (
      byRethus &&
      !belongsToUser(byRethus) &&
      normalizeDocument(byRethus.documentNumber) &&
      normalizeDocument(byRethus.documentNumber) !== document
    ) {
      return {
        ok: false,
        status: 409,
        error: 'El código ReTHUS ya está asociado a otro documento de identidad.',
      }
    }
    if (
      byDocument &&
      !belongsToUser(byDocument) &&
      byDocument.rethusNumber &&
      normalizeRethusNumber(byDocument.rethusNumber) !== rethus
    ) {
      return {
        ok: false,
        status: 409,
        error: 'El ReTHUS no corresponde a esta cédula de talento humano en salud.',
      }
    }
  }

  const sedeOwner = String(byReps?.claimedByUserId || '')
  const linked = new Set(byReps?.linkedUserIds ?? [])
  if (sedeOwner) linked.add(sedeOwner)
  const isLinked = !sedeOwner || sedeOwner === uid || linked.has(uid)
  if (sedeOwner && !isLinked && extractNitDigits(byReps.providerNit) !== nit) {
    return {
      ok: false,
      status: 409,
      error: 'Esta sede REPS ya está reclamada por otra cuenta.',
    }
  }
  linked.add(uid)

  const now = new Date().toISOString()
  const record = {
    providerType: byReps?.providerType === 'institucion' ? 'institucion' : identity.providerType,
    claimedByUserId: sedeOwner || userId,
    linkedUserIds: [...linked],
    legalName: identity.legalName || byReps?.legalName,
    firstName: identity.firstName,
    lastName: identity.lastName,
    documentNumber: document || byReps?.documentNumber || '',
    rethusNumber: rethus || byReps?.rethusNumber || '',
    repsCode: reps,
    repsDisplay: identity.repsDisplay,
    providerNit: nit,
    providerNitDisplay: identity.providerNitDisplay,
    clinicName: identity.clinicName,
    claimedAt: byReps?.claimedAt || now,
    updatedAt: now,
  }

  const next = registry.records.filter((item) => extractRepsDigits(item.repsCode) !== reps)
  next.push(record)
  await saveRegistry({ records: next })

  return { ok: true, record, identity }
}

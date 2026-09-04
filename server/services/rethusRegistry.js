import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from '../config.js'
import { normalizeRethusNumber, validateRethusNumberFormat } from '../../shared/rethusNumber.js'

const REGISTRY_FILE = join(config.dataDir, 'rethus-registry.json')

const SEED_RECORDS = [
  {
    documentNumber: '79456123',
    rethusNumber: 'THS-1100123456',
    nombre: 'Odontólogo habilitado (directorio THS)',
  },
  {
    documentNumber: '52123456',
    rethusNumber: 'THS-1100654321',
    nombre: 'Odontóloga habilitada (directorio THS)',
  },
  {
    documentNumber: '1018482736',
    rethusNumber: 'THS-0500198765',
    nombre: 'Odontólogo habilitado (directorio THS)',
  },
  {
    documentNumber: '1234567890',
    rethusNumber: '438265',
    nombre: 'Odontólogo (ejemplo verificado RETHUS)',
  },
]

export { normalizeRethusNumber }

export function normalizeDocumentNumber(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function emptyRegistry() {
  return { records: SEED_RECORDS.map((item) => ({ ...item, claimedByUserId: null })) }
}

async function loadRegistry() {
  try {
    const parsed = JSON.parse(await readFile(REGISTRY_FILE, 'utf8'))
    const records = Array.isArray(parsed.records) ? parsed.records : []
    if (records.length === 0) return emptyRegistry()
    const byKey = new Map(
      records.map((item) => [`${normalizeDocumentNumber(item.documentNumber)}|${normalizeRethusNumber(item.rethusNumber)}`, item]),
    )
    for (const seed of SEED_RECORDS) {
      const key = `${seed.documentNumber}|${seed.rethusNumber}`
      if (!byKey.has(key)) {
        records.push({ ...seed, claimedByUserId: null })
      }
    }
    return { records }
  } catch {
    return emptyRegistry()
  }
}

async function saveRegistry(registry) {
  await mkdir(config.dataDir, { recursive: true })
  await writeFile(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf8')
}

export function describeRethusFormatError(documentNumber, rethusNumber) {
  const document = normalizeDocumentNumber(documentNumber)
  if (document.length < 6 || document.length > 12) {
    return 'El número de documento debe tener entre 6 y 12 dígitos.'
  }
  const rethus = validateRethusNumberFormat(rethusNumber)
  if (!rethus.valid) return rethus.message
  return null
}

export async function validateRethusAssociation({ documentNumber, rethusNumber, userId }) {
  const formatError = describeRethusFormatError(documentNumber, rethusNumber)
  if (formatError) {
    return { ok: false, status: 400, error: formatError }
  }

  const document = normalizeDocumentNumber(documentNumber)
  const rethus = normalizeRethusNumber(rethusNumber)
  const registry = await loadRegistry()

  const sameDocument = registry.records.filter((item) => normalizeDocumentNumber(item.documentNumber) === document)
  const sameRethus = registry.records.filter((item) => normalizeRethusNumber(item.rethusNumber) === rethus)
  const exact = registry.records.find(
    (item) =>
      normalizeDocumentNumber(item.documentNumber) === document &&
      normalizeRethusNumber(item.rethusNumber) === rethus,
  )

  if (sameDocument.length > 0 && !exact) {
    return {
      ok: false,
      status: 409,
      error: 'El número ReTHUS no está asociado a este documento de identidad.',
    }
  }
  if (sameRethus.length > 0 && !exact) {
    return {
      ok: false,
      status: 409,
      error: 'Ese ReTHUS ya está vinculado a otro documento de identidad.',
    }
  }
  if (!exact) {
    return {
      ok: false,
      status: 404,
      error: 'No se encontró un registro ReTHUS activo para ese documento. Verifique los datos en el directorio de talento humano en salud.',
    }
  }

  const claimedBy = exact.claimedByUserId ? String(exact.claimedByUserId) : ''
  if (claimedBy && claimedBy !== String(userId ?? '')) {
    return {
      ok: false,
      status: 409,
      error: 'Este ReTHUS ya fue utilizado para activar una prueba en otra cuenta.',
    }
  }

  return { ok: true, record: exact, document, rethus, registry }
}

export async function claimRethusForUser({ documentNumber, rethusNumber, userId }) {
  const result = await validateRethusAssociation({ documentNumber, rethusNumber, userId })
  if (!result.ok) return result

  const registry = result.registry
  registry.records = registry.records.map((item) => {
    const matches =
      normalizeDocumentNumber(item.documentNumber) === result.document &&
      normalizeRethusNumber(item.rethusNumber) === result.rethus
    if (!matches) return item
    return { ...item, claimedByUserId: userId, claimedAt: new Date().toISOString() }
  })
  await saveRegistry(registry)
  return { ok: true, document: result.document, rethus: result.rethus }
}

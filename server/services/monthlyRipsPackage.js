/**
 * Empaqueta RIPS pendientes (numFactura null) por odontólogo para el envío mensual.
 */
const SERVICE_KEYS = [
  'consultas',
  'procedimientos',
  'urgencias',
  'hospitalizacion',
  'recienNacidos',
  'medicamentos',
  'otrosServicios',
]

function emptyServicios() {
  return {
    consultas: [],
    procedimientos: [],
    urgencias: [],
    hospitalizacion: [],
    recienNacidos: [],
    medicamentos: [],
    otrosServicios: [],
  }
}

export function odontologoKey(record) {
  return String(
    record?.professionalId || record?.clinicId || record?.numDocumentoIdObligado || 'sin-odontologo',
  ).trim() || 'sin-odontologo'
}

function patientKey(usuario) {
  return `${String(usuario?.tipoDocumentoIdentificacion ?? '').trim()}|${String(usuario?.numDocumentoIdentificacion ?? '').trim()}`
}

function mergeServicios(left = {}, right = {}) {
  const merged = emptyServicios()
  for (const key of SERVICE_KEYS) {
    const items = [...(left[key] ?? []), ...(right[key] ?? [])]
    merged[key] = items.map((item, index) => ({ ...item, consecutivo: index + 1 }))
  }
  return merged
}

/**
 * Agrupa registros pendientes por odontólogo y arma el JSON RIPS Res. 2275
 * (numFactura siempre null) listo para el API del Ministerio.
 * @param {object[]} records
 * @returns {Array<{ odontologoId: string, recordIds: string[], rips: object }>}
 */
export function groupPendingRipsByOdontologo(records) {
  const groups = new Map()
  for (const record of records ?? []) {
    const key = odontologoKey(record)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }

  return [...groups.entries()].map(([odontologoId, items]) => ({
    odontologoId,
    recordIds: items.map((item) => item.id),
    clinicId: items[0]?.clinicId ?? null,
    professionalId: items[0]?.professionalId ?? null,
    rips: buildMonthlyRipsJson(items),
  }))
}

export function buildMonthlyRipsJson(records) {
  const first = records[0]?.ripsJson ?? {}
  const byPatient = new Map()

  for (const record of records) {
    for (const usuario of record.ripsJson?.usuarios ?? []) {
      const key = patientKey(usuario)
      if (!key || key === '|') continue
      const previous = byPatient.get(key)
      if (!previous) {
        byPatient.set(key, {
          ...usuario,
          servicios: mergeServicios(emptyServicios(), usuario.servicios),
        })
      } else {
        previous.servicios = mergeServicios(previous.servicios, usuario.servicios)
      }
    }
  }

  const usuarios = [...byPatient.values()].map((usuario, index) => ({
    ...usuario,
    consecutivo: index + 1,
  }))

  return {
    numDocumentoIdObligado: String(
      first.numDocumentoIdObligado || records[0]?.numDocumentoIdObligado || '',
    ).trim(),
    numFactura: null,
    tipoNota: null,
    numNota: null,
    usuarios,
  }
}

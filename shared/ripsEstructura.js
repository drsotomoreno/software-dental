/**
 * Ajusta el JSON RIPS a la estructura que valida el MUV (RVG01).
 * Un arreglo vacío o un código fuera de catálogo se rechaza completo
 * con «Solo se podrá validar los RIPS si cumplen con la estructura establecida»,
 * antes de revisar el contenido clínico.
 */

const GRUPOS_SERVICIO = [
  'consultas',
  'procedimientos',
  'urgencias',
  'hospitalizacion',
  'recienNacidos',
  'medicamentos',
  'otrosServicios',
]

/** Campos del odontograma. No existen en el anexo técnico. */
const CAMPOS_FUERA_DE_ESQUEMA = ['piezaDental', 'cuadranteFdi', 'arcada']

/** El MUV rechaza estos nombres en procedimiento (RVG01, propiedad no permitida). */
const NOMBRES_CIE11_FUERA_DE_PROCEDIMIENTO = [
  'nomCodDiagnosticoPrincipalCIE11',
  'nomCodDiagnosticoRelacionadoCIE11',
  'nomComplicacionCIE11',
]

const CIE11_PROCEDIMIENTO = [
  'codDiagnosticoPrincipalCIE11',
  'codDiagnosticoRelacionadoCIE11',
  'codComplicacionCIE11',
]

/** LstSiNo. El ejemplo antiguo «02» no está en el catálogo vigente. */
export function incapacidadMuv(value) {
  const raw = String(value ?? '').trim().toUpperCase()
  if (raw === 'SI' || raw === '01') return 'SI'
  return 'NO'
}

function servicioDeGrupo(grupo, item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item
  const copia = { ...item }
  for (const campo of CAMPOS_FUERA_DE_ESQUEMA) delete copia[campo]
  if (grupo === 'procedimientos') {
    for (const campo of NOMBRES_CIE11_FUERA_DE_PROCEDIMIENTO) delete copia[campo]
    if (copia.codigoVIDA == null) copia.codigoVIDA = ''
    for (const campo of CIE11_PROCEDIMIENTO) {
      if (copia[campo] == null) copia[campo] = ''
    }
  }
  return copia
}

function serviciosMuv(servicios) {
  const origen = servicios && typeof servicios === 'object' ? servicios : {}
  const salida = { ...origen }
  for (const grupo of GRUPOS_SERVICIO) {
    const items = salida[grupo]
    if (!Array.isArray(items) || items.length === 0) {
      salida[grupo] = null
      continue
    }
    salida[grupo] = items.map((item) => servicioDeGrupo(grupo, item))
  }
  return salida
}

function usuarioMuv(usuario) {
  if (!usuario || typeof usuario !== 'object') return usuario
  return {
    ...usuario,
    incapacidad: incapacidadMuv(usuario.incapacidad),
    servicios: serviciosMuv(usuario.servicios),
  }
}

/**
 * @param {object | null | undefined} rips
 * @returns {object | null | undefined}
 */
export function normalizarEstructuraRips(rips) {
  if (!rips || typeof rips !== 'object' || Array.isArray(rips)) return rips
  return {
    ...rips,
    usuarios: Array.isArray(rips.usuarios) ? rips.usuarios.map(usuarioMuv) : rips.usuarios,
  }
}

/** CargarRipsSinFactura: sin estos campos el MUV responde RVG06. numFactura va en null. */
export function completarRipsSinFactura(rips) {
  if (!rips || typeof rips !== 'object' || Array.isArray(rips)) return rips
  const ripsData = { ...rips }
  ripsData.numFactura = null
  ripsData.tipoNota = ripsData.tipoNota || 'RS'
  ripsData.numNota = ripsData.numNota || `NOTA-${Date.now()}`
  return ripsData
}

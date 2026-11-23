/**
 * Ajusta el JSON RIPS a la estructura que valida el MUV (RVG01).
 * Un arreglo vacío o un código fuera de catálogo se rechaza completo
 * con «Solo se podrá validar los RIPS si cumplen con la estructura establecida»,
 * antes de revisar el contenido clínico.
 *
 * Capa de salida canónica: `prepararRipsParaSalida` (descarga JSON + HTTP MUV).
 */

import { applySinFacturaBillingContract } from './canonicalEvolutionRips.js'

const GRUPOS_SERVICIO = [
  'consultas',
  'procedimientos',
  'urgencias',
  'hospitalizacion',
  'recienNacidos',
  'medicamentos',
  'otrosServicios',
]

/** Grupos donde se limpian cadenas vacías → null (salvo campos RVG01 que exigen ""). */
const GRUPOS_STRING_NULL = ['consultas', 'procedimientos', 'medicamentos', 'otrosServicios']

/** Campos del odontograma. No existen en el anexo técnico. */
const CAMPOS_FUERA_DE_ESQUEMA = ['piezaDental', 'cuadranteFdi', 'arcada']

/** El MUV rechaza estos nombres en procedimiento (RVG01, propiedad no permitida). */
const NOMBRES_CIE11_FUERA_DE_PROCEDIMIENTO = [
  'nomCodDiagnosticoPrincipalCIE11',
  'nomCodDiagnosticoRelacionadoCIE11',
  'nomComplicacionCIE11',
]

/**
 * RVG01: nulos/ausentes → "". El MUV rechaza null en estos campos de procedimiento.
 * No convertir "" → null aquí (rompería CargarRipsSinFactura / CargarFevRips).
 */
const CIE11_PROCEDIMIENTO_OBLIGA_STRING_VACIO = [
  'codDiagnosticoPrincipalCIE11',
  'codDiagnosticoRelacionadoCIE11',
  'codComplicacionCIE11',
  'codigoVIDA',
]

/** LstSiNo. El ejemplo antiguo «02» no está en el catálogo vigente. */
export function incapacidadMuv(value) {
  const raw = String(value ?? '').trim().toUpperCase()
  if (raw === 'SI' || raw === '01') return 'SI'
  return 'NO'
}

/**
 * Regla global de salida: tipoNota RS + numNota legado (guiones/espacios/NOTA-) → RS+dígitos.
 * Ej. "NOTA-1795395067449" → "RS1795395067449"
 *
 * @param {object | null | undefined} rips
 * @returns {object | null | undefined}
 */
export function sanitizarNumNotaLegado(rips) {
  if (!rips || typeof rips !== 'object' || Array.isArray(rips)) return rips
  if (String(rips.tipoNota ?? '').trim() !== 'RS') return rips

  const raw = String(rips.numNota ?? '')
  if (!raw) return rips

  const legado = /[\s-]/.test(raw) || /^NOTA-/i.test(raw.trim())
  if (!legado) return rips

  return {
    ...rips,
    numNota: `RS${raw.replace(/[^a-zA-Z0-9]/g, '').replace(/^NOTA/i, '')}`,
  }
}

/**
 * Convierte "" → null en ítems de servicio, excepto campos RVG01 que deben quedar en "".
 * @param {object} item
 * @param {string} grupo
 */
function vaciosANullEnServicio(item, grupo) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item
  const copia = { ...item }
  for (const [clave, valor] of Object.entries(copia)) {
    if (valor !== '') continue
    if (
      grupo === 'procedimientos' &&
      CIE11_PROCEDIMIENTO_OBLIGA_STRING_VACIO.includes(clave)
    ) {
      continue
    }
    copia[clave] = null
  }
  return copia
}

function servicioDeGrupo(grupo, item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item
  let copia = { ...item }
  for (const campo of CAMPOS_FUERA_DE_ESQUEMA) delete copia[campo]
  if (grupo === 'procedimientos') {
    for (const campo of NOMBRES_CIE11_FUERA_DE_PROCEDIMIENTO) delete copia[campo]
    if (copia.codigoVIDA == null) copia.codigoVIDA = ''
    for (const campo of CIE11_PROCEDIMIENTO_OBLIGA_STRING_VACIO) {
      if (campo === 'codigoVIDA') continue
      if (copia[campo] == null) copia[campo] = ''
    }
  }
  if (GRUPOS_STRING_NULL.includes(grupo)) {
    copia = vaciosANullEnServicio(copia, grupo)
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
  return sanitizarNumNotaLegado({
    ...rips,
    usuarios: Array.isArray(rips.usuarios) ? rips.usuarios.map(usuarioMuv) : rips.usuarios,
  })
}

/** CargarRipsSinFactura: sin estos campos el MUV responde RVG06. numFactura va en null. */
export function completarRipsSinFactura(rips) {
  return sanitizarNumNotaLegado(applySinFacturaBillingContract(rips, Date.now()))
}

/**
 * Capa única de salida (Descargar JSON + Enviar/Reintentar MUV).
 * Normaliza RVG01, aplica contrato sin factura cuando corresponde y corrige numNota legado.
 *
 * @param {object | null | undefined} rips
 * @param {{ sinFactura?: boolean }} [options]
 * @returns {object | null | undefined}
 */
export function prepararRipsParaSalida(rips, options = {}) {
  let out = normalizarEstructuraRips(rips)
  const forzarSinFactura = options.sinFactura === true
  const pareceSinFactura =
    out &&
    typeof out === 'object' &&
    (out.numFactura == null || out.numFactura === '') &&
    (out.tipoNota == null || String(out.tipoNota).trim() === '' || String(out.tipoNota).trim() === 'RS')
  if (forzarSinFactura || pareceSinFactura) {
    out = completarRipsSinFactura(out)
    out = normalizarEstructuraRips(out)
  } else {
    out = sanitizarNumNotaLegado(out)
  }
  return out
}

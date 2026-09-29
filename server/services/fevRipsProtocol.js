/**
 * Contrato REST FEV-RIPS (Manual API-Docker FEV-RIPS v4.3, MinSalud / SISPRO).
 * Funciones puras: no abren red ni leen credenciales del entorno.
 */

export const FEVRIPS_PRODUCTION_BASE_URL = 'https://fevrips.sispro.gov.co'

export const FEVRIPS_PATHS = {
  login: '/api/Auth/LoginSISPRO',
  cargarFevRips: '/api/PaquetesFevRips/CargarFevRips',
  cargarNc: '/api/PaquetesFevRips/CargarNC',
  cargarNd: '/api/PaquetesFevRips/CargarND',
  cargarNotaAjuste: '/api/PaquetesFevRips/CargarNotaAjuste',
  cargarRipsSinFactura: '/api/PaquetesFevRips/CargarRipsSinFactura',
}

/** Tipos de documento de la persona que inicia sesión en SISPRO. */
const DOCUMENT_TYPES = new Set(['CC', 'CE', 'PA', 'TI', 'RC', 'CD', 'SC', 'PE', 'PT', 'NV', 'NIT', 'NI'])

/** tipoUsuario del login: solo estos códigos. "NIT" no es un tipoUsuario. */
const MECANISMO_USUARIO = new Set(['RE', 'PIN', 'PINX', 'PIE'])

const RS_NOTA_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,3}\d{1,20}$/

let notaSequence = 0

function mecanismoCodigo(value) {
  if (value === 'PINX') return 'PINx'
  return value
}

/**
 * Separa el tipo de documento (CC, NIT, …) del tipoUsuario SISPRO (RE, PIN, PINx, PIE).
 * El bosquejo de integración usa tipoUsuario: "NIT"; en el login ese valor va en persona.identificacion.tipo.
 * @param {object} [input]
 * @param {object} [rips]
 */
export function resolveCredenciales(input = {}, rips) {
  const rawTipo = String(input.tipoUsuario ?? '').trim().toUpperCase()
  let tipoDocumento = String(input.tipoDocumento ?? '').trim().toUpperCase()
  let tipoMecanismo = ''

  if (MECANISMO_USUARIO.has(rawTipo)) {
    tipoMecanismo = mecanismoCodigo(rawTipo)
  } else if (DOCUMENT_TYPES.has(rawTipo)) {
    tipoDocumento = rawTipo === 'NI' ? 'NIT' : rawTipo
  }

  if (!tipoDocumento) tipoDocumento = tipoMecanismo ? 'CC' : 'NIT'
  if (tipoDocumento === 'NI') tipoDocumento = 'NIT'

  const numeroDocumento = String(
    input.numeroDocumento ?? input.numDocumento ?? '',
  ).trim()
  const nitObligado = String(
    input.nitObligado ?? input.nit ?? rips?.numDocumentoIdObligado ?? '',
  ).trim()
  const clave = String(input.clave ?? input.password ?? '').trim()

  return { tipoDocumento, numeroDocumento, nitObligado, clave, tipoMecanismo }
}

/**
 * Cuerpo de LoginSISPRO. La clave viaja solo en el body de la petición, nunca en logs.
 * @param {ReturnType<typeof resolveCredenciales>} credenciales
 */
export function buildLoginSisproBody(credenciales) {
  const body = {
    persona: {
      identificacion: {
        tipo: credenciales.tipoDocumento,
        numero: credenciales.numeroDocumento,
      },
    },
    clave: credenciales.clave,
    nit: credenciales.nitObligado,
    tipoMecanismoValidacion: 0,
    reps: true,
  }
  if (credenciales.tipoMecanismo) body.tipoUsuario = credenciales.tipoMecanismo
  return body
}

/**
 * Consecutivo de nota RS: prefijo RS + dígitos, sin guiones (Res. 2275).
 * @param {number} [now]
 */
export function nextNumNotaRs(now = Date.now()) {
  notaSequence = (notaSequence + 1) % 1000
  const digits = `${now}${String(notaSequence).padStart(3, '0')}`.slice(-18)
  return `RS${digits}`
}

/**
 * Modalidad RIPS sin factura: numFactura null, tipoNota RS, numNota único, sin XML.
 * Si el paquete ya trae RS y numNota, se conserva para que un reintento no cambie el consecutivo.
 * @param {object} rips
 * @param {{ numNota?: string }} [options]
 */
export function prepararRipsSinFactura(rips, options = {}) {
  const source = rips && typeof rips === 'object' ? rips : {}
  const tipo = String(source.tipoNota ?? '').trim().toUpperCase()
  const existingNota = String(source.numNota ?? '').trim()
  const requested = String(options.numNota ?? '').trim()
  let numNota = requested || nextNumNotaRs()
  if (tipo === 'RS' && existingNota) numNota = existingNota
  if (!RS_NOTA_PATTERN.test(numNota)) numNota = nextNumNotaRs()

  return {
    ...source,
    numFactura: null,
    tipoNota: 'RS',
    numNota,
  }
}

function mapServicio(item) {
  if (!item || typeof item !== 'object') return item
  const next = { ...item }
  if (!next.modalidadGrupoServicioTecSal && next.modalidadGrupoServicioTecnologia) {
    next.modalidadGrupoServicioTecSal = next.modalidadGrupoServicioTecnologia
  }
  delete next.modalidadGrupoServicioTecnologia
  return next
}

/**
 * Ajusta alias que no acepta el MUV (p. ej. modalidadGrupoServicioTecnologia).
 * @param {object} rips
 */
export function normalizarCamposRips(rips) {
  const usuarios = Array.isArray(rips?.usuarios) ? rips.usuarios : []
  return {
    ...rips,
    usuarios: usuarios.map((usuario) => {
      const servicios = usuario?.servicios ?? {}
      const mapped = {}
      for (const [key, value] of Object.entries(servicios)) {
        mapped[key] = Array.isArray(value) ? value.map(mapServicio) : value
      }
      return { ...usuario, servicios: mapped }
    }),
  }
}

/**
 * @param {object} rips
 * @param {string | null | undefined} xmlFev
 */
export function resolverOperacionFevRips(rips, xmlFev) {
  const tipo = String(rips?.tipoNota ?? '').trim().toUpperCase()
  const sinFactura = rips?.numFactura == null || String(rips?.numFactura).trim() === '' || tipo === 'RS'
  if (sinFactura) {
    return {
      path: FEVRIPS_PATHS.cargarRipsSinFactura,
      modulo: 'RipsSinFactura',
      sinFactura: true,
    }
  }
  if (tipo === 'NC') {
    return { path: FEVRIPS_PATHS.cargarNc, modulo: 'NotaCredito', sinFactura: false }
  }
  if (tipo === 'ND') {
    return { path: FEVRIPS_PATHS.cargarNd, modulo: 'NotaDebito', sinFactura: false }
  }
  if (tipo === 'NA') {
    return { path: FEVRIPS_PATHS.cargarNotaAjuste, modulo: 'NotaAjuste', sinFactura: false }
  }
  return {
    path: FEVRIPS_PATHS.cargarFevRips,
    modulo: 'FacturaElectronica',
    sinFactura: false,
    xmlPresent: Boolean(xmlFev),
  }
}

/**
 * XML de la FEV en Base64. Vacío en modalidad RS.
 * @param {string | null | undefined} xmlFev
 */
export function encodeXmlFevFile(xmlFev) {
  const value = String(xmlFev ?? '').trim()
  if (!value) return ''
  if (value.startsWith('<')) return Buffer.from(value, 'utf8').toString('base64')
  return value
}

/**
 * Arma el JSON { rips, xmlFevFile } del manual. En RS xmlFevFile va vacío aunque se pase XML.
 * @param {object} rips
 * @param {string | null | undefined} [xmlFev]
 */
export function buildFevRipsRequestBody(rips, xmlFev) {
  const preview = resolverOperacionFevRips(rips, xmlFev)
  if (!preview.sinFactura && !String(xmlFev ?? '').trim()) {
    return {
      error:
        'CargarFevRips exige el XML de la FEV (AttachedDocument en Base64). ' +
        'En modalidad RS (sin factura) omita xmlFev y deje numFactura en null.',
    }
  }

  const ripsEnvio = preview.sinFactura ? prepararRipsSinFactura(rips) : { ...rips }
  const operacion = resolverOperacionFevRips(ripsEnvio, xmlFev)
  return {
    operacion,
    body: {
      rips: normalizarCamposRips(ripsEnvio),
      xmlFevFile: operacion.sinFactura ? '' : encodeXmlFevFile(xmlFev),
    },
  }
}

export function extractCuv(payload) {
  if (!payload || typeof payload !== 'object') return null
  const raw =
    payload.CodigoUnicoValidacion ??
    payload.codigoUnicoValidacion ??
    payload.CUV ??
    payload.cuv ??
    null
  if (raw == null) return null
  const cuv = String(raw).replace(/\s+/g, '')
  if (!cuv || /noaplica/i.test(cuv)) return null
  return cuv
}

function validationRows(payload) {
  const rows =
    payload?.ResultadosValidacion ??
    payload?.resultadosValidacion ??
    payload?.Errores ??
    payload?.errores ??
    []
  return Array.isArray(rows) ? rows : []
}

/**
 * Clasifica la respuesta del MUV. Las notificaciones no impiden el CUV.
 * @param {object} payload
 */
export function classifyMinistryResponse(payload) {
  const rows = validationRows(payload).map((item) => ({
    clase: String(item?.Clase ?? item?.clase ?? '').toUpperCase(),
    code: item?.Codigo ?? item?.codigo ?? item?.code,
    field: item?.PathFuente ?? item?.pathFuente ?? item?.Campo ?? item?.field,
    message:
      item?.Descripcion ??
      item?.descripcion ??
      item?.Observaciones ??
      item?.observaciones ??
      item?.message ??
      'Error de validación',
    observaciones: item?.Observaciones ?? item?.observaciones ?? '',
  }))

  const rechazos = rows.filter((item) => item.clase === 'RECHAZADO' || item.clase === 'RECHAZO')
  const notificaciones = rows.filter((item) => item.clase === 'NOTIFICACION')
  const resultState = payload?.ResultState ?? payload?.resultState
  const approvedFlag = resultState === true || resultState === 'true'
  const cuv = extractCuv(payload)

  return {
    approved: Boolean(approvedFlag && cuv),
    cuv,
    procesoId: payload?.ProcesoId ?? payload?.procesoId ?? null,
    numFactura: payload?.NumFactura ?? payload?.numFactura ?? null,
    fechaRadicacion: payload?.FechaRadicacion ?? payload?.fechaRadicacion ?? null,
    modulo: payload?.Modulo ?? payload?.modulo ?? null,
    ambiente: payload?.Ambiente ?? payload?.ambiente ?? null,
    rutaArchivos: payload?.RutaArchivos ?? payload?.rutaArchivos ?? null,
    rechazos,
    notificaciones,
    ministryErrors: rechazos.length > 0 ? rechazos : approvedFlag ? [] : rows,
  }
}

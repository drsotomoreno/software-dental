import { randomBytes } from 'node:crypto'
import { config } from '../config.js'
import {
  credencialesCompletas,
  credencialesCorporativasDesdeSesion,
  obtenerTokenMultiusuario,
} from './minsaludAuth.js'
import { normalizeRipsNumFactura } from '../../shared/fiscalProfile.js'

/** Ambiente de pruebas FEV-RIPS cuando no hay URL propia en la configuración. */
const MSPS_BASE_URL_DEFAULT = 'https://stage-fevrips.sispro.gov.co'

/** RIPS sin factura electrónica (profesional no obligado). */
export const TIPO_NOTA_RIPS_SIN_FACTURA = 'RS'

function mspsBaseUrl() {
  return String(config.minsalud.apiBaseUrl || MSPS_BASE_URL_DEFAULT).replace(/\/$/, '')
}

/**
 * Un paquete es sin factura cuando ya viene marcado como RS,
 * cuando el flujo lo declara temporal, o cuando no hay FEV ni nota crédito/débito.
 * @param {object} [rips]
 * @param {object} [metadatos]
 */
export function esPaqueteSinFactura(rips, metadatos = {}) {
  if (rips?.tipoNota === TIPO_NOTA_RIPS_SIN_FACTURA) return true
  if (metadatos.esRipsTemporal === true || metadatos.allowNullNumFactura === true) return true
  if (rips?.tipoNota) return false
  return normalizeRipsNumFactura(rips?.numFactura) == null
}

/**
 * Copia lista para el Ministerio: los RIPS sin factura salen con tipoNota RS.
 * @param {object} rips
 * @param {object} [metadatos]
 */
export function prepararPayloadTransmision(rips, metadatos = {}) {
  if (!esPaqueteSinFactura(rips, metadatos)) {
    return { payloadRips: rips, esSinFactura: false }
  }
  return {
    esSinFactura: true,
    payloadRips: {
      ...(rips && typeof rips === 'object' ? rips : {}),
      numFactura: null,
      tipoNota: TIPO_NOTA_RIPS_SIN_FACTURA,
      numNota: null,
    },
  }
}

function cuvSandbox() {
  const segment = () => randomBytes(4).toString('hex').toUpperCase()
  return `CUV-${segment()}-${segment()}-${segment()}`
}

/**
 * Cierra el envío de la historia con el prestador de la sesión.
 * No usa credenciales enviadas por el navegador.
 *
 * @param {{ user: object, clinica?: object, payloadRips: object, xmlFev?: string }} params
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function transmitirRipsDeLaSesion({ user, clinica, payloadRips, xmlFev }) {
  if (!payloadRips || typeof payloadRips !== 'object') {
    return { status: 400, body: { success: false, error: 'El cuerpo debe incluir payloadRips.' } }
  }

  const credencialesPrestador = credencialesCorporativasDesdeSesion(user, clinica)
  if (!credencialesCompletas(credencialesPrestador)) {
    return {
      status: 400,
      body: {
        success: false,
        error:
          'El perfil del prestador autenticado no tiene NIT para transmitir al Ministerio. Complételo en el perfil de la clínica.',
      },
    }
  }

  const preparado = prepararPayloadTransmision(payloadRips)
  if (config.minsalud.sandbox) {
    const esSinFactura = preparado.esSinFactura
    return {
      status: 200,
      body: {
        success: true,
        data: {
          estado: 'APROBADO',
          CUV: cuvSandbox(),
          ProcesoId: `PROC-${Date.now()}`,
          source: 'sandbox',
        },
        mensaje: esSinFactura
          ? 'RIPS sin factura (RS) transmitido exitosamente.'
          : 'FEV + RIPS transmitidos exitosamente.',
      },
    }
  }

  const resultado = await transmitirRipsMultiusuario(
    preparado.payloadRips,
    credencialesPrestador,
    preparado.esSinFactura ? undefined : xmlFev,
  )
  return { status: resultado.success ? 200 : 400, body: resultado }
}

/**
 * Transmite un paquete RIPS (con FEV o sin factura RS) al Ministerio
 * usando el token vigente del NIT del prestador que firma la atención.
 *
 * @param {object} payloadRips
 * @param {{ tipoUsuario: string, numeroDocumento: string, nitObligado: string }} credenciales
 * @param {string} [xmlFev] XML de la FEV. Obligatorio si el paquete no es RS.
 * @returns {Promise<{ success: true, data: object, mensaje: string } | { success: false, error: unknown }>}
 */
export async function transmitirRipsMultiusuario(payloadRips, credenciales, xmlFev) {
  try {
    const token = await obtenerTokenMultiusuario(credenciales)
    const formData = new FormData()
    const esSinFactura = payloadRips?.tipoNota === TIPO_NOTA_RIPS_SIN_FACTURA

    if (!esSinFactura && xmlFev) {
      formData.append('fev', new Blob([xmlFev], { type: 'application/xml' }), 'factura.xml')
    } else if (!esSinFactura && !xmlFev) {
      throw new Error('Se requiere el XML de la FEV para transacciones vinculadas a factura.')
    }

    const nombreJson = esSinFactura ? 'rips_sin_factura.json' : 'rips.json'
    formData.append(
      'rips',
      new Blob([JSON.stringify(payloadRips)], { type: 'application/json' }),
      nombreJson,
    )

    const validatePath = config.minsalud.validatePath || '/api/v1/validar'
    const response = await fetch(`${mspsBaseUrl()}${validatePath.startsWith('/') ? validatePath : `/${validatePath}`}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body: formData,
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(
        data?.mensaje || data?.message || response.statusText || 'El Ministerio rechazó la transmisión.',
      )
      error.response = { data }
      throw error
    }

    return {
      success: true,
      data,
      mensaje: esSinFactura
        ? 'RIPS sin factura (RS) transmitido exitosamente.'
        : 'FEV + RIPS transmitidos exitosamente.',
    }
  } catch (error) {
    return {
      success: false,
      error: error?.response?.data || error?.message || 'No se pudo transmitir el paquete al Ministerio.',
    }
  }
}

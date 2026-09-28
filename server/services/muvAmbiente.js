import { config } from '../config.js'
import {
  HOST_MUV_PRODUCCION,
  HOST_STAGE_FEVRIPS,
  hostMuvPorAmbiente,
  normalizarAmbiente,
} from '../../shared/ministerioSesion.js'

/**
 * Ambiente del MUV. Pruebas (serie 5.x) usa stage-fevrips;
 * producción usa el MUV real. La URL base se puede reemplazar por entorno.
 */
export function resolveMuvAmbiente() {
  const id = normalizarAmbiente(process.env.MINSALUD_AMBIENTE ?? config.minsalud.ambiente ?? 'pruebas')
  const porAmbiente =
    id === 'produccion'
      ? process.env.MINSALUD_API_BASE_URL_PRODUCCION
      : process.env.MINSALUD_API_BASE_URL_PRUEBAS
  const apiBaseUrl = (porAmbiente || config.minsalud.apiBaseUrl || hostMuvPorAmbiente(id)).replace(
    /\/$/,
    '',
  )

  return {
    id,
    etiqueta: id === 'produccion' ? 'Producción' : 'Pruebas (Serie 5.x)',
    serie: id === 'pruebas' ? '5.x' : null,
    apiBaseUrl,
    authPath: config.minsalud.authPath || '/api/Auth/LoginSISPRO',
    cargarPath: config.minsalud.validatePath || '/api/PaquetesFevRips/CargarFevRips',
    hostOficial: id === 'produccion' ? HOST_MUV_PRODUCCION : HOST_STAGE_FEVRIPS,
    hostPruebas: HOST_STAGE_FEVRIPS,
    hostProduccion: HOST_MUV_PRODUCCION,
  }
}

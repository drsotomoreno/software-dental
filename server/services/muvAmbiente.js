import { config } from '../config.js'

const HOST_MUV = 'https://muv.sispro.gov.co'

/**
 * Ambiente del MUV. Pruebas usa la serie 5.x de habilitación;
 * producción usa la operación real. La URL base se puede reemplazar por entorno.
 */
export function resolveMuvAmbiente() {
  const raw = String(process.env.MINSALUD_AMBIENTE ?? config.minsalud.ambiente ?? 'pruebas')
    .trim()
    .toLowerCase()
  const id = raw === 'produccion' || raw === 'production' ? 'produccion' : 'pruebas'
  const porAmbiente =
    id === 'produccion'
      ? process.env.MINSALUD_API_BASE_URL_PRODUCCION
      : process.env.MINSALUD_API_BASE_URL_PRUEBAS
  const apiBaseUrl = (porAmbiente || config.minsalud.apiBaseUrl || HOST_MUV).replace(/\/$/, '')

  return {
    id,
    etiqueta: id === 'produccion' ? 'Producción' : 'Pruebas (Serie 5.x)',
    serie: id === 'pruebas' ? '5.x' : null,
    apiBaseUrl,
    authPath: config.minsalud.authPath || '/api/Auth/LoginSISPRO',
    cargarPath: config.minsalud.validatePath || '/api/PaquetesFevRips/CargarFevRips',
    hostOficial: HOST_MUV,
  }
}

import { cargarFevRips } from './MinSaludService.js'

/**
 * Transmisión RIPS. Delega en MinSaludService (LoginSISPRO + CargarFevRips).
 * No genera CUFE: el envío mensual solo necesita el CUV.
 */
export async function submitRipsToMinsalud(params) {
  return cargarFevRips(params)
}

/**
 * Alias usado por la capa de facturación histórica.
 * @param {object} rips
 * @param {{ metadatos?: object }} [options]
 */
export async function submitRipsToMinistry(rips, options = {}) {
  return cargarFevRips({
    rips,
    metadatos: options.metadatos ?? {},
  })
}

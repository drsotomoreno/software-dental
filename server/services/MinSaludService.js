/**
 * Cliente mock del Ministerio de Salud para el Motor RIPS.
 * Aísla la transmisión: sustituir el interior de transmitirRIPS() cuando exista la API real (OAuth2 + fetch).
 */

import { validateRipsPayload } from '../validators/ripsValidator.js'

export const MINSALUD_MOCK_LATENCY_MS = 2000
export const MINSALUD_MOCK_CUV = 'CUV-MOCK-987654321-TEST'

function simulateGovernmentLatency(ms = MINSALUD_MOCK_LATENCY_MS) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function glosasFromZodError(zodError) {
  return (zodError?.issues ?? []).map((issue) => ({
    campo: issue.path.length > 0 ? issue.path.join('.') : 'payload',
    codigo: 'GLOSA-MOCK',
    descripcion: issue.message,
  }))
}

export class MinSaludService {
  /**
   * Simula la radicación de un RIPS clínico ante MinSalud.
   * @param {unknown} payload
   * @returns {Promise<object>}
   */
  async transmitirRIPS(payload) {
    await simulateGovernmentLatency()

    const parsed = validateRipsPayload(payload)
    if (!parsed.success) {
      return {
        success: false,
        source: 'mock',
        tipo: 'GLOSA_SIMULADA',
        error: 'El RIPS no superó la validación clínica (glosa simulada).',
        glosas: glosasFromZodError(parsed.error),
      }
    }

    return {
      success: true,
      source: 'mock',
      estado: 'APROBADO',
      cuv: MINSALUD_MOCK_CUV,
      fechaRadicacion: new Date().toISOString(),
      datosValidados: parsed.data,
    }
  }
}

export const minSaludService = new MinSaludService()

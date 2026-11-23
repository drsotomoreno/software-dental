/**
 * Pipeline único de radicación RIPS ante el MUV.
 * Lo usan Exportación RIPS y el botón «Enviar RIPS al MUV» de la nota de evolución,
 * para que sanitización (RS sin guiones), envío y sellado del CUV no diverjan.
 */
import {
  contarAtencionesEnviadas,
  guardarHistorialRadicacionRips,
} from '@/db/ripsSubmissionsStore'
import { getCurrentClinicId } from '@/services/clinicalSyncState'
import { radicarRipsAnteMinisterio } from '@/services/ripsApiService'
import { guardarCuvEnNotas } from '@/services/ripsCuvNotaStore'
import type { RipsTransaction } from '@/types/rips'
import {
  ripsParaRadicar,
  type CanalRadicacionRips,
} from '@/utils/ripsRadicacion'

export type ResultadoRadicacionUnificada = {
  success: boolean
  cuv: string | null
  canal: CanalRadicacionRips | string
  source?: string | null
  error?: string
  errors?: Array<{ code?: string; message?: string; path?: string }>
  stampedNoteIds: string[]
  ripsEnviado: RipsTransaction
}

function idsUnicos(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((id) => String(id ?? '').trim()).filter(Boolean))]
}

/**
 * Aplica `ripsParaRadicar`, envía por `/api/rips/send-single` (misma ruta que
 * Exportación RIPS) y, si el MUV acepta, sella el CUV en las notas de evolución.
 */
export async function radicarPaqueteRipsUnificado(
  input: {
    rips: RipsTransaction
    canal: CanalRadicacionRips
    cufe?: string | null
    xmlFevFile?: string | null
    evolutionIds: Array<string | null | undefined>
    patientId?: string | null
    clinicId?: string | null
  },
  deps: {
    enviar?: typeof radicarRipsAnteMinisterio
    sellarCuv?: typeof guardarCuvEnNotas
    registrarHistorial?: typeof guardarHistorialRadicacionRips
  } = {},
): Promise<ResultadoRadicacionUnificada> {
  const evolutionIds = idsUnicos(input.evolutionIds)
  const rips = ripsParaRadicar(input.rips, input.canal)
  const historias = Math.max(1, evolutionIds.length || contarAtencionesEnviadas(rips) || 1)
  const enviar = deps.enviar ?? radicarRipsAnteMinisterio
  const sellarCuv = deps.sellarCuv ?? guardarCuvEnNotas
  const registrarHistorial = deps.registrarHistorial ?? guardarHistorialRadicacionRips

  let response
  try {
    response = await enviar({
      rips,
      cufe: input.canal === 'fev' ? String(input.cufe ?? '').trim() : '',
      xmlFevFile: input.xmlFevFile ?? '',
      evolutionId: evolutionIds.length === 1 ? evolutionIds[0] : null,
      patientId: input.patientId ?? null,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo contactar el Ministerio de Salud.'
    registrarHistorial({
      cantidad_historias: historias,
      estado: 'error',
      payload_json: rips,
    })
    return {
      success: false,
      cuv: null,
      canal: input.canal,
      error: message,
      errors: [{ message }],
      stampedNoteIds: [],
      ripsEnviado: rips,
    }
  }

  if (!response.success || !String(response.cuv ?? '').trim()) {
    registrarHistorial({
      cuv: response.cuv,
      cantidad_historias: historias,
      estado: 'rechazado',
      payload_json: rips,
    })
    return {
      success: false,
      cuv: response.cuv ? String(response.cuv).trim() : null,
      canal: response.canal ?? input.canal,
      source: response.source,
      error: response.error || 'El Ministerio de Salud no radicó el paquete.',
      errors: response.errors,
      stampedNoteIds: [],
      ripsEnviado: rips,
    }
  }

  const cuv = String(response.cuv).trim()
  const when = new Date().toISOString()
  const contadas = contarAtencionesEnviadas(rips)
  registrarHistorial({
    cuv,
    cantidad_historias: contadas > 0 ? contadas : historias,
    estado: 'radicado',
    payload_json: rips,
    clinicId: input.clinicId ?? getCurrentClinicId(),
    fecha_radicacion: when,
  })
  try {
    await sellarCuv(evolutionIds, cuv, when)
  } catch (error) {
    console.warn('[rips] CUV aceptado por el MUV pero no se pudo sellar en Dexie', error)
  }

  return {
    success: true,
    cuv,
    canal: response.canal ?? input.canal,
    source: response.source,
    stampedNoteIds: evolutionIds,
    ripsEnviado: rips,
  }
}

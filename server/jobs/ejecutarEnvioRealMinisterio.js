#!/usr/bin/env node
/**
 * Envía al Ministerio los RIPS pendientes sin factura (modalidad RS).
 * Lee el repositorio local. No usa pacientes ni NIT de ejemplo.
 *
 *   MINSALUD_SANDBOX=false \
 *   MINSALUD_NIT=900… \
 *   MINSALUD_NUMERO_DOCUMENTO=900… \
 *   MINSALUD_TIPO_DOCUMENTO=NIT \
 *   MINSALUD_PASSWORD=… \
 *   node server/jobs/ejecutarEnvioRealMinisterio.js
 */
import { pathToFileURL } from 'node:url'
import { config, hasMinsaludCredentials } from '../config.js'
import { saveCuvRecord } from '../services/cuvRepository.js'
import { startCuvWatcher } from '../services/cuvWatcher.js'
import { credencialesDesdeConfig, transmitirRipsMultiusuario } from '../services/ministerioService.js'
import { prepararRipsSinFactura } from '../services/fevRipsProtocol.js'
import { groupPendingRipsByOdontologo } from '../services/monthlyRipsPackage.js'
import {
  listPendingRipsWithoutInvoice,
  markTemporaryRipsSubmitted,
} from '../services/ripsTemporalStore.js'

/**
 * @returns {Promise<{ success: boolean, error?: string, results?: object[], paquetes?: number }>}
 */
export async function ejecutarEnvioRealMinisterio() {
  if (config.minsalud.sandbox || !hasMinsaludCredentials()) {
    const error =
      'Envío real detenido: defina MINSALUD_SANDBOX=false y las credenciales SISPRO en el entorno (NIT, documento y clave).'
    console.error(error)
    return { success: false, error }
  }

  console.log('[Producción] Iniciando envío real de RIPS sin factura al Ministerio…')
  await startCuvWatcher()

  const pending = await listPendingRipsWithoutInvoice()
  const packages = groupPendingRipsByOdontologo(pending).filter(
    (item) => Array.isArray(item.rips?.usuarios) && item.rips.usuarios.length > 0,
  )

  if (packages.length === 0) {
    const error = 'No hay RIPS pendientes sin factura en el repositorio local.'
    console.error(error)
    return { success: false, error, paquetes: 0, results: [] }
  }

  const results = []
  for (const pkg of packages) {
    const rips = prepararRipsSinFactura(pkg.rips)
    const credenciales = credencialesDesdeConfig(
      { nitObligado: rips.numDocumentoIdObligado },
      rips,
    )
    console.log(
      `[Ministerio] SISPRO NIT ${credenciales.nitObligado} · usuarios ${rips.usuarios.length} · nota ${rips.numNota}`,
    )

    try {
      const resultado = await transmitirRipsMultiusuario(rips, credenciales)
      if (!resultado.success) {
        console.error('[Ministerio] Validación o transmisión rechazada:', resultado.error)
        results.push({
          odontologoId: pkg.odontologoId,
          recordIds: pkg.recordIds,
          ok: false,
          error: resultado.error,
          localIssues: resultado.localIssues ?? [],
          ministryErrors: resultado.ministryErrors ?? [],
        })
        continue
      }

      console.log('[Ministerio] Transmisión exitosa.')
      console.log(
        `[Ministerio] Radicado proceso=${resultado.data.procesoId ?? 's/n'} cuv=${resultado.data.cuv}`,
      )
      await saveCuvRecord({
        cuv: resultado.data.cuv,
        numFactura: null,
        numDocumentoIdObligado: rips.numDocumentoIdObligado,
        status: 'approved',
        procesoId: resultado.data.procesoId,
        fechaRadicacion: resultado.data.fechaRadicacion,
        estado: resultado.data.estado,
        source: 'minsalud',
        metadatos: {
          origen: 'envio-real-rs',
          modulo: resultado.data.modulo,
          numNota: rips.numNota,
          odontologoId: pkg.odontologoId,
        },
      })
      await markTemporaryRipsSubmitted(pkg.recordIds, {
        submittedAt: resultado.data.fechaRadicacion || new Date().toISOString(),
        cuv: resultado.data.cuv,
      })
      results.push({
        odontologoId: pkg.odontologoId,
        recordIds: pkg.recordIds,
        ok: true,
        cuv: resultado.data.cuv,
        procesoId: resultado.data.procesoId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[Ministerio] Error crítico ejecutando el envío:', message)
      results.push({
        odontologoId: pkg.odontologoId,
        recordIds: pkg.recordIds,
        ok: false,
        error: message,
      })
    }
  }

  const success = results.length > 0 && results.every((item) => item.ok)
  return { success, paquetes: packages.length, results }
}

const invokedDirectly =
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url

if (invokedDirectly) {
  const summary = await ejecutarEnvioRealMinisterio()
  if (!summary.success) process.exitCode = 1
}

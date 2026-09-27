#!/usr/bin/env node
/**
 * Worker de transmisión masiva de RIPS hacia el MUV.
 * También lo arranca el servidor HTTP. Este script sirve para ejecutarlo aparte.
 *
 * Uso:
 *   node server/jobs/ripsTransmissionWorker.js
 */
import { startRipsTransmissionWorker } from '../services/ripsTransmissionQueue.js'

startRipsTransmissionWorker()
console.log('[RIPS cola] Worker en ejecución. Reintentos con backoff exponencial.')

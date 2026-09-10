#!/usr/bin/env node
/**
 * Envía RIPS pendientes (numFactura null) agrupados por odontólogo.
 *
 * crontab (hora Colombia):
 *   0 2 1 * *  TZ=America/Bogota  node /opt/render/project/src/server/jobs/enviarRipsMensuales.js
 *
 * Uso:
 *   node server/jobs/enviarRipsMensuales.js
 *   node server/jobs/enviarRipsMensuales.js --dry-run
 */
import { enviarRipsMensuales } from '../services/monthlyRipsSubmission.js'

const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dryrun')

const summary = await enviarRipsMensuales({ dryRun, submit: !dryRun })
console.log(JSON.stringify(summary, null, 2))
if (!summary.ok && !summary.skipped) process.exitCode = 1

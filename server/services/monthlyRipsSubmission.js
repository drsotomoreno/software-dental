/**
 * Envío mensual de RIPS pendientes (No_Obligado / numFactura null) al Ministerio.
 */
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from '../config.js'
import { submitRipsToMinsalud } from './minsaludRipsClient.js'
import { saveCuvRecord } from './cuvRepository.js'
import {
  listPendingRipsWithoutInvoice,
  markTemporaryRipsSubmitted,
} from './ripsTemporalStore.js'
import { groupPendingRipsByOdontologo } from './monthlyRipsPackage.js'
import { PERFIL_FISCAL_NO_OBLIGADO } from '../../shared/fiscalProfile.js'

const OUT_DIR = join(config.dataDir, 'rips-mensuales')
const LOCK_FILE = join(OUT_DIR, '.lock')
const LAST_RUN_FILE = join(OUT_DIR, 'last-run.json')

function periodStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  return `${year}-${month}`
}

function safeFilePart(value) {
  return String(value ?? 'odontologo').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'odontologo'
}

async function readLastRun() {
  try {
    return JSON.parse(await readFile(LAST_RUN_FILE, 'utf8'))
  } catch {
    return null
  }
}

async function writeLastRun(summary) {
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(LAST_RUN_FILE, JSON.stringify(summary, null, 2), 'utf8')
}

async function withLock(fn) {
  await mkdir(OUT_DIR, { recursive: true })
  let handle
  try {
    handle = await open(LOCK_FILE, 'wx')
  } catch {
    const staleMs = 30 * 60 * 1000
    try {
      const raw = await readFile(LOCK_FILE, 'utf8')
      const started = Date.parse(raw)
      if (Number.isFinite(started) && Date.now() - started < staleMs) {
        return { ok: false, skipped: true, error: 'Ya hay un envío mensual en curso.' }
      }
    } catch {
      /* lock ilegible */
    }
    await unlink(LOCK_FILE).catch(() => undefined)
    try {
      handle = await open(LOCK_FILE, 'wx')
    } catch {
      return { ok: false, skipped: true, error: 'Ya hay un envío mensual en curso.' }
    }
  }

  await handle.writeFile(new Date().toISOString())
  try {
    return await fn()
  } finally {
    await handle.close().catch(() => undefined)
    await unlink(LOCK_FILE).catch(() => undefined)
  }
}

async function writePackageFile(period, packageInfo) {
  const dir = join(OUT_DIR, period)
  await mkdir(dir, { recursive: true })
  const fileName = `odontologo-${safeFilePart(packageInfo.odontologoId)}.json`
  const filePath = join(dir, fileName)
  await writeFile(filePath, JSON.stringify(packageInfo.rips, null, 2), 'utf8')
  return filePath
}

/**
 * Busca RIPS Pendiente con numFactura null, agrupa por odontólogo,
 * escribe el JSON final y lo envía al API del Ministerio.
 *
 * @param {{ dryRun?: boolean, submit?: boolean }} [options]
 */
export async function enviarRipsMensuales(options = {}) {
  const dryRun = options.dryRun === true
  const submit = options.submit !== false && !dryRun
  const period = periodStamp()
  const startedAt = new Date().toISOString()

  return withLock(async () => {
    const pending = await listPendingRipsWithoutInvoice()
    const packages = groupPendingRipsByOdontologo(pending).filter(
      (item) => Array.isArray(item.rips?.usuarios) && item.rips.usuarios.length > 0,
    )

    const results = []
    for (const pkg of packages) {
      const filePath = await writePackageFile(period, pkg)
      const entry = {
        odontologoId: pkg.odontologoId,
        professionalId: pkg.professionalId,
        clinicId: pkg.clinicId,
        recordIds: pkg.recordIds,
        usuarios: pkg.rips.usuarios.length,
        numFactura: null,
        filePath,
        submitted: false,
      }

      if (!submit) {
        results.push({ ...entry, dryRun: true })
        continue
      }

      const ministry = await submitRipsToMinsalud({
        rips: pkg.rips,
        metadatos: {
          perfilFiscal: PERFIL_FISCAL_NO_OBLIGADO,
          esRipsTemporal: true,
          allowNullNumFactura: true,
          origen: 'cron-mensual',
          period,
          professionalId: pkg.professionalId,
          clinicId: pkg.clinicId,
          recordIds: pkg.recordIds,
        },
      })

      if (!ministry.success) {
        results.push({
          ...entry,
          ok: false,
          error: 'El Ministerio rechazó el paquete o falló la validación local.',
          localIssues: ministry.localIssues ?? [],
          ministryErrors: ministry.ministryErrors ?? [],
        })
        continue
      }

      await saveCuvRecord({
        cuv: ministry.cuv,
        numFactura: null,
        numDocumentoIdObligado: pkg.rips.numDocumentoIdObligado,
        status: 'approved',
        procesoId: ministry.procesoId,
        fechaRadicacion: ministry.fechaRadicacion,
        estado: ministry.estado,
        source: ministry.source,
        metadatos: { origen: 'cron-mensual', period, odontologoId: pkg.odontologoId },
      })
      await markTemporaryRipsSubmitted(pkg.recordIds, {
        submittedAt: ministry.fechaRadicacion || new Date().toISOString(),
        cuv: ministry.cuv,
      })
      results.push({
        ...entry,
        ok: true,
        submitted: true,
        cuv: ministry.cuv,
        procesoId: ministry.procesoId,
        source: ministry.source,
      })
    }

    const summary = {
      ok: results.every((item) => item.ok !== false),
      dryRun,
      submitted: submit,
      period,
      startedAt,
      finishedAt: new Date().toISOString(),
      pendingFound: pending.length,
      packages: packages.length,
      results,
    }
    if (!dryRun) await writeLastRun(summary)
    return summary
  })
}

export async function getMonthlyRipsJobStatus() {
  const pending = await listPendingRipsWithoutInvoice()
  return {
    timezone: 'America/Bogota',
    cron: '0 2 1 * *',
    pendingCount: pending.length,
    lastRun: await readLastRun(),
  }
}

export { periodStamp, OUT_DIR }

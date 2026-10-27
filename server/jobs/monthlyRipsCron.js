/**
 * Cron interno: día 1 de cada mes a las 02:00 America/Bogota.
 * Equivale a crontab:  0 2 1 * *   TZ=America/Bogota
 */
import { enviarRipsMensuales, getMonthlyRipsJobStatus } from '../services/monthlyRipsSubmission.js'

const TZ = 'America/Bogota'
const HOUR = 2
const MINUTE = 0
let timer = null
let lastRunStartedAt = 0

export function getBogotaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const num = (type) => Number(parts.find((part) => part.type === type)?.value)
  return {
    year: num('year'),
    month: num('month'),
    day: num('day'),
    hour: num('hour'),
    minute: num('minute'),
  }
}

/** Próximo 1er día del mes a las 02:00 en Bogotá (UTC-5, sin DST). */
export function nextMonthlyRunDate(now = new Date()) {
  const bogota = getBogotaParts(now)
  let year = bogota.year
  let month = bogota.month
  const alreadyPassed =
    bogota.day > 1 ||
    (bogota.day === 1 && (bogota.hour > HOUR || (bogota.hour === HOUR && bogota.minute >= MINUTE)))
  if (alreadyPassed) {
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return new Date(Date.UTC(year, month - 1, 1, HOUR + 5, MINUTE, 0, 0))
}

export function msUntilNextMonthlyRun(now = new Date()) {
  return Math.max(1_000, nextMonthlyRunDate(now).getTime() - now.getTime())
}

/**
 * Node recorta cualquier setTimeout mayor a 2^31-1 ms (~24,8 días) a 1 ms
 * y emite TimeoutOverflowWarning. De octubre a noviembre (y en casi todo mes)
 * la espera real supera ese tope: el cron se reprogramaba cada milisegundo,
 * saturaba el proceso y Render respondía 502.
 */
export const MAX_TIMER_DELAY_MS = 2_147_483_647
const MIN_TIMER_DELAY_MS = 1_000
const MIN_RUN_GAP_MS = 60 * 60 * 1000

export function timerDelayMs(waitMs) {
  const wait = Number(waitMs)
  if (!Number.isFinite(wait)) return MIN_TIMER_DELAY_MS
  return Math.min(MAX_TIMER_DELAY_MS, Math.max(MIN_TIMER_DELAY_MS, Math.floor(wait)))
}

/** True solo cuando el instante programado ya llegó (con 1 s de margen). */
export function shouldRunMonthlyJob(nowMs, dueAtMs) {
  return Number(nowMs) + MIN_TIMER_DELAY_MS >= Number(dueAtMs)
}

export function shouldCatchUpOnStartup(now = new Date(), lastRunPeriod) {
  const bogota = getBogotaParts(now)
  if (bogota.day !== 1) return false
  if (bogota.hour < HOUR) return false
  const period = `${bogota.year}-${String(bogota.month).padStart(2, '0')}`
  return lastRunPeriod !== period
}

function cronEnabled() {
  const raw = String(process.env.RIPS_MONTHLY_CRON ?? 'true').trim().toLowerCase()
  return raw !== '0' && raw !== 'false' && raw !== 'off'
}

async function runJob(reason) {
  lastRunStartedAt = Date.now()
  console.log(`[RIPS mensual] Inicio (${reason}) TZ=${TZ}`)
  try {
    const summary = await enviarRipsMensuales({ submit: true })
    console.log(
      `[RIPS mensual] Fin ok=${summary.ok} pendientes=${summary.pendingFound} paquetes=${summary.packages}`,
    )
    return summary
  } catch (error) {
    console.error('[RIPS mensual] Falló el envío:', error)
    return null
  }
}

function armTimer() {
  if (timer) clearTimeout(timer)
  const dueAt = nextMonthlyRunDate().getTime()
  const delay = timerDelayMs(dueAt - Date.now())
  console.log(
    `[RIPS mensual] Próxima ejecución ${new Date(dueAt).toISOString()} (cron 0 2 1 * * ${TZ}); espera ${delay}ms`,
  )
  timer = setTimeout(() => {
    const now = Date.now()
    if (!shouldRunMonthlyJob(now, dueAt)) {
      armTimer()
      return
    }
    if (now - lastRunStartedAt < MIN_RUN_GAP_MS) {
      timer = setTimeout(() => armTimer(), timerDelayMs(MIN_RUN_GAP_MS - (now - lastRunStartedAt)))
      if (typeof timer.unref === 'function') timer.unref()
      return
    }
    lastRunStartedAt = now
    void runJob('cron').finally(() => armTimer())
  }, delay)
  if (typeof timer.unref === 'function') timer.unref()
}

export async function startMonthlyRipsCron() {
  if (!cronEnabled()) {
    console.log('[RIPS mensual] Cron desactivado (RIPS_MONTHLY_CRON=false)')
    return { enabled: false }
  }
  const status = await getMonthlyRipsJobStatus()
  if (shouldCatchUpOnStartup(new Date(), status.lastRun?.period)) {
    await runJob('catch-up-dia-1')
  }
  armTimer()
  return { enabled: true, timezone: TZ, cron: '0 2 1 * *', nextRunAt: nextMonthlyRunDate().toISOString() }
}

export function stopMonthlyRipsCron() {
  if (timer) clearTimeout(timer)
  timer = null
}

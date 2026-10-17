import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_TIMER_DELAY_MS,
  nextMonthlyRunDate,
  shouldRunMonthlyJob,
  timerDelayMs,
} from './monthlyRipsCron.js'

test('el 4 de octubre la espera real no cabe en setTimeout y no debe ejecutarse aún', () => {
  const now = new Date('2026-10-04T21:09:00.000Z')
  const due = nextMonthlyRunDate(now)
  const wait = due.getTime() - now.getTime()

  assert.equal(due.toISOString(), '2026-11-01T07:00:00.000Z')
  assert.ok(wait > MAX_TIMER_DELAY_MS)
  assert.equal(timerDelayMs(wait), MAX_TIMER_DELAY_MS)
  assert.equal(shouldRunMonthlyJob(now.getTime(), due.getTime()), false)
  assert.equal(shouldRunMonthlyJob(now.getTime() + MAX_TIMER_DELAY_MS, due.getTime()), false)
})

test('un retardo dentro del límite de Node se conserva', () => {
  assert.equal(timerDelayMs(60_000), 60_000)
  assert.equal(timerDelayMs(MAX_TIMER_DELAY_MS), MAX_TIMER_DELAY_MS)
  assert.equal(timerDelayMs(MAX_TIMER_DELAY_MS + 1), MAX_TIMER_DELAY_MS)
})

test('cuando llega el 1 del mes a las 02:00 de Bogotá, el cron sí corre', () => {
  const due = Date.parse('2026-11-01T07:00:00.000Z')
  assert.equal(shouldRunMonthlyJob(due, due), true)
  assert.equal(shouldRunMonthlyJob(due + 5_000, due), true)
  assert.equal(shouldRunMonthlyJob(due - 5_000, due), false)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  etiquetaFechaHoraSesion,
  fechaHoraSesionClinica,
  fechaSesionClinicaSiEraUtc,
  minutoUtc,
} from './clinicDateTime.ts'

/** 26 oct 2026, 9:55 p. m. en Bogotá. El reloj UTC ya es 27 oct, 2:55 a. m. */
const NOCHE_BOGOTA = new Date('2026-10-27T02:55:00.000Z')

test('la sesión clínica usa America/Bogota y no el reloj UTC', () => {
  assert.equal(fechaHoraSesionClinica(NOCHE_BOGOTA), '2026-10-26T21:55')
  assert.notEqual(fechaHoraSesionClinica(NOCHE_BOGOTA), minutoUtc(NOCHE_BOGOTA))
  assert.equal(fechaHoraSesionClinica(new Date('2026-10-26T14:30:00.000Z')), '2026-10-26T09:30')
  assert.equal(fechaHoraSesionClinica(new Date('2026-10-27T04:59:00.000Z')), '2026-10-26T23:59')
  assert.equal(fechaHoraSesionClinica(new Date('2026-10-27T05:00:00.000Z')), '2026-10-27T00:00')
})

test('la etiqueta de la nota muestra la hora de la consulta, no UTC', () => {
  assert.equal(etiquetaFechaHoraSesion('2026-10-26T21:55'), '26/10/2026, 9:55 p. m.')
  assert.equal(etiquetaFechaHoraSesion('2026-10-27T02:55:00.000Z'), '26/10/2026, 9:55 p. m.')
})

test('un borrador con el sello UTC recupera la hora de Bogotá de createdAt', () => {
  assert.equal(
    fechaSesionClinicaSiEraUtc('2026-10-27T02:55', '2026-10-27T02:55:12.000Z'),
    '2026-10-26T21:55',
  )
  assert.equal(
    fechaSesionClinicaSiEraUtc('2026-10-26T21:55', '2026-10-27T02:55:12.000Z'),
    null,
  )
  assert.equal(fechaSesionClinicaSiEraUtc('2026-10-27T02:55', '2026-10-27T02:55'), null)
})

test('una nota firmada no se reescribe aunque tenga el sello UTC', () => {
  const source = readFileSync(new URL('../types/evolutionNote.ts', import.meta.url), 'utf8')
  const start = source.indexOf('export function corregirFechaSesionClinica')
  const body = source.slice(start, source.indexOf('export function corregirFechasSesionClinica'))
  assert.match(body, /if \(isEvolutionNoteImmutable\(note\)\) return note/)
  assert.match(body, /fechaSesionClinicaSiEraUtc/)
})

test('las notas nuevas no vuelven a sellar la sesión con toISOString', () => {
  const note = readFileSync(new URL('../types/evolutionNote.ts', import.meta.url), 'utf8')
  const service = readFileSync(new URL('../services/evolutionNoteService.ts', import.meta.url), 'utf8')
  assert.match(note, /date: fechaHoraSesionClinica\(now\)/)
  assert.match(service, /date: fechaHoraSesionClinica\(now\)/)
  assert.doesNotMatch(note, /toISOString\(\)\.slice\(0,\s*16\)/)
  assert.doesNotMatch(service, /toISOString\(\)\.slice\(0,\s*16\)/)
})

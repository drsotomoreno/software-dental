/**
 * Sello criptográfico real (SHA-256) del núcleo clínico.
 * El servidor recalcula el hash; nunca confía en el contentHash del cliente.
 *
 * Res. 1995/1999 · Ley 527 · Res. 839 — inmutabilidad de evoluciones firmadas.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import {
  buildClinicalSealPayload,
  buildEvolutionSealPayload,
  canonicalize,
  clinicalSealCanonical,
  clinicalSealsEqual,
  evolutionSealCanonical,
  evolutionSealsEqual,
  recordHasSignedAt,
} from '../../shared/clinicalSeal.js'

export {
  buildClinicalSealPayload,
  buildEvolutionSealPayload,
  canonicalize,
  clinicalSealCanonical,
  clinicalSealsEqual,
  evolutionSealCanonical,
  evolutionSealsEqual,
  recordHasSignedAt,
}

/** SHA-256 hex del JSON canónico. */
export function sha256Hex(canonicalUtf8) {
  return createHash('sha256').update(String(canonicalUtf8 ?? ''), 'utf8').digest('hex')
}

/** Hash del documento clínico (historia / payload de sync). */
export function hashClinicalRecord(record) {
  return sha256Hex(clinicalSealCanonical(record))
}

/** Hash de una nota de evolución (campos clínicos + CUPS + firma). */
export function hashEvolutionNote(note) {
  return sha256Hex(evolutionSealCanonical(note))
}

/**
 * Compara dos hex digests en tiempo constante.
 * @param {string} left
 * @param {string} right
 */
export function sealsMatch(left, right) {
  const a = String(left || '')
  const b = String(right || '')
  if (!a || !b || a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    return false
  }
}

/**
 * Si la copia guardada ya tiene signedAt, recalcula ambos sellos.
 * @returns {{ sealed: boolean, equal: boolean, storedHash: string, incomingHash: string }}
 */
export function verifyIncomingClinicalSeal(stored, incoming) {
  const sealed = recordHasSignedAt(stored)
  const storedHash = hashClinicalRecord(stored)
  const incomingHash = hashClinicalRecord(incoming)
  return {
    sealed,
    equal: sealsMatch(storedHash, incomingHash),
    storedHash,
    incomingHash,
  }
}

/**
 * Hard-reject normativo: ¿el entrante altera el núcleo clínico de un doc firmado?
 */
export function rejectsSignedClinicalMutation(stored, incoming) {
  const check = verifyIncomingClinicalSeal(stored, incoming)
  return check.sealed && !check.equal
}

export function clinicalSealPayloadForAudit(record) {
  return {
    canonical: clinicalSealCanonical(record),
    sha256: hashClinicalRecord(record),
    payload: buildClinicalSealPayload(record),
  }
}

export function evolutionSealPayloadForAudit(note) {
  return {
    canonical: evolutionSealCanonical(note),
    sha256: hashEvolutionNote(note),
    payload: buildEvolutionSealPayload(note),
  }
}

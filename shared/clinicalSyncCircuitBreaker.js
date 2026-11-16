/**
 * Impide que un bucle de autoguardado vuelva a inflar presupuesto o abonos.
 * Se aplica después de deduplicar: 23.820 copias de 6 líneas pasan a 6 y entran.
 * 301 líneas distintas, o un salto de más de 10×, se rechazan con HTTP 422.
 */

import { mergeBudgetItems } from './clinicalBudgetMerge.js'
import { mergeSignedEvolutionNotes } from './clinicalRecordGuard.js'
import { dedupeClinicalItems } from './clinicalListMerge.js'
import {
  mergeOrthodonticsPaymentRecords,
  mergePaymentControlLines,
  mergePaymentPlanItems,
  mergePaymentRecords,
} from './paymentControlMerge.js'

export const CLINICAL_ARRAY_LIMIT = 300
export const CLINICAL_ARRAY_GROWTH_FACTOR = 10

export class ClinicalArrayCircuitError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'ClinicalArrayCircuitError'
    this.status = 422
    this.code = 'CLINICAL_ARRAY_CIRCUIT'
    this.details = details
  }
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function diagnosisFingerprint(item) {
  return [text(item.code), text(item.description), text(item.type)].join('|').toLowerCase()
}

function planFingerprint(item) {
  return [
    text(item.procedure),
    String(item.toothNumber ?? item.anatomicalZone ?? ''),
    text(item.phase),
    text(item.cupsCode),
  ]
    .join('|')
    .toLowerCase()
}

export function sanitizeClinicalFormArrays(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return form
  const next = { ...form }
  if (Array.isArray(next.budgetItems)) next.budgetItems = mergeBudgetItems(next.budgetItems, [])
  if (Array.isArray(next.paymentControl)) {
    next.paymentControl = mergePaymentRecords(next.paymentControl, [])
  }
  if (Array.isArray(next.paymentControlLines)) {
    next.paymentControlLines = mergePaymentControlLines(next.paymentControlLines, [])
  }
  if (Array.isArray(next.orthodonticsPaymentControl)) {
    next.orthodonticsPaymentControl = mergeOrthodonticsPaymentRecords(
      next.orthodonticsPaymentControl,
      [],
    )
  }
  if (Array.isArray(next.paymentPlan)) next.paymentPlan = mergePaymentPlanItems(next.paymentPlan, [])
  if (Array.isArray(next.evolutionNotes)) {
    next.evolutionNotes = mergeSignedEvolutionNotes(next.evolutionNotes, next.evolutionNotes)
  }
  if (Array.isArray(next.diagnoses)) {
    next.diagnoses = dedupeClinicalItems(next.diagnoses, {
      fingerprint: diagnosisFingerprint,
      prefer: (previous, incoming) => ({ ...previous, ...incoming }),
    })
  }
  if (Array.isArray(next.treatmentPlan)) {
    next.treatmentPlan = dedupeClinicalItems(next.treatmentPlan, {
      fingerprint: planFingerprint,
      prefer: (previous, incoming) => ({ ...previous, ...incoming }),
    })
  }
  return next
}

export function clinicalFormsOf(record) {
  const payload =
    record?.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
      ? record.payload
      : record
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const forms = [payload]
  for (const key of ['clinicalDraft', 'valuationDraft']) {
    const nested = payload[key]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) forms.push(nested)
  }
  return forms
}

export function sanitizeClinicalRecordArrays(record) {
  if (!record || typeof record !== 'object') return record
  if (record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)) {
    const payload = sanitizeClinicalFormArrays(record.payload)
    for (const key of ['clinicalDraft', 'valuationDraft']) {
      if (payload[key] && typeof payload[key] === 'object') {
        payload[key] = sanitizeClinicalFormArrays(payload[key])
      }
    }
    return { ...record, payload }
  }
  return sanitizeClinicalFormArrays(record)
}

function arrayLength(form, key) {
  return Array.isArray(form?.[key]) ? form[key].length : 0
}

function assertPair(label, previousLength, nextLength, syncId) {
  if (nextLength > CLINICAL_ARRAY_LIMIT) {
    throw new ClinicalArrayCircuitError(
      `${label} supera ${CLINICAL_ARRAY_LIMIT} elementos (${nextLength}) en ${syncId || 'el registro'}.`,
      { label, previousLength, nextLength, syncId },
    )
  }
  if (previousLength > 0 && nextLength > previousLength * CLINICAL_ARRAY_GROWTH_FACTOR) {
    throw new ClinicalArrayCircuitError(
      `${label} creció más de ${CLINICAL_ARRAY_GROWTH_FACTOR}× (${previousLength} → ${nextLength}) en ${syncId || 'el registro'}.`,
      { label, previousLength, nextLength, syncId },
    )
  }
}

export function assertClinicalArrayLimits(previousRecord, nextRecord) {
  const syncId = String(nextRecord?.syncId || previousRecord?.syncId || '')
  const previousForms = clinicalFormsOf(previousRecord)
  const nextForms = clinicalFormsOf(nextRecord)
  const count = previousForms.length > nextForms.length ? previousForms.length : nextForms.length
  for (let index = 0; index < count; index += 1) {
    const previous = previousForms[index] || {}
    const next = nextForms[index] || {}
    assertPair('presupuesto', arrayLength(previous, 'budgetItems'), arrayLength(next, 'budgetItems'), syncId)
    assertPair('abonos', arrayLength(previous, 'paymentControl'), arrayLength(next, 'paymentControl'), syncId)
  }
}

export function isClinicalArrayCircuitError(error) {
  return error?.code === 'CLINICAL_ARRAY_CIRCUIT' || error?.status === 422
}

/**
 * Los abonos del Plan y Control de Pagos son evidencia legal (recibos / FEV).
 * Al sincronizar o autoguardar entre terminales NUNCA se descartan: se unen por id.
 */

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function invoiceScore(invoice) {
  if (!invoice || typeof invoice !== 'object') return 0
  let score = 1
  if (text(invoice.invoiceNumber)) score += 2
  if (text(invoice.cufe)) score += 3
  if (invoice.status === 'voided_by_credit_note') score += 2
  if (invoice.amount > 0) score += 1
  return score
}

function paymentRichness(payment) {
  if (!payment || typeof payment !== 'object') return 0
  let score = 1
  if (text(payment.paymentControlLineId)) score += 4
  if (Array.isArray(payment.lineAllocations) && payment.lineAllocations.length > 0) score += 4
  if (Array.isArray(payment.invoices)) {
    score += payment.invoices.reduce((sum, invoice) => sum + invoiceScore(invoice), 0)
  }
  if (typeof payment.remainingBalance === 'number') score += 1
  if (text(payment.documentKind)) score += 1
  if (text(payment.treatingDentistName) || text(payment.treatingDentistUserId)) score += 1
  if (text(payment.notes)) score += 1
  score += Math.min(3, Math.round(Number(payment.amount) > 0 ? 1 : 0))
  return score
}

function paymentStamp(payment) {
  if (!payment || typeof payment !== 'object') return 0
  const invoices = Array.isArray(payment.invoices) ? payment.invoices : []
  let latest = Date.parse(String(payment.paymentDate || '')) || 0
  for (const invoice of invoices) {
    const stamp =
      Date.parse(String(invoice?.issuedAt || invoice?.createdAt || invoice?.voidedAt || '')) || 0
    if (stamp > latest) latest = stamp
  }
  return latest
}

/** Entre dos copias del mismo abono, conserva la más completa (vínculo, factura, NC). */
export function preferRicherPayment(left, right) {
  if (!left) return right
  if (!right) return left
  const leftScore = paymentRichness(left)
  const rightScore = paymentRichness(right)
  if (rightScore !== leftScore) return rightScore > leftScore ? right : left
  return paymentStamp(right) >= paymentStamp(left) ? right : left
}

/**
 * Une abonos por `id`. Un autoguardado incompleto no puede borrar recibos
 * que otra terminal ya registró.
 */
export function mergePaymentRecords(left, right) {
  const byId = new Map()
  const orphans = []

  for (const payment of [...asArray(left), ...asArray(right)]) {
    if (!payment || typeof payment !== 'object') continue
    const id = text(payment.id)
    if (!id) {
      orphans.push(payment)
      continue
    }
    const previous = byId.get(id)
    byId.set(id, previous ? preferRicherPayment(previous, payment) : payment)
  }

  const merged = [...byId.values(), ...orphans]
  merged.sort((a, b) => {
    const dateCmp = String(a?.paymentDate || '').localeCompare(String(b?.paymentDate || ''))
    if (dateCmp !== 0) return dateCmp
    return String(a?.id || '').localeCompare(String(b?.id || ''))
  })
  return merged
}

function lineRichness(line) {
  if (!line || typeof line !== 'object') return 0
  let score = 1
  if (text(line.procedure)) score += 2
  if (text(line.cupsCode)) score += 2
  if (text(line.diagnosisCode)) score += 1
  if (line.unitPrice > 0) score += 1
  if (line.budgetItemId) score += 1
  return score
}

export function mergePaymentControlLines(left, right) {
  const byId = new Map()
  for (const line of [...asArray(left), ...asArray(right)]) {
    if (!line || typeof line !== 'object') continue
    const id = text(line.id)
    if (!id) continue
    const previous = byId.get(id)
    if (!previous || lineRichness(line) >= lineRichness(previous)) {
      byId.set(id, previous ? { ...previous, ...line } : line)
    } else {
      byId.set(id, { ...line, ...previous })
    }
  }
  return [...byId.values()]
}

function orthoRichness(payment) {
  if (!payment || typeof payment !== 'object') return 0
  let score = 1
  if (Array.isArray(payment.invoices)) {
    score += payment.invoices.reduce((sum, invoice) => sum + invoiceScore(invoice), 0)
  }
  if (text(payment.paymentType)) score += 1
  if (payment.amount > 0) score += 1
  return score
}

export function mergeOrthodonticsPaymentRecords(left, right) {
  const byId = new Map()
  for (const payment of [...asArray(left), ...asArray(right)]) {
    if (!payment || typeof payment !== 'object') continue
    const id = text(payment.id)
    if (!id) continue
    const previous = byId.get(id)
    if (!previous || orthoRichness(payment) >= orthoRichness(previous)) {
      byId.set(id, previous ? { ...previous, ...payment } : payment)
    } else {
      byId.set(id, { ...payment, ...previous })
    }
  }
  const merged = [...byId.values()]
  merged.sort((a, b) => String(a?.paymentDate || '').localeCompare(String(b?.paymentDate || '')))
  return merged
}

function planRichness(item) {
  if (!item || typeof item !== 'object') return 0
  let score = 1
  if (text(item.paymentMethod)) score += 1
  if (item.installmentAmount > 0 || item.totalAmount > 0) score += 1
  if (item.installments > 0) score += 1
  if (text(item.dueDate)) score += 1
  if (text(item.paymentControlLineId)) score += 2
  return score
}

export function mergePaymentPlanItems(left, right) {
  const byId = new Map()
  for (const item of [...asArray(left), ...asArray(right)]) {
    if (!item || typeof item !== 'object') continue
    const id = text(item.id)
    if (!id) continue
    const previous = byId.get(id)
    if (!previous || planRichness(item) >= planRichness(previous)) {
      byId.set(id, previous ? { ...previous, ...item } : item)
    } else {
      byId.set(id, { ...item, ...previous })
    }
  }
  return [...byId.values()]
}

function paymentIdsOf(form) {
  const ids = new Set()
  for (const payment of asArray(form?.paymentControl)) {
    const id = text(payment?.id)
    if (id) ids.add(id)
  }
  for (const payment of asArray(form?.orthodonticsPaymentControl)) {
    const id = text(payment?.id)
    if (id) ids.add(`ortho:${id}`)
  }
  return ids
}

export function paymentControlHasContent(form) {
  if (!form || typeof form !== 'object') return false
  if (asArray(form.paymentControl).some((payment) => text(payment?.id) || Number(payment?.amount) > 0)) {
    return true
  }
  if (
    asArray(form.orthodonticsPaymentControl).some(
      (payment) => text(payment?.id) || Number(payment?.amount) > 0,
    )
  ) {
    return true
  }
  if (asArray(form.paymentControlLines).some((line) => text(line?.procedure) || Number(line?.unitPrice) > 0)) {
    return true
  }
  return asArray(form.paymentPlan).some(
    (item) => text(item?.procedure) || Number(item?.totalAmount) > 0 || Number(item?.installmentAmount) > 0,
  )
}

/** La copia entrante pierde abonos que la guardada sí tiene. */
export function dropsPaymentRecords(prev, next) {
  const prevIds = paymentIdsOf(prev)
  if (prevIds.size === 0) return false
  const nextIds = paymentIdsOf(next)
  for (const id of prevIds) {
    if (!nextIds.has(id)) return true
  }
  return false
}

/**
 * Une las secciones de pago de dos formularios / historias.
 * El resto de campos lo decide quien llama (borrador más nuevo, etc.).
 */
export function mergeClinicalPaymentSections(base, incoming) {
  const left = base && typeof base === 'object' ? base : {}
  const right = incoming && typeof incoming === 'object' ? incoming : {}
  return {
    paymentControl: mergePaymentRecords(left.paymentControl, right.paymentControl),
    paymentControlLines: mergePaymentControlLines(
      left.paymentControlLines,
      right.paymentControlLines,
    ),
    orthodonticsPaymentControl: mergeOrthodonticsPaymentRecords(
      left.orthodonticsPaymentControl,
      right.orthodonticsPaymentControl,
    ),
    paymentPlan: mergePaymentPlanItems(left.paymentPlan, right.paymentPlan),
  }
}

function mergeNestedPaymentForm(winnerForm, otherForm) {
  // No inventar un borrador clínico solo por traer abonos del otro lado.
  if (!winnerForm || typeof winnerForm !== 'object') return winnerForm ?? null
  return {
    ...winnerForm,
    ...mergeClinicalPaymentSections(otherForm, winnerForm),
  }
}

/**
 * Aplica la unión de pagos sobre el documento ganador, conservando abonos
 * del perdedor. Usado en pull/push de sync y al autoguardar.
 */
export function withMergedClinicalPayments(winner, other) {
  if (!winner || typeof winner !== 'object') return winner
  const otherRecord = other && typeof other === 'object' ? other : {}

  // Borrador paciente: los abonos viven dentro de clinicalDraft / valuationDraft.
  if ('clinicalDraft' in winner || 'valuationDraft' in winner) {
    return {
      ...winner,
      clinicalDraft: mergeNestedPaymentForm(winner.clinicalDraft, otherRecord.clinicalDraft),
      valuationDraft: mergeNestedPaymentForm(winner.valuationDraft, otherRecord.valuationDraft),
    }
  }

  return {
    ...winner,
    ...mergeClinicalPaymentSections(otherRecord, winner),
  }
}

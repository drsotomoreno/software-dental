/**
 * Hash determinístico del estado clínico editable.
 * Usado por autosave, inmunidad post-hidratación y bitácora médico-legal.
 */

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** Serialización estable: claves ordenadas, arrays por orden de aparición. */
export function stableStringify(value) {
  if (value == null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'bigint') return JSON.stringify(String(value))
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(String(value))
}

/** FNV-1a 32-bit → hex (rápido, determinístico, suficiente para dirty-check). */
export function hashStringFnv1a(input) {
  let hash = 0x811c9dc5
  const str = String(input || '')
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Extrae solo campos clínicos editables (ignora metadatos de sync/UI).
 * @param {unknown} clinicalData
 */
export function clinicalEditableSnapshot(clinicalData) {
  if (!clinicalData || typeof clinicalData !== 'object') return null
  const data = clinicalData
  return {
    anamnesis: data.anamnesis ?? null,
    stomatologicalExam: data.stomatologicalExam ?? null,
    diagnoses: data.diagnoses ?? [],
    diagnosticChart: data.diagnosticChart ?? null,
    findings: text(data.findings),
    diagnosisNotes: text(data.diagnosisNotes),
    treatmentPlanNotes: text(data.treatmentPlanNotes),
    treatmentPlan: data.treatmentPlan ?? [],
    evolutionNotes: data.evolutionNotes ?? [],
    informedConsent: data.informedConsent ?? null,
    valuationConsent: data.valuationConsent ?? null,
    treatmentPlanAuthorization: data.treatmentPlanAuthorization ?? null,
    specializedAnnexes: data.specializedAnnexes ?? null,
    budgetItems: data.budgetItems ?? [],
    budget: data.budget ?? null,
    orthodonticsBudget: data.orthodonticsBudget ?? null,
    dentalImplantsBudget: data.dentalImplantsBudget ?? null,
    paymentControl: data.paymentControl ?? [],
    orthodonticsPaymentControl: data.orthodonticsPaymentControl ?? [],
    paymentControlLines: data.paymentControlLines ?? [],
  }
}

/**
 * @param {unknown} clinicalData
 * @returns {string}
 */
export function computeClinicalFormHash(clinicalData) {
  return hashStringFnv1a(stableStringify(clinicalEditableSnapshot(clinicalData)))
}

const SECTION_LABELS = [
  ['anamnesis', (s) => s?.anamnesis],
  ['stomatologicalExam', (s) => s?.stomatologicalExam],
  ['diagnoses', (s) => s?.diagnoses],
  ['diagnosticChart', (s) => s?.diagnosticChart],
  ['findings', (s) => s?.findings],
  ['treatmentPlan', (s) => s?.treatmentPlan],
  ['evolutionNotes', (s) => s?.evolutionNotes],
  ['informedConsent', (s) => s?.informedConsent],
  ['valuationConsent', (s) => s?.valuationConsent],
  ['treatmentPlanAuthorization', (s) => s?.treatmentPlanAuthorization],
  ['specializedAnnexes', (s) => s?.specializedAnnexes],
  ['budgetItems', (s) => s?.budgetItems],
  ['budget', (s) => s?.budget],
  ['orthodonticsBudget', (s) => s?.orthodonticsBudget],
  ['dentalImplantsBudget', (s) => s?.dentalImplantsBudget],
  ['paymentControl', (s) => s?.paymentControl],
  ['orthodonticsPaymentControl', (s) => s?.orthodonticsPaymentControl],
  ['paymentControlLines', (s) => s?.paymentControlLines],
]

/**
 * Compara dos formularios y lista secciones cuyo hash cambió.
 * @param {unknown} previous
 * @param {unknown} next
 * @returns {string[]}
 */
export function detectChangedClinicalSections(previous, next) {
  const left = clinicalEditableSnapshot(previous)
  const right = clinicalEditableSnapshot(next)
  if (!left && !right) return []
  if (!left) return SECTION_LABELS.map(([name]) => name)
  if (!right) return SECTION_LABELS.map(([name]) => name)
  const changed = []
  for (const [name, pick] of SECTION_LABELS) {
    if (stableStringify(pick(left)) !== stableStringify(pick(right))) changed.push(name)
  }
  return changed
}

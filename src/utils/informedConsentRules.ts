import {
  CLINICAL_CONSENT_CATEGORIES,
  categoryForConsentTemplate,
  defaultConsentTemplateForCategory,
  FORBIDDEN_GENERAL_CONSENT_TEMPLATE,
  getClinicalConsentCategory,
  isClinicalConsentCategoryId,
  templateBelongsToCategory,
  type ClinicalConsentCategory,
  type ClinicalConsentCategoryId,
} from '@/constants/consentCategories'
import {
  ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS,
  ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS,
  ORTHODONTICS_MECHANICAL_CONTROL_CUPS,
} from '@/constants/rips'
import type { ConsentTemplateId } from '@/constants/consentTemplates'
import { MIN_SIGNATURE_STROKES, type SignatureCaptureMetadata } from '@/types/signature'
import type { CategoryInformedConsent, InformedConsent } from '@/types/consent'
import type { TreatmentPlanItem } from '@/types/clinicalRecord'

/**
 * Regla de consentimientos informados (Resolución 3100 de 2019 y Ley 23 de 1981):
 * un documento firmado por categoría clínica cubre las atenciones de ese tratamiento.
 * No existe un consentimiento general del plan ni un consentimiento por cita o control.
 */

export interface ConsentCoverageInput {
  treatmentPlan?: readonly TreatmentPlanItem[] | null
  orthodonticsBudgetActive?: boolean
  dentalImplantsBudgetActive?: boolean
}

const CONSULTATION_CUPS_CATEGORY: Record<string, ClinicalConsentCategoryId> = {
  [ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS.cirugiaOral]: 'cirugia_oral',
  [ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS.cirugiaOralMaxilofacial]: 'cirugia_oral',
  [ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS.estomatologiaCirugiaOral]: 'cirugia_oral',
  [ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS.endodoncia]: 'endodoncia',
  [ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS.endodoncia]: 'endodoncia',
  [ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS.periodoncia]: 'periodoncia',
  [ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS.periodoncia]: 'periodoncia',
  [ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS.ortodoncia]: 'ortodoncia',
  [ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS.ortodoncia]: 'ortodoncia',
  [ORTHODONTICS_MECHANICAL_CONTROL_CUPS]: 'ortodoncia',
  [ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS.rehabilitacionOral]: 'rehabilitacion_oral',
  [ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS.rehabilitacionOral]: 'rehabilitacion_oral',
}

const EXACT_PROCEDURE_CUPS_CATEGORY: Record<string, ClinicalConsentCategoryId> = {
  '234101': 'cirugia_oral',
  '234102': 'cirugia_oral',
  '761101': 'cirugia_oral',
  '234403': 'implantologia',
  '234404': 'implantologia',
  '997701': 'implantologia',
}

const PROCEDURE_PREFIX_CATEGORY: Array<{ prefix: string; categoryId: ClinicalConsentCategoryId }> = [
  { prefix: '237', categoryId: 'endodoncia' },
  { prefix: '9974', categoryId: 'endodoncia' },
  { prefix: '235', categoryId: 'periodoncia' },
  { prefix: '243', categoryId: 'ortodoncia' },
  { prefix: '236', categoryId: 'cirugia_oral' },
  { prefix: '9977', categoryId: 'cirugia_oral' },
  { prefix: '761', categoryId: 'cirugia_oral' },
  { prefix: '233', categoryId: 'rehabilitacion_oral' },
  { prefix: '234', categoryId: 'rehabilitacion_oral' },
  { prefix: '232', categoryId: 'operatoria_restauradora' },
  { prefix: '231', categoryId: 'cirugia_oral' },
  { prefix: '230', categoryId: 'cirugia_oral' },
  { prefix: '241', categoryId: 'periodoncia' },
  { prefix: '240', categoryId: 'periodoncia' },
  { prefix: '9973', categoryId: 'periodoncia' },
  { prefix: '9970', categoryId: 'periodoncia' },
]

const PER_APPOINTMENT_SCOPES = new Set(['cita', 'appointment', 'control', 'atencion', 'atención'])

const KEYWORD_CATEGORIES: Array<{ tokens: string[]; categoryId: ClinicalConsentCategoryId }> = [
  { tokens: ['ortopedia'], categoryId: 'ortopedia_maxilar' },
  { tokens: ['endodon', 'conducto'], categoryId: 'endodoncia' },
  { tokens: ['implante'], categoryId: 'implantologia' },
  { tokens: ['ortodon', 'bracket', 'alineador'], categoryId: 'ortodoncia' },
  { tokens: ['cirugia', 'exodon', 'extracc', 'biopsia'], categoryId: 'cirugia_oral' },
  {
    tokens: ['periodon', 'detartraje', 'alisado radicular', 'profilaxis', 'raspado'],
    categoryId: 'periodoncia',
  },
  { tokens: ['carilla', 'blanquea'], categoryId: 'estetica_dental' },
  { tokens: ['rehabilit', 'corona', 'protes', 'puente'], categoryId: 'rehabilitacion_oral' },
  {
    tokens: ['operatoria', 'resina', 'obtur', 'restaur', 'amalgama'],
    categoryId: 'operatoria_restauradora',
  },
]

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

function normalizeCups(code: string | undefined): string {
  const digits = String(code ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.padStart(6, '0').slice(0, 6)
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? ''
  if (labels.length === 2) return `${labels[0]} y ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`
}

function categoryLabel(categoryId: ClinicalConsentCategoryId): string {
  return getClinicalConsentCategory(categoryId)?.label ?? categoryId
}

function isConsentTemplateId(value: string): value is ConsentTemplateId {
  return (
    value === FORBIDDEN_GENERAL_CONSENT_TEMPLATE || categoryForConsentTemplate(value as ConsentTemplateId) !== null
  )
}

function signatureIsComplete(
  dataUrl: string | undefined,
  meta: SignatureCaptureMetadata | undefined,
): boolean {
  return Boolean(
    dataUrl &&
      meta &&
      meta.signatureMethod === 'canvas_biometric' &&
      meta.strokeCount >= MIN_SIGNATURE_STROKES,
  )
}

function signatureIssue(
  role: 'paciente' | 'profesional',
  dataUrl: string | undefined,
  meta: SignatureCaptureMetadata | undefined,
): string | null {
  if (!dataUrl || !meta) {
    return `La firma del ${role} es obligatoria para archivar el consentimiento.`
  }
  if (meta.signatureMethod !== 'canvas_biometric') {
    return `La firma del ${role} debe trazarse en el dispositivo.`
  }
  if (meta.strokeCount < MIN_SIGNATURE_STROKES) {
    return `La firma del ${role} debe tener al menos ${MIN_SIGNATURE_STROKES} trazos.`
  }
  return null
}

function readScope(raw: Record<string, unknown>): string {
  return typeof raw.scope === 'string' ? raw.scope.trim().toLowerCase() : ''
}

function parseCategoryRecord(
  raw: unknown,
  fallbackLicense: string,
): CategoryInformedConsent | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const scope = readScope(record)
  if (scope && PER_APPOINTMENT_SCOPES.has(scope)) return null
  if (scope && scope !== 'categoria_clinica') return null

  const categoryValue = typeof record.categoryId === 'string' ? record.categoryId : ''
  if (!isClinicalConsentCategoryId(categoryValue)) return null

  const templateValue = typeof record.templateId === 'string' ? record.templateId : ''
  if (templateValue === FORBIDDEN_GENERAL_CONSENT_TEMPLATE) return null
  const templateId = templateBelongsToCategory(templateValue as ConsentTemplateId, categoryValue)
    ? (templateValue as ConsentTemplateId)
    : defaultConsentTemplateForCategory(categoryValue)

  const patientSignatureDataUrl =
    typeof record.patientSignatureDataUrl === 'string' ? record.patientSignatureDataUrl : undefined
  const professionalSignatureDataUrl =
    typeof record.professionalSignatureDataUrl === 'string'
      ? record.professionalSignatureDataUrl
      : undefined
  const patientSignatureMeta = record.patientSignatureMeta as SignatureCaptureMetadata | undefined
  const professionalSignatureMeta = record.professionalSignatureMeta as
    | SignatureCaptureMetadata
    | undefined
  const textAccepted = record.textAccepted === true
  const signedAt = typeof record.signedAt === 'string' ? record.signedAt : undefined
  const archivedAt = typeof record.archivedAt === 'string' ? record.archivedAt : undefined
  const complete = Boolean(
    textAccepted &&
      signatureIsComplete(patientSignatureDataUrl, patientSignatureMeta) &&
      signatureIsComplete(professionalSignatureDataUrl, professionalSignatureMeta),
  )
  const wantsArchived = record.status === 'archivado' || Boolean(signedAt || archivedAt)
  const status = wantsArchived && complete ? 'archivado' : 'borrador'
  const license =
    (typeof record.professionalLicense === 'string' && record.professionalLicense.trim()) ||
    fallbackLicense

  const id =
    typeof record.id === 'string' && record.id.trim()
      ? record.id.trim()
      : `categoria-${categoryValue}`

  return {
    id,
    categoryId: categoryValue,
    templateId,
    status,
    scope: 'categoria_clinica',
    textAccepted: status === 'archivado' ? true : textAccepted,
    patientSignatureDataUrl,
    patientSignatureMeta,
    professionalSignatureDataUrl,
    professionalSignatureMeta,
    professionalLicense: license,
    professionalRegistry:
      (typeof record.professionalRegistry === 'string' && record.professionalRegistry.trim()) ||
      license,
    signedAt: status === 'archivado' ? signedAt || archivedAt : undefined,
    archivedAt: status === 'archivado' ? archivedAt || signedAt : undefined,
  }
}

function preferRecord(
  current: CategoryInformedConsent | undefined,
  incoming: CategoryInformedConsent,
): CategoryInformedConsent {
  if (!current) return incoming
  if (current.status === 'borrador' && incoming.status === 'archivado') return incoming
  return current
}

function dedupeByCategory(records: CategoryInformedConsent[]): CategoryInformedConsent[] {
  const byCategory = new Map<ClinicalConsentCategoryId, CategoryInformedConsent>()
  for (const record of records) {
    byCategory.set(record.categoryId, preferRecord(byCategory.get(record.categoryId), record))
  }
  return CLINICAL_CONSENT_CATEGORIES.map((category) => byCategory.get(category.id)).filter(
    (record): record is CategoryInformedConsent => Boolean(record),
  )
}

function migrateLegacySignedConsents(
  data: Partial<InformedConsent> | undefined,
  fallbackLicense: string,
): CategoryInformedConsent[] {
  if (!data?.textAccepted) return []
  if (
    !signatureIsComplete(data.patientSignatureDataUrl, data.patientSignatureMeta) ||
    !signatureIsComplete(data.professionalSignatureDataUrl, data.professionalSignatureMeta)
  ) {
    return []
  }

  const records: CategoryInformedConsent[] = []
  const seen = new Set<ClinicalConsentCategoryId>()
  for (const templateId of data.selectedConsentIds ?? []) {
    if (!isConsentTemplateId(templateId) || templateId === FORBIDDEN_GENERAL_CONSENT_TEMPLATE) {
      continue
    }
    const category = categoryForConsentTemplate(templateId)
    if (!category || seen.has(category.id)) continue
    seen.add(category.id)
    const license = data.professionalLicense?.trim() || fallbackLicense
    const signedAt = data.signedAt || data.patientSignatureMeta?.captureEndedAt
    records.push({
      id: `legacy-${category.id}`,
      categoryId: category.id,
      templateId,
      status: 'archivado',
      scope: 'categoria_clinica',
      textAccepted: true,
      patientSignatureDataUrl: data.patientSignatureDataUrl,
      patientSignatureMeta: data.patientSignatureMeta,
      professionalSignatureDataUrl: data.professionalSignatureDataUrl,
      professionalSignatureMeta: data.professionalSignatureMeta,
      professionalLicense: license,
      professionalRegistry: data.professionalRegistry?.trim() || license,
      signedAt,
      archivedAt: signedAt,
    })
  }
  return records
}

function projectArchivedConsent(consent: InformedConsent): InformedConsent {
  const archived = listArchivedCategoryConsents(consent)
  const license = consent.professionalLicense
  const registry = consent.professionalRegistry || license
  if (archived.length === 0) {
    return {
      ...consent,
      selectedConsentIds: [],
      textAccepted: false,
      patientSignatureDataUrl: undefined,
      patientSignatureMeta: undefined,
      professionalSignatureDataUrl: undefined,
      professionalSignatureMeta: undefined,
      professionalLicense: license,
      professionalRegistry: registry,
      signedAt: undefined,
    }
  }

  const latest = [...archived].sort((a, b) => (a.signedAt ?? '').localeCompare(b.signedAt ?? '')).at(-1)
  return {
    ...consent,
    selectedConsentIds: archived.map((record) => record.templateId),
    textAccepted: true,
    patientSignatureDataUrl: latest?.patientSignatureDataUrl,
    patientSignatureMeta: latest?.patientSignatureMeta,
    professionalSignatureDataUrl: latest?.professionalSignatureDataUrl,
    professionalSignatureMeta: latest?.professionalSignatureMeta,
    professionalLicense: latest?.professionalLicense || license,
    professionalRegistry: latest?.professionalRegistry || latest?.professionalLicense || registry,
    signedAt: latest?.signedAt,
  }
}

export function listArchivedCategoryConsents(
  consent: Pick<InformedConsent, 'records'> | null | undefined,
): CategoryInformedConsent[] {
  return (consent?.records ?? []).filter((record) => record.status === 'archivado')
}

export function categoriesAvailableForNewConsent(
  records: readonly CategoryInformedConsent[],
): ClinicalConsentCategory[] {
  const taken = new Set(records.map((record) => record.categoryId))
  return CLINICAL_CONSENT_CATEGORIES.filter((category) => !taken.has(category.id))
}

export function categoryForTreatmentItem(
  item: Pick<TreatmentPlanItem, 'source' | 'cupsCode' | 'procedure'>,
): ClinicalConsentCategoryId | null {
  if (item.source === 'orthodontics_annex') return 'ortodoncia'
  if (item.source === 'endodontics_annex') return 'endodoncia'
  if (item.source === 'oral_surgery_annex') return 'cirugia_oral'
  if (item.source === 'periodontics_annex') return 'periodoncia'

  const cups = normalizeCups(item.cupsCode)
  if (cups) {
    const fromConsultation = CONSULTATION_CUPS_CATEGORY[cups]
    if (fromConsultation) return fromConsultation
    const exact = EXACT_PROCEDURE_CUPS_CATEGORY[cups]
    if (exact) return exact
    const fromPrefix = PROCEDURE_PREFIX_CATEGORY.find((entry) => cups.startsWith(entry.prefix))
    if (fromPrefix) return fromPrefix.categoryId
  }

  const procedure = fold(item.procedure ?? '')
  if (!procedure) return null
  const match = KEYWORD_CATEGORIES.find((entry) =>
    entry.tokens.some((token) => procedure.includes(token)),
  )
  return match?.categoryId ?? null
}

export function requiredConsentCategories(input: ConsentCoverageInput): ClinicalConsentCategoryId[] {
  const required = new Set<ClinicalConsentCategoryId>()
  if (input.orthodonticsBudgetActive) required.add('ortodoncia')
  if (input.dentalImplantsBudgetActive) required.add('implantologia')
  for (const item of input.treatmentPlan ?? []) {
    const categoryId = categoryForTreatmentItem(item)
    if (categoryId) required.add(categoryId)
  }
  return CLINICAL_CONSENT_CATEGORIES.map((category) => category.id).filter((id) => required.has(id))
}

export function missingArchivedConsentCategories(
  consent: Pick<InformedConsent, 'records'>,
  input: ConsentCoverageInput,
): ClinicalConsentCategory[] {
  const covered = new Set(listArchivedCategoryConsents(consent).map((record) => record.categoryId))
  return requiredConsentCategories(input)
    .filter((categoryId) => !covered.has(categoryId))
    .map((categoryId) => getClinicalConsentCategory(categoryId))
    .filter((category): category is ClinicalConsentCategory => Boolean(category))
}

export function applyInformedConsentNormalization(
  data: Partial<InformedConsent> | undefined,
  professionalLicense = '',
  professionalRegistry = '',
): InformedConsent {
  const license = data?.professionalLicense?.trim() || professionalLicense
  const registry = data?.professionalRegistry?.trim() || professionalRegistry || license
  const explicit = Array.isArray(data?.records)
    ? data.records
        .map((record) => parseCategoryRecord(record, license))
        .filter((record): record is CategoryInformedConsent => record !== null)
    : []
  const legacy = migrateLegacySignedConsents(data, license)
  const records = dedupeByCategory([...explicit, ...legacy])

  return projectArchivedConsent({
    selectedConsentIds: [],
    textAccepted: false,
    professionalLicense: license,
    professionalRegistry: registry,
    records,
  })
}

export function createCategoryConsentDraft(params: {
  id: string
  categoryId: ClinicalConsentCategoryId
  templateId?: ConsentTemplateId
  professionalLicense: string
}): CategoryInformedConsent {
  const templateId =
    params.templateId && templateBelongsToCategory(params.templateId, params.categoryId)
      ? params.templateId
      : defaultConsentTemplateForCategory(params.categoryId)
  const license = params.professionalLicense.trim()
  return {
    id: params.id,
    categoryId: params.categoryId,
    templateId,
    status: 'borrador',
    scope: 'categoria_clinica',
    textAccepted: false,
    professionalLicense: license,
    professionalRegistry: license,
  }
}

export function canAddCategoryConsent(
  records: readonly CategoryInformedConsent[],
  categoryId: ClinicalConsentCategoryId,
): string | null {
  const existing = records.find((record) => record.categoryId === categoryId)
  if (!existing) return null
  const label = categoryLabel(categoryId)
  if (existing.status === 'archivado') {
    return `${label} ya tiene un consentimiento firmado y archivado. Cubre las atenciones y los controles de esa categoría.`
  }
  return `Ya hay un consentimiento en borrador para ${label}. Archívelo o cancélelo antes de crear otro.`
}

export function tryArchiveCategoryConsent(
  consent: InformedConsent,
  recordId: string,
  archivedAt: string,
): { ok: true; consent: InformedConsent } | { ok: false; message: string } {
  const current = consent.records.find((record) => record.id === recordId)
  if (!current || current.status !== 'borrador') {
    return { ok: false, message: 'No hay un consentimiento en borrador para archivar.' }
  }
  if (!templateBelongsToCategory(current.templateId, current.categoryId)) {
    return { ok: false, message: 'El texto no corresponde a la categoría clínica seleccionada.' }
  }
  if (current.templateId === FORBIDDEN_GENERAL_CONSENT_TEMPLATE) {
    return {
      ok: false,
      message:
        'Está prohibido archivar un consentimiento general para todo el plan de tratamiento.',
    }
  }
  const duplicate = consent.records.find(
    (record) =>
      record.id !== current.id &&
      record.categoryId === current.categoryId &&
      record.status === 'archivado',
  )
  if (duplicate) {
    return {
      ok: false,
      message: canAddCategoryConsent([duplicate], current.categoryId) ?? 'Categoría ya archivada.',
    }
  }
  if (!current.textAccepted) {
    return { ok: false, message: 'El paciente debe aceptar el texto de esta categoría antes de firmar.' }
  }
  if (!current.professionalLicense.trim()) {
    return { ok: false, message: 'Indique el número de documento del profesional (cédula / ReTHUS).' }
  }
  const patientIssue = signatureIssue(
    'paciente',
    current.patientSignatureDataUrl,
    current.patientSignatureMeta,
  )
  if (patientIssue) return { ok: false, message: patientIssue }
  const professionalIssue = signatureIssue(
    'profesional',
    current.professionalSignatureDataUrl,
    current.professionalSignatureMeta,
  )
  if (professionalIssue) return { ok: false, message: professionalIssue }

  const archived: CategoryInformedConsent = {
    ...current,
    status: 'archivado',
    scope: 'categoria_clinica',
    textAccepted: true,
    professionalLicense: current.professionalLicense.trim(),
    professionalRegistry: current.professionalLicense.trim(),
    signedAt: archivedAt,
    archivedAt,
  }
  const records = dedupeByCategory(
    consent.records.map((record) => (record.id === archived.id ? archived : record)),
  )
  return {
    ok: true,
    consent: projectArchivedConsent({ ...consent, records }),
  }
}

export function validateInformedConsentForRecord(
  consent: InformedConsent,
  input: ConsentCoverageInput,
): string | null {
  const archived = listArchivedCategoryConsents(consent)
  const categories = new Set<ClinicalConsentCategoryId>()
  for (const record of consent.records) {
    if (categories.has(record.categoryId)) {
      return `Solo puede existir un consentimiento para ${categoryLabel(record.categoryId)}. Ese documento cubre todas las atenciones de la categoría.`
    }
    categories.add(record.categoryId)
    if (record.scope !== 'categoria_clinica') {
      return 'El consentimiento se archiva por categoría clínica, no por cita ni por control.'
    }
  }

  const missing = missingArchivedConsentCategories(consent, input)
  if (missing.length > 0) {
    return `Falta firmar y archivar el consentimiento de ${joinLabels(missing.map((category) => category.label))}. Un solo consentimiento de esa categoría cubre las citas y los controles; no cree uno por atención.`
  }

  if (archived.length === 0) {
    return 'Debe firmar y archivar un consentimiento por la categoría clínica del tratamiento. Un mismo consentimiento cubre las citas y controles de esa categoría. Está prohibido usar un consentimiento general para todo el plan.'
  }

  for (const record of archived) {
    const patientIssue = signatureIssue(
      'paciente',
      record.patientSignatureDataUrl,
      record.patientSignatureMeta,
    )
    if (patientIssue) return `${categoryLabel(record.categoryId)}: ${patientIssue}`
    const professionalIssue = signatureIssue(
      'profesional',
      record.professionalSignatureDataUrl,
      record.professionalSignatureMeta,
    )
    if (professionalIssue) return `${categoryLabel(record.categoryId)}: ${professionalIssue}`
  }

  if (consent.records.some((record) => record.status === 'borrador')) {
    return 'Hay un consentimiento sin archivar. Fírmelo y archívelo, o cancélelo, antes de cerrar la atención.'
  }

  return null
}

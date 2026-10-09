import type { ConsentTemplateId } from '@/constants/consentTemplates'

/**
 * Categoría clínica / especialidad del consentimiento informado.
 * La unidad de archivo es la categoría, no la cita ni el plan completo.
 */
export type ClinicalConsentCategoryId =
  | 'ortodoncia'
  | 'operatoria_restauradora'
  | 'cirugia_oral'
  | 'endodoncia'
  | 'periodoncia'
  | 'ortopedia_maxilar'
  | 'rehabilitacion_oral'
  | 'implantologia'
  | 'estetica_dental'

export interface ClinicalConsentCategory {
  id: ClinicalConsentCategoryId
  label: string
  /** Qué atenciones quedan cubiertas por el único consentimiento de la categoría. */
  coverageSummary: string
  templateIds: readonly ConsentTemplateId[]
}

export const CLINICAL_CONSENT_CATEGORIES: readonly ClinicalConsentCategory[] = [
  {
    id: 'ortodoncia',
    label: 'Ortodoncia',
    coverageSummary:
      'Instalación, activaciones, controles y retención del mismo tratamiento de ortodoncia.',
    templateIds: ['ortodoncia_brackets', 'ortodoncia_alineadores'],
  },
  {
    id: 'operatoria_restauradora',
    label: 'Operatoria / Restauradora',
    coverageSummary: 'Restauraciones y controles del mismo plan de operatoria.',
    templateIds: ['operatoria_dental'],
  },
  {
    id: 'cirugia_oral',
    label: 'Cirugía oral',
    coverageSummary: 'Actos quirúrgicos y controles postoperatorios de cirugía oral.',
    templateIds: ['cirugia_oral'],
  },
  {
    id: 'endodoncia',
    label: 'Endodoncia',
    coverageSummary: 'Sesiones y controles del mismo tratamiento de conductos.',
    templateIds: ['endodoncia'],
  },
  {
    id: 'periodoncia',
    label: 'Periodoncia',
    coverageSummary: 'Terapia periodontal, profilaxis y controles de mantenimiento de esa categoría.',
    templateIds: ['periodoncia_limpieza'],
  },
  {
    id: 'ortopedia_maxilar',
    label: 'Ortopedia maxilar',
    coverageSummary: 'Controles del mismo tratamiento de ortopedia maxilar.',
    templateIds: ['ortopedia_maxilar'],
  },
  {
    id: 'rehabilitacion_oral',
    label: 'Rehabilitación oral',
    coverageSummary: 'Preparaciones, pruebas, cementación y controles de la misma rehabilitación.',
    templateIds: ['rehabilitacion_oral'],
  },
  {
    id: 'implantologia',
    label: 'Implantología',
    coverageSummary: 'Cirugía implantológica, controles de oseointegración y citas de esa categoría.',
    templateIds: ['implantes_dentales'],
  },
  {
    id: 'estetica_dental',
    label: 'Estética dental',
    coverageSummary: 'Sesiones y controles del mismo procedimiento estético (carillas o blanqueamiento).',
    templateIds: ['carillas_dentales', 'blanqueamiento_dental'],
  },
]

const categoryById = new Map(CLINICAL_CONSENT_CATEGORIES.map((category) => [category.id, category]))

const categoryByTemplate = new Map<ConsentTemplateId, ClinicalConsentCategory>()
for (const category of CLINICAL_CONSENT_CATEGORIES) {
  for (const templateId of category.templateIds) {
    categoryByTemplate.set(templateId, category)
  }
}

/** Plantilla histórica de un consentimiento único para todo el plan. No es una categoría válida. */
export const FORBIDDEN_GENERAL_CONSENT_TEMPLATE = 'general_odonto' satisfies ConsentTemplateId

export function isClinicalConsentCategoryId(value: string): value is ClinicalConsentCategoryId {
  return categoryById.has(value as ClinicalConsentCategoryId)
}

export function getClinicalConsentCategory(
  id: ClinicalConsentCategoryId,
): ClinicalConsentCategory | undefined {
  return categoryById.get(id)
}

export function categoryForConsentTemplate(
  templateId: ConsentTemplateId,
): ClinicalConsentCategory | null {
  if (templateId === FORBIDDEN_GENERAL_CONSENT_TEMPLATE) return null
  return categoryByTemplate.get(templateId) ?? null
}

export function defaultConsentTemplateForCategory(
  categoryId: ClinicalConsentCategoryId,
): ConsentTemplateId {
  const category = categoryById.get(categoryId)
  if (!category) {
    throw new Error(`Categoría de consentimiento desconocida: ${categoryId}`)
  }
  return category.templateIds[0]
}

export function templateBelongsToCategory(
  templateId: ConsentTemplateId,
  categoryId: ClinicalConsentCategoryId,
): boolean {
  const category = categoryById.get(categoryId)
  return Boolean(category?.templateIds.includes(templateId))
}

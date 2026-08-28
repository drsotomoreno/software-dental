import {
  DEFAULT_IMPLANT_FIXTURE_SIZE,
  FDI_QUADRANT_ORDER,
  IMPLANT_FIXTURE_SIZE_OPTIONS,
  IMPLANT_FIXTURE_TYPE_OPTIONS,
  implantFixtureSizeLabel,
  type ImplantFdiQuadrant,
  type ImplantFixtureSize,
  type ImplantFixtureType,
} from '@/constants/implantPlanning'
import {
  alveolarRidgeClassLabel,
  createEmptyQuadrantBoneClassification,
  lekholmZarbLabel,
  normalizeQuadrantBoneClassification,
  type AlveolarRidgeClass,
  type LekholmZarbBoneType,
  type QuadrantBoneClassification,
} from '@/constants/boneClassification'
import {
  createEmptyEdentulousRehabilitationPlan,
  formatEdentulousRehabilitationPlanSummary,
  normalizeEdentulousRehabilitationPlan,
  type EdentulousRehabilitationPlan,
} from '@/types/implantRehabilitationModality'

export interface PlacedImplant {
  id: string
  quadrant: ImplantFdiQuadrant
  arch: 'upper' | 'lower'
  /** Coordenada X en el sistema del viewBox SVG (0–1000) */
  x: number
  /** Coordenada Y en el sistema del viewBox SVG (0–640) */
  y: number
  /** Rotación del eje del implante en grados */
  rotation: number
  type: ImplantFixtureType
  size: ImplantFixtureSize
  /** Clasificación ósea Lekholm y Zarb específica del implante (opcional) */
  boneType?: LekholmZarbBoneType | ''
  /** Morfología del reborde específica del implante (opcional) */
  ridgeClass?: AlveolarRidgeClass | ''
  notes?: string
}

export interface EdentulousImplantPlan {
  implants: PlacedImplant[]
  /** Tipo seleccionado para la siguiente colocación */
  selectedType: ImplantFixtureType
  /** Tamaño seleccionado para la siguiente colocación */
  selectedSize: ImplantFixtureSize
  /** Clasificación ósea por cuadrante */
  quadrantBoneClassification: QuadrantBoneClassification
  /** Modalidad de rehabilitación protésica por arco */
  rehabilitationPlan: EdentulousRehabilitationPlan
}

export function createEmptyEdentulousImplantPlan(): EdentulousImplantPlan {
  return {
    implants: [],
    selectedType: 'standard',
    selectedSize: DEFAULT_IMPLANT_FIXTURE_SIZE,
    quadrantBoneClassification: createEmptyQuadrantBoneClassification(),
    rehabilitationPlan: createEmptyEdentulousRehabilitationPlan(),
  }
}

function isLekholmZarbBoneType(value: unknown): value is LekholmZarbBoneType {
  return value === 'I' || value === 'II' || value === 'III' || value === 'IV'
}

function isAlveolarRidgeClass(value: unknown): value is AlveolarRidgeClass {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D' || value === 'E'
}

export function getEffectiveImplantBoneAssessment(
  implant: PlacedImplant,
  plan: EdentulousImplantPlan,
) {
  const quadrantAssessment = plan.quadrantBoneClassification[implant.quadrant]
  return {
    boneType: implant.boneType || quadrantAssessment.lekholmZarb,
    ridgeClass: implant.ridgeClass || quadrantAssessment.ridgeClass,
  }
}

function isImplantFixtureType(value: unknown): value is ImplantFixtureType {
  return IMPLANT_FIXTURE_TYPE_OPTIONS.some((item) => item.id === value)
}

function isImplantFixtureSize(value: unknown): value is ImplantFixtureSize {
  return IMPLANT_FIXTURE_SIZE_OPTIONS.some((item) => item.id === value)
}

function isImplantFdiQuadrant(value: unknown): value is ImplantFdiQuadrant {
  return FDI_QUADRANT_ORDER.includes(value as ImplantFdiQuadrant)
}

function normalizePlacedImplant(data: Partial<PlacedImplant>): PlacedImplant | null {
  if (!data.id || typeof data.x !== 'number' || typeof data.y !== 'number') return null
  if (!isImplantFdiQuadrant(data.quadrant)) return null
  if (data.arch !== 'upper' && data.arch !== 'lower') return null

  return {
    id: String(data.id),
    quadrant: data.quadrant,
    arch: data.arch,
    x: data.x,
    y: data.y,
    rotation: typeof data.rotation === 'number' ? data.rotation : 0,
    type: isImplantFixtureType(data.type) ? data.type : 'standard',
    size: isImplantFixtureSize(data.size) ? data.size : DEFAULT_IMPLANT_FIXTURE_SIZE,
    boneType:
      data.boneType === '' || isLekholmZarbBoneType(data.boneType) ? data.boneType : undefined,
    ridgeClass:
      data.ridgeClass === '' || isAlveolarRidgeClass(data.ridgeClass) ? data.ridgeClass : undefined,
    notes: typeof data.notes === 'string' ? data.notes : undefined,
  }
}

export function normalizeEdentulousImplantPlan(
  data?: Partial<EdentulousImplantPlan>,
): EdentulousImplantPlan {
  const empty = createEmptyEdentulousImplantPlan()
  const implants = Array.isArray(data?.implants)
    ? data.implants
        .map((item) => normalizePlacedImplant(item))
        .filter((item): item is PlacedImplant => item !== null)
    : []

  return {
    implants,
    selectedType: isImplantFixtureType(data?.selectedType) ? data.selectedType : empty.selectedType,
    selectedSize: isImplantFixtureSize(data?.selectedSize) ? data.selectedSize : empty.selectedSize,
    quadrantBoneClassification: normalizeQuadrantBoneClassification(data?.quadrantBoneClassification),
    rehabilitationPlan: normalizeEdentulousRehabilitationPlan(data?.rehabilitationPlan),
  }
}

function formatBoneAssessmentSummary(boneType: LekholmZarbBoneType | '', ridgeClass: AlveolarRidgeClass | '') {
  const parts = [lekholmZarbLabel(boneType), alveolarRidgeClassLabel(ridgeClass)].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : ''
}

export function formatQuadrantBoneClassificationSummary(plan: EdentulousImplantPlan): string {
  const lines = FDI_QUADRANT_ORDER.map((quadrant) => {
    const assessment = plan.quadrantBoneClassification[quadrant]
    const summary = formatBoneAssessmentSummary(assessment.lekholmZarb, assessment.ridgeClass)
    return summary ? `${quadrant}: ${summary}` : ''
  }).filter(Boolean)

  return lines.length > 0 ? `Clasificación ósea: ${lines.join(' · ')}` : ''
}

export function formatEdentulousImplantPlanSummary(plan: EdentulousImplantPlan): string {
  const boneSummary = formatQuadrantBoneClassificationSummary(plan)
  const rehabilitationSummary = formatEdentulousRehabilitationPlanSummary(plan.rehabilitationPlan)

  const byQuadrant = FDI_QUADRANT_ORDER.map((quadrant) => {
    const items = plan.implants.filter((item) => item.quadrant === quadrant)
    if (items.length === 0) return ''
    const labels = items
      .map((item, index) => {
        const bone = getEffectiveImplantBoneAssessment(item, plan)
        const boneSummaryItem = formatBoneAssessmentSummary(bone.boneType, bone.ridgeClass)
        const boneSuffix = boneSummaryItem ? ` · ${boneSummaryItem}` : ''
        return `#${index + 1} ${item.arch === 'upper' ? 'sup.' : 'inf.'} · ${implantFixtureSizeLabel(item.size)}${boneSuffix} (${Math.round(item.x)},${Math.round(item.y)})`
      })
      .join(', ')
    return `${quadrant}: ${labels}`
  }).filter(Boolean)

  const implantSummary =
    byQuadrant.length > 0 ? `Implantes: ${byQuadrant.join(' · ')}` : ''

  return [boneSummary, rehabilitationSummary, implantSummary].filter(Boolean).join(' · ')
}

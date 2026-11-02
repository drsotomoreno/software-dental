import type { PeriodonticsAnnex } from '@/types/periodonticsAnnex'
import { createEmptyPeriodonticsAnnex, normalizePeriodonticsAnnex } from '@/utils/periodonticsAnnex'
import type {
  CrowdingSpacingValue,
  FacialAnalysis,
  MalocclusionAssessment,
  MidlineDeviationValue,
  OrthodonticTreatmentType,
  ConventionalBracketType,
  AlignerTreatmentMode,
  AlignerPhaseCount,
  MaxillaryOrthopedicsAppliance,
  OrthodonticTreatmentDurationMonths,
} from '@/types/orthodonticsAnnex'
import {
  createEmptyCrowdingSpacingValue,
  createEmptyFacialAnalysis,
  createEmptyMalocclusionAssessment,
  createEmptyMidlineDeviation,
  createEmptyMaxillaryOrthopedicsAppliance,
  type OverjetAssessment,
  type OverbiteAssessment,
} from '@/types/orthodonticsAnnex'
import { normalizeOrthodonticsAnnex } from '@/utils/orthodonticsAnnex'
import type { OrthodonticBudgetState } from '@/components/clinical/orthodontics/calculator/types'
import type { RehabilitationAestheticsAnnex, RehabPlanningSchema } from '@/types/rehabilitationAestheticsAnnex'
import {
  createEmptyRehabilitationAestheticsAnnex,
  normalizeRehabilitationAestheticsAnnex,
  normalizeRehabPlanningSchema,
} from '@/types/rehabilitationAestheticsAnnex'
import {
  normalizeEdentulousImplantPlan,
  type EdentulousImplantPlan,
} from '@/types/dentalImplantsPlanning'
import {
  createEmptyQuadrantBoneClassification,
  normalizeQuadrantBoneClassification,
  type QuadrantBoneClassification,
} from '@/constants/boneClassification'
import {
  createEmptyUnifiedImplantPlan,
  normalizeUnifiedImplantPlan,
  unifiedImplantPlanHasContent,
  type UnifiedImplantPlan,
  createEmptyUnifiedTreatment,
} from '@/types/unifiedImplantPlan'
import {
  createEmptyImplantMedicalAnamnesis,
  normalizeImplantMedicalAnamnesis,
  type ImplantMedicalAnamnesis,
} from '@/types/implantMedicalAnamnesis'
import {
  createEmptyImplantPeriodontalAssessment,
  normalizeImplantPeriodontalAssessment,
  type ImplantPeriodontalAssessment,
} from '@/types/implantPeriodontalAssessment'
import {
  createEmptyOralSurgeryAnnex,
  normalizeOralSurgeryAnnex,
  resolveImplantSurgicalRiskAssessment,
  type OralSurgeryAnnex,
} from '@/types/oralSurgeryAnnex'
import type { EndoAnnexData } from '@/types/endoAnnex.types'
import { createEmptyEndoAnnexData, normalizeEndoAnnexData } from '@/utils/endoAnnex'

export type { PeriodonticsAnnex } from '@/types/periodonticsAnnex'
export type { RehabilitationAestheticsAnnex, RehabPlanningSchema } from '@/types/rehabilitationAestheticsAnnex'
export type { EdentulousImplantPlan, PlacedImplant } from '@/types/dentalImplantsPlanning'
export type { UnifiedImplantPlan } from '@/types/unifiedImplantPlan'
export type { ImplantMedicalAnamnesis } from '@/types/implantMedicalAnamnesis'
export type { ImplantPeriodontalAssessment } from '@/types/implantPeriodontalAssessment'
export type { OralSurgeryAnnex } from '@/types/oralSurgeryAnnex'
export type { EndoAnnexData } from '@/types/endoAnnex.types'

export interface OrthodonticsAnnex {
  facialProfile: FacialAnalysis
  malocclusionAssessment: MalocclusionAssessment
  midlineDeviation: MidlineDeviationValue
  crowdingSpacingAssessment: CrowdingSpacingValue
  /** @deprecated Usar malocclusionAssessment.overjet / overbite */
  overjet?: OverjetAssessment | string
  /** @deprecated Usar malocclusionAssessment.overjet / overbite */
  overbite?: OverbiteAssessment | string
  /** @deprecated Usar overjet / overbite */
  overjetOverbite?: string
  /** @deprecated Texto libre legado — migrado a notas si aplica */
  midline?: string
  /** @deprecated Texto libre legado — migrado a notas si aplica */
  crowdingSpacing?: string
  /** @deprecated Texto libre legado — migrado a notas si aplica */
  malocclusion?: string
  treatmentType: OrthodonticTreatmentType
  /** Subtipo al elegir Ortodoncia Convencional con Brackets */
  conventionalBracketType: ConventionalBracketType
  /** Modalidad al elegir Ortodoncia con Alineadores */
  alignerTreatmentMode: AlignerTreatmentMode
  /** Número de fases si el tratamiento con alineadores es por fases */
  alignerPhaseCount: AlignerPhaseCount
  maxillaryOrthopedicsAppliance: MaxillaryOrthopedicsAppliance
  orthodonticBudget: OrthodonticBudgetState | null
  /** @deprecated Usar orthodonticBudget */
  treatmentObjectives?: string
  /** @deprecated Sección eliminada del formulario */
  appliancePlan?: string
  treatmentDurationMonths: OrthodonticTreatmentDurationMonths
  /** @deprecated Usar treatmentDurationMonths */
  estimatedDuration?: string
  notes: string
}

export interface DentalImplantsAnnex {
  /** Anamnesis médica y evaluación de riesgo sistémico previa a implantes */
  medicalAnamnesis: ImplantMedicalAnamnesis
  /** Evaluación quirúrgica detallada (coagulación, MRONJ, alergias, etc.) */
  surgicalRiskAssessment: OralSurgeryAnnex
  /** Evaluación periodontal y gingival pre-implante */
  periodontalAssessment: ImplantPeriodontalAssessment
  notes: string
  /** Clasificación ósea Lekholm y Zarb por cuadrante FDI */
  quadrantBoneClassification: QuadrantBoneClassification
  /** Planificador unificado dentado / edéntulo (offline-first / IndexedDB) */
  unifiedImplantPlan: UnifiedImplantPlan
  /**
   * @deprecated Migrado a `unifiedImplantPlan`. Se conserva en normalización para lecturas legacy.
   */
  visualTreatmentPlan?: RehabPlanningSchema['visualTreatmentPlan']
  /** @deprecated Migrado a `unifiedImplantPlan`. */
  protesisTotal?: RehabPlanningSchema['protesisTotal']
  /** @deprecated Migrado a `unifiedImplantPlan`. */
  protesisParcialRemovible?: RehabPlanningSchema['protesisParcialRemovible']
  /** @deprecated Migrado a `unifiedImplantPlan`. */
  restorationDetails?: RehabPlanningSchema['restorationDetails']
  /** @deprecated Migrado a `unifiedImplantPlan` + `quadrantBoneClassification`. */
  implantPlacementPlan?: EdentulousImplantPlan
}

export type EndodonticsAnnex = EndoAnnexData

export interface SpecializedAnnexes {
  periodontics: PeriodonticsAnnex
  orthodontics: OrthodonticsAnnex
  endodontics: EndodonticsAnnex
  dentalImplants: DentalImplantsAnnex
  oralSurgery: OralSurgeryAnnex
  rehabilitationAesthetics: RehabilitationAestheticsAnnex
}

export type SpecializedAnnexKey = keyof SpecializedAnnexes

export const SPECIALIZED_ANNEX_LABELS: Record<SpecializedAnnexKey, string> = {
  periodontics: 'Anexo de Periodoncia',
  orthodontics: 'Anexo de Ortodoncia',
  endodontics: 'Anexo de Endodoncia',
  dentalImplants: 'Anexo de Implantes Dentales',
  oralSurgery: 'Anexo de Cirugía Oral General',
  rehabilitationAesthetics: 'Anexo Rehabilitación, Estética y Aclaramiento',
}

function createEmptyOrthodonticsAnnex(): OrthodonticsAnnex {
  return {
    facialProfile: createEmptyFacialAnalysis(),
    malocclusionAssessment: createEmptyMalocclusionAssessment(),
    midlineDeviation: createEmptyMidlineDeviation(),
    crowdingSpacingAssessment: createEmptyCrowdingSpacingValue(),
    treatmentType: '',
    conventionalBracketType: '',
    alignerTreatmentMode: '',
    alignerPhaseCount: '',
    maxillaryOrthopedicsAppliance: createEmptyMaxillaryOrthopedicsAppliance(),
    orthodonticBudget: null,
    treatmentDurationMonths: null,
    notes: '',
  }
}

function createEmptyDentalImplantsAnnex(): DentalImplantsAnnex {
  return {
    medicalAnamnesis: createEmptyImplantMedicalAnamnesis(),
    surgicalRiskAssessment: createEmptyOralSurgeryAnnex(),
    periodontalAssessment: createEmptyImplantPeriodontalAssessment(),
    notes: '',
    quadrantBoneClassification: createEmptyQuadrantBoneClassification(),
    unifiedImplantPlan: createEmptyUnifiedImplantPlan(),
  }
}

function hasRehabPlanningContent(planning: RehabPlanningSchema): boolean {
  return (
    planning.visualTreatmentPlan.length > 0 ||
    Boolean(planning.protesisTotal) ||
    Boolean(planning.protesisParcialRemovible) ||
    Object.keys(planning.restorationDetails).length > 0
  )
}

/** Migra plan visual dentado legacy → tratamientos FDI del plan unificado. */
function migrateLegacyVisualPlanToUnified(
  planning: RehabPlanningSchema,
): UnifiedImplantPlan {
  const plan = createEmptyUnifiedImplantPlan()
  const upper = new Set([11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28])

  for (const entry of planning.visualTreatmentPlan) {
    if (!entry.tratamiento || (entry.tratamiento !== 'implante' && entry.tratamiento !== 'pontico_ppf')) {
      continue
    }
    const fdi = Number(entry.dienteId)
    if (!Number.isFinite(fdi)) continue

    const treatment = createEmptyUnifiedTreatment({
      piezaFDI: fdi,
      tipo: entry.tratamiento === 'pontico_ppf' ? 'pontico' : 'implante_unitario',
      faseQuirurgica: {
        marcaManual: '',
        medida: entry.implantSize ?? '',
      },
    })

    if (upper.has(fdi)) {
      plan.maxilarSuperior.tratamientos.push(treatment)
    } else {
      plan.mandibula.tratamientos.push(treatment)
    }
  }

  return plan
}

/** Migra marcadores edéntulos legacy → slots de reborde del plan unificado. */
function migrateLegacyEdentulousPlanToUnified(
  legacy: EdentulousImplantPlan,
  base: UnifiedImplantPlan,
): UnifiedImplantPlan {
  const next = normalizeUnifiedImplantPlan(base)
  const upper = legacy.implants.filter((item) => item.arch === 'upper')
  const lower = legacy.implants.filter((item) => item.arch === 'lower')

  if (upper.length > 0) {
    next.maxilarSuperior.estado = 'edentulo'
    next.maxilarSuperior.implantes = upper.map((item, index) =>
      createEmptyUnifiedTreatment({
        id: item.id,
        posicionReborde: index,
        tipo: 'implante_unitario',
        faseQuirurgica: { marcaManual: '', medida: item.size },
      }),
    )
  }

  if (lower.length > 0) {
    next.mandibula.estado = 'edentulo'
    next.mandibula.implantes = lower.map((item, index) =>
      createEmptyUnifiedTreatment({
        id: item.id,
        posicionReborde: index,
        tipo: 'implante_unitario',
        faseQuirurgica: { marcaManual: '', medida: item.size },
      }),
    )
  }

  return next
}

function normalizeDentalImplantsAnnex(
  data?: Partial<DentalImplantsAnnex>,
  legacyRehabPlanning?: Partial<RehabPlanningSchema>,
  standaloneOralSurgery?: Partial<OralSurgeryAnnex>,
): DentalImplantsAnnex {
  const empty = createEmptyDentalImplantsAnnex()
  const legacyPlacement = normalizeEdentulousImplantPlan(data?.implantPlacementPlan)

  const planning = normalizeRehabPlanningSchema({
    visualTreatmentPlan: data?.visualTreatmentPlan,
    protesisTotal: data?.protesisTotal,
    protesisParcialRemovible: data?.protesisParcialRemovible,
    restorationDetails: data?.restorationDetails,
  })

  const migratedPlanning =
    !hasRehabPlanningContent(planning) && legacyRehabPlanning
      ? normalizeRehabPlanningSchema(legacyRehabPlanning)
      : planning

  let unifiedImplantPlan = normalizeUnifiedImplantPlan(data?.unifiedImplantPlan)
  if (!unifiedImplantPlanHasContent(unifiedImplantPlan)) {
    if (hasRehabPlanningContent(migratedPlanning)) {
      unifiedImplantPlan = migrateLegacyVisualPlanToUnified(migratedPlanning)
    }
    if (legacyPlacement.implants.length > 0) {
      unifiedImplantPlan = migrateLegacyEdentulousPlanToUnified(
        legacyPlacement,
        unifiedImplantPlan,
      )
    }
  }

  const quadrantBoneClassification = normalizeQuadrantBoneClassification(
    data?.quadrantBoneClassification ?? legacyPlacement.quadrantBoneClassification,
  )

  return {
    medicalAnamnesis: normalizeImplantMedicalAnamnesis(data?.medicalAnamnesis),
    surgicalRiskAssessment: resolveImplantSurgicalRiskAssessment(
      data?.surgicalRiskAssessment,
      standaloneOralSurgery,
    ),
    periodontalAssessment: normalizeImplantPeriodontalAssessment(data?.periodontalAssessment),
    notes: data?.notes ?? empty.notes,
    quadrantBoneClassification,
    unifiedImplantPlan,
  }
}

export function createEmptySpecializedAnnexes(): SpecializedAnnexes {
  return {
    periodontics: createEmptyPeriodonticsAnnex(),
    orthodontics: createEmptyOrthodonticsAnnex(),
    endodontics: createEmptyEndoAnnexData(),
    dentalImplants: createEmptyDentalImplantsAnnex(),
    oralSurgery: createEmptyOralSurgeryAnnex(),
    rehabilitationAesthetics: createEmptyRehabilitationAestheticsAnnex(),
  }
}

export function normalizeSpecializedAnnexes(
  data?: Partial<SpecializedAnnexes>,
): SpecializedAnnexes {
  const empty = createEmptySpecializedAnnexes()
  return {
    periodontics: normalizePeriodonticsAnnex(data?.periodontics),
    orthodontics: normalizeOrthodonticsAnnex(data?.orthodontics),
    endodontics: normalizeEndoAnnexData(data?.endodontics),
    dentalImplants: normalizeDentalImplantsAnnex(
      data?.dentalImplants,
      data?.rehabilitationAesthetics as Partial<RehabPlanningSchema> | undefined,
      data?.oralSurgery,
    ),
    oralSurgery: normalizeOralSurgeryAnnex(data?.oralSurgery),
    rehabilitationAesthetics: normalizeRehabilitationAestheticsAnnex(data?.rehabilitationAesthetics),
  }
}

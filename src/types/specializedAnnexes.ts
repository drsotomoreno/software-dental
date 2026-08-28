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
  createEmptyRehabPlanningSchema,
  normalizeRehabilitationAestheticsAnnex,
  normalizeRehabPlanningSchema,
} from '@/types/rehabilitationAestheticsAnnex'
import {
  createEmptyEdentulousImplantPlan,
  normalizeEdentulousImplantPlan,
  type EdentulousImplantPlan,
} from '@/types/dentalImplantsPlanning'
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
  visualTreatmentPlan: RehabPlanningSchema['visualTreatmentPlan']
  protesisTotal: RehabPlanningSchema['protesisTotal']
  protesisParcialRemovible: RehabPlanningSchema['protesisParcialRemovible']
  restorationDetails: RehabPlanningSchema['restorationDetails']
  /** Planificación interactiva sobre arcos edéntulos */
  implantPlacementPlan: EdentulousImplantPlan
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
    ...createEmptyRehabPlanningSchema(),
    implantPlacementPlan: createEmptyEdentulousImplantPlan(),
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

function normalizeDentalImplantsAnnex(
  data?: Partial<DentalImplantsAnnex>,
  legacyRehabPlanning?: Partial<RehabPlanningSchema>,
  standaloneOralSurgery?: Partial<OralSurgeryAnnex>,
): DentalImplantsAnnex {
  const empty = createEmptyDentalImplantsAnnex()
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

  return {
    medicalAnamnesis: normalizeImplantMedicalAnamnesis(data?.medicalAnamnesis),
    surgicalRiskAssessment: resolveImplantSurgicalRiskAssessment(
      data?.surgicalRiskAssessment,
      standaloneOralSurgery,
    ),
    periodontalAssessment: normalizeImplantPeriodontalAssessment(data?.periodontalAssessment),
    notes: data?.notes ?? empty.notes,
    ...migratedPlanning,
    implantPlacementPlan: normalizeEdentulousImplantPlan(data?.implantPlacementPlan),
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

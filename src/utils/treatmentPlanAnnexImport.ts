import { calculateTotal } from '@/components/clinical/orthodontics/calculator/types'
import type { TreatmentPlanItem } from '@/types/clinicalRecord'
import { formatEndoProcedureLabel } from '@/utils/endoAnnex'
import { generateId } from '@/utils/crypto'
import { ZONE_GENERAL, parseAnatomicalZone } from '@/utils/treatmentPlanZone'
import { DEFAULT_PHASE_PROCEDURES } from '@/types/periodonticsAnnex'
import type { SpecializedAnnexes } from '@/types/specializedAnnexes'
import { formatOrthodonticTreatmentPlan } from '@/types/orthodonticsAnnex'

const DEFAULT_TREATMENT_PHASE = 'fase_ii' as const
/** Homólogo que ya sincroniza el anexo de endodoncia con el plan. */
const ENDO_CUPS_CODE = '997401'

function blankItem(
  patch: Partial<TreatmentPlanItem> & Pick<TreatmentPlanItem, 'procedure' | 'source'>,
): TreatmentPlanItem {
  const zone = parseAnatomicalZone(patch.anatomicalZone ?? '')
  return {
    id: generateId(),
    phase: DEFAULT_TREATMENT_PHASE,
    quantity: 1,
    unitPrice: 0,
    patientApproved: 'pendiente',
    executionStatus: 'pendiente',
    ...patch,
    anatomicalZone: zone.anatomicalZone || patch.anatomicalZone,
    toothNumber: patch.toothNumber ?? zone.toothNumber,
    fdiQuadrant: patch.fdiQuadrant ?? zone.fdiQuadrant,
    arch: patch.arch ?? zone.arch,
  }
}

function sameProcedure(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

function alreadyImported(plan: TreatmentPlanItem[], candidate: TreatmentPlanItem): boolean {
  return plan.some((item) => {
    if (candidate.source === 'orthodontics_annex' && item.source === 'orthodontics_annex') {
      return true
    }
    if (
      candidate.source === 'endodontics_annex' &&
      item.source === 'endodontics_annex' &&
      item.toothNumber === candidate.toothNumber
    ) {
      return true
    }
    if (
      candidate.source &&
      item.source === candidate.source &&
      item.toothNumber === candidate.toothNumber &&
      (item.cupsCode ?? '') === (candidate.cupsCode ?? '') &&
      sameProcedure(item.procedure, candidate.procedure)
    ) {
      return true
    }
    return (
      sameProcedure(item.procedure, candidate.procedure) &&
      (item.toothNumber ?? 0) === (candidate.toothNumber ?? 0) &&
      (item.cupsCode ?? '') === (candidate.cupsCode ?? '')
    )
  })
}

function collectAnnexItems(annexes: SpecializedAnnexes | undefined): TreatmentPlanItem[] {
  if (!annexes) return []
  const items: TreatmentPlanItem[] = []

  const endodontics = annexes.endodontics
  const endoBudget = endodontics?.budget
  const endoDiagnosis = endodontics?.diagnosis?.find((entry) => entry.code?.trim())
  if (endoBudget?.active) {
    for (const line of endoBudget.toothLines) {
      if (!(line.toothNumber > 0) || !(line.unitPrice > 0)) continue
      const zone = parseAnatomicalZone(String(line.toothNumber))
      items.push(
        blankItem({
          phase: 'fase_iii',
          procedure: formatEndoProcedureLabel(line.toothNumber, endodontics.isRetreatment),
          cupsCode: ENDO_CUPS_CODE,
          toothNumber: zone.toothNumber,
          anatomicalZone: zone.anatomicalZone,
          unitPrice: line.unitPrice,
          diagnosisCode: endoDiagnosis?.code,
          diagnosisDescription: endoDiagnosis?.description,
          source: 'endodontics_annex',
        }),
      )
    }
  }

  const orthodontics = annexes.orthodontics
  if (orthodontics?.treatmentType) {
    const procedure =
      formatOrthodonticTreatmentPlan({
        treatmentType: orthodontics.treatmentType,
        conventionalBracketType: orthodontics.conventionalBracketType,
        alignerTreatmentMode: orthodontics.alignerTreatmentMode,
        alignerPhaseCount: orthodontics.alignerPhaseCount,
        maxillaryOrthopedicsAppliance: orthodontics.maxillaryOrthopedicsAppliance,
      }) || 'Tratamiento de ortodoncia'
    const total = orthodontics.orthodonticBudget
      ? calculateTotal(orthodontics.orthodonticBudget)
      : 0
    items.push(
      blankItem({
        procedure,
        unitPrice: total,
        anatomicalZone: ZONE_GENERAL,
        source: 'orthodontics_annex',
      }),
    )
  }

  const surgicalPlans = [
    ...(annexes.oralSurgery?.treatmentPlan ?? []),
    ...(annexes.dentalImplants?.surgicalRiskAssessment?.treatmentPlan ?? []),
  ]
  for (const line of surgicalPlans) {
    if (!line.procedure?.trim() && !line.cupsCode?.trim()) continue
    const zone =
      line.toothNumber > 0
        ? parseAnatomicalZone(String(line.toothNumber))
        : parseAnatomicalZone(ZONE_GENERAL)
    items.push(
      blankItem({
        procedure: line.procedure?.trim() || line.cupsCode,
        cupsCode: line.cupsCode || undefined,
        toothNumber: zone.toothNumber,
        anatomicalZone: zone.anatomicalZone,
        source: 'oral_surgery_annex',
      }),
    )
  }

  for (const row of annexes.periodontics?.treatmentPlan ?? []) {
    const procedure = row.procedure?.trim() ?? ''
    if (!procedure) continue
    const isDefault = procedure === DEFAULT_PHASE_PROCEDURES[row.phase]
    const customized = !isDefault || Boolean(row.plannedDate?.trim() || row.notes?.trim() || row.status !== 'pendiente')
    if (!customized) continue
    items.push(
      blankItem({
        phase: row.phase === 'fase_i' || row.phase === 'fase_ii' || row.phase === 'fase_iii' ? row.phase : DEFAULT_TREATMENT_PHASE,
        procedure,
        anatomicalZone: ZONE_GENERAL,
        source: 'periodontics_annex',
      }),
    )
  }

  return items
}

/** Filas nuevas que el botón «Importar desde anexos» agregaría. */
export function previewAnnexTreatmentImports(
  annexes: SpecializedAnnexes | undefined,
  plan: TreatmentPlanItem[],
): TreatmentPlanItem[] {
  return collectAnnexItems(annexes).filter((item) => !alreadyImported(plan, item))
}

export function importAnnexesToTreatmentPlan(
  annexes: SpecializedAnnexes | undefined,
  plan: TreatmentPlanItem[],
  resolvePrice: (cupsCode?: string) => number = () => 0,
): TreatmentPlanItem[] {
  const additions = previewAnnexTreatmentImports(annexes, plan).map((item) => {
    if ((item.unitPrice ?? 0) > 0) return item
    const price = resolvePrice(item.cupsCode)
    return price > 0 ? { ...item, unitPrice: price } : item
  })
  return additions.length > 0 ? [...plan, ...additions] : plan
}

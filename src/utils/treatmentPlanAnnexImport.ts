import { calculateTotal } from '@/components/clinical/orthodontics/calculator/types'
import {
  implantFixtureSizeLabel,
  implantFixtureTypeLabel,
} from '@/constants/implantPlanning'
import {
  formatDentalWhiteningPlan,
  hasDentalWhiteningSelection,
  REHAB_DENTAL_WHITENING_OPTIONS,
  type RehabDentalWhiteningPlan,
  type RehabDentalWhiteningType,
} from '@/constants/dentalWhitening'
import {
  ENDODONTIC_THERAPY_CUPS,
  OPERATIVE_RESTORATION_CUPS,
  PROSTHETIC_RESTORATION_CUPS,
} from '@/constants/rips'
import type { TreatmentPlanItem } from '@/types/clinicalRecord'
import type { EndoAnnexData } from '@/types/endoAnnex.types'
import { formatEndoProcedureLabel } from '@/utils/endoAnnex'
import { generateId } from '@/utils/crypto'
import {
  EDENTULOUS_ARCH_LABELS,
  getArchRehabilitationSummaryDetails,
  type EdentulousArchKey,
} from '@/types/implantRehabilitationModality'
import type { EdentulousImplantPlan } from '@/types/dentalImplantsPlanning'
import { DEFAULT_PHASE_PROCEDURES, PERIODONTAL_SITE_KEYS } from '@/types/periodonticsAnnex'
import type { PeriodonticsAnnex } from '@/types/periodonticsAnnex'
import type {
  RehabPlanningSchema,
  RehabProtesisTotalScope,
  RehabTreatmentType,
  RehabVisualPlanEntry,
} from '@/types/rehabilitationAestheticsAnnex'
import { formatRehabArchProsthesisScope } from '@/types/rehabilitationAestheticsAnnex'
import type { SpecializedAnnexes } from '@/types/specializedAnnexes'
import { formatOrthodonticTreatmentPlan } from '@/types/orthodonticsAnnex'
import { ZONE_GENERAL, ZONE_LOWER_ARCH, ZONE_UPPER_ARCH, parseAnatomicalZone } from '@/utils/treatmentPlanZone'

const DEFAULT_TREATMENT_PHASE = 'fase_ii' as const

const VISUAL_PLAN_PROCEDURES: Record<RehabTreatmentType, { procedure: string; cupsCode: string }> = {
  corona_individual: {
    procedure: 'Corona individual',
    cupsCode: PROSTHETIC_RESTORATION_CUPS.coronaIndividualSod,
  },
  carilla: { procedure: 'Carilla dental', cupsCode: '997206' },
  implante: { procedure: 'Implante dental osteointegrado', cupsCode: '997701' },
  pilar_ppf: {
    procedure: 'Pilar de prótesis parcial fija',
    cupsCode: PROSTHETIC_RESTORATION_CUPS.protesisFijaUnidad,
  },
  pontico_ppf: {
    procedure: 'Póntico de prótesis parcial fija',
    cupsCode: PROSTHETIC_RESTORATION_CUPS.protesisFijaUnidad,
  },
  incrustacion: {
    procedure: 'Incrustación',
    cupsCode: OPERATIVE_RESTORATION_CUPS.incrustacionNoMetalica,
  },
}

const WHITENING_CUPS: Record<RehabDentalWhiteningType, string> = {
  casero: '997205',
  consultorio: '237903',
  diente_oscurecido: '237901',
}

type AnnexPlanSource = NonNullable<TreatmentPlanItem['source']>

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

function sameLocation(left: TreatmentPlanItem, right: TreatmentPlanItem): boolean {
  const leftTooth = left.toothNumber ?? 0
  const rightTooth = right.toothNumber ?? 0
  if (leftTooth > 0 || rightTooth > 0) return leftTooth === rightTooth
  const leftZone = (left.anatomicalZone ?? '').trim().toLowerCase()
  const rightZone = (right.anatomicalZone ?? '').trim().toLowerCase()
  if (leftZone || rightZone) return leftZone === rightZone
  return true
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
      sameLocation(item, candidate) &&
      (item.cupsCode ?? '') === (candidate.cupsCode ?? '') &&
      sameProcedure(item.procedure, candidate.procedure)
    ) {
      return true
    }
    return (
      sameProcedure(item.procedure, candidate.procedure) &&
      sameLocation(item, candidate) &&
      (item.cupsCode ?? '') === (candidate.cupsCode ?? '')
    )
  })
}

function pushEndoTooth(
  items: TreatmentPlanItem[],
  seenTeeth: Set<number>,
  toothNumber: number,
  isRetreatment: boolean,
  unitPrice: number,
  diagnosisCode?: string,
  diagnosisDescription?: string,
) {
  if (!(toothNumber > 0) || seenTeeth.has(toothNumber)) return
  seenTeeth.add(toothNumber)
  const zone = parseAnatomicalZone(String(toothNumber))
  items.push(
    blankItem({
      phase: 'fase_iii',
      procedure: formatEndoProcedureLabel(toothNumber, isRetreatment),
      cupsCode: ENDODONTIC_THERAPY_CUPS.unirradicular,
      toothNumber: zone.toothNumber,
      anatomicalZone: zone.anatomicalZone,
      unitPrice,
      diagnosisCode,
      diagnosisDescription,
      source: 'endodontics_annex',
    }),
  )
}

function endoToothHasClinicalPlan(endodontics: EndoAnnexData, toothNumber: number): boolean {
  if (!(toothNumber > 0)) return false
  if (endodontics.isRetreatment || endodontics.complexityLevel || endodontics.notes.trim()) return true
  if (endodontics.diagnosis.some((entry) => entry.code?.trim() || entry.description?.trim())) return true
  if (endodontics.canals.length > 0) return true
  if (
    endodontics.radiographicFindings.selected.length > 0 ||
    endodontics.radiographicFindings.notes.trim()
  ) {
    return true
  }
  const tests = endodontics.clinicalTests
  return Boolean(
    tests.thermalCold || tests.thermalPersistentPain || tests.percussion || tests.palpation,
  )
}

function collectEndodonticsItems(endodontics: EndoAnnexData | undefined): TreatmentPlanItem[] {
  if (!endodontics) return []
  const items: TreatmentPlanItem[] = []
  const seenTeeth = new Set<number>()
  const diagnosis = endodontics.diagnosis.find((entry) => entry.code?.trim() || entry.description?.trim())
  const budget = endodontics.budget

  for (const line of budget?.toothLines ?? []) {
    if (!(line.toothNumber > 0)) continue
    pushEndoTooth(
      items,
      seenTeeth,
      line.toothNumber,
      endodontics.isRetreatment,
      line.unitPrice > 0 ? line.unitPrice : 0,
      diagnosis?.code,
      diagnosis?.description,
    )
  }

  const clinicalTooth = endodontics.toothNumber ?? 0
  if (endoToothHasClinicalPlan(endodontics, clinicalTooth)) {
    pushEndoTooth(
      items,
      seenTeeth,
      clinicalTooth,
      endodontics.isRetreatment,
      0,
      diagnosis?.code,
      diagnosis?.description,
    )
  }

  return items
}

function collectOrthodonticsItem(
  orthodontics: SpecializedAnnexes['orthodontics'] | undefined,
): TreatmentPlanItem[] {
  if (!orthodontics) return []
  const total = orthodontics.orthodonticBudget ? calculateTotal(orthodontics.orthodonticBudget) : 0
  if (!orthodontics.treatmentType && !(total > 0)) return []
  const procedure =
    formatOrthodonticTreatmentPlan({
      treatmentType: orthodontics.treatmentType,
      conventionalBracketType: orthodontics.conventionalBracketType,
      alignerTreatmentMode: orthodontics.alignerTreatmentMode,
      alignerPhaseCount: orthodontics.alignerPhaseCount,
      maxillaryOrthopedicsAppliance: orthodontics.maxillaryOrthopedicsAppliance,
    }) || 'Tratamiento de ortodoncia'
  return [
    blankItem({
      procedure,
      unitPrice: total,
      anatomicalZone: ZONE_GENERAL,
      source: 'orthodontics_annex',
    }),
  ]
}

function collectSurgicalItems(
  lines: SpecializedAnnexes['oralSurgery']['treatmentPlan'] | undefined,
): TreatmentPlanItem[] {
  const items: TreatmentPlanItem[] = []
  for (const line of lines ?? []) {
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
  return items
}

function periodonticsHasClinicalContent(annex: PeriodonticsAnnex | undefined): boolean {
  if (!annex) return false
  const diagnosis = annex.diagnosis
  if (
    diagnosis?.staging ||
    diagnosis?.grading ||
    diagnosis?.extent ||
    diagnosis?.clinicalObservations?.trim() ||
    diagnosis?.systemicRiskFactors?.trim()
  ) {
    return true
  }
  return (annex.teeth ?? []).some((tooth) => {
    if (tooth.clinicalStatus && tooth.clinicalStatus !== 'presente') return true
    if ((tooth.mobility ?? 0) !== 0) return true
    if (tooth.furcation && tooth.furcation !== '0') return true
    return PERIODONTAL_SITE_KEYS.some((key) => {
      const site = tooth.sites?.[key]
      if (!site) return false
      return site.pbs != null || site.mg != null || site.bop || site.plaque
    })
  })
}

function collectPeriodonticsItems(annex: PeriodonticsAnnex | undefined): TreatmentPlanItem[] {
  if (!annex) return []
  const clinical = periodonticsHasClinicalContent(annex)
  const items: TreatmentPlanItem[] = []
  for (const row of annex.treatmentPlan ?? []) {
    const procedure = row.procedure?.trim() ?? ''
    if (!procedure) continue
    const isDefault = procedure === DEFAULT_PHASE_PROCEDURES[row.phase]
    const customized = !isDefault || Boolean(row.plannedDate?.trim() || row.notes?.trim() || row.status !== 'pendiente')
    if (!customized && !clinical) continue
    items.push(
      blankItem({
        phase:
          row.phase === 'fase_i' || row.phase === 'fase_ii' || row.phase === 'fase_iii'
            ? row.phase
            : DEFAULT_TREATMENT_PHASE,
        procedure,
        anatomicalZone: ZONE_GENERAL,
        source: 'periodontics_annex',
      }),
    )
  }
  return items
}

function prosthesisZone(scope: RehabProtesisTotalScope): string {
  if (scope === 'superior') return ZONE_UPPER_ARCH
  if (scope === 'inferior') return ZONE_LOWER_ARCH
  return ZONE_GENERAL
}

function collectProsthesisItems(
  planning: RehabPlanningSchema | undefined,
  source: AnnexPlanSource,
): TreatmentPlanItem[] {
  if (!planning) return []
  const items: TreatmentPlanItem[] = []
  if (planning.protesisTotal?.scope) {
    const scope = planning.protesisTotal.scope
    items.push(
      blankItem({
        procedure: `Prótesis total — ${formatRehabArchProsthesisScope(scope)}`,
        cupsCode:
          scope === 'superior_inferior'
            ? PROSTHETIC_RESTORATION_CUPS.protesisTotalCasoCompleto
            : PROSTHETIC_RESTORATION_CUPS.protesisTotalMedioCaso,
        anatomicalZone: prosthesisZone(scope),
        source,
      }),
    )
  }
  if (planning.protesisParcialRemovible?.scope) {
    const scope = planning.protesisParcialRemovible.scope
    items.push(
      blankItem({
        procedure: `Prótesis parcial removible — ${formatRehabArchProsthesisScope(scope)}`,
        cupsCode: PROSTHETIC_RESTORATION_CUPS.protesisRemovibleDentomucosoportada,
        anatomicalZone: prosthesisZone(scope),
        source,
      }),
    )
  }
  return items
}

function collectVisualPlanItems(
  entries: RehabVisualPlanEntry[] | undefined,
  source: AnnexPlanSource,
): TreatmentPlanItem[] {
  const items: TreatmentPlanItem[] = []
  for (const entry of entries ?? []) {
    if (!entry.tratamiento) continue
    const spec = VISUAL_PLAN_PROCEDURES[entry.tratamiento]
    if (!spec) continue
    const tooth = Number(entry.dienteId)
    const zone =
      Number.isFinite(tooth) && tooth > 0
        ? parseAnatomicalZone(String(tooth))
        : parseAnatomicalZone(ZONE_GENERAL)
    items.push(
      blankItem({
        procedure: spec.procedure,
        cupsCode: spec.cupsCode,
        toothNumber: zone.toothNumber,
        anatomicalZone: zone.anatomicalZone,
        source,
      }),
    )
  }
  return items
}

function whiteningLabel(plan: RehabDentalWhiteningPlan, type: RehabDentalWhiteningType): string {
  const solo: RehabDentalWhiteningPlan = {
    casero: false,
    caseroPeroxidoCarbamida: type === 'casero' ? plan.caseroPeroxidoCarbamida : '',
    consultorio: false,
    consultorioPeroxidoHidrogeno: type === 'consultorio' ? plan.consultorioPeroxidoHidrogeno : '',
    diente_oscurecido: false,
    dienteOscurecidoTecnica: type === 'diente_oscurecido' ? plan.dienteOscurecidoTecnica : '',
    [type]: true,
  }
  return formatDentalWhiteningPlan(solo) || REHAB_DENTAL_WHITENING_OPTIONS.find((option) => option.id === type)?.label || 'Blanqueamiento dental'
}

function collectWhiteningItems(
  plan: RehabDentalWhiteningPlan | undefined,
  darkenedTeeth: string[] | undefined,
  source: AnnexPlanSource,
): TreatmentPlanItem[] {
  if (!plan || !hasDentalWhiteningSelection(plan)) return []
  const items: TreatmentPlanItem[] = []
  for (const option of REHAB_DENTAL_WHITENING_OPTIONS) {
    if (!plan[option.id]) continue
    const procedure = whiteningLabel(plan, option.id)
    const cupsCode = WHITENING_CUPS[option.id]
    const teeth =
      option.id === 'diente_oscurecido'
        ? [...new Set((darkenedTeeth ?? []).map((tooth) => Number(tooth)).filter((tooth) => tooth > 0))]
        : []
    if (teeth.length === 0) {
      items.push(
        blankItem({
          procedure,
          cupsCode,
          anatomicalZone: ZONE_GENERAL,
          source,
        }),
      )
      continue
    }
    for (const toothNumber of teeth) {
      const zone = parseAnatomicalZone(String(toothNumber))
      items.push(
        blankItem({
          procedure,
          cupsCode,
          toothNumber: zone.toothNumber,
          anatomicalZone: zone.anatomicalZone,
          source,
        }),
      )
    }
  }
  return items
}

function collectPlacedImplantItems(plan: EdentulousImplantPlan | undefined): TreatmentPlanItem[] {
  if (!plan) return []
  const items: TreatmentPlanItem[] = []
  for (const implant of plan.implants ?? []) {
    const zone = parseAnatomicalZone(implant.quadrant)
    const detail = [implantFixtureTypeLabel(implant.type), implantFixtureSizeLabel(implant.size)]
      .filter(Boolean)
      .join(' ')
    items.push(
      blankItem({
        procedure: detail
          ? `Implante dental osteointegrado — ${detail}`
          : 'Implante dental osteointegrado',
        cupsCode: '997701',
        anatomicalZone: zone.anatomicalZone,
        fdiQuadrant: zone.fdiQuadrant ?? implant.quadrant,
        source: 'dental_implants_annex',
      }),
    )
  }

  const rehabilitation = plan.rehabilitationPlan
  if (!rehabilitation) return items
  const arches: EdentulousArchKey[] = ['maxilla', 'mandible']
  for (const arch of arches) {
    const selection = rehabilitation[arch]
    const summary = getArchRehabilitationSummaryDetails(selection)
    if (!summary.hasContent) continue
    const procedure = [summary.categoryLabel, ...summary.details].filter(Boolean).join(' — ')
    if (!procedure) continue
    const cupsCode =
      selection.category === 'overdenture'
        ? PROSTHETIC_RESTORATION_CUPS.protesisTotalImplantoasistidaMedioCaso
        : selection.category === 'fixed_prosthesis'
          ? '997704'
          : undefined
    items.push(
      blankItem({
        procedure: `${EDENTULOUS_ARCH_LABELS[arch]}: ${procedure}`,
        cupsCode,
        anatomicalZone: arch === 'maxilla' ? ZONE_UPPER_ARCH : ZONE_LOWER_ARCH,
        source: 'dental_implants_annex',
      }),
    )
  }
  return items
}

function collectAnnexItems(annexes: SpecializedAnnexes | undefined): TreatmentPlanItem[] {
  if (!annexes) return []
  return [
    ...collectEndodonticsItems(annexes.endodontics),
    ...collectOrthodonticsItem(annexes.orthodontics),
    ...collectSurgicalItems(annexes.oralSurgery?.treatmentPlan),
    ...collectSurgicalItems(annexes.dentalImplants?.surgicalRiskAssessment?.treatmentPlan),
    ...collectPeriodonticsItems(annexes.periodontics),
    ...collectVisualPlanItems(annexes.rehabilitationAesthetics?.visualTreatmentPlan, 'rehabilitation_annex'),
    ...collectProsthesisItems(annexes.rehabilitationAesthetics, 'rehabilitation_annex'),
    ...collectWhiteningItems(
      annexes.rehabilitationAesthetics?.dentalWhitening,
      annexes.rehabilitationAesthetics?.initialFindings?.darkenedTeeth,
      'rehabilitation_annex',
    ),
    ...collectVisualPlanItems(annexes.dentalImplants?.visualTreatmentPlan, 'dental_implants_annex'),
    ...collectProsthesisItems(annexes.dentalImplants, 'dental_implants_annex'),
    ...collectPlacedImplantItems(annexes.dentalImplants?.implantPlacementPlan),
  ]
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

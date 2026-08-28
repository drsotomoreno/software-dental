import type { ToothNumber } from '@/types/odontogram'
import { generateId } from '@/utils'
import type {
  FurcationGrade,
  MobilityGrade,
  PeriodontalDiagnosis,
  PeriodontalIndicesSummary,
  PeriodontalSiteKey,
  PeriodontalSiteRecord,
  PeriodontalToothRecord,
  PeriodontalTreatmentPhase,
  PeriodontalTreatmentRow,
  PeriodonticsAnnex,
  PeriodonticsAnnexLegacy,
} from '@/types/periodonticsAnnex'
import {
  DEFAULT_PHASE_PROCEDURES,
  LOWER_FDI_ARCH,
  PERIODONTAL_SITE_KEYS,
  UPPER_FDI_ARCH,
} from '@/types/periodonticsAnnex'

export function createEmptySite(): PeriodontalSiteRecord {
  return { pbs: null, mg: null, bop: false, plaque: false }
}

export function calcClinicalAttachmentLevel(site: PeriodontalSiteRecord): number | null {
  if (site.pbs === null || site.mg === null) return null
  return site.pbs + site.mg
}

export function isUpperTooth(number: number): boolean {
  const quadrant = Math.floor(number / 10)
  return quadrant === 1 || quadrant === 2
}

export function isMolarOrPremolar(number: number): boolean {
  const unit = number % 10
  return unit >= 4 && unit <= 8
}

export function isToothEvaluable(tooth: PeriodontalToothRecord): boolean {
  return tooth.clinicalStatus === 'presente' || tooth.clinicalStatus === 'implante'
}

export function isImplantTooth(tooth: PeriodontalToothRecord): boolean {
  return tooth.clinicalStatus === 'implante'
}

export function createEmptyTooth(number: ToothNumber): PeriodontalToothRecord {
  const sites = Object.fromEntries(
    PERIODONTAL_SITE_KEYS.map((key) => [key, createEmptySite()]),
  ) as Record<PeriodontalSiteKey, PeriodontalSiteRecord>

  return {
    number,
    clinicalStatus: 'presente',
    mobility: 0,
    furcation: '0',
    sites,
  }
}

function createDefaultDiagnosis(): PeriodontalDiagnosis {
  return {
    staging: '',
    grading: '',
    extent: '',
    clinicalObservations: '',
    systemicRiskFactors: '',
  }
}

function createDefaultTreatmentPlan(): PeriodontalTreatmentRow[] {
  return (['fase_i', 'fase_ii', 'fase_iii'] as PeriodontalTreatmentPhase[]).map((phase) => ({
    id: generateId(),
    phase,
    procedure: DEFAULT_PHASE_PROCEDURES[phase],
    plannedDate: '',
    status: 'pendiente',
    notes: '',
  }))
}

export function createEmptyPeriodonticsAnnex(): PeriodonticsAnnex {
  const teeth = [...UPPER_FDI_ARCH, ...LOWER_FDI_ARCH].map(createEmptyTooth)
  return {
    version: 2,
    teeth,
    selectedTooth: null,
    diagnosis: createDefaultDiagnosis(),
    treatmentPlan: createDefaultTreatmentPlan(),
  }
}

function mergeLegacyIntoDiagnosis(
  legacy: PeriodonticsAnnexLegacy,
  diagnosis: PeriodontalDiagnosis,
): PeriodontalDiagnosis {
  const legacyLines = [
    legacy.radiographicFindings ? `Radiografía: ${legacy.radiographicFindings}` : '',
    legacy.periodontalDiagnosis ? `Dx previo: ${legacy.periodontalDiagnosis}` : '',
    legacy.proposedTherapy ? `Terapia previa: ${legacy.proposedTherapy}` : '',
    legacy.probingDepth ? `PBS (texto): ${legacy.probingDepth}` : '',
    legacy.bleedingIndex ? `Sangrado (texto): ${legacy.bleedingIndex}` : '',
    legacy.mobility ? `Movilidad (texto): ${legacy.mobility}` : '',
    legacy.plaqueControl ? `Placa (texto): ${legacy.plaqueControl}` : '',
    legacy.notes ?? '',
  ].filter(Boolean)

  if (legacyLines.length === 0) return diagnosis

  return {
    ...diagnosis,
    clinicalObservations: [diagnosis.clinicalObservations, ...legacyLines]
      .filter(Boolean)
      .join('\n'),
  }
}

export function normalizePeriodonticsAnnex(data?: unknown): PeriodonticsAnnex {
  if (data && typeof data === 'object' && 'version' in data && (data as PeriodonticsAnnex).version === 2) {
    const annex = data as PeriodonticsAnnex
    const toothMap = new Map(annex.teeth?.map((tooth) => [tooth.number, tooth]) ?? [])
    const teeth = [...UPPER_FDI_ARCH, ...LOWER_FDI_ARCH].map((number) => {
      const existing = toothMap.get(number)
      if (!existing) return createEmptyTooth(number)
      return {
        ...createEmptyTooth(number),
        ...existing,
        sites: {
          ...createEmptyTooth(number).sites,
          ...existing.sites,
        },
      }
    })

    return {
      version: 2,
      teeth,
      selectedTooth: annex.selectedTooth ?? null,
      diagnosis: { ...createDefaultDiagnosis(), ...annex.diagnosis },
      treatmentPlan:
        annex.treatmentPlan?.length > 0 ? annex.treatmentPlan : createDefaultTreatmentPlan(),
    }
  }

  const legacy = (data ?? {}) as PeriodonticsAnnexLegacy
  const empty = createEmptyPeriodonticsAnnex()
  return {
    ...empty,
    diagnosis: mergeLegacyIntoDiagnosis(legacy, empty.diagnosis),
  }
}

export function computePeriodontalIndices(annex: PeriodonticsAnnex): PeriodontalIndicesSummary {
  let evaluatedSites = 0
  let bleedingSites = 0
  let plaqueSites = 0
  let deepPocketSites = 0
  const deepPocketTeeth = new Set<number>()

  for (const tooth of annex.teeth) {
    if (!isToothEvaluable(tooth)) continue

    for (const key of PERIODONTAL_SITE_KEYS) {
      const site = tooth.sites[key]
      const evaluated = site.pbs !== null
      if (!evaluated) continue

      evaluatedSites += 1
      if (site.bop) bleedingSites += 1
      if (site.plaque) plaqueSites += 1
      if (site.pbs !== null && site.pbs >= 5) {
        deepPocketSites += 1
        deepPocketTeeth.add(tooth.number)
      }
    }
  }

  const bleedingIndexPercent =
    evaluatedSites > 0 ? Math.round((bleedingSites / evaluatedSites) * 1000) / 10 : 0
  const plaqueIndexPercent =
    evaluatedSites > 0 ? Math.round((plaqueSites / evaluatedSites) * 1000) / 10 : 0

  return {
    evaluatedSites,
    bleedingSites,
    plaqueSites,
    bleedingIndexPercent,
    plaqueIndexPercent,
    deepPocketSites,
    deepPocketTeeth: [...deepPocketTeeth].sort((a, b) => a - b),
  }
}

export function updateToothInAnnex(
  annex: PeriodonticsAnnex,
  toothNumber: ToothNumber,
  patch: Partial<PeriodontalToothRecord>,
): PeriodonticsAnnex {
  return {
    ...annex,
    teeth: annex.teeth.map((tooth) =>
      tooth.number === toothNumber ? { ...tooth, ...patch } : tooth,
    ),
  }
}

export function updateSiteInAnnex(
  annex: PeriodonticsAnnex,
  toothNumber: ToothNumber,
  siteKey: PeriodontalSiteKey,
  patch: Partial<PeriodontalSiteRecord>,
): PeriodonticsAnnex {
  return {
    ...annex,
    teeth: annex.teeth.map((tooth) => {
      if (tooth.number !== toothNumber) return tooth
      return {
        ...tooth,
        sites: {
          ...tooth.sites,
          [siteKey]: { ...tooth.sites[siteKey], ...patch },
        },
      }
    }),
  }
}

export function getToothSummary(tooth: PeriodontalToothRecord): {
  maxPbs: number | null
  hasBleeding: boolean
  hasPlaque: boolean
} {
  if (!isToothEvaluable(tooth)) {
    return { maxPbs: null, hasBleeding: false, hasPlaque: false }
  }

  let maxPbs: number | null = null
  let hasBleeding = false
  let hasPlaque = false

  for (const key of PERIODONTAL_SITE_KEYS) {
    const site = tooth.sites[key]
    if (site.pbs !== null) {
      maxPbs = maxPbs === null ? site.pbs : Math.max(maxPbs, site.pbs)
    }
    if (site.bop) hasBleeding = true
    if (site.plaque) hasPlaque = true
  }

  return { maxPbs, hasBleeding, hasPlaque }
}

export function mobilityLabel(grade: MobilityGrade): string {
  return `Grado ${grade}`
}

export function furcationLabel(grade: FurcationGrade): string {
  return grade === '0' ? 'Grado 0' : `Grado ${grade}`
}

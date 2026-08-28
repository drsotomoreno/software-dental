export type RehabDentalWhiteningType = 'casero' | 'consultorio' | 'diente_oscurecido'

export type RehabCarbamidePeroxideConcentration = '10' | '16' | '20'

export type RehabHydrogenPeroxideConcentration = '35_40' | '25_30' | '15_18'

export type RehabNonVitalWhiteningTechnique =
  | 'perborato_sodio'
  | 'peroxido_hidrogeno_35_gel'
  | 'peroxido_carbamida_35_intracameral'

export interface RehabDentalWhiteningOption {
  id: RehabDentalWhiteningType
  label: string
  color: string
}

export const REHAB_DENTAL_WHITENING_OPTIONS: RehabDentalWhiteningOption[] = [
  { id: 'casero', label: 'Blanqueamiento Casero', color: '#38BDF6' },
  { id: 'consultorio', label: 'Blanqueamiento en Consultorio', color: '#34D399' },
  { id: 'diente_oscurecido', label: 'Blanqueamiento De Diente Oscurecido No Vital', color: '#FBBF24' },
]

export const REHAB_CARBAMIDE_PEROXIDE_OPTIONS: {
  id: RehabCarbamidePeroxideConcentration
  label: string
}[] = [
  { id: '10', label: 'Peróxido de carbamida al 10%' },
  { id: '16', label: 'Peróxido de carbamida al 16%' },
  { id: '20', label: 'Peróxido de carbamida al 20%' },
]

export const REHAB_HYDROGEN_PEROXIDE_OPTIONS: {
  id: RehabHydrogenPeroxideConcentration
  label: string
}[] = [
  { id: '35_40', label: 'Peróxido de Hidrógeno al 35% – 40%' },
  { id: '25_30', label: 'Peróxido de Hidrógeno al 25% – 30%' },
  { id: '15_18', label: 'Peróxido de Hidrógeno 15% – 18%' },
]

export const REHAB_NON_VITAL_WHITENING_OPTIONS: {
  id: RehabNonVitalWhiteningTechnique
  label: string
}[] = [
  {
    id: 'perborato_sodio',
    label: 'Perborato de Sodio + Agua Destilada (Técnica de Caminata / Walking Bleach)',
  },
  {
    id: 'peroxido_hidrogeno_35_gel',
    label: 'Peróxido de Hidrógeno al 35% en gel (Aplicación intracameral directa)',
  },
  {
    id: 'peroxido_carbamida_35_intracameral',
    label: 'Peróxido de Carbamida al 35% intracameral',
  },
]

export interface RehabDentalWhiteningPlan {
  casero: boolean
  consultorio: boolean
  diente_oscurecido: boolean
  caseroPeroxidoCarbamida: RehabCarbamidePeroxideConcentration | ''
  consultorioPeroxidoHidrogeno: RehabHydrogenPeroxideConcentration | ''
  dienteOscurecidoTecnica: RehabNonVitalWhiteningTechnique | ''
}

const CARBAMIDE_PEROXIDE_IDS = new Set<string>(REHAB_CARBAMIDE_PEROXIDE_OPTIONS.map((item) => item.id))
const HYDROGEN_PEROXIDE_IDS = new Set<string>(REHAB_HYDROGEN_PEROXIDE_OPTIONS.map((item) => item.id))
const NON_VITAL_WHITENING_IDS = new Set<string>(REHAB_NON_VITAL_WHITENING_OPTIONS.map((item) => item.id))

export function createEmptyDentalWhiteningPlan(): RehabDentalWhiteningPlan {
  return {
    casero: false,
    consultorio: false,
    diente_oscurecido: false,
    caseroPeroxidoCarbamida: '',
    consultorioPeroxidoHidrogeno: '',
    dienteOscurecidoTecnica: '',
  }
}

export function isCarbamidePeroxideConcentration(
  value: unknown,
): value is RehabCarbamidePeroxideConcentration {
  return typeof value === 'string' && CARBAMIDE_PEROXIDE_IDS.has(value)
}

export function isHydrogenPeroxideConcentration(
  value: unknown,
): value is RehabHydrogenPeroxideConcentration {
  return typeof value === 'string' && HYDROGEN_PEROXIDE_IDS.has(value)
}

export function isNonVitalWhiteningTechnique(
  value: unknown,
): value is RehabNonVitalWhiteningTechnique {
  return typeof value === 'string' && NON_VITAL_WHITENING_IDS.has(value)
}

export function normalizeDentalWhiteningPlan(
  data?: Partial<RehabDentalWhiteningPlan> & Record<RehabDentalWhiteningType, boolean | undefined>,
): RehabDentalWhiteningPlan {
  const empty = createEmptyDentalWhiteningPlan()
  if (!data || typeof data !== 'object') return empty

  const caseroPeroxidoCarbamida = isCarbamidePeroxideConcentration(data.caseroPeroxidoCarbamida)
    ? data.caseroPeroxidoCarbamida
    : ''

  const consultorioPeroxidoHidrogeno = isHydrogenPeroxideConcentration(data.consultorioPeroxidoHidrogeno)
    ? data.consultorioPeroxidoHidrogeno
    : ''

  const dienteOscurecidoTecnica = isNonVitalWhiteningTechnique(data.dienteOscurecidoTecnica)
    ? data.dienteOscurecidoTecnica
    : ''

  return {
    casero: Boolean(data.casero),
    consultorio: Boolean(data.consultorio),
    diente_oscurecido: Boolean(data.diente_oscurecido),
    caseroPeroxidoCarbamida: Boolean(data.casero) ? caseroPeroxidoCarbamida : '',
    consultorioPeroxidoHidrogeno: Boolean(data.consultorio) ? consultorioPeroxidoHidrogeno : '',
    dienteOscurecidoTecnica: Boolean(data.diente_oscurecido) ? dienteOscurecidoTecnica : '',
  }
}

export function getCarbamidePeroxideLabel(
  concentration: RehabCarbamidePeroxideConcentration | '',
): string {
  if (!concentration) return ''
  return (
    REHAB_CARBAMIDE_PEROXIDE_OPTIONS.find((option) => option.id === concentration)?.label ?? ''
  )
}

export function getHydrogenPeroxideLabel(
  concentration: RehabHydrogenPeroxideConcentration | '',
): string {
  if (!concentration) return ''
  return (
    REHAB_HYDROGEN_PEROXIDE_OPTIONS.find((option) => option.id === concentration)?.label ?? ''
  )
}

export function getNonVitalWhiteningTechniqueLabel(
  technique: RehabNonVitalWhiteningTechnique | '',
): string {
  if (!technique) return ''
  return (
    REHAB_NON_VITAL_WHITENING_OPTIONS.find((option) => option.id === technique)?.label ?? ''
  )
}

export function formatDentalWhiteningPlan(plan: RehabDentalWhiteningPlan): string {
  const parts: string[] = []

  for (const option of REHAB_DENTAL_WHITENING_OPTIONS) {
    if (!plan[option.id]) continue

    if (option.id === 'casero') {
      const concentration = getCarbamidePeroxideLabel(plan.caseroPeroxidoCarbamida)
      parts.push(concentration ? `${option.label} (${concentration})` : option.label)
      continue
    }

    if (option.id === 'consultorio') {
      const concentration = getHydrogenPeroxideLabel(plan.consultorioPeroxidoHidrogeno)
      parts.push(concentration ? `${option.label} (${concentration})` : option.label)
      continue
    }

    if (option.id === 'diente_oscurecido') {
      const technique = getNonVitalWhiteningTechniqueLabel(plan.dienteOscurecidoTecnica)
      parts.push(technique ? `${option.label} (${technique})` : option.label)
      continue
    }

    parts.push(option.label)
  }

  return parts.join(', ')
}

export function hasDentalWhiteningSelection(plan: RehabDentalWhiteningPlan): boolean {
  return REHAB_DENTAL_WHITENING_OPTIONS.some((option) => plan[option.id])
}

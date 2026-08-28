import { FDI_QUADRANT_ORDER, type ImplantFdiQuadrant } from '@/constants/implantPlanning'

export type ImplantSystemicRiskConditionId =
  | 'uncontrolled_diabetes'
  | 'autoimmune_immunosuppression'
  | 'bone_metabolism_disorders'
  | 'severe_cardiopathy'
  | 'uncontrolled_coagulation'

export type ImplantCriticalMedicationId =
  | 'antiresorptive_antiangiogenic'
  | 'chronic_corticosteroids'
  | 'anticoagulant_antiplatelet'
  | 'immunosuppressants'
  | 'ssri_antidepressants'

export type ImplantLocalPathologyId =
  | 'residual_root_fragments'
  | 'defective_endodontics_periapical'
  | 'osteitis_hidden_bone_pathology'
  | 'active_sinus_pathology'

export interface ImplantRadiotherapyHistory {
  hasHistory: boolean
  irradiatedZone: string
  approximateDoseGy: string
  timeSinceTreatment: string
}

export interface ImplantLocalPathologyRecord {
  present: boolean
  affectedQuadrants: ImplantFdiQuadrant[]
}

export type ImplantLocalPathologies = Record<ImplantLocalPathologyId, ImplantLocalPathologyRecord>

export const IMPLANT_SYSTEMIC_RISK_CONDITION_OPTIONS: {
  id: ImplantSystemicRiskConditionId
  label: string
  alert: string
}[] = [
  {
    id: 'uncontrolled_diabetes',
    label: 'Diabetes Mellitus no controlada',
    alert: 'Riesgo de cicatrización deficiente y menor tasa de osteointegración.',
  },
  {
    id: 'autoimmune_immunosuppression',
    label: 'Enfermedades autoinmunes graves / inmunosupresión',
    alert: 'Respuesta biológica alterada y mayor riesgo de infección o rechazo tisular.',
  },
  {
    id: 'bone_metabolism_disorders',
    label: 'Trastornos del metabolismo óseo',
    alert: 'Puede comprometer la formación y mantenimiento óseo alrededor del implante.',
  },
  {
    id: 'severe_cardiopathy',
    label: 'Cardiopatías graves o no controladas',
    alert: 'Riesgo quirúrgico elevado; requiere valoración médica previa.',
  },
  {
    id: 'uncontrolled_coagulation',
    label: 'Trastornos de la coagulación no controlados',
    alert: 'Riesgo hemorrágico perioperatorio y complicaciones postquirúrgicas.',
  },
]

export const IMPLANT_CRITICAL_MEDICATION_OPTIONS: {
  id: ImplantCriticalMedicationId
  label: string
  alert: string
}[] = [
  {
    id: 'antiresorptive_antiangiogenic',
    label: 'Fármacos antirresortivos / antiangiogénicos (Bifosfonatos / Denosumab)',
    alert: 'Riesgo de osteonecrosis de los maxilares (MRONJ).',
  },
  {
    id: 'chronic_corticosteroids',
    label: 'Corticosteroides sistémicos crónicos',
    alert: 'Puede disminuir la osteointegración y retardar la cicatrización.',
  },
  {
    id: 'anticoagulant_antiplatelet',
    label: 'Anticoagulantes o antiagregantes plaquetarios',
    alert: 'Riesgo de sangrado intra y postoperatorio.',
  },
  {
    id: 'immunosuppressants',
    label: 'Inmunosupresores',
    alert: 'Mayor susceptibilidad a infección y respuesta de tejidos comprometida.',
  },
  {
    id: 'ssri_antidepressants',
    label: 'Antidepresivos (ISRS)',
    alert: 'Asociación reportada con mayor riesgo de fracaso de implantes.',
  },
]

export const IMPLANT_LOCAL_PATHOLOGY_OPTIONS: {
  id: ImplantLocalPathologyId
  label: string
  alert: string
  applicableQuadrants?: ImplantFdiQuadrant[]
}[] = [
  {
    id: 'residual_root_fragments',
    label: 'Restos radiculares residuales',
    alert: 'Foco infeccioso oculto que puede comprometer la osteointegración.',
  },
  {
    id: 'defective_endodontics_periapical',
    label: 'Tratamientos endodónticos previos defectuosos o con lesiones periapicales crónicas',
    alert: 'Lesión periapical persistente con riesgo de fracaso biológico local.',
  },
  {
    id: 'osteitis_hidden_bone_pathology',
    label: 'Zonas de osteítis o patología ósea oculta previa',
    alert: 'Tejido óseo comprometido; requiere tratamiento previo al implante.',
  },
  {
    id: 'active_sinus_pathology',
    label: 'Patología sinusal activa (maxilar superior)',
    alert: 'Riesgo de comunicación bucosinusal y complicaciones en sector superior.',
    applicableQuadrants: ['Q1', 'Q2'],
  },
]

export const RADIOTHERAPY_HIGH_RISK_ALERT =
  'Alto riesgo: antecedente de radioterapia en cabeza y cuello. Compromiso vascular y susceptibilidad a osteorradionecrosis.'

export type ImplantSmokingHabitStatus =
  | 'non_smoker'
  | 'light_smoker'
  | 'moderate_heavy_smoker'
  | 'former_smoker'
  | 'electronic_vaping'

export type ImplantToxicHabitId = 'frequent_alcohol' | 'recreational_drugs' | 'other_substances'

export const IMPLANT_SMOKING_STATUS_OPTIONS: {
  id: ImplantSmokingHabitStatus
  label: string
}[] = [
  { id: 'non_smoker', label: 'No fumador' },
  { id: 'light_smoker', label: 'Fumador ocasional / ligero (< 10 cigarrillos/día)' },
  { id: 'moderate_heavy_smoker', label: 'Fumador moderado / pesado (≥ 10 cigarrillos/día)' },
  { id: 'former_smoker', label: 'Ex-fumador' },
  { id: 'electronic_vaping', label: 'Uso de cigarrillo electrónico / vapeo' },
]

export const IMPLANT_TOXIC_HABIT_OPTIONS: {
  id: ImplantToxicHabitId
  label: string
  alert: string
}[] = [
  {
    id: 'frequent_alcohol',
    label: 'Consumo frecuente de alcohol',
    alert: 'Puede alterar la microcirculación y retardar la cicatrización tisular.',
  },
  {
    id: 'recreational_drugs',
    label: 'Uso de sustancias recreativas',
    alert: 'Riesgo de compromiso sistémico y cicatrización deficiente.',
  },
  {
    id: 'other_substances',
    label: 'Otras sustancias con impacto tisular',
    alert: 'Evaluar interacción con la respuesta biológica al implante.',
  },
]

export const ACTIVE_HEAVY_SMOKING_ALERT =
  'Fumador activo moderado/pesado: incremento documentado del riesgo de fracaso de osteointegración y complicaciones periimplantarias.'

export interface ImplantSmokingAssessment {
  status: ImplantSmokingHabitStatus | ''
  cessationTime: string
  packYears: string
}

export interface ImplantToxicHabits {
  frequent_alcohol: boolean
  recreational_drugs: boolean
  other_substances: boolean
  otherSubstancesNotes: string
}

export interface ImplantMedicalAnamnesis {
  systemicRiskConditions: Record<ImplantSystemicRiskConditionId, boolean>
  criticalMedications: Record<ImplantCriticalMedicationId, boolean>
  radiotherapyHistory: ImplantRadiotherapyHistory
  localPathologies: ImplantLocalPathologies
  smokingAssessment: ImplantSmokingAssessment
  toxicHabits: ImplantToxicHabits
  clinicalNotes: string
}

function createEmptyFlags<T extends string>(ids: readonly { id: T }[]): Record<T, boolean> {
  return ids.reduce(
    (acc, item) => {
      acc[item.id] = false
      return acc
    },
    {} as Record<T, boolean>,
  )
}

export function createEmptyRadiotherapyHistory(): ImplantRadiotherapyHistory {
  return {
    hasHistory: false,
    irradiatedZone: '',
    approximateDoseGy: '',
    timeSinceTreatment: '',
  }
}

export function createEmptyLocalPathologyRecord(): ImplantLocalPathologyRecord {
  return { present: false, affectedQuadrants: [] }
}

export function createEmptyLocalPathologies(): ImplantLocalPathologies {
  return IMPLANT_LOCAL_PATHOLOGY_OPTIONS.reduce<ImplantLocalPathologies>((acc, item) => {
    acc[item.id] = createEmptyLocalPathologyRecord()
    return acc
  }, {} as ImplantLocalPathologies)
}

export function createEmptySmokingAssessment(): ImplantSmokingAssessment {
  return {
    status: '',
    cessationTime: '',
    packYears: '',
  }
}

export function createEmptyToxicHabits(): ImplantToxicHabits {
  return {
    frequent_alcohol: false,
    recreational_drugs: false,
    other_substances: false,
    otherSubstancesNotes: '',
  }
}

export function createEmptyImplantMedicalAnamnesis(): ImplantMedicalAnamnesis {
  return {
    systemicRiskConditions: createEmptyFlags(IMPLANT_SYSTEMIC_RISK_CONDITION_OPTIONS),
    criticalMedications: createEmptyFlags(IMPLANT_CRITICAL_MEDICATION_OPTIONS),
    radiotherapyHistory: createEmptyRadiotherapyHistory(),
    localPathologies: createEmptyLocalPathologies(),
    smokingAssessment: createEmptySmokingAssessment(),
    toxicHabits: createEmptyToxicHabits(),
    clinicalNotes: '',
  }
}

function normalizeBooleanFlags<T extends string>(
  ids: readonly { id: T }[],
  data?: Partial<Record<T, boolean>>,
): Record<T, boolean> {
  const empty = createEmptyFlags(ids)
  return ids.reduce(
    (acc, item) => {
      acc[item.id] = Boolean(data?.[item.id])
      return acc
    },
    empty,
  )
}

function normalizeLocalPathologies(data?: Partial<ImplantLocalPathologies>): ImplantLocalPathologies {
  const empty = createEmptyLocalPathologies()
  return IMPLANT_LOCAL_PATHOLOGY_OPTIONS.reduce<ImplantLocalPathologies>((acc, item) => {
    const record = data?.[item.id]
    const quadrants = Array.isArray(record?.affectedQuadrants)
      ? record.affectedQuadrants.filter((quadrant): quadrant is ImplantFdiQuadrant =>
          FDI_QUADRANT_ORDER.includes(quadrant as ImplantFdiQuadrant),
        )
      : []
    acc[item.id] = {
      present: Boolean(record?.present),
      affectedQuadrants: quadrants,
    }
    return acc
  }, empty)
}

function normalizeRadiotherapyHistory(
  data?: Partial<ImplantRadiotherapyHistory>,
  legacyHeadNeckFlag?: boolean,
): ImplantRadiotherapyHistory {
  const empty = createEmptyRadiotherapyHistory()
  const hasHistory = typeof data?.hasHistory === 'boolean' ? data.hasHistory : Boolean(legacyHeadNeckFlag)

  return {
    hasHistory,
    irradiatedZone: typeof data?.irradiatedZone === 'string' ? data.irradiatedZone : empty.irradiatedZone,
    approximateDoseGy:
      typeof data?.approximateDoseGy === 'string' ? data.approximateDoseGy : empty.approximateDoseGy,
    timeSinceTreatment:
      typeof data?.timeSinceTreatment === 'string' ? data.timeSinceTreatment : empty.timeSinceTreatment,
  }
}

function normalizeSmokingAssessment(data?: Partial<ImplantSmokingAssessment>): ImplantSmokingAssessment {
  const empty = createEmptySmokingAssessment()
  const validStatus = IMPLANT_SMOKING_STATUS_OPTIONS.some((item) => item.id === data?.status)
    ? (data?.status as ImplantSmokingHabitStatus)
    : ''

  return {
    status: validStatus,
    cessationTime: typeof data?.cessationTime === 'string' ? data.cessationTime : empty.cessationTime,
    packYears: typeof data?.packYears === 'string' ? data.packYears : empty.packYears,
  }
}

function normalizeToxicHabits(data?: Partial<ImplantToxicHabits>): ImplantToxicHabits {
  const empty = createEmptyToxicHabits()
  return {
    frequent_alcohol: Boolean(data?.frequent_alcohol),
    recreational_drugs: Boolean(data?.recreational_drugs),
    other_substances: Boolean(data?.other_substances),
    otherSubstancesNotes:
      typeof data?.otherSubstancesNotes === 'string' ? data.otherSubstancesNotes : empty.otherSubstancesNotes,
  }
}

export function normalizeImplantMedicalAnamnesis(
  data?: Partial<ImplantMedicalAnamnesis> & {
    systemicRiskConditions?: Partial<Record<string, boolean>>
  },
): ImplantMedicalAnamnesis {
  const empty = createEmptyImplantMedicalAnamnesis()
  const legacyRadiotherapy = Boolean(data?.systemicRiskConditions?.head_neck_radiotherapy)

  return {
    systemicRiskConditions: normalizeBooleanFlags(
      IMPLANT_SYSTEMIC_RISK_CONDITION_OPTIONS,
      data?.systemicRiskConditions,
    ),
    criticalMedications: normalizeBooleanFlags(
      IMPLANT_CRITICAL_MEDICATION_OPTIONS,
      data?.criticalMedications,
    ),
    radiotherapyHistory: normalizeRadiotherapyHistory(data?.radiotherapyHistory, legacyRadiotherapy),
    localPathologies: normalizeLocalPathologies(data?.localPathologies),
    smokingAssessment: normalizeSmokingAssessment(data?.smokingAssessment),
    toxicHabits: normalizeToxicHabits(data?.toxicHabits),
    clinicalNotes: typeof data?.clinicalNotes === 'string' ? data.clinicalNotes : empty.clinicalNotes,
  }
}

export function hasActiveHeavySmokingRisk(anamnesis: ImplantMedicalAnamnesis): boolean {
  return anamnesis.smokingAssessment.status === 'moderate_heavy_smoker'
}

export function getSmokingStatusLabel(status: ImplantSmokingHabitStatus | ''): string {
  if (!status) return ''
  return IMPLANT_SMOKING_STATUS_OPTIONS.find((item) => item.id === status)?.label ?? status
}

export function getSmokingBiologicalRiskAlert(anamnesis: ImplantMedicalAnamnesis): string | null {
  if (!hasActiveHeavySmokingRisk(anamnesis)) return null

  const details = [
    anamnesis.smokingAssessment.packYears &&
      `Índice paquetes-año: ${anamnesis.smokingAssessment.packYears}`,
  ].filter(Boolean)

  return details.length > 0 ? `${ACTIVE_HEAVY_SMOKING_ALERT} (${details.join(' · ')})` : ACTIVE_HEAVY_SMOKING_ALERT
}

export function getToxicHabitsAlerts(anamnesis: ImplantMedicalAnamnesis): string[] {
  return IMPLANT_TOXIC_HABIT_OPTIONS.filter((item) => anamnesis.toxicHabits[item.id]).map(
    (item) => `${item.label}: ${item.alert}`,
  )
}

export function hasRadiotherapyHighRisk(anamnesis: ImplantMedicalAnamnesis): boolean {
  return anamnesis.radiotherapyHistory.hasHistory
}

export function getQuadrantLocalPathologyAlerts(
  quadrant: ImplantFdiQuadrant,
  anamnesis: ImplantMedicalAnamnesis,
): string[] {
  return IMPLANT_LOCAL_PATHOLOGY_OPTIONS.flatMap((option) => {
    const record = anamnesis.localPathologies[option.id]
    if (!record.present || !record.affectedQuadrants.includes(quadrant)) return []
    return [`${option.label}: ${option.alert}`]
  })
}

export function hasQuadrantLocalPathologyRisk(
  quadrant: ImplantFdiQuadrant,
  anamnesis: ImplantMedicalAnamnesis,
): boolean {
  return getQuadrantLocalPathologyAlerts(quadrant, anamnesis).length > 0
}

export function getImplantPlanningQuadrantWarnings(
  quadrant: ImplantFdiQuadrant,
  anamnesis: ImplantMedicalAnamnesis,
): { highRisk: string[]; standardRisk: string[] } {
  const highRisk: string[] = []
  const standardRisk = getQuadrantLocalPathologyAlerts(quadrant, anamnesis)

  if (hasRadiotherapyHighRisk(anamnesis)) {
    const details = [
      anamnesis.radiotherapyHistory.irradiatedZone &&
        `Zona: ${anamnesis.radiotherapyHistory.irradiatedZone}`,
      anamnesis.radiotherapyHistory.approximateDoseGy &&
        `Dosis: ${anamnesis.radiotherapyHistory.approximateDoseGy} Gy`,
      anamnesis.radiotherapyHistory.timeSinceTreatment &&
        `Tiempo: ${anamnesis.radiotherapyHistory.timeSinceTreatment}`,
    ].filter(Boolean)

    highRisk.push(
      details.length > 0
        ? `${RADIOTHERAPY_HIGH_RISK_ALERT} (${details.join(' · ')})`
        : RADIOTHERAPY_HIGH_RISK_ALERT,
    )
  }

  const smokingAlert = getSmokingBiologicalRiskAlert(anamnesis)
  if (smokingAlert) {
    standardRisk.push(smokingAlert)
  }

  const toxicAlerts = getToxicHabitsAlerts(anamnesis)
  standardRisk.push(...toxicAlerts)

  return { highRisk, standardRisk }
}

export function hasImplantClinicalRiskAlerts(anamnesis: ImplantMedicalAnamnesis): boolean {
  const hasCondition = IMPLANT_SYSTEMIC_RISK_CONDITION_OPTIONS.some(
    (item) => anamnesis.systemicRiskConditions[item.id],
  )
  const hasMedication = IMPLANT_CRITICAL_MEDICATION_OPTIONS.some(
    (item) => anamnesis.criticalMedications[item.id],
  )
  const hasLocalPathology = IMPLANT_LOCAL_PATHOLOGY_OPTIONS.some(
    (item) => anamnesis.localPathologies[item.id].present,
  )
  const hasToxicHabits = IMPLANT_TOXIC_HABIT_OPTIONS.some((item) => anamnesis.toxicHabits[item.id])

  return (
    hasCondition ||
    hasMedication ||
    hasRadiotherapyHighRisk(anamnesis) ||
    hasLocalPathology ||
    hasActiveHeavySmokingRisk(anamnesis) ||
    hasToxicHabits
  )
}

export function getImplantClinicalRiskAlerts(anamnesis: ImplantMedicalAnamnesis): {
  highRisk: string[]
  standardRisk: string[]
} {
  const highRisk: string[] = []

  if (hasRadiotherapyHighRisk(anamnesis)) {
    const { irradiatedZone, approximateDoseGy, timeSinceTreatment } = anamnesis.radiotherapyHistory
    const details = [
      irradiatedZone && `Zona irradiada: ${irradiatedZone}`,
      approximateDoseGy && `Dosis aproximada: ${approximateDoseGy} Gy`,
      timeSinceTreatment && `Tiempo transcurrido: ${timeSinceTreatment}`,
    ].filter(Boolean)

    highRisk.push(
      details.length > 0
        ? `${RADIOTHERAPY_HIGH_RISK_ALERT} ${details.join('. ')}.`
        : RADIOTHERAPY_HIGH_RISK_ALERT,
    )
  }

  const conditionAlerts = IMPLANT_SYSTEMIC_RISK_CONDITION_OPTIONS.filter(
    (item) => anamnesis.systemicRiskConditions[item.id],
  ).map((item) => `${item.label}: ${item.alert}`)

  const medicationAlerts = IMPLANT_CRITICAL_MEDICATION_OPTIONS.filter(
    (item) => anamnesis.criticalMedications[item.id],
  ).map((item) => `${item.label}: ${item.alert}`)

  const localPathologyAlerts = IMPLANT_LOCAL_PATHOLOGY_OPTIONS.filter(
    (item) => anamnesis.localPathologies[item.id].present,
  ).map((item) => {
    const quadrants = anamnesis.localPathologies[item.id].affectedQuadrants.join(', ')
    const quadrantSuffix = quadrants ? ` [${quadrants}]` : ''
    return `${item.label}${quadrantSuffix}: ${item.alert}`
  })

  const smokingAlert = getSmokingBiologicalRiskAlert(anamnesis)
  const toxicAlerts = getToxicHabitsAlerts(anamnesis)

  return {
    highRisk,
    standardRisk: [
      ...conditionAlerts,
      ...medicationAlerts,
      ...localPathologyAlerts,
      ...(smokingAlert ? [smokingAlert] : []),
      ...toxicAlerts,
    ],
  }
}

export function formatImplantMedicalAnamnesisSummary(anamnesis: ImplantMedicalAnamnesis): string {
  const parts: string[] = []

  if (hasRadiotherapyHighRisk(anamnesis)) {
    const { irradiatedZone, approximateDoseGy, timeSinceTreatment } = anamnesis.radiotherapyHistory
    parts.push(
      [
        'Radioterapia cabeza/cuello: Sí',
        irradiatedZone && `zona ${irradiatedZone}`,
        approximateDoseGy && `${approximateDoseGy} Gy`,
        timeSinceTreatment && timeSinceTreatment,
      ]
        .filter(Boolean)
        .join(', '),
    )
  }

  const conditions = IMPLANT_SYSTEMIC_RISK_CONDITION_OPTIONS.filter(
    (item) => anamnesis.systemicRiskConditions[item.id],
  ).map((item) => item.label)

  const medications = IMPLANT_CRITICAL_MEDICATION_OPTIONS.filter(
    (item) => anamnesis.criticalMedications[item.id],
  ).map((item) => item.label)

  const localPathologies = IMPLANT_LOCAL_PATHOLOGY_OPTIONS.filter(
    (item) => anamnesis.localPathologies[item.id].present,
  ).map((item) => {
    const quadrants = anamnesis.localPathologies[item.id].affectedQuadrants.join(', ')
    return quadrants ? `${item.label} (${quadrants})` : item.label
  })

  const smokingLabel = getSmokingStatusLabel(anamnesis.smokingAssessment.status)
  if (smokingLabel) {
    const smokingDetails = [
      smokingLabel,
      anamnesis.smokingAssessment.status === 'former_smoker' &&
        anamnesis.smokingAssessment.cessationTime &&
        `cesación: ${anamnesis.smokingAssessment.cessationTime}`,
      anamnesis.smokingAssessment.packYears &&
        `paquetes-año: ${anamnesis.smokingAssessment.packYears}`,
    ]
      .filter(Boolean)
      .join(', ')
    parts.push(`Tabaquismo: ${smokingDetails}`)
  }

  const toxicHabits = IMPLANT_TOXIC_HABIT_OPTIONS.filter((item) => anamnesis.toxicHabits[item.id]).map(
    (item) => item.label,
  )
  if (toxicHabits.length > 0) {
    parts.push(`Hábitos tóxicos: ${toxicHabits.join(', ')}`)
  }
  if (anamnesis.toxicHabits.otherSubstancesNotes.trim()) {
    parts.push(`Sustancias: ${anamnesis.toxicHabits.otherSubstancesNotes.trim()}`)
  }

  if (conditions.length > 0) parts.push(`Condiciones sistémicas: ${conditions.join(', ')}`)
  if (medications.length > 0) parts.push(`Medicaciones críticas: ${medications.join(', ')}`)
  if (localPathologies.length > 0) {
    parts.push(`Patologías locales ocultas: ${localPathologies.join(', ')}`)
  }
  if (anamnesis.clinicalNotes.trim()) parts.push(`Notas: ${anamnesis.clinicalNotes.trim()}`)

  return parts.join(' · ')
}

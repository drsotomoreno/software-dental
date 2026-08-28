export type OralSurgeryRiskLevel = 'high' | 'standard'

export interface OralSurgeryCheckOption {
  id: string
  label: string
  alert: string
  riskLevel: OralSurgeryRiskLevel
}

export type OralSurgeryBooleanMap = Record<string, boolean>

export interface OralSurgeryTreatmentPlanItem {
  id: string
  cupsCode: string
  procedure: string
  toothNumber: number
  notes?: string
}

/** Procedimientos CUPS frecuentes en cirugía oral — búsqueda abreviada */
export const ORAL_SURGERY_CUPS_SHORTLIST: { cupsCode: string; procedure: string }[] = [
  { cupsCode: '230101', procedure: 'Exodoncia de diente permanente unirradicular' },
  { cupsCode: '230102', procedure: 'Exodoncia de diente permanente multirradicular' },
  { cupsCode: '230103', procedure: 'Exodoncia de dientes permanentes' },
  { cupsCode: '230203', procedure: 'Exodoncia de diente temporal' },
  { cupsCode: '231101', procedure: 'Exodoncia quirúrgica de diente unirradicular' },
  { cupsCode: '231102', procedure: 'Exodoncia quirúrgica de diente retenido o impactado' },
  { cupsCode: '234101', procedure: 'Biopsia incisional de encía' },
  { cupsCode: '234102', procedure: 'Biopsia excisional de encía' },
  { cupsCode: '761101', procedure: 'Biopsia de huesos maxilares' },
  { cupsCode: '238101', procedure: 'Frenilectomía labial' },
  { cupsCode: '238102', procedure: 'Frenilectomía lingual' },
  { cupsCode: '997303', procedure: 'Gingivectomía' },
  { cupsCode: '997701', procedure: 'Implante dental osteointegrado' },
  { cupsCode: '997702', procedure: 'Colocación de pilar sobre implante' },
]

export interface OralSurgeryAnnex {
  coagulationDiseases: OralSurgeryBooleanMap
  coagulationMedications: OralSurgeryBooleanMap
  mronjDiseases: OralSurgeryBooleanMap
  mronjMedications: OralSurgeryBooleanMap
  cardiovascularDiseases: OralSurgeryBooleanMap
  endocrineDiseases: OralSurgeryBooleanMap
  endocrineMedications: OralSurgeryBooleanMap
  immunosuppressionDiseases: OralSurgeryBooleanMap
  immunosuppressionMedications: OralSurgeryBooleanMap
  allergies: OralSurgeryBooleanMap
  localFactors: OralSurgeryBooleanMap
  /** Plan de tratamiento quirúrgico por pieza (CUPS + FDI) */
  treatmentPlan: OralSurgeryTreatmentPlanItem[]
  notes: string
}

export const ORAL_SURGERY_COAGULATION_DISEASE_OPTIONS: OralSurgeryCheckOption[] = [
  {
    id: 'hemophilia_a_b',
    label: 'Hemofilia A o B',
    alert: 'Riesgo hemorrágico severo; requiere manejo hematológico y protocolo de hemostasia.',
    riskLevel: 'high',
  },
  {
    id: 'von_willebrand',
    label: 'Enfermedad de von Willebrand',
    alert: 'Alteración de la hemostasia; coordinar con hematología antes de la cirugía.',
    riskLevel: 'high',
  },
  {
    id: 'primary_immune_thrombocytopenia',
    label: 'Trombocitopenia inmune primaria u otras coagulopatías',
    alert: 'Riesgo de sangrado intra y postoperatorio elevado.',
    riskLevel: 'high',
  },
  {
    id: 'severe_hepatic_insufficiency',
    label: 'Insuficiencia hepática grave',
    alert: 'Síntesis de factores de coagulación comprometida; alto riesgo hemorrágico.',
    riskLevel: 'high',
  },
]

export const ORAL_SURGERY_COAGULATION_MEDICATION_OPTIONS: OralSurgeryCheckOption[] = [
  {
    id: 'warfarin',
    label: 'Warfarina',
    alert: 'Anticoagulante antagonista de vitamina K; valorar suspensión o puente según riesgo trombótico.',
    riskLevel: 'high',
  },
  {
    id: 'acenocumarol',
    label: 'Acenocumarol',
    alert: 'Anticoagulante antagonista de vitamina K; requiere manejo perioperatorio.',
    riskLevel: 'high',
  },
  {
    id: 'rivaroxaban',
    label: 'Rivaroxaban (DOAC)',
    alert: 'Anticoagulante oral de acción directa; ajustar tiempo de suspensión según función renal.',
    riskLevel: 'high',
  },
  {
    id: 'apixaban',
    label: 'Apixaban (DOAC)',
    alert: 'Anticoagulante oral de acción directa; coordinar con médico tratante.',
    riskLevel: 'high',
  },
  {
    id: 'dabigatran',
    label: 'Dabigatran (DOAC)',
    alert: 'Anticoagulante oral de acción directa; evaluar reversión o intervalo de suspensión.',
    riskLevel: 'high',
  },
  {
    id: 'aspirin',
    label: 'Ácido acetilsalicílico / Aspirina',
    alert: 'Antiagregante plaquetario; riesgo de sangrado perioperatorio.',
    riskLevel: 'standard',
  },
  {
    id: 'clopidogrel',
    label: 'Clopidogrel',
    alert: 'Antiagregante plaquetario; valorar suspensión según indicación cardiovascular.',
    riskLevel: 'high',
  },
  {
    id: 'ticagrelor',
    label: 'Ticagrelor',
    alert: 'Antiagregante plaquetario de alta potencia; alto riesgo hemorrágico.',
    riskLevel: 'high',
  },
  {
    id: 'prasugrel',
    label: 'Prasugrel',
    alert: 'Antiagregante plaquetario; requiere manejo perioperatorio especializado.',
    riskLevel: 'high',
  },
]

export const ORAL_SURGERY_MRONJ_DISEASE_OPTIONS: OralSurgeryCheckOption[] = [
  {
    id: 'severe_osteoporosis',
    label: 'Osteoporosis severa',
    alert: 'Frecuente indicación de antirresortivos; evaluar riesgo de MRONJ.',
    riskLevel: 'standard',
  },
  {
    id: 'bone_metastases',
    label: 'Metástasis óseas',
    alert: 'Alto riesgo de compromiso óseo y uso de bifosfonatos / antirresortivos.',
    riskLevel: 'high',
  },
  {
    id: 'multiple_myeloma',
    label: 'Mieloma múltiple',
    alert: 'Riesgo elevado de MRONJ y fragilidad ósea maxilar.',
    riskLevel: 'high',
  },
  {
    id: 'breast_prostate_cancer_bone',
    label: 'Cáncer de mama o próstata con afectación ósea',
    alert: 'Posible tratamiento antirresortivo; evaluar riesgo de osteonecrosis mandibular.',
    riskLevel: 'high',
  },
]

export const ORAL_SURGERY_MRONJ_MEDICATION_OPTIONS: OralSurgeryCheckOption[] = [
  {
    id: 'zoledronic_acid',
    label: 'Ácido zoledrónico (IV)',
    alert: 'Bifosfonato intravenoso; riesgo alto de MRONJ.',
    riskLevel: 'high',
  },
  {
    id: 'ibandronic_acid',
    label: 'Ácido ibandrónico',
    alert: 'Bifosfonato; evaluar tiempo de exposición y vía de administración.',
    riskLevel: 'high',
  },
  {
    id: 'alendronic_acid',
    label: 'Ácido alendrónico',
    alert: 'Bifosfonato oral; riesgo de MRONJ con exposición prolongada.',
    riskLevel: 'high',
  },
  {
    id: 'risedronic_acid',
    label: 'Ácido risedrónico',
    alert: 'Bifosfonato oral; considerar drug holiday según indicación.',
    riskLevel: 'high',
  },
  {
    id: 'denosumab',
    label: 'Denosumab',
    alert: 'Antirresortivo monoclonal; riesgo significativo de MRONJ.',
    riskLevel: 'high',
  },
  {
    id: 'bevacizumab',
    label: 'Bevacizumab',
    alert: 'Inhibidor de angiogénesis; altera cicatrización y riesgo de osteonecrosis.',
    riskLevel: 'high',
  },
  {
    id: 'sunitinib',
    label: 'Sunitinib',
    alert: 'Inhibidor de angiogénesis; compromete vascularización y cicatrización ósea.',
    riskLevel: 'high',
  },
]

export const ORAL_SURGERY_CARDIOVASCULAR_OPTIONS: OralSurgeryCheckOption[] = [
  {
    id: 'uncontrolled_hypertension',
    label: 'Hipertensión arterial no controlada',
    alert: 'Riesgo hemodinámico perioperatorio; optimizar cifras tensionales antes de cirugía.',
    riskLevel: 'high',
  },
  {
    id: 'recent_mi',
    label: 'Infarto agudo de miocardio reciente (< 6 meses)',
    alert: 'Alto riesgo cardiovascular; posponer cirugía electiva según valoración cardiológica.',
    riskLevel: 'high',
  },
  {
    id: 'unstable_angina',
    label: 'Angina inestable',
    alert: 'Contraindicación relativa; requiere estabilización cardiológica previa.',
    riskLevel: 'high',
  },
  {
    id: 'severe_heart_failure',
    label: 'Insuficiencia cardíaca congestiva severa',
    alert: 'Riesgo de descompensación hemodinámica bajo estrés quirúrgico.',
    riskLevel: 'high',
  },
  {
    id: 'uncontrolled_arrhythmia',
    label: 'Arritmias cardíacas graves no controladas',
    alert: 'Riesgo de evento cardiovascular perioperatorio.',
    riskLevel: 'high',
  },
  {
    id: 'previous_infective_endocarditis',
    label: 'Endocarditis infecciosa previa',
    alert: 'Considerar protocolo de profilaxis antibiótica según guías vigentes.',
    riskLevel: 'high',
  },
]

export const ORAL_SURGERY_ENDOCRINE_DISEASE_OPTIONS: OralSurgeryCheckOption[] = [
  {
    id: 'uncontrolled_diabetes',
    label: 'Diabetes Mellitus descontrolada (HbA1c elevada)',
    alert: 'Riesgo de infección, cicatrización deficiente y complicaciones metabólicas.',
    riskLevel: 'high',
  },
  {
    id: 'chronic_adrenal_insufficiency',
    label: 'Insuficiencia suprarrenal crónica',
    alert: 'Requiere cobertura con esteroides de estrés perioperatorios.',
    riskLevel: 'high',
  },
]

export const ORAL_SURGERY_ENDOCRINE_MEDICATION_OPTIONS: OralSurgeryCheckOption[] = [
  {
    id: 'prednisone',
    label: 'Prednisona',
    alert: 'Corticosteroide sistémico crónico; puede alterar cicatrización e inmunidad.',
    riskLevel: 'standard',
  },
  {
    id: 'dexamethasone',
    label: 'Dexametasona',
    alert: 'Corticosteroide sistémico; evaluar supresión adrenal y cobertura perioperatoria.',
    riskLevel: 'standard',
  },
  {
    id: 'hydrocortisone',
    label: 'Hidrocortisona',
    alert: 'Corticosteroide sistémico; considerar ajuste en estrés quirúrgico.',
    riskLevel: 'standard',
  },
  {
    id: 'methylprednisolone',
    label: 'Metilprednisolona',
    alert: 'Corticosteroide sistémico; riesgo de cicatrización comprometida.',
    riskLevel: 'standard',
  },
]

export const ORAL_SURGERY_IMMUNOSUPPRESSION_DISEASE_OPTIONS: OralSurgeryCheckOption[] = [
  {
    id: 'advanced_hiv_aids',
    label: 'VIH / SIDA avanzado',
    alert: 'Inmunosupresión severa; alto riesgo infeccioso y cicatrización alterada.',
    riskLevel: 'high',
  },
  {
    id: 'neutropenia_blood_dyscrasia',
    label: 'Neutropenia o discrasias sanguíneas severas',
    alert: 'Riesgo infeccioso y hemorrágico elevado.',
    riskLevel: 'high',
  },
  {
    id: 'solid_organ_transplant',
    label: 'Trasplante de órgano sólido',
    alert: 'Inmunosupresión crónica; coordinar con equipo de trasplante.',
    riskLevel: 'high',
  },
]

export const ORAL_SURGERY_IMMUNOSUPPRESSION_MEDICATION_OPTIONS: OralSurgeryCheckOption[] = [
  {
    id: 'cyclosporine',
    label: 'Ciclosporina',
    alert: 'Inmunosupresor; mayor riesgo de infección y efectos sobre tejidos gingivales.',
    riskLevel: 'high',
  },
  {
    id: 'tacrolimus',
    label: 'Tacrolimus',
    alert: 'Inhibidor de calcineurina; riesgo infeccioso perioperatorio elevado.',
    riskLevel: 'high',
  },
  {
    id: 'methotrexate',
    label: 'Metotrexato',
    alert: 'Inmunosupresor; evaluar suspensión temporal según indicación sistémica.',
    riskLevel: 'high',
  },
  {
    id: 'azathioprine',
    label: 'Azatioprina',
    alert: 'Inmunosupresor; aumenta susceptibilidad a infecciones postquirúrgicas.',
    riskLevel: 'high',
  },
  {
    id: 'active_chemotherapy',
    label: 'Quimioterapia antitumoral activa',
    alert: 'Mielosupresión e inmunosupresión; posponer cirugía electiva si es posible.',
    riskLevel: 'high',
  },
]

export const ORAL_SURGERY_ALLERGY_OPTIONS: OralSurgeryCheckOption[] = [
  {
    id: 'allergy_amoxicillin',
    label: 'Amoxicilina',
    alert: 'Alergia a antibiótico betalactámico; ajustar profilaxis antibiótica.',
    riskLevel: 'high',
  },
  {
    id: 'allergy_penicillin',
    label: 'Penicilina',
    alert: 'Evitar betalactámicos; documentar alternativas para profilaxis.',
    riskLevel: 'high',
  },
  {
    id: 'allergy_clindamycin',
    label: 'Clindamicina',
    alert: 'Alergia documentada; seleccionar esquema antibiótico alternativo.',
    riskLevel: 'high',
  },
  {
    id: 'allergy_azithromycin',
    label: 'Azitromicina',
    alert: 'Alergia a macrólido; considerar alternativas para profilaxis.',
    riskLevel: 'high',
  },
  {
    id: 'allergy_lidocaine',
    label: 'Lidocaína',
    alert: 'Evitar anestésico local del grupo aminoamida correspondiente.',
    riskLevel: 'high',
  },
  {
    id: 'allergy_mepivacaine',
    label: 'Mepivacaína',
    alert: 'Seleccionar anestésico local alternativo sin reacción cruzada.',
    riskLevel: 'high',
  },
  {
    id: 'allergy_articaine',
    label: 'Articaína',
    alert: 'Documentar alternativa anestésica para el procedimiento.',
    riskLevel: 'high',
  },
  {
    id: 'allergy_ibuprofen',
    label: 'Ibuprofeno',
    alert: 'Alergia a AINE; evitar en analgesia postoperatoria.',
    riskLevel: 'standard',
  },
  {
    id: 'allergy_diclofenac',
    label: 'Diclofenaco',
    alert: 'Alergia a AINE; planificar analgesia alternativa.',
    riskLevel: 'standard',
  },
  {
    id: 'allergy_naproxen',
    label: 'Naproxeno',
    alert: 'Alergia a AINE; ajustar manejo del dolor postoperatorio.',
    riskLevel: 'standard',
  },
  {
    id: 'allergy_metamizole',
    label: 'Dipirona / Metamizol',
    alert: 'Hipersensibilidad documentada; evitar en analgesia.',
    riskLevel: 'high',
  },
  {
    id: 'allergy_paracetamol',
    label: 'Paracetamol',
    alert: 'Alergia o intolerancia; seleccionar analgésico alternativo.',
    riskLevel: 'standard',
  },
]

export const ORAL_SURGERY_LOCAL_FACTOR_OPTIONS: OralSurgeryCheckOption[] = [
  {
    id: 'acute_pericoronitis',
    label: 'Pericoronitis aguda purulenta',
    alert: 'Contraindicación temporal; resolver infección antes de cirugía.',
    riskLevel: 'high',
  },
  {
    id: 'acute_abscess_cellulitis',
    label: 'Absceso dentoalveolar agudo con celulitis facial',
    alert: 'Urgencia infecciosa; diferir cirugía electiva hasta control del proceso.',
    riskLevel: 'high',
  },
  {
    id: 'severe_trismus',
    label: 'Trismus severo',
    alert: 'Limitación de apertura; dificulta abordaje quirúrgico seguro.',
    riskLevel: 'high',
  },
  {
    id: 'active_osteoradionecrosis',
    label: 'Osteorradionecrosis activa',
    alert: 'Contraindicación absoluta en zona afectada.',
    riskLevel: 'high',
  },
  {
    id: 'massive_maxillary_radiotherapy',
    label: 'Antecedente de radioterapia maxilar masiva (> 50 Gy)',
    alert: 'Riesgo elevado de osteorradionecrosis y cicatrización deficiente.',
    riskLevel: 'high',
  },
]

function createBooleanMap(options: OralSurgeryCheckOption[]): OralSurgeryBooleanMap {
  return Object.fromEntries(options.map((option) => [option.id, false]))
}

function normalizeBooleanMap(
  data: OralSurgeryBooleanMap | undefined,
  options: OralSurgeryCheckOption[],
): OralSurgeryBooleanMap {
  const empty = createBooleanMap(options)
  if (!data || typeof data !== 'object') return empty
  const normalized = { ...empty }
  for (const option of options) {
    normalized[option.id] = Boolean(data[option.id])
  }
  return normalized
}

const PERMANENT_FDI_NUMBERS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
])

function normalizeTreatmentPlanItem(
  raw: Partial<OralSurgeryTreatmentPlanItem>,
  index: number,
): OralSurgeryTreatmentPlanItem | null {
  const cupsCode = typeof raw.cupsCode === 'string'
    ? raw.cupsCode.replace(/\D/g, '').padStart(6, '0').slice(0, 6)
    : ''
  const procedure = typeof raw.procedure === 'string' ? raw.procedure.trim() : ''
  const toothNumber = typeof raw.toothNumber === 'number' ? raw.toothNumber : NaN

  if (!cupsCode || !procedure || !PERMANENT_FDI_NUMBERS.has(toothNumber)) {
    return null
  }

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : `oral-surgery-tx-${index}`,
    cupsCode,
    procedure,
    toothNumber,
    notes: typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : undefined,
  }
}

export function normalizeOralSurgeryTreatmentPlan(
  data?: Partial<OralSurgeryTreatmentPlanItem>[],
): OralSurgeryTreatmentPlanItem[] {
  if (!Array.isArray(data)) return []
  return data
    .map((item, index) => normalizeTreatmentPlanItem(item, index))
    .filter((item): item is OralSurgeryTreatmentPlanItem => item !== null)
}

export function createEmptyOralSurgeryAnnex(): OralSurgeryAnnex {
  return {
    coagulationDiseases: createBooleanMap(ORAL_SURGERY_COAGULATION_DISEASE_OPTIONS),
    coagulationMedications: createBooleanMap(ORAL_SURGERY_COAGULATION_MEDICATION_OPTIONS),
    mronjDiseases: createBooleanMap(ORAL_SURGERY_MRONJ_DISEASE_OPTIONS),
    mronjMedications: createBooleanMap(ORAL_SURGERY_MRONJ_MEDICATION_OPTIONS),
    cardiovascularDiseases: createBooleanMap(ORAL_SURGERY_CARDIOVASCULAR_OPTIONS),
    endocrineDiseases: createBooleanMap(ORAL_SURGERY_ENDOCRINE_DISEASE_OPTIONS),
    endocrineMedications: createBooleanMap(ORAL_SURGERY_ENDOCRINE_MEDICATION_OPTIONS),
    immunosuppressionDiseases: createBooleanMap(ORAL_SURGERY_IMMUNOSUPPRESSION_DISEASE_OPTIONS),
    immunosuppressionMedications: createBooleanMap(ORAL_SURGERY_IMMUNOSUPPRESSION_MEDICATION_OPTIONS),
    allergies: createBooleanMap(ORAL_SURGERY_ALLERGY_OPTIONS),
    localFactors: createBooleanMap(ORAL_SURGERY_LOCAL_FACTOR_OPTIONS),
    treatmentPlan: [],
    notes: '',
  }
}

export function normalizeOralSurgeryAnnex(data?: Partial<OralSurgeryAnnex>): OralSurgeryAnnex {
  const empty = createEmptyOralSurgeryAnnex()
  return {
    coagulationDiseases: normalizeBooleanMap(
      data?.coagulationDiseases,
      ORAL_SURGERY_COAGULATION_DISEASE_OPTIONS,
    ),
    coagulationMedications: normalizeBooleanMap(
      data?.coagulationMedications,
      ORAL_SURGERY_COAGULATION_MEDICATION_OPTIONS,
    ),
    mronjDiseases: normalizeBooleanMap(data?.mronjDiseases, ORAL_SURGERY_MRONJ_DISEASE_OPTIONS),
    mronjMedications: normalizeBooleanMap(
      data?.mronjMedications,
      ORAL_SURGERY_MRONJ_MEDICATION_OPTIONS,
    ),
    cardiovascularDiseases: normalizeBooleanMap(
      data?.cardiovascularDiseases,
      ORAL_SURGERY_CARDIOVASCULAR_OPTIONS,
    ),
    endocrineDiseases: normalizeBooleanMap(
      data?.endocrineDiseases,
      ORAL_SURGERY_ENDOCRINE_DISEASE_OPTIONS,
    ),
    endocrineMedications: normalizeBooleanMap(
      data?.endocrineMedications,
      ORAL_SURGERY_ENDOCRINE_MEDICATION_OPTIONS,
    ),
    immunosuppressionDiseases: normalizeBooleanMap(
      data?.immunosuppressionDiseases,
      ORAL_SURGERY_IMMUNOSUPPRESSION_DISEASE_OPTIONS,
    ),
    immunosuppressionMedications: normalizeBooleanMap(
      data?.immunosuppressionMedications,
      ORAL_SURGERY_IMMUNOSUPPRESSION_MEDICATION_OPTIONS,
    ),
    allergies: normalizeBooleanMap(data?.allergies, ORAL_SURGERY_ALLERGY_OPTIONS),
    localFactors: normalizeBooleanMap(data?.localFactors, ORAL_SURGERY_LOCAL_FACTOR_OPTIONS),
    treatmentPlan: normalizeOralSurgeryTreatmentPlan(data?.treatmentPlan),
    notes: typeof data?.notes === 'string' ? data.notes : empty.notes,
  }
}

function collectActiveAlerts(
  map: OralSurgeryBooleanMap,
  options: OralSurgeryCheckOption[],
): { highRisk: string[]; standardRisk: string[] } {
  const highRisk: string[] = []
  const standardRisk: string[] = []

  for (const option of options) {
    if (!map[option.id]) continue
    const message = `${option.label}: ${option.alert}`
    if (option.riskLevel === 'high') highRisk.push(message)
    else standardRisk.push(message)
  }

  return { highRisk, standardRisk }
}

export function getOralSurgeryRiskAlerts(annex: OralSurgeryAnnex): {
  highRisk: string[]
  standardRisk: string[]
} {
  const groups = [
    collectActiveAlerts(annex.coagulationDiseases, ORAL_SURGERY_COAGULATION_DISEASE_OPTIONS),
    collectActiveAlerts(annex.coagulationMedications, ORAL_SURGERY_COAGULATION_MEDICATION_OPTIONS),
    collectActiveAlerts(annex.mronjDiseases, ORAL_SURGERY_MRONJ_DISEASE_OPTIONS),
    collectActiveAlerts(annex.mronjMedications, ORAL_SURGERY_MRONJ_MEDICATION_OPTIONS),
    collectActiveAlerts(annex.cardiovascularDiseases, ORAL_SURGERY_CARDIOVASCULAR_OPTIONS),
    collectActiveAlerts(annex.endocrineDiseases, ORAL_SURGERY_ENDOCRINE_DISEASE_OPTIONS),
    collectActiveAlerts(annex.endocrineMedications, ORAL_SURGERY_ENDOCRINE_MEDICATION_OPTIONS),
    collectActiveAlerts(annex.immunosuppressionDiseases, ORAL_SURGERY_IMMUNOSUPPRESSION_DISEASE_OPTIONS),
    collectActiveAlerts(
      annex.immunosuppressionMedications,
      ORAL_SURGERY_IMMUNOSUPPRESSION_MEDICATION_OPTIONS,
    ),
    collectActiveAlerts(annex.allergies, ORAL_SURGERY_ALLERGY_OPTIONS),
    collectActiveAlerts(annex.localFactors, ORAL_SURGERY_LOCAL_FACTOR_OPTIONS),
  ]

  return {
    highRisk: groups.flatMap((group) => group.highRisk),
    standardRisk: groups.flatMap((group) => group.standardRisk),
  }
}

export function hasOralSurgeryRiskAlerts(annex: OralSurgeryAnnex): boolean {
  const alerts = getOralSurgeryRiskAlerts(annex)
  return alerts.highRisk.length > 0 || alerts.standardRisk.length > 0
}

export function hasOralSurgeryAnnexContent(annex: OralSurgeryAnnex): boolean {
  if (annex.notes.trim()) return true
  if (annex.treatmentPlan.length > 0) return true

  const maps = [
    annex.coagulationDiseases,
    annex.coagulationMedications,
    annex.mronjDiseases,
    annex.mronjMedications,
    annex.cardiovascularDiseases,
    annex.endocrineDiseases,
    annex.endocrineMedications,
    annex.immunosuppressionDiseases,
    annex.immunosuppressionMedications,
    annex.allergies,
    annex.localFactors,
  ]

  return maps.some((map) => Object.values(map).some(Boolean))
}

export function resolveImplantSurgicalRiskAssessment(
  implantData?: Partial<OralSurgeryAnnex>,
  standaloneOralSurgery?: Partial<OralSurgeryAnnex>,
): OralSurgeryAnnex {
  const implantAssessment = normalizeOralSurgeryAnnex(implantData)
  if (hasOralSurgeryAnnexContent(implantAssessment)) {
    return implantAssessment
  }

  const standaloneAssessment = normalizeOralSurgeryAnnex(standaloneOralSurgery)
  if (hasOralSurgeryAnnexContent(standaloneAssessment)) {
    return standaloneAssessment
  }

  return implantAssessment
}

function formatSelectedLabels(
  map: OralSurgeryBooleanMap,
  options: OralSurgeryCheckOption[],
): string {
  const labels = options.filter((option) => map[option.id]).map((option) => option.label)
  return labels.join(', ')
}

export function formatOralSurgeryAnnexSummary(annex: OralSurgeryAnnex): string {
  const parts: string[] = []

  const sections: { title: string; map: OralSurgeryBooleanMap; options: OralSurgeryCheckOption[] }[] =
    [
      {
        title: 'Coagulación (enfermedades)',
        map: annex.coagulationDiseases,
        options: ORAL_SURGERY_COAGULATION_DISEASE_OPTIONS,
      },
      {
        title: 'Coagulación (fármacos)',
        map: annex.coagulationMedications,
        options: ORAL_SURGERY_COAGULATION_MEDICATION_OPTIONS,
      },
      {
        title: 'MRONJ (indicaciones)',
        map: annex.mronjDiseases,
        options: ORAL_SURGERY_MRONJ_DISEASE_OPTIONS,
      },
      {
        title: 'MRONJ (fármacos)',
        map: annex.mronjMedications,
        options: ORAL_SURGERY_MRONJ_MEDICATION_OPTIONS,
      },
      {
        title: 'Cardiovascular',
        map: annex.cardiovascularDiseases,
        options: ORAL_SURGERY_CARDIOVASCULAR_OPTIONS,
      },
      {
        title: 'Endocrino (enfermedades)',
        map: annex.endocrineDiseases,
        options: ORAL_SURGERY_ENDOCRINE_DISEASE_OPTIONS,
      },
      {
        title: 'Endocrino (corticosteroides)',
        map: annex.endocrineMedications,
        options: ORAL_SURGERY_ENDOCRINE_MEDICATION_OPTIONS,
      },
      {
        title: 'Inmunosupresión (enfermedades)',
        map: annex.immunosuppressionDiseases,
        options: ORAL_SURGERY_IMMUNOSUPPRESSION_DISEASE_OPTIONS,
      },
      {
        title: 'Inmunosupresión (fármacos)',
        map: annex.immunosuppressionMedications,
        options: ORAL_SURGERY_IMMUNOSUPPRESSION_MEDICATION_OPTIONS,
      },
      { title: 'Alergias', map: annex.allergies, options: ORAL_SURGERY_ALLERGY_OPTIONS },
      {
        title: 'Factores locales',
        map: annex.localFactors,
        options: ORAL_SURGERY_LOCAL_FACTOR_OPTIONS,
      },
    ]

  for (const section of sections) {
    const summary = formatSelectedLabels(section.map, section.options)
    if (summary) parts.push(`${section.title}: ${summary}`)
  }

  if (annex.notes.trim()) parts.push(`Notas: ${annex.notes.trim()}`)

  return parts.join(' · ')
}

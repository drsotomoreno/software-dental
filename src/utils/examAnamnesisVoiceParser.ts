import {
  CRITICAL_MEDICATION_OPTIONS,
  SYSTEMIC_DISEASES_OPTIONS,
} from '@/types/anamnesis'
import type {
  AngleClass,
  AtmDeviationMovement,
  AtmLaterality,
  CrossbiteType,
  GingivitisType,
  OralHygieneLevel,
  PeriodontiumYesNo,
} from '@/types/stomatologicalExam'
const VALID_TOOTH_PATTERN =
  /\b(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])\b/g

function normalizeVoiceText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[.,;:!?¿¡]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractToothNumbers(text: string): number[] {
  const matches = text.matchAll(VALID_TOOTH_PATTERN)
  const numbers = [...matches].map((m) => Number(m[1]))
  return [...new Set(numbers)]
}

export type ClinicalVoiceScope =
  | 'allergies'
  | 'diseases'
  | 'critical_meds'
  | 'atm'
  | 'occlusion'
  | 'plaque_calculus'
  | 'inflammation'
  | 'mobility'
  | 'odontogram'

export type AllergyVoiceField = 'medications' | 'anesthesia' | 'other'

export interface AllergiesVoiceCommand {
  type: 'anamnesis_allergies'
  noReporta?: boolean
  field?: AllergyVoiceField
  value?: string
}

export interface SystemicDiseasesVoiceCommand {
  type: 'anamnesis_diseases'
  noReporta?: boolean
  diseases?: string[]
  other?: string
}

export interface CriticalMedicationsVoiceCommand {
  type: 'anamnesis_critical_meds'
  medications: string[]
}

export interface AtmVoiceCommand {
  type: 'exam_atm'
  isNormal?: boolean
  clicks?: AtmLaterality
  pain?: AtmLaterality
  deviation?: AtmDeviationMovement
  notes?: string
}

export interface OcclusionVoiceCommand {
  type: 'exam_occlusion'
  isNormal?: boolean
  molarRight?: AngleClass
  molarLeft?: AngleClass
  canineLeft?: AngleClass
  canineRight?: AngleClass
  crossbite?: boolean
  crossbiteType?: CrossbiteType | null
  openbite?: boolean
  deepBite?: boolean
  notes?: string
}

export interface PlaqueCalculusVoiceCommand {
  type: 'exam_plaque_calculus'
  hygiene?: OralHygieneLevel
  calculusPresent?: PeriodontiumYesNo
}

export interface InflammationBleedingVoiceCommand {
  type: 'exam_inflammation'
  bleedingOnBrushing?: PeriodontiumYesNo
  bleedingOnProbing?: PeriodontiumYesNo
  erythema?: PeriodontiumYesNo
  edema?: PeriodontiumYesNo
  gingivitisPresent?: PeriodontiumYesNo
  gingivitisType?: GingivitisType
}

export interface MobilityVoiceCommand {
  type: 'exam_mobility'
  present?: PeriodontiumYesNo
  affectedTeeth?: string
}

export type ExamAnamnesisVoiceCommand =
  | AllergiesVoiceCommand
  | SystemicDiseasesVoiceCommand
  | CriticalMedicationsVoiceCommand
  | AtmVoiceCommand
  | OcclusionVoiceCommand
  | PlaqueCalculusVoiceCommand
  | InflammationBleedingVoiceCommand
  | MobilityVoiceCommand

type DiseaseOption = (typeof SYSTEMIC_DISEASES_OPTIONS)[number]
type MedicationOption = (typeof CRITICAL_MEDICATION_OPTIONS)[number]

const DISEASE_RULES: { option: DiseaseOption; pattern: RegExp }[] = [
  {
    option: 'Diabetes Mellitus no controlada',
    pattern: /\bdiabetes(?:\s+mellitus)?\s+no\s+controlad/,
  },
  {
    option: 'Cardiopatías graves o no controladas',
    pattern: /\bcardiopatia(?:s)?(?:\s+graves?)?(?:\s+o)?(?:\s+no\s+controlad)?/,
  },
  {
    option: 'Trastornos de la coagulación no controlados',
    pattern: /\bcoagulacion\s+no\s+controlad/,
  },
  {
    option: 'Enfermedades autoinmunes graves / inmunosupresión',
    pattern: /\b(autoinmune|inmunosupresion|lupus|artritis reumatoide)\b/,
  },
  {
    option: 'Trastornos del metabolismo óseo',
    pattern: /\b(metabolismo oseo|osteoporosis|osteopenia|oseo)\b/,
  },
  { option: 'Hipertensión arterial', pattern: /\b(hipertension|hta|presion alta)\b/ },
  { option: 'Diabetes mellitus', pattern: /\b(diabetes|dm2|glucosa alta)\b/ },
  {
    option: 'Enfermedad cardíaca',
    pattern: /\b(enfermedad cardiaca|cardiaco|infarto|arritmia)\b/,
  },
  { option: 'Trastornos de coagulación', pattern: /\b(coagulacion|hemofili)\b/ },
  { option: 'VIH/SIDA', pattern: /\b(vih|sida|hiv)\b/ },
  { option: 'Hepatitis', pattern: /\bhepatitis\b/ },
  { option: 'Asma / EPOC', pattern: /\b(asma|epoc)\b/ },
  { option: 'Enfermedad renal', pattern: /\b(renal|rinon|dialisis)\b/ },
  { option: 'Embarazo', pattern: /\b(embarazo|embarazada|gestacion)\b/ },
  {
    option: 'Trastornos psiquiátricos',
    pattern: /\b(psiquiatric|depresion|ansiedad|bipolar|esquizofren)\b/,
  },
]

const MEDICATION_RULES: { option: MedicationOption; pattern: RegExp }[] = [
  {
    option: 'Fármacos antirresortivos / antiangiogénicos (Bifosfonatos / Denosumab)',
    pattern: /\b(bifosfonato|denosumab|antirresortiv|antiangiogenic)/,
  },
  {
    option: 'Corticosteroides sistémicos crónicos',
    pattern: /\b(corticoide|corticosteroide|prednisona|prednisolona)/,
  },
  {
    option: 'Anticoagulantes o antiagregantes plaquetarios',
    pattern: /\b(anticoagulant|antiagregant|warfarina|aspirina|clopidogrel)/,
  },
  { option: 'Inmunosupresores', pattern: /\binmunosupresor/ },
  {
    option: 'Antidepresivos (ISRS)',
    pattern: /\b(antidepresiv|isrs|sertralina|fluoxetina|paroxetina)/,
  },
]

const FILLER_PATTERN =
  /\b(el|la|los|las|un|una|de|del|al|a|en|por|con|y|o|que|se|hay|tiene|presenta|reporta|paciente)\b/g

function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function stripPattern(text: string, pattern: RegExp): string {
  return collapseSpaces(text.replace(pattern, ' '))
}

function detectLaterality(text: string): AtmLaterality | '' {
  if (/\b(bilateral|ambos lados|los dos lados)\b/.test(text)) return 'bilateral'
  if (/\b(izquierda|izquierdo)\b/.test(text)) return 'izquierda'
  if (/\b(derecha|derecho)\b/.test(text)) return 'derecha'
  return ''
}

function detectAngleClass(text: string): AngleClass | null {
  if (/\b(clase\s*(iii|3|tres)|angle\s*iii)\b/.test(text)) return 'III'
  if (/\b(clase\s*(ii|2|dos)|angle\s*ii)\b/.test(text)) return 'II'
  if (/\b(clase\s*(i|1|uno)|angle\s*i)\b/.test(text)) return 'I'
  if (/\bno aplica\b/.test(text)) return 'no_evaluado'
  return null
}

function detectTopicYesNo(text: string, topic: RegExp): PeriodontiumYesNo | null {
  if (!topic.test(text)) return null
  if (
    /\b(no hay|sin |ausente|negativo|niega)\b/.test(text) ||
    /\bno\b/.test(text) && !/\bsi\b/.test(text)
  ) {
    return 'no'
  }
  return 'si'
}

function isNoReportaPhrase(text: string): boolean {
  return /\b(no reporta|sin novedad|niega|ningun[ao]?)\b/.test(text)
}

function parseAllergies(
  text: string,
  scoped: boolean,
): AllergiesVoiceCommand | null {
  const mentionsAllergy = /\balerg/.test(text)
  if (!scoped && !mentionsAllergy) return null

  if (
    /\bno reporta alerg/.test(text) ||
    /\b(sin alerg|niega alerg|alergias?\s+no)\b/.test(text) ||
    (scoped && isNoReportaPhrase(text) && !/\b(penicilin|lidocain|latex|aines)\b/.test(text))
  ) {
    return { type: 'anamnesis_allergies', noReporta: true }
  }

  let field: AllergyVoiceField = 'medications'
  if (/\b(anestesi|lidocain|mepivacain|artican|bupivacain)/.test(text)) {
    field = 'anesthesia'
  } else if (/\b(latex|alimento|metal|niquel|yodo|marisco|polvo)/.test(text)) {
    field = 'other'
  }

  const value = stripPattern(
    text,
    /\b(alergias?|al|medicamentos?|anestesia|otras?|antecedentes?)\b/g,
  )
  const cleaned = stripPattern(value, FILLER_PATTERN)
  if (!cleaned) return null

  return { type: 'anamnesis_allergies', field, value: cleaned }
}

function parseDiseases(
  text: string,
  scoped: boolean,
): SystemicDiseasesVoiceCommand | null {
  const mentionsDisease = /\b(enfermedad(?:es)?|sistemic|antecedentes?)\b/.test(text)
  const matched = DISEASE_RULES.filter((rule) => rule.pattern.test(text)).map(
    (rule) => rule.option,
  )
  const uniqueDiseases = [...new Set(matched)].filter((disease) => {
    if (disease === 'Diabetes mellitus' && matched.includes('Diabetes Mellitus no controlada')) {
      return false
    }
    if (
      disease === 'Trastornos de coagulación' &&
      matched.includes('Trastornos de la coagulación no controlados')
    ) {
      return false
    }
    if (
      disease === 'Enfermedad cardíaca' &&
      matched.includes('Cardiopatías graves o no controladas')
    ) {
      return false
    }
    return true
  })

  if (
    /\b(no reporta enfermedades?|sin enfermedades?|niega enfermedades?)\b/.test(text) ||
    (scoped && isNoReportaPhrase(text) && uniqueDiseases.length === 0)
  ) {
    return { type: 'anamnesis_diseases', noReporta: true }
  }

  if (!scoped && uniqueDiseases.length === 0 && !mentionsDisease) return null

  let leftover = text
  for (const rule of DISEASE_RULES) {
    leftover = leftover.replace(rule.pattern, ' ')
  }
  leftover = stripPattern(
    leftover,
    /\b(enfermedad(?:es)?|sistemicas?|antecedentes?|otras?)\b/g,
  )
  leftover = stripPattern(leftover, FILLER_PATTERN)

  if (uniqueDiseases.length === 0 && !leftover) return null

  return {
    type: 'anamnesis_diseases',
    diseases: uniqueDiseases,
    other: leftover || undefined,
  }
}

function parseCriticalMeds(text: string): CriticalMedicationsVoiceCommand | null {
  const matched = MEDICATION_RULES.filter((rule) => rule.pattern.test(text)).map(
    (rule) => rule.option,
  )
  const unique = [...new Set(matched)]
  if (unique.length === 0) return null
  return { type: 'anamnesis_critical_meds', medications: unique }
}

function parseAtm(text: string, scoped: boolean): AtmVoiceCommand | null {
  const mentionsAtm = /\b(atm|articulacion|temporomandibular|chasquid|crepitacion)\b/.test(
    text,
  )
  const mentionsClicks = /\b(clics?|chasquid|crepitacion)\b/.test(text)
  const mentionsPain = /\b(dolor|algias?)\b/.test(text)
  const mentionsDeviation = /\bdesviacion\b/.test(text)
  const mentionsNormal = /\b(normal|sin hallazgo|todo normal|sin alteraciones?)\b/.test(
    text,
  )

  if (!scoped && !mentionsAtm && !mentionsClicks && !mentionsDeviation) {
    const lateralityOnlyPain = mentionsPain && detectLaterality(text)
    if (!lateralityOnlyPain) return null
  }

  if (mentionsNormal && (scoped || mentionsAtm) && !mentionsClicks && !mentionsPain) {
    return { type: 'exam_atm', isNormal: true }
  }

  const command: AtmVoiceCommand = { type: 'exam_atm', isNormal: false }
  const laterality = detectLaterality(text)
  const side = laterality || 'bilateral'

  if (mentionsClicks) command.clicks = side
  if (mentionsPain && (mentionsAtm || scoped || mentionsClicks || laterality)) {
    command.pain = side
  }
  if (mentionsDeviation) {
    command.deviation = /\bcierre\b/.test(text) ? 'cierre' : 'apertura'
  }

  const leftover = stripPattern(
    text,
    /\b(atm|articulacion|temporomandibular|clics?|chasquid(?:o|os)?|crepitacion|dolor|algias?|desviacion|apertura|cierre|derecha|izquierda|bilateral|ambos lados|normal)\b/g,
  )
  const notes = stripPattern(leftover, FILLER_PATTERN)
  if (notes) command.notes = notes

  if (
    command.clicks === undefined &&
    command.pain === undefined &&
    command.deviation === undefined &&
    !command.notes &&
    !mentionsNormal
  ) {
    return null
  }

  return command
}

function parseOcclusion(text: string, scoped: boolean): OcclusionVoiceCommand | null {
  const mentionsOcclusion = /\b(oclusion|mordida|maloclusion|angle)\b/.test(text)
  const angleClass = detectAngleClass(text)
  const mentionsCrossbite = /\bmordida cruzada\b/.test(text) || (scoped && /\bcruzada\b/.test(text))
  const mentionsOpenbite = /\bmordida abierta\b/.test(text)
  const mentionsDeepBite = /\b(mordida profunda|sobremordida)\b/.test(text)
  const mentionsNormal = /\b(oclusion normal|normal)\b/.test(text)

  if (
    !scoped &&
    !mentionsOcclusion &&
    !angleClass &&
    !mentionsCrossbite &&
    !mentionsOpenbite &&
    !mentionsDeepBite
  ) {
    return null
  }
  if (!scoped && mentionsNormal && !mentionsOcclusion && !angleClass) return null

  if (
    (mentionsNormal && mentionsOcclusion && !angleClass && !mentionsCrossbite) ||
    (scoped && mentionsNormal && !angleClass && !mentionsCrossbite && !mentionsOpenbite)
  ) {
    return { type: 'exam_occlusion', isNormal: true }
  }

  const command: OcclusionVoiceCommand = { type: 'exam_occlusion', isNormal: false }

  if (angleClass) {
    const isMolar = /\bmolar/.test(text)
    const isCanine = /\b(canin)/.test(text)
    const isRight = /\b(derecha|derecho)\b/.test(text)
    const isLeft = /\b(izquierda|izquierdo)\b/.test(text)
    const applyMolar = isMolar || (!isMolar && !isCanine)
    const applyCanine = isCanine || (!isMolar && !isCanine)
    const applyRight = isRight || (!isRight && !isLeft)
    const applyLeft = isLeft || (!isRight && !isLeft)

    if (applyMolar && applyRight) command.molarRight = angleClass
    if (applyMolar && applyLeft) command.molarLeft = angleClass
    if (applyCanine && applyRight) command.canineRight = angleClass
    if (applyCanine && applyLeft) command.canineLeft = angleClass
  }

  if (mentionsCrossbite) {
    command.crossbite = true
    if (/\banterior\b/.test(text)) command.crossbiteType = 'anterior'
    else if (/\bposterior\b/.test(text) && /\b(bilateral|ambos)\b/.test(text)) {
      command.crossbiteType = 'posterior_bilateral'
    } else if (/\bposterior\b/.test(text) && /\b(derecha|derecho)\b/.test(text)) {
      command.crossbiteType = 'posterior_derecha'
    } else if (/\bposterior\b/.test(text) && /\b(izquierda|izquierdo)\b/.test(text)) {
      command.crossbiteType = 'posterior_izquierda'
    } else {
      command.crossbiteType = 'anterior'
    }
  }

  if (mentionsOpenbite) command.openbite = true
  if (mentionsDeepBite && !mentionsOpenbite) command.deepBite = true

  const leftover = stripPattern(
    text,
    /\b(oclusion|maloclusion|mordida|cruzada|abierta|profunda|sobremordida|clase|angle|molar|canin[oa]|i{1,3}|1|2|3|uno|dos|tres|derecha|izquierda|anterior|posterior|bilateral|normal)\b/g,
  )
  const notes = stripPattern(leftover, FILLER_PATTERN)
  if (notes) command.notes = notes

  if (
    !angleClass &&
    command.crossbite !== true &&
    command.openbite !== true &&
    command.deepBite !== true &&
    !command.notes
  ) {
    return scoped ? command : null
  }

  return command
}

function parsePlaqueCalculus(
  text: string,
  scoped: boolean,
): PlaqueCalculusVoiceCommand | null {
  const mentions = /\b(higiene|placa|calculos?|sarro)\b/.test(text)
  if (!scoped && !mentions) return null

  const command: PlaqueCalculusVoiceCommand = { type: 'exam_plaque_calculus' }

  if (/\b(higiene|placa)\b/.test(text) || scoped) {
    if (/\b(deficiente|mala|pobre)\b/.test(text)) command.hygiene = 'deficiente'
    else if (/\bregular\b/.test(text)) command.hygiene = 'regular'
    else if (/\bbuena\b/.test(text)) command.hygiene = 'buena'
  }

  const calculus = detectTopicYesNo(text, /\b(calculos?|sarro)\b/)
  if (calculus) command.calculusPresent = calculus

  if (!command.hygiene && !command.calculusPresent) return null
  return command
}

function parseInflammation(
  text: string,
  scoped: boolean,
): InflammationBleedingVoiceCommand | null {
  const mentions =
    /\b(sangrado|inflamacion|eritema|edema|gingivitis|enrojecimiento)\b/.test(text)
  if (!scoped && !mentions) return null

  const command: InflammationBleedingVoiceCommand = { type: 'exam_inflammation' }

  const brushing = detectTopicYesNo(text, /\b(cepillado|cepillar)\b/)
  if (brushing) command.bleedingOnBrushing = brushing

  const probing = detectTopicYesNo(text, /\b(exploracion|sondaje|sondeo)\b/)
  if (probing) command.bleedingOnProbing = probing

  if (/\bsangrado\b/.test(text) && !brushing && !probing) {
    command.bleedingOnBrushing = detectTopicYesNo(text, /\bsangrado\b/) ?? 'si'
  }

  const erythema = detectTopicYesNo(text, /\b(eritema|enrojecimiento)\b/)
  if (erythema) command.erythema = erythema

  const edema = detectTopicYesNo(text, /\bedema\b/)
  if (edema) command.edema = edema

  const gingivitis = detectTopicYesNo(text, /\bgingivitis\b/)
  if (gingivitis) {
    command.gingivitisPresent = gingivitis
    if (gingivitis === 'si') {
      if (/\bcronic/.test(text)) command.gingivitisType = 'cronica'
      else if (/\bagud/.test(text)) command.gingivitisType = 'aguda'
    }
  }

  if (
    command.bleedingOnBrushing === undefined &&
    command.bleedingOnProbing === undefined &&
    command.erythema === undefined &&
    command.edema === undefined &&
    command.gingivitisPresent === undefined
  ) {
    return null
  }

  return command
}

function parseMobility(text: string, scoped: boolean): MobilityVoiceCommand | null {
  const mentions = /\bmovilidad\b/.test(text)
  if (!scoped && !mentions) return null

  if (
    /\b(sin movilidad|no hay movilidad|ausencia de movilidad|movilidad no)\b/.test(text) ||
    (scoped && isNoReportaPhrase(text) && extractToothNumbers(text).length === 0)
  ) {
    return { type: 'exam_mobility', present: 'no' }
  }

  const teeth = extractToothNumbers(text)
  if (!mentions && teeth.length === 0 && !scoped) return null
  if (teeth.length === 0 && !mentions && scoped && !/\bsi\b/.test(text)) return null

  return {
    type: 'exam_mobility',
    present: 'si',
    affectedTeeth: teeth.length > 0 ? teeth.join(', ') : undefined,
  }
}

const UNSCOPED_PARSERS: Array<(text: string) => ExamAnamnesisVoiceCommand | null> = [
  (text) => parseAllergies(text, false),
  (text) => parseDiseases(text, false),
  (text) => parseCriticalMeds(text),
  (text) => parseAtm(text, false),
  (text) => parseOcclusion(text, false),
  (text) => parsePlaqueCalculus(text, false),
  (text) => parseInflammation(text, false),
  (text) => parseMobility(text, false),
]

function parseByScope(
  text: string,
  scope: ClinicalVoiceScope,
): ExamAnamnesisVoiceCommand | null {
  switch (scope) {
    case 'allergies':
      return parseAllergies(text, true)
    case 'diseases':
      return parseDiseases(text, true)
    case 'critical_meds':
      return parseCriticalMeds(text)
    case 'atm':
      return parseAtm(text, true)
    case 'occlusion':
      return parseOcclusion(text, true)
    case 'plaque_calculus':
      return parsePlaqueCalculus(text, true)
    case 'inflammation':
      return parseInflammation(text, true)
    case 'mobility':
      return parseMobility(text, true)
    case 'odontogram':
      return null
    default:
      return null
  }
}

export function parseExamAnamnesisVoiceCommand(
  raw: string,
  scope?: ClinicalVoiceScope,
): ExamAnamnesisVoiceCommand | null {
  const text = normalizeVoiceText(raw)
  if (!text) return null

  if (scope && scope !== 'odontogram') {
    return parseByScope(text, scope)
  }

  for (const parse of UNSCOPED_PARSERS) {
    const command = parse(text)
    if (command) return command
  }
  return null
}

export function describeExamAnamnesisVoiceCommand(
  command: ExamAnamnesisVoiceCommand,
): string {
  switch (command.type) {
    case 'anamnesis_allergies':
      if (command.noReporta) return 'Alergias: no reporta'
      return `Alergias (${command.field ?? 'medications'}): ${command.value ?? ''}`.trim()
    case 'anamnesis_diseases':
      if (command.noReporta) return 'Enfermedades sistémicas: no reporta'
      return `Enfermedades: ${(command.diseases ?? []).join(', ') || command.other || 'actualizado'}`
    case 'anamnesis_critical_meds':
      return `Medicaciones críticas: ${command.medications.join(', ')}`
    case 'exam_atm':
      if (command.isNormal) return 'ATM: normal'
      return [
        'ATM',
        command.clicks ? `clics ${command.clicks}` : null,
        command.pain ? `dolor ${command.pain}` : null,
        command.deviation ? `desviación ${command.deviation}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
        .replace(/^ATM ·/, 'ATM:')
    case 'exam_occlusion':
      if (command.isNormal) return 'Oclusión: normal'
      return 'Oclusión actualizada'
    case 'exam_plaque_calculus':
      return [
        'Placa y cálculo',
        command.hygiene ? `higiene ${command.hygiene}` : '',
        command.calculusPresent ? `cálculos ${command.calculusPresent}` : '',
      ]
        .filter(Boolean)
        .join(': ')
        .replace(/^Placa y cálculo:\s*/, 'Placa y cálculo: ')
    case 'exam_inflammation':
      return 'Inflamación y sangrado actualizados'
    case 'exam_mobility':
      if (command.present === 'no') return 'Movilidad dental: no'
      return `Movilidad dental: ${command.affectedTeeth || 'sí'}`
    default:
      return 'Comando reconocido'
  }
}

import type { TreatmentPhase } from '@/types/clinicalRecord'
import type { ToothFace, ToothFaceState, ToothGlobalState } from '@/types/odontogram'
import { getAllToothFaces } from './odontogramMutations'

const VALID_TOOTH_PATTERN =
  /\b(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])\b/g

const FACE_RULES: { pattern: RegExp; face: ToothFace }[] = [
  { pattern: /\b(vestibular|vestib|bucal)\b/, face: 'vestibular' },
  { pattern: /\bmesial\b/, face: 'mesial' },
  { pattern: /\b(oclusal|occlusal|incisal|incisivo)\b/, face: 'oclusal' },
  { pattern: /\bdistal\b/, face: 'distal' },
  { pattern: /\b(lingual|palatino|palatina)\b/, face: 'lingual' },
]

const FACE_STATE_RULES: { pattern: RegExp; state: ToothFaceState }[] = [
  { pattern: /\b(obturad[oa]s?|obturacion|sano|buen estado)\b/, state: 'obturado' },
  { pattern: /\b(restauracion defectuosa|patologia|defectuos[oa]|caries|carie|lesion)\b/, state: 'caries' },
  { pattern: /\b(restauracion|restauracion previa|amalgama|sellante|temporal)\b/, state: 'caries' },
  { pattern: /\b(borrar|limpiar|normal|sin hallazgo)\b/, state: 'sano' },
]

const GLOBAL_STATE_RULES: { pattern: RegExp; state: ToothGlobalState }[] = [
  { pattern: /\b(ausent[ea]|extraccion previa|extraid[oa])\b/, state: 'ausente' },
  { pattern: /\b(exodoncia indicada|extraccion indicada|extraer)\b/, state: 'exodoncia_indicada' },
  { pattern: /\b(endodoncia|conducto|tratamiento pulpar)\b/, state: 'endodoncia' },
  { pattern: /\bcorona\b/, state: 'corona' },
  { pattern: /\bimplante\b/, state: 'implante' },
  { pattern: /\b(protesis fija|protesis fija)\b/, state: 'protesis_fija' },
  { pattern: /\b(protesis removible|protesis removible)\b/, state: 'protesis_removible' },
  { pattern: /\bpresente\b/, state: 'presente' },
]

export interface ProcedureTemplate {
  procedure: string
  cupsCode: string
  phase: TreatmentPhase
}

const PROCEDURE_RULES: { pattern: RegExp; template: ProcedureTemplate }[] = [
  {
    pattern: /\b(resina|resina compuesta|operatoria)\b/,
    template: {
      procedure: 'Obturación dental con resina de fotocurado',
      cupsCode: '232102',
      phase: 'fase_ii',
    },
  },
  {
    pattern: /\b(endodoncia|conducto|tratamiento de conducto)\b/,
    template: {
      procedure: 'Endodoncia unirradicular',
      cupsCode: '997401',
      phase: 'fase_ii',
    },
  },
  {
    pattern: /\b(extraccion|exodoncia|avulsion)\b/,
    template: {
      procedure: 'Exodoncia de dientes permanentes',
      cupsCode: '230103',
      phase: 'fase_i',
    },
  },
  {
    pattern: /\b(limpieza|profilaxis|higiene oral)\b/,
    template: {
      procedure: 'Profilaxis dental o pulido coronal',
      cupsCode: '997001',
      phase: 'fase_i',
    },
  },
  {
    pattern: /\b(corona|corona metal porcelana|corona ceramica)\b/,
    template: {
      procedure: 'Corona individual / funda SOD',
      cupsCode: '234000',
      phase: 'fase_iii',
    },
  },
  {
    pattern: /\b(corona provisional|provisional)\b/,
    template: {
      procedure: 'Corona acrílica o provisional',
      cupsCode: '234001',
      phase: 'fase_iii',
    },
  },
  {
    pattern: /\b(protesis fija|puente)\b/,
    template: {
      procedure: 'Prótesis fija — unidad (pilar o póntico)',
      cupsCode: '234201',
      phase: 'fase_iii',
    },
  },
  {
    pattern: /\b(protesis removible|protesis parcial)\b/,
    template: {
      procedure: 'Prótesis removible parcial dentomucosoportada (PPR)',
      cupsCode: '234302',
      phase: 'fase_iii',
    },
  },
  {
    pattern: /\b(implante)\b/,
    template: {
      procedure: 'Implante dental',
      cupsCode: '997701',
      phase: 'fase_iii',
    },
  },
]

export interface OdontogramFacesCommand {
  type: 'odontogram_faces'
  toothNumber: number
  faces: ToothFace[]
  faceState: ToothFaceState
  addToPlan: boolean
  addToBudget: boolean
}

export interface OdontogramGlobalCommand {
  type: 'odontogram_global'
  toothNumber: number
  globalState: ToothGlobalState
  addToPlan: boolean
  addToBudget: boolean
}

export interface TreatmentAddCommand {
  type: 'treatment_add'
  toothNumber?: number
  procedure: string
  cupsCode?: string
  phase?: TreatmentPhase
}

export interface BudgetAddCommand {
  type: 'budget_add'
  toothNumber?: number
  procedure: string
  cupsCode?: string
}

export interface DiagnosisToothCommand {
  type: 'diagnosis_tooth'
  toothNumber: number
  searchQuery: string
}

export interface DiagnosisAdditionalCommand {
  type: 'diagnosis_additional'
  searchQuery: string
}

export type ClinicalVoiceCommand =
  | OdontogramFacesCommand
  | OdontogramGlobalCommand
  | TreatmentAddCommand
  | BudgetAddCommand
  | DiagnosisToothCommand
  | DiagnosisAdditionalCommand

export function normalizeVoiceText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[.,;:!?¿¡]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractToothNumbers(text: string): number[] {
  const matches = text.matchAll(VALID_TOOTH_PATTERN)
  const numbers = [...matches].map((m) => Number(m[1]))
  return [...new Set(numbers)]
}

export function extractFaces(text: string): ToothFace[] {
  const found = new Set<ToothFace>()
  for (const rule of FACE_RULES) {
    if (rule.pattern.test(text)) found.add(rule.face)
  }
  return [...found]
}

function detectFaceState(text: string): ToothFaceState | null {
  for (const rule of FACE_STATE_RULES) {
    if (rule.pattern.test(text)) return rule.state
  }
  return null
}

function detectGlobalState(text: string): ToothGlobalState | null {
  for (const rule of GLOBAL_STATE_RULES) {
    if (rule.pattern.test(text)) return rule.state
  }
  return null
}

function detectProcedure(text: string): ProcedureTemplate | null {
  for (const rule of PROCEDURE_RULES) {
    if (rule.pattern.test(text)) return rule.template
  }
  return null
}

function wantsBudget(text: string): boolean {
  return /\b(presupuesto|cotizacion|valorizar|cotizar)\b/.test(text)
}

function wantsTreatmentPlan(text: string): boolean {
  return /\b(plan de tratamiento|plan tratamiento|al plan|tratamiento)\b/.test(text)
}

function wantsExplicitAdd(text: string): boolean {
  return /\b(agregar|anadir|incluir|sumar|poner)\b/.test(text)
}

function wantsDiagnosisIntent(text: string): boolean {
  return /\b(diagnostico|diagnosticos|cie\s*10?)\b/.test(text)
}

function wantsAdditionalDiagnosis(text: string): boolean {
  return /\b(adicional|general|sin pieza)\b/.test(text)
}

function extractCieCode(text: string): string | null {
  const match = text.match(/\b([a-z]\d{2}(?:\.\d{1,2})?)\b/i)
  return match ? match[1].toUpperCase() : null
}

function extractDiagnosisSearchQuery(text: string): string {
  const cieCode = extractCieCode(text)
  if (cieCode) return cieCode

  return text
    .replace(/\b(pieza|diente|numero|seleccionar|asignar)\b/g, ' ')
    .replace(VALID_TOOTH_PATTERN, ' ')
    .replace(
      /\b(diagnostico|diagnosticos|cie\s*10?|agregar|anadir|incluir|adicional|general|en|la|el|de|por|sin|pieza)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDiagnosisCommand(text: string): DiagnosisToothCommand | DiagnosisAdditionalCommand | null {
  if (!wantsDiagnosisIntent(text) && !extractCieCode(text)) return null

  const toothNumbers = extractToothNumbers(text)
  const searchQuery = extractDiagnosisSearchQuery(text)
  if (!searchQuery) return null

  if (toothNumbers.length > 0) {
    return {
      type: 'diagnosis_tooth',
      toothNumber: toothNumbers[0],
      searchQuery,
    }
  }

  if (wantsDiagnosisIntent(text) && (wantsAdditionalDiagnosis(text) || wantsExplicitAdd(text))) {
    return {
      type: 'diagnosis_additional',
      searchQuery,
    }
  }

  if (wantsDiagnosisIntent(text) && !wantsBudget(text) && !wantsTreatmentPlan(text)) {
    return {
      type: 'diagnosis_additional',
      searchQuery,
    }
  }

  return null
}

function resolveTargetFaces(text: string, detected: ToothFace[]): ToothFace[] {
  if (/\b(todas las caras|todos los lados|5 caras|cinco caras|completo)\b/.test(text)) {
    return getAllToothFaces()
  }
  if (detected.length > 0) return detected
  return ['oclusal']
}

/**
 * Parser básico de comandos de voz clínicos (regex).
 * Ej: "Pieza 16 caries en oclusal", "diente 24 ausente", "agregar resina pieza 36 al presupuesto".
 */
export function parseClinicalVoiceCommand(raw: string): ClinicalVoiceCommand | null {
  const text = normalizeVoiceText(raw)
  if (!text) return null

  const diagnosisCommand = parseDiagnosisCommand(text)
  if (diagnosisCommand) return diagnosisCommand

  const toothNumbers = extractToothNumbers(text)
  const addToBudget = wantsBudget(text)
  const addToPlan = wantsTreatmentPlan(text) || wantsExplicitAdd(text)
  const procedure = detectProcedure(text)

  if (procedure && (addToBudget || addToPlan || wantsExplicitAdd(text))) {
    const toothNumber = toothNumbers[0]
    if (addToBudget) {
      return {
        type: 'budget_add',
        toothNumber,
        procedure: procedure.procedure,
        cupsCode: procedure.cupsCode,
      }
    }
    return {
      type: 'treatment_add',
      toothNumber,
      procedure: procedure.procedure,
      cupsCode: procedure.cupsCode,
      phase: procedure.phase,
    }
  }

  const globalState = detectGlobalState(text)
  if (globalState && globalState !== 'presente' && toothNumbers.length > 0) {
    return {
      type: 'odontogram_global',
      toothNumber: toothNumbers[0],
      globalState,
      addToPlan: addToPlan || globalState === 'ausente',
      addToBudget,
    }
  }

  const faceState = detectFaceState(text)
  if (faceState && toothNumbers.length > 0) {
    const faces = resolveTargetFaces(text, extractFaces(text))
    const shouldSuggestPlan =
      addToPlan || faceState === 'caries' || faceState === 'sellante'

    return {
      type: 'odontogram_faces',
      toothNumber: toothNumbers[0],
      faces: faceState === 'sano' && faces.length === 1 && faces[0] === 'oclusal'
        ? getAllToothFaces()
        : faces,
      faceState,
      addToPlan: shouldSuggestPlan,
      addToBudget,
    }
  }

  return null
}

export function describeClinicalVoiceCommand(command: ClinicalVoiceCommand): string {
  switch (command.type) {
    case 'odontogram_faces':
      return `Pieza ${command.toothNumber}: ${command.faceState} en ${command.faces.join(', ')}`
    case 'odontogram_global':
      return `Pieza ${command.toothNumber}: estado ${command.globalState}`
    case 'treatment_add':
      return `Plan: ${command.procedure}${command.toothNumber ? ` (pieza ${command.toothNumber})` : ''}`
    case 'budget_add':
      return `Presupuesto: ${command.procedure}${command.toothNumber ? ` (pieza ${command.toothNumber})` : ''}`
    case 'diagnosis_tooth':
      return `Diagnóstico pieza ${command.toothNumber}: ${command.searchQuery}`
    case 'diagnosis_additional':
      return `Diagnóstico adicional: ${command.searchQuery}`
    default:
      return 'Comando reconocido'
  }
}

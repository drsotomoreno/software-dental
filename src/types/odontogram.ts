/** Estados de superficie — convenciones internacionales FDI / ISO 3950 */
export type ToothFaceState =
  | 'sano'
  | 'caries'
  | 'obturado'
  | 'restauracion'
  | 'sellante'

/** Estado global del diente */
export type ToothGlobalState =
  | 'presente'
  | 'ausente'
  | 'exodoncia_indicada'
  | 'endodoncia'
  | 'corona'
  | 'implante'
  | 'protesis_fija'
  | 'protesis_removible'

export type OdontogramActiveToolId =
  | 'buen_estado'
  | 'diente_ausente'
  | 'exodoncia_indicada'
  | 'patologia'

export type DentitionType = 'permanente' | 'temporal' | 'mixta'

/** Alcance de edentulismo registrado en el odontograma */
export type EdentulismScope = 'total' | 'superior' | 'inferior'

export type ToothFace = 'vestibular' | 'mesial' | 'oclusal' | 'distal' | 'lingual'

export interface ToothFaceData {
  vestibular: ToothFaceState
  mesial: ToothFaceState
  oclusal: ToothFaceState
  distal: ToothFaceState
  lingual: ToothFaceState
}

/** Número FDI permanente (11-18, 21-28, 31-38, 41-48) */
export type ToothNumber =
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18
  | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28
  | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38
  | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48

/** Número FDI temporal (51-55, 61-65, 71-75, 81-85) */
export type DeciduousToothNumber =
  | 51 | 52 | 53 | 54 | 55
  | 61 | 62 | 63 | 64 | 65
  | 71 | 72 | 73 | 74 | 75
  | 81 | 82 | 83 | 84 | 85

export type AnyToothNumber = ToothNumber | DeciduousToothNumber

export interface ToothRecord {
  number: AnyToothNumber
  globalState: ToothGlobalState
  faces: ToothFaceData
}

/** Hallazgo general del odontograma — solo se marca si es positivo */
export interface OdontogramSupplementaryFinding {
  present: boolean
  description: string
}

export type OdontogramSupplementaryFindingKey =
  | 'dientesIncluidos'
  | 'dientesSupernumerarios'
  | 'agenesias'
  | 'defectosEsmalte'

export type OdontogramSupplementaryFindings = Record<
  OdontogramSupplementaryFindingKey,
  OdontogramSupplementaryFinding
>

export const ODONTOGRAM_SUPPLEMENTARY_LABELS: Record<OdontogramSupplementaryFindingKey, string> = {
  dientesIncluidos: 'Dientes incluidos',
  dientesSupernumerarios: 'Dientes supernumerarios',
  agenesias: 'Agenesias',
  defectosEsmalte: 'Defectos de esmalte',
}

export const ODONTOGRAM_SUPPLEMENTARY_CIE10: Record<
  OdontogramSupplementaryFindingKey,
  { code: string; description: string }
> = {
  dientesIncluidos: { code: 'K01.0', description: 'Dientes incluidos' },
  dientesSupernumerarios: { code: 'K00.1', description: 'Dientes supernumerarios' },
  agenesias: { code: 'K00.0', description: 'Anodoncia' },
  defectosEsmalte: { code: 'K00.4', description: 'Alteraciones en la formación de los dientes' },
}

export const ODONTOGRAM_SUPPLEMENTARY_KEYS = Object.keys(
  ODONTOGRAM_SUPPLEMENTARY_LABELS,
) as OdontogramSupplementaryFindingKey[]

export function createEmptySupplementaryFindings(): OdontogramSupplementaryFindings {
  return {
    dientesIncluidos: { present: false, description: '' },
    dientesSupernumerarios: { present: false, description: '' },
    agenesias: { present: false, description: '' },
    defectosEsmalte: { present: false, description: '' },
  }
}

export function normalizeSupplementaryFindings(
  data?: Partial<OdontogramSupplementaryFindings>,
): OdontogramSupplementaryFindings {
  const base = createEmptySupplementaryFindings()
  if (!data) return base
  return ODONTOGRAM_SUPPLEMENTARY_KEYS.reduce((acc, key) => {
    acc[key] = {
      present: data[key]?.present ?? false,
      description: data[key]?.description ?? '',
    }
    return acc
  }, base)
}

export interface OdontogramData {
  id?: number | string
  patientId: string
  dentitionType: DentitionType
  teeth: ToothRecord[]
  /** Hallazgos generales — solo positivos con descripción opcional */
  supplementaryFindings?: OdontogramSupplementaryFindings
  /** Edentulismo total o por arco — marca piezas como ausentes */
  edentulismScope?: EdentulismScope | null
  isInitialState: boolean
  updatedAt: string
}

export const EDENTULISM_SCOPE_LABELS: Record<EdentulismScope, string> = {
  total: 'Edentulismo total',
  superior: 'Edentulismo total superior',
  inferior: 'Edentulismo total inferior',
}

export const EDENTULISM_SCOPE_OPTIONS: EdentulismScope[] = ['total', 'superior', 'inferior']

export const TOOTH_FACE_LABELS: Record<ToothFace, string> = {
  vestibular: 'Vestibular (V)',
  mesial: 'Mesial (M)',
  oclusal: 'Oclusal (O)',
  distal: 'Distal (D)',
  lingual: 'Lingual (L)',
}

/** Abreviaturas internacionales por superficie */
export const TOOTH_FACE_ABBREV: Record<ToothFace, string> = {
  vestibular: 'V',
  mesial: 'M',
  oclusal: 'O',
  distal: 'D',
  lingual: 'L',
}

export const TOOTH_FACE_STATE_LABELS: Record<ToothFaceState, string> = {
  sano: 'Sin marcar',
  caries: 'Diente con patología o restauración defectuosa',
  obturado: 'Diente sano o restauración en buen estado',
  restauracion: 'Restauración previa (legacy)',
  sellante: 'Sellante / temporal (legacy)',
}

export const TOOTH_FACE_STATE_DESCRIPTIONS: Record<ToothFaceState, string> = {
  sano: 'Superficie sin marcar en el odontograma',
  caries: 'Patología activa o restauración defectuosa — ROJO',
  obturado: 'Diente sano o restauración en buen estado — AZUL',
  restauracion: 'Estado legacy — se migra a patología (rojo)',
  sellante: 'Estado legacy — se migra a buen estado (azul)',
}

export interface ToothFaceStateStyle {
  bg: string
  border: string
  text: string
}

export const TOOTH_FACE_STATE_STYLES: Record<ToothFaceState, ToothFaceStateStyle> = {
  sano: { bg: '#ffffff', border: '#94a3b8', text: '#64748b' },
  caries: { bg: '#ef4444', border: '#b91c1c', text: '#ffffff' },
  obturado: { bg: '#2563eb', border: '#1e3a8a', text: '#ffffff' },
  restauracion: { bg: '#1e293b', border: '#0f172a', text: '#ffffff' },
  sellante: { bg: '#22c55e', border: '#15803d', text: '#ffffff' },
}

/** Herramientas pintables en el odontograma */
export const PAINTABLE_FACE_STATES: ToothFaceState[] = ['obturado', 'caries']

export interface OdontogramActiveTool {
  id: OdontogramActiveToolId
  label: string
  description: string
  kind: 'face' | 'global'
  faceState?: ToothFaceState
  globalState?: ToothGlobalState
  style: ToothFaceStateStyle
  prefix?: string
}

export const ODONTOGRAM_ACTIVE_TOOLS: OdontogramActiveTool[] = [
  {
    id: 'buen_estado',
    label: 'Azul',
    description: 'Diente Sano o Restauración en Buen Estado',
    kind: 'face',
    faceState: 'obturado',
    style: { bg: '#2563eb', border: '#1e3a8a', text: '#ffffff' },
  },
  {
    id: 'diente_ausente',
    label: 'X Azul',
    description: 'Diente Ausente',
    kind: 'global',
    globalState: 'ausente',
    style: { bg: '#ffffff', border: '#1e3a8a', text: '#1e3a8a' },
    prefix: '✕ ',
  },
  {
    id: 'exodoncia_indicada',
    label: 'X Roja',
    description: 'Exodoncia Indicada',
    kind: 'global',
    globalState: 'exodoncia_indicada',
    style: { bg: '#ffffff', border: '#b91c1c', text: '#b91c1c' },
    prefix: '✕ ',
  },
  {
    id: 'patologia',
    label: 'Rojo',
    description: 'Diente con Patología o Restauración Defectuosa',
    kind: 'face',
    faceState: 'caries',
    style: { bg: '#ef4444', border: '#b91c1c', text: '#ffffff' },
  },
]

export function getOdontogramActiveTool(id: OdontogramActiveToolId): OdontogramActiveTool {
  return ODONTOGRAM_ACTIVE_TOOLS.find((tool) => tool.id === id) ?? ODONTOGRAM_ACTIVE_TOOLS[3]
}

export function getActiveFaceTool(id: OdontogramActiveToolId): ToothFaceState {
  const tool = getOdontogramActiveTool(id)
  return tool.kind === 'face' && tool.faceState ? tool.faceState : 'caries'
}

export function getActiveGlobalToolFromPalette(
  id: OdontogramActiveToolId,
): ToothGlobalState | null {
  const tool = getOdontogramActiveTool(id)
  return tool.kind === 'global' ? (tool.globalState ?? null) : null
}

export const TOOTH_GLOBAL_STATE_LABELS: Record<ToothGlobalState, string> = {
  presente: 'Presente',
  ausente: 'Diente ausente',
  exodoncia_indicada: 'Exodoncia indicada',
  endodoncia: 'Endodoncia / Trat. pulpar',
  corona: 'Corona',
  implante: 'Implante',
  protesis_fija: 'Prótesis fija',
  protesis_removible: 'Prótesis removible',
}

export const TOOTH_GLOBAL_STATES: ToothGlobalState[] = [
  'presente',
  'ausente',
  'exodoncia_indicada',
  'endodoncia',
  'corona',
  'implante',
  'protesis_fija',
  'protesis_removible',
]

/** Herramientas rápidas de estado global en el odontograma */
export const ODONTOGRAM_GLOBAL_TOOLS: ToothGlobalState[] = [
  'ausente',
  'endodoncia',
  'corona',
  'implante',
  'presente',
]

export function normalizeGlobalState(state: string | undefined | null): ToothGlobalState {
  if (state && TOOTH_GLOBAL_STATES.includes(state as ToothGlobalState)) {
    return state as ToothGlobalState
  }
  return 'presente'
}

export const ABSENT_TOOTH_DESCRIPTION =
  'Símbolo universal: equis (X) que cruza la estructura anatómica del diente. Indica ausencia por exodoncia previa, agenesia o pérdida por traumatismo.'

/** Incisivos y caninos usan superficie Incisal (I) en lugar de Oclusal (O) */
export function isAnteriorTooth(number: AnyToothNumber): boolean {
  const position = number % 10
  return position >= 1 && position <= 3
}

export function getFaceAbbrev(face: ToothFace, toothNumber: AnyToothNumber): string {
  if (face === 'oclusal') return isAnteriorTooth(toothNumber) ? 'I' : 'O'
  return TOOTH_FACE_ABBREV[face]
}

/** Migra estados legacy al cargar datos antiguos */
export function normalizeFaceState(state: string): ToothFaceState {
  if (state === 'restauracion') return 'caries'
  if (state === 'sellante') return 'obturado'
  if (state === 'sano' || state === 'caries' || state === 'obturado') {
    return state
  }
  return 'sano'
}

export function normalizeToothRecord(tooth: ToothRecord): ToothRecord {
  return {
    ...tooth,
    globalState: normalizeGlobalState(tooth.globalState),
    faces: {
      vestibular: normalizeFaceState(tooth.faces.vestibular as string),
      mesial: normalizeFaceState(tooth.faces.mesial as string),
      oclusal: normalizeFaceState(tooth.faces.oclusal as string),
      distal: normalizeFaceState(tooth.faces.distal as string),
      lingual: normalizeFaceState(tooth.faces.lingual as string),
    },
  }
}

function createAbsentFaces(): ToothFaceData {
  return {
    vestibular: 'sano',
    mesial: 'sano',
    oclusal: 'sano',
    distal: 'sano',
    lingual: 'sano',
  }
}

export function applyToothGlobalState(tooth: ToothRecord, globalState: ToothGlobalState): ToothRecord {
  if (globalState === 'ausente' || globalState === 'exodoncia_indicada') {
    return normalizeToothRecord({
      ...tooth,
      globalState,
      faces: createAbsentFaces(),
    })
  }
  return normalizeToothRecord({ ...tooth, globalState })
}

export function createDefaultTooth(number: AnyToothNumber): ToothRecord {
  return {
    number,
    globalState: 'presente',
    faces: {
      vestibular: 'sano',
      mesial: 'sano',
      oclusal: 'sano',
      distal: 'sano',
      lingual: 'sano',
    },
  }
}

export function createDefaultOdontogram(
  patientId: string,
  toothNumbers: AnyToothNumber[],
  dentitionType: DentitionType = 'permanente',
): OdontogramData {
  return {
    patientId,
    dentitionType,
    teeth: toothNumbers.map((n) => createDefaultTooth(n)),
    supplementaryFindings: createEmptySupplementaryFindings(),
    isInitialState: true,
    updatedAt: new Date().toISOString(),
  }
}

/** Asegura que el odontograma tenga todos los dientes según el tipo de dentición */
export function ensureOdontogramTeeth(data: OdontogramData): OdontogramData {
  const numbers = getTeethNumbersForDentition(data.dentitionType ?? 'permanente')
  const existingMap = new Map(data.teeth.map((t) => [t.number, normalizeToothRecord(t)]))
  return {
    ...data,
    teeth: numbers.map((n) => existingMap.get(n) ?? createDefaultTooth(n)),
    supplementaryFindings: normalizeSupplementaryFindings(data.supplementaryFindings),
  }
}

export function getTeethNumbersForDentition(type: DentitionType): AnyToothNumber[] {
  // Import arrays inline to avoid circular deps — re-exported via constants in component
  switch (type) {
    case 'temporal':
      return [55, 54, 53, 52, 51, 61, 62, 63, 64, 65, 75, 74, 73, 72, 71, 81, 82, 83, 84, 85]
    case 'mixta':
      return [
        18, 17, 16, 15, 14, 13, 12, 11,
        21, 22, 23, 24, 25, 26, 27, 28,
        38, 37, 36, 35, 34, 33, 32, 31,
        41, 42, 43, 44, 45, 46, 47, 48,
        55, 54, 53, 52, 51, 61, 62, 63, 64, 65,
        75, 74, 73, 72, 71, 81, 82, 83, 84, 85,
      ]
    default:
      return [
        18, 17, 16, 15, 14, 13, 12, 11,
        21, 22, 23, 24, 25, 26, 27, 28,
        38, 37, 36, 35, 34, 33, 32, 31,
        41, 42, 43, 44, 45, 46, 47, 48,
      ]
  }
}

/** Arco superior según tipo de dentición (cuadrantes FDI 1-2 y 5-6) */
export function getUpperTeethForDentition(type: DentitionType): AnyToothNumber[] {
  switch (type) {
    case 'temporal':
      return [55, 54, 53, 52, 51, 61, 62, 63, 64, 65]
    case 'mixta':
      return [
        18, 17, 16, 15, 14, 13, 12, 11,
        21, 22, 23, 24, 25, 26, 27, 28,
        55, 54, 53, 52, 51, 61, 62, 63, 64, 65,
      ]
    default:
      return [
        18, 17, 16, 15, 14, 13, 12, 11,
        21, 22, 23, 24, 25, 26, 27, 28,
      ]
  }
}

/** Arco inferior según tipo de dentición (cuadrantes FDI 3-4 y 7-8) */
export function getLowerTeethForDentition(type: DentitionType): AnyToothNumber[] {
  switch (type) {
    case 'temporal':
      return [75, 74, 73, 72, 71, 81, 82, 83, 84, 85]
    case 'mixta':
      return [
        38, 37, 36, 35, 34, 33, 32, 31,
        41, 42, 43, 44, 45, 46, 47, 48,
        75, 74, 73, 72, 71, 81, 82, 83, 84, 85,
      ]
    default:
      return [
        38, 37, 36, 35, 34, 33, 32, 31,
        41, 42, 43, 44, 45, 46, 47, 48,
      ]
  }
}

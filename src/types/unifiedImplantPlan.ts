import {
  DEFAULT_UNIFIED_IMPLANT_UNIT_PRICES,
  UNIFIED_ABUTMENT_TYPE_OPTIONS,
  UNIFIED_IMPLANT_MEASURE_OPTIONS,
  UNIFIED_RESTORATION_MATERIAL_OPTIONS,
  abutmentTypeLabel,
  implantMeasureLabel,
  restorationMaterialLabel,
} from '@/constants/unifiedImplantPlanning'
import { generateId } from '@/utils/crypto'

export type ArchEstado = 'dentado' | 'edentulo'
export type UnifiedTreatmentTipo = 'implante_unitario' | 'pontico'

export interface FaseQuirurgica {
  marcaManual: string
  medida: string
}

export interface FaseProtesica {
  tipoPilar: string
  marcaPilarManual: string
  material: string
}

/**
 * Entrada de planificación (pieza FDI o posición de reborde edéntulo).
 * Compatible con IndexedDB / Dexie y con facturación + historia clínica.
 */
export interface UnifiedImplantTreatment {
  id: string
  /** Pieza FDI (11–48). Ausente o null en posiciones de reborde edéntulo. */
  piezaFDI?: number | null
  /** Índice de slot sobre el reborde (0-based) cuando el arco está edéntulo. */
  posicionReborde?: number | null
  tipo: UnifiedTreatmentTipo
  faseQuirurgica: FaseQuirurgica
  faseProtesica: FaseProtesica
}

export interface UnifiedArchPlan {
  estado: ArchEstado
  rehabilitacionGlobal: string
  /** Posiciones sobre reborde cuando estado === 'edentulo' */
  implantes: UnifiedImplantTreatment[]
  /** Tratamientos por pieza cuando estado === 'dentado' */
  tratamientos: UnifiedImplantTreatment[]
}

export interface UnifiedImplantUnitPrices {
  implante: number
  pilar: number
  corona: number
}

/**
 * Schema maestro offline-first del planificador unificado de implantes.
 */
export interface UnifiedImplantPlan {
  maxilarSuperior: UnifiedArchPlan
  mandibula: UnifiedArchPlan
  preciosReferencia: UnifiedImplantUnitPrices
}

export type UnifiedArchKey = 'maxilarSuperior' | 'mandibula'

export type UnifiedSelectionTarget =
  | { arch: UnifiedArchKey; mode: 'tooth'; piezaFDI: number }
  | { arch: UnifiedArchKey; mode: 'ridge'; treatmentId: string }
  | null

const MEASURE_IDS = new Set(UNIFIED_IMPLANT_MEASURE_OPTIONS.map((item) => item.id))
const ABUTMENT_IDS = new Set(UNIFIED_ABUTMENT_TYPE_OPTIONS.map((item) => item.id))
const MATERIAL_IDS = new Set(UNIFIED_RESTORATION_MATERIAL_OPTIONS.map((item) => item.id))

export function createEmptyFaseQuirurgica(): FaseQuirurgica {
  return { marcaManual: '', medida: '' }
}

export function createEmptyFaseProtesica(): FaseProtesica {
  return { tipoPilar: '', marcaPilarManual: '', material: '' }
}

export function createEmptyUnifiedTreatment(
  patch: Partial<UnifiedImplantTreatment> = {},
): UnifiedImplantTreatment {
  return {
    id: patch.id ?? generateId(),
    piezaFDI: patch.piezaFDI ?? null,
    posicionReborde: patch.posicionReborde ?? null,
    tipo: patch.tipo ?? 'implante_unitario',
    faseQuirurgica: {
      ...createEmptyFaseQuirurgica(),
      ...patch.faseQuirurgica,
    },
    faseProtesica: {
      ...createEmptyFaseProtesica(),
      ...patch.faseProtesica,
    },
  }
}

export function createEmptyUnifiedArchPlan(estado: ArchEstado = 'dentado'): UnifiedArchPlan {
  return {
    estado,
    rehabilitacionGlobal: '',
    implantes: [],
    tratamientos: [],
  }
}

export function createEmptyUnifiedImplantPlan(): UnifiedImplantPlan {
  return {
    maxilarSuperior: createEmptyUnifiedArchPlan('dentado'),
    mandibula: createEmptyUnifiedArchPlan('dentado'),
    preciosReferencia: { ...DEFAULT_UNIFIED_IMPLANT_UNIT_PRICES },
  }
}

function normalizeNonNegative(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

function normalizeFaseQuirurgica(data?: Partial<FaseQuirurgica>): FaseQuirurgica {
  const medida =
    typeof data?.medida === 'string' && (MEASURE_IDS.has(data.medida) || data.medida === '')
      ? data.medida
      : typeof data?.medida === 'string'
        ? data.medida
        : ''
  return {
    marcaManual: typeof data?.marcaManual === 'string' ? data.marcaManual : '',
    medida,
  }
}

function normalizeFaseProtesica(data?: Partial<FaseProtesica>): FaseProtesica {
  const tipoPilar =
    typeof data?.tipoPilar === 'string' &&
    (ABUTMENT_IDS.has(data.tipoPilar as never) || data.tipoPilar === '')
      ? data.tipoPilar
      : typeof data?.tipoPilar === 'string'
        ? data.tipoPilar
        : ''
  const material =
    typeof data?.material === 'string' &&
    (MATERIAL_IDS.has(data.material as never) || data.material === '')
      ? data.material
      : typeof data?.material === 'string'
        ? data.material
        : ''
  return {
    tipoPilar,
    marcaPilarManual: typeof data?.marcaPilarManual === 'string' ? data.marcaPilarManual : '',
    material,
  }
}

function normalizeTreatment(data: Partial<UnifiedImplantTreatment>): UnifiedImplantTreatment | null {
  if (!data || typeof data !== 'object') return null
  const tipo: UnifiedTreatmentTipo =
    data.tipo === 'pontico' || data.tipo === 'implante_unitario' ? data.tipo : 'implante_unitario'

  const piezaFDI =
    typeof data.piezaFDI === 'number' && Number.isFinite(data.piezaFDI) ? data.piezaFDI : null
  const posicionReborde =
    typeof data.posicionReborde === 'number' && Number.isFinite(data.posicionReborde)
      ? data.posicionReborde
      : null

  return {
    id: typeof data.id === 'string' && data.id ? data.id : generateId(),
    piezaFDI,
    posicionReborde,
    tipo,
    faseQuirurgica: normalizeFaseQuirurgica(data.faseQuirurgica),
    faseProtesica: normalizeFaseProtesica(data.faseProtesica),
  }
}

function normalizeArchPlan(data?: Partial<UnifiedArchPlan>): UnifiedArchPlan {
  const empty = createEmptyUnifiedArchPlan()
  const estado: ArchEstado = data?.estado === 'edentulo' ? 'edentulo' : 'dentado'
  const implantes = Array.isArray(data?.implantes)
    ? data.implantes
        .map((item) => normalizeTreatment(item))
        .filter((item): item is UnifiedImplantTreatment => item !== null)
    : []
  const tratamientos = Array.isArray(data?.tratamientos)
    ? data.tratamientos
        .map((item) => normalizeTreatment(item))
        .filter((item): item is UnifiedImplantTreatment => item !== null)
    : []

  return {
    estado,
    rehabilitacionGlobal:
      typeof data?.rehabilitacionGlobal === 'string' ? data.rehabilitacionGlobal : empty.rehabilitacionGlobal,
    implantes,
    tratamientos,
  }
}

export function normalizeUnifiedImplantPlan(
  data?: Partial<UnifiedImplantPlan> | null,
): UnifiedImplantPlan {
  const empty = createEmptyUnifiedImplantPlan()
  if (!data || typeof data !== 'object') return empty

  return {
    maxilarSuperior: normalizeArchPlan(data.maxilarSuperior),
    mandibula: normalizeArchPlan(data.mandibula),
    preciosReferencia: {
      implante: normalizeNonNegative(
        data.preciosReferencia?.implante,
        empty.preciosReferencia.implante,
      ),
      pilar: normalizeNonNegative(data.preciosReferencia?.pilar, empty.preciosReferencia.pilar),
      corona: normalizeNonNegative(data.preciosReferencia?.corona, empty.preciosReferencia.corona),
    },
  }
}

export function getArchActiveTreatments(arch: UnifiedArchPlan): UnifiedImplantTreatment[] {
  return arch.estado === 'edentulo' ? arch.implantes : arch.tratamientos
}

export function listAllUnifiedTreatments(plan: UnifiedImplantPlan): Array<{
  arch: UnifiedArchKey
  archLabel: string
  treatment: UnifiedImplantTreatment
}> {
  const rows: Array<{
    arch: UnifiedArchKey
    archLabel: string
    treatment: UnifiedImplantTreatment
  }> = []

  for (const treatment of getArchActiveTreatments(plan.maxilarSuperior)) {
    rows.push({ arch: 'maxilarSuperior', archLabel: 'Maxilar superior', treatment })
  }
  for (const treatment of getArchActiveTreatments(plan.mandibula)) {
    rows.push({ arch: 'mandibula', archLabel: 'Mandíbula', treatment })
  }
  return rows
}

export interface UnifiedTreatmentLineCost {
  surgical: number
  prosthetic: number
  total: number
}

/** Implante: base + pilar + corona. Póntico: solo corona (ignora fase quirúrgica). */
export function calcUnifiedTreatmentCost(
  treatment: UnifiedImplantTreatment,
  prices: UnifiedImplantUnitPrices,
): UnifiedTreatmentLineCost {
  if (treatment.tipo === 'pontico') {
    const prosthetic = prices.corona
    return { surgical: 0, prosthetic, total: prosthetic }
  }

  const surgical = prices.implante
  const prosthetic = prices.pilar + prices.corona
  return { surgical, prosthetic, total: surgical + prosthetic }
}

export interface UnifiedFinancialSummary {
  implantCount: number
  ponticCount: number
  surgicalTotal: number
  prostheticTotal: number
  grandTotal: number
  lines: Array<{
    arch: UnifiedArchKey
    archLabel: string
    treatment: UnifiedImplantTreatment
    cost: UnifiedTreatmentLineCost
    label: string
  }>
}

export function treatmentPositionLabel(treatment: UnifiedImplantTreatment): string {
  if (treatment.piezaFDI != null) return `Pieza ${treatment.piezaFDI}`
  if (treatment.posicionReborde != null) {
    return `Reborde #${treatment.posicionReborde + 1}`
  }
  return 'Posición'
}

export function calcUnifiedFinancialSummary(plan: UnifiedImplantPlan): UnifiedFinancialSummary {
  const normalized = normalizeUnifiedImplantPlan(plan)
  const lines = listAllUnifiedTreatments(normalized).map(({ arch, archLabel, treatment }) => {
    const cost = calcUnifiedTreatmentCost(treatment, normalized.preciosReferencia)
    const tipoLabel = treatment.tipo === 'pontico' ? 'Póntico' : 'Implante'
    return {
      arch,
      archLabel,
      treatment,
      cost,
      label: `${archLabel} · ${treatmentPositionLabel(treatment)} · ${tipoLabel}`,
    }
  })

  return {
    implantCount: lines.filter((line) => line.treatment.tipo === 'implante_unitario').length,
    ponticCount: lines.filter((line) => line.treatment.tipo === 'pontico').length,
    surgicalTotal: lines.reduce((sum, line) => sum + line.cost.surgical, 0),
    prostheticTotal: lines.reduce((sum, line) => sum + line.cost.prosthetic, 0),
    grandTotal: lines.reduce((sum, line) => sum + line.cost.total, 0),
    lines,
  }
}

export function unifiedImplantPlanHasContent(plan: UnifiedImplantPlan | null | undefined): boolean {
  if (!plan) return false
  const normalized = normalizeUnifiedImplantPlan(plan)
  return (
    getArchActiveTreatments(normalized.maxilarSuperior).length > 0 ||
    getArchActiveTreatments(normalized.mandibula).length > 0 ||
    Boolean(normalized.maxilarSuperior.rehabilitacionGlobal.trim()) ||
    Boolean(normalized.mandibula.rehabilitacionGlobal.trim())
  )
}

export function formatUnifiedImplantPlanSummary(plan: UnifiedImplantPlan): string {
  const normalized = normalizeUnifiedImplantPlan(plan)
  const parts: string[] = []

  for (const [key, label] of [
    ['maxilarSuperior', 'Maxilar superior'],
    ['mandibula', 'Mandíbula'],
  ] as const) {
    const arch = normalized[key]
    const mode = arch.estado === 'edentulo' ? 'edéntulo' : 'dentado'
    const items = getArchActiveTreatments(arch)
    if (items.length === 0 && !arch.rehabilitacionGlobal.trim()) continue

    const itemLabels = items
      .map((item) => {
        const pos = treatmentPositionLabel(item)
        const tipo = item.tipo === 'pontico' ? 'póntico' : 'implante'
        const measure = item.faseQuirurgica.medida
          ? implantMeasureLabel(item.faseQuirurgica.medida)
          : ''
        const brand = item.faseQuirurgica.marcaManual.trim()
        const abutment = item.faseProtesica.tipoPilar
          ? abutmentTypeLabel(item.faseProtesica.tipoPilar)
          : ''
        const material = item.faseProtesica.material
          ? restorationMaterialLabel(item.faseProtesica.material)
          : ''
        return [pos, tipo, brand, measure, abutment, material].filter(Boolean).join(' · ')
      })
      .join('; ')

    const rehab = arch.rehabilitacionGlobal.trim()
      ? `Rehab: ${arch.rehabilitacionGlobal.trim()}`
      : ''
    parts.push(
      [`${label} (${mode})`, itemLabels, rehab].filter(Boolean).join(' — '),
    )
  }

  return parts.join(' · ')
}

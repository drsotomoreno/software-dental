import { FDI_QUADRANT_LABELS, type ImplantFdiQuadrant } from '@/constants/implantPlanning'
import {
  DENTAL_EXTRACTION_CUPS,
  OPERATIVE_RESTORATION_CUPS,
} from '@/constants/rips'
import { formatCupsCodeDotted, normalizeCupsCode } from '@/services/catalogService'

export type CupsAnatomicalScope = 'tooth' | 'quadrant' | 'arch' | 'optional'

export interface CupsLocationRule {
  scope: CupsAnatomicalScope
  /** Repetir el código N veces en RIPS (1 línea JSON por intervención / pieza) */
  sessionRepeat: boolean
  hint: string
}

export interface BillableLocationLine {
  procedure?: string
  cupsCode?: string
  quantity: number
  unitPrice: number
  toothNumber?: number
  fdiQuadrant?: ImplantFdiQuadrant
  arch?: 'superior' | 'inferior'
}

export interface CupsLocationValidationIssue {
  level: 'error' | 'warning'
  cupsCode?: string
  procedure?: string
  field?: string
  message: string
}

const ENDODONTICS_CUPS = new Set([
  ...Object.values({
    unirradicular: '997401',
    birradicular: '997402',
    multirradicular: '997403',
    retratamiento: '997404',
    t237301: '237301',
    t237302: '237302',
    t237303: '237303',
    t237304: '237304',
  }),
])

const LEGACY_EXTRACTION_CUPS = new Set(['997501', '997502', '997503'])

const IMPLANT_CUPS = new Set(['997701', '997702', '236101'])

const TOOTH_REQUIRED_CUPS = new Set<string>([
  ...Object.values(DENTAL_EXTRACTION_CUPS),
  ...LEGACY_EXTRACTION_CUPS,
  ...ENDODONTICS_CUPS,
  ...IMPLANT_CUPS,
])

/** Periodoncia / cirugía a colgajo — agrupar por cuadrante FDI (sectores 1–4) */
const QUADRANT_SCOPE_CUPS = new Set<string>([
  '240200',
  '240300',
  '242201',
  '242202',
  '997302',
  '997303',
])

const ARCH_SCOPE_CUPS = new Set<string>([])

const VALID_FDI_TEETH = new Set([
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
  51, 52, 53, 54, 55,
  61, 62, 63, 64, 65,
  71, 72, 73, 74, 75,
  81, 82, 83, 84, 85,
])

export function isValidFdiToothNumber(value: number | undefined): boolean {
  return typeof value === 'number' && VALID_FDI_TEETH.has(value)
}

export function getCupsLocationRule(cupsCode: string | undefined): CupsLocationRule {
  const code = normalizeCupsCode(cupsCode ?? '')
  if (!code) {
    return {
      scope: 'optional',
      sessionRepeat: false,
      hint: 'Indique pieza FDI, cuadrante o arcada según el procedimiento.',
    }
  }

  if (TOOTH_REQUIRED_CUPS.has(code)) {
    const label =
      ENDODONTICS_CUPS.has(code)
        ? 'endodoncia'
        : IMPLANT_CUPS.has(code)
          ? 'implante'
          : 'exodoncia'
    return {
      scope: 'tooth',
      sessionRepeat: true,
      hint:
        `Obligatorio: pieza dental FDI. En la misma sesión registre una línea por cada ${label} ` +
        '(el RIPS listará el código N veces, una por pieza).',
    }
  }

  if (QUADRANT_SCOPE_CUPS.has(code)) {
    return {
      scope: 'quadrant',
      sessionRepeat: false,
      hint:
        'Agrupe por cuadrante FDI (sectores 1–4): superior derecho, superior izquierdo, ' +
        'inferior izquierdo o inferior derecho.',
    }
  }

  if (ARCH_SCOPE_CUPS.has(code)) {
    return {
      scope: 'arch',
      sessionRepeat: false,
      hint: 'Indique arcada superior o inferior tratada.',
    }
  }

  if (code === OPERATIVE_RESTORATION_CUPS.resinaFotocurado) {
    return {
      scope: 'tooth',
      sessionRepeat: false,
      hint: 'Pieza FDI recomendada — cantidad 1 por diente (sin importar superficies).',
    }
  }

  return {
    scope: 'optional',
    sessionRepeat: false,
    hint: 'Pieza FDI opcional según criterio clínico.',
  }
}

export function requiresFdiTooth(cupsCode: string | undefined): boolean {
  return getCupsLocationRule(cupsCode).scope === 'tooth' && TOOTH_REQUIRED_CUPS.has(normalizeCupsCode(cupsCode ?? ''))
}

export function requiresFdiQuadrant(cupsCode: string | undefined): boolean {
  return getCupsLocationRule(cupsCode).scope === 'quadrant'
}

export function requiresSessionRepeatInRips(cupsCode: string | undefined): boolean {
  return getCupsLocationRule(cupsCode).sessionRepeat
}

export function validateProcedureLocation(
  item: BillableLocationLine,
): CupsLocationValidationIssue | null {
  if (!item.cupsCode?.trim()) return null

  const rule = getCupsLocationRule(item.cupsCode)
  const dotted = formatCupsCodeDotted(normalizeCupsCode(item.cupsCode))

  if (rule.scope === 'tooth' && TOOTH_REQUIRED_CUPS.has(normalizeCupsCode(item.cupsCode))) {
    if (!isValidFdiToothNumber(item.toothNumber)) {
      return {
        level: 'error',
        cupsCode: item.cupsCode,
        procedure: item.procedure,
        field: 'toothNumber',
        message:
          `${dotted}: la pieza dental FDI es obligatoria antes de firmar o exportar RIPS ` +
          '(exodoncia, endodoncia o implante).',
      }
    }
    if (item.quantity !== 1) {
      return {
        level: 'error',
        cupsCode: item.cupsCode,
        procedure: item.procedure,
        field: 'quantity',
        message:
          `${dotted}: use cantidad 1 por pieza. Para varias intervenciones en la misma sesión, ` +
          'agregue una línea por cada diente (el JSON RIPS repetirá el código N veces).',
      }
    }
  }

  if (rule.scope === 'quadrant' && !item.fdiQuadrant) {
    return {
      level: 'error',
      cupsCode: item.cupsCode,
      procedure: item.procedure,
      field: 'fdiQuadrant',
      message:
        `${dotted}: seleccione el cuadrante FDI (sector 1–4) antes de firmar o exportar RIPS.`,
    }
  }

  if (rule.scope === 'arch' && !item.arch) {
    return {
      level: 'error',
      cupsCode: item.cupsCode,
      procedure: item.procedure,
      field: 'arch',
      message: `${dotted}: indique arcada superior o inferior.`,
    }
  }

  return null
}

export function validateProcedureLocations(
  items: BillableLocationLine[],
): CupsLocationValidationIssue[] {
  const issues: CupsLocationValidationIssue[] = []

  for (const item of items) {
    const issue = validateProcedureLocation(item)
    if (issue) issues.push(issue)
  }

  const repeatGroups = new Map<string, BillableLocationLine[]>()
  for (const item of items) {
    if (!item.cupsCode || !requiresSessionRepeatInRips(item.cupsCode)) continue
    const key = normalizeCupsCode(item.cupsCode)
    const group = repeatGroups.get(key) ?? []
    group.push(item)
    repeatGroups.set(key, group)
  }

  for (const [code, group] of repeatGroups) {
    const teeth = group.map((item) => item.toothNumber).filter((n): n is number => isValidFdiToothNumber(n))
    const unique = new Set(teeth)
    if (unique.size !== teeth.length) {
      issues.push({
        level: 'error',
        cupsCode: code,
        field: 'toothNumber',
        message:
          `${formatCupsCodeDotted(code)}: no repita la misma pieza FDI en líneas distintas ` +
          'de la misma sesión; consolide o verifique duplicados.',
      })
    }
  }

  return issues
}

export interface ExpandedRipsBillableLine extends BillableLocationLine {
  ripsSequence: number
}

/** Expande líneas para RIPS: procedimientos por pieza se listan N veces (cantidad 1 c/u). */
export function expandBillableLinesForRips(
  items: BillableLocationLine[],
): ExpandedRipsBillableLine[] {
  const expanded: ExpandedRipsBillableLine[] = []
  let sequence = 0

  for (const item of items) {
    if (!item.cupsCode?.trim()) continue

    if (requiresSessionRepeatInRips(item.cupsCode)) {
      const copies = Math.max(1, Math.floor(item.quantity))
      for (let index = 0; index < copies; index++) {
        sequence += 1
        expanded.push({
          ...item,
          quantity: 1,
          ripsSequence: sequence,
        })
      }
      continue
    }

    sequence += 1
    expanded.push({
      ...item,
      ripsSequence: sequence,
    })
  }

  return expanded
}

export function formatFdiQuadrantLabel(quadrant: ImplantFdiQuadrant | undefined): string {
  if (!quadrant) return '—'
  return FDI_QUADRANT_LABELS[quadrant]
}

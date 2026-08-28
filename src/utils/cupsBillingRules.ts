import {
  OPERATIVE_RESTORATION_CUPS,
  PROSTHETIC_RESTORATION_CUPS,
} from '@/constants/rips'
import { formatCupsCodeDotted, normalizeCupsCode } from '@/services/catalogService'
import { formatCurrency } from './crypto'
import { requiresSessionRepeatInRips } from './cupsLocationRules'

/** Modo de cálculo de cantidad según reglas de negocio RIPS / facturación odontológica */
export type CupsQuantityBillingMode =
  /** Una línea = una pieza dental; cantidad fija en 1 (sin importar superficies) */
  | 'one_per_tooth'
  /** Cantidad = unidades del puente (pilares + pónticos); valor unitario × N */
  | 'bridge_units'
  /** Una línea = una arcada (superior o inferior); cantidad típicamente 1 */
  | 'one_per_arch'
  /** Sin regla especial de multiplicador */
  | 'standard'

export interface CupsQuantityBillingRule {
  mode: CupsQuantityBillingMode
  /** Texto orientativo para UI y auditoría */
  hint: string
}

export interface CupsQuantityValidation {
  valid: boolean
  level: 'error' | 'warning'
  message?: string
  normalizedQuantity: number
  rule: CupsQuantityBillingRule
}

const ONE_PER_TOOTH_CUPS = new Set<string>([
  OPERATIVE_RESTORATION_CUPS.amalgama,
  OPERATIVE_RESTORATION_CUPS.resinaFotocurado,
  OPERATIVE_RESTORATION_CUPS.ionomeroVidrio,
  OPERATIVE_RESTORATION_CUPS.sod,
  OPERATIVE_RESTORATION_CUPS.temporal,
  OPERATIVE_RESTORATION_CUPS.pinMilimetrico,
  OPERATIVE_RESTORATION_CUPS.reconstruccionAnguloIncisal,
  OPERATIVE_RESTORATION_CUPS.reconstruccionTercioIncisal,
  OPERATIVE_RESTORATION_CUPS.reconstruccionSod,
  OPERATIVE_RESTORATION_CUPS.incrustacionMetalica,
  OPERATIVE_RESTORATION_CUPS.incrustacionNoMetalica,
  PROSTHETIC_RESTORATION_CUPS.coronaIndividualSod,
  PROSTHETIC_RESTORATION_CUPS.coronaAcrilicaProvisional,
  PROSTHETIC_RESTORATION_CUPS.reconstruccionMunones,
  PROSTHETIC_RESTORATION_CUPS.pernoPatronNucleo,
  PROSTHETIC_RESTORATION_CUPS.retenedorIntraradicular,
])

const BRIDGE_UNIT_CUPS = new Set<string>([PROSTHETIC_RESTORATION_CUPS.protesisFijaUnidad])

/** CUPS referencia — reglas de negocio RIPS / facturación */
export const CUPS_RESINA_FOTOCURADO = OPERATIVE_RESTORATION_CUPS.resinaFotocurado
export const CUPS_PROTESIS_FIJA_UNIDAD = PROSTHETIC_RESTORATION_CUPS.protesisFijaUnidad

const ONE_PER_ARCH_CUPS = new Set<string>([
  PROSTHETIC_RESTORATION_CUPS.protesisRemovibleMucosoportada,
  PROSTHETIC_RESTORATION_CUPS.protesisRemovibleDentomucosoportada,
  PROSTHETIC_RESTORATION_CUPS.protesisTotalMedioCaso,
  PROSTHETIC_RESTORATION_CUPS.protesisTotalCasoCompleto,
  PROSTHETIC_RESTORATION_CUPS.protesisTotalImplantoasistidaMedioCaso,
  PROSTHETIC_RESTORATION_CUPS.protesisTotalImplantoasistidaCasoCompleto,
])

const QUANTITY_RULE_HINTS: Record<CupsQuantityBillingMode, string> = {
  one_per_tooth:
    'Registre cantidad 1 por pieza dental. El número de superficies no altera la cantidad ni el valor unitario.',
  bridge_units:
    'Multiplique cantidad y valor por el número de unidades del puente fijo (pilares + pónticos). Ej.: puente de 3 unidades = cantidad 3.',
  one_per_arch:
    'Cantidad 1 por arcada tratada (superior o inferior), salvo que el contrato indique otro criterio.',
  standard: 'Verifique cantidad y valor unitario antes de radicar en RIPS.',
}

export function getCupsQuantityBillingRule(cupsCode: string | undefined): CupsQuantityBillingRule {
  const code = normalizeCupsCode(cupsCode ?? '')

  if (!code) {
    return { mode: 'standard', hint: QUANTITY_RULE_HINTS.standard }
  }
  if (ONE_PER_TOOTH_CUPS.has(code)) {
    return { mode: 'one_per_tooth', hint: QUANTITY_RULE_HINTS.one_per_tooth }
  }
  if (BRIDGE_UNIT_CUPS.has(code)) {
    return { mode: 'bridge_units', hint: QUANTITY_RULE_HINTS.bridge_units }
  }
  if (ONE_PER_ARCH_CUPS.has(code)) {
    return { mode: 'one_per_arch', hint: QUANTITY_RULE_HINTS.one_per_arch }
  }

  return { mode: 'standard', hint: QUANTITY_RULE_HINTS.standard }
}

export function isCupsQuantityLocked(cupsCode: string | undefined): boolean {
  const rule = getCupsQuantityBillingRule(cupsCode)
  return rule.mode === 'one_per_tooth' || requiresSessionRepeatInRips(cupsCode)
}

export function isBridgeUnitBilling(cupsCode: string | undefined): boolean {
  return getCupsQuantityBillingRule(cupsCode).mode === 'bridge_units'
}

export function getQuantityFieldLabel(cupsCode: string | undefined): string {
  const mode = getCupsQuantityBillingRule(cupsCode).mode
  if (mode === 'bridge_units') return 'Unidades (pilares + pónticos)'
  if (mode === 'one_per_tooth') return 'Cant. (1 por pieza)'
  if (mode === 'one_per_arch') return 'Cant. (por arcada)'
  return 'Cant.'
}

/** Total facturable de la línea: valor unitario × cantidad normalizada según CUPS */
export function calcBillableLineTotal(
  unitPrice: number,
  quantity: number,
  cupsCode?: string,
): number {
  const normalizedQuantity = normalizeQuantityForCups(cupsCode, quantity)
  return Math.max(0, unitPrice) * normalizedQuantity
}

export function formatBillableLineSummary(
  unitPrice: number,
  quantity: number,
  cupsCode?: string,
): string {
  const normalizedQuantity = normalizeQuantityForCups(cupsCode, quantity)
  const total = calcBillableLineTotal(unitPrice, quantity, cupsCode)
  if (isBridgeUnitBilling(cupsCode)) {
    return `${formatCurrency(unitPrice)} × ${normalizedQuantity} unidad(es) = ${formatCurrency(total)}`
  }
  return formatCurrency(total)
}

export function getDefaultQuantityForCups(cupsCode: string | undefined): number {
  const rule = getCupsQuantityBillingRule(cupsCode)
  if (rule.mode === 'one_per_tooth' || rule.mode === 'one_per_arch') return 1
  return 1
}

export function normalizeQuantityForCups(
  cupsCode: string | undefined,
  quantity: number,
): number {
  const parsed = Number.isFinite(quantity) ? Math.floor(quantity) : 1
  const safe = Math.max(1, parsed)
  const rule = getCupsQuantityBillingRule(cupsCode)

  if (rule.mode === 'one_per_tooth') return 1
  if (requiresSessionRepeatInRips(cupsCode)) return 1
  if (rule.mode === 'one_per_arch') return Math.min(safe, 1)
  return safe
}

export function validateCupsQuantityForBilling(
  cupsCode: string | undefined,
  quantity: number,
): CupsQuantityValidation {
  const rule = getCupsQuantityBillingRule(cupsCode)
  const normalizedQuantity = normalizeQuantityForCups(cupsCode, quantity)
  const dotted = formatCupsCodeDotted(normalizeCupsCode(cupsCode ?? ''))

  if (!cupsCode?.trim()) {
    return { valid: true, level: 'warning', normalizedQuantity, rule }
  }

  if (rule.mode === 'one_per_tooth' && quantity !== 1) {
    return {
      valid: false,
      level: 'error',
      normalizedQuantity,
      rule,
      message:
        `${dotted}: la cantidad debe ser 1 por pieza dental. ` +
        'Las restauraciones directas (p. ej. 23.2.1.02) no se multiplican por superficies.',
    }
  }

  if (requiresSessionRepeatInRips(cupsCode) && quantity !== 1) {
    return {
      valid: false,
      level: 'error',
      normalizedQuantity: 1,
      rule,
      message:
        `${dotted}: use cantidad 1 por intervención. ` +
        'Para varias piezas en la misma sesión, agregue una línea por diente; el RIPS repetirá el código N veces.',
    }
  }

  if (rule.mode === 'bridge_units' && quantity < 2) {
    return {
      valid: false,
      level: 'warning',
      normalizedQuantity,
      rule,
      message:
        `${dotted}: un puente fijo suele reportarse con cantidad ≥ 2 (pilares + pónticos). ` +
        'Confirme el número de unidades antes de radicar.',
    }
  }

  if (rule.mode === 'one_per_arch' && quantity > 1) {
    return {
      valid: false,
      level: 'warning',
      normalizedQuantity: 1,
      rule,
      message:
        `${dotted}: este procedimiento se factura por arcada. ` +
        'Revise si la cantidad debe ser 1 (superior o inferior).',
    }
  }

  return { valid: true, level: 'warning', normalizedQuantity, rule }
}

export interface BillableProcedureLine {
  procedure?: string
  cupsCode?: string
  quantity: number
  toothNumber?: number
}

export interface CupsBillingValidationIssue {
  level: 'error' | 'warning'
  cupsCode?: string
  procedure?: string
  message: string
}

/** Valida cantidades de procedimientos del presupuesto / plan antes de exportar RIPS */
export function validateProcedureBillingQuantities(
  items: BillableProcedureLine[],
): CupsBillingValidationIssue[] {
  const issues: CupsBillingValidationIssue[] = []

  for (const item of items) {
    if (!item.cupsCode?.trim()) continue

    const validation = validateCupsQuantityForBilling(item.cupsCode, item.quantity)
    if (!validation.valid && validation.message) {
      issues.push({
        level: validation.level,
        cupsCode: item.cupsCode,
        procedure: item.procedure,
        message: validation.message,
      })
    }

    const rule = validation.rule
    if (rule.mode === 'one_per_tooth' && !item.toothNumber) {
      issues.push({
        level: 'warning',
        cupsCode: item.cupsCode,
        procedure: item.procedure,
        message:
          `${formatCupsCodeDotted(normalizeCupsCode(item.cupsCode))}: indique la pieza FDI para cada línea con cantidad 1.`,
      })
    }

    if (rule.mode === 'bridge_units' && item.quantity >= 2 && !item.toothNumber) {
      issues.push({
        level: 'warning',
        cupsCode: item.cupsCode,
        procedure: item.procedure,
        message:
          `${formatCupsCodeDotted(normalizeCupsCode(item.cupsCode))}: documente en notas o piezas las unidades del puente (${item.quantity} unidades).`,
      })
    }
  }

  return issues
}

import type { RipsExportMetadata, RipsTransaction, RipsValidationIssue } from '@/types/rips'
import {
  RIPS_COD_PRESTADOR_PATTERN,
  RIPS_DATETIME_PATTERN,
  RIPS_FEV_NUMERO_PATTERN,
  validateRipsAttentionDateTime,
  validateRipsCodPrestador,
  validateRipsFevNumero,
  validateRipsIdentificationDocument,
  validateRipsStructureSyntax,
} from '../../shared/ripsStructureValidation.js'

export {
  RIPS_COD_PRESTADOR_PATTERN,
  RIPS_DATETIME_PATTERN,
  RIPS_FEV_NUMERO_PATTERN,
  validateRipsAttentionDateTime,
  validateRipsCodPrestador,
  validateRipsFevNumero,
  validateRipsIdentificationDocument,
  validateRipsStructureSyntax,
} from '../../shared/ripsStructureValidation.js'

export {
  RIPS_IDENTIFICATION_TYPES,
  RIPS_IDENTIFICATION_TYPE_RULES,
  isRipsIdentificationType,
} from '@/constants/ripsIdentificationTypes'

export interface RipsStructureValidationContext {
  /** Fecha/hora de generación del paquete RIPS (límite superior de atención). */
  fechaGeneracion?: Date | string
  /** Inicio de vigencia del convenio (límite inferior de fecConsumo / fechaInicio). */
  convenioFechaInicio?: Date | string
  /** Número FEV de referencia para validación 1:1 con numFactura. */
  fevReferencia?: string
  /** Código REPS desde metadata de exportación. */
  codPrestador?: string
}

/**
 * Valida estructura y sintaxis del JSON RIPS según reglas MUV (JSON Schema).
 * Complementa las reglas de negocio clínico en `validateRipsExport`.
 */
export function validateRipsJsonStructure(
  rips: RipsTransaction,
  context: RipsStructureValidationContext = {},
): RipsValidationIssue[] {
  return validateRipsStructureSyntax(rips, context) as RipsValidationIssue[]
}

export function validateRipsMetadataStructure(
  metadata: RipsExportMetadata,
  context: Omit<RipsStructureValidationContext, 'codPrestador' | 'fevReferencia'> = {},
): RipsValidationIssue[] {
  const issues: RipsValidationIssue[] = []

  const facturaCheck = validateRipsFevNumero(metadata.numFactura, { label: 'numFactura' })
  if (!facturaCheck.valid) {
    issues.push({ level: 'error', field: 'numFactura', message: facturaCheck.message! })
  }

  if (metadata.tipoNota) {
    const notaCheck = validateRipsFevNumero(metadata.numNota, { label: 'numNota' })
    if (!notaCheck.valid) {
      issues.push({ level: 'error', field: 'numNota', message: notaCheck.message! })
    }
  }

  const prestadorCheck = validateRipsCodPrestador(metadata.codPrestador)
  if (!prestadorCheck.valid) {
    issues.push({ level: 'error', field: 'codPrestador', message: prestadorCheck.message! })
  }

  if (metadata.convenioFechaInicio && !/^\d{4}-\d{2}-\d{2}$/.test(metadata.convenioFechaInicio)) {
    issues.push({
      level: 'error',
      field: 'convenioFechaInicio',
      message: 'Fecha de inicio de vigencia del convenio inválida (use YYYY-MM-DD).',
    })
  }

  return issues
}

export function buildStructureValidationContext(
  metadata: RipsExportMetadata,
  options: { fechaGeneracion?: Date } = {},
): RipsStructureValidationContext {
  return {
    fechaGeneracion: options.fechaGeneracion ?? new Date(),
    convenioFechaInicio: metadata.convenioFechaInicio,
    fevReferencia: metadata.fevReferencia ?? metadata.numFactura,
    codPrestador: metadata.codPrestador,
  }
}

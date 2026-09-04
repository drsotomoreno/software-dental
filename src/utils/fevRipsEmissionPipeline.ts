import type { ElectronicInvoice, InvoiceItem, InvoiceValidationIssue } from '@/types/invoice'
import type { UserProfile } from '@/types/user'
import {
  resolveProfessionalSpecialty,
  resolveSedeEnabledSpecialties,
  validateCupsAgainstRepsPortfolio,
  validateCupsAgainstRethusSpecialty,
} from '@/constants/repsServicePortfolio'
import { validateActiveRepsSede } from '@/utils/repsCode'
import { validateProfessionalDocumentNumber } from '@/utils/professionalDocument'
import { normalizeCupsCode } from '@/services/catalogService'

export type FevRipsPipelineStep = 1 | 2 | 3 | 4

export interface FevRipsPipelineIssue extends InvoiceValidationIssue {
  step: FevRipsPipelineStep
}

const CUPS_PATTERN = /^\d{6}$/

function toIssue(
  step: FevRipsPipelineStep,
  issue: Omit<InvoiceValidationIssue, 'level'> & { level?: InvoiceValidationIssue['level'] },
): FevRipsPipelineIssue {
  return { level: issue.level ?? 'error', ...issue, step }
}

/**
 * Paso 1 — Sede REPS activa (código de habilitación).
 */
export function validateRepsSedeStep(professional: UserProfile): FevRipsPipelineIssue[] {
  const result = validateActiveRepsSede(professional.repsCode, professional.repsStatus)
  if (result.valid) return []
  return [
    toIssue(1, {
      field: 'healthSector.codPrestadorReps',
      message: result.message ?? 'Código REPS de la sede inválido o inactivo.',
    }),
  ]
}

/**
 * Paso 2 — Profesional RETHUS activo + especialidad vs procedimiento.
 */
export function validateRethusProfessionalStep(
  professional: UserProfile,
  cupsCodes: Array<string | null | undefined> = [],
): FevRipsPipelineIssue[] {
  const issues: FevRipsPipelineIssue[] = []
  const document = validateProfessionalDocumentNumber(professional.documentNumber)
  if (!document.valid) {
    issues.push(
      toIssue(2, {
        field: 'professional.documentNumber',
        message:
          document.message ??
          'El número de documento (cédula / ReTHUS) del profesional tratante es obligatorio.',
      }),
    )
  }

  const specialty = resolveProfessionalSpecialty(professional)
  const enabled = resolveSedeEnabledSpecialties(professional)

  for (const code of cupsCodes) {
    if (!code?.trim()) continue
    const cups = normalizeCupsCode(code)
    if (!CUPS_PATTERN.test(cups)) continue

    const professionalCheck = validateCupsAgainstRethusSpecialty(cups, specialty)
    if (!professionalCheck.allowed) {
      issues.push(
        toIssue(2, {
          field: 'cupsCode',
          message: professionalCheck.message ?? 'La especialidad RETHUS no cubre este procedimiento.',
        }),
      )
    }

    const sedeCheck = validateCupsAgainstRepsPortfolio(cups, enabled)
    if (!sedeCheck.allowed) {
      issues.push(
        toIssue(2, {
          field: 'repsEnabledSpecialties',
          message: sedeCheck.message ?? 'La sede REPS no tiene habilitado este servicio.',
        }),
      )
    }
  }

  return issues
}

/**
 * Paso 3 — Cada ítem reportable RIPS debe tener CUPS de 6 dígitos.
 */
export function validateCupsAssociationStep(items: InvoiceItem[]): FevRipsPipelineIssue[] {
  const issues: FevRipsPipelineIssue[] = []
  for (const item of items) {
    if (item.isCustomProcedure) continue
    const cups = normalizeCupsCode(item.cupsCode ?? '')
    if (CUPS_PATTERN.test(cups)) continue
    issues.push(
      toIssue(3, {
        field: 'cupsCode',
        itemId: item.id,
        message: `Línea ${item.lineNumber}: el acto clínico debe estar amarrado a un código CUPS válido de 6 dígitos para RIPS.`,
      }),
    )
  }
  return issues
}

/**
 * Paso 4 — El CUV MinSalud debe estar enlazado antes de entregar la FEV al paciente.
 */
export function validateCuvLinkageStep(
  invoice: Pick<ElectronicInvoice, 'cuv'>,
  requireCuv: boolean,
): FevRipsPipelineIssue[] {
  if (!requireCuv) return []
  if (invoice.cuv?.trim()) return []
  return [
    toIssue(4, {
      field: 'cuv',
      message:
        'El CUV del Ministerio de Salud debe enlazarse a la factura electrónica antes de entregarla al paciente. Radique RIPS en MUV y espere el CUV.',
    }),
  ]
}

export function collectInvoiceCupsCodes(items: InvoiceItem[]): string[] {
  return items
    .map((item) => normalizeCupsCode(item.cupsCode ?? ''))
    .filter((code) => CUPS_PATTERN.test(code))
}

/**
 * Orden obligatorio al facturar: REPS → RETHUS → CUPS → CUV (si FEV-Salud).
 */
export function validateFevRipsEmissionPipeline(
  professional: UserProfile,
  invoice: ElectronicInvoice,
  options: { requireCuv?: boolean } = {},
): FevRipsPipelineIssue[] {
  const cupsCodes = collectInvoiceCupsCodes(invoice.items)
  return [
    ...validateRepsSedeStep(professional),
    ...validateRethusProfessionalStep(professional, cupsCodes),
    ...validateCupsAssociationStep(invoice.items),
    ...validateCuvLinkageStep(invoice, Boolean(options.requireCuv)),
  ]
}

export function isInvoiceDeliverableToClient(
  invoice: Pick<ElectronicInvoice, 'cuv' | 'status'>,
  isElectronicFev: boolean,
): boolean {
  if (!isElectronicFev) return true
  return Boolean(invoice.cuv?.trim())
}

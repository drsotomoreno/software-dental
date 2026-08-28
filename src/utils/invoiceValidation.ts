import type { ElectronicInvoice, InvoiceItem, InvoiceValidationIssue } from '@/types/invoice'
import type { UserProfile } from '@/types/user'
import { RIPS_FEV_NUMERO_PATTERN } from '@/utils/ripsStructureValidation'
import { isInvoiceItemRipsEligible } from '@/utils/buildRipsJson'

const CUPS_PATTERN = /^\d{6}$/
const REPS_PATTERN = /^\d{12}$/

export function validateInvoiceItem(item: InvoiceItem): InvoiceValidationIssue[] {
  const issues: InvoiceValidationIssue[] = []

  if (!item.description?.trim()) {
    issues.push({
      level: 'error',
      field: 'description',
      itemId: item.id,
      message: `Línea ${item.lineNumber}: la descripción es obligatoria.`,
    })
  }

  if (item.quantity <= 0) {
    issues.push({
      level: 'error',
      field: 'quantity',
      itemId: item.id,
      message: `Línea ${item.lineNumber}: la cantidad debe ser mayor a cero.`,
    })
  }

  if (item.unitPrice < 0) {
    issues.push({
      level: 'error',
      field: 'unitPrice',
      itemId: item.id,
      message: `Línea ${item.lineNumber}: el valor unitario no puede ser negativo.`,
    })
  }

  if (!isInvoiceItemRipsEligible(item)) {
    if (item.cupsCode?.trim() && !CUPS_PATTERN.test(item.cupsCode.replace(/\D/g, '').slice(-6))) {
      issues.push({
        level: 'warning',
        field: 'cupsCode',
        itemId: item.id,
        message: `Línea ${item.lineNumber}: CUPS inválido — se facturará en DIAN pero no en RIPS.`,
      })
    }
    return issues
  }

  const cups = item.cupsCode!.replace(/\D/g, '').padStart(6, '0').slice(-6)
  if (!CUPS_PATTERN.test(cups)) {
    issues.push({
      level: 'error',
      field: 'cupsCode',
      itemId: item.id,
      message: `Línea ${item.lineNumber}: el código CUPS debe tener 6 dígitos.`,
    })
  }

  if (!item.cie10Code?.trim()) {
    issues.push({
      level: 'warning',
      field: 'cie10Code',
      itemId: item.id,
      message: `Línea ${item.lineNumber}: se recomienda asociar diagnóstico CIE-10 para RIPS.`,
    })
  }

  return issues
}

export function validateInvoiceForSubmission(
  invoice: ElectronicInvoice,
  professional?: UserProfile | null,
): InvoiceValidationIssue[] {
  const issues: InvoiceValidationIssue[] = []

  if (!invoice.invoiceNumber?.trim()) {
    issues.push({ level: 'error', field: 'invoiceNumber', message: 'El número de factura FEV es obligatorio.' })
  } else if (!RIPS_FEV_NUMERO_PATTERN.test(invoice.invoiceNumber.trim())) {
    issues.push({
      level: 'error',
      field: 'invoiceNumber',
      message: 'El número de factura no cumple el formato alfanumérico exigido (1–30 caracteres).',
    })
  }

  if (!invoice.issuerNit?.trim()) {
    issues.push({ level: 'error', field: 'issuerNit', message: 'El NIT del emisor es obligatorio.' })
  }

  if (!invoice.issuerBusinessName?.trim()) {
    issues.push({ level: 'error', field: 'issuerBusinessName', message: 'La razón social del emisor es obligatoria.' })
  }

  const reps = invoice.healthSector.codPrestadorReps?.replace(/\D/g, '') ?? ''
  if (!reps) {
    issues.push({
      level: 'error',
      field: 'healthSector.codPrestadorReps',
      message: 'El código REPS del prestador es obligatorio para FEV-Salud.',
    })
  } else if (!REPS_PATTERN.test(reps.padStart(12, '0').slice(-12))) {
    issues.push({
      level: 'error',
      field: 'healthSector.codPrestadorReps',
      message: 'El código REPS debe tener 12 dígitos.',
    })
  }

  if (!invoice.healthSector.tipoUsuario?.trim()) {
    issues.push({
      level: 'error',
      field: 'healthSector.tipoUsuario',
      message: 'El tipo de usuario (afiliación) es obligatorio.',
    })
  }

  if (!invoice.buyerDocumentNumber?.trim() || !invoice.buyerName?.trim()) {
    issues.push({
      level: 'error',
      field: 'buyerDocumentNumber',
      message: 'Los datos del adquiriente (paciente) son obligatorios.',
    })
  }

  if (!invoice.items.length) {
    issues.push({ level: 'error', field: 'items', message: 'La factura debe tener al menos un concepto.' })
  }

  for (const item of invoice.items) {
    issues.push(...validateInvoiceItem(item))
  }

  const ripsEligibleCount = invoice.items.filter(isInvoiceItemRipsEligible).length
  if (ripsEligibleCount === 0) {
    issues.push({
      level: 'warning',
      field: 'items',
      message:
        'Ninguna línea es reportable en RIPS. Solo se podrá emitir FEV DIAN (bienes/servicios generales).',
    })
  }

  if (invoice.netPayable < 0) {
    issues.push({
      level: 'error',
      field: 'netPayable',
      message: 'El neto a pagar no puede ser negativo. Revise descuentos y copagos.',
    })
  }

  if (professional && !professional.repsCode?.trim() && !professional.providerNit?.trim()) {
    issues.push({
      level: 'warning',
      field: 'professional',
      message: 'Complete REPS y NIT del prestador en el perfil profesional.',
    })
  }

  for (const item of invoice.items) {
    if (!item.attentionDate) continue
    const attention = new Date(item.attentionDate)
    const issue = new Date(invoice.issueDate)
    if (!Number.isNaN(attention.getTime()) && !Number.isNaN(issue.getTime()) && attention > issue) {
      issues.push({
        level: 'error',
        field: 'attentionDate',
        itemId: item.id,
        message: `Línea ${item.lineNumber}: la fecha de atención no puede ser posterior a la fecha de factura.`,
      })
    }
  }

  return issues
}

export function hasBlockingInvoiceIssues(issues: InvoiceValidationIssue[]): boolean {
  return issues.some((issue) => issue.level === 'error')
}

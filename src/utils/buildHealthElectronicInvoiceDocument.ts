import type { ElectronicInvoice } from '@/types/invoice'
import type {
  DianBillingResolution,
  HealthElectronicInvoiceDocument,
} from '@/types/healthElectronicInvoice'
import type { Patient } from '@/types/patient'
import type { UserProfile } from '@/types/user'
import { isInvoiceItemRipsEligible } from '@/utils/buildRipsJson'
import { getBillingModalitySettings } from '@/services/billingModalityService'
import { buildExcludedIvaBreakdown } from '../../shared/dianHealthTax.js'

export interface BuildHealthInvoiceDocumentOptions {
  invoice: ElectronicInvoice
  patient?: Patient | null
  professional?: UserProfile | null
  billingResolution?: DianBillingResolution
  paymentForm?: 'contado' | 'credito'
  paymentMeans?: 'efectivo' | 'transferencia' | 'tarjeta' | 'pse' | 'otro'
}

function splitNit(nit: string): { nit: string; dv?: string } {
  const raw = nit.replace(/\D/g, '')
  if (raw.length <= 1) return { nit: raw }
  return { nit: raw.slice(0, -1), dv: raw.slice(-1) }
}

function extractIssueTime(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(11, 19)
  }
  return date.toISOString().slice(11, 19)
}

export function buildHealthElectronicInvoiceDocument(
  options: BuildHealthInvoiceDocumentOptions,
): HealthElectronicInvoiceDocument {
  const {
    invoice,
    patient = null,
    professional = null,
    billingResolution,
    paymentForm = 'contado',
    paymentMeans = 'transferencia',
  } = options

  const issuerNit = splitNit(invoice.issuerNit)
  const now = new Date().toISOString()
  const storedResolution = getBillingModalitySettings().resolution
  const resolvedBilling: DianBillingResolution = billingResolution ?? {
    resolutionNumber: storedResolution.resolutionNumber || undefined,
    prefix: invoice.invoicePrefix || storedResolution.prefix || undefined,
    authorizedRangeFrom: storedResolution.rangeFrom
      ? Number(storedResolution.rangeFrom)
      : undefined,
    authorizedRangeTo: storedResolution.rangeTo ? Number(storedResolution.rangeTo) : undefined,
  }

  return {
    schemaVersion: '2026.1',
    generatedAt: now,
    cuv: invoice.cuv ?? null,
    cufe: invoice.cufe ?? null,
    rips: invoice.ripsJson ?? null,
    dian: {
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      issueTime: extractIssueTime(invoice.issueDate),
      paymentForm,
      paymentMeans,
      currency: 'COP',
      issuer: {
        businessName: invoice.issuerBusinessName,
        nit: issuerNit.nit,
        nitVerificationDigit: issuerNit.dv,
        address: professional?.clinicName ? undefined : undefined,
        city: patient?.city,
        municipalityCode: patient?.municipalityCode,
        taxRegime: 'Régimen común',
        billingResolution: resolvedBilling,
      },
      buyer: {
        documentType: invoice.buyerDocumentType,
        documentNumber: invoice.buyerDocumentNumber,
        fullName: invoice.buyerName,
        address: patient?.address,
        phone: patient?.phone,
        email: patient?.email,
      },
    },
    salud: {
      cuv: invoice.cuv ?? null,
      codPrestadorReps: invoice.healthSector.codPrestadorReps,
      modalidadPago: invoice.healthSector.modalidadPago,
      coberturaPlanBeneficios: invoice.healthSector.coberturaPlanBeneficios,
      tipoUsuario: invoice.healthSector.tipoUsuario,
      numAutorizacion: invoice.healthSector.numAutorizacion ?? null,
      conceptoRecaudo: invoice.healthSector.conceptoRecaudo,
      valorPagoModerador: invoice.healthSector.valorPagoModerador,
      numFEVPagoModerador: invoice.healthSector.numFEVPagoModerador ?? null,
      procedures: invoice.items.map((item) => ({
        lineNumber: item.lineNumber,
        cupsCode: item.cupsCode ?? null,
        description: item.description,
        cie10Code: item.cie10Code ?? null,
        cie10Description: item.cie10Description ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        copayAmount: item.copayAmount ?? 0,
        totalAmount: item.totalAmount,
        attentionDate: item.attentionDate,
        professionalDocument: item.professionalDocument,
        professionalName: item.professionalName,
        reportableInRips: isInvoiceItemRipsEligible(item),
      })),
    },
    economicDetail: {
      subtotal: invoice.subtotal,
      discountTotal: invoice.discountTotal,
      taxTotal: 0,
      copayTotal: invoice.copayTotal,
      netPayable: invoice.netPayable,
      ripsReportableTotal: invoice.ripsReportableTotal,
      ripsExcludedLineCount: invoice.ripsExcludedLineCount,
      iva: buildExcludedIvaBreakdown(invoice.netPayable),
    },
    clinicalTraceability: {
      patientId: invoice.patientId,
      professionalId: invoice.professionalId,
      clinicalRecordIds: invoice.clinicalRecordIds,
      evolutionNoteIds: invoice.evolutionNoteIds ?? [],
    },
  }
}

export function serializeHealthElectronicInvoiceDocument(
  document: HealthElectronicInvoiceDocument,
): string {
  return JSON.stringify(document, null, 2)
}

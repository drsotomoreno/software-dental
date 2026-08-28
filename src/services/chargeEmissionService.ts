import type { PaymentInvoice } from '@/types/clinicalRecord'
import type { BillingModality } from '@/types/billingModality'
import { FOLIO_DEPLETED_MESSAGE } from '@/types/billingModality'
import {
  consumeElectronicFolio,
  getBillingModalitySettings,
  getFoliosAvailable,
  usesProviderEmission,
} from '@/services/billingModalityService'
import { emitInvoiceWithDianProvider } from '@/services/dianProviderClient'
import { buildDianQrUrl } from '@/utils/thermalInvoicePrint'

export interface ChargeEmissionContext {
  invoice: PaymentInvoice
  patientName?: string
  patientDocument?: string
  paymentReason?: string
  cupsCode?: string
  amount: number
  forceCashReceipt?: boolean
}

export interface ChargeEmissionResult {
  invoice: PaymentInvoice
  modality: BillingModality
  usedProvider: boolean
  folioConsumed: boolean
  depleted: boolean
  message: string
}

function buildRipsSnapshot(
  context: ChargeEmissionContext,
  extras?: { cuv?: string | null; cufe?: string | null },
): Record<string, unknown> {
  return {
    tipo: extras?.cufe ? 'fev_salud_marca_blanca' : 'recibo_caja_salud',
    numFactura: context.invoice.invoiceNumber,
    fecha: context.invoice.invoiceDate,
    cuv: extras?.cuv ?? null,
    cufe: extras?.cufe ?? null,
    paciente: {
      nombre: context.patientName ?? '',
      documento: context.patientDocument ?? '',
    },
    procedimientos: [
      {
        cups: context.cupsCode || null,
        descripcion: context.paymentReason || context.invoice.notes || 'Atención odontológica',
        vrServicio: context.amount,
        cantidad: 1,
      },
    ],
    nota: extras?.cufe
      ? 'Factura electrónica DIAN (marca blanca). Folio consumido.'
      : 'Comprobante interno. No consume folios electrónicos.',
  }
}

function cashReceiptResult(
  context: ChargeEmissionContext,
  depleted: boolean,
): ChargeEmissionResult {
  const ripsJsonSnapshot = JSON.stringify(buildRipsSnapshot(context))
  return {
    modality: 'manual',
    usedProvider: false,
    folioConsumed: false,
    depleted,
    message: depleted
      ? FOLIO_DEPLETED_MESSAGE
      : 'Recibo de Caja interno de 80 mm listo. No se descontó ningún folio.',
    invoice: {
      ...context.invoice,
      emissionMode: 'manual',
      cufe: null,
      cuv: null,
      dianQrUrl: null,
      ripsJsonSnapshot,
    },
  }
}

export async function emitChargeReceipt(
  context: ChargeEmissionContext,
): Promise<ChargeEmissionResult> {
  const settings = getBillingModalitySettings()
  const depleted = getFoliosAvailable(settings) <= 0

  if (context.forceCashReceipt || !usesProviderEmission(settings)) {
    return cashReceiptResult(context, depleted && settings.modality === 'automatic')
  }

  const emitted = await emitInvoiceWithDianProvider({
    invoiceNumber: context.invoice.invoiceNumber,
    issueDate: context.invoice.invoiceDate,
    amount: context.amount,
    buyerName: context.patientName,
    buyerDocument: context.patientDocument,
  })

  if (!emitted.ok || !emitted.cufe) {
    return cashReceiptResult(context, depleted)
  }

  const consumed = consumeElectronicFolio()
  const ripsJsonSnapshot = JSON.stringify(
    buildRipsSnapshot(context, { cuv: emitted.cuv, cufe: emitted.cufe }),
  )

  return {
    modality: 'automatic',
    usedProvider: true,
    folioConsumed: consumed,
    depleted: getFoliosAvailable() <= 0,
    message: consumed
      ? `${emitted.message} Se descontó 1 folio.`
      : emitted.message,
    invoice: {
      ...context.invoice,
      emissionMode: 'provider',
      cufe: emitted.cufe,
      cuv: emitted.cuv ?? null,
      dianQrUrl: emitted.qrUrl || buildDianQrUrl(emitted.cufe),
      ripsJsonSnapshot,
    },
  }
}

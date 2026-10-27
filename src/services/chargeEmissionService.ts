import type { PaymentInvoice } from '@/types/clinicalRecord'
import type { BillingModality } from '@/types/billingModality'
import { FOLIO_DEPLETED_MESSAGE } from '@/types/billingModality'
import type { CheckoutBuyerForm, CheckoutLineItem } from '@/types/consultationCheckout'
import { armarPaqueteDocumentoCobro, type TipoDocumentoPaquete } from '@/utils/paqueteDocumentoCobro'
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
  buyer?: CheckoutBuyerForm
  cart?: CheckoutLineItem[]
}

export interface ChargeEmissionResult {
  invoice: PaymentInvoice
  modality: BillingModality
  usedProvider: boolean
  folioConsumed: boolean
  depleted: boolean
  message: string
}

function lineasDeCobro(context: ChargeEmissionContext) {
  const cart = context.cart ?? []
  if (cart.length > 0) {
    return cart.map((item) => ({
      id: item.id,
      descripcion: item.name,
      cupsCode: item.cupsCode,
      cantidad: item.quantity,
      valorNeto: item.totalAmount,
      esPersonalizado: item.kind === 'aesthetic',
    }))
  }
  return [
    {
      id: context.invoice.id,
      descripcion: context.paymentReason || context.invoice.notes || 'Atención odontológica',
      cupsCode: context.cupsCode,
      cantidad: 1,
      valorNeto: context.amount,
    },
  ]
}

function exigirPaquete(context: ChargeEmissionContext, tipo: TipoDocumentoPaquete) {
  const armado = armarPaqueteDocumentoCobro({
    tipo,
    numero: context.invoice.invoiceNumber,
    lineas: lineasDeCobro(context),
    valorNetoDocumento: context.amount,
  })
  if (!armado.regla.ok) {
    throw new Error(armado.regla.message ?? 'El valor neto del comprobante no coincide con la suma RIPS.')
  }
  return armado
}

function buildRipsSnapshot(
  context: ChargeEmissionContext,
  extras?: { cuv?: string | null; cufe?: string | null },
): Record<string, unknown> {
  const tipo: TipoDocumentoPaquete = extras?.cufe ? 'FEV' : 'RECIBO_CAJA'
  const { paquete, regla } = exigirPaquete(context, tipo)
  const numero = paquete.numero

  return {
    tipo: extras?.cufe ? 'fev_salud_marca_blanca' : 'recibo_caja_salud',
    numFactura: tipo === 'FEV' ? numero : null,
    numeroRecibo: tipo === 'RECIBO_CAJA' ? numero : null,
    numeroDocumento: numero,
    fecha: context.invoice.invoiceDate,
    cuv: extras?.cuv ?? null,
    cufe: extras?.cufe ?? null,
    paciente: {
      nombre: context.patientName ?? '',
      documento: context.patientDocument ?? '',
      tipoDocumento: context.buyer?.documentType ?? null,
      email: context.buyer?.email ?? null,
      responsabilidadFiscal: context.buyer?.fiscalResponsibility ?? null,
    },
    consultas: paquete.consultas.map((item) => ({
      cups: item.cupsCode,
      descripcion: item.descripcion,
      vrServicio: item.valorNeto,
      cantidad: item.cantidad,
      consecutivo: item.consecutivo,
      numeroDocumento: numero,
    })),
    procedimientos: paquete.procedimientos.map((item) => ({
      cups: item.cupsCode,
      descripcion: item.descripcion,
      vrServicio: item.valorNeto,
      cantidad: item.cantidad,
      consecutivo: item.consecutivo,
      numeroDocumento: numero,
    })),
    otrosServicios: paquete.otrosServicios.map((item) => ({
      tipoOS: '01',
      codTecnologiaSalud: 'OTROS',
      nomTecnologiaSalud: item.descripcion,
      vrServicio: item.valorNeto,
      cantidadOS: item.cantidad,
      consecutivo: item.consecutivo,
      numeroDocumento: numero,
    })),
    vrTotalDian: regla.valorNetoDocumento,
    vrTotalRips: regla.valorNetoRips,
    fevEqualsRips: true,
    nota: extras?.cufe
      ? 'Factura electrónica DIAN (marca blanca). Folio consumido. Cruce CUFE ↔ RIPS JSON.'
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
  exigirPaquete(context, context.forceCashReceipt ? 'RECIBO_CAJA' : 'FEV')
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

import type { PaymentInvoice } from '@/types/clinicalRecord'
import type { BillingModality } from '@/types/billingModality'
import { FOLIO_DEPLETED_MESSAGE } from '@/types/billingModality'
import type { CheckoutBuyerForm, CheckoutLineItem } from '@/types/consultationCheckout'
import { assertFevEqualsRips } from '@/types/consultationCheckout'
import {
  consumeElectronicFolio,
  getBillingModalitySettings,
  getFoliosAvailable,
  usesProviderEmission,
} from '@/services/billingModalityService'
import { emitDualValidation } from '@/services/ripsApiService'
import { buildDianQrUrl } from '@/utils/thermalInvoicePrint'
import { hasOfficialRipsPackage } from '@/utils/dualValidation'
import type { EstadoDian, EstadoMinsaludMuv, MuvRejectionDetail } from '@/utils/dualValidation'

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

function parseOfficialRips(snapshot?: string | null) {
  if (!snapshot?.trim()) return undefined
  try {
    const parsed = JSON.parse(snapshot) as Record<string, unknown>
    if (hasOfficialRipsPackage(parsed)) return parsed
  } catch {
    /* snapshot no oficial */
  }
  return undefined
}

function buildRipsSnapshot(
  context: ChargeEmissionContext,
  extras?: {
    cuv?: string | null
    cufe?: string | null
    estado_dian?: EstadoDian
    estado_minsalud_muv?: EstadoMinsaludMuv
  },
): Record<string, unknown> {
  const cart = context.cart ?? []
  const procedimientos = cart
    .filter((item) => item.ripsGroup === 'procedimientos')
    .map((item) => ({
      cups: item.cupsCode || null,
      descripcion: item.name,
      vrServicio: item.totalAmount,
      cantidad: item.quantity,
    }))
  const otrosServicios = cart
    .filter((item) => item.ripsGroup === 'otrosServicios')
    .map((item) => ({
      tipoOS: '01',
      codTecnologiaSalud: 'OTROS',
      nomTecnologiaSalud: item.name,
      vrServicio: item.totalAmount,
      cantidadOS: item.quantity,
    }))
  const equality = cart.length > 0 ? assertFevEqualsRips(cart) : { ok: true, dianTotal: context.amount, ripsTotal: context.amount }

  return {
    tipo: extras?.cufe ? 'fev_salud_marca_blanca' : 'recibo_caja_salud',
    numFactura: context.invoice.invoiceNumber,
    fecha: context.invoice.invoiceDate,
    cuv: extras?.cuv ?? null,
    cufe: extras?.cufe ?? null,
    codigo_cufe: extras?.cufe ?? null,
    codigo_cuv: extras?.cuv ?? null,
    estado_dian: extras?.estado_dian ?? 'Pendiente',
    estado_minsalud_muv: extras?.estado_minsalud_muv ?? 'Pendiente_Envio',
    paciente: {
      nombre: context.patientName ?? '',
      documento: context.patientDocument ?? '',
      tipoDocumento: context.buyer?.documentType ?? null,
      email: context.buyer?.email ?? null,
      responsabilidadFiscal: context.buyer?.fiscalResponsibility ?? null,
    },
    procedimientos:
      procedimientos.length > 0
        ? procedimientos
        : [
            {
              cups: context.cupsCode || null,
              descripcion: context.paymentReason || context.invoice.notes || 'Atención odontológica',
              vrServicio: context.amount,
              cantidad: 1,
            },
          ],
    otrosServicios,
    vrTotalDian: equality.dianTotal,
    vrTotalRips: equality.ripsTotal,
    fevEqualsRips: equality.ok,
    nota: extras?.cufe
      ? extras.cuv
        ? 'Factura 100% legalizada (CUFE DIAN + CUV MinSalud).'
        : 'CUFE DIAN legalizado. CUV MinSalud pendiente o con glosas.'
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
      codigo_cufe: null,
      codigo_cuv: null,
      estado_dian: 'Pendiente',
      estado_minsalud_muv: 'Pendiente_Envio',
      detalles_rechazo_muv: [],
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

  const officialRips = parseOfficialRips(context.invoice.ripsJsonSnapshot)
  const lines = (context.cart ?? []).map((item) => ({
    description: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    cupsCode: item.cupsCode || undefined,
  }))

  const dual = await emitDualValidation({
    rips: officialRips ?? {
      numDocumentoIdObligado: '',
      numFactura: context.invoice.invoiceNumber,
      tipoNota: null,
      numNota: null,
      usuarios: [],
    },
    invoice: {
      invoiceNumber: context.invoice.invoiceNumber,
      nitEmisor: '900123456',
      razonSocialEmisor: 'Prestador de servicios de salud',
      nitAdquiriente: context.patientDocument ?? context.buyer?.documentNumber ?? '222222222222',
      razonSocialAdquiriente: context.patientName ?? 'Adquiriente',
      issueDate: context.invoice.invoiceDate,
      payableAmount: context.amount,
      lines: lines.length
        ? lines
        : [
            {
              description: context.paymentReason || context.invoice.notes || 'Atención odontológica',
              quantity: 1,
              unitPrice: context.amount,
              cupsCode: context.cupsCode || undefined,
            },
          ],
    },
    metadatos: {
      patientDocument: context.patientDocument,
    },
    options: {
      apiKey: settings.tenantApiKey,
    },
  })

  const cufe = dual.codigo_cufe ?? dual.cufe ?? null
  if (dual.estado_dian !== 'Aprobado' || !cufe) {
    return cashReceiptResult(context, depleted)
  }

  const consumed = consumeElectronicFolio()
  const cuv = dual.codigo_cuv ?? dual.cuv ?? null
  const ripsJsonSnapshot = JSON.stringify(
    officialRips
      ? { ...officialRips, cufe, cuv }
      : buildRipsSnapshot(context, {
          cuv,
          cufe,
          estado_dian: dual.estado_dian,
          estado_minsalud_muv: dual.estado_minsalud_muv,
        }),
  )

  const glosas: MuvRejectionDetail[] = dual.detalles_rechazo_muv ?? []
  const message = dual.listoParaEntrega
    ? `CUFE y CUV listos. Factura 100% legalizada.${consumed ? ' Se descontó 1 folio.' : ''}`
    : dual.estado_minsalud_muv === 'Rechazado_Con_Glosas'
      ? `CUFE DIAN legalizado. MUV rechazó con glosas (${glosas.length}).`
      : `CUFE DIAN legalizado. CUV pendiente de envío a MinSalud.${consumed ? ' Se descontó 1 folio.' : ''}`

  return {
    modality: 'automatic',
    usedProvider: true,
    folioConsumed: consumed,
    depleted: getFoliosAvailable() <= 0,
    message,
    invoice: {
      ...context.invoice,
      emissionMode: 'provider',
      cufe,
      cuv,
      codigo_cufe: cufe,
      codigo_cuv: cuv,
      estado_dian: dual.estado_dian,
      estado_minsalud_muv: dual.estado_minsalud_muv,
      detalles_rechazo_muv: glosas,
      dianQrUrl: dual.qrUrl || buildDianQrUrl(cufe),
      ripsJsonSnapshot,
    },
  }
}

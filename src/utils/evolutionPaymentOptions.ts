import type { PaymentDocumentKind, PaymentInvoice } from '../types/clinicalRecord'
import type { ElectronicInvoice } from '../types/invoice'
import type { TipoVinculacionFinanciera } from '../types/evolutionNoteRips'
import { formatCurrency } from './crypto.ts'
import { formatAbonoDate, latestPaymentInvoice, resolvePaymentDocumentKind } from './paymentAbonos.ts'

/** Pago ya registrado que puede vincularse a una nota de evolución. */
export interface PagoVinculable {
  id: string
  paymentDate: string
  amount: number
  paymentReason: string
  invoices?: PaymentInvoice[]
  documentKind?: PaymentDocumentKind
}

export interface OpcionPagoPaciente {
  id: string
  tipo: Extract<TipoVinculacionFinanciera, 'recibo_interno' | 'fev'>
  consecutivo: string
  fecha: string
  valor: number
  concepto: string
}

export function etiquetaOpcionPago(opcion: OpcionPagoPaciente): string {
  const consecutivo = opcion.consecutivo.trim() || 'Sin consecutivo'
  const concepto = opcion.concepto.trim() || 'Sin concepto'
  const numero =
    opcion.tipo === 'recibo_interno' && /^FV/i.test(consecutivo) ? `Recibo ${consecutivo}` : consecutivo
  return `${numero} · ${formatAbonoDate(opcion.fecha)} · ${formatCurrency(opcion.valor)} · ${concepto}`
}

export function opcionDesdePago(pago: PagoVinculable): OpcionPagoPaciente {
  const comprobante = latestPaymentInvoice(pago)
  const kind = resolvePaymentDocumentKind(pago)
  return {
    id: comprobante?.id || pago.id,
    tipo: kind === 'factura' ? 'fev' : 'recibo_interno',
    consecutivo: comprobante?.invoiceNumber?.trim() || 'Sin consecutivo',
    fecha: comprobante?.invoiceDate || pago.paymentDate,
    valor: comprobante?.amount ?? pago.amount ?? 0,
    concepto: pago.paymentReason?.trim() || comprobante?.notes?.trim() || 'Pago',
  }
}

export function opcionDesdeFactura(factura: Pick<
  ElectronicInvoice,
  'id' | 'invoiceNumber' | 'issueDate' | 'netPayable' | 'items' | 'status'
>): OpcionPagoPaciente {
  const concepto = factura.items?.find((item) => item.description?.trim())?.description?.trim()
  return {
    id: factura.id,
    tipo: 'fev',
    consecutivo: factura.invoiceNumber?.trim() || 'Sin consecutivo',
    fecha: factura.issueDate,
    valor: factura.netPayable ?? 0,
    concepto: concepto || 'Factura electrónica',
  }
}

function claveOpcion(opcion: OpcionPagoPaciente): string {
  return `${opcion.tipo}:${opcion.consecutivo}:${opcion.valor}`
}

/** Une abonos de la historia y FEV del paciente, sin repetir el mismo comprobante. */
export function armarOpcionesPago(input: {
  pagos?: PagoVinculable[]
  facturas?: Array<Pick<ElectronicInvoice, 'id' | 'invoiceNumber' | 'issueDate' | 'netPayable' | 'items' | 'status'>>
}): OpcionPagoPaciente[] {
  const map = new Map<string, OpcionPagoPaciente>()

  for (const pago of input.pagos ?? []) {
    const opcion = opcionDesdePago(pago)
    map.set(claveOpcion(opcion), opcion)
  }

  for (const factura of input.facturas ?? []) {
    if (factura.status === 'cancelled' || factura.status === 'voided_by_credit_note') continue
    const opcion = opcionDesdeFactura(factura)
    const clave = claveOpcion(opcion)
    const previa = map.get(clave)
    map.set(clave, previa ? { ...previa, id: opcion.id, tipo: 'fev' } : opcion)
  }

  return [...map.values()].sort((a, b) => b.fecha.localeCompare(a.fecha))
}

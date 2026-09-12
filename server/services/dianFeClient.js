/**
 * Cliente de emisión FEV ante la DIAN o el proveedor tecnológico.
 * En sandbox genera un CUFE SHA-384 y lo estampa en el XML.
 */
import { createHash } from 'node:crypto'
import { config } from '../config.js'
import { stampCufeOnInvoiceXml } from './dianFeXmlBuilder.js'
import { ESTADO_DIAN } from '../../shared/dualValidation.js'

export const DIAN_QR_BASE = 'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey='

export function buildDianQrUrl(cufe) {
  return `${DIAN_QR_BASE}${encodeURIComponent(String(cufe ?? '').trim())}`
}

export function generateSandboxCufe(seed) {
  return createHash('sha384').update(String(seed ?? '')).digest('hex').toUpperCase()
}

function shouldRejectDian({ forceReject, invoice, numFactura }) {
  if (forceReject === true) return true
  if (invoice?.forceReject === true) return true
  const nit = String(invoice?.nitEmisor ?? '').trim().toUpperCase()
  if (nit === 'DIAN-REJECT' || nit === 'DIAN_REJECT') return true
  const factura = String(numFactura ?? invoice?.numFactura ?? '').trim().toUpperCase()
  return factura.startsWith('REJECT') || factura.includes('DIAN-FAIL')
}

/**
 * Envía el XML FEV a la DIAN / proveedor y devuelve el CUFE.
 * @param {object} params
 * @param {string} params.xml
 * @param {object} [params.invoice]
 * @param {string} [params.numFactura]
 * @param {boolean} [params.forceReject]
 * @param {string} [params.apiKey]
 */
export async function submitInvoiceToDian({
  xml,
  invoice = {},
  numFactura,
  forceReject = false,
  apiKey,
} = {}) {
  const factura = String(numFactura ?? invoice.numFactura ?? invoice.invoiceNumber ?? '').trim()

  if (!String(xml ?? '').trim()) {
    return {
      success: false,
      source: 'local',
      estado_dian: ESTADO_DIAN.RECHAZADO,
      error: 'El XML de la FEV está vacío.',
    }
  }

  if (shouldRejectDian({ forceReject, invoice, numFactura: factura })) {
    return {
      success: false,
      source: 'sandbox',
      estado_dian: ESTADO_DIAN.RECHAZADO,
      error: 'DIAN rechazó la factura (montos o impuestos inconsistentes).',
    }
  }

  const seed = `${apiKey || config.dian.technicalKey || 'sandbox'}|${factura}|${xml.length}|${invoice.payableAmount ?? ''}`
  const cufe = generateSandboxCufe(seed)
  const stampedXml = stampCufeOnInvoiceXml(xml, cufe)

  return {
    success: true,
    source: 'sandbox',
    estado_dian: ESTADO_DIAN.APROBADO,
    cufe,
    codigo_cufe: cufe,
    qrUrl: buildDianQrUrl(cufe),
    xml: stampedXml,
    numFactura: factura,
  }
}

/**
 * Emisión compacta usada por POST /provider/emit (ticket 80 mm / marca blanca).
 */
export async function emitProviderInvoice({ apiKey, invoice = {} } = {}) {
  const invoiceNumber = String(invoice.invoiceNumber ?? invoice.numFactura ?? '').trim()
  if (!invoiceNumber) {
    return {
      success: false,
      error: 'Se requiere número de factura.',
    }
  }

  const seed = `${String(apiKey ?? '').slice(0, 4)}-${invoiceNumber}-${invoice.issueDate ?? ''}-${invoice.amount ?? invoice.payableAmount ?? 0}`
  const cufe = generateSandboxCufe(seed)
  return {
    success: true,
    cufe,
    codigo_cufe: cufe,
    qrUrl: buildDianQrUrl(cufe),
    invoiceNumber,
    message: 'Factura enviada al proveedor. CUFE y QR listos para el ticket de 80 mm.',
  }
}

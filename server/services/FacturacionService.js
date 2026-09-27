import { createHash } from 'node:crypto'
import { config } from '../config.js'

const PDF_BASE = {
  alanube: 'https://files.alanube.co/fev',
  'majim-e': 'https://api.majim-e.com/documentos',
}

/**
 * Alanube por defecto. Majim-e si FEV_PROVIDER o el cuerpo lo indican.
 * @param {unknown} explicit
 */
export function resolveFevProvider(explicit) {
  const raw = String(explicit || config.fevProvider || 'alanube').trim().toLowerCase()
  if (raw === 'majim-e' || raw === 'majime' || raw === 'majim') return 'majim-e'
  return 'alanube'
}

/**
 * Empaqueta la FEV a partir del CUV del Ministerio y simula al proveedor
 * tecnológico (Alanube / Majim-e). Sin CUV no hay CUFE ni PDF.
 *
 * @param {{ cuv?: string, invoice?: object, provider?: string, ambiente?: string, serie?: string | null }} params
 */
export async function empaquetarConCuv({ cuv, invoice = {}, provider, ambiente, serie } = {}) {
  const codigo = String(cuv ?? '').trim()
  if (!codigo) {
    return {
      success: false,
      error: 'El CUV es obligatorio para empaquetar la factura electrónica.',
    }
  }

  const selected = resolveFevProvider(provider ?? invoice.provider)
  const numFactura = invoice.numFactura ?? invoice.invoiceNumber ?? ''
  const issueDate = invoice.issueDate ?? ''
  const amount = invoice.payableAmount ?? invoice.amount ?? 0
  const ambienteId = ambiente ?? invoice.ambiente ?? 'pruebas'
  const serieHabilitacion = serie ?? invoice.serie ?? null
  const seed = `${codigo}|${numFactura}|${issueDate}|${amount}|${selected}|${ambienteId}|${serieHabilitacion ?? ''}`
  const cufe = createHash('sha384').update(seed).digest('hex').toUpperCase()
  const pdfUrl = `${PDF_BASE[selected]}/${cufe}.pdf`

  return {
    success: true,
    cuv: codigo,
    cufe,
    pdfUrl,
    provider: selected,
    ambiente: ambienteId,
    serie: serieHabilitacion,
  }
}

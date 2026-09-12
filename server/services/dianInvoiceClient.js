/**
 * Cliente DIAN / proveedor tecnológico: envía el XML FEV y recibe el CUFE.
 * Paso 1–2 del flujo de doble validación. No involucra al MUV ni al CUV.
 */
import { createHash, randomBytes } from 'node:crypto'
import { config, hasDianCredentials } from '../config.js'

function generateSandboxCufe({ xml, invoice }) {
  const seed = [
    invoice?.numFactura ?? invoice?.invoiceNumber ?? '',
    invoice?.nitEmisor ?? '',
    invoice?.payableAmount ?? '',
    invoice?.issueDate ?? '',
    String(xml ?? '').slice(0, 256),
    config.dian.technicalKey || 'SANDBOX-DIAN',
  ].join('|')
  const hash = createHash('sha384').update(seed).digest('hex').toUpperCase()
  return hash.slice(0, 96)
}

function normalizeDianErrors(payload) {
  if (!payload) return []
  const candidates = payload.Errores ?? payload.errores ?? payload.errors ?? payload.StatusDescription
  if (Array.isArray(candidates)) {
    return candidates.map((item) => ({
      code: item.Codigo ?? item.codigo ?? item.code,
      field: item.Campo ?? item.campo ?? item.field,
      message: item.Descripcion ?? item.descripcion ?? item.message ?? 'Rechazo DIAN',
    }))
  }
  if (typeof candidates === 'string' && candidates.trim()) {
    return [{ message: candidates.trim() }]
  }
  if (typeof payload.message === 'string') {
    return [{ message: payload.message }]
  }
  return []
}

/**
 * Envía el XML de la factura a la API de la DIAN y espera el CUFE.
 * @param {{ xml: string, invoice?: object, metadatos?: object }} params
 */
export async function submitInvoiceXmlToDian({ xml, invoice = {}, metadatos = {} }) {
  if (!String(xml ?? '').includes('<Invoice')) {
    return {
      success: false,
      source: 'local',
      errors: [{ code: 'DIAN-XML', field: 'xml', message: 'El XML FEV es inválido o está vacío.' }],
    }
  }

  const payable = Number(invoice.payableAmount)
  if (Number.isFinite(payable) && payable < 0) {
    return {
      success: false,
      source: 'local',
      errors: [{ code: 'DIAN-MONTO', field: 'payableAmount', message: 'El monto de la factura DIAN no puede ser negativo.' }],
    }
  }

  const useSandbox = config.dian.sandbox || !hasDianCredentials()

  if (useSandbox) {
    if (invoice.forceDianReject || metadatos.forceDianReject) {
      return {
        success: false,
        source: 'sandbox',
        errors: [
          {
            code: 'DIAN-SANDBOX-RECHAZO',
            field: 'xml',
            message: 'La DIAN rechazó la factura (sandbox).',
          },
        ],
      }
    }

    return {
      success: true,
      source: 'sandbox',
      cufe: generateSandboxCufe({ xml, invoice }),
      trackId: `DIAN-${randomBytes(4).toString('hex').toUpperCase()}`,
      estado: 'Aprobado',
      qrUrl: null,
    }
  }

  const { apiBaseUrl, submitPath, softwareId, technicalKey } = config.dian
  const url = `${apiBaseUrl}${submitPath}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${technicalKey}`,
      'X-Software-ID': softwareId,
    },
    body: JSON.stringify({
      xml,
      invoice: {
        numFactura: invoice.numFactura ?? invoice.invoiceNumber,
        nitEmisor: invoice.nitEmisor,
        payableAmount: invoice.payableAmount,
        issueDate: invoice.issueDate,
      },
      metadatos,
    }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    return {
      success: false,
      source: 'dian',
      httpStatus: response.status,
      errors: normalizeDianErrors(data),
      raw: data,
    }
  }

  const cufe = data.CUFE ?? data.cufe ?? data.Uuid ?? data.uuid
  const approved =
    data.StatusCode === '00' ||
    data.estado === 'Aprobado' ||
    data.IsValid === true ||
    Boolean(cufe)

  if (!approved || !String(cufe ?? '').trim()) {
    return {
      success: false,
      source: 'dian',
      errors: normalizeDianErrors(data).length
        ? normalizeDianErrors(data)
        : [{ message: 'La DIAN no devolvió CUFE.' }],
      raw: data,
    }
  }

  return {
    success: true,
    source: 'dian',
    cufe: String(cufe).trim(),
    trackId: data.TrackId ?? data.trackId,
    estado: data.Estado ?? data.estado ?? 'Aprobado',
    qrUrl: data.QrUrl ?? data.qrUrl ?? null,
    raw: data,
  }
}

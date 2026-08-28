import QRCode from 'qrcode'
import type { HealthElectronicInvoiceDocument } from '@/types/healthElectronicInvoice'
import type { ElectronicInvoice, InvoiceItem } from '@/types/invoice'
import type { PaymentInvoice } from '@/types/clinicalRecord'
import type { Patient } from '@/types/patient'
import type { UserProfile } from '@/types/user'
import { buildHealthElectronicInvoiceDocument } from '@/utils/buildHealthElectronicInvoiceDocument'
import { formatCurrency, formatDate } from '@/utils/crypto'
import { getDesktopBridge } from '@/types/desktopBridge'
import thermalCss from '@/styles/thermal-80mm.css?inline'

/** Datos normalizados para ticket térmico 80 mm */
export interface ThermalInvoiceReceiptData {
  invoiceNumber: string
  issueDate: string
  documentTitle?: string
  provider: {
    businessName: string
    nitWithDv: string
    repsCode: string
    address?: string
    phone?: string
    city?: string
  }
  patient: {
    name: string
    document: string
    userType: string
    attentionDate?: string
  }
  lines: ThermalInvoiceLine[]
  totals: {
    subtotal: number
    discounts: number
    copay: number
    iva: number
    netTotal: number
  }
  cuv?: string | null
  cufe?: string | null
  resolutionLegend: string
  isElectronic: boolean
  ripsSummary?: string
  legalNotice?: string
}

export interface ThermalInvoiceLine {
  quantity: number
  concept: string
  cupsCode?: string | null
  totalAmount: number
  isCustom?: boolean
  isZero?: boolean
}

const DIAN_QR_BASE = 'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey='

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function abbreviateCufe(cufe: string, head = 10, tail = 10): string {
  const trimmed = cufe.trim()
  if (trimmed.length <= head + tail + 3) return trimmed
  return `${trimmed.slice(0, head)}…${trimmed.slice(-tail)}`
}

export function truncateThermalText(text: string, maxLen: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLen) return normalized
  return `${normalized.slice(0, maxLen - 1)}…`
}

export function buildDianQrUrl(cufe: string): string {
  return `${DIAN_QR_BASE}${encodeURIComponent(cufe.trim())}`
}

export async function generateDianQrDataUrl(cufe: string): Promise<string> {
  const url = buildDianQrUrl(cufe)
  return QRCode.toDataURL(url, {
    width: 110,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  })
}

function formatNitWithDv(nit: string, dv?: string): string {
  const clean = nit.replace(/\D/g, '')
  if (dv) return `${clean}-${dv}`
  if (clean.length > 1) return `${clean.slice(0, -1)}-${clean.slice(-1)}`
  return clean
}

function buildResolutionLegend(document: HealthElectronicInvoiceDocument): string {
  const resolution = document.dian.issuer.billingResolution
  const parts: string[] = []

  if (resolution?.resolutionNumber) {
    parts.push(`Resolución DIAN Nº ${resolution.resolutionNumber}`)
  } else {
    parts.push('Factura electrónica de venta en salud (FEV-Salud)')
  }

  if (resolution?.prefix) {
    parts.push(`Prefijo ${resolution.prefix}`)
  }

  if (resolution?.authorizedRangeFrom != null && resolution?.authorizedRangeTo != null) {
    parts.push(`Autorizado del ${resolution.authorizedRangeFrom} al ${resolution.authorizedRangeTo}`)
  }

  if (resolution?.validFrom || resolution?.validUntil) {
    const from = resolution.validFrom ? formatDate(resolution.validFrom) : '—'
    const until = resolution.validUntil ? formatDate(resolution.validUntil) : '—'
    parts.push(`Vigencia ${from} a ${until}`)
  }

  parts.push(`Factura ${document.dian.invoiceNumber}`)
  return parts.join(' · ')
}

function mapProcedureLine(item: InvoiceItem): ThermalInvoiceLine {
  const cupsLabel = item.cupsCode ? `${item.cupsCode} ` : ''
  const concept = truncateThermalText(`${cupsLabel}${item.description}`, 42)
  return {
    quantity: item.quantity,
    concept,
    cupsCode: item.cupsCode,
    totalAmount: item.totalAmount,
    isCustom: Boolean(item.isCustomProcedure),
    isZero: item.totalAmount === 0,
  }
}

export function buildThermalDataFromElectronic(
  invoice: ElectronicInvoice,
  options: {
    patient?: Patient | null
    professional?: UserProfile | null
  } = {},
): ThermalInvoiceReceiptData {
  const document = buildHealthElectronicInvoiceDocument({
    invoice,
    patient: options.patient,
    professional: options.professional,
  })

  const attentionDate =
    invoice.items.find((item) => item.attentionDate)?.attentionDate ?? invoice.issueDate

  const issuer = document.dian.issuer

  return {
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    provider: {
      businessName: issuer.businessName,
      nitWithDv: formatNitWithDv(issuer.nit, issuer.nitVerificationDigit),
      repsCode: document.salud.codPrestadorReps,
      city: issuer.city,
    },
    patient: {
      name: document.dian.buyer.fullName,
      document: `${document.dian.buyer.documentType} ${document.dian.buyer.documentNumber}`,
      userType: document.salud.tipoUsuario,
      attentionDate,
    },
    lines: invoice.items.map(mapProcedureLine),
    totals: {
      subtotal: document.economicDetail.subtotal,
      discounts: document.economicDetail.discountTotal,
      copay: document.economicDetail.copayTotal,
      iva: document.economicDetail.iva.valorImpuesto,
      netTotal: document.economicDetail.netPayable,
    },
    cuv: invoice.cuv,
    cufe: invoice.cufe,
    resolutionLegend: buildResolutionLegend(document),
    isElectronic: true,
  }
}

export function buildThermalDataFromPayment(input: {
  invoice: PaymentInvoice
  patientName?: string
  patientDocument?: string
  paymentReason?: string
  paymentMethodLabel?: string
  treatingDentistName?: string
  provider?: {
    businessName: string
    nitWithDv: string
    repsCode: string
    address?: string
    phone?: string
    city?: string
  }
}): ThermalInvoiceReceiptData {
  const { invoice, patientName, patientDocument, paymentReason, provider } = input
  const isElectronic = invoice.emissionMode === 'provider' && Boolean(invoice.cufe?.trim())
  let ripsCount = 0
  if (invoice.ripsJsonSnapshot) {
    try {
      const parsed = JSON.parse(invoice.ripsJsonSnapshot) as { procedimientos?: unknown[] }
      ripsCount = Array.isArray(parsed.procedimientos) ? parsed.procedimientos.length : 0
    } catch {
      ripsCount = 0
    }
  }

  return {
    invoiceNumber: invoice.invoiceNumber || 'S/N',
    issueDate: invoice.invoiceDate || new Date().toISOString(),
    documentTitle: isElectronic ? 'FEV-Salud' : 'Recibo de Caja',
    provider: provider ?? {
      businessName: 'Clínica Odontológica',
      nitWithDv: '—',
      repsCode: '—',
    },
    patient: {
      name: patientName || '—',
      document: patientDocument || '—',
      userType: '—',
      attentionDate: invoice.invoiceDate,
    },
    lines: [
      {
        quantity: 1,
        concept: truncateThermalText(paymentReason || invoice.notes || 'Pago odontológico', 42),
        cupsCode: undefined,
        totalAmount: invoice.amount,
      },
    ],
    totals: {
      subtotal: invoice.amount,
      discounts: 0,
      copay: 0,
      iva: 0,
      netTotal: invoice.amount,
    },
    cuv: invoice.cuv,
    cufe: invoice.cufe,
    resolutionLegend: isElectronic
      ? 'Factura electrónica DIAN · CUFE y código QR de validación'
      : 'Recibo de Caja interno de 80 mm — no consume folios electrónicos',
    isElectronic,
    ripsSummary:
      ripsCount > 0
        ? `RIPS salud: ${ripsCount} procedimiento(s) listos en el JSON de este cobro.`
        : 'RIPS salud incluido en el detalle de este comprobante.',
    legalNotice: isElectronic
      ? undefined
      : 'Emita la factura electrónica en el portal gratuito de la DIAN si la requiere.',
  }
}

function renderThermalLineRows(lines: ThermalInvoiceLine[]): string {
  return lines
    .map((line) => {
      const rowClass = [
        line.isCustom ? 'line-custom' : '',
        line.isZero ? 'line-zero' : '',
      ]
        .filter(Boolean)
        .join(' ')

      return `<tr class="${rowClass}">
        <td class="col-qty">${line.quantity}</td>
        <td class="col-concept">${escapeHtml(line.concept)}</td>
        <td class="col-total">${escapeHtml(formatCurrency(line.totalAmount))}</td>
      </tr>`
    })
    .join('')
}

export function buildThermalInvoiceHtml(data: ThermalInvoiceReceiptData, qrDataUrl?: string | null): string {
  const providerLines = [
    `NIT ${escapeHtml(data.provider.nitWithDv)} · REPS ${escapeHtml(data.provider.repsCode)}`,
    [data.provider.address, data.provider.phone, data.provider.city].filter(Boolean).join(' · '),
  ]
    .filter(Boolean)
    .map((line) => `<p class="thermal-header__meta">${escapeHtml(line)}</p>`)
    .join('')

  const cuvBlock =
    data.isElectronic && data.cuv
      ? `<p class="thermal-cuv"><strong>CUV MinSalud:</strong><br />${escapeHtml(data.cuv)}</p>`
      : data.isElectronic
        ? `<p class="thermal-cuv"><strong>CUV MinSalud:</strong> Pendiente</p>`
        : ''

  const cufeBlock =
    data.isElectronic && data.cufe
      ? `<p class="thermal-cufe"><strong>CUFE:</strong> ${escapeHtml(abbreviateCufe(data.cufe))}</p>`
      : data.isElectronic
        ? `<p class="thermal-cufe"><strong>CUFE:</strong> Pendiente de emisión DIAN</p>`
        : ''

  const qrBlock =
    data.isElectronic && data.cufe && qrDataUrl
      ? `<div class="thermal-qr-wrap"><img class="thermal-qr" src="${qrDataUrl}" width="110" height="110" alt="QR DIAN" /></div>`
      : data.isElectronic
        ? `<div class="thermal-qr-wrap"><div class="thermal-qr-placeholder">QR DIAN disponible tras emisión con CUFE</div></div>`
        : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Factura ${escapeHtml(data.invoiceNumber)}</title>
  <style>${thermalCss}</style>
</head>
<body class="thermal-print-root">
  <article class="thermal-receipt">
    <header class="thermal-header">
      <h1 class="thermal-header__name">${escapeHtml(data.provider.businessName)}</h1>
      ${providerLines}
    </header>

    <hr class="thermal-divider" />

    <p class="thermal-invoice-meta">
      <strong>${escapeHtml(data.documentTitle || (data.isElectronic ? 'FEV-Salud' : 'Recibo de Caja'))}</strong><br />
      ${escapeHtml(data.invoiceNumber)} · ${escapeHtml(formatDate(data.issueDate))}
    </p>

    <section>
      <p class="thermal-section-title">Paciente</p>
      <p class="thermal-field"><strong>Paciente:</strong> ${escapeHtml(data.patient.name)}</p>
      <p class="thermal-field"><strong>Documento:</strong> ${escapeHtml(data.patient.document)}</p>
      <p class="thermal-field"><strong>Tipo usuario:</strong> ${escapeHtml(data.patient.userType)}</p>
      ${
        data.patient.attentionDate
          ? `<p class="thermal-field"><strong>Fecha atención:</strong> ${escapeHtml(formatDate(data.patient.attentionDate))}</p>`
          : ''
      }
    </section>

    <hr class="thermal-divider" />

    <table class="thermal-services">
      <thead>
        <tr>
          <th class="col-qty">Cant</th>
          <th class="col-concept">Concepto / CUPS</th>
          <th class="col-total">Total</th>
        </tr>
      </thead>
      <tbody>
        ${renderThermalLineRows(data.lines)}
      </tbody>
    </table>

    <section class="thermal-totals">
      <div class="thermal-totals__row"><span>Subtotal</span><span>${escapeHtml(formatCurrency(data.totals.subtotal))}</span></div>
      <div class="thermal-totals__row"><span>Descuentos</span><span>${escapeHtml(formatCurrency(data.totals.discounts))}</span></div>
      <div class="thermal-totals__row"><span>IVA excluido</span><span>${escapeHtml(formatCurrency(data.totals.iva ?? 0))}</span></div>
      <div class="thermal-totals__row"><span>Copago / Cuota mod.</span><span>${escapeHtml(formatCurrency(data.totals.copay))}</span></div>
      <div class="thermal-totals__row thermal-totals__row--net"><span>TOTAL NETO</span><span>${escapeHtml(formatCurrency(data.totals.netTotal))}</span></div>
    </section>

    <hr class="thermal-divider" />

    <footer class="thermal-footer">
      ${cuvBlock}
      ${cufeBlock}
      ${qrBlock}
      ${
        data.ripsSummary
          ? `<p class="thermal-resolution">${escapeHtml(data.ripsSummary)}</p>`
          : ''
      }
      <p class="thermal-resolution">${escapeHtml(data.resolutionLegend)}</p>
      ${
        data.legalNotice
          ? `<p class="thermal-resolution">${escapeHtml(data.legalNotice)}</p>`
          : ''
      }
    </footer>
  </article>
</body>
</html>`
}

function openBrowserPrintWindow(html: string): void {
  const win = window.open('', '_blank', 'width=360,height=720')
  if (!win) {
    throw new Error('El navegador bloqueó la ventana de impresión. Permita ventanas emergentes.')
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
  }, 450)
}

/** Dispara impresión térmica 80 mm (Electron o navegador). */
export async function handlePrintThermal(html: string): Promise<void> {
  const bridge = getDesktopBridge()
  if (bridge?.isElectron && bridge.printThermalHtml) {
    await bridge.printThermalHtml(html)
    return
  }
  openBrowserPrintWindow(html)
}

export async function printThermalReceipt(data: ThermalInvoiceReceiptData): Promise<void> {
  let qrDataUrl: string | null = null
  if (data.isElectronic && data.cufe?.trim()) {
    qrDataUrl = await generateDianQrDataUrl(data.cufe)
  }
  const html = buildThermalInvoiceHtml(data, qrDataUrl)
  await handlePrintThermal(html)
}

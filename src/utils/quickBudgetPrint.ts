import { APP_NAME, APP_SHORT_NAME } from '@/constants/branding'
import { openPortabilityHtmlForPrint } from '@/utils/portabilityHtml'
import { normalizePhoneForWhatsApp } from '@/utils/whatsapp'

export interface QuickBudgetPrintItem {
  concepto: string
  valor: number
}

export interface QuickBudgetPrintInput {
  /** Nombre del titular de la cuenta / clínica (título del documento). */
  accountHolderName: string
  patientName: string
  patientDocument: string
  patientPhone?: string
  patientEmail?: string
  items: QuickBudgetPrintItem[]
  total: number
  /** ISO o fecha legible; si se omite se usa la fecha actual. */
  emittedAt?: Date
  professionalName?: string
  professionalDocument?: string
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

function formatEmissionDate(date: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

/** Resuelve el nombre visible del titular (clínica / cuenta). */
export function resolveAccountHolderTitle(user: {
  clinicName?: string
  legalName?: string
  firstName?: string
  lastName?: string
} | null): string {
  if (!user) return APP_SHORT_NAME
  const clinic = String(user.clinicName ?? '').trim()
  if (clinic) return clinic
  const legal = String(user.legalName ?? '').trim()
  if (legal) return legal
  const person = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return person || APP_SHORT_NAME
}

export function buildQuickBudgetPrintHtml(input: QuickBudgetPrintInput): string {
  const issued = input.emittedAt ?? new Date()
  const emissionLabel = formatEmissionDate(issued)
  const rows = input.items
    .map(
      (item, index) => `
      <tr>
        <td class="idx">${index + 1}</td>
        <td class="concept">${escapeHtml(item.concepto)}</td>
        <td class="amount">${escapeHtml(formatCOP(item.valor))}</td>
      </tr>`,
    )
    .join('')

  const professionalLine = input.professionalName
    ? `<p class="meta-line"><strong>Profesional:</strong> ${escapeHtml(input.professionalName)}${
        input.professionalDocument
          ? ` · Doc. ${escapeHtml(input.professionalDocument)}`
          : ''
      }</p>`
    : ''

  const phoneLine = input.patientPhone
    ? `<p><span class="label">Teléfono</span> ${escapeHtml(input.patientPhone)}</p>`
    : ''
  const emailLine = input.patientEmail
    ? `<p><span class="label">Email</span> ${escapeHtml(input.patientEmail)}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Presupuesto — ${escapeHtml(input.accountHolderName)}</title>
  <style>
    :root {
      --ink: #0f172a;
      --muted: #475569;
      --line: #cbd5e1;
      --soft: #f0fdfa;
      --accent: #0f766e;
      --accent-deep: #115e59;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 28px 32px 40px;
      color: var(--ink);
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.45;
      background: #fff;
    }
    .sheet { max-width: 720px; margin: 0 auto; }
    .brand-bar {
      height: 6px;
      border-radius: 999px;
      background: linear-gradient(90deg, #0d9488, #14b8a6 55%, #5eead4);
      margin-bottom: 22px;
    }
    header h1 {
      margin: 0;
      font-size: 26px;
      line-height: 1.2;
      letter-spacing: -0.02em;
      color: var(--accent-deep);
      font-weight: 800;
    }
    header .doc-type {
      margin: 6px 0 0;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent);
    }
    header .emitted {
      margin: 10px 0 0;
      color: var(--muted);
      font-size: 13px;
    }
    .patient-card {
      margin-top: 22px;
      padding: 14px 16px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--soft);
    }
    .patient-card h2 {
      margin: 0 0 8px;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .patient-card .name {
      margin: 0;
      font-size: 17px;
      font-weight: 700;
    }
    .patient-card p { margin: 4px 0 0; color: var(--muted); }
    .patient-card .label {
      display: inline-block;
      min-width: 6.5rem;
      font-weight: 600;
      color: var(--ink);
    }
    table.items {
      width: 100%;
      border-collapse: collapse;
      margin-top: 24px;
    }
    table.items thead th {
      text-align: left;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent-deep);
      border-bottom: 2px solid var(--accent);
      padding: 0 8px 10px;
    }
    table.items thead th.amount,
    table.items td.amount {
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    table.items thead th.idx,
    table.items td.idx {
      width: 2.2rem;
      text-align: center;
      color: var(--muted);
    }
    table.items tbody td {
      padding: 12px 8px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    table.items tbody tr:last-child td { border-bottom: 1px solid var(--line); }
    table.items .concept { font-weight: 600; color: var(--ink); }
    .totals {
      margin-top: 18px;
      display: flex;
      justify-content: flex-end;
    }
    .totals-box {
      min-width: 240px;
      padding: 14px 16px;
      border: 2px solid var(--accent-deep);
      border-radius: 12px;
      background: #fff;
      text-align: right;
    }
    .totals-box .label {
      margin: 0;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .totals-box .value {
      margin: 4px 0 0;
      font-size: 26px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: var(--ink);
    }
    .notes {
      margin-top: 28px;
      padding-top: 14px;
      border-top: 1px dashed var(--line);
      color: var(--muted);
      font-size: 12px;
    }
    .meta-line { margin: 4px 0 0; }
    footer {
      margin-top: 28px;
      font-size: 11px;
      color: #64748b;
    }
    @media print {
      body { padding: 12mm 14mm; }
      .brand-bar { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .patient-card { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .totals-box { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="brand-bar" aria-hidden="true"></div>
    <header>
      <h1>${escapeHtml(input.accountHolderName)}</h1>
      <p class="doc-type">Presupuesto odontológico</p>
      <p class="emitted">Fecha de emisión: ${escapeHtml(emissionLabel)}</p>
      ${professionalLine}
    </header>

    <section class="patient-card">
      <h2>Paciente</h2>
      <p class="name">${escapeHtml(input.patientName)}</p>
      <p><span class="label">Identificación</span> ${escapeHtml(input.patientDocument)}</p>
      ${phoneLine}
      ${emailLine}
    </section>

    <table class="items">
      <thead>
        <tr>
          <th class="idx">#</th>
          <th>Concepto</th>
          <th class="amount">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${
          rows ||
          `<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:24px;">Sin ítems</td></tr>`
        }
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-box">
        <p class="label">Total presupuesto</p>
        <p class="value">${escapeHtml(formatCOP(input.total))}</p>
      </div>
    </div>

    <div class="notes">
      <p>Valores expresados en pesos colombianos (COP). Este documento es una cotización informativa y no constituye factura ni compromiso de tratamiento hasta su aceptación formal.</p>
    </div>

    <footer>
      Generado con ${escapeHtml(APP_NAME)}. Puede imprimir este documento o guardarlo como PDF desde el diálogo de impresión del navegador.
    </footer>
  </div>
</body>
</html>`
}

export function printQuickBudget(input: QuickBudgetPrintInput): void {
  if (!input.items.length) {
    throw new Error('Agregue al menos un ítem al presupuesto antes de imprimir.')
  }
  openPortabilityHtmlForPrint(buildQuickBudgetPrintHtml(input))
}

/** Pieza corta para acompañar la imagen del presupuesto en WhatsApp. */
export function buildQuickBudgetWhatsAppMessage(input: QuickBudgetPrintInput): string {
  const firstName =
    String(input.patientName ?? '')
      .trim()
      .split(/\s+/)[0] || 'paciente'
  return [
    `Hola ${firstName} 👋`,
    '',
    `Te compartimos el *presupuesto odontológico* de *${input.accountHolderName}*.`,
    `Total: *${formatCOP(input.total)}*`,
    '',
    '_El detalle completo va en la imagen adjunta._',
  ].join('\n')
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let current = words[0]
  for (let i = 1; i < words.length; i += 1) {
    const next = `${current} ${words[i]}`
    if (ctx.measureText(next).width <= maxWidth) {
      current = next
    } else {
      lines.push(current)
      current = words[i]
    }
  }
  lines.push(current)
  return lines
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function sanitizeFileNamePart(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'paciente'
}

/**
 * Tarjeta visual del presupuesto (mismo estilo teal del documento de impresión).
 * WhatsApp muestra imágenes de forma nativa y amigable.
 */
export async function renderQuickBudgetShareImage(
  input: QuickBudgetPrintInput,
): Promise<Blob> {
  const width = 1080
  const padX = 64
  const contentWidth = width - padX * 2
  const issued = input.emittedAt ?? new Date()
  const emissionLabel = formatEmissionDate(issued)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear el lienzo del presupuesto.')

  // Medición previa para altura dinámica
  canvas.width = width
  canvas.height = 10
  ctx.font = '600 28px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  const conceptMaxWidth = contentWidth - 300
  const itemBlocks = input.items.map((item, index) => {
    const lines = wrapCanvasText(ctx, item.concepto, conceptMaxWidth)
    return { index: index + 1, lines, amount: formatCOP(item.valor) }
  })
  const itemsHeight = itemBlocks.reduce(
    (sum, block) => sum + Math.max(block.lines.length, 1) * 42 + 28,
    0,
  )
  const height = Math.max(
    1400,
    720 +
      itemsHeight +
      (input.professionalName ? 40 : 0) +
      (input.patientPhone ? 32 : 0) +
      (input.patientEmail ? 32 : 0),
  )
  canvas.height = height

  // Fondo
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, width, height)

  // Hoja blanca
  const sheetX = 36
  const sheetY = 36
  const sheetW = width - 72
  const sheetH = height - 72
  ctx.save()
  ctx.shadowColor = 'rgba(15, 23, 42, 0.12)'
  ctx.shadowBlur = 28
  ctx.shadowOffsetY = 10
  roundRect(ctx, sheetX, sheetY, sheetW, sheetH, 28)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()

  // Barra de marca
  const grad = ctx.createLinearGradient(padX, 0, width - padX, 0)
  grad.addColorStop(0, '#0d9488')
  grad.addColorStop(0.55, '#14b8a6')
  grad.addColorStop(1, '#5eead4')
  roundRect(ctx, padX, 72, contentWidth, 10, 999)
  ctx.fillStyle = grad
  ctx.fill()

  let y = 120
  ctx.fillStyle = '#115e59'
  ctx.font = '800 52px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  const titleLines = wrapCanvasText(ctx, input.accountHolderName, contentWidth)
  for (const line of titleLines) {
    ctx.fillText(line, padX, y)
    y += 58
  }

  y += 8
  ctx.fillStyle = '#0f766e'
  ctx.font = '700 22px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  ctx.fillText('PRESUPUESTO ODONTOLÓGICO', padX, y)
  y += 36

  ctx.fillStyle = '#475569'
  ctx.font = '400 24px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  ctx.fillText(`Fecha de emisión: ${emissionLabel}`, padX, y)
  y += 34

  if (input.professionalName) {
    const proDoc = input.professionalDocument
      ? ` · Doc. ${input.professionalDocument}`
      : ''
    ctx.fillText(`Profesional: ${input.professionalName}${proDoc}`, padX, y)
    y += 34
  }

  // Tarjeta paciente
  y += 18
  ctx.font = '700 32px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  const patientNameLines = wrapCanvasText(
    ctx,
    input.patientName || '—',
    contentWidth - 56,
  ).slice(0, 2)
  const patientCardH =
    90 +
    patientNameLines.length * 36 +
    28 +
    (input.patientPhone ? 32 : 0) +
    (input.patientEmail ? 32 : 0)
  roundRect(ctx, padX, y, contentWidth, patientCardH, 18)
  ctx.fillStyle = '#f0fdfa'
  ctx.fill()
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 2
  ctx.stroke()

  let py = y + 38
  ctx.fillStyle = '#0f766e'
  ctx.font = '700 18px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  ctx.fillText('PACIENTE', padX + 28, py)
  py += 40
  ctx.fillStyle = '#0f172a'
  ctx.font = '700 32px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  for (const line of patientNameLines) {
    ctx.fillText(line, padX + 28, py)
    py += 36
  }
  ctx.fillStyle = '#475569'
  ctx.font = '500 24px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  ctx.fillText(`Identificación  ${input.patientDocument || '—'}`, padX + 28, py)
  if (input.patientPhone) {
    py += 32
    ctx.fillText(`Teléfono  ${input.patientPhone}`, padX + 28, py)
  }
  if (input.patientEmail) {
    py += 32
    ctx.fillText(`Email  ${input.patientEmail}`, padX + 28, py)
  }
  y += patientCardH + 48

  // Encabezado de tabla
  ctx.fillStyle = '#115e59'
  ctx.font = '700 18px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  ctx.fillText('#', padX, y)
  ctx.fillText('CONCEPTO', padX + 56, y)
  const amountHeader = 'VALOR'
  const amountHeaderW = ctx.measureText(amountHeader).width
  ctx.fillText(amountHeader, padX + contentWidth - amountHeaderW, y)
  y += 14
  ctx.strokeStyle = '#0f766e'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(padX, y)
  ctx.lineTo(padX + contentWidth, y)
  ctx.stroke()
  y += 36

  for (const block of itemBlocks) {
    const rowTop = y
    ctx.fillStyle = '#94a3b8'
    ctx.font = '600 28px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    ctx.fillText(String(block.index), padX, rowTop)

    ctx.fillStyle = '#0f172a'
    ctx.font = '600 28px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    for (let i = 0; i < block.lines.length; i += 1) {
      ctx.fillText(block.lines[i], padX + 56, rowTop + i * 42)
    }

    ctx.font = '700 28px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    const amountW = ctx.measureText(block.amount).width
    ctx.fillText(block.amount, padX + contentWidth - amountW, rowTop)

    y += Math.max(block.lines.length, 1) * 42 + 18
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padX, y - 10)
    ctx.lineTo(padX + contentWidth, y - 10)
    ctx.stroke()
  }

  // Total
  y += 28
  const boxW = 420
  const boxH = 110
  const boxX = padX + contentWidth - boxW
  roundRect(ctx, boxX, y, boxW, boxH, 18)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#115e59'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = '#0f766e'
  ctx.font = '700 18px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  ctx.fillText('TOTAL PRESUPUESTO', boxX + 28, y + 38)
  ctx.fillStyle = '#0f172a'
  ctx.font = '800 40px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  const totalLabel = formatCOP(input.total)
  const totalW = ctx.measureText(totalLabel).width
  ctx.fillText(totalLabel, boxX + boxW - 28 - totalW, y + 82)

  y += boxH + 48
  ctx.fillStyle = '#64748b'
  ctx.font = '400 20px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  const noteLines = wrapCanvasText(
    ctx,
    'Valores en pesos colombianos (COP). Cotización informativa; no constituye factura ni compromiso hasta su aceptación formal.',
    contentWidth,
  )
  for (const line of noteLines) {
    ctx.fillText(line, padX, y)
    y += 28
  }

  y += 18
  ctx.font = '400 18px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  ctx.fillText(`Generado con ${APP_NAME}`, padX, y)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('No se pudo generar la imagen del presupuesto.'))
      },
      'image/png',
      0.95,
    )
  })
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

function openWhatsAppUrl(message: string, phone?: string): void {
  const normalized = phone ? normalizePhoneForWhatsApp(phone) : ''
  const url = normalized
    ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export type QuickBudgetWhatsAppResult = 'shared' | 'download-fallback' | false

/**
 * Comparte el presupuesto como imagen visual por WhatsApp.
 * En móvil suele abrir el selector de apps (WhatsApp) con la tarjeta adjunta.
 * En escritorio descarga la imagen y abre WhatsApp con un mensaje corto.
 */
export async function openQuickBudgetWhatsApp(
  input: QuickBudgetPrintInput,
  phone?: string,
): Promise<QuickBudgetWhatsAppResult> {
  if (!input.items.length) return false

  const message = buildQuickBudgetWhatsAppMessage(input)
  const imageBlob = await renderQuickBudgetShareImage(input)
  const fileName = `Presupuesto_${sanitizeFileNamePart(input.patientName)}.png`
  const file = new File([imageBlob], fileName, { type: 'image/png' })

  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean
  }

  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({
        files: [file],
        title: `Presupuesto — ${input.accountHolderName}`,
        text: message,
      })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'shared'
      }
      // Continúa al fallback de descarga + wa.me
    }
  }

  downloadBlob(imageBlob, fileName)
  openWhatsAppUrl(message, phone)
  return 'download-fallback'
}

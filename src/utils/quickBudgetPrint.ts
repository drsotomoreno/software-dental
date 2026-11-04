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

/** Mensaje legible para compartir el presupuesto por WhatsApp. */
export function buildQuickBudgetWhatsAppMessage(input: QuickBudgetPrintInput): string {
  const lines = input.items.map(
    (item, index) => `${index + 1}. ${item.concepto}: ${formatCOP(item.valor)}`,
  )
  const parts = [
    `*${input.accountHolderName}*`,
    'Presupuesto odontológico',
    '',
    `Paciente: ${input.patientName}`,
    `Identificación: ${input.patientDocument}`,
    '',
    '*Detalle*',
    ...lines,
    '',
    `*Total: ${formatCOP(input.total)}*`,
    '',
    '_Cotización informativa. Valores en COP._',
  ]
  return parts.join('\n')
}

/**
 * Abre WhatsApp con el presupuesto listo para enviar.
 * Si hay teléfono del paciente, lo preselecciona; si no, deja elegir el contacto.
 */
export function openQuickBudgetWhatsApp(
  input: QuickBudgetPrintInput,
  phone?: string,
): boolean {
  if (!input.items.length) return false
  const message = buildQuickBudgetWhatsAppMessage(input)
  const normalized = phone ? normalizePhoneForWhatsApp(phone) : ''
  const url = normalized
    ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

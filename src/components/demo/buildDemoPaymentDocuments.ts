import { formatCurrency } from '@/utils/crypto'
import { demoTreatmentTotal, type DemoFormData } from './demoTypes'

export type DemoPaymentDocumentKind = 'recibo_interno' | 'fev'

const DEMO_CLINIC = {
  name: 'Clínica Odontológica Demo — MiHistoriaDental',
  nit: '901.234.567-8',
  reps: '1100101234',
  address: 'Calle 100 # 19-61, Consultorio 502',
  city: 'Bogotá D.C.',
  phone: '(601) 555 0147',
  email: 'facturacion@mihistoriadental.com',
  resolution:
    'Autorización DIAN de facturación electrónica Nº 18760000001 del 15/01/2026 · Prefijo MHD · Del 1 al 5000',
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date)
}

function formatDateOnly(date: Date): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(date)
}

function buildFakeCufe(seed: string): string {
  const alphabet = 'ABCDEF0123456789'
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  let out = ''
  for (let i = 0; i < 96; i += 1) {
    hash = (hash * 1664525 + 1013904223) >>> 0
    out += alphabet[hash % alphabet.length]
  }
  return out
}

function sharedStyles(): string {
  return `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #e2e8f0;
      color: #0f172a;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      line-height: 1.45;
    }
    .page {
      max-width: 820px;
      margin: 20px auto;
      background: #fff;
      border: 1px solid #cbd5e1;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      padding: 36px 40px 28px;
    }
    .brand-bar {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: flex-start;
      border-bottom: 3px solid #0e7490;
      padding-bottom: 16px;
    }
    .brand-mark {
      width: 64px;
      height: 64px;
      border-radius: 12px;
      background: linear-gradient(145deg, #0891b2, #0e7490);
      color: #fff;
      display: grid;
      place-items: center;
      font-weight: 800;
      font-size: 18px;
      letter-spacing: 0.04em;
      flex-shrink: 0;
    }
    .clinic-name { margin: 0; font-size: 20px; color: #0f172a; }
    .clinic-meta { margin: 4px 0 0; font-size: 12px; color: #475569; }
    .doc-side { text-align: right; }
    .doc-title {
      margin: 0;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #0e7490;
    }
    .doc-number {
      margin: 6px 0 0;
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
    }
    .pill {
      display: inline-block;
      margin-top: 8px;
      padding: 3px 10px;
      border-radius: 999px;
      background: #ecfeff;
      color: #155e75;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid #a5f3fc;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 22px;
    }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 16px;
      background: #f8fafc;
    }
    .card h3 {
      margin: 0 0 8px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #64748b;
    }
    .card p { margin: 0 0 4px; font-size: 13px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 24px;
      font-size: 13px;
    }
    th {
      background: #0e7490;
      color: #fff;
      text-align: left;
      padding: 10px 12px;
      font-size: 11px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    td { padding: 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    .right { text-align: right; white-space: nowrap; }
    .totals {
      margin-top: 18px;
      margin-left: auto;
      width: 320px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      overflow: hidden;
    }
    .totals div {
      display: flex;
      justify-content: space-between;
      padding: 8px 14px;
      font-size: 13px;
      background: #fff;
    }
    .totals div + div { border-top: 1px solid #e2e8f0; }
    .totals .grand {
      background: #ecfeff;
      font-weight: 800;
      font-size: 15px;
      color: #0e7490;
    }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-top: 40px;
    }
    .sign-line {
      border-top: 1px solid #94a3b8;
      padding-top: 8px;
      font-size: 12px;
      color: #475569;
      text-align: center;
    }
    .cufe-box {
      margin-top: 22px;
      border: 1px dashed #94a3b8;
      border-radius: 10px;
      padding: 14px;
      background: #f8fafc;
      display: grid;
      grid-template-columns: 110px 1fr;
      gap: 14px;
      align-items: center;
    }
    .qr-fallback {
      width: 110px;
      height: 110px;
      border: 1px solid #cbd5e1;
      background:
        repeating-linear-gradient(0deg, #0f172a 0 4px, #fff 4px 8px),
        repeating-linear-gradient(90deg, #0f172a 0 4px, #fff 4px 8px);
      background-blend-mode: multiply;
      opacity: 0.85;
    }
    .qr-img { width: 110px; height: 110px; border: 1px solid #cbd5e1; }
    .cufe-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin: 0 0 6px; }
    .cufe-value { font-family: Consolas, "Courier New", monospace; font-size: 11px; word-break: break-all; margin: 0; color: #0f172a; }
    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #cbd5e1;
      font-size: 11px;
      color: #64748b;
    }
    .toolbar {
      max-width: 820px;
      margin: 16px auto 0;
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .toolbar button {
      border: 0;
      border-radius: 8px;
      padding: 10px 14px;
      font-weight: 700;
      cursor: pointer;
      background: #0e7490;
      color: #fff;
    }
    @media print {
      body { background: #fff; }
      .page { box-shadow: none; border: none; margin: 0; max-width: none; }
      .toolbar { display: none !important; }
    }
    @media (max-width: 720px) {
      .page { margin: 0; padding: 20px; }
      .brand-bar, .grid-2, .signatures, .cufe-box { grid-template-columns: 1fr; display: grid; }
      .doc-side { text-align: left; }
      .totals { width: 100%; }
    }
  `
}

export function buildDemoPaymentDocumentHtml(
  form: DemoFormData,
  kind: DemoPaymentDocumentKind,
  options?: { qrDataUrl?: string | null },
): string {
  const now = new Date()
  const patient = form.patientName.trim() || 'Paciente Demo'
  const procedure = form.treatmentRow!
  const payment = form.payment!
  const totalBudget = demoTreatmentTotal(procedure)
  const paid = payment.amount
  const remaining = Math.max(0, totalBudget - paid)
  const isReceipt = kind === 'recibo_interno'
  const sequence = now.getTime().toString().slice(-8)
  const number = isReceipt ? `RC-${sequence}` : `MHD${sequence}`
  const title = isReceipt
    ? 'Recibo de caja interno'
    : 'Factura electrónica de venta en salud'
  const cufe = buildFakeCufe(`${number}-${paid}-${procedure.cupsCode}`)
  const diagnosis =
    procedure.diagnosisCode != null
      ? `${procedure.diagnosisCode}${
          procedure.diagnosisDescription ? ` — ${procedure.diagnosisDescription}` : ''
        }${procedure.diagnosisToothNumber != null ? ` · Pieza ${procedure.diagnosisToothNumber}` : ''}`
      : '—'

  const cufeBlock = isReceipt
    ? ''
    : `<section class="cufe-box">
        ${
          options?.qrDataUrl
            ? `<img class="qr-img" alt="Código QR DIAN (simulación)" src="${escapeHtml(options.qrDataUrl)}" />`
            : '<div class="qr-fallback" aria-hidden="true"></div>'
        }
        <div>
          <p class="cufe-label">CUFE (simulación demo)</p>
          <p class="cufe-value">${escapeHtml(cufe)}</p>
          <p class="clinic-meta" style="margin-top:8px">Escanee el QR en la versión paga para validar el documento en el catálogo DIAN.</p>
        </div>
      </section>`

  const totalsBlock = isReceipt
    ? `<div class="totals">
        <div><span>Valor del procedimiento</span><span>${escapeHtml(formatCurrency(totalBudget))}</span></div>
        <div><span>Abono recibido</span><span>${escapeHtml(formatCurrency(paid))}</span></div>
        <div class="grand"><span>Saldo pendiente</span><span>${escapeHtml(formatCurrency(remaining))}</span></div>
      </div>`
    : `<div class="totals">
        <div><span>Subtotal</span><span>${escapeHtml(formatCurrency(paid))}</span></div>
        <div><span>Descuentos</span><span>${escapeHtml(formatCurrency(0))}</span></div>
        <div><span>IVA (servicios de salud exentos)</span><span>${escapeHtml(formatCurrency(0))}</span></div>
        <div class="grand"><span>Total a pagar</span><span>${escapeHtml(formatCurrency(paid))}</span></div>
      </div>`

  const signatures = isReceipt
    ? `<div class="signatures">
        <div class="sign-line">Cajero / recepción<br/>MiHistoriaDental Demo</div>
        <div class="sign-line">Paciente / acudiente<br/>${escapeHtml(patient)}</div>
      </div>`
    : `<div class="signatures">
        <div class="sign-line">Elaboró / facturador electrónico<br/>Sistema MiHistoriaDental</div>
        <div class="sign-line">Adquirente<br/>${escapeHtml(patient)}</div>
      </div>`

  const footer = isReceipt
    ? `<p class="footer">
        Documento interno de recaudo particular. No constituye Factura Electrónica de Venta ante la DIAN.
        Úselo cuando el paciente no exige FEV o la clínica opera bajo el régimen de no obligados a facturar electrónicamente
        (ingresos brutos inferiores a 3.500 UVT). Demo educativa — MiHistoriaDental.
      </p>`
    : `<p class="footer">
        ${escapeHtml(DEMO_CLINIC.resolution)}.<br/>
        Simulación de FEV-Salud conforme a la Resolución 000165 de 2023 (DIAN) y la Resolución 2275 de 2023 (MinSalud / FEV-RIPS).
        En la versión paga se genera XML UBL, CUFE real y transmisión al MUV. Demo educativa — no se reporta a la DIAN.
      </p>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — ${escapeHtml(number)}</title>
  <style>${sharedStyles()}</style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
  </div>
  <article class="page">
    <header class="brand-bar">
      <div style="display:flex;gap:14px;align-items:flex-start">
        <div class="brand-mark">MHD</div>
        <div>
          <h1 class="clinic-name">${escapeHtml(DEMO_CLINIC.name)}</h1>
          <p class="clinic-meta">NIT ${escapeHtml(DEMO_CLINIC.nit)} · REPS ${escapeHtml(DEMO_CLINIC.reps)}</p>
          <p class="clinic-meta">${escapeHtml(DEMO_CLINIC.address)} · ${escapeHtml(DEMO_CLINIC.city)}</p>
          <p class="clinic-meta">${escapeHtml(DEMO_CLINIC.phone)} · ${escapeHtml(DEMO_CLINIC.email)}</p>
        </div>
      </div>
      <div class="doc-side">
        <p class="doc-title">${escapeHtml(title)}</p>
        <p class="doc-number">${escapeHtml(number)}</p>
        <span class="pill">${isReceipt ? 'Uso interno · caja' : 'FEV-Salud · simulación'}</span>
        <p class="clinic-meta" style="margin-top:8px">${escapeHtml(formatDateTime(now))}</p>
      </div>
    </header>

    <div class="grid-2">
      <section class="card">
        <h3>${isReceipt ? 'Recibido de' : 'Adquirente / paciente'}</h3>
        <p><strong>${escapeHtml(patient)}</strong></p>
        <p>Documento: CC demo · Particular</p>
        <p>Fecha de atención: ${escapeHtml(formatDateOnly(now))}</p>
      </section>
      <section class="card">
        <h3>${isReceipt ? 'Detalle del abono' : 'Condiciones de la factura'}</h3>
        <p>Medio de pago: <strong>${escapeHtml(payment.method)}</strong></p>
        <p>Observación: ${escapeHtml(payment.note || 'Abono registrado en recepción')}</p>
        <p>Diagnóstico vinculado: ${escapeHtml(diagnosis)}</p>
      </section>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:90px">CUPS</th>
          <th>Descripción del servicio</th>
          <th class="right" style="width:70px">Cant.</th>
          <th class="right" style="width:120px">Valor unitario</th>
          <th class="right" style="width:120px">${isReceipt ? 'Valor' : 'Valor facturado'}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(procedure.cupsCode)}</td>
          <td>${escapeHtml(procedure.procedureName)}</td>
          <td class="right">${procedure.quantity}</td>
          <td class="right">${escapeHtml(formatCurrency(procedure.unitCost))}</td>
          <td class="right">${escapeHtml(formatCurrency(isReceipt ? totalBudget : paid))}</td>
        </tr>
      </tbody>
    </table>

    ${totalsBlock}
    ${cufeBlock}
    ${signatures}
    ${footer}
  </article>
</body>
</html>`
}

/** Abre el documento en pestaña nueva vía Blob (sin noopener, que devolvía null). */
export function openDemoPaymentDocument(
  form: DemoFormData,
  kind: DemoPaymentDocumentKind,
  options?: { qrDataUrl?: string | null },
): { ok: true; url: string } | { ok: false; error: string } {
  if (!form.payment) {
    return { ok: false, error: 'Guarde un abono antes de generar el documento.' }
  }
  if (!form.treatmentRow) {
    return {
      ok: false,
      error: 'Defina un procedimiento en el Paso 5 antes de generar el documento.',
    }
  }

  const html = buildDemoPaymentDocumentHtml(form, kind, options)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const popup = window.open(url, '_blank')
  if (!popup) {
    URL.revokeObjectURL(url)
    return {
      ok: false,
      error: 'No se pudo abrir la pestaña. Use la vista previa en esta página.',
    }
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return { ok: true, url }
}

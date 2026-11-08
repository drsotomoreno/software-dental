import { formatCurrency } from '@/utils/crypto'
import { demoTreatmentTotal, type DemoFormData } from './demoTypes'

export type DemoPaymentDocumentKind = 'recibo_interno' | 'fev'

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

function buildDocumentHtml(form: DemoFormData, kind: DemoPaymentDocumentKind): string {
  const now = new Date()
  const patient = form.patientName.trim() || 'Paciente demo'
  const procedure = form.treatmentRow
  const payment = form.payment
  const totalBudget = procedure ? demoTreatmentTotal(procedure) : 0
  const paid = payment?.amount ?? 0
  const remaining = Math.max(0, totalBudget - paid)
  const isReceipt = kind === 'recibo_interno'
  const title = isReceipt
    ? 'Recibo interno de caja'
    : 'Factura Electrónica de Venta (simulación)'
  const number = isReceipt
    ? `RC-DEMO-${now.getTime().toString().slice(-8)}`
    : `FEV-DEMO-${now.getTime().toString().slice(-8)}`
  const subtitle = isReceipt
    ? 'Documento interno de la clínica · no es factura electrónica DIAN'
    : 'Simulación educativa · no se transmite a la DIAN en esta demo'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} — ${escapeHtml(number)}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; color: #0f172a; margin: 0; background: #f8fafc; }
    .sheet { max-width: 720px; margin: 24px auto; background: #fff; border: 1px solid #cbd5e1; padding: 32px; }
    h1 { margin: 0 0 4px; font-size: 22px; color: #0369a1; }
    .muted { color: #64748b; font-size: 13px; }
    .badge { display: inline-block; margin-top: 8px; padding: 4px 10px; border-radius: 999px; background: #e0f2fe; color: #075985; font-size: 12px; font-weight: 700; }
    .meta { margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 14px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 8px; text-align: left; }
    th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
    .amount { text-align: right; white-space: nowrap; }
    .totals { margin-top: 20px; margin-left: auto; width: 280px; font-size: 14px; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .totals .strong { font-weight: 700; font-size: 16px; border-top: 1px solid #cbd5e1; margin-top: 6px; padding-top: 8px; }
    .footer { margin-top: 28px; padding-top: 12px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #64748b; }
    @media print { body { background: #fff; } .sheet { border: none; margin: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="sheet">
    <p class="muted">MiHistoriaDental · versión de prueba reducida</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="muted">${escapeHtml(subtitle)}</p>
    <span class="badge">${escapeHtml(number)}</span>

    <div class="meta">
      <div><strong>Paciente</strong><br/>${escapeHtml(patient)}</div>
      <div><strong>Fecha</strong><br/>${escapeHtml(formatDateTime(now))}</div>
      <div><strong>Medio de pago</strong><br/>${escapeHtml(payment?.method || '—')}</div>
      <div><strong>Observación</strong><br/>${escapeHtml(payment?.note || '—')}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th>CUPS</th>
          <th>Concepto</th>
          <th class="amount">Cant.</th>
          <th class="amount">Unitario</th>
          <th class="amount">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(procedure?.cupsCode || '—')}</td>
          <td>${escapeHtml(procedure?.procedureName || 'Procedimiento no definido')}</td>
          <td class="amount">${procedure?.quantity ?? '—'}</td>
          <td class="amount">${escapeHtml(formatCurrency(procedure?.unitCost ?? 0))}</td>
          <td class="amount">${escapeHtml(formatCurrency(totalBudget))}</td>
        </tr>
      </tbody>
    </table>

    <div class="totals">
      <div><span>Presupuesto</span><span>${escapeHtml(formatCurrency(totalBudget))}</span></div>
      <div><span>${isReceipt ? 'Abono en este recibo' : 'Valor facturado (abono)'}</span><span>${escapeHtml(formatCurrency(paid))}</span></div>
      <div class="strong"><span>Saldo</span><span>${escapeHtml(formatCurrency(remaining))}</span></div>
    </div>

    ${
      isReceipt
        ? '<p class="footer">Este recibo acredita el abono registrado en caja. No sustituye una Factura Electrónica de Venta ante la DIAN.</p>'
        : '<p class="footer">Simulación de FEV-Salud (Res. 2275). En la versión paga se emite el XML/CUFE y se puede transmitir con RIPS al MUV.</p>'
    }

    <p class="no-print muted" style="margin-top:20px">
      <button onclick="window.print()" style="padding:8px 14px;border-radius:8px;border:1px solid #0284c7;background:#0284c7;color:#fff;cursor:pointer">
        Imprimir / Guardar PDF
      </button>
    </p>
  </div>
</body>
</html>`
}

/** Abre una ventana con el recibo interno o la FEV simulada de la demo. */
export function openDemoPaymentDocument(
  form: DemoFormData,
  kind: DemoPaymentDocumentKind,
): { ok: true } | { ok: false; error: string } {
  if (!form.payment) {
    return { ok: false, error: 'Guarde un abono antes de generar el documento.' }
  }
  if (!form.treatmentRow) {
    return {
      ok: false,
      error: 'Defina un procedimiento en el Paso 5 antes de generar el documento.',
    }
  }

  const html = buildDocumentHtml(form, kind)
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=820,height=900')
  if (!popup) {
    return {
      ok: false,
      error: 'El navegador bloqueó la ventana emergente. Permita pop-ups para ver el documento.',
    }
  }
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  popup.focus()
  return { ok: true }
}

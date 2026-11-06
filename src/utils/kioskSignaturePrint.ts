/** Bloque de firma del paciente o acudiente en la impresión de historia clínica. */

export interface KioskSignaturePrintInput {
  heading: string
  signatureDataUrl?: string | null
  signerName?: string | null
  signerDocument?: string | null
  signedAtLabel?: string | null
  ipAddress?: string | null
  kioskDeviceId?: string | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function safeImageSrc(value: string): string {
  const raw = value.trim()
  if (!raw.startsWith('data:image/')) return ''
  return raw.replace(/"/g, '')
}

export function renderKioskSignatureBlock(input: KioskSignaturePrintInput): string {
  const image = safeImageSrc(input.signatureDataUrl || '')
  const heading = escapeHtml(input.heading)
  if (!image) {
    return `<div class="signature-box"><p>${heading}</p><p><strong>Pendiente de firma digital</strong></p></div>`
  }

  const trace = [
    input.ipAddress?.trim() ? `IP: ${escapeHtml(input.ipAddress.trim())}` : '',
    input.kioskDeviceId?.trim() ? `Tableta: ${escapeHtml(input.kioskDeviceId.trim())}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return `<div class="signature-box">
    <p>${heading}</p>
    <img src="${image}" alt="${heading}" />
    <p>${escapeHtml(input.signerName?.trim() || '—')}</p>
    <p>Documento: ${escapeHtml(input.signerDocument?.trim() || '—')}</p>
    <p>Estampado digital: ${escapeHtml(input.signedAtLabel?.trim() || '—')}</p>
    ${trace ? `<p>${trace}</p>` : ''}
  </div>`
}

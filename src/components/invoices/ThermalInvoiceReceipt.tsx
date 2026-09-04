import { useEffect, useState } from 'react'
import type { ThermalInvoiceReceiptData } from '@/utils/thermalInvoicePrint'
import {
  abbreviateCufe,
  generateDianQrDataUrl,
} from '@/utils/thermalInvoicePrint'
import { formatCurrency, formatDate } from '@/utils/crypto'
import { formatRepsCodeDisplay } from '@/utils/repsCode'
import '@/styles/thermal-80mm.css'

interface ThermalInvoiceReceiptProps {
  data: ThermalInvoiceReceiptData
  className?: string
}

export function ThermalInvoiceReceipt({ data, className = '' }: ThermalInvoiceReceiptProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!data.isElectronic || !data.cufe?.trim()) {
      setQrDataUrl(null)
      return
    }

    generateDianQrDataUrl(data.cufe)
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })

    return () => {
      cancelled = true
    }
  }, [data.cufe, data.isElectronic])

  const providerContact = [data.provider.address, data.provider.phone, data.provider.city]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={`thermal-preview-shell ${className}`.trim()}>
      <article className="thermal-receipt" aria-label="Vista previa ticket 80 mm">
        <header className="thermal-header">
          <h1 className="thermal-header__name">{data.provider.businessName}</h1>
          <p className="thermal-header__meta">
            NIT {data.provider.nitWithDv} · REPS {formatRepsCodeDisplay(data.provider.repsCode)}
          </p>
          {providerContact ? <p className="thermal-header__meta">{providerContact}</p> : null}
        </header>

        <hr className="thermal-divider" />

        <p className="thermal-invoice-meta">
          <strong>{data.documentTitle || (data.isElectronic ? 'FEV-Salud' : 'Recibo de Caja')}</strong>
          <br />
          {data.invoiceNumber} · {formatDate(data.issueDate)}
        </p>

        <section>
          <p className="thermal-section-title">Paciente</p>
          <p className="thermal-field">
            <strong>Paciente:</strong> {data.patient.name}
          </p>
          <p className="thermal-field">
            <strong>Documento:</strong> {data.patient.document}
          </p>
          <p className="thermal-field">
            <strong>Tipo usuario:</strong> {data.patient.userType}
          </p>
          {data.patient.attentionDate ? (
            <p className="thermal-field">
              <strong>Fecha atención:</strong> {formatDate(data.patient.attentionDate)}
            </p>
          ) : null}
        </section>

        <hr className="thermal-divider" />

        <table className="thermal-services">
          <thead>
            <tr>
              <th className="col-qty">Cant</th>
              <th className="col-concept">Concepto / CUPS</th>
              <th className="col-total">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line, index) => (
              <tr
                key={`${line.concept}-${index}`}
                className={[line.isCustom ? 'line-custom' : '', line.isZero ? 'line-zero' : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <td className="col-qty">{line.quantity}</td>
                <td className="col-concept">{line.concept}</td>
                <td className="col-total">{formatCurrency(line.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="thermal-totals">
          <div className="thermal-totals__row">
            <span>Subtotal</span>
            <span>{formatCurrency(data.totals.subtotal)}</span>
          </div>
          <div className="thermal-totals__row">
            <span>Descuentos</span>
            <span>{formatCurrency(data.totals.discounts)}</span>
          </div>
          <div className="thermal-totals__row">
            <span>IVA excluido</span>
            <span>{formatCurrency(data.totals.iva ?? 0)}</span>
          </div>
          <div className="thermal-totals__row">
            <span>Copago / Cuota mod.</span>
            <span>{formatCurrency(data.totals.copay)}</span>
          </div>
          <div className="thermal-totals__row thermal-totals__row--net">
            <span>TOTAL NETO</span>
            <span>{formatCurrency(data.totals.netTotal)}</span>
          </div>
        </section>

        <hr className="thermal-divider" />
        <footer className="thermal-footer">
          {data.isElectronic ? (
            <>
              <p className="thermal-cuv">
                <strong>CUV MinSalud:</strong>
                <br />
                {data.cuv || 'Pendiente'}
              </p>
              <p className="thermal-cufe">
                <strong>CUFE:</strong>{' '}
                {data.cufe ? abbreviateCufe(data.cufe) : 'Pendiente de emisión DIAN'}
              </p>
              <div className="thermal-qr-wrap">
                {qrDataUrl ? (
                  <img
                    className="thermal-qr"
                    src={qrDataUrl}
                    width={110}
                    height={110}
                    alt="Código QR DIAN"
                  />
                ) : (
                  <div className="thermal-qr-placeholder">
                    QR DIAN disponible tras emisión con CUFE
                  </div>
                )}
              </div>
            </>
          ) : null}
          {data.ripsSummary ? <p className="thermal-resolution">{data.ripsSummary}</p> : null}
          <p className="thermal-resolution">{data.resolutionLegend}</p>
          {data.legalNotice ? <p className="thermal-resolution">{data.legalNotice}</p> : null}
        </footer>
      </article>
    </div>
  )
}

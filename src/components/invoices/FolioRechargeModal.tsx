import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { FolioPack, FolioPaymentGateway } from '@/types/billingModality'
import { FOLIO_PACKS, FOLIO_PAYMENT_GATEWAYS } from '@/types/billingModality'
import { creditElectronicFolios } from '@/services/billingModalityService'
import { formatCurrency } from '@/utils'

interface FolioRechargeModalProps {
  open: boolean
  onClose: () => void
  onPurchased?: (invoicesAdded: number) => void
}

export function FolioRechargeModal({ open, onClose, onPurchased }: FolioRechargeModalProps) {
  const [packId, setPackId] = useState<FolioPack['id']>('profesional')
  const [gateway, setGateway] = useState<FolioPaymentGateway>('wompi')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (open) {
      setDone(false)
      setBusy(false)
    }
  }, [open])

  if (!open) return null

  const pack = FOLIO_PACKS.find((item) => item.id === packId) ?? FOLIO_PACKS[1]

  const handlePay = async () => {
    setBusy(true)
    await new Promise((resolve) => window.setTimeout(resolve, 900))
    creditElectronicFolios(pack.invoices)
    setBusy(false)
    setDone(true)
    onPurchased?.(pack.invoices)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="folio-recharge-title"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 id="folio-recharge-title" className="text-lg font-bold text-slate-900">
              Recargar paquete de facturas
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Pague con Wompi, Mercado Pago o Nequi. Los folios se acreditan al instante en este
              equipo.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="space-y-4">
            <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
              Pago aprobado. Se acreditaron {pack.invoices} facturas electrónicas a su saldo.
            </p>
            <button type="button" className="btn-primary w-full" onClick={onClose}>
              Listo
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3">
              {FOLIO_PACKS.map((item) => (
                <label
                  key={item.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 ${
                    packId === item.id
                      ? 'border-dental-500 bg-dental-50 ring-2 ring-dental-200'
                      : 'border-slate-200 hover:border-dental-200'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="folio-pack"
                      checked={packId === item.id}
                      onChange={() => setPackId(item.id)}
                    />
                    <span>
                      <span className="block font-semibold text-slate-900">{item.name}</span>
                      <span className="text-sm text-slate-600">{item.invoices} facturas</span>
                    </span>
                  </span>
                  <span className="font-bold text-slate-900">{formatCurrency(item.priceCop)}</span>
                </label>
              ))}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Pagar con</p>
              <div className="flex flex-wrap gap-2">
                {FOLIO_PAYMENT_GATEWAYS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setGateway(item.id)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${
                      gateway === item.id
                        ? 'bg-dental-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn-primary w-full"
              disabled={busy}
              onClick={() => void handlePay()}
            >
              {busy
                ? 'Procesando pago…'
                : `Pagar ${formatCurrency(pack.priceCop)} con ${
                    FOLIO_PAYMENT_GATEWAYS.find((item) => item.id === gateway)?.label
                  }`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

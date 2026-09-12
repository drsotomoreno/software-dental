import { Wallet } from 'lucide-react'
import { CHECKOUT_FOLIO_DEPLETED_MESSAGE } from '@/types/consultationCheckout'

interface FolioDepletedModalProps {
  open: boolean
  onClose: () => void
  onRecharge: () => void
}

export function FolioDepletedModal({ open, onClose, onRecharge }: FolioDepletedModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="folio-depleted-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h3 id="folio-depleted-title" className="text-lg font-bold text-slate-900">
          {CHECKOUT_FOLIO_DEPLETED_MESSAGE}
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Puede seguir emitiendo Recibos de Caja internos sin costo. Para Factura Electrónica DIAN
          recargue un paquete de folios.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            Usar recibo interno
          </button>
          <button type="button" className="btn-primary inline-flex flex-1 items-center justify-center gap-2" onClick={onRecharge}>
            <Wallet className="h-4 w-4" aria-hidden />
            Recargar Paquete
          </button>
        </div>
      </div>
    </div>
  )
}

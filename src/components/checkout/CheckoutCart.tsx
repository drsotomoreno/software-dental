import { formatCurrency } from '@/utils'
import type { CheckoutLineItem } from '@/types/consultationCheckout'
import { LegalTooltip } from '@/components/ui/LegalTooltip'

interface CheckoutCartProps {
  cart: CheckoutLineItem[]
  disabled?: boolean
  onRemove: (id: string) => void
  onAddAesthetic: () => void
}

export function CheckoutCart({ cart, disabled, onRemove, onAddAesthetic }: CheckoutCartProps) {
  const total = cart.reduce((sum, item) => sum + item.totalAmount, 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">Carrito de la consulta</p>
        {!disabled && (
          <button type="button" className="text-xs font-semibold text-dental-700 hover:text-dental-900" onClick={onAddAesthetic}>
            + Agregar Servicio Estético/Insumo
          </button>
        )}
      </div>

      {cart.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          No hay procedimientos de esta consulta. Agregue un servicio estético o registre la
          evolución con CUPS.
        </p>
      ) : (
        <ul className="space-y-2">
          {cart.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{item.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                  {item.kind === 'cups' ? (
                    <>
                      CUPS {item.cupsCode}
                      <LegalTooltip topic="cups" />
                      · RIPS procedimientos
                    </>
                  ) : (
                    <>
                      Sin CUPS · DIAN nombre literal · RIPS Otros Servicios
                      <LegalTooltip topic="rips" />
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-800">
                  {formatCurrency(item.totalAmount)}
                </span>
                {!disabled && (
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:text-red-800"
                    onClick={() => onRemove(item.id)}
                  >
                    Quitar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-right text-sm font-semibold text-slate-900">
        Total a cobrar: {formatCurrency(total)}
      </p>
    </div>
  )
}

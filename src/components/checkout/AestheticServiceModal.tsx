import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

export interface AestheticServiceFormValues {
  name: string
  unitPrice: number
}

interface AestheticServiceModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (values: AestheticServiceFormValues) => void
}

const INITIAL: AestheticServiceFormValues = { name: '', unitPrice: 0 }

export function AestheticServiceModal({ open, onClose, onSubmit }: AestheticServiceModalProps) {
  const [form, setForm] = useState(INITIAL)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(INITIAL)
      setError(null)
    }
  }, [open])

  if (!open) return null

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) {
      setError('Escriba el nombre literal que verá el paciente y la DIAN (ej. Joyería dental).')
      return
    }
    onSubmit({ name, unitPrice: Math.max(0, form.unitPrice) })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="aesthetic-service-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 id="aesthetic-service-title" className="text-lg font-bold text-slate-900">
              Servicio estético o insumo
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              No tiene código MinSalud (CUPS). La DIAN recibe el nombre que usted escriba; el RIPS
              lo clasifica como Otros Servicios para evitar rechazos del MUV.
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="label-field">Nombre (tal como sale en la factura)</span>
            <input
              className="input-field"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ej. Joyería dental, cepillo, blanqueamiento estético"
              autoFocus
            />
          </label>
          <label className="block text-sm">
            <span className="label-field">Valor (COP)</span>
            <input
              className="input-field"
              type="number"
              min={0}
              step={1000}
              value={form.unitPrice || ''}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  unitPrice: Number(event.target.value) || 0,
                }))
              }
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary flex-1">
              Agregar al carrito
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

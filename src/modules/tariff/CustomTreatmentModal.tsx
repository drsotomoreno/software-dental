import { useEffect, useState } from 'react'

export interface CustomTreatmentFormValues {
  name: string
  category: string
  price: number
}

interface CustomTreatmentModalProps {
  open: boolean
  mode?: 'create' | 'edit'
  editCode?: string
  initialValues?: CustomTreatmentFormValues
  onClose: () => void
  onSubmit: (values: CustomTreatmentFormValues) => Promise<void>
}

const INITIAL: CustomTreatmentFormValues = {
  name: '',
  category: 'Personalizado',
  price: 0,
}

export function CustomTreatmentModal({
  open,
  mode = 'create',
  editCode,
  initialValues,
  onClose,
  onSubmit,
}: CustomTreatmentModalProps) {
  const [form, setForm] = useState<CustomTreatmentFormValues>(INITIAL)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const isEdit = mode === 'edit'

  useEffect(() => {
    if (open) {
      setForm(initialValues ?? INITIAL)
      setError(null)
    }
  }, [open, initialValues])

  if (!open) return null

  const handleClose = () => {
    if (saving) return
    setForm(INITIAL)
    setError(null)
    onClose()
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!form.name.trim()) {
      setError('Indique el nombre del tratamiento.')
      return
    }

    setSaving(true)
    try {
      await onSubmit({
        name: form.name.trim(),
        category: form.category.trim() || 'Personalizado',
        price: Math.max(0, form.price),
      })
      setForm(INITIAL)
      onClose()
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : isEdit
            ? 'No se pudo actualizar el tratamiento personalizado.'
            : 'No se pudo guardar el tratamiento personalizado.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm dark:bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-treatment-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2
          id="custom-treatment-title"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          {isEdit ? 'Editar tratamiento personalizado' : 'Nuevo tratamiento personalizado'}
        </h2>
        {isEdit && editCode ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Código interno: <span className="font-mono">{editCode}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Se asignará un código interno con prefijo <span className="font-mono">CUSTOM_</span>.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="label-field" htmlFor="custom-name">
              Nombre del servicio
            </label>
            <input
              id="custom-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej. Carillas 3D, Alineadores..."
              className="input-field"
              autoFocus
              disabled={saving}
            />
          </div>

          <div>
            <label className="label-field" htmlFor="custom-category">
              Categoría
            </label>
            <input
              id="custom-category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="input-field"
              disabled={saving}
            />
          </div>

          <div>
            <label className="label-field" htmlFor="custom-price">
              Precio (COP)
            </label>
            <input
              id="custom-price"
              type="number"
              min={0}
              step={1000}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
              className="input-field"
              disabled={saving}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={handleClose} className="btn-secondary" disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear tratamiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

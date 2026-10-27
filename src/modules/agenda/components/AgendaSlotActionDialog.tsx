import { useState, type FormEvent } from 'react'

interface AgendaSlotActionDialogProps {
  title: string
  description: string
  label: string
  initialValue?: string
  placeholder?: string
  confirmLabel: string
  required?: boolean
  onClose: () => void
  onConfirm: (value: string) => Promise<void>
}

/** Diálogo breve para bloquear horas o guardar una nota desde el menú de la agenda. */
export function AgendaSlotActionDialog({
  title,
  description,
  label,
  initialValue = '',
  placeholder,
  confirmLabel,
  required = false,
  onClose,
  onConfirm,
}: AgendaSlotActionDialogProps) {
  const [value, setValue] = useState(initialValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (required && !value.trim()) {
      setError('Escriba el texto para continuar.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onConfirm(value.trim())
      onClose()
    } catch {
      setError('No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" role="dialog" aria-label={title}>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
        <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 space-y-3">
          <label className="label-field" htmlFor="agenda-slot-action-text">
            {label}
          </label>
          <textarea
            id="agenda-slot-action-text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            rows={3}
            className="input-field resize-y"
            autoFocus
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Guardando...' : confirmLabel}
            </button>
            <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

interface MissingFieldsAlertProps {
  errors: string[]
  onClose: () => void
}

export function MissingFieldsAlert({ errors, onClose }: MissingFieldsAlertProps) {
  useEffect(() => {
    if (errors.length === 0) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [errors.length, onClose])

  if (errors.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="missing-fields-alert-title"
        aria-describedby="missing-fields-alert-description"
        className="w-full max-w-md rounded-2xl border border-amber-300 bg-amber-50 p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h3 id="missing-fields-alert-title" className="text-base font-semibold text-amber-950">
              No se puede cerrar la atención
            </h3>
            <p id="missing-fields-alert-description" className="mt-1 text-sm leading-relaxed text-amber-900">
              La atención no se puede cerrar hasta completar los siguientes puntos:
            </p>
          </div>
        </div>

        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-amber-950">
          {errors.map((error, index) => (
            <li key={`${index}-${error}`}>{error}</li>
          ))}
        </ul>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="inline-flex items-center justify-center rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

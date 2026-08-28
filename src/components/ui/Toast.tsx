interface ToastProps {
  message: string | null
  onDismiss?: () => void
}

export function Toast({ message, onDismiss }: ToastProps) {
  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-900 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-base" aria-hidden>
          ✓
        </span>
        <p className="flex-1">{message}</p>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-teal-700 hover:text-teal-900"
            aria-label="Cerrar notificación"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

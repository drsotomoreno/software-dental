export type ToastVariant = 'success' | 'error'

interface ToastProps {
  message: string | null
  variant?: ToastVariant
  onDismiss?: () => void
}

const VARIANT_STYLES: Record<
  ToastVariant,
  { box: string; button: string; icon: string; role: 'status' | 'alert'; live: 'polite' | 'assertive' }
> = {
  success: {
    box: 'border-teal-200 bg-teal-50 text-teal-900',
    button: 'text-teal-700 hover:text-teal-900',
    icon: '✓',
    role: 'status',
    live: 'polite',
  },
  error: {
    box: 'border-red-200 bg-red-50 text-red-800',
    button: 'text-red-700 hover:text-red-900',
    icon: '!',
    role: 'alert',
    live: 'assertive',
  },
}

export function Toast({ message, variant = 'success', onDismiss }: ToastProps) {
  if (!message) return null

  const styles = VARIANT_STYLES[variant]

  return (
    <div
      role={styles.role}
      aria-live={styles.live}
      className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${styles.box}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-base" aria-hidden>
          {styles.icon}
        </span>
        <p className="flex-1">{message}</p>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={styles.button}
            aria-label="Cerrar notificación"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

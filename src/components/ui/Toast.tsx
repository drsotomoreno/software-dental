import type { GlobalToastVariant } from '@/services/globalToast'

interface ToastProps {
  message: string | null
  onDismiss?: () => void
  variant?: GlobalToastVariant
}

const VARIANT_STYLES: Record<
  GlobalToastVariant,
  { box: string; icon: string; dismiss: string; glyph: string }
> = {
  success: {
    box: 'border-teal-200 bg-teal-50 text-teal-900',
    icon: 'text-teal-700',
    dismiss: 'text-teal-700 hover:text-teal-900',
    glyph: '✓',
  },
  warning: {
    box: 'border-amber-200 bg-amber-50 text-amber-950',
    icon: 'text-amber-700',
    dismiss: 'text-amber-800 hover:text-amber-950',
    glyph: '!',
  },
  error: {
    box: 'border-red-200 bg-red-50 text-red-900',
    icon: 'text-red-700',
    dismiss: 'text-red-700 hover:text-red-900',
    glyph: '×',
  },
}

export function Toast({ message, onDismiss, variant = 'success' }: ToastProps) {
  if (!message) return null
  const styles = VARIANT_STYLES[variant] ?? VARIANT_STYLES.success

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${styles.box}`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 text-base ${styles.icon}`} aria-hidden>
          {styles.glyph}
        </span>
        <p className="flex-1">{message}</p>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={styles.dismiss}
            aria-label="Cerrar notificación"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

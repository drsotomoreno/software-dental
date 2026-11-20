import type { GlobalToastVariant } from '@/services/globalToast'

interface ToastProps {
  message: string | null
  onDismiss?: () => void
  variant?: GlobalToastVariant
  actionLabel?: string | null
  onAction?: () => void
  actionBusy?: boolean
}

const VARIANT_STYLES: Record<
  GlobalToastVariant,
  { box: string; icon: string; dismiss: string; glyph: string; action: string }
> = {
  success: {
    box: 'border-teal-200 bg-teal-50 text-teal-900',
    icon: 'text-teal-700',
    dismiss: 'text-teal-700 hover:text-teal-900',
    glyph: '✓',
    action: 'bg-teal-700 text-white hover:bg-teal-800',
  },
  warning: {
    box: 'border-amber-200 bg-amber-50 text-amber-950',
    icon: 'text-amber-700',
    dismiss: 'text-amber-800 hover:text-amber-950',
    glyph: '!',
    action: 'bg-sky-700 text-white hover:bg-sky-800',
  },
  error: {
    box: 'border-red-200 bg-red-50 text-red-900',
    icon: 'text-red-700',
    dismiss: 'text-red-700 hover:text-red-900',
    glyph: '×',
    action: 'bg-red-700 text-white hover:bg-red-800',
  },
}

export function Toast({
  message,
  onDismiss,
  variant = 'success',
  actionLabel = null,
  onAction,
  actionBusy = false,
}: ToastProps) {
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
        <div className="flex-1 space-y-2">
          <p>{message}</p>
          {actionLabel && onAction ? (
            <button
              type="button"
              className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${styles.action}`}
              onClick={onAction}
              disabled={actionBusy}
            >
              {actionBusy ? 'Abriendo Google…' : actionLabel}
            </button>
          ) : null}
        </div>
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

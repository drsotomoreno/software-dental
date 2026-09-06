import { type ReactNode, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface DiagnosticViewerShellProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function DiagnosticViewerShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: DiagnosticViewerShellProps) {
  const startY = useRef<number | null>(null)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-slate-950 text-white"
      onPointerDown={(event) => {
        if (event.clientY < 72) startY.current = event.clientY
        else startY.current = null
      }}
      onPointerUp={(event) => {
        if (startY.current != null && event.clientY - startY.current > 90) onClose()
        startY.current = null
      }}
    >
      <header className="flex items-center justify-between gap-3 px-3 py-2 sm:px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          {subtitle ? <p className="truncate text-[11px] text-slate-400">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/10 p-2 hover:bg-white/20"
          aria-label="Cerrar visor"
        >
          <X className="h-5 w-5" />
        </button>
      </header>
      <div className="relative min-h-0 flex-1 touch-none">{children}</div>
      {footer ? <div className="border-t border-white/10 px-3 py-2 sm:px-4">{footer}</div> : null}
    </div>
  )
}

import { Download, Eye, Globe, X } from 'lucide-react'
import type { DiagnosticAid } from '@/types/diagnosticAid'
import {
  getWebOpenActions,
  type DiagnosticAidWebAction,
} from '@/services/diagnosticAidWebOpenService'

const ACTION_ICONS = {
  globe: Globe,
  download: Download,
  eye: Eye,
} as const

interface DiagnosticAidOpenMenuProps {
  item: DiagnosticAid
  open: boolean
  busy?: boolean
  onClose: () => void
  onSelect: (action: DiagnosticAidWebAction) => void
}

export function DiagnosticAidOpenMenu({
  item,
  open,
  busy = false,
  onClose,
  onSelect,
}: DiagnosticAidOpenMenuProps) {
  if (!open) return null

  const actions = getWebOpenActions(item)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Cerrar menú"
        onClick={onClose}
      />
      <div
        role="menu"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Abrir archivo</p>
            <p className="truncate text-xs text-slate-500" title={item.fileName}>
              {item.fileName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1 p-2">
          {actions.map((action) => {
            const Icon = ACTION_ICONS[action.icon]
            return (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                disabled={busy || action.disabled}
                onClick={() => onSelect(action.id)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    action.icon === 'globe'
                      ? 'bg-sky-100 text-sky-700'
                      : action.icon === 'eye'
                        ? 'bg-violet-100 text-violet-700'
                        : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="font-medium text-slate-800">{action.label}</span>
              </button>
            )
          })}
        </div>

        <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
          Los visores online abren en una pestaña nueva. La descarga permite usar software local
          (Medit, exocad, RadiAnt, Romexis, etc.).
        </p>
      </div>
    </div>
  )
}

interface DiagnosticAidPreviewModalProps {
  open: boolean
  fileName: string
  previewUrl: string | null
  previewKind: 'image' | 'pdf'
  onClose: () => void
}

export function DiagnosticAidPreviewModal({
  open,
  fileName,
  previewUrl,
  previewKind,
  onClose,
}: DiagnosticAidPreviewModalProps) {
  if (!open || !previewUrl) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <p className="truncate text-sm font-semibold text-slate-900">{fileName}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Cerrar vista previa"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-slate-100 p-4">
          {previewKind === 'pdf' ? (
            <iframe
              title={fileName}
              src={previewUrl}
              className="h-[75vh] w-full rounded-lg border border-slate-200 bg-white"
            />
          ) : (
            <img
              src={previewUrl}
              alt={fileName}
              className="mx-auto max-h-[75vh] max-w-full rounded-lg object-contain shadow"
            />
          )}
        </div>
      </div>
    </div>
  )
}

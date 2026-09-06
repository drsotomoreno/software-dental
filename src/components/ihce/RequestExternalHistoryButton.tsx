import { CloudDownload } from 'lucide-react'

interface RequestExternalHistoryButtonProps {
  onClick: () => void
  disabled?: boolean
}

export function RequestExternalHistoryButton({
  onClick,
  disabled = false,
}: RequestExternalHistoryButtonProps) {
  return (
    <button
      type="button"
      className="btn-secondary inline-flex items-center gap-2 text-sm"
      onClick={onClick}
      disabled={disabled}
    >
      <CloudDownload className="h-4 w-4" aria-hidden />
      Solicitar Historial Externo (RDA)
    </button>
  )
}

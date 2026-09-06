import { useEffect, useState } from 'react'
import { DiagnosticViewerShell } from '@/viewers/DiagnosticViewerShell'

interface Mesh3dViewerProps {
  src: string
  fileName: string
  poster?: string | null
  onClose: () => void
}

export function Mesh3dViewer({ src, fileName, poster, onClose }: Mesh3dViewerProps) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('@google/model-viewer')
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar el visor 3D.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <DiagnosticViewerShell
      title={fileName}
      subtitle="Arrastre para orbitar · pellizque para zoom"
      onClose={onClose}
    >
      {error ? (
        <p className="p-6 text-sm text-red-200">{error}</p>
      ) : !ready ? (
        <p className="p-6 text-sm text-slate-300">Cargando visor 3D…</p>
      ) : (
        <model-viewer
          src={src}
          poster={poster ?? undefined}
          alt={fileName}
          camera-controls
          touch-action="pan-y"
          shadow-intensity="0.35"
          exposure="0.95"
          interaction-prompt="none"
          style={{ width: '100%', height: '100%', background: '#020617' }}
        />
      )}
    </DiagnosticViewerShell>
  )
}

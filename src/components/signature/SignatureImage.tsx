import { useEffect, useState, type CSSProperties } from 'react'
import { loadSignatureSrc } from '@/utils/signatureImageSrc'

interface SignatureImageProps {
  src?: string | null
  alt: string
  className?: string
  style?: CSSProperties
}

/** Muestra una firma guardada en base64 o en el proxy autenticado de Google Drive. */
export function SignatureImage({ src, alt, className, style }: SignatureImageProps) {
  const initial = String(src || '').trim()
  const [resolved, setResolved] = useState<string | null>(
    initial.startsWith('data:image/') || initial.startsWith('blob:') ? initial : null,
  )
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    const raw = String(src || '').trim()
    if (!raw) {
      setResolved(null)
      return
    }
    if (raw.startsWith('data:image/') || raw.startsWith('blob:')) {
      setResolved(raw)
      return
    }
    setResolved(null)
    loadSignatureSrc(raw).then((dataUrl) => {
      if (cancelled) return
      if (dataUrl) setResolved(dataUrl)
      else setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [src])

  if (!src) return null
  if (failed) {
    return (
      <p className="text-xs text-slate-500" role="img" aria-label={alt}>
        Firma guardada en Google Drive. No se pudo cargar la vista previa.
      </p>
    )
  }
  if (!resolved) {
    return <p className="text-xs text-slate-400">Cargando firma…</p>
  }
  return <img src={resolved} alt={alt} draggable={false} className={className} style={style} />
}

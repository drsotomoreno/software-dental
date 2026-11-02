import archReferenceUrl from '@/assets/edentulous-implant-arches.png'
import { ARTWORK_IMAGE } from './archGeometry'

/** URL del esquema empaquetada por Vite (usar en <img> HTML, no en SVG <image>). */
export const EDENTULOUS_ARCH_IMAGE_URL = archReferenceUrl

interface EdentulousArchArtworkProps {
  disabled?: boolean
  onCanvasClick: (clientX: number, clientY: number) => void
}

/**
 * Capa de clic transparente sobre el esquema.
 * La ilustración se muestra con <img> HTML en el planner: el elemento SVG <image>
 * no resolvía el href del asset y mostraba el ícono de imagen rota.
 */
export function EdentulousArchArtwork({ disabled = false, onCanvasClick }: EdentulousArchArtworkProps) {
  return (
    <rect
      x={ARTWORK_IMAGE.x}
      y={ARTWORK_IMAGE.y}
      width={ARTWORK_IMAGE.width}
      height={ARTWORK_IMAGE.height}
      fill="transparent"
      className={disabled ? '' : 'cursor-crosshair'}
      onClick={(event) => {
        if (disabled) return
        onCanvasClick(event.clientX, event.clientY)
      }}
    />
  )
}

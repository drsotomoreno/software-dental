import archReferenceUrl from '@/assets/edentulous-implant-arches.png'
import { ARTWORK_IMAGE } from './archGeometry'

interface EdentulousArchArtworkProps {
  disabled?: boolean
  onCanvasClick: (clientX: number, clientY: number) => void
}

export function EdentulousArchArtwork({ disabled = false, onCanvasClick }: EdentulousArchArtworkProps) {
  return (
    <>
      <image
        href={archReferenceUrl}
        x={ARTWORK_IMAGE.x}
        y={ARTWORK_IMAGE.y}
        width={ARTWORK_IMAGE.width}
        height={ARTWORK_IMAGE.height}
        preserveAspectRatio="xMidYMid meet"
      />

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
    </>
  )
}

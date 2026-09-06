import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DiagnosticViewerShell } from '@/viewers/DiagnosticViewerShell'
import { usePinchZoomPan } from '@/viewers/usePinchZoomPan'

export interface LightboxImage {
  id: string
  fileName: string
  url: string
}

interface PhotoLightboxViewerProps {
  images: LightboxImage[]
  activeId: string
  onClose: () => void
}

export function PhotoLightboxViewer({ images, activeId, onClose }: PhotoLightboxViewerProps) {
  const startIndex = Math.max(0, images.findIndex((item) => item.id === activeId))
  const [index, setIndex] = useState(startIndex < 0 ? 0 : startIndex)
  const stageRef = useRef<HTMLDivElement>(null)
  const swipeX = useRef<number | null>(null)
  const { transform, onPointerDown, onPointerMove, onPointerUp, reset, scale } = usePinchZoomPan(stageRef)
  const current = images[index] ?? images[0]

  useEffect(() => {
    reset()
  }, [index, reset])

  if (!current) return null

  const go = (delta: number) => {
    setIndex((value) => {
      const next = value + delta
      if (next < 0 || next >= images.length) return value
      return next
    })
  }

  return (
    <DiagnosticViewerShell
      title={current.fileName}
      subtitle={images.length > 1 ? `${index + 1} / ${images.length}` : 'Pinch para ampliar'}
      onClose={onClose}
    >
      <div
        ref={stageRef}
        className="relative flex h-full w-full items-center justify-center overflow-hidden"
        onPointerDown={(event) => {
          swipeX.current = event.clientX
          onPointerDown(event)
        }}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => {
          if (scale <= 1.05 && swipeX.current != null) {
            const dx = event.clientX - swipeX.current
            if (dx > 70) go(-1)
            else if (dx < -70) go(1)
          }
          swipeX.current = null
          onPointerUp(event)
        }}
        onWheel={(event) => {
          if (Math.abs(event.deltaY) < 8) return
          go(event.deltaY > 0 ? 1 : -1)
        }}
      >
        <img
          src={current.url}
          alt={current.fileName}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: 'center center',
          }}
        />
      </div>
      {images.length > 1 ? (
        <>
          <button
            type="button"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2"
            onClick={() => go(-1)}
            aria-label="Imagen anterior"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2"
            onClick={() => go(1)}
            aria-label="Imagen siguiente"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      ) : null}
    </DiagnosticViewerShell>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { DiagnosticViewerShell } from '@/viewers/DiagnosticViewerShell'

interface SliceSet {
  plane: 'axial' | 'coronal'
  urls: string[]
}

interface DicomSliceScrollerProps {
  fileName: string
  axialUrls: string[]
  coronalUrls: string[]
  onClose: () => void
}

export function DicomSliceScroller({
  fileName,
  axialUrls,
  coronalUrls,
  onClose,
}: DicomSliceScrollerProps) {
  const planes = useMemo<SliceSet[]>(() => {
    const sets: SliceSet[] = []
    if (axialUrls.length) sets.push({ plane: 'axial', urls: axialUrls })
    if (coronalUrls.length) sets.push({ plane: 'coronal', urls: coronalUrls })
    return sets
  }, [axialUrls, coronalUrls])

  const [planeIndex, setPlaneIndex] = useState(0)
  const [slice, setSlice] = useState(0)
  const lastY = useRef<number | null>(null)
  const acc = useRef(0)
  const current = planes[planeIndex] ?? planes[0]
  const urls = useMemo(() => current?.urls ?? [], [current])
  const safeSlice = Math.min(slice, Math.max(0, urls.length - 1))

  useEffect(() => {
    setSlice(0)
  }, [planeIndex])

  useEffect(() => {
    const next = urls[safeSlice + 1]
    if (!next) return
    const img = new Image()
    img.src = next
  }, [safeSlice, urls])

  if (!current || !urls.length) {
    return (
      <DiagnosticViewerShell title={fileName} onClose={onClose}>
        <p className="p-6 text-sm text-slate-300">No hay cortes extraídos para este estudio.</p>
      </DiagnosticViewerShell>
    )
  }

  const move = (delta: number) => {
    setSlice((value) => Math.min(urls.length - 1, Math.max(0, value + delta)))
  }

  return (
    <DiagnosticViewerShell
      title={fileName}
      subtitle={`${current.plane === 'axial' ? 'Axial' : 'Coronal'} · ${safeSlice + 1} / ${urls.length}`}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          {planes.length > 1 ? (
            <div className="flex gap-2">
              {planes.map((item, index) => (
                <button
                  key={item.plane}
                  type="button"
                  onClick={() => setPlaneIndex(index)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    index === planeIndex ? 'bg-white text-slate-900' : 'bg-white/10 text-white'
                  }`}
                >
                  {item.plane === 'axial' ? 'Axial' : 'Coronal'}
                </button>
              ))}
            </div>
          ) : null}
          <input
            type="range"
            min={0}
            max={Math.max(0, urls.length - 1)}
            value={safeSlice}
            onChange={(event) => setSlice(Number(event.target.value))}
            className="w-full accent-sky-400"
            aria-label="Corte"
          />
        </div>
      }
    >
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black"
        onPointerDown={(event) => {
          lastY.current = event.clientY
          acc.current = 0
        }}
        onPointerMove={(event) => {
          if (lastY.current == null) return
          const dy = event.clientY - lastY.current
          lastY.current = event.clientY
          acc.current += dy
          if (acc.current > 18) {
            move(-1)
            acc.current = 0
          } else if (acc.current < -18) {
            move(1)
            acc.current = 0
          }
        }}
        onPointerUp={() => {
          lastY.current = null
        }}
        onWheel={(event) => {
          if (event.deltaY > 0) move(1)
          else if (event.deltaY < 0) move(-1)
        }}
      >
        {urls.map((url, index) =>
          Math.abs(index - safeSlice) <= 1 ? (
            <img
              key={url}
              src={url}
              alt={`Corte ${index + 1}`}
              className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
              style={{ opacity: index === safeSlice ? 1 : 0 }}
            />
          ) : null,
        )}
      </div>
    </DiagnosticViewerShell>
  )
}

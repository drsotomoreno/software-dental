import { useCallback, useEffect, useRef, useState } from 'react'

type Point = { x: number; y: number }

function getPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number): Point {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  }
}

interface DemoSignatureCanvasProps {
  height?: number
  initialDataUrl?: string | null
  onSave: (dataUrl: string) => void
  onClearSaved: () => void
  savedDataUrl: string | null
}

/**
 * Lienzo HTML5 de firma (mouse + táctil) para la demo de recepción/tablet.
 */
export function DemoSignatureCanvas({
  height = 220,
  initialDataUrl = null,
  onSave,
  onClearSaved,
  savedDataUrl,
}: DemoSignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<Point | null>(null)
  const emptyRef = useRef(!initialDataUrl)
  const [isEmpty, setIsEmpty] = useState(!initialDataUrl)
  const [statusMessage, setStatusMessage] = useState('')

  const paintBlank = useCallback((ctx: CanvasRenderingContext2D, width: number, cssHeight: number) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, cssHeight)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.5
  }, [])

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const preserved = !emptyRef.current ? canvas.toDataURL('image/png') : initialDataUrl
    const dpr = window.devicePixelRatio || 1
    const width = parent.clientWidth
    const cssHeight = height

    canvas.width = Math.max(1, Math.floor(width * dpr))
    canvas.height = Math.max(1, Math.floor(cssHeight * dpr))
    canvas.style.width = `${width}px`
    canvas.style.height = `${cssHeight}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    paintBlank(ctx, width, cssHeight)

    if (!preserved) {
      emptyRef.current = true
      setIsEmpty(true)
      return
    }

    const img = new Image()
    img.onload = () => {
      if (canvasRef.current !== canvas) return
      ctx.drawImage(img, 0, 0, width, cssHeight)
      emptyRef.current = false
      setIsEmpty(false)
    }
    img.src = preserved
  }, [height, initialDataUrl, paintBlank])

  useEffect(() => {
    resizeCanvas()
    const parent = canvasRef.current?.parentElement
    if (!parent || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => resizeCanvas())
    observer.observe(parent)
    return () => observer.disconnect()
  }, [resizeCanvas])

  const strokeTo = (point: Point) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const last = lastPointRef.current
    ctx.beginPath()
    if (last) {
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(point.x, point.y)
    } else {
      ctx.moveTo(point.x, point.y)
      ctx.lineTo(point.x + 0.01, point.y)
    }
    ctx.stroke()
    lastPointRef.current = point
    if (emptyRef.current) {
      emptyRef.current = false
      setIsEmpty(false)
    }
  }

  const startStroke = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawingRef.current = true
    lastPointRef.current = getPoint(canvas, clientX, clientY)
    setStatusMessage('')
  }

  const moveStroke = (clientX: number, clientY: number) => {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    strokeTo(getPoint(canvas, clientX, clientY))
  }

  const endStroke = () => {
    drawingRef.current = false
    lastPointRef.current = null
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const width = canvas.clientWidth
    const cssHeight = canvas.clientHeight
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    paintBlank(ctx, width, cssHeight)
    emptyRef.current = true
    setIsEmpty(true)
    drawingRef.current = false
    lastPointRef.current = null
    onClearSaved()
    setStatusMessage('Firma limpiada.')
  }

  const save = () => {
    const canvas = canvasRef.current
    if (!canvas || emptyRef.current) {
      setStatusMessage('Dibuje la firma antes de guardarla.')
      return
    }
    onSave(canvas.toDataURL('image/png'))
    setStatusMessage('Firma guardada en la demo.')
  }

  return (
    <div>
      <div
        className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white touch-none"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full cursor-crosshair touch-none"
          aria-label="Área de firma digital"
          onMouseDown={(e) => {
            e.preventDefault()
            startStroke(e.clientX, e.clientY)
          }}
          onMouseMove={(e) => {
            if (!drawingRef.current) return
            e.preventDefault()
            moveStroke(e.clientX, e.clientY)
          }}
          onMouseUp={endStroke}
          onMouseLeave={endStroke}
          onTouchStart={(e) => {
            e.preventDefault()
            const touch = e.touches[0]
            if (!touch) return
            startStroke(touch.clientX, touch.clientY)
          }}
          onTouchMove={(e) => {
            e.preventDefault()
            const touch = e.touches[0]
            if (!touch) return
            moveStroke(touch.clientX, touch.clientY)
          }}
          onTouchEnd={(e) => {
            e.preventDefault()
            endStroke()
          }}
          onTouchCancel={endStroke}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {isEmpty
            ? 'Firme con el mouse o el dedo (como en la tablet de recepción).'
            : savedDataUrl
              ? 'Firma capturada y guardada.'
              : 'Trazo listo. Pulse «Guardar firma» para conservarla.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={clear} className="btn-secondary">
            Limpiar firma
          </button>
          <button type="button" onClick={save} disabled={isEmpty} className="btn-primary disabled:cursor-not-allowed">
            Guardar firma
          </button>
        </div>
      </div>

      {statusMessage ? <p className="mt-2 text-sm text-dental-700">{statusMessage}</p> : null}

      {savedDataUrl ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Vista previa guardada
          </p>
          <img
            src={savedDataUrl}
            alt="Firma digital guardada"
            className="max-h-24 rounded border border-slate-200 bg-white"
          />
        </div>
      ) : null}
    </div>
  )
}

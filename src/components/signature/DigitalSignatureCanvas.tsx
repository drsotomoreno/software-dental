import { useCallback, useRef, useEffect, useState } from 'react'
import type { SignatureCaptureResult } from '@/types/signature'
import { MIN_SIGNATURE_STROKES } from '@/types/signature'

interface DigitalSignatureCanvasProps {
  onSignatureChange: (result: SignatureCaptureResult | null) => void
  disabled?: boolean
  width?: number
  height?: number
}

interface Point {
  x: number
  y: number
}

export function DigitalSignatureCanvas({
  onSignatureChange,
  disabled = false,
  width = 500,
  height = 180,
}: DigitalSignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastPoint = useRef<Point | null>(null)
  const strokeCount = useRef(0)
  const captureStartedAt = useRef<string | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)
  const [strokeWarning, setStrokeWarning] = useState('')

  const getPoint = useCallback(
    (e: React.MouseEvent | React.TouchEvent): Point | null => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height

      if ('touches' in e) {
        const touch = e.touches[0] ?? e.changedTouches[0]
        if (!touch) return null
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        }
      }

      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      }
    },
    [],
  )

  const drawLine = useCallback((from: Point, to: Point) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }, [])

  const exportSignature = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || isEmpty) {
      onSignatureChange(null)
      setStrokeWarning('')
      return
    }

    if (strokeCount.current < MIN_SIGNATURE_STROKES) {
      onSignatureChange(null)
      setStrokeWarning(
        `Firma insuficiente: trace al menos ${MIN_SIGNATURE_STROKES} trazos. No se aceptan imágenes pegadas.`,
      )
      return
    }

    setStrokeWarning('')
    onSignatureChange({
      dataUrl: canvas.toDataURL('image/png'),
      metadata: {
        signatureMethod: 'canvas_biometric',
        strokeCount: strokeCount.current,
        captureStartedAt: captureStartedAt.current ?? new Date().toISOString(),
        captureEndedAt: new Date().toISOString(),
        canvasWidth: width,
        canvasHeight: height,
      },
    })
  }, [isEmpty, onSignatureChange, width, height])

  const blockStaticImage = useCallback((e: React.ClipboardEvent | React.DragEvent) => {
    e.preventDefault()
    setStrokeWarning('No se permiten imágenes pegadas o arrastradas. Firme dibujando en el canvas.')
  }, [])

  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (disabled) return
      e.preventDefault()
      if (!captureStartedAt.current) {
        captureStartedAt.current = new Date().toISOString()
      }
      isDrawing.current = true
      lastPoint.current = getPoint(e)
      strokeCount.current += 1
    },
    [disabled, getPoint],
  )

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing.current || disabled) return
      e.preventDefault()
      const point = getPoint(e)
      if (!point || !lastPoint.current) return
      drawLine(lastPoint.current, point)
      lastPoint.current = point
      setIsEmpty(false)
      setStrokeWarning('')
    },
    [disabled, getPoint, drawLine],
  )

  const stopDrawing = useCallback(() => {
    if (isDrawing.current) {
      isDrawing.current = false
      lastPoint.current = null
      exportSignature()
    }
  }, [exportSignature])

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
    strokeCount.current = 0
    captureStartedAt.current = null
    setStrokeWarning('')
    onSignatureChange(null)
  }, [onSignatureChange])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.scale(dpr, dpr)
  }, [width, height])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="label-field mb-0">
          Firma digital biométrica <span className="text-red-500">*</span>
          <span className="ml-2 text-xs font-normal text-slate-500">(Ley 527 — no imágenes escaneadas)</span>
        </label>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || isEmpty}
          className="text-xs text-dental-600 hover:underline disabled:opacity-50"
        >
          Limpiar firma
        </button>
      </div>

      <div
        className={`relative rounded-lg border-2 border-dashed ${
          disabled ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-white'
        }`}
        style={{ touchAction: 'none' }}
        onPaste={blockStaticImage}
        onDrop={blockStaticImage}
        onDragOver={(e) => e.preventDefault()}
      >
        <canvas
          ref={canvasRef}
          className="block w-full cursor-crosshair rounded-lg"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Área de firma digital biométrica"
        />
        {isEmpty && !disabled && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            Firme aquí trazando con mouse o dedo — no pegue imágenes
          </p>
        )}
      </div>

      {strokeWarning && <p className="text-xs text-red-600">{strokeWarning}</p>}

      <p className="text-xs text-slate-500">
        La firma queda vinculada a su usuario autenticado, hash del documento, IP/dispositivo y
        timestamp para auditoría.
      </p>
    </div>
  )
}

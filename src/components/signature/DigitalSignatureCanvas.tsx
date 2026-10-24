import { useCallback, useRef, useEffect, useState } from 'react'
import type { SignatureCaptureResult } from '@/types/signature'
import { MIN_SIGNATURE_STROKES } from '@/types/signature'

interface DigitalSignatureCanvasProps {
  onSignatureChange: (result: SignatureCaptureResult | null) => void
  /** Firma ya guardada. Se muestra al volver a abrir y no se descarta sola. */
  value?: string | null
  disabled?: boolean
  width?: number
  height?: number
  title?: string
  ariaLabel?: string
  /** Ley 527 y el texto de auditoría. En un par de firmas se muestra una sola vez afuera. */
  showDetails?: boolean
}

interface Point {
  x: number
  y: number
}

function isStoredSignature(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith('data:image/')
}

export function DigitalSignatureCanvas({
  onSignatureChange,
  value = null,
  disabled = false,
  width = 500,
  height = 180,
  title = 'Firma digital biométrica',
  ariaLabel = 'Área de firma digital biométrica',
  showDetails = true,
}: DigitalSignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastPoint = useRef<Point | null>(null)
  const strokeCount = useRef(0)
  const captureStartedAt = useRef<string | null>(null)
  const hasInkRef = useRef(false)
  const onSignatureChangeRef = useRef(onSignatureChange)
  const valueRef = useRef(value)
  const [isEmpty, setIsEmpty] = useState(true)
  const [strokeWarning, setStrokeWarning] = useState('')
  const [redrawing, setRedrawing] = useState(false)

  onSignatureChangeRef.current = onSignatureChange
  valueRef.current = value

  useEffect(() => {
    setRedrawing(false)
  }, [value])

  const hasStored = isStoredSignature(value)
  const drawing = !hasStored || redrawing

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
    if (!canvas || !hasInkRef.current) return

    if (strokeCount.current < MIN_SIGNATURE_STROKES) {
      setStrokeWarning(
        `Firma insuficiente: trace al menos ${MIN_SIGNATURE_STROKES} trazos. No se aceptan imágenes pegadas.`,
      )
      if (!isStoredSignature(valueRef.current)) onSignatureChangeRef.current(null)
      return
    }

    setStrokeWarning('')
    onSignatureChangeRef.current({
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
  }, [width, height])

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
      hasInkRef.current = true
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

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    setIsEmpty(true)
    hasInkRef.current = false
    strokeCount.current = 0
    captureStartedAt.current = null
    setStrokeWarning('')
    if (!isStoredSignature(valueRef.current)) onSignatureChangeRef.current(null)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !drawing) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.scale(dpr, dpr)
    hasInkRef.current = false
    strokeCount.current = 0
    captureStartedAt.current = null
    setIsEmpty(true)
  }, [width, height, drawing])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="label-field mb-0">
          {title} <span className="text-red-500">*</span>
          {showDetails && (
            <span className="ml-2 text-xs font-normal text-slate-500">(Ley 527 — no imágenes escaneadas)</span>
          )}
        </label>
        <button
          type="button"
          onClick={() => {
            if (hasStored && !redrawing) {
              setRedrawing(true)
              setStrokeWarning('')
              return
            }
            clearCanvas()
          }}
          disabled={disabled || (!hasStored && isEmpty)}
          className="text-xs text-dental-600 hover:underline disabled:opacity-50"
        >
          {hasStored && !redrawing ? 'Volver a firmar' : 'Limpiar firma'}
        </button>
      </div>

      {hasStored && !redrawing ? (
        <div
          className={`rounded-lg border-2 border-dashed p-2 ${
            disabled ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-white'
          }`}
        >
          <img
            src={value}
            alt={ariaLabel}
            draggable={false}
            className="block w-full bg-white object-contain"
            style={{ height }}
          />
        </div>
      ) : (
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
            aria-label={ariaLabel}
          />
          {isEmpty && !disabled && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              Firme aquí trazando con mouse o dedo — no pegue imágenes
            </p>
          )}
        </div>
      )}

      {redrawing && hasStored && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            La firma guardada sigue registrada. Solo se reemplaza si termina una firma nueva.
          </p>
          <button
            type="button"
            onClick={() => {
              setRedrawing(false)
              setStrokeWarning('')
            }}
            className="shrink-0 text-xs text-dental-600 hover:underline"
          >
            Conservar firma
          </button>
        </div>
      )}

      {strokeWarning && <p className="text-xs text-red-600">{strokeWarning}</p>}

      {showDetails && (
        <p className="text-xs text-slate-500">
          La firma queda vinculada a su usuario autenticado, hash del documento, IP/dispositivo y
          timestamp para auditoría.
        </p>
      )}
    </div>
  )
}

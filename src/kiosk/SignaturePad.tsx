import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

export interface SignaturePadCapture {
  dataUrl: string
  strokeCount: number
  captureStartedAt: string
  captureEndedAt: string
  canvasWidth: number
  canvasHeight: number
}

export interface SignaturePadHandle {
  /** PNG Base64 (`data:image/png;base64,...`) o `null` si el lienzo está vacío. */
  toDataURL: () => string | null
  /** Trazo real del lienzo, con conteo de trazos para la historia clínica. */
  getCapture: () => SignaturePadCapture | null
  clear: () => void
  isEmpty: () => boolean
}

interface SignaturePadProps {
  className?: string
  /** Altura CSS del área de firma (default 220). */
  height?: number
  /** PNG previo, para no perder el trazo si el lienzo se vuelve a montar. */
  initialDataUrl?: string | null
  /** Avisa cada vez que el trazo queda cerrado o se limpia. */
  onSnapshot?: (dataUrl: string | null) => void
}

type Point = { x: number; y: number }

function getPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): Point {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  }
}

/**
 * Lienzo de firma táctil/mouse. Sin Dexie ni Auth.
 */
const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  function SignaturePad({ className = '', height = 220, initialDataUrl = null, onSnapshot }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawingRef = useRef(false)
    const lastPointRef = useRef<Point | null>(null)
    const emptyRef = useRef(!initialDataUrl)
    const snapshotRef = useRef<string | null>(initialDataUrl)
    const strokeCountRef = useRef(0)
    const captureStartedAtRef = useRef<string | null>(null)
    /** true solo después de pintar un trazo real; el lienzo virgen no se lee. */
    const bitmapReadyRef = useRef(false)
    const onSnapshotRef = useRef(onSnapshot)
    const [isEmpty, setIsEmpty] = useState(!initialDataUrl)
    onSnapshotRef.current = onSnapshot

    const publishSnapshot = useCallback((dataUrl: string | null) => {
      snapshotRef.current = dataUrl
      onSnapshotRef.current?.(dataUrl)
    }, [])

    const resizeCanvas = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const parent = canvas.parentElement
      if (!parent) return

      const preserved = bitmapReadyRef.current ? canvas.toDataURL('image/png') : snapshotRef.current

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
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 2.5
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, cssHeight)

      if (!preserved) {
        emptyRef.current = true
        bitmapReadyRef.current = false
        setIsEmpty(true)
        return
      }

      snapshotRef.current = preserved
      const img = new Image()
      img.onload = () => {
        if (canvasRef.current !== canvas) return
        ctx.drawImage(img, 0, 0, width, cssHeight)
        emptyRef.current = false
        bitmapReadyRef.current = true
        setIsEmpty(false)
      }
      img.src = preserved
    }, [height])

    useEffect(() => {
      resizeCanvas()
      const parent = canvasRef.current?.parentElement
      if (!parent || typeof ResizeObserver === 'undefined') return
      const observer = new ResizeObserver(() => resizeCanvas())
      observer.observe(parent)
      return () => observer.disconnect()
    }, [resizeCanvas])

    const strokeTo = useCallback((point: Point) => {
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
    }, [])

    const startStroke = useCallback(
      (clientX: number, clientY: number) => {
        const canvas = canvasRef.current
        if (!canvas) return
        drawingRef.current = true
        if (!captureStartedAtRef.current) {
          captureStartedAtRef.current = new Date().toISOString()
        }
        strokeCountRef.current += 1
        lastPointRef.current = getPoint(canvas, clientX, clientY)
      },
      [],
    )

    const moveStroke = useCallback(
      (clientX: number, clientY: number) => {
        if (!drawingRef.current) return
        const canvas = canvasRef.current
        if (!canvas) return
        strokeTo(getPoint(canvas, clientX, clientY))
      },
      [strokeTo],
    )

    const endStroke = useCallback(() => {
      drawingRef.current = false
      lastPointRef.current = null
      const canvas = canvasRef.current
      if (!canvas || emptyRef.current) return
      bitmapReadyRef.current = true
      publishSnapshot(canvas.toDataURL('image/png'))
    }, [publishSnapshot])

    const clear = useCallback(() => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      const width = canvas.clientWidth
      const cssHeight = canvas.clientHeight
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.restore()
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 2.5
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, cssHeight)
      emptyRef.current = true
      bitmapReadyRef.current = false
      strokeCountRef.current = 0
      captureStartedAtRef.current = null
      setIsEmpty(true)
      drawingRef.current = false
      lastPointRef.current = null
      publishSnapshot(null)
    }, [publishSnapshot])

    useImperativeHandle(
      ref,
      () => ({
        toDataURL: () => {
          if (emptyRef.current || !canvasRef.current) return null
          return canvasRef.current.toDataURL('image/png')
        },
        getCapture: () => {
          const canvas = canvasRef.current
          if (emptyRef.current || !canvas) return null
          return {
            dataUrl: canvas.toDataURL('image/png'),
            strokeCount: strokeCountRef.current,
            captureStartedAt: captureStartedAtRef.current ?? new Date().toISOString(),
            captureEndedAt: new Date().toISOString(),
            canvasWidth: canvas.clientWidth,
            canvasHeight: canvas.clientHeight,
          }
        },
        clear,
        isEmpty: () => emptyRef.current,
      }),
      [clear],
    )

    return (
      <div className={className}>
        <div
          className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white touch-none"
          style={{ height }}
        >
          <canvas
            ref={canvasRef}
            className="block h-full w-full cursor-crosshair touch-none"
            aria-label="Área de firma"
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
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-base text-slate-500">
            {isEmpty ? 'Firme con el dedo o el lápiz en el recuadro' : 'Firma capturada'}
          </p>
          <button
            type="button"
            onClick={clear}
            className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 text-lg font-medium text-slate-700 active:bg-slate-100"
          >
            Limpiar
          </button>
        </div>
      </div>
    )
  },
)

export default SignaturePad

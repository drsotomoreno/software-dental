import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

export interface SignaturePadHandle {
  /** PNG Base64 (`data:image/png;base64,...`) o `null` si el lienzo está vacío. */
  toDataURL: () => string | null
  clear: () => void
  isEmpty: () => boolean
}

interface SignaturePadProps {
  className?: string
  /** Altura CSS del área de firma (default 220). */
  height?: number
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
  function SignaturePad({ className = '', height = 220 }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawingRef = useRef(false)
    const lastPointRef = useRef<Point | null>(null)
    const emptyRef = useRef(true)
    const [isEmpty, setIsEmpty] = useState(true)

    const resizeCanvas = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const parent = canvas.parentElement
      if (!parent) return

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
      emptyRef.current = true
      setIsEmpty(true)
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
    }, [])

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
      setIsEmpty(true)
      drawingRef.current = false
      lastPointRef.current = null
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        toDataURL: () => {
          if (emptyRef.current || !canvasRef.current) return null
          return canvasRef.current.toDataURL('image/png')
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

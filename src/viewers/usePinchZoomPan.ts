import { type RefObject, useCallback, useRef, useState } from 'react'

interface PinchState {
  scale: number
  x: number
  y: number
}

const MIN_SCALE = 1
const MAX_SCALE = 5
const DOUBLE_TAP_MS = 280

export function usePinchZoomPan(targetRef: RefObject<HTMLElement | null>) {
  const [transform, setTransform] = useState<PinchState>({ scale: 1, x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const lastTap = useRef(0)
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null)
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const transformRef = useRef(transform)
  transformRef.current = transform

  const reset = useCallback(() => {
    setTransform({ scale: 1, x: 0, y: 0 })
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      const node = targetRef.current
      if (!node) return
      node.setPointerCapture(event.pointerId)
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (pointers.current.size === 1) {
        const now = Date.now()
        if (now - lastTap.current < DOUBLE_TAP_MS) {
          const nextScale = transformRef.current.scale > 1.1 ? 1 : 2.5
          setTransform(nextScale === 1 ? { scale: 1, x: 0, y: 0 } : { ...transformRef.current, scale: nextScale })
          lastTap.current = 0
        } else {
          lastTap.current = now
        }
        panStart.current = {
          x: event.clientX,
          y: event.clientY,
          tx: transformRef.current.x,
          ty: transformRef.current.y,
        }
      }

      if (pointers.current.size === 2) {
        const pts = [...pointers.current.values()]
        const dx = pts[0].x - pts[1].x
        const dy = pts[0].y - pts[1].y
        pinchStart.current = {
          distance: Math.hypot(dx, dy) || 1,
          scale: transformRef.current.scale,
        }
        panStart.current = null
      }
    },
    [targetRef],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!pointers.current.has(event.pointerId)) return
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (pointers.current.size === 2 && pinchStart.current) {
        const pts = [...pointers.current.values()]
        const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
        const next = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, (pinchStart.current.scale * distance) / pinchStart.current.distance),
        )
        setTransform((prev) => ({
          ...prev,
          scale: next,
          x: next === 1 ? 0 : prev.x,
          y: next === 1 ? 0 : prev.y,
        }))
        return
      }

      if (pointers.current.size === 1 && panStart.current && transformRef.current.scale > 1.02) {
        setTransform((prev) => ({
          ...prev,
          x: panStart.current!.tx + event.clientX - panStart.current!.x,
          y: panStart.current!.ty + event.clientY - panStart.current!.y,
        }))
      }
    },
    [],
  )

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinchStart.current = null
    if (pointers.current.size === 0) panStart.current = null
  }, [])

  return { transform, onPointerDown, onPointerMove, onPointerUp, reset, scale: transform.scale }
}

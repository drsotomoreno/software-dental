import { useCallback, useEffect, useRef, useState } from 'react'

export function useSuperadminResource<T>(loader: () => Promise<T>) {
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    loaderRef
      .current()
      .then((next) => {
        if (!cancelled) setData(next)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'No se pudo cargar el panel.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => reload(), [reload])

  return { data, error, loading, reload, setData }
}

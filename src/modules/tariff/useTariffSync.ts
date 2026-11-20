import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { loadAllTariffs } from '@/services/tariffService'
import { useTariffStore } from '@/store/useTariffStore'

/** Sincroniza IndexedDB (CUPS + precios del usuario) con el store Zustand O(1). */
export function useTariffSync(userId: string | undefined) {
  const setTariffs = useTariffStore((state) => state.setTariffs)
  const safeUserId = String(userId ?? '').trim()
  const priceRevision = useLiveQuery(
    () => (safeUserId ? db.prices.where('userId').equals(safeUserId).count() : 0),
    [safeUserId],
  )
  const catalogRevision = useLiveQuery(
    () => db.catalogItems.where('catalogType').equals('cups').count(),
    [],
  )

  const loadingRef = useRef(false)

  useEffect(() => {
    if (!safeUserId) {
      setTariffs([])
      return
    }

    let cancelled = false
    loadingRef.current = true

    loadAllTariffs(safeUserId)
      .then((tariffs) => {
        if (!cancelled) setTariffs(tariffs)
      })
      .catch((error) => {
        console.error('[useTariffSync] Error al cargar tarifas:', error)
      })
      .finally(() => {
        loadingRef.current = false
      })

    return () => {
      cancelled = true
    }
  }, [safeUserId, setTariffs, priceRevision, catalogRevision])

  return useTariffStore((state) => state.isLoaded)
}

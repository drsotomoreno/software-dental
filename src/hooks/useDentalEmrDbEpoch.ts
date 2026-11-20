import { useEffect, useState } from 'react'
import { DENTAL_EMR_DB_CHANGED_EVENT, db } from '@/db/database'

/**
 * Epoch que sube cuando IndexedDB canónico se reapunta o la sesión hidrata la BD.
 * Úselo como dependencia de useLiveQuery para no quedar con resultados stale
 * del cubo `unknown-clinic` / clínica anterior.
 */
export function useDentalEmrDbEpoch(): { epoch: number; dbName: string } {
  const [epoch, setEpoch] = useState(0)
  const [dbName, setDbName] = useState(() => db.name)

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string }>).detail
      setDbName(String(detail?.name || db.name))
      setEpoch((value) => value + 1)
    }
    window.addEventListener(DENTAL_EMR_DB_CHANGED_EVENT, onChange)
    setDbName(db.name)
    return () => window.removeEventListener(DENTAL_EMR_DB_CHANGED_EVENT, onChange)
  }, [])

  return { epoch, dbName }
}

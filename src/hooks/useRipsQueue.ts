import { useCallback, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import {
  closeEvolution as closeEvolutionInStore,
  listRipsQueueByPatient,
  type CloseEvolutionResult,
  type RipsEvolutionCloseData,
} from '@/db/ripsQueueStore'
import type { RipsQueueEntry } from '@/types/ripsQueue'

export type { CloseEvolutionResult, RipsEvolutionCloseData } from '@/db/ripsQueueStore'

/**
 * Cola local de RIPS y cierre de la evolución.
 * Si la validación falla, `highlightFields` indica qué resaltar y el borrador no se cierra.
 */
export function useRipsQueue(patientId?: string) {
  const entries = useLiveQuery(async (): Promise<RipsQueueEntry[]> => {
    if (patientId) return listRipsQueueByPatient(patientId)
    const rows = await db.rips_queue.orderBy('updatedAt').reverse().toArray()
    return rows
  }, [patientId])

  const [lastResult, setLastResult] = useState<CloseEvolutionResult | null>(null)

  const closeEvolution = useCallback(
    async (evolutionData: RipsEvolutionCloseData, hasFEV: boolean): Promise<CloseEvolutionResult> => {
      const result = await closeEvolutionInStore(evolutionData, hasFEV)
      setLastResult(result)
      return result
    },
    [],
  )

  const highlightFields = useMemo(
    () => (lastResult && !lastResult.ok ? lastResult.highlightFields : []),
    [lastResult],
  )

  const fieldErrors = useMemo(
    () => (lastResult && !lastResult.ok ? lastResult.errors : []),
    [lastResult],
  )

  const isFieldHighlighted = useCallback(
    (field: string) => highlightFields.includes(field),
    [highlightFields],
  )

  const clearHighlights = useCallback(() => {
    setLastResult(null)
  }, [])

  return {
    entries: entries ?? [],
    loading: entries === undefined,
    closeEvolution,
    lastResult,
    highlightFields,
    fieldErrors,
    isFieldHighlighted,
    clearHighlights,
  }
}

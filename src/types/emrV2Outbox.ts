/** Cola FIFO de mutaciones granulares EMR v2 (offline → /api/v2/). */
export type EmrV2OutboxStatus = 'pending' | 'in_flight' | 'done' | 'conflict' | 'error'

export interface EmrV2OutboxEntry {
  id?: number
  idempotencyKey: string
  patientSyncId: string
  kind: 'patch_section' | 'create_evolution' | 'lock_evolution' | 'upload_asset'
  section?: string | null
  payload: unknown
  baseVersion?: number | null
  status: EmrV2OutboxStatus
  attempts: number
  lastError?: string | null
  createdAt: string
  updatedAt: string
}

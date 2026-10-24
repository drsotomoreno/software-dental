/**
 * Reglas puras del cierre de jornada RIPS.
 * El lote diario toma QUEUED y ERROR_RETRY. Un RIPS con factura y sin CUFE
 * no sale: el MUV lo radicaría como atención particular.
 */

export const RIPS_BATCH_LIMIT = 200
export const RIPS_SYNC_STALE_MS = 20 * 60 * 1000

export interface RipsSyncError {
  code: string
  message: string
  path?: string
}

export interface RipsSyncCandidate {
  evolutionId: string
  patientId: string
  type: string
  status: string
  cufe?: string
  updatedAt: string
  errors?: RipsSyncError[]
}

export interface RipsBatchItemResult {
  evolutionId?: string | null
  success?: boolean
  cuv?: string | null
  retryable?: boolean
  errors?: RipsSyncError[]
}

export type RipsSyncDecision =
  | { kind: 'synchronized'; cuv: string }
  | { kind: 'retry'; errors: RipsSyncError[] }

const ZONA_CLINICA = 'America/Bogota'

export function fechaClinica(iso: string | Date): string {
  const date = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_CLINICA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function esMismoDiaClinico(iso: string, ahora: Date = new Date()): boolean {
  const dia = fechaClinica(iso)
  return Boolean(dia) && dia === fechaClinica(ahora)
}

/** QUEUED o ERROR_RETRY. Con FEV exige CUFE para no enviarlo sin factura. */
export function entradaListaParaMuv(entry: Pick<RipsSyncCandidate, 'status' | 'type' | 'cufe'>): boolean {
  if (entry.status !== 'QUEUED' && entry.status !== 'ERROR_RETRY') return false
  if (entry.type === 'WITH_FEV' && !String(entry.cufe ?? '').trim()) return false
  return true
}

/**
 * Un PROCESSING sin FEV abandonado (se cerró la pestaña a mitad del lote)
 * vuelve a la cola. El PROCESSING con FEV sigue reservado para el CUFE.
 */
export function procesoAtascado(
  entry: Pick<RipsSyncCandidate, 'type' | 'status' | 'updatedAt'>,
  nowMs: number,
  maxAgeMs: number = RIPS_SYNC_STALE_MS,
): boolean {
  if (entry.type !== 'WITHOUT_FEV' || entry.status !== 'PROCESSING') return false
  const updated = Date.parse(entry.updatedAt)
  if (!Number.isFinite(updated)) return false
  return nowMs - updated >= maxAgeMs
}

export function partirEnLotes<T>(items: T[], size: number = RIPS_BATCH_LIMIT): T[][] {
  const limite = Math.max(1, size)
  const lotes: T[][] = []
  for (let index = 0; index < items.length; index += limite) {
    lotes.push(items.slice(index, index + limite))
  }
  return lotes
}

export function decisionDeResultado(item: RipsBatchItemResult): RipsSyncDecision {
  const cuv = String(item.cuv ?? '').trim()
  if (item.success === true && cuv) return { kind: 'synchronized', cuv }
  const errors = (Array.isArray(item.errors) ? item.errors : [])
    .map((error) => ({
      code: String(error?.code || (item.retryable ? 'MUV_INFRASTRUCTURE' : 'MUV_RECHAZO')),
      message: [error?.message, error?.path].filter(Boolean).join(' ').trim() || 'El MUV rechazó el RIPS.',
    }))
    .filter((error) => error.message)
  if (errors.length > 0) return { kind: 'retry', errors }
  return {
    kind: 'retry',
    errors: [
      {
        code: item.retryable ? 'MUV_INFRASTRUCTURE' : 'MUV_RECHAZO',
        message: item.retryable
          ? 'No se pudo contactar el MUV. Se reintentará en el próximo cierre.'
          : 'El MUV rechazó el RIPS.',
      },
    ],
  }
}

export interface RipsQueueSummary {
  listos: number
  sincronizadosHoy: number
  conErrores: number
}

export function resumenRips(
  entries: Array<Pick<RipsSyncCandidate, 'status' | 'updatedAt'>>,
  ahora: Date = new Date(),
): RipsQueueSummary {
  let listos = 0
  let sincronizadosHoy = 0
  let conErrores = 0
  for (const entry of entries) {
    if (entry.status === 'QUEUED') listos += 1
    else if (entry.status === 'ERROR_RETRY') conErrores += 1
    else if (entry.status === 'SYNCHRONIZED' && esMismoDiaClinico(entry.updatedAt, ahora)) sincronizadosHoy += 1
  }
  return { listos, sincronizadosHoy, conErrores }
}

export function motivoRipsVisible(entry: {
  type?: string
  cufe?: string
  errors?: RipsSyncError[]
}): string {
  const partes = (entry.errors ?? [])
    .map((error) => [error.code, error.message].filter(Boolean).join(': '))
    .filter(Boolean)
  if (partes.length > 0) return partes.join(' · ')
  if (entry.type === 'WITH_FEV' && !String(entry.cufe ?? '').trim()) {
    return 'Falta el CUFE de la factura electrónica.'
  }
  return 'El MUV rechazó el RIPS.'
}

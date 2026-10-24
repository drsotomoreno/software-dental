import type { EvolutionNote } from '@/types/evolutionNote'
import type { RipsTransaction, RipsUsuario } from '@/types/rips'

/**
 * Outbox local de RIPS (Res. 2275). Una fila por evolución.
 * El lote diario solo transmite `WITHOUT_FEV` + `QUEUED`.
 * El flujo con factura electrónica no entra a ese lote: falta el CUFE.
 */
export const RIPS_QUEUE_FLOW = {
  WITH_FEV: 'WITH_FEV',
  WITHOUT_FEV: 'WITHOUT_FEV',
} as const

export const RIPS_QUEUE_STATUS = {
  /** Evolución todavía en diligenciamiento. */
  DRAFT: 'DRAFT',
  /** Cerrada y validada. Lista para el lote (solo atenciones sin FEV). */
  QUEUED: 'QUEUED',
  /** Transmisión en curso. En el flujo A reclama el sobre hasta el CUV. */
  PROCESSING: 'PROCESSING',
  /** MUV aceptó el envío y devolvió CUV. */
  SYNCHRONIZED: 'SYNCHRONIZED',
  /** MUV/SISPRO rechazó el envío. El log queda para corregir. */
  ERROR_RETRY: 'ERROR_RETRY',
} as const

export type RipsQueueFlowType = (typeof RIPS_QUEUE_FLOW)[keyof typeof RIPS_QUEUE_FLOW]
export type RipsQueueStatus = (typeof RIPS_QUEUE_STATUS)[keyof typeof RIPS_QUEUE_STATUS]

export interface RipsQueueError {
  code: string
  message: string
}

/**
 * Usuario RIPS más la causa externa del encuentro.
 * En Res. 2275 la causa vive en la consulta (`causaMotivoAtencion`);
 * en atenciones solo de procedimientos se conserva también aquí para
 * no encolar un JSON sin causa.
 */
export interface RipsQueueUsuario extends RipsUsuario {
  causaExterna?: string
  causaMotivoAtencion?: string
}

/** JSON preliminar Resolución 2275 que viaja en la cola. */
export interface RipsQueuePayload extends Omit<RipsTransaction, 'usuarios'> {
  usuarios: RipsQueueUsuario[]
}

export interface RipsQueueEntry {
  id?: number
  evolutionId: string
  patientId: string
  type: RipsQueueFlowType
  status: RipsQueueStatus
  /** Estructura JSON Resolución 2275. */
  jsonPayload: RipsQueuePayload
  cufe?: string
  cuv?: string
  errors?: RipsQueueError[]
  createdAt: string
  updatedAt: string
}

/** Datos clínicos con los que se cierra la evolución. El borrador no se descarta. */
export interface RipsEvolutionCloseData {
  evolutionId: string
  patientId: string
  note: EvolutionNote
  paciente: {
    documentType?: string | null
    documentNumber?: string | null
    birthDate?: string | null
    gender?: string | null
    regime?: string | null
    tipoUsuario?: string | null
    municipalityCode?: string | null
  }
  prestador?: {
    documentType?: string | null
    documentNumber?: string | null
    providerNit?: string | null
    repsCode?: string | null
  }
  tipoUsuario?: string | null
  /** Causa externa (Res. 3374) o causaMotivoAtencion (Res. 2275). */
  causaExterna?: string | null
  codDiagnosticoPrincipal?: string | null
  codDiagnosticoPrincipalCIE11?: string | null
  nomCodDiagnosticoPrincipalCIE11?: string | null
  numeroSoporte?: string | null
}

export interface RipsQueueDisposition {
  type: RipsQueueFlowType
  status: RipsQueueStatus
  nextStep: 'BATCH' | 'EMIT_FEV'
}

/**
 * Flujo B encola. Flujo A reclama el sobre (`PROCESSING`) para que el
 * cierre de jornada no lo mande al MUV sin CUFE. La emisión DIAN es el
 * paso siguiente, no este cierre.
 */
export function dispositionForRipsClose(hasFEV: boolean): RipsQueueDisposition {
  if (hasFEV) {
    return {
      type: RIPS_QUEUE_FLOW.WITH_FEV,
      status: RIPS_QUEUE_STATUS.PROCESSING,
      nextStep: 'EMIT_FEV',
    }
  }
  return {
    type: RIPS_QUEUE_FLOW.WITHOUT_FEV,
    status: RIPS_QUEUE_STATUS.QUEUED,
    nextStep: 'BATCH',
  }
}

export function isRipsBatchCandidate(
  entry: Pick<RipsQueueEntry, 'type' | 'status'>,
): boolean {
  return entry.type === RIPS_QUEUE_FLOW.WITHOUT_FEV && entry.status === RIPS_QUEUE_STATUS.QUEUED
}

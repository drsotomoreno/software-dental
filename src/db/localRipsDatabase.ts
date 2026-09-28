import type { Table } from 'dexie'

/**
 * PENDIENTE: borrador.
 * VALIDO: registros locales anteriores a VALIDO_LOCAL.
 * VALIDO_LOCAL: la estructura pasó el validador de este equipo.
 * APROBADO_MSPS: el Ministerio entregó el CUV.
 * RECHAZADO: falló la validación local o la central.
 */
export type EstadoValidacionRips =
  | 'PENDIENTE'
  | 'VALIDO'
  | 'VALIDO_LOCAL'
  | 'APROBADO_MSPS'
  | 'RECHAZADO'

/**
 * Paquete RIPS en IndexedDB.
 * `payloadJson` es el JSON serializado que consume `validarEstructuraRips`.
 */
export interface LocalRipsRecord {
  id?: number
  numFactura: string
  numDocumentoIdObligado: string
  tipoNota: string | null
  payloadJson: string
  estadoValidacion: EstadoValidacionRips
  /** Código Único de Validación emitido por el Ministerio. 96 hexadecimales. */
  cuv?: string
  mensajeRespuesta?: string
  /** Momento en que se leyó el archivo de resultados del Ministerio. */
  fechaValidacionCentral?: Date
  createdAt: Date
}

/** Índices de la versión 30, sin el CUV. */
export const RIPS_RECORDS_SCHEMA_V30 = '++id, numFactura, estadoValidacion, createdAt'

/** Índices Dexie de la tabla `ripsRecords`, incluida la búsqueda por CUV. */
export const RIPS_RECORDS_SCHEMA = '++id, numFactura, estadoValidacion, cuv, createdAt'

/**
 * Contrato de la tabla dentro de la base clínica.
 * La historia y los RIPS comparten IndexedDB `DentalEMR` (clase `DentalDatabase`).
 */
export interface RipsRecordsTable {
  ripsRecords: Table<LocalRipsRecord, number>
}

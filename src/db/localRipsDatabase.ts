import type { Table } from 'dexie'

/** Estado de la validación local, antes de transmitir al Ministerio. */
export type EstadoValidacionRips = 'PENDIENTE' | 'VALIDO' | 'RECHAZADO'

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
  cuv?: string
  createdAt: Date
}

/** Índices Dexie de la tabla `ripsRecords`. */
export const RIPS_RECORDS_SCHEMA = '++id, numFactura, estadoValidacion, createdAt'

/**
 * Contrato de la tabla dentro de la base clínica.
 * La historia y los RIPS comparten IndexedDB `DentalEMR` (clase `DentalDatabase`).
 */
export interface RipsRecordsTable {
  ripsRecords: Table<LocalRipsRecord, number>
}

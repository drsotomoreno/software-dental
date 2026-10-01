/**
 * Registro local de RIPS en IndexedDB (Dexie).
 * Conserva la modalidad elegida por el odontólogo al cerrar la atención:
 * `tipoNota: "RS"` para RIPS sin factura, `null` para FEV tradicional.
 */
export interface LocalRipsRecord {
  id?: number
  numFactura?: string | null
  numNota?: string | null
  tipoNota: 'RS' | null
  numDocumentoIdObligado: string
  payloadJson: string
  estadoValidacion: 'PENDIENTE' | 'VALIDO' | 'APROBADO_MSPS' | 'RECHAZADO'
  cuv?: string
  createdAt: Date
}

export type LocalRipsValidationStatus = LocalRipsRecord['estadoValidacion']

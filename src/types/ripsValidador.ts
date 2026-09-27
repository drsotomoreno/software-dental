import type { RipsValidadorDocumento, RipsValidadorProfesional } from '../../shared/ripsValidadorMap.js'

/** Fila de IndexedDB. `documento` conserva el JSON del formulario. */
export interface RipsValidadorRecord {
  id: string
  clinicId?: string | null
  patientId?: string | null
  profesional?: RipsValidadorProfesional | null
  documento: RipsValidadorDocumento
  createdAt: string
  updatedAt: string
}

export interface SaveRipsValidadorInput {
  id?: string
  clinicId?: string | null
  patientId?: string | null
  profesional?: RipsValidadorProfesional | null
  documento?: RipsValidadorDocumento
  numDocumentoIdObligado?: string
  numFactura?: string | null
  tipoNota?: string | null
  numNota?: string | null
  usuarios?: RipsValidadorDocumento['usuarios']
}

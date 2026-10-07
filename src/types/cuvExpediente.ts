export type CuvEstado = 'aprobado' | 'notificado' | 'rechazado'

export interface CuvRegla {
  clase: string
  codigo: string
  descripcion: string
  observaciones?: string
  pathFuente?: string
  fuente?: string
}

export interface CuvAlerta {
  nivel: 'atencion' | 'rechazo'
  titulo: string
  detalle: string
  reglas: CuvRegla[]
}

export interface CuvIntento {
  id: string
  numero: number
  estado: CuvEstado
  estadoEtiqueta: string
  httpStatus?: number | null
  cuv?: string | null
  notificaciones: CuvRegla[]
  rechazos: CuvRegla[]
  respuestaCruda?: unknown
  source?: string | null
  startedAt: string
  finishedAt?: string | null
}

/** Expediente de validación asociado a una factura o a una atención. */
export interface CuvExpediente {
  id: string
  createdAt: string
  updatedAt: string
  cuv?: string | null
  numFactura?: string | null
  numDocumentoIdObligado?: string
  estado: CuvEstado
  estadoEtiqueta: string
  procesoId?: string | null
  fechaRadicacion?: string | null
  ambiente?: string | null
  modulo?: string | null
  source?: string | null
  invoiceId?: string | null
  clinicalRecordId?: string | null
  patientId?: string | null
  puedeReenviar: boolean
  alertas: CuvAlerta[]
  intentos: CuvIntento[]
}

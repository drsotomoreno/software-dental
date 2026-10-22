/** Tipo de documento cuyo consecutivo controla el titular. */
export type TipoDocumentoCobro = 'RECIBO_CAJA' | 'CUENTA_COBRO'

/**
 * Estado de cobro / RIPS de una atención de evolución.
 * PENDIENTE_PAGO es el valor por defecto de `atenciones.estado_rips`.
 */
export type EstadoRipsAtencion = 'PENDIENTE_PAGO' | 'PENDIENTE' | 'SIN_COSTO' | 'PAGADO'

/** Control atómico del último consecutivo emitido por el titular. */
export interface ConsecutivoPrestador {
  id: string
  usuarioTitularId: string
  tipoDocumento: TipoDocumentoCobro
  prefijo: string
  ultimoConsecutivo: number
  updatedAt: string
}

/** Recibo de caja o cuenta de cobro. El consecutivo es único por titular y tipo. */
export interface ReciboCaja {
  id: string
  usuarioTitularId: string
  tipoDocumento: TipoDocumentoCobro
  consecutivo: number
  prefijo: string
  numeroSoporte: string
  concepto?: string
  valor: number
  createdAt: string
}

/** Columnas de pago de `atenciones`, también embebidas en la nota de evolución. */
export interface CamposPagoAtencion {
  /** `atenciones.pago_id`. Null cuando la atención no tiene recibo. */
  pagoId?: string | null
  /** `atenciones.numero_soporte_pago`, por ejemplo RC-12. */
  numeroSoportePago?: string | null
  /** `atenciones.concepto_pago`. */
  conceptoPago?: string | null
  /** `atenciones.valor_procedimiento`. */
  valorProcedimiento?: number
  /** `atenciones.estado_rips`. */
  estadoRips?: EstadoRipsAtencion
}

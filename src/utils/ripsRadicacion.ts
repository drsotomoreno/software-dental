import type { RipsTransaction } from '../types/rips.ts'

export type VinculoRadicacion = 'recibo_interno' | 'fev' | 'valor_cero'
export type CanalRadicacionRips = 'fev' | 'sin_factura'

export interface ClasificacionRadicacion {
  canal: CanalRadicacionRips
  /** El paquete puede radicarse ante el Ministerio. */
  listo: boolean
  motivo: string
}

const VINCULOS = new Set<VinculoRadicacion>(['recibo_interno', 'fev', 'valor_cero'])

export function normalizarVinculoRadicacion(value: string | null | undefined): VinculoRadicacion | null {
  const text = String(value ?? '').trim()
  if (text === 'factura') return 'fev'
  if (VINCULOS.has(text as VinculoRadicacion)) return text as VinculoRadicacion
  return null
}

/**
 * FEV solo cuando hay factura electrónica (CUFE, XML o vínculo FEV).
 * Recibo estándar, atención particular o valor cero van sin factura.
 */
export function clasificarRadicacionRips(input: {
  vinculaciones?: Array<string | null | undefined>
  cufe?: string | null
  xmlFev?: string | null
}): ClasificacionRadicacion {
  const vinculaciones = (input.vinculaciones ?? [])
    .map((item) => normalizarVinculoRadicacion(item))
    .filter((item): item is VinculoRadicacion => item != null)
  const cufe = String(input.cufe ?? '').trim()
  const xmlFev = String(input.xmlFev ?? '').trim()
  const pideFev = vinculaciones.includes('fev') || Boolean(cufe || xmlFev)
  const pideSinFactura = vinculaciones.some((item) => item === 'recibo_interno' || item === 'valor_cero')

  if (pideFev && pideSinFactura) {
    return {
      canal: 'fev',
      listo: false,
      motivo:
        'Hay atenciones con factura electrónica y atenciones con recibo. Radique cada paquete por separado.',
    }
  }

  if (pideFev) {
    if (!cufe && !xmlFev) {
      return {
        canal: 'fev',
        listo: false,
        motivo:
          'La factura electrónica aún no tiene CUFE. La radicación del paquete FEV espera ese soporte.',
      }
    }
    return {
      canal: 'fev',
      listo: true,
      motivo: 'Paquete RIPS con factura electrónica listo para radicar ante el Ministerio de Salud.',
    }
  }

  return {
    canal: 'sin_factura',
    listo: true,
    motivo:
      'Paquete listo para radicar ante el Ministerio de Salud. RIPS sin factura, para registro epidemiológico y estadístico.',
  }
}

/** El MUV sin factura no lleva número de FEV. El recibo de caja se queda en la clínica. */
export function ripsParaRadicar<T extends Pick<RipsTransaction, 'numFactura'>>(
  rips: T,
  canal: CanalRadicacionRips,
): T {
  if (canal === 'sin_factura') return { ...rips, numFactura: null }
  return rips
}

type NotaRadicacion = {
  id?: string | number | null
  ripsMetadata?: {
    tipoVinculacionFinanciera?: string | null
    cuv?: string | null
  } | null
}

type PagoRadicacion = {
  documentKind?: string | null
  cufe?: string | null
}

type AtencionRadicacion = {
  evolutionNotes?: NotaRadicacion[] | null
  paymentControl?: PagoRadicacion[] | null
  orthodonticsPaymentControl?: PagoRadicacion[] | null
}

export function vinculosDeAtenciones(records: AtencionRadicacion[]): VinculoRadicacion[] {
  const vinculos: VinculoRadicacion[] = []
  for (const record of records) {
    for (const note of record.evolutionNotes ?? []) {
      const vinculo = normalizarVinculoRadicacion(note.ripsMetadata?.tipoVinculacionFinanciera)
      if (vinculo) vinculos.push(vinculo)
    }
    for (const pago of [...(record.paymentControl ?? []), ...(record.orthodonticsPaymentControl ?? [])]) {
      const vinculo = normalizarVinculoRadicacion(pago.documentKind)
      if (vinculo) vinculos.push(vinculo)
      if (String(pago.cufe ?? '').trim()) vinculos.push('fev')
    }
  }
  return vinculos
}

export function facturasDelPaquete<T extends { clinicalRecordIds?: Array<string | number> | null }>(
  records: Array<{ id?: string | number | null }>,
  invoices: T[],
): T[] {
  const ids = new Set(records.map((record) => String(record.id ?? '')).filter(Boolean))
  if (ids.size === 0) return []
  return invoices.filter((invoice) =>
    (invoice.clinicalRecordIds ?? []).some((id) => ids.has(String(id))),
  )
}

export function cufeDeAtenciones(
  records: AtencionRadicacion[],
  invoices: Array<{ cufe?: string | null }> = [],
): string {
  for (const invoice of invoices) {
    const cufe = String(invoice.cufe ?? '').trim()
    if (cufe) return cufe
  }
  for (const record of records) {
    for (const pago of [...(record.paymentControl ?? []), ...(record.orthodonticsPaymentControl ?? [])]) {
      const cufe = String(pago.cufe ?? '').trim()
      if (cufe) return cufe
    }
  }
  return ''
}

export function evolucionIdDeAtencion(record: AtencionRadicacion): string | null {
  const note = (record.evolutionNotes ?? []).find((item) => item.id != null)
  return note?.id == null ? null : String(note.id)
}

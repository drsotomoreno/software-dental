import type { EvolutionNote } from '../types/evolutionNote'
import type {
  CamposPagoAtencion,
  EstadoRipsAtencion,
  TipoDocumentoCobro,
} from '../types/atencionPago'

export const TIPOS_DOCUMENTO_COBRO: readonly TipoDocumentoCobro[] = [
  'RECIBO_CAJA',
  'CUENTA_COBRO',
]

export const ESTADOS_RIPS_ATENCION: readonly EstadoRipsAtencion[] = [
  'PENDIENTE_PAGO',
  'PENDIENTE',
  'SIN_COSTO',
  'PAGADO',
  'COBRADO_PROCESADO',
]

export const PREFIJO_RECIBO_CAJA = 'RC-'

export function assertTipoDocumentoCobro(value: string): TipoDocumentoCobro {
  if (value === 'RECIBO_CAJA' || value === 'CUENTA_COBRO') return value
  throw new Error('tipo_documento debe ser RECIBO_CAJA o CUENTA_COBRO.')
}

/** Prefijo persistido en `consecutivos_prestador.prefijo` (máximo 10). */
export function normalizarPrefijo(prefijo?: string | null): string {
  const value = String(prefijo ?? PREFIJO_RECIBO_CAJA).trim() || PREFIJO_RECIBO_CAJA
  if (value.length > 10) {
    throw new Error('El prefijo del consecutivo no puede superar 10 caracteres.')
  }
  return value
}

/** Siguiente entero del titular. El 0 inicial de la tabla reserva el 1. */
export function siguienteConsecutivo(ultimo: number | null | undefined): number {
  const actual = Number(ultimo)
  if (!Number.isFinite(actual) || actual < 0) return 1
  return Math.trunc(actual) + 1
}

export function numeroSoportePago(prefijo: string, consecutivo: number): string {
  const numero = Math.trunc(Number(consecutivo))
  if (!Number.isInteger(numero) || numero < 1) {
    throw new Error('El consecutivo del soporte debe ser un entero mayor a cero.')
  }
  return `${normalizarPrefijo(prefijo)}${numero}`
}

export function normalizarValorProcedimiento(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed * 100) / 100
}

export function leerEstadoRips(value: unknown): EstadoRipsAtencion {
  const raw = String(value ?? '').trim().toUpperCase()
  if (
    raw === 'PENDIENTE_PAGO' ||
    raw === 'PENDIENTE' ||
    raw === 'SIN_COSTO' ||
    raw === 'PAGADO' ||
    raw === 'COBRADO_PROCESADO'
  ) {
    return raw
  }
  return 'PENDIENTE_PAGO'
}

export interface AtencionPagoVinculo {
  pagoId?: string | null
  numeroSoportePago?: string | null
  conceptoPago?: string | null
  valorProcedimiento?: number
  estadoRips?: EstadoRipsAtencion
  /** Marca la atención como sin costo y suelta el recibo. */
  sinCosto?: boolean
  /** Marca la atención como pendiente, sin recibo asociado. */
  pendiente?: boolean
}

/**
 * Asocia la atención a un pago, o la deja sin costo / pendiente.
 * No modifica el contenido clínico: el hash de la nota firmada sigue igual.
 */
export function vincularPagoAtencion<T extends CamposPagoAtencion>(
  note: T,
  vinculo: AtencionPagoVinculo,
): T {
  const sinCosto = vinculo.sinCosto === true || vinculo.estadoRips === 'SIN_COSTO'
  const pendiente =
    !sinCosto && (vinculo.pendiente === true || vinculo.estadoRips === 'PENDIENTE')
  const pagoId = sinCosto || pendiente ? null : vinculo.pagoId?.trim() || null
  const estadoRips: EstadoRipsAtencion = sinCosto
    ? 'SIN_COSTO'
    : pagoId
      ? 'PAGADO'
      : pendiente
        ? 'PENDIENTE'
        : 'PENDIENTE_PAGO'

  return {
    ...note,
    pagoId,
    numeroSoportePago: pagoId
      ? (vinculo.numeroSoportePago ?? note.numeroSoportePago ?? null)
      : null,
    conceptoPago:
      vinculo.conceptoPago !== undefined ? vinculo.conceptoPago : (note.conceptoPago ?? null),
    valorProcedimiento: sinCosto
      ? 0
      : normalizarValorProcedimiento(
          vinculo.valorProcedimiento ?? note.valorProcedimiento ?? 0,
        ),
    estadoRips,
  }
}

export function vincularPagoEnNotas(
  notes: EvolutionNote[],
  noteId: string,
  vinculo: AtencionPagoVinculo,
): EvolutionNote[] {
  return notes.map((note) =>
    note.id === noteId ? vincularPagoAtencion(note, vinculo) : note,
  )
}

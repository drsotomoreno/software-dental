import { db } from '@/db/database'
import type { EstadoValidacionRips, LocalRipsRecord } from '@/db/localRipsDatabase'
import type { RipsTransaction } from '@/types/rips'
import { validarEstructuraRips, type PaqueteRIPS } from '@/utils/ripsValidator'

export interface GuardarRipsLocalInput {
  id?: number
  numFactura: string
  numDocumentoIdObligado: string
  tipoNota?: string | null
  /** Objeto del formulario o JSON ya serializado. */
  payload: PaqueteRIPS | string
  cuv?: string
  /** `PENDIENTE` guarda el borrador sin pasar por el validador. */
  estadoValidacion?: EstadoValidacionRips
}

function serializarPayload(payload: PaqueteRIPS | string): string {
  return typeof payload === 'string' ? payload : JSON.stringify(payload)
}

function leerPayload(payloadJson: string): PaqueteRIPS | null {
  try {
    const parsed = JSON.parse(payloadJson) as PaqueteRIPS
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Persiste el paquete y el resultado de `validarEstructuraRips`.
 * Un JSON inválido queda en `RECHAZADO` para poder corregirlo.
 */
export async function guardarRipsLocal(input: GuardarRipsLocalInput): Promise<{
  record: LocalRipsRecord
  isValid: boolean
  errors: string[]
}> {
  const payloadJson = serializarPayload(input.payload)
  const paquete = leerPayload(payloadJson)
  let errors: string[] = []
  let estado: EstadoValidacionRips = input.estadoValidacion ?? 'PENDIENTE'

  if (input.estadoValidacion === 'PENDIENTE') {
    estado = 'PENDIENTE'
  } else if (!paquete) {
    estado = 'RECHAZADO'
    errors = ['El payloadJson no es un JSON de RIPS interpretable.']
  } else {
    const estructura = validarEstructuraRips(paquete)
    errors = estructura.errors
    estado = estructura.isValid ? 'VALIDO' : 'RECHAZADO'
  }

  const previous = input.id != null ? await db.ripsRecords.get(input.id) : undefined
  const record: LocalRipsRecord = {
    id: input.id,
    numFactura: input.numFactura,
    numDocumentoIdObligado: input.numDocumentoIdObligado,
    tipoNota: input.tipoNota ?? null,
    payloadJson,
    estadoValidacion: estado,
    cuv: input.cuv ?? previous?.cuv,
    createdAt: previous?.createdAt ?? new Date(),
  }
  const id = await db.ripsRecords.put(record)
  return {
    record: { ...record, id },
    isValid: estado === 'VALIDO',
    errors,
  }
}

export async function listarRipsLocales(estado?: EstadoValidacionRips): Promise<LocalRipsRecord[]> {
  const rows = estado
    ? await db.ripsRecords.where('estadoValidacion').equals(estado).toArray()
    : await db.ripsRecords.toArray()
  return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function listarRipsLocalesPorFactura(numFactura: string): Promise<LocalRipsRecord[]> {
  return db.ripsRecords.where('numFactura').equals(numFactura).toArray()
}

/**
 * Toma el JSON oficial de salida y lo deja en la forma que revisa el validador local.
 */
export function paqueteDesdeRipsOficial(rips: RipsTransaction): PaqueteRIPS {
  return {
    numDocumentoIdObligado: rips.numDocumentoIdObligado,
    numFactura: rips.numFactura ?? '',
    tipoNota: rips.tipoNota,
    numNota: rips.numNota,
    usuarios: (rips.usuarios ?? []).map((usuario) => ({
      tipoDocumentoIdentificacion: usuario.tipoDocumentoIdentificacion,
      numDocumentoIdentificacion: usuario.numDocumentoIdentificacion,
      tipoUsuario: usuario.tipoUsuario,
      fechaNacimiento: usuario.fechaNacimiento,
      sexo: usuario.codSexo as 'M' | 'F',
      servicios: {
        consultas: (usuario.servicios?.consultas ?? []).map((consulta) => ({
          codPrestador: consulta.codPrestador,
          fechaHoraInicioAtencion: consulta.fechaInicioAtencion,
          codConsulta: consulta.codConsulta,
          modalidadGrupoServicioTecnol: consulta.modalidadGrupoServicioTecSal,
          grupoServicios: consulta.grupoServicios,
          codServicio: consulta.codServicio,
          finalidadTecnologiaSalud: consulta.finalidadTecnologiaSalud,
          causaExterna: consulta.causaMotivoAtencion,
          tipoDiagnosticoPrincipal: consulta.tipoDiagnosticoPrincipal,
          codDiagnosticoPrincipal: consulta.codDiagnosticoPrincipal,
          valorConsulta: consulta.vrServicio,
          conceptoRecaudo: consulta.conceptoRecaudo,
          valorPagoModerador: consulta.valorPagoModerador,
        })),
        procedimientos: usuario.servicios?.procedimientos ?? [],
      },
    })),
  }
}

/**
 * Valida la consulta odontológica y la guarda en Dexie antes de generar el archivo de salida.
 * Un CUPS 89 que no termina en 03 queda RECHAZADO y no debe exportarse.
 */
export async function guardarYValidarRipsLocalmente(
  paquete: PaqueteRIPS,
): Promise<{ success: boolean; errors: string[] }> {
  const errors = validarEstructuraRips(paquete).errors
  const record: LocalRipsRecord = {
    numFactura: paquete.numFactura || 'SIN_FACTURA',
    numDocumentoIdObligado: paquete.numDocumentoIdObligado,
    tipoNota: paquete.tipoNota,
    payloadJson: JSON.stringify(paquete, null, 2),
    estadoValidacion: errors.length === 0 ? 'VALIDO' : 'RECHAZADO',
    createdAt: new Date(),
  }
  await db.ripsRecords.add(record)
  return {
    success: errors.length === 0,
    errors,
  }
}

export async function asignarCuvRipsLocal(id: number, cuv: string): Promise<LocalRipsRecord | undefined> {
  const current = await db.ripsRecords.get(id)
  if (!current) return undefined
  const next = { ...current, cuv }
  await db.ripsRecords.put(next)
  return next
}

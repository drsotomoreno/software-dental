/**
 * Cierra una evolución sin cobro: crea el agrupador de $0, lo enlaza,
 * deja la atención en PROCESADO y radica el RIPS en el MUV de producción.
 */
import { withPgClient } from './durableStore.js'
import { ensureCobroSchema } from './cobroConsecutivosRepository.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'
import {
  ReciboCajaRipsError,
  SQL_GUARDAR_CUV_RECIBO,
  SQL_INSERT_RECIBO,
  compilarRipsReciboCaja,
} from './reciboCajaRips.js'
import { SisproMuvService } from './sisproMuvService.js'
import { evolucionFirmada, fechaDeEvolucion, instanteRips } from '../../shared/reciboAnticipoRips.js'
import {
  ESTADO_PROCESADO,
  MUV_PRODUCCION_BASE,
  etiquetaMotivoSinCosto,
  motivoSinCostoDe,
  numeroPaqueteSinCosto,
  prefijoTransmisionSinCosto,
} from '../../shared/ripsSinCosto.js'

export const MUV_SIN_COSTO_PRODUCCION =
  `${MUV_PRODUCCION_BASE}/api/PaquetesFevRips/CargarRipsSinFactura`

export const SQL_VINCULAR_SIN_COSTO = `
  UPDATE atenciones
  SET pago_id = $1::uuid,
      numero_soporte_pago = $2,
      concepto_pago = $3,
      valor_procedimiento = 0,
      estado_rips = 'PROCESADO',
      updated_at = NOW()
  WHERE pago_id IS NULL
    AND (estado_rips IS NULL OR estado_rips IN ('PENDIENTE_PAGO', 'PENDIENTE', 'SIN_COSTO'))
    AND (id::text = ANY($4::text[]) OR evolution_note_id = ANY($4::text[]))
`

export const SQL_INSERTAR_ATENCION_SIN_COSTO = `
  INSERT INTO atenciones (
    evolution_note_id, usuario_titular_id, pago_id, numero_soporte_pago,
    concepto_pago, valor_procedimiento, estado_rips
  )
  SELECT id, $2::uuid, $3::uuid, $4, $5, 0, 'PROCESADO'
  FROM unnest($1::text[]) AS id
  WHERE NOT EXISTS (
    SELECT 1 FROM atenciones a
    WHERE a.evolution_note_id = id OR a.id::text = id
  )
`

function cupsDe(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length < 6) return ''
  return digits.slice(-6)
}

/** Una fila JSON por CUPS. El id de la evolución se conserva para el enlace. */
export function lineasRipsDeEvolucion(evolucion) {
  const vistos = []
  const agregar = (code) => {
    const cups = cupsDe(code)
    if (cups && !vistos.includes(cups)) vistos.push(cups)
  }
  agregar(evolucion?.cupsCode ?? evolucion?.codProcedimiento ?? evolucion?.codConsulta)
  for (const servicio of evolucion?.catalogServices ?? []) {
    if (servicio?.requiereCupsRips === false) continue
    agregar(servicio?.cupsCode ?? servicio?.procedure ?? servicio?.serviceName)
  }
  if (vistos.length === 0) {
    return [{ ...evolucion, es_sin_costo: true, esSinCosto: true }]
  }
  return vistos.map((cupsCode) => ({
    ...evolucion,
    cupsCode,
    es_sin_costo: true,
    esSinCosto: true,
    esPersonalizado: false,
  }))
}

function fechaMasReciente(evoluciones) {
  let mejor = ''
  let mejorMs = Number.NEGATIVE_INFINITY
  for (const evolucion of evoluciones) {
    const fecha = fechaDeEvolucion(evolucion)
    const ms = instanteRips(fecha, false)
    if (Number.isFinite(ms) && ms >= mejorMs) {
      mejorMs = ms
      mejor = fecha
    }
  }
  return mejor
}

function cuvDe(respuesta) {
  return String(respuesta?.cuv ?? respuesta?.CUV ?? '').replace(/\s/g, '').trim()
}

export function compilarPaqueteSinCosto(input) {
  const motivo = motivoSinCostoDe(input?.motivo ?? input?.motivoSinCosto)
  const prefijo = prefijoTransmisionSinCosto(motivo)
  const evoluciones = (Array.isArray(input?.evoluciones) ? input.evoluciones : []).flatMap(lineasRipsDeEvolucion)
  const numero = String(input?.numero ?? '').trim()
  if (!numero) {
    throw new ReciboCajaRipsError('El agrupador sin costo necesita su consecutivo.', 'NUMERO')
  }
  const compilado = compilarRipsReciboCaja({
    sinCosto: true,
    prefijo,
    fechaTransmision: input?.fechaTransmision,
    recibo: {
      numero,
      prefijo,
      fechaExpedicion: input?.fechaExpedicion || fechaMasReciente(evoluciones),
      valorTotal: 0,
      concepto: etiquetaMotivoSinCosto(motivo),
      sinCosto: true,
    },
    evoluciones,
    paciente: input?.paciente,
    prestador: input?.prestador,
  })
  return { ...compilado, motivo, prefijo, concepto: etiquetaMotivoSinCosto(motivo) }
}

/**
 * @param {{ query: Function }} client
 */
export async function persistirAgrupadorSinCosto(client, data) {
  const insertado = await client.query(SQL_INSERT_RECIBO, [
    data.usuarioTitularId,
    data.consecutivo,
    data.prefijo,
    data.numero,
    data.concepto,
    0,
    data.fechaExpedicion,
    data.fechaCorteRips ?? null,
    data.codPrestador,
    ESTADO_PROCESADO,
    JSON.stringify({
      identificadorPaquete: data.numero,
      sinCosto: true,
      motivo: data.motivo,
      fechaRecaudo: data.fechaExpedicion,
      fechaCorteRips: data.fechaCorteRips ?? null,
      rips: data.rips ?? null,
    }),
  ])
  const recibo = insertado.rows[0]
  const ids = data.evolucionIds
  const vinculo = await client.query(SQL_VINCULAR_SIN_COSTO, [
    recibo.id,
    data.numero,
    data.concepto,
    ids,
  ])
  const creadas = await client.query(SQL_INSERTAR_ATENCION_SIN_COSTO, [
    ids,
    data.usuarioTitularId,
    recibo.id,
    data.numero,
    data.concepto,
  ])
  if (vinculo.rowCount + creadas.rowCount !== ids.length) {
    throw new ReciboCajaRipsError(
      'Hay evoluciones que ya estaban cobradas o no se pudieron enlazar. No se armó el agrupador.',
      'EVOLUCIONES',
    )
  }
  return { ...recibo, numero_soporte: data.numero, evolucionIds: ids, estado: ESTADO_PROCESADO }
}

function validarPaquete(compilado) {
  const localIssues = validateRipsPackageLocally(compilado.rips, {
    allowNullNumFactura: true,
    fechaGeneracion: compilado.fechaCorte,
    codPrestador: compilado.codPrestador,
    perfilFiscal: 'No_Obligado',
  })
  if (hasBlockingValidationErrors(localIssues)) {
    throw new ReciboCajaRipsError(
      localIssues.find((issue) => issue.level === 'error')?.message ?? 'RIPS inválido.',
      'RIPS_INVALIDO',
    )
  }
}

async function enviarAProduccion(envelope) {
  const service = new SisproMuvService({
    baseUrl: MUV_PRODUCCION_BASE,
    loginUrl: `${MUV_PRODUCCION_BASE}/api/Auth/LoginSISPRO`,
  })
  const respuesta = await service.enviar(envelope)
  return {
    httpStatus: respuesta.httpStatus,
    cuv: respuesta.cuv,
    success: respuesta.success,
    message: respuesta.errors?.[0]?.message,
  }
}

function idsDe(evoluciones) {
  const ids = [...new Set(evoluciones.map((item) => String(item?.id ?? '').trim()).filter(Boolean))]
  if (ids.length !== evoluciones.length) {
    throw new ReciboCajaRipsError('Cada evolución sin costo necesita un identificador.', 'EVOLUCIONES')
  }
  return ids
}

/**
 * @param {object} input
 * @param {{ guardar?: Function, enviar?: Function, guardarCuv?: Function, client?: { query: Function } }} [deps]
 */
export async function cerrarYTransmitirRipsSinCosto(input, deps = {}) {
  const evoluciones = Array.isArray(input?.evoluciones) ? input.evoluciones : []
  if (evoluciones.length === 0) {
    throw new ReciboCajaRipsError('Seleccione al menos una evolución sin costo.', 'SIN_EVOLUCIONES')
  }
  if (evoluciones.some((item) => !evolucionFirmada(item))) {
    throw new ReciboCajaRipsError(
      'Firme la evolución antes de cerrarla y transmitir el RIPS.',
      'FIRMA',
    )
  }
  const motivo = motivoSinCostoDe(input?.motivo ?? input?.motivoSinCosto ?? evoluciones[0]?.motivoSinCosto)
  const prefijo = prefijoTransmisionSinCosto(motivo)
  const evolucionIds = idsDe(evoluciones)
  const retransmitir = input?.retransmitir === true && String(input?.reciboId ?? '').trim() && String(input?.numero ?? '').trim()

  const armar = (numero) => {
    const compilado = compilarPaqueteSinCosto({ ...input, motivo, numero, evoluciones })
    validarPaquete(compilado)
    return compilado
  }

  let compilado
  let recibo
  if (retransmitir) {
    compilado = armar(String(input.numero).trim())
    recibo = { id: String(input.reciboId).trim(), numero_soporte: compilado.identificadorPaquete }
  } else if (deps.guardar) {
    const numero = String(input?.numero ?? '').trim() || numeroPaqueteSinCosto(prefijo, input?.consecutivo || 1)
    compilado = armar(numero)
    recibo = await deps.guardar({
      usuarioTitularId: input.usuarioTitularId,
      prefijo,
      numero,
      consecutivo: input?.consecutivo || 1,
      motivo,
      concepto: compilado.concepto,
      fechaExpedicion: compilado.fechaRecaudo,
      fechaCorteRips: compilado.fechaCorte,
      estado: ESTADO_PROCESADO,
      valorTotal: 0,
      codPrestador: compilado.codPrestador,
      evolucionIds,
      rips: compilado.rips,
    })
  } else {
    await ensureCobroSchema()
    const persistido = await withPgClient(async (client) => {
      await client.query('BEGIN')
      try {
        const reserva = await client.query(
          'SELECT reservar_consecutivo_prestador($1::uuid, $2, $3) AS consecutivo',
          [input.usuarioTitularId, 'RECIBO_CAJA', prefijo],
        )
        const consecutivo = Number(reserva.rows?.[0]?.consecutivo)
        const numero = numeroPaqueteSinCosto(prefijo, consecutivo)
        const armado = armar(numero)
        const guardado = await persistirAgrupadorSinCosto(client, {
          usuarioTitularId: input.usuarioTitularId,
          prefijo,
          numero,
          consecutivo,
          motivo,
          concepto: armado.concepto,
          fechaExpedicion: armado.fechaRecaudo,
          fechaCorteRips: armado.fechaCorte,
          codPrestador: armado.codPrestador,
          evolucionIds,
          rips: armado.rips,
        })
        await client.query('COMMIT')
        return { compilado: armado, recibo: guardado }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    })
    compilado = persistido.compilado
    recibo = persistido.recibo
  }

  const enviar = deps.enviar ?? enviarAProduccion
  const respuesta = await enviar({ rips: compilado.rips })
  const http = Number(respuesta?.httpStatus ?? respuesta?.status)
  const cuv = cuvDe(respuesta)
  const aceptado = (http === 200 || http === 201) && Boolean(cuv)
  if (!aceptado) {
    const fallo = new ReciboCajaRipsError(
      respuesta?.message || 'El MUV no aceptó el RIPS sin costo. El agrupador quedó en Procesado, sin CUV.',
      'MUV_SIN_CUV',
    )
    fallo.reciboId = recibo.id
    fallo.identificadorPaquete = compilado.identificadorPaquete
    throw fallo
  }

  const guardarCuv = deps.guardarCuv ?? (async ({ id, cuv: codigo }) => {
    await withPgClient((client) => client.query(SQL_GUARDAR_CUV_RECIBO, [id, codigo]))
  })
  await guardarCuv({ id: recibo.id, cuv })

  return {
    recibo: { ...recibo, cuv, estado: 'TRANSMITIDO' },
    identificadorPaquete: compilado.identificadorPaquete,
    motivo,
    prefijo,
    rips: compilado.rips,
    cuv,
    solicitudesMuv: 1,
    transmitido: true,
    estado: 'TRANSMITIDO',
    estadoAtencion: ESTADO_PROCESADO,
    valorTotal: 0,
    endpoint: MUV_SIN_COSTO_PRODUCCION,
    fechaRecaudo: compilado.fechaRecaudo,
    fechaCorte: compilado.fechaCorte,
  }
}

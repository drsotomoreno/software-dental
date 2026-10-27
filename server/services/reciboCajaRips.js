/**
 * RIPS sin FEV (Res. 2275) agrupado por un recibo de caja.
 * Varias evoluciones, de citas distintas, salen en un solo JSON y un solo POST
 * a CargarRipsSinFactura. numFactura queda null: no hay FEV DIAN que cruzar.
 * El número del recibo es el identificador del paquete.
 */
import { withPgClient } from './durableStore.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'
import { formatFechaAtencion } from './ripsMapper.js'
import { SisproMuvService } from './sisproMuvService.js'

/** Producción del MUV. El cliente usa esta base cuando MINSALUD_SANDBOX=false. */
export const MUV_SIN_FACTURA_PRODUCCION =
  'https://fevrips.sispro.gov.co/fevrips-api/api/PaquetesFevRips/CargarRipsSinFactura'

/** Catálogo RIPS: particular / paciente. No se envía NIT de EPS. */
export const TIPO_USUARIO_PARTICULAR = '04'

export const ESTADO_COBRADO_PROCESADO = 'COBRADO_PROCESADO'

const COD_SERVICIO_ODONTOLOGIA = 344

export class ReciboCajaRipsError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]
   */
  constructor(message, code = 'RECIBO_RIPS') {
    super(message)
    this.name = 'ReciboCajaRipsError'
    this.code = code
  }
}

function pesos(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(parsed)
}

function cupsDe(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length < 6) return ''
  return digits.slice(-6)
}

/**
 * Capítulo 89.0 (890) es consulta. 893, como el control de ortodoncia, sigue siendo procedimiento:
 * el MUV no acepta ese CUPS dentro de consultas.
 * @param {string} cups
 */
export function esConsultaCups(cups) {
  return cupsDe(cups).startsWith('890')
}

function instante(raw, finDeDia) {
  const text = String(raw ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T${finDeDia ? '23:59:00' : '12:00:00'}-05:00`).getTime()
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) {
    return new Date(`${text.replace(' ', 'T')}:00-05:00`).getTime()
  }
  const parsed = new Date(text)
  return parsed.getTime()
}

function repsDe(prestador) {
  const digits = String(prestador?.repsCode ?? prestador?.codPrestador ?? '').replace(/\D/g, '')
  if (digits.length !== 12) {
    throw new ReciboCajaRipsError(
      'El código REPS del profesional logueado debe tener 12 dígitos.',
      'REPS',
    )
  }
  return digits
}

function documento(tipo, numero, campo) {
  const type = String(tipo ?? '').trim().toUpperCase() || 'CC'
  const number = String(numero ?? '').replace(/[^A-Za-z0-9]/g, '')
  if (!number) {
    throw new ReciboCajaRipsError(`${campo} es obligatorio.`, campo)
  }
  return { tipo: type, numero: number }
}

function cie10De(value) {
  return String(value ?? '').replace(/[.\s]/g, '').toUpperCase()
}

/**
 * Arma un único JSON. La fecha de cada línea es la de la evolución firmada,
 * nunca la del recibo. El recibo solo limita que esa fecha no quede en el futuro.
 * @param {{ recibo: object, evoluciones: object[], paciente: object, prestador: object }} input
 */
export function compilarRipsReciboCaja(input) {
  const recibo = input?.recibo ?? {}
  const evoluciones = Array.isArray(input?.evoluciones) ? input.evoluciones : []
  const numero = String(recibo.numero ?? recibo.numeroSoporte ?? '').trim()
  if (!numero) {
    throw new ReciboCajaRipsError('El número del recibo de caja es el identificador del paquete.', 'NUMERO')
  }
  if (evoluciones.length === 0) {
    throw new ReciboCajaRipsError('Seleccione al menos una evolución pendiente.', 'SIN_EVOLUCIONES')
  }

  const fechaRecibo = String(recibo.fechaExpedicion ?? recibo.fecha ?? '').trim()
  if (!fechaRecibo) {
    throw new ReciboCajaRipsError('La fecha de expedición del recibo de caja es obligatoria.', 'FECHA_RECIBO')
  }
  const tope = instante(fechaRecibo, true)
  if (!Number.isFinite(tope)) {
    throw new ReciboCajaRipsError('La fecha de expedición del recibo no es válida.', 'FECHA_RECIBO')
  }

  const prestadorDoc = documento(
    input.prestador?.documentType ?? input.prestador?.tipoDocumento,
    input.prestador?.documentNumber ?? input.prestador?.numeroDocumento,
    'documento del prestador',
  )
  const pacienteDoc = documento(
    input.paciente?.documentType ?? input.paciente?.tipoDocumento,
    input.paciente?.documentNumber ?? input.paciente?.numDocumento,
    'documento del paciente',
  )
  const codPrestador = repsDe(input.prestador)
  const nit = String(input.prestador?.providerNit ?? input.prestador?.nit ?? prestadorDoc.numero).replace(/\D/g, '')
  if (!nit) {
    throw new ReciboCajaRipsError('El documento del prestador obligado es obligatorio.', 'NIT')
  }

  const consultas = []
  const procedimientos = []
  const otrosServicios = []
  let consecutivoConsulta = 1
  let consecutivoProcedimiento = 1
  let consecutivoOtro = 1

  for (const evolucion of evoluciones) {
    const marcada = instante(evolucion.fechaEvolucion ?? evolucion.signedAt ?? evolucion.date, false)
    if (!Number.isFinite(marcada) || marcada > tope) {
      throw new ReciboCajaRipsError(
        `La evolución ${evolucion.id ?? ''} tiene fecha posterior a la expedición del recibo ${numero}.`,
        'FECHA_FUTURA',
      )
    }
    const fechaInicioAtencion = formatFechaAtencion(
      evolucion.fechaEvolucion ?? evolucion.signedAt ?? evolucion.date,
      'fechaInicioAtencion',
    )
    const cups = cupsDe(evolucion.cupsCode ?? evolucion.codProcedimiento ?? evolucion.codConsulta)
    const valor = pesos(evolucion.valorNeto ?? evolucion.valorProcedimiento ?? evolucion.cost)
    const cie10 = cie10De(evolucion.cie10 ?? evolucion.codDiagnosticoPrincipal)
    const base = {
      codPrestador,
      fechaInicioAtencion,
      numAutorizacion: null,
      tipoDocumentoIdentificacion: prestadorDoc.tipo,
      numDocumentoIdentificacion: prestadorDoc.numero,
      codDiagnosticoPrincipal: cie10,
      vrServicio: valor,
      conceptoRecaudo: '05',
      valorPagoModerador: 0,
      numFEVPagoModerador: null,
    }

    if (!cups || evolucion.esPersonalizado === true) {
      otrosServicios.push({
        ...base,
        idMIPRES: null,
        fechaSuministroTecnologia: fechaInicioAtencion,
        tipoOS: '01',
        codTecnologiaSalud: 'OTROS',
        nomTecnologiaSalud: String(evolucion.descripcion ?? evolucion.procedure ?? 'Servicio').trim() || 'Servicio',
        cantidadOS: 1,
        vrUnitOS: valor,
        consecutivo: consecutivoOtro,
      })
      consecutivoOtro += 1
      continue
    }

    if (esConsultaCups(cups)) {
      consultas.push({
        ...base,
        codConsulta: cups,
        modalidadGrupoServicioTecSal: '01',
        grupoServicios: '01',
        codServicio: COD_SERVICIO_ODONTOLOGIA,
        finalidadTecnologiaSalud: '11',
        causaMotivoAtencion: '38',
        codDiagnosticoRelacionado1: null,
        codDiagnosticoRelacionado2: null,
        codDiagnosticoRelacionado3: null,
        tipoDiagnosticoPrincipal: '02',
        consecutivo: consecutivoConsulta,
      })
      consecutivoConsulta += 1
      continue
    }

    procedimientos.push({
      ...base,
      idMIPRES: null,
      codProcedimiento: cups,
      viaIngresoServicioSalud: '01',
      modalidadGrupoServicioTecSal: '01',
      grupoServicios: '01',
      codServicio: COD_SERVICIO_ODONTOLOGIA,
      finalidadTecnologiaSalud: '11',
      codDiagnosticoRelacionado: null,
      codComplicacion: null,
      consecutivo: consecutivoProcedimiento,
    })
    consecutivoProcedimiento += 1
  }

  const servicios = [...consultas, ...procedimientos, ...otrosServicios]
  const suma = servicios.reduce((total, item) => total + pesos(item.vrServicio), 0)
  const valorRecibo = pesos(recibo.valorTotal ?? recibo.valor)
  if (suma !== valorRecibo) {
    throw new ReciboCajaRipsError(
      `La suma neta del RIPS (${suma}) debe ser exactamente igual al valor del recibo ${numero} (${valorRecibo}).`,
      'SUMA_RIPS',
    )
  }

  const municipio = String(input.paciente?.municipalityCode ?? input.paciente?.codMunicipioResidencia ?? '68001')
    .replace(/\D/g, '')
    .padStart(5, '0')
    .slice(-5)

  const rips = {
    numDocumentoIdObligado: nit,
    numFactura: null,
    tipoNota: null,
    numNota: null,
    usuarios: [
      {
        tipoDocumentoIdentificacion: pacienteDoc.tipo,
        numDocumentoIdentificacion: pacienteDoc.numero,
        tipoUsuario: TIPO_USUARIO_PARTICULAR,
        fechaNacimiento: String(input.paciente?.birthDate ?? input.paciente?.fechaNacimiento ?? '').slice(0, 10),
        codSexo: String(input.paciente?.gender ?? input.paciente?.codSexo ?? 'F').toUpperCase() === 'M' ? 'M' : 'F',
        codPaisResidencia: '170',
        codMunicipioResidencia: municipio,
        codZonaTerritorialResidencia: '02',
        incapacidad: 'NO',
        consecutivo: 1,
        codPaisOrigen: '170',
        servicios: {
          consultas,
          procedimientos,
          urgencias: [],
          hospitalizacion: [],
          recienNacidos: [],
          medicamentos: [],
          otrosServicios,
        },
      },
    ],
  }

  return {
    identificadorPaquete: numero,
    fechaExpedicion: fechaRecibo,
    codPrestador,
    valorTotal: valorRecibo,
    evolucionIds: evoluciones.map((item) => String(item.id)),
    rips,
  }
}

export const SQL_INSERT_RECIBO = `
  INSERT INTO recibos_caja (
    usuario_titular_id, tipo_documento, consecutivo, prefijo, numero_soporte,
    concepto, valor, fecha_expedicion, cod_prestador, estado, rips_json
  ) VALUES (
    $1::uuid, 'RECIBO_CAJA', $2::int, $3, $4,
    $5, $6::numeric, $7::timestamptz, $8, 'EMITIDO', $9::jsonb
  )
  RETURNING id, numero_soporte, valor, consecutivo
`

export const SQL_VINCULAR_EVOLUCIONES = `
  UPDATE atenciones
  SET pago_id = $1::uuid,
      numero_soporte_pago = $2,
      estado_rips = 'COBRADO_PROCESADO',
      updated_at = NOW()
  WHERE pago_id IS NULL
    AND estado_rips IN ('PENDIENTE_PAGO', 'PENDIENTE')
    AND (id::text = ANY($3::text[]) OR evolution_note_id = ANY($3::text[]))
`

export const SQL_GUARDAR_CUV_RECIBO = `
  UPDATE recibos_caja
  SET cuv = $2,
      estado = 'TRANSMITIDO',
      rips_fecha_transmision = NOW()
  WHERE id = $1::uuid
`

/**
 * Crea el recibo y marca las evoluciones cobradas en la misma transacción.
 * @param {{ query: Function }} client
 */
export async function guardarReciboCajaConEvoluciones(client, input) {
  const reserva = await client.query(
    'SELECT reservar_consecutivo_prestador($1::uuid, $2, $3) AS consecutivo',
    [input.usuarioTitularId, 'RECIBO_CAJA', input.prefijo || 'RC-'],
  )
  const consecutivo = Number(reserva.rows?.[0]?.consecutivo)
  const numero = input.numero || `${input.prefijo || 'RC-'}${consecutivo}`
  const insertado = await client.query(SQL_INSERT_RECIBO, [
    input.usuarioTitularId,
    consecutivo,
    input.prefijo || 'RC-',
    numero,
    input.concepto || 'Recibo de caja particular',
    input.valorTotal,
    input.fechaExpedicion,
    input.codPrestador,
    JSON.stringify({ identificadorPaquete: numero, rips: input.rips }),
  ])
  const recibo = insertado.rows[0]
  const vinculo = await client.query(SQL_VINCULAR_EVOLUCIONES, [
    recibo.id,
    numero,
    input.evolucionIds,
  ])
  if (vinculo.rowCount !== input.evolucionIds.length) {
    throw new ReciboCajaRipsError(
      'Hay evoluciones que ya estaban cobradas o no existen. No se armó el recibo.',
      'EVOLUCIONES',
    )
  }
  return { ...recibo, numero_soporte: numero, evolucionIds: input.evolucionIds }
}

function cuvDe(respuesta) {
  return String(respuesta?.cuv ?? respuesta?.CUV ?? '').replace(/\s/g, '').trim()
}

async function guardarReciboEnTransaccion(data) {
  return withPgClient(async (client) => {
    await client.query('BEGIN')
    try {
      const recibo = await guardarReciboCajaConEvoluciones(client, data)
      await client.query('COMMIT')
      return recibo
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  })
}

async function enviarUnSoloRips(envelope) {
  const service = new SisproMuvService()
  const respuesta = await service.enviar(envelope)
  return {
    httpStatus: respuesta.httpStatus,
    cuv: respuesta.cuv,
    success: respuesta.success,
    message: respuesta.errors?.[0]?.message,
  }
}

/**
 * Compila, persiste el 1:N y hace un solo POST. El CUV queda en el recibo.
 * @param {object} input
 * @param {{ client?: { query: Function }, guardar?: Function, guardarCuv?: Function, enviar?: Function }} [deps]
 */
export async function cobrarYRadicarReciboCaja(input, deps = {}) {
  const compilado = compilarRipsReciboCaja(input)
  const localIssues = validateRipsPackageLocally(compilado.rips, {
    allowNullNumFactura: true,
    fechaGeneracion: compilado.fechaExpedicion,
    codPrestador: compilado.codPrestador,
    perfilFiscal: 'No_Obligado',
  })
  if (hasBlockingValidationErrors(localIssues)) {
    throw new ReciboCajaRipsError(localIssues.find((issue) => issue.level === 'error')?.message ?? 'RIPS inválido.', 'RIPS_INVALIDO')
  }

  const guardar = deps.guardar ?? (deps.client
    ? (data) => guardarReciboCajaConEvoluciones(deps.client, data)
    : guardarReciboEnTransaccion)
  const recibo = await guardar({
    usuarioTitularId: input.usuarioTitularId,
    prefijo: input.prefijo,
    numero: compilado.identificadorPaquete,
    fechaExpedicion: compilado.fechaExpedicion,
    valorTotal: compilado.valorTotal,
    codPrestador: compilado.codPrestador,
    evolucionIds: compilado.evolucionIds,
    rips: compilado.rips,
  })

  const enviar = deps.enviar ?? enviarUnSoloRips
  const respuesta = await enviar({ rips: compilado.rips })
  const http = Number(respuesta?.httpStatus ?? respuesta?.status)
  const cuv = cuvDe(respuesta)
  const aceptado = (http === 200 || http === 201) && Boolean(cuv)
  if (!aceptado) {
    throw new ReciboCajaRipsError(
      respuesta?.message || 'El MUV no aceptó el RIPS sin factura. El recibo quedó sin CUV.',
      'MUV_SIN_CUV',
    )
  }

  const guardarCuv = deps.guardarCuv ?? (async ({ id, cuv: codigo }) => {
    if (deps.client) {
      await deps.client.query(SQL_GUARDAR_CUV_RECIBO, [id, codigo])
      return
    }
    await withPgClient((client) => client.query(SQL_GUARDAR_CUV_RECIBO, [id, codigo]))
  })
  await guardarCuv({ id: recibo.id, cuv })

  return {
    recibo: { ...recibo, cuv },
    identificadorPaquete: compilado.identificadorPaquete,
    rips: compilado.rips,
    cuv,
    solicitudesMuv: 1,
  }
}

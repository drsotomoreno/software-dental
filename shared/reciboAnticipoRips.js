/**
 * Anticipo: el dinero entra antes de que existan todas las evoluciones.
 * La fecha del recibo no puede ser la cabecera del RIPS si alguna atención
 * se firma después. El MUV compara fechaInicioAtencion contra esa cabecera.
 */

export const ESTADO_PENDIENTE_TRANSMISION = 'PENDIENTE_TRANSMISION'

const ESTADOS_SIN_FIRMAR = new Set(['SIN_REALIZAR', 'SIN_FIRMAR', 'SIN_REALIZAR_SIN_FIRMAR'])

function partes(ms) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const leer = (type) => parts.find((part) => part.type === type)?.value ?? '00'
  return {
    fecha: `${leer('year')}-${leer('month')}-${leer('day')}`,
    hora: `${leer('hour')}:${leer('minute')}`,
  }
}

export function formatearFechaRips(ms) {
  const { fecha, hora } = partes(ms)
  return `${fecha} ${hora}`
}

/** Date-only de un recibo cuenta hasta el cierre de ese día. Una evolución usa su hora. */
export function instanteRips(raw, finDeDia = false) {
  const text = String(raw ?? '').trim()
  if (!text) return Number.NaN
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T${finDeDia ? '23:59:00' : '12:00:00'}-05:00`).getTime()
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) {
    return new Date(`${text.replace(' ', 'T')}:00-05:00`).getTime()
  }
  return new Date(text).getTime()
}

export function fechaDeEvolucion(evolucion) {
  return String(evolucion?.fechaEvolucion ?? evolucion?.signedAt ?? evolucion?.date ?? '').trim()
}

export function evolucionFirmada(evolucion) {
  const estado = String(evolucion?.estadoClinico ?? evolucion?.estado ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s/]+/g, '_')
  if (ESTADOS_SIN_FIRMAR.has(estado)) return false
  if (evolucion?.sinRealizar === true || evolucion?.sinFirmar === true || evolucion?.firmada === false) {
    return false
  }
  if (evolucion?.firmada === true || evolucion?.isLocked === true) return true
  return Boolean(String(evolucion?.signedAt ?? '').trim())
}

function etiqueta(evolucion) {
  return String(evolucion?.descripcion ?? evolucion?.procedure ?? evolucion?.id ?? 'Evolución').trim()
}

/**
 * Cabecera del JSON: la última evolución, o el día en que se pulsa Transmitir
 * si ese día ya alcanzó la última firma. Nunca la fecha del anticipo si queda corta.
 */
export function resolverFechaCorteRips({ evoluciones = [], fechaRecaudo, fechaTransmision } = {}) {
  const marcas = evoluciones.map((evolucion) => ({
    evolucion,
    ms: instanteRips(fechaDeEvolucion(evolucion), false),
  }))
  const validas = marcas.filter((item) => Number.isFinite(item.ms))
  if (validas.length === 0) {
    return { ok: false, code: 'SIN_FECHAS', message: 'Ninguna evolución tiene fecha de atención.' }
  }

  const maxMs = validas.reduce((max, item) => Math.max(max, item.ms), validas[0].ms)
  const recaudoMs = instanteRips(fechaRecaudo, true)
  const anticipo = Number.isFinite(recaudoMs) && maxMs > recaudoMs
  let corteMs = anticipo || !Number.isFinite(recaudoMs) ? maxMs : recaudoMs

  if (fechaTransmision) {
    const transmiteMs = instanteRips(fechaTransmision, true)
    if (!Number.isFinite(transmiteMs) || transmiteMs < maxMs) {
      return {
        ok: false,
        code: 'FECHA_TRANSMISION',
        anticipo,
        fechaRecaudo: fechaRecaudo ?? null,
        fechaMaximaEvolucion: formatearFechaRips(maxMs),
        message:
          `No se puede transmitir el ${String(fechaTransmision)}: la última evolución es el ` +
          `${formatearFechaRips(maxMs)}. El reporte se consolida ese día o después.`,
      }
    }
    corteMs = transmiteMs
  }

  return {
    ok: true,
    anticipo,
    fechaRecaudo: fechaRecaudo ?? null,
    fechaMaximaEvolucion: formatearFechaRips(maxMs),
    fechaCorte: formatearFechaRips(corteMs),
  }
}

/**
 * El recibo puede existir desde el anticipo. El MUV solo se llama con el paquete firmado.
 */
export function evaluarTransmisionAnticipo({ evoluciones = [], fechaRecaudo, fechaTransmision } = {}) {
  const pendientes = evoluciones
    .filter((evolucion) => !evolucionFirmada(evolucion))
    .map((evolucion) => ({ id: String(evolucion?.id ?? ''), descripcion: etiqueta(evolucion) }))

  if (pendientes.length > 0) {
    return {
      puedeTransmitir: false,
      estado: ESTADO_PENDIENTE_TRANSMISION,
      code: 'PAQUETE_INCOMPLETO',
      pendientes,
      anticipo: true,
      fechaRecaudo: fechaRecaudo ?? null,
      message:
        `Recibo pendiente de transmisión RIPS. Faltan ${pendientes.length} evolución(es) ` +
        'sin realizar o sin firmar. El envío al MUV se habilita cuando el paquete clínico esté completo.',
    }
  }

  const corte = resolverFechaCorteRips({ evoluciones, fechaRecaudo, fechaTransmision })
  if (!corte.ok) {
    return {
      puedeTransmitir: false,
      estado: ESTADO_PENDIENTE_TRANSMISION,
      code: corte.code,
      pendientes: [],
      anticipo: corte.anticipo === true,
      fechaRecaudo: fechaRecaudo ?? null,
      fechaMaximaEvolucion: corte.fechaMaximaEvolucion,
      message: corte.message,
    }
  }

  return {
    puedeTransmitir: true,
    estado: 'LISTO',
    code: null,
    pendientes: [],
    anticipo: corte.anticipo,
    fechaRecaudo: corte.fechaRecaudo,
    fechaMaximaEvolucion: corte.fechaMaximaEvolucion,
    fechaCorte: corte.fechaCorte,
    message: corte.anticipo
      ? `El recaudo queda en ${corte.fechaRecaudo}. La cabecera del RIPS usa ${corte.fechaCorte}.`
      : `La cabecera del RIPS usa ${corte.fechaCorte}.`,
  }
}

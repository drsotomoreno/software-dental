/**
 * Adapta una consulta / atención odontológica de la historia clínica
 * al JSON de CargarRipsSinFactura que el Stage del MUV ya aceptó.
 *
 * vrServicio sale del valor pagado por el paciente. Un 0 dispara RVC091.
 * fechaInicioAtencion va en hora de Bogotá: YYYY-MM-DD HH:mm.
 */

import { splitUsuarioDocumento } from './fevRipsService.js'

const RIPS_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const REGIME_TO_TIPO_USUARIO = {
  contributivo: '01',
  subsidiado: '02',
  especial: '03',
  particular: '04',
}

const CERTAINTY_TO_TIPO_DIAGNOSTICO = {
  impresion: '01',
  confirmado: '02',
  repetido: '03',
}

const DEFAULT_COD_CONSULTA = '890203'
const DEFAULT_COD_SERVICIO = 344

export class RipsMapperError extends Error {
  /**
   * @param {string} message
   * @param {string} [field]
   */
  constructor(message, field) {
    super(message)
    this.name = 'RipsMapperError'
    this.field = field
  }
}

/**
 * @param {string | Date | number} raw
 * @returns {string} YYYY-MM-DD HH:mm en America/Bogota
 */
export function formatFechaInicioAtencion(raw) {
  const text = raw instanceof Date ? raw.toISOString() : String(raw ?? '').trim()
  if (!text) {
    throw new RipsMapperError('La fecha de atención es obligatoria.', 'fechaInicioAtencion')
  }

  if (RIPS_DATETIME_PATTERN.test(text)) return text

  if (DATE_ONLY_PATTERN.test(text)) {
    return formatBogotaDateTime(new Date(`${text}T12:00:00-05:00`))
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) {
    throw new RipsMapperError(
      `fechaInicioAtencion no se pudo interpretar: ${text}`,
      'fechaInicioAtencion',
    )
  }
  return formatBogotaDateTime(parsed)
}

function formatBogotaDateTime(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type) => parts.find((part) => part.type === type)?.value ?? '00'
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function positiveAmount(value) {
  if (value == null || value === '') return null
  const number = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(number) || number <= 0) return null
  return Math.round(number)
}

function sumPaid(records) {
  if (!Array.isArray(records)) return null
  const total = records.reduce((sum, item) => {
    const amount = Number(item?.amount ?? item?.valor ?? item?.valorPagado ?? item?.cost ?? 0)
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0)
  }, 0)
  return total > 0 ? Math.round(total) : null
}

/**
 * Valor pagado por el paciente. Nunca devuelve 0 (regla RVC091).
 * @param {object} atencion
 * @returns {number}
 */
export function resolveVrServicio(atencion) {
  const notes = Array.isArray(atencion?.evolutionNotes) ? atencion.evolutionNotes : []
  const candidates = [
    positiveAmount(atencion?.valorPagadoPaciente),
    positiveAmount(atencion?.valorPagado),
    positiveAmount(atencion?.montoPagado),
    positiveAmount(atencion?.amountPaid),
    positiveAmount(atencion?.vrServicio),
    sumPaid(atencion?.paymentControl),
    sumPaid(atencion?.pagos),
    sumPaid(atencion?.orthodonticsPaymentControl),
    positiveAmount(atencion?.budget?.total),
    positiveAmount(atencion?.cost),
    sumPaid(notes.filter((note) => note?.isBillable !== false)),
  ]
  const amount = candidates.find((value) => value != null)
  if (amount == null) {
    throw new RipsMapperError(
      'RVC091: el valor pagado por el paciente debe ser mayor que 0. Un vrServicio en 0 no es válido en RIPS sin factura.',
      'vrServicio',
    )
  }
  return amount
}

function patientOf(atencion) {
  return atencion?.paciente ?? atencion?.patient ?? atencion
}

function professionalOf(atencion, prestador) {
  return atencion?.profesional ?? atencion?.professional ?? prestador ?? {}
}

function normalizeCie10(code) {
  return String(code ?? '').replace(/\./g, '').trim().toUpperCase()
}

function normalizeCups(code) {
  const digits = digitsOnly(code)
  if (digits.length >= 6) return digits.slice(-6)
  return ''
}

function tipoUsuarioPaciente(patient, atencion) {
  const raw = patient?.tipoUsuario ?? patient?.regime ?? atencion?.tipoUsuario ?? atencion?.regime
  const key = String(raw ?? '').trim().toLowerCase()
  if (REGIME_TO_TIPO_USUARIO[key]) return REGIME_TO_TIPO_USUARIO[key]
  if (/^\d{2}$/.test(String(raw ?? '').trim())) return String(raw).trim()
  return '04'
}

function tipoDiagnostico(certainty) {
  const key = String(certainty ?? '').trim().toLowerCase()
  return CERTAINTY_TO_TIPO_DIAGNOSTICO[key] ?? '02'
}

function principalDiagnosis(atencion) {
  const list = Array.isArray(atencion?.diagnoses)
    ? atencion.diagnoses
    : Array.isArray(atencion?.diagnosticos)
      ? atencion.diagnosticos
      : []
  const principal = list.find((item) => item?.type === 'principal' || item?.tipo === 'principal') ?? list[0]
  const code = normalizeCie10(principal?.code ?? principal?.codigo ?? atencion?.codDiagnosticoPrincipal)
  if (!code) {
    throw new RipsMapperError('El diagnóstico principal CIE-10 es obligatorio.', 'codDiagnosticoPrincipal')
  }
  return {
    code,
    certainty: principal?.certainty ?? principal?.certeza ?? 'confirmado',
  }
}

function codConsultaOf(atencion) {
  const fromRecord = normalizeCups(atencion?.codConsulta ?? atencion?.cupsCode)
  if (fromRecord) return fromRecord
  const notes = Array.isArray(atencion?.evolutionNotes) ? atencion.evolutionNotes : []
  for (const note of notes) {
    const fromNote = normalizeCups(note?.cupsCode)
    if (fromNote.startsWith('890')) return fromNote
    for (const service of note?.catalogServices ?? []) {
      const cups = normalizeCups(service?.cupsCode)
      if (cups.startsWith('890')) return cups
    }
  }
  return DEFAULT_COD_CONSULTA
}

function fechaAtencionOf(atencion) {
  const notes = Array.isArray(atencion?.evolutionNotes) ? atencion.evolutionNotes : []
  return (
    atencion?.fechaInicioAtencion ??
    atencion?.fechaAtencion ??
    atencion?.signedAt ??
    notes[0]?.signedAt ??
    notes[0]?.date ??
    atencion?.createdAt
  )
}

function documentPair(tipo, numero) {
  const split = splitUsuarioDocumento(numero, tipo || 'CC')
  const num = split.numero.replace(/[^A-Za-z0-9]/g, '')
  if (!num) {
    throw new RipsMapperError('El número de documento es obligatorio.', 'numDocumentoIdentificacion')
  }
  return { tipo: split.tipo, numero: num }
}

function birthDate(patient) {
  const raw = patient?.fechaNacimiento ?? patient?.birthDate ?? patient?.fecha_nacimiento
  const text = String(raw ?? '').trim()
  if (DATE_ONLY_PATTERN.test(text)) return text
  if (!text) {
    throw new RipsMapperError('La fecha de nacimiento del paciente es obligatoria.', 'fechaNacimiento')
  }
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) {
    throw new RipsMapperError(`fechaNacimiento inválida: ${text}`, 'fechaNacimiento')
  }
  return formatBogotaDateTime(parsed).slice(0, 10)
}

function sexoOf(patient) {
  const raw = String(patient?.codSexo ?? patient?.gender ?? patient?.sexo ?? '').trim().toUpperCase()
  if (raw === 'F' || raw === 'M') return raw
  if (raw === 'O') return 'M'
  throw new RipsMapperError('codSexo del paciente debe ser M o F.', 'codSexo')
}

function codPrestadorOf(atencion, prestador) {
  const raw =
    atencion?.codPrestador ??
    atencion?.prestador?.codPrestador ??
    atencion?.prestador?.repsCode ??
    prestador?.codPrestador ??
    prestador?.repsCode
  const digits = digitsOnly(raw)
  if (!/^\d{12}$/.test(digits)) {
    throw new RipsMapperError('codPrestador debe tener exactamente 12 dígitos (REPS de la sede).', 'codPrestador')
  }
  return digits
}

function nitOf(atencion, prestador) {
  const raw =
    atencion?.numDocumentoIdObligado ??
    atencion?.prestador?.nit ??
    atencion?.prestador?.providerNit ??
    prestador?.nit ??
    prestador?.providerNit ??
    atencion?.professional?.providerNit ??
    atencion?.profesional?.providerNit
  const digits = digitsOnly(raw)
  if (!digits) {
    throw new RipsMapperError('El NIT del prestador (numDocumentoIdObligado) es obligatorio.', 'numDocumentoIdObligado')
  }
  return digits
}

function numNotaOf(atencion) {
  const explicit = String(atencion?.numNota ?? '').trim()
  if (/^[A-Za-z][A-Za-z0-9]{0,3}\d{1,20}$/.test(explicit)) return explicit
  const seed = digitsOnly(atencion?.id) || String(Date.now())
  return `RS${seed.slice(-13)}`
}

export class RipsMapper {
  /**
   * @param {object} [prestador] NIT, REPS y documento del profesional cuando la atención no los trae.
   */
  constructor(prestador = {}) {
    this.prestador = prestador ?? {}
  }

  /**
   * @param {object} atencion Consulta o registro clínico odontológico (paciente, diagnóstico, pagos).
   * @returns {object} Cuerpo `rips` de CargarRipsSinFactura
   */
  toRipsSinFactura(atencion) {
    if (!atencion || typeof atencion !== 'object') {
      throw new RipsMapperError('La atención odontológica es obligatoria.', 'atencion')
    }

    const patient = patientOf(atencion)
    const professional = professionalOf(atencion, this.prestador)
    const pacienteDoc = documentPair(
      patient?.tipoDocumentoIdentificacion ?? patient?.documentType ?? patient?.tipoDocumento,
      patient?.numDocumentoIdentificacion ?? patient?.documentNumber ?? patient?.numDocumento,
    )
    const profesionalDoc = documentPair(
      professional?.tipoDocumentoIdentificacion ??
        professional?.documentType ??
        professional?.tipoDocumento ??
        this.prestador?.tipoDocumento,
      professional?.numDocumentoIdentificacion ??
        professional?.documentNumber ??
        professional?.numeroDocumento ??
        this.prestador?.numeroDocumento,
    )
    const diagnostico = principalDiagnosis(atencion)
    const vrServicio = resolveVrServicio(atencion)

    return {
      numDocumentoIdObligado: nitOf(atencion, this.prestador),
      numFactura: null,
      tipoNota: 'RS',
      numNota: numNotaOf(atencion),
      usuarios: [
        {
          tipoDocumentoIdentificacion: pacienteDoc.tipo,
          numDocumentoIdentificacion: pacienteDoc.numero,
          tipoUsuario: tipoUsuarioPaciente(patient, atencion),
          fechaNacimiento: birthDate(patient),
          codSexo: sexoOf(patient),
          codPaisResidencia: String(patient?.codPaisResidencia ?? '170'),
          codMunicipioResidencia: digitsOnly(patient?.codMunicipioResidencia ?? patient?.municipalityCode ?? '11001').padStart(5, '0'),
          codZonaTerritorialResidencia: String(patient?.codZonaTerritorialResidencia ?? '02'),
          incapacidad: String(atencion?.incapacidad ?? 'NO').toUpperCase() === 'SI' ? 'SI' : 'NO',
          consecutivo: 1,
          codPaisOrigen: String(patient?.codPaisOrigen ?? '170'),
          servicios: {
            consultas: [
              {
                codPrestador: codPrestadorOf(atencion, this.prestador),
                fechaInicioAtencion: formatFechaInicioAtencion(fechaAtencionOf(atencion)),
                numAutorizacion: null,
                codConsulta: codConsultaOf(atencion),
                modalidadGrupoServicioTecSal: '01',
                grupoServicios: '01',
                codServicio: DEFAULT_COD_SERVICIO,
                finalidadTecnologiaSalud: '11',
                causaMotivoAtencion: '38',
                codDiagnosticoPrincipal: diagnostico.code,
                codDiagnosticoRelacionado1: null,
                codDiagnosticoRelacionado2: null,
                codDiagnosticoRelacionado3: null,
                tipoDiagnosticoPrincipal: tipoDiagnostico(diagnostico.certainty),
                tipoDocumentoIdentificacion: profesionalDoc.tipo,
                numDocumentoIdentificacion: profesionalDoc.numero,
                vrServicio,
                conceptoRecaudo: '05',
                valorPagoModerador: 0,
                numFEVPagoModerador: null,
                consecutivo: 1,
              },
            ],
          },
        },
      ],
    }
  }
}

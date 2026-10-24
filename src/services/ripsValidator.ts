import {
  DOCUMENT_TYPE_RIPS,
  REGIME_TO_TIPO_USUARIO,
  RIPS_DEFAULTS,
  TIPO_USUARIO_LABELS,
  isOdontologyConsultationCups,
} from '../constants/rips.ts'
import type { DocumentType, RegimeType } from '../types/patient.ts'
import type { EvolutionNote } from '../types/evolutionNote.ts'
import { CIE10_RIPS_PATTERN } from '../types/evolutionNoteRips.ts'
import type { RipsConsulta, RipsProcedimiento } from '../types/rips.ts'
import type { RipsEvolutionCloseData, RipsQueuePayload, RipsQueueUsuario } from '../types/ripsQueue.ts'
import { fechaAtencionRips } from '../utils/evolutionRipsPayload.ts'
import { cupsExplicitosDeTexto } from '../utils/cupsCodeResolve.ts'
import {
  RIPS_IDENTIFICATION_TYPE_RULES,
  isRipsIdentificationType,
} from '../constants/ripsIdentificationTypes.ts'
import { documentoObligadoDigits } from '../../shared/nit.js'

const CUPS_VALIDO = /^\d{6}$/
const CAUSA_EXTERNA = /^(?!00)\d{2}$/
const SEXO_RIPS = new Set(['M', 'F', 'I'])
/** CIE-11 MMS: DA08.0, 1A00, CA40. */
const CIE11_PATTERN = /^(?:[A-Z][A-Z0-9]{2,7}|[0-9][A-Z][A-Z0-9]{1,6})(?:\.[A-Z0-9]{1,4})?$/

const TIPOS_USUARIO = new Set(Object.keys(TIPO_USUARIO_LABELS))

export interface RipsLocalSchemaIssue {
  code: string
  message: string
  /** Campo de la historia o del paciente que la UI puede resaltar. */
  field: string
  path: string
}

export interface RipsLocalSchemaResult {
  valid: boolean
  errors: RipsLocalSchemaIssue[]
}

const FIELD_ALIASES: Record<string, readonly string[]> = {
  documentType: ['documentType', 'tipoDocumentoIdentificacion'],
  documentNumber: ['documentNumber', 'numDocumentoIdentificacion'],
  birthDate: ['birthDate', 'fechaNacimiento'],
  gender: ['gender', 'codSexo'],
  tipoUsuario: ['tipoUsuario'],
  causaExterna: ['causaExterna', 'causaMotivoAtencion'],
  cupsCode: ['cupsCode', 'codProcedimiento', 'codConsulta'],
  codDiagnosticoPrincipal: ['codDiagnosticoPrincipal'],
  codDiagnosticoPrincipalCIE11: ['codDiagnosticoPrincipalCIE11'],
}

export function highlightFieldsForRipsIssues(errors: readonly RipsLocalSchemaIssue[]): string[] {
  const fields: string[] = []
  for (const error of errors) {
    const aliases = FIELD_ALIASES[error.field] ?? [error.field]
    for (const alias of aliases) {
      if (!fields.includes(alias)) fields.push(alias)
    }
  }
  return fields
}

function issue(
  errors: RipsLocalSchemaIssue[],
  code: string,
  field: string,
  path: string,
  message: string,
): void {
  errors.push({ code, field, path, message })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  )
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function compactCie10(value: unknown): string {
  return text(value).replace(/[.\s]/g, '').toUpperCase()
}

function compactCie11(value: unknown): string {
  return text(value).replace(/\s/g, '').toUpperCase()
}

function isIsoBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map((part) => Number(part))
  if (!year || !month || !day) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function validateDocument(tipoRaw: unknown, numeroRaw: unknown): string | null {
  const tipo = text(tipoRaw).toUpperCase()
  const numero = text(numeroRaw)
  if (!tipo) return 'El tipo de documento del paciente es obligatorio.'
  if (tipo === 'NI' || tipo === 'NIT') {
    const digits = numero.replace(/\D/g, '')
    if (!/^\d{6,12}$/.test(digits)) {
      return 'El NIT del paciente debe contener entre 6 y 12 dígitos, sin guiones.'
    }
    return null
  }
  if (!isRipsIdentificationType(tipo)) {
    return `tipoDocumentoIdentificacion «${tipo}» no es válido para RIPS.`
  }
  if (!numero) return 'numDocumentoIdentificacion es obligatorio.'
  if (/[^A-Za-z0-9]/.test(numero)) {
    return 'numDocumentoIdentificacion no debe contener espacios, guiones ni caracteres especiales.'
  }
  const rule = RIPS_IDENTIFICATION_TYPE_RULES[tipo]
  if (rule.numericOnly && !/^\d+$/.test(numero)) {
    return `numDocumentoIdentificacion para ${tipo} debe contener solo dígitos.`
  }
  if (numero.length < rule.minLength || numero.length > rule.maxLength) {
    return `numDocumentoIdentificacion para ${rule.label} debe tener entre ${rule.minLength} y ${rule.maxLength} caracteres.`
  }
  return null
}

function validateDiagnosis(
  errors: RipsLocalSchemaIssue[],
  row: Record<string, unknown>,
  path: string,
): void {
  const cie10 = compactCie10(row.codDiagnosticoPrincipal)
  const cie11 = compactCie11(row.codDiagnosticoPrincipalCIE11)
  const cie10Valido = Boolean(cie10) && CIE10_RIPS_PATTERN.test(cie10)
  const cie11Valido = Boolean(cie11) && CIE11_PATTERN.test(cie11)

  if (!cie10 && !cie11) {
    issue(
      errors,
      'DIAGNOSIS',
      'codDiagnosticoPrincipal',
      `${path}.codDiagnosticoPrincipal`,
      'El diagnóstico principal CIE-10 o CIE-11 es obligatorio para RIPS.',
    )
    return
  }
  if (cie10 && !cie10Valido) {
    issue(
      errors,
      'DIAGNOSIS_CIE10',
      'codDiagnosticoPrincipal',
      `${path}.codDiagnosticoPrincipal`,
      'El diagnóstico principal CIE-10 no tiene un formato válido.',
    )
  }
  if (cie11 && !cie11Valido) {
    issue(
      errors,
      'DIAGNOSIS_CIE11',
      'codDiagnosticoPrincipalCIE11',
      `${path}.codDiagnosticoPrincipalCIE11`,
      'El diagnóstico principal CIE-11 no tiene un formato válido.',
    )
  }
  if (!cie10Valido && !cie11Valido) return
}

function causaDeFila(row: Record<string, unknown>): string {
  return text(row.causaMotivoAtencion || row.causaExterna)
}

/**
 * Comprueba el JSON RIPS antes de encolar.
 * No llama al MUV ni borra el borrador clínico: solo informa campos.
 */
export function validateRipsLocalSchema(payload: object): RipsLocalSchemaResult {
  const errors: RipsLocalSchemaIssue[] = []
  const root = asRecord(payload)
  if (!root) {
    issue(errors, 'PAYLOAD', 'jsonPayload', '', 'El JSON RIPS de la evolución no tiene una estructura válida.')
    return { valid: false, errors }
  }

  const usuarios = asRecords(root.usuarios)
  if (usuarios.length === 0) {
    issue(
      errors,
      'PAYLOAD',
      'documentType',
      'usuarios',
      'El RIPS debe incluir los datos del paciente.',
    )
    return { valid: false, errors }
  }

  usuarios.forEach((usuario, index) => {
    const base = `usuarios[${index}]`
    const tipoDocumento = text(usuario.tipoDocumentoIdentificacion)
    const numeroDocumento = text(usuario.numDocumentoIdentificacion)
    if (!tipoDocumento) {
      issue(
        errors,
        'DOCUMENT_TYPE',
        'documentType',
        `${base}.tipoDocumentoIdentificacion`,
        'El tipo de documento del paciente es obligatorio.',
      )
    }
    if (!numeroDocumento) {
      issue(
        errors,
        'DOCUMENT_NUMBER',
        'documentNumber',
        `${base}.numDocumentoIdentificacion`,
        'El número de documento del paciente es obligatorio.',
      )
    }
    if (tipoDocumento && numeroDocumento) {
      const documentError = validateDocument(tipoDocumento, numeroDocumento)
      if (documentError) {
        const aboutType = /tipoDocumento/i.test(documentError)
        issue(
          errors,
          aboutType ? 'DOCUMENT_TYPE' : 'DOCUMENT_NUMBER',
          aboutType ? 'documentType' : 'documentNumber',
          aboutType ? `${base}.tipoDocumentoIdentificacion` : `${base}.numDocumentoIdentificacion`,
          documentError,
        )
      }
    }

    const nacimiento = text(usuario.fechaNacimiento)
    if (!isIsoBirthDate(nacimiento)) {
      issue(
        errors,
        'BIRTH_DATE',
        'birthDate',
        `${base}.fechaNacimiento`,
        'La fecha de nacimiento del paciente es obligatoria y debe ir en formato YYYY-MM-DD.',
      )
    }

    const sexo = text(usuario.codSexo).toUpperCase()
    if (!SEXO_RIPS.has(sexo)) {
      issue(
        errors,
        'SEX',
        'gender',
        `${base}.codSexo`,
        'El sexo del paciente es obligatorio para RIPS (M, F o I).',
      )
    }

    const tipoUsuario = text(usuario.tipoUsuario)
    if (!TIPOS_USUARIO.has(tipoUsuario)) {
      issue(
        errors,
        'USER_TYPE',
        'tipoUsuario',
        `${base}.tipoUsuario`,
        'El tipo de usuario RIPS es obligatorio (catálogo SISPRO, dos dígitos).',
      )
    }

    const servicios = asRecord(usuario.servicios) ?? {}
    const consultas = asRecords(servicios.consultas)
    const procedimientos = asRecords(servicios.procedimientos)
    const causaUsuario = causaDeFila(usuario)

    if (consultas.length === 0 && !CAUSA_EXTERNA.test(causaUsuario)) {
      issue(
        errors,
        'EXTERNAL_CAUSE',
        'causaExterna',
        `${base}.causaExterna`,
        'La causa externa (causa motivo de atención) es obligatoria y debe ser un código de dos dígitos.',
      )
    }

    consultas.forEach((consulta, consultaIndex) => {
      const path = `${base}.servicios.consultas[${consultaIndex}]`
      const cups = text(consulta.codConsulta).replace(/\D/g, '')
      if (!CUPS_VALIDO.test(cups) || cups === '000000') {
        issue(
          errors,
          'CUPS',
          'cupsCode',
          `${path}.codConsulta`,
          'La consulta debe tener un código CUPS válido de 6 dígitos.',
        )
      }
      const causa = causaDeFila(consulta) || causaUsuario
      if (!CAUSA_EXTERNA.test(causa)) {
        issue(
          errors,
          'EXTERNAL_CAUSE',
          'causaExterna',
          `${path}.causaMotivoAtencion`,
          'La causa externa de la consulta es obligatoria (dos dígitos del catálogo RIPS).',
        )
      }
      validateDiagnosis(errors, consulta, path)
    })

    procedimientos.forEach((procedimiento, procedimientoIndex) => {
      const path = `${base}.servicios.procedimientos[${procedimientoIndex}]`
      const cups = text(procedimiento.codProcedimiento).replace(/\D/g, '')
      if (!CUPS_VALIDO.test(cups) || cups === '000000') {
        issue(
          errors,
          'CUPS',
          'cupsCode',
          `${path}.codProcedimiento`,
          'Cada procedimiento debe tener un código CUPS válido de 6 dígitos.',
        )
      }
      validateDiagnosis(errors, procedimiento, path)
    })

    if (consultas.length === 0 && procedimientos.length === 0) {
      issue(
        errors,
        'CUPS',
        'cupsCode',
        `${base}.servicios.procedimientos`,
        'La evolución debe incluir al menos un procedimiento o consulta con código CUPS.',
      )
      issue(
        errors,
        'DIAGNOSIS',
        'codDiagnosticoPrincipal',
        `${base}.codDiagnosticoPrincipal`,
        'El diagnóstico principal CIE-10 o CIE-11 es obligatorio para RIPS.',
      )
    }
  })

  return { valid: errors.length === 0, errors }
}

function tipoDocumentoRips(tipo: string | null | undefined): string {
  const key = text(tipo).toUpperCase()
  if (key in DOCUMENT_TYPE_RIPS) return DOCUMENT_TYPE_RIPS[key as DocumentType]
  return key
}

function fechaNacimientoRips(value: string | null | undefined): string {
  const raw = text(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const parsed = new Date(raw)
  if (!raw || Number.isNaN(parsed.getTime())) return raw
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed)
}

function tipoUsuarioRips(input: RipsEvolutionCloseData): string {
  const explicit = text(input.tipoUsuario || input.paciente.tipoUsuario)
  if (explicit) return explicit
  const regime = text(input.paciente.regime).toLowerCase() as RegimeType
  if (regime in REGIME_TO_TIPO_USUARIO) return REGIME_TO_TIPO_USUARIO[regime]
  return ''
}

function causaRips(input: RipsEvolutionCloseData): string {
  const explicit = text(input.causaExterna)
  if (explicit) return explicit
  return text(input.note.ripsMetadata?.causaMotivoAtencion)
}

function codigosCups(note: EvolutionNote): string[] {
  const fuentes: Array<string | null | undefined> = [
    note.cupsCode,
    ...(note.catalogServices ?? []).flatMap((service) =>
      service.requiereCupsRips === false ? [] : [service.cupsCode, service.procedure, service.serviceName],
    ),
  ]
  if (note.requiereCupsRips !== false) {
    fuentes.push(note.procedure, note.serviceName)
  }

  const vistos = new Set<string>()
  for (const fuente of fuentes) {
    const raw = text(fuente)
    if (!raw) continue
    const explicitos = cupsExplicitosDeTexto(raw)
    if (explicitos.length > 0) {
      for (const codigo of explicitos) vistos.add(codigo)
      continue
    }
    const compacto = raw.replace(/[.\s-]/g, '')
    if (/^\d{4,8}$/.test(compacto)) vistos.add(compacto)
  }
  return [...vistos]
}

function fechaAtencionSegura(note: EvolutionNote): string {
  try {
    return fechaAtencionRips(note.date || note.signedAt || note.createdAt)
  } catch {
    return ''
  }
}

function codPrestador(repsCode: string | null | undefined): string {
  const digits = text(repsCode).replace(/\D/g, '')
  return digits.length === 12 ? digits : ''
}

/**
 * Arma el JSON RIPS de la evolución sin exigir que ya esté firmada.
 * Los huecos quedan visibles para `validateRipsLocalSchema`.
 */
export function buildPreliminaryRipsJson(input: RipsEvolutionCloseData): RipsQueuePayload {
  const prestador = input.prestador ?? {}
  const metadata = input.note.ripsMetadata
  const cie10 = compactCie10(input.codDiagnosticoPrincipal || metadata?.codDiagnosticoPrincipal)
  const cie11 = compactCie11(input.codDiagnosticoPrincipalCIE11)
  const cie11Nombre = text(input.nomCodDiagnosticoPrincipalCIE11)
  const causa = causaRips(input)
  const cups = codigosCups(input.note)
  const valor = Math.round(input.note.valorProcedimiento ?? input.note.cost ?? 0)
  const prestadorDocTipo = tipoDocumentoRips(prestador.documentType)
  const prestadorDoc = text(prestador.documentNumber).replace(/[^A-Za-z0-9]/g, '')
  const fecha = fechaAtencionSegura(input.note)
  const sede = codPrestador(prestador.repsCode)
  const concepto = text(metadata?.conceptoRecaudo) || RIPS_DEFAULTS.conceptoRecaudoParticular
  const finalidad = text(metadata?.finalidadTecnologia) || RIPS_DEFAULTS.finalidadProcedimiento

  const consultas: RipsConsulta[] = []
  const procedimientos: RipsProcedimiento[] = []
  let consecutivoConsulta = 1
  let consecutivoProcedimiento = 1

  cups.forEach((codigo, index) => {
    const vrServicio = index === 0 ? valor : 0
    const diagnostico = {
      codDiagnosticoPrincipal: cie10,
      codDiagnosticoPrincipalCIE11: cie11,
      nomCodDiagnosticoPrincipalCIE11: cie11Nombre,
    }
    if (isOdontologyConsultationCups(codigo)) {
      consultas.push({
        codPrestador: sede,
        fechaInicioAtencion: fecha,
        numAutorizacion: null,
        codConsulta: codigo,
        modalidadGrupoServicioTecSal: RIPS_DEFAULTS.modalidadConsulta,
        grupoServicios: RIPS_DEFAULTS.grupoServiciosConsulta,
        codServicio: RIPS_DEFAULTS.codServicio,
        finalidadTecnologiaSalud: text(metadata?.finalidadTecnologia) || RIPS_DEFAULTS.finalidadConsulta,
        causaMotivoAtencion: causa,
        ...diagnostico,
        codDiagnosticoRelacionado1: null,
        codDiagnosticoRelacionado1CIE11: '',
        nomCodDiagnosticoRelacionado1CIE11: '',
        codDiagnosticoRelacionado2: null,
        codDiagnosticoRelacionado2CIE11: '',
        nomCodDiagnosticoRelacionado2CIE11: '',
        codDiagnosticoRelacionado3: null,
        codDiagnosticoRelacionado3CIE11: '',
        nomCodDiagnosticoRelacionado3CIE11: '',
        tipoDiagnosticoPrincipal: '02',
        tipoDocumentoIdentificacion: prestadorDocTipo,
        numDocumentoIdentificacion: prestadorDoc,
        vrServicio,
        conceptoRecaudo: concepto,
        valorPagoModerador: 0,
        numFEVPagoModerador: null,
        consecutivo: consecutivoConsulta,
        codigoVIDA: null,
      })
      consecutivoConsulta += 1
      return
    }
    procedimientos.push({
      codPrestador: sede,
      fechaInicioAtencion: fecha,
      idMIPRES: null,
      numAutorizacion: null,
      codProcedimiento: codigo,
      viaIngresoServicioSalud: RIPS_DEFAULTS.viaIngresoProcedimiento,
      modalidadGrupoServicioTecSal: RIPS_DEFAULTS.modalidadProcedimiento,
      grupoServicios: RIPS_DEFAULTS.grupoServiciosProcedimiento,
      codServicio: RIPS_DEFAULTS.codServicio,
      finalidadTecnologiaSalud: finalidad,
      tipoDocumentoIdentificacion: prestadorDocTipo,
      numDocumentoIdentificacion: prestadorDoc,
      ...diagnostico,
      codDiagnosticoRelacionado: null,
      codComplicacion: null,
      codComplicacionCIE11: '',
      nomComplicacionCIE11: '',
      vrServicio,
      conceptoRecaudo: concepto,
      valorPagoModerador: 0,
      numFEVPagoModerador: null,
      consecutivo: consecutivoProcedimiento,
      codigoVIDA: null,
    })
    consecutivoProcedimiento += 1
  })

  const municipio = text(input.paciente.municipalityCode).replace(/\D/g, '')
  const usuario: RipsQueueUsuario = {
    tipoDocumentoIdentificacion: tipoDocumentoRips(input.paciente.documentType),
    numDocumentoIdentificacion: text(input.paciente.documentNumber).replace(/[^A-Za-z0-9]/g, ''),
    tipoUsuario: tipoUsuarioRips(input),
    fechaNacimiento: fechaNacimientoRips(input.paciente.birthDate),
    codSexo: text(input.paciente.gender).toUpperCase(),
    codPaisResidencia: RIPS_DEFAULTS.codPaisResidencia,
    codMunicipioResidencia: municipio ? municipio.padStart(5, '0').slice(-5) : '',
    codZonaTerritorialResidencia: RIPS_DEFAULTS.codZonaTerritorialResidencia,
    incapacidad: RIPS_DEFAULTS.incapacidad,
    consecutivo: 1,
    codPaisOrigen: RIPS_DEFAULTS.codPaisOrigen,
    registroSIRAS: null,
    causaExterna: causa,
    causaMotivoAtencion: causa,
    servicios: {
      consultas,
      procedimientos,
      urgencias: [],
      hospitalizacion: [],
      recienNacidos: [],
      medicamentos: [],
      otrosServicios: [],
    },
  }

  return {
    numDocumentoIdObligado:
      documentoObligadoDigits(prestador.providerNit) ||
      documentoObligadoDigits(prestador.documentNumber) ||
      '',
    numFactura: null,
    tipoNota: null,
    numNota: null,
    usuarios: [usuario],
  }
}

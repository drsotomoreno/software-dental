import { z } from 'zod'
import { pullClinicSnapshot } from './clinicalSyncStore.js'
import { fevRipsPackageSchema } from './MinSaludService.js'
import { hasBlockingValidationErrors, validateRipsPackageLocally } from './ripsLocalValidator.js'
import { normalizePerfilFiscal, normalizeRipsNumFactura } from '../../shared/fiscalProfile.js'

const CUPS_PATTERN = /^\d{6}$/
const CONSULTA_PREFIXES = ['8902', '8903', '8907']

const REGIME_TO_TIPO_USUARIO = {
  contributivo: '01',
  subsidiado: '02',
  especial: '03',
  particular: '04',
}

const CERTAINTY_TO_RIPS = {
  impresion: '01',
  confirmado: '02',
  repetido: '03',
}

const DEFAULTS = {
  codPaisResidencia: '170',
  codPaisOrigen: '170',
  codZonaTerritorialResidencia: '01',
  incapacidad: '02',
  modalidadConsulta: '09',
  grupoServiciosConsulta: '01',
  modalidadProcedimiento: '01',
  grupoServiciosProcedimiento: '04',
  viaIngresoProcedimiento: '01',
  finalidadConsulta: '11',
  finalidadProcedimiento: '44',
  causaMotivoAtencion: '21',
  conceptoRecaudo: '05',
  codServicio: 1,
  codConsulta: '890203',
}

const lineaAtencionSchema = z
  .object({
    codPrestador: z.string().regex(/^\d{12}$/, 'codPrestador debe tener 12 dígitos.'),
    fechaInicioAtencion: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, 'fechaInicioAtencion debe ser YYYY-MM-DD HH:mm.'),
    consecutivo: z.number().int().positive(),
  })
  .passthrough()

const consultaSchema = lineaAtencionSchema.extend({
  codConsulta: z.string().regex(CUPS_PATTERN, 'codConsulta debe ser un CUPS de 6 dígitos.'),
  codDiagnosticoPrincipal: z.string().trim().min(1),
})

const procedimientoSchema = lineaAtencionSchema.extend({
  codProcedimiento: z.string().regex(CUPS_PATTERN, 'codProcedimiento debe ser un CUPS de 6 dígitos.'),
  codDiagnosticoPrincipal: z.string().trim().min(1),
})

const otroServicioSchema = z
  .object({
    codPrestador: z.string().regex(/^\d{12}$/),
    nomTecnologiaSalud: z.string().trim().min(1),
    fechaSuministroTecnologia: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
    consecutivo: z.number().int().positive(),
  })
  .passthrough()

/**
 * Esquema de salida Res. 2275 antes de entregar el JSON.
 * Conserva los grupos oficiales de servicios y rechaza un paquete vacío.
 */
export const rips2275OutputSchema = fevRipsPackageSchema.superRefine((paquete, ctx) => {
  paquete.usuarios.forEach((usuario, userIndex) => {
    const servicios = usuario.servicios ?? {}
    const consultas = servicios.consultas ?? []
    const procedimientos = servicios.procedimientos ?? []
    const otros = servicios.otrosServicios ?? []
    if (consultas.length + procedimientos.length + otros.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['usuarios', userIndex, 'servicios'],
        message: 'El usuario no tiene consultas, procedimientos ni otros servicios.',
      })
    }
    consultas.forEach((item, index) => {
      const parsed = consultaSchema.safeParse(item)
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['usuarios', userIndex, 'servicios', 'consultas', index],
          message: parsed.error.issues.map((issue) => issue.message).join(' '),
        })
      }
    })
    procedimientos.forEach((item, index) => {
      const parsed = procedimientoSchema.safeParse(item)
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['usuarios', userIndex, 'servicios', 'procedimientos', index],
          message: parsed.error.issues.map((issue) => issue.message).join(' '),
        })
      }
    })
    otros.forEach((item, index) => {
      const parsed = otroServicioSchema.safeParse(item)
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['usuarios', userIndex, 'servicios', 'otrosServicios', index],
          message: parsed.error.issues.map((issue) => issue.message).join(' '),
        })
      }
    })
  })
})

function normalizeCie10(code) {
  return String(code ?? '').replace(/\./g, '').trim().toUpperCase()
}

function normalizeCups(code) {
  const value = String(code ?? '').trim()
  const dotted = value.match(/\b(\d{2})\.(\d{2})\.(\d{2})\b/)
  const digits = dotted ? `${dotted[1]}${dotted[2]}${dotted[3]}` : value.replace(/\D/g, '')
  return CUPS_PATTERN.test(digits) ? digits : ''
}

function isConsultaCups(code) {
  return CONSULTA_PREFIXES.some((prefix) => code.startsWith(prefix))
}

function formatRipsDateTime(value) {
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(raw)) return raw
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw} 08:00`
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatBirthDate(value) {
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  return raw
}

function codPrestadorDe(prestador) {
  return String(prestador?.repsCode ?? prestador?.codPrestador ?? '').replace(/\D/g, '')
}

function emptyServicios() {
  return {
    consultas: [],
    procedimientos: [],
    urgencias: [],
    hospitalizacion: [],
    recienNacidos: [],
    medicamentos: [],
    otrosServicios: [],
  }
}

function indexPatients(pacientes) {
  const byId = new Map()
  for (const patient of pacientes ?? []) {
    if (!patient || typeof patient !== 'object') continue
    if (patient.id != null) byId.set(String(patient.id), patient)
    if (patient.syncId) byId.set(String(patient.syncId), patient)
  }
  return byId
}

function findPatient(record, patientsById) {
  const keys = [record?.patientSyncId, record?.patientId]
  for (const key of keys) {
    if (key == null || key === '') continue
    const patient = patientsById.get(String(key))
    if (patient) return patient
  }
  return null
}

function isSignedAttention(record) {
  if (!record || record.deletedAt) return false
  return Boolean(record.signedAt || record.isLocked)
}

function principalDiagnosis(record) {
  const diagnoses = record?.diagnoses ?? []
  return diagnoses.find((item) => item?.type === 'principal') ?? diagnoses[0] ?? null
}

function relatedDiagnoses(record, principal) {
  return (record?.diagnoses ?? []).filter((item) => item && item !== principal)
}

function professionalDocument(prestador) {
  return {
    tipoDocumentoIdentificacion: String(prestador?.documentType ?? 'CC').trim().toUpperCase() || 'CC',
    numDocumentoIdentificacion: String(prestador?.documentNumber ?? '').trim(),
  }
}

function buildUsuario(patient, consecutivo) {
  const gender = patient?.gender === 'F' ? 'F' : 'M'
  return {
    tipoDocumentoIdentificacion: String(patient?.documentType ?? 'CC').trim().toUpperCase() || 'CC',
    numDocumentoIdentificacion: String(patient?.documentNumber ?? '').trim(),
    tipoUsuario: REGIME_TO_TIPO_USUARIO[patient?.regime] ?? '04',
    fechaNacimiento: formatBirthDate(patient?.birthDate),
    codSexo: gender,
    codPaisResidencia: DEFAULTS.codPaisResidencia,
    codMunicipioResidencia: String(patient?.municipalityCode ?? '').trim() || '11001',
    codZonaTerritorialResidencia: DEFAULTS.codZonaTerritorialResidencia,
    incapacidad: DEFAULTS.incapacidad,
    consecutivo,
    codPaisOrigen: DEFAULTS.codPaisOrigen,
    registroSIRAS: null,
    servicios: emptyServicios(),
  }
}

function buildConsulta(record, prestador, consecutivo) {
  const principal = principalDiagnosis(record)
  const code = normalizeCie10(principal?.code)
  if (!code) return null
  const related = relatedDiagnoses(record, principal)
  const profesional = professionalDocument(prestador)
  const atencion = formatRipsDateTime(record.signedAt || record.createdAt)
  return {
    codPrestador: codPrestadorDe(prestador),
    fechaInicioAtencion: atencion,
    numAutorizacion: null,
    codConsulta: normalizeCups(prestador?.codConsulta) || DEFAULTS.codConsulta,
    modalidadGrupoServicioTecSal: DEFAULTS.modalidadConsulta,
    grupoServicios: DEFAULTS.grupoServiciosConsulta,
    codServicio: Number(prestador?.codServicio ?? DEFAULTS.codServicio),
    finalidadTecnologiaSalud: DEFAULTS.finalidadConsulta,
    causaMotivoAtencion: DEFAULTS.causaMotivoAtencion,
    codDiagnosticoPrincipal: code,
    codDiagnosticoRelacionado1: normalizeCie10(related[0]?.code) || null,
    codDiagnosticoRelacionado2: normalizeCie10(related[1]?.code) || null,
    codDiagnosticoRelacionado3: normalizeCie10(related[2]?.code) || null,
    tipoDiagnosticoPrincipal: CERTAINTY_TO_RIPS[principal?.certainty] ?? '02',
    ...profesional,
    vrServicio: Number(prestador?.vrConsulta ?? 0) || 0,
    conceptoRecaudo: DEFAULTS.conceptoRecaudo,
    valorPagoModerador: 0,
    numFEVPagoModerador: null,
    consecutivo,
  }
}

function procedimientoFromCups(record, prestador, cups, valor, consecutivo, atencion) {
  const principal = principalDiagnosis(record)
  const related = relatedDiagnoses(record, principal)
  return {
    codPrestador: codPrestadorDe(prestador),
    fechaInicioAtencion: atencion,
    idMIPRES: null,
    numAutorizacion: null,
    codProcedimiento: cups,
    viaIngresoServicioSalud: DEFAULTS.viaIngresoProcedimiento,
    modalidadGrupoServicioTecSal: DEFAULTS.modalidadProcedimiento,
    grupoServicios: DEFAULTS.grupoServiciosProcedimiento,
    codServicio: Number(prestador?.codServicio ?? DEFAULTS.codServicio),
    finalidadTecnologiaSalud: DEFAULTS.finalidadProcedimiento,
    ...professionalDocument(prestador),
    codDiagnosticoPrincipal: normalizeCie10(principal?.code),
    codDiagnosticoRelacionado: normalizeCie10(related[0]?.code) || null,
    codComplicacion: null,
    vrServicio: Number(valor) || 0,
    conceptoRecaudo: DEFAULTS.conceptoRecaudo,
    valorPagoModerador: 0,
    numFEVPagoModerador: null,
    consecutivo,
  }
}

function collectProcedimientos(record, prestador, startConsecutivo) {
  const procedimientos = []
  const seen = new Set()
  let consecutivo = startConsecutivo
  const atencion = formatRipsDateTime(record.signedAt || record.createdAt)

  const push = (cups, valor, when) => {
    if (!cups || isConsultaCups(cups) || seen.has(cups)) return
    seen.add(cups)
    procedimientos.push(procedimientoFromCups(record, prestador, cups, valor, consecutivo, when || atencion))
    consecutivo += 1
  }

  for (const note of record.evolutionNotes ?? []) {
    if (note?.kind === 'addendum') continue
    const when = formatRipsDateTime(note.date || note.signedAt || record.signedAt)
    const services = note.catalogServices?.length
      ? note.catalogServices
      : [{ cupsCode: note.cupsCode, procedure: note.procedure, cost: note.cost, requiereCupsRips: note.requiereCupsRips }]
    for (const service of services) {
      if (service?.requiereCupsRips === false) continue
      push(normalizeCups(service?.cupsCode || service?.procedure || note.procedure), service?.cost ?? note.cost, when)
    }
  }

  for (const item of record.treatmentPlan ?? []) {
    if (item?.executionStatus !== 'completado') continue
    const cups = normalizeCups(item?.cupsCode)
    push(cups, (Number(item?.unitPrice) || 0) * (Number(item?.quantity) || 1), atencion)
  }

  return { procedimientos, nextConsecutivo: consecutivo }
}

function collectOtrosServicios(record, prestador) {
  const items = []
  const atencion = formatRipsDateTime(record.signedAt || record.createdAt)
  const profesional = professionalDocument(prestador)

  const push = (nombre, valor, cantidad, when) => {
    const nomTecnologiaSalud = String(nombre ?? '').trim()
    if (!nomTecnologiaSalud) return
    const qty = Number(cantidad) > 0 ? Number(cantidad) : 1
    const unit = Number(valor) || 0
    items.push({
      codPrestador: codPrestadorDe(prestador),
      numAutorizacion: null,
      idMIPRES: null,
      fechaSuministroTecnologia: when || atencion,
      tipoOS: '01',
      codTecnologiaSalud: 'OTROS',
      nomTecnologiaSalud,
      cantidadOS: qty,
      ...profesional,
      vrUnitOS: unit,
      vrServicio: unit * qty,
      conceptoRecaudo: DEFAULTS.conceptoRecaudo,
      valorPagoModerador: 0,
      numFEVPagoModerador: null,
      consecutivo: items.length + 1,
    })
  }

  for (const note of record.evolutionNotes ?? []) {
    if (note?.kind === 'addendum') continue
    const services = note.catalogServices ?? []
    for (const service of services) {
      if (service?.requiereCupsRips !== false) continue
      if (normalizeCups(service?.cupsCode)) continue
      push(service.serviceName || service.procedure, service.cost, 1, formatRipsDateTime(note.date))
    }
  }

  for (const item of record.budgetItems ?? []) {
    if (normalizeCups(item?.cupsCode)) continue
    push(item?.procedure, item?.unitPrice, item?.quantity, atencion)
  }

  return items.map((item, index) => ({ ...item, consecutivo: index + 1 }))
}

function zodIssues(error) {
  return error.issues.map((issue) => ({
    level: 'error',
    field: issue.path.join('.'),
    message: issue.message,
  }))
}

/**
 * Transforma atenciones odontológicas en el JSON RIPS de la Resolución 2275
 * y solo lo entrega si pasa el esquema Zod y la validación local.
 *
 * @param {object} input
 * @param {object[]} input.atenciones
 * @param {object[]} input.pacientes
 * @param {object} input.prestador
 */
export function generarRipsJson(input = {}) {
  const prestador = input.prestador ?? {}
  const perfilFiscal = normalizePerfilFiscal(input.perfilFiscal ?? prestador.perfilFiscal)
  const numFactura = normalizeRipsNumFactura(input.numFactura ?? prestador.numFactura)
  const patientsById = indexPatients(input.pacientes)
  const wanted = new Set((input.recordIds ?? []).map((id) => String(id)))
  const issues = []

  const atenciones = (input.atenciones ?? []).filter((record) => {
    if (!isSignedAttention(record)) return false
    if (wanted.size === 0) return true
    return wanted.has(String(record.id)) || wanted.has(String(record.syncId))
  })

  const grouped = new Map()
  for (const record of atenciones) {
    const patient = findPatient(record, patientsById)
    if (!patient) {
      issues.push({
        level: 'error',
        field: 'paciente',
        message: 'La atención no tiene un paciente asociado en la base de datos.',
        recordId: record.id ?? record.syncId,
      })
      continue
    }
    const key = `${patient.documentType}|${patient.documentNumber}`
    const bucket = grouped.get(key) ?? { patient, records: [] }
    bucket.records.push(record)
    grouped.set(key, bucket)
  }

  const usuarios = []
  let usuarioConsecutivo = 1
  for (const { patient, records } of grouped.values()) {
    const usuario = buildUsuario(patient, usuarioConsecutivo)
    let procedimientoConsecutivo = 1
    for (const record of records) {
      const consulta = buildConsulta(record, prestador, usuario.servicios.consultas.length + 1)
      if (consulta) usuario.servicios.consultas.push(consulta)
      const compiled = collectProcedimientos(record, prestador, procedimientoConsecutivo)
      usuario.servicios.procedimientos.push(...compiled.procedimientos)
      procedimientoConsecutivo = compiled.nextConsecutivo
      usuario.servicios.otrosServicios.push(...collectOtrosServicios(record, prestador))
    }
    usuario.servicios.otrosServicios = usuario.servicios.otrosServicios.map((item, index) => ({
      ...item,
      consecutivo: index + 1,
    }))
    const servicios = usuario.servicios
    if (
      servicios.consultas.length + servicios.procedimientos.length + servicios.otrosServicios.length === 0
    ) {
      issues.push({
        level: 'error',
        field: 'servicios',
        message: 'La atención firmada no tiene diagnóstico CIE-10 ni procedimientos reportables.',
        patientDocument: patient.documentNumber,
      })
      continue
    }
    usuarios.push(usuario)
    usuarioConsecutivo += 1
  }

  const draft = {
    numDocumentoIdObligado: String(prestador.nit ?? prestador.numDocumentoIdObligado ?? '').replace(/\D/g, ''),
    numFactura,
    tipoNota: input.tipoNota ?? null,
    numNota: input.numNota ?? null,
    usuarios,
  }

  if (usuarios.length === 0) {
    return {
      ok: false,
      success: false,
      rips: null,
      issues: issues.length
        ? issues
        : [{ level: 'error', field: 'atenciones', message: 'No hay atenciones odontológicas firmadas para generar RIPS.' }],
      recordCount: atenciones.length,
      patientCount: 0,
    }
  }

  const parsed = rips2275OutputSchema.safeParse(draft)
  const schemaIssues = parsed.success ? [] : zodIssues(parsed.error)
  const localIssues = validateRipsPackageLocally(parsed.success ? parsed.data : draft, {
    perfilFiscal,
    esRipsTemporal: input.esRipsTemporal,
    allowNullNumFactura: input.allowNullNumFactura,
    crossValidateAgeSex: true,
    codPrestador: codPrestadorDe(prestador),
  })
  const allIssues = [...issues, ...schemaIssues, ...localIssues]
  const blocked = !parsed.success || hasBlockingValidationErrors(allIssues) || schemaIssues.length > 0

  if (blocked) {
    return {
      ok: false,
      success: false,
      rips: null,
      issues: allIssues,
      recordCount: atenciones.length,
      patientCount: usuarios.length,
    }
  }

  return {
    ok: true,
    success: true,
    rips: parsed.data,
    issues: allIssues.filter((issue) => issue.level === 'warning'),
    recordCount: atenciones.length,
    patientCount: usuarios.length,
  }
}

/**
 * Lee las historias firmadas de la clínica y genera el JSON RIPS validado.
 * @param {object} input
 * @param {string} input.clinicId
 */
export async function generarRipsDesdeBaseDatos(input = {}) {
  const clinicId = String(input.clinicId ?? '').trim()
  if (!clinicId) {
    return {
      ok: false,
      success: false,
      rips: null,
      issues: [{ level: 'error', field: 'clinicId', message: 'Indique la clínica de la que se leen las atenciones.' }],
      recordCount: 0,
      patientCount: 0,
    }
  }

  const snapshot = await pullClinicSnapshot(clinicId, input.aliasIds ?? [], { includeBlobs: false })
  return generarRipsJson({
    ...input,
    atenciones: snapshot.clinicalRecords,
    pacientes: snapshot.patients,
  })
}

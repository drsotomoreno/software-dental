import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { Patient } from '@/types/patient'
import type { UserProfile } from '@/types/user'
import type {
  RipsConsulta,
  RipsExportMetadata,
  RipsExportResult,
  RipsProcedimiento,
  RipsTransaction,
  RipsUsuario,
  RipsValidationIssue,
} from '@/types/rips'
import {
  DEFAULT_ODONTOLOGY_CONSULTATION_CUPS,
  DEMO_PRESTADOR_NIT,
  DEMO_PRESTADOR_REPS,
  DIAGNOSIS_CERTAINTY_TO_RIPS,
  DOCUMENT_TYPE_RIPS,
  REGIME_TO_TIPO_USUARIO,
  RIPS_DEFAULTS,
} from '@/constants/rips'
import { RIPS_FEV_NUMERO_PATTERN } from './ripsStructureValidation'
import {
  resolveConsultationCupsForThs,
  type OdontologyThsSpecialtyId,
  type RipsConsultationVisitType,
} from '@/constants/ripsThsSpecialty'
import { normalizeCupsCode } from '@/services/catalogService'
import {
  compileProcedimientosForRecord,
  type EvolutionCatalogLookup,
} from './ripsCompiler'
import { validateRipsExport } from './ripsValidation'

export interface RipsSourceRecord {
  record: ClinicalRecord
  patient: Patient
}

export type { RipsCompileStats, RipsCompileOmission, RipsCompileProcedimientosResult } from './ripsCompiler'
export {
  compileProcedimientosForRecord,
  compileEvolutionNotesToRipsProcedimientos,
  createCatalogLookupFromServices,
  extractCupsCodeFromText,
  isEvolutionNoteEligibleForRipsProcedimiento,
  resolveEvolutionNoteRipsCups,
} from './ripsCompiler'

export function normalizeCie10ForRips(code: string): string {
  return code.replace(/\./g, '').trim().toUpperCase()
}

export function normalizeNit(nit: string): string {
  return nit.replace(/\D/g, '')
}

export function normalizeCodPrestador(code: string): string {
  const digits = code.replace(/\D/g, '')
  return digits.padStart(12, '0').slice(-12)
}

export function resolveRipsNit(
  user: Pick<UserProfile, 'providerNit'>,
  override?: string,
): string {
  return normalizeNit(override ?? '') || normalizeNit(user.providerNit ?? '') || DEMO_PRESTADOR_NIT
}

export function resolveRipsCodPrestador(
  user: Pick<UserProfile, 'repsCode'>,
  override?: string,
): string {
  const fromOverride = String(override ?? '').replace(/\D/g, '')
  if (fromOverride) return normalizeCodPrestador(fromOverride)
  if (user.repsCode?.trim()) return normalizeCodPrestador(user.repsCode)
  return DEMO_PRESTADOR_REPS
}

export function isUsingDemoPrestadorDefaults(user: Pick<UserProfile, 'providerNit' | 'repsCode'>): boolean {
  return !normalizeNit(user.providerNit ?? '') || !String(user.repsCode ?? '').replace(/\D/g, '')
}

export function isValidRipsFevNumero(value: string): boolean {
  return RIPS_FEV_NUMERO_PATTERN.test(value.trim())
}

/** Prefijo FEV + fecha + documento del paciente, válido para MUV. */
export function suggestRipsNumFactura(sources: RipsSourceRecord[]): string {
  const patient = sources[0]?.patient
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = (patient?.documentNumber ?? '1').replace(/\D/g, '').slice(-6) || '1'
  const candidate = `FV${ymd}${suffix}`
  return isValidRipsFevNumero(candidate) ? candidate : `FV${ymd}1`
}

export function pickInvoiceNumberForRips(
  sources: RipsSourceRecord[],
  invoices: Array<{
    invoiceNumber?: string
    patientId?: string
    clinicalRecordIds?: string[]
    status?: string
    issueDate?: string
  }>,
): string {
  const eligible = invoices.filter(
    (invoice) =>
      invoice.status !== 'cancelled' &&
      invoice.status !== 'voided_by_credit_note' &&
      isValidRipsFevNumero(invoice.invoiceNumber ?? ''),
  )

  for (const { record } of sources) {
    const recordId = String(record.id ?? '')
    if (!recordId) continue
    const match = eligible.find((invoice) =>
      (invoice.clinicalRecordIds ?? []).map(String).includes(recordId),
    )
    if (match?.invoiceNumber) return match.invoiceNumber.trim()
  }

  const patientIds = new Set(sources.map(({ patient }) => String(patient.id ?? '')).filter(Boolean))
  const byPatient = eligible
    .filter((invoice) => patientIds.has(String(invoice.patientId ?? '')))
    .sort((a, b) => String(b.issueDate ?? '').localeCompare(String(a.issueDate ?? '')))

  if (byPatient[0]?.invoiceNumber) return byPatient[0].invoiceNumber.trim()
  if (sources.length === 0) return ''
  return suggestRipsNumFactura(sources)
}

function resolveExportMetadata(
  professional: UserProfile,
  metadata: RipsExportMetadata,
): RipsExportMetadata {
  return {
    ...metadata,
    numDocumentoIdObligado: resolveRipsNit(professional, metadata.numDocumentoIdObligado),
    codPrestador: resolveRipsCodPrestador(professional, metadata.codPrestador),
    numFactura: metadata.numFactura.trim(),
  }
}

export function formatRipsDateTime(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return isoDate.slice(0, 10) + ' 08:00'
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function getPrincipalDiagnosis(record: ClinicalRecord) {
  const diagnoses = record.diagnoses ?? []
  return diagnoses.find((d) => d.type === 'principal') ?? diagnoses[0]
}

function getRelatedDiagnoses(record: ClinicalRecord) {
  const diagnoses = record.diagnoses ?? []
  const principal = getPrincipalDiagnosis(record)
  return diagnoses.filter((d) => d !== principal)
}

function buildUsuarioBase(
  patient: Patient,
  consecutivo: number,
): Omit<RipsUsuario, 'servicios'> {
  const tipoUsuario =
    patient.regime != null
      ? REGIME_TO_TIPO_USUARIO[patient.regime]
      : REGIME_TO_TIPO_USUARIO.particular

  return {
    tipoDocumentoIdentificacion: DOCUMENT_TYPE_RIPS[patient.documentType] ?? 'CC',
    numDocumentoIdentificacion: patient.documentNumber.trim(),
    tipoUsuario,
    fechaNacimiento: patient.birthDate,
    codSexo: patient.gender === 'O' ? 'M' : patient.gender,
    codPaisResidencia: RIPS_DEFAULTS.codPaisResidencia,
    codMunicipioResidencia: patient.municipalityCode?.trim() || '00000',
    codZonaTerritorialResidencia: RIPS_DEFAULTS.codZonaTerritorialResidencia,
    incapacidad: RIPS_DEFAULTS.incapacidad,
    consecutivo,
    codPaisOrigen: RIPS_DEFAULTS.codPaisOrigen,
    registroSIRAS: null,
  }
}

function buildConsulta(
  record: ClinicalRecord,
  professional: UserProfile,
  metadata: RipsExportMetadata,
  consecutivo: number,
): RipsConsulta | null {
  const principal = getPrincipalDiagnosis(record)
  if (!principal) return null

  const related = getRelatedDiagnoses(record)
  const atencionDate = formatRipsDateTime(record.signedAt ?? record.createdAt)
  const vrConsulta = metadata.vrConsulta ?? 0
  const thsSpecialty = metadata.thsSpecialty
  const visitType = metadata.tipoConsulta
  const codConsulta =
    normalizeCupsCode(
      metadata.codConsultaOdontologia ??
        resolveConsultationCupsForThs(thsSpecialty, visitType) ??
        DEFAULT_ODONTOLOGY_CONSULTATION_CUPS,
    )

  return {
    codPrestador: resolveRipsCodPrestador(professional, metadata.codPrestador),
    fechaInicioAtencion: atencionDate,
    numAutorizacion: null,
    codConsulta,
    modalidadGrupoServicioTecSal: RIPS_DEFAULTS.modalidadConsulta,
    grupoServicios: RIPS_DEFAULTS.grupoServiciosConsulta,
    codServicio: metadata.codServicio ?? RIPS_DEFAULTS.codServicio,
    finalidadTecnologiaSalud: RIPS_DEFAULTS.finalidadConsulta,
    causaMotivoAtencion: RIPS_DEFAULTS.causaMotivoAtencion,
    codDiagnosticoPrincipal: normalizeCie10ForRips(principal.code),
    codDiagnosticoPrincipalCIE11: '',
    nomCodDiagnosticoPrincipalCIE11: '',
    codDiagnosticoRelacionado1: related[0]
      ? normalizeCie10ForRips(related[0].code)
      : null,
    codDiagnosticoRelacionado1CIE11: '',
    nomCodDiagnosticoRelacionado1CIE11: '',
    codDiagnosticoRelacionado2: related[1]
      ? normalizeCie10ForRips(related[1].code)
      : null,
    codDiagnosticoRelacionado2CIE11: '',
    nomCodDiagnosticoRelacionado2CIE11: '',
    codDiagnosticoRelacionado3: related[2]
      ? normalizeCie10ForRips(related[2].code)
      : null,
    codDiagnosticoRelacionado3CIE11: '',
    nomCodDiagnosticoRelacionado3CIE11: '',
    tipoDiagnosticoPrincipal: DIAGNOSIS_CERTAINTY_TO_RIPS[principal.certainty],
    tipoDocumentoIdentificacion:
      DOCUMENT_TYPE_RIPS[professional.documentType as keyof typeof DOCUMENT_TYPE_RIPS] ?? 'CC',
    numDocumentoIdentificacion: professional.documentNumber.trim(),
    vrServicio: vrConsulta,
    conceptoRecaudo: metadata.conceptoRecaudo ?? RIPS_DEFAULTS.conceptoRecaudoParticular,
    valorPagoModerador: metadata.valorPagoModerador ?? 0,
    numFEVPagoModerador: metadata.numFEVPagoModerador ?? null,
    consecutivo,
    codigoVIDA: metadata.codigoVIDA ?? null,
  }
}

function patientKey(patient: Patient): string {
  return `${patient.documentType}-${patient.documentNumber}`
}

export function buildRipsFromRecords(
  sources: RipsSourceRecord[],
  professional: UserProfile,
  metadata: RipsExportMetadata,
  options?: {
    catalogLookup?: EvolutionCatalogLookup
  },
): RipsExportResult {
  const resolvedMetadata = resolveExportMetadata(professional, metadata)
  const issues: RipsValidationIssue[] = []
  const compileStats: import('./ripsCompiler').RipsCompileStats[] = []
  const grouped = new Map<string, { patient: Patient; records: ClinicalRecord[] }>()

  for (const { record, patient } of sources) {
    const key = patientKey(patient)
    const existing = grouped.get(key)
    if (existing) {
      existing.records.push(record)
    } else {
      grouped.set(key, { patient, records: [record] })
    }
  }

  const usuarios: RipsUsuario[] = []
  let usuarioConsecutivo = 1

  for (const { patient, records } of grouped.values()) {
    const consultas: RipsConsulta[] = []
    const procedimientos: RipsProcedimiento[] = []
    let consultaConsecutivo = 1
    let procedimientoConsecutivo = 1

    for (const record of records) {
      const consulta = buildConsulta(record, professional, resolvedMetadata, consultaConsecutivo)
      if (consulta) {
        consultas.push(consulta)
        consultaConsecutivo++
      }

      const compiled = compileProcedimientosForRecord(
        record,
        professional,
        resolvedMetadata,
        procedimientoConsecutivo,
        options?.catalogLookup,
      )
      procedimientos.push(...compiled.procedimientos)
      procedimientoConsecutivo = compiled.nextConsecutivo
      compileStats.push(compiled.stats)
    }

    usuarios.push({
      ...buildUsuarioBase(patient, usuarioConsecutivo),
      servicios: {
        consultas,
        procedimientos,
        urgencias: [],
        hospitalizacion: [],
        recienNacidos: [],
        medicamentos: [],
        otrosServicios: [],
      },
    })
    usuarioConsecutivo++
  }

  const rips: RipsTransaction = {
    numDocumentoIdObligado: resolvedMetadata.numDocumentoIdObligado,
    numFactura: resolvedMetadata.numFactura,
    tipoNota: metadata.tipoNota ?? null,
    numNota: metadata.numNota ?? null,
    usuarios,
  }

  issues.push(...validateRipsExport(rips, sources, professional, resolvedMetadata))

  return {
    rips,
    issues,
    recordCount: sources.length,
    patientCount: grouped.size,
    compileStats: compileStats.length > 0 ? compileStats : undefined,
  }
}

export function buildDefaultRipsMetadata(user: UserProfile): RipsExportMetadata {
  const thsSpecialty: OdontologyThsSpecialtyId = user.thsSpecialty ?? 'odontologia_general'
  const tipoConsulta: RipsConsultationVisitType = 'primera_vez'
  const codConsultaOdontologia =
    resolveConsultationCupsForThs(thsSpecialty, tipoConsulta) ??
    DEFAULT_ODONTOLOGY_CONSULTATION_CUPS

  return {
    numDocumentoIdObligado: resolveRipsNit(user),
    numFactura: '',
    codPrestador: resolveRipsCodPrestador(user),
    tipoNota: null,
    numNota: null,
    thsSpecialty,
    tipoConsulta,
    codConsultaOdontologia,
    codServicio: RIPS_DEFAULTS.codServicio,
    vrConsulta: 0,
    conceptoRecaudo: RIPS_DEFAULTS.conceptoRecaudoParticular,
    valorPagoModerador: 0,
    numFEVPagoModerador: null,
    codigoVIDA: null,
  }
}

export function downloadRipsJson(rips: RipsTransaction, filename: string): void {
  const json = JSON.stringify(rips, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.json') ? filename : `${filename}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function suggestRipsFilename(numFactura: string): string {
  const safe = numFactura.replace(/[^\w.-]/g, '_') || 'RIPS'
  const date = new Date().toISOString().slice(0, 10)
  return `RIPS_${safe}_${date}.json`
}

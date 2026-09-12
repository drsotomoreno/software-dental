import type { OdontologyThsSpecialtyId, RipsConsultationVisitType } from '@/constants/ripsThsSpecialty'

/** Estructura RIPS JSON — soporte FEV (Res. 2275/2023, Doc. Técnico 1 Res. 948/2026) */

export interface RipsTransaction {
  numDocumentoIdObligado: string
  /**
   * Número FEV. Null en RIPS temporales y cuando el prestador es No_Obligado
   * (Res. 2275 — el campo debe existir en el JSON con valor null).
   */
  numFactura: string | null
  tipoNota: string | null
  numNota: string | null
  usuarios: RipsUsuario[]
  /** CUV MinSalud asociado a esta transacción (marca blanca / FEV) */
  cuv?: string | null
  /** CUFE DIAN asociado a la FEV */
  cufe?: string | null
}

export interface RipsUsuario {
  tipoDocumentoIdentificacion: string
  numDocumentoIdentificacion: string
  tipoUsuario: string
  fechaNacimiento: string
  codSexo: string
  codPaisResidencia: string
  codMunicipioResidencia: string
  codZonaTerritorialResidencia: string
  incapacidad: string
  consecutivo: number
  codPaisOrigen: string
  registroSIRAS: string | null
  servicios: RipsServicios
}

export interface RipsServicios {
  consultas: RipsConsulta[]
  procedimientos: RipsProcedimiento[]
  urgencias: []
  hospitalizacion: []
  recienNacidos: []
  medicamentos: []
  otrosServicios: RipsOtroServicio[]
}

export interface RipsConsulta {
  codPrestador: string
  fechaInicioAtencion: string
  numAutorizacion: string | null
  codConsulta: string
  modalidadGrupoServicioTecSal: string
  grupoServicios: string
  codServicio: number
  finalidadTecnologiaSalud: string
  causaMotivoAtencion: string
  codDiagnosticoPrincipal: string
  codDiagnosticoPrincipalCIE11: string
  nomCodDiagnosticoPrincipalCIE11: string
  codDiagnosticoRelacionado1: string | null
  codDiagnosticoRelacionado1CIE11: string
  nomCodDiagnosticoRelacionado1CIE11: string
  codDiagnosticoRelacionado2: string | null
  codDiagnosticoRelacionado2CIE11: string
  nomCodDiagnosticoRelacionado2CIE11: string
  codDiagnosticoRelacionado3: string | null
  codDiagnosticoRelacionado3CIE11: string
  nomCodDiagnosticoRelacionado3CIE11: string
  tipoDiagnosticoPrincipal: string
  tipoDocumentoIdentificacion: string
  numDocumentoIdentificacion: string
  vrServicio: number
  conceptoRecaudo: string
  valorPagoModerador: number
  numFEVPagoModerador: string | null
  consecutivo: number
  codigoVIDA: string | null
}

export interface RipsProcedimiento {
  codPrestador: string
  fechaInicioAtencion: string
  idMIPRES: string | null
  numAutorizacion: string | null
  codProcedimiento: string
  viaIngresoServicioSalud: string
  modalidadGrupoServicioTecSal: string
  grupoServicios: string
  codServicio: number
  finalidadTecnologiaSalud: string
  tipoDocumentoIdentificacion: string
  numDocumentoIdentificacion: string
  codDiagnosticoPrincipal: string
  codDiagnosticoPrincipalCIE11: string
  nomCodDiagnosticoPrincipalCIE11: string
  codDiagnosticoRelacionado: string | null
  codComplicacion: string | null
  codComplicacionCIE11: string
  nomComplicacionCIE11: string
  vrServicio: number
  conceptoRecaudo: string
  valorPagoModerador: number
  numFEVPagoModerador: string | null
  consecutivo: number
  codigoVIDA: string | null
  /** Extensión EMR — pieza dental FDI asociada al procedimiento */
  piezaDental?: number | null
  /** Extensión EMR — cuadrante FDI (Q1–Q4) */
  cuadranteFdi?: string | null
  /** Extensión EMR — arcada tratada */
  arcada?: 'superior' | 'inferior' | null
}

/**
 * Grupo RIPS `otrosServicios` (Res. 2275).
 * Usado para estética/insumos sin CUPS: la DIAN recibe el nombre literal y el MUV
 * clasifica el ítem aquí en lugar de un procedimiento CUPS inventado.
 */
export const RIPS_OTROS_SERVICIOS_TIPO_OS = '01'
export const RIPS_OTROS_SERVICIOS_COD_TECNOLOGIA = 'OTROS'

export interface RipsOtroServicio {
  codPrestador: string
  numAutorizacion: string | null
  idMIPRES: string | null
  fechaSuministroTecnologia: string
  /** 01 = materiales e insumos / dispositivos; evita CUPS inventado. */
  tipoOS: string
  codTecnologiaSalud: string
  nomTecnologiaSalud: string
  cantidadOS: number
  tipoDocumentoIdentificacion: string
  numDocumentoIdentificacion: string
  vrUnitOS: number
  vrServicio: number
  conceptoRecaudo: string
  valorPagoModerador: number
  numFEVPagoModerador: string | null
  consecutivo: number
}

export interface RipsExportMetadata {
  /** NIT del prestador (solo dígitos) */
  numDocumentoIdObligado: string
  /** Número de factura electrónica de venta en salud. Null si No_Obligado o RIPS temporal. */
  numFactura: string | null
  /** Referencia FEV DIAN para validación 1:1 con numFactura (opcional si coincide con numFactura) */
  fevReferencia?: string | null
  /** Perfil fiscal del prestador al generar el paquete. */
  perfilFiscal?: import('@/utils/fiscalProfile').FiscalProfile
  /** Si true, numFactura puede ser null aunque el prestador sea Obligado_FEV. */
  esRipsTemporal?: boolean
  /** Inicio vigencia convenio (YYYY-MM-DD) — límite inferior de fechaInicioAtencion */
  convenioFechaInicio?: string
  /** Código REPS del prestador (12 dígitos) */
  codPrestador: string
  tipoNota?: string | null
  numNota?: string | null
  /** CUPS consulta odontológica — default primera vez */
  codConsultaOdontologia?: string
  /** Especialidad THS del prestador de la atención (debe coincidir con codConsulta) */
  thsSpecialty?: OdontologyThsSpecialtyId
  /** Tipo de consulta para validación MUV THS ↔ CUPS */
  tipoConsulta?: RipsConsultationVisitType
  /** Código de servicio habilitado en REPS */
  codServicio?: number
  /** Valor de la consulta odontológica */
  vrConsulta?: number
  conceptoRecaudo?: string
  valorPagoModerador?: number
  numFEVPagoModerador?: string | null
  codigoVIDA?: string | null
}

export type RipsValidationLevel = 'error' | 'warning'

export interface RipsValidationIssue {
  level: RipsValidationLevel
  field?: string
  message: string
  recordId?: string
  patientDocument?: string
}

export interface RipsExportResult {
  rips: RipsTransaction
  issues: RipsValidationIssue[]
  recordCount: number
  patientCount: number
  /** Estadísticas del motor de compilación (presupuesto + evoluciones) */
  compileStats?: import('./ripsCompiler').RipsCompileStats[]
}

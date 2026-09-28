/**
 * Validación RIPS de consulta externa y procedimientos odontológicos.
 * Resolución 2275 de 2023.
 */

export type CodigoValidacionOdontologia =
  | 'FECHA_INICIO'
  | 'AUTORIZACION'
  | 'CIE10'
  | 'VALOR_CONSULTA'
  | 'CUPS'
  | 'REPS'
  | 'PROFESIONAL'

export interface ProfesionalIndependienteReps {
  /** CC, CE, PA, TI… El independiente no se reporta con NIT. */
  tipoDocumento: string
  numeroDocumento: string
  /** Código REPS de la sede: 12 dígitos o forma 6800103898-01. */
  codPrestadorReps: string
}

export interface ContextoValidacionRipsOdontologia {
  fechaGeneracion?: Date | string
  profesional?: ProfesionalIndependienteReps
}

export interface ErrorValidacionRipsOdontologia {
  level: 'error' | 'warning'
  field: string
  message: string
  codigo: CodigoValidacionOdontologia
}

export interface ResultadoValidacionRipsOdontologia {
  valido: boolean
  errores: ErrorValidacionRipsOdontologia[]
}

/** Línea de consulta externa que exige la clase de validación. */
export interface ConsultaExternaOdontologica {
  codPrestador: string
  fechaInicioAtencion: string
  numAutorizacion: string | null
  codConsulta: string
  grupoServicios: string
  codDiagnosticoPrincipal: string
  codDiagnosticoRelacionado1?: string | null
  codDiagnosticoRelacionado2?: string | null
  codDiagnosticoRelacionado3?: string | null
  tipoDocumentoIdentificacion: string
  numDocumentoIdentificacion: string
  vrServicio: number
  consecutivo: number
}

/** Línea de procedimiento odontológico (CUPS capítulo 23). */
export interface ProcedimientoOdontologico {
  codPrestador: string
  fechaInicioAtencion: string
  numAutorizacion: string | null
  codProcedimiento: string
  grupoServicios: string
  codDiagnosticoPrincipal: string
  codDiagnosticoRelacionado?: string | null
  tipoDocumentoIdentificacion: string
  numDocumentoIdentificacion: string
  vrServicio: number
  consecutivo: number
}

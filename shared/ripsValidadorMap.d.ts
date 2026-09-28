export interface RipsValidadorConsulta {
  codPrestador: string
  fechaHoraInicioAtencion: string
  codConsulta: string
  modalidadGrupoServicioTecnol: string
  grupoServicios: string
  codServicio: number
  finalidadTecnologiaSalud: string
  causaExterna: string
  tipoDiagnosticoPrincipal: string
  codDiagnosticoPrincipal: string
  valorConsulta: number
  conceptoRecaudo: string
  valorPagoModerador: number
  numAutorizacion?: string | null
  tipoDocumentoIdentificacion?: string
  numDocumentoIdentificacion?: string
}

export interface RipsValidadorProcedimiento extends Omit<RipsValidadorConsulta, 'codConsulta'> {
  codProcedimiento: string
}

export interface RipsValidadorUsuario {
  tipoDocumentoIdentificacion: string
  numDocumentoIdentificacion: string
  tipoUsuario: string
  fechaNacimiento: string
  sexo: 'M' | 'F'
  servicios: {
    consultas: RipsValidadorConsulta[]
    procedimientos: RipsValidadorProcedimiento[]
  }
}

export interface RipsValidadorDocumento {
  numDocumentoIdObligado: string
  numFactura: string | null
  tipoNota: string | null
  numNota: string | null
  usuarios: RipsValidadorUsuario[]
}

export interface RipsValidadorProfesional {
  tipoDocumentoIdentificacion?: string
  numDocumentoIdentificacion?: string
}

export interface RipsValidadorContexto {
  profesional?: RipsValidadorProfesional
  tipoDocumentoIdentificacion?: string
  numDocumentoIdentificacion?: string
  codMunicipioResidencia?: string
}

export function numFacturaParaValidador(value: unknown): string | null
export function normalizarDocumentoRipsValidador(input?: object): RipsValidadorDocumento
export function mapearRipsParaValidador(
  documento: object,
  contexto?: RipsValidadorContexto,
): {
  numDocumentoIdObligado: string
  numFactura: string | null
  tipoNota: string | null
  numNota: string | null
  usuarios: Array<Record<string, unknown>>
}

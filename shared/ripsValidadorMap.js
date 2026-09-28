/**
 * Documento local del validador RIPS y su traducción al JSON de la Resolución 2275.
 * La base guarda los nombres del formulario (sexo, fechaHoraInicioAtencion, valorConsulta).
 * El validador recibe los nombres oficiales (codSexo, fechaInicioAtencion, vrServicio).
 */

function texto(value) {
  return String(value ?? '').trim()
}

function sexo(usuario) {
  const raw = texto(usuario?.codSexo ?? usuario?.sexo).toUpperCase()
  if (raw.startsWith('F')) return 'F'
  return 'M'
}

function codigoDos(value, fallback) {
  const raw = texto(value)
  if (!raw) return fallback
  return /^\d$/.test(raw) ? raw.padStart(2, '0') : raw
}

function cie10(value) {
  const raw = texto(value).replace(/\./g, '').toUpperCase()
  return raw || ''
}

function cups(value) {
  return texto(value).replace(/\D/g, '')
}

function fechaAtencion(linea) {
  return texto(linea?.fechaInicioAtencion ?? linea?.fechaHoraInicioAtencion)
}

function numero(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * El número que ve el odontólogo puede llevar guion (FEV-1024).
 * El validador oficial solo admite prefijo y dígitos, sin separadores.
 * @param {unknown} value
 * @returns {string | null}
 */
export function numFacturaParaValidador(value) {
  if (value == null || texto(value) === '') return null
  const compacto = texto(value).replace(/[^A-Za-z0-9]/g, '')
  return compacto || null
}

function normalizarConsulta(linea = {}) {
  const consulta = {
    codPrestador: texto(linea.codPrestador),
    fechaHoraInicioAtencion: fechaAtencion(linea),
    codConsulta: cups(linea.codConsulta),
    modalidadGrupoServicioTecnol: texto(linea.modalidadGrupoServicioTecnol ?? linea.modalidadGrupoServicioTecSal) || '01',
    grupoServicios: texto(linea.grupoServicios) || '01',
    codServicio: numero(linea.codServicio, 1),
    finalidadTecnologiaSalud: texto(linea.finalidadTecnologiaSalud) || '10',
    causaExterna: texto(linea.causaExterna ?? linea.causaMotivoAtencion) || '15',
    tipoDiagnosticoPrincipal: texto(linea.tipoDiagnosticoPrincipal) || '1',
    codDiagnosticoPrincipal: cie10(linea.codDiagnosticoPrincipal),
    valorConsulta: numero(linea.valorConsulta ?? linea.vrServicio, 0),
    conceptoRecaudo: texto(linea.conceptoRecaudo) || '05',
    valorPagoModerador: numero(linea.valorPagoModerador, 0),
  }
  if (linea.numAutorizacion != null && texto(linea.numAutorizacion)) {
    consulta.numAutorizacion = texto(linea.numAutorizacion)
  }
  const tipoProfesional = texto(linea.tipoDocumentoIdentificacion).toUpperCase()
  const numProfesional = texto(linea.numDocumentoIdentificacion)
  if (tipoProfesional) consulta.tipoDocumentoIdentificacion = tipoProfesional
  if (numProfesional) consulta.numDocumentoIdentificacion = numProfesional
  return consulta
}

function normalizarProcedimiento(linea = {}) {
  const procedimiento = {
    codPrestador: texto(linea.codPrestador),
    fechaHoraInicioAtencion: fechaAtencion(linea),
    codProcedimiento: cups(linea.codProcedimiento),
    modalidadGrupoServicioTecnol: texto(linea.modalidadGrupoServicioTecnol ?? linea.modalidadGrupoServicioTecSal) || '01',
    grupoServicios: texto(linea.grupoServicios) || '01',
    codServicio: numero(linea.codServicio, 1),
    finalidadTecnologiaSalud: texto(linea.finalidadTecnologiaSalud) || '10',
    causaExterna: texto(linea.causaExterna ?? linea.causaMotivoAtencion) || '15',
    tipoDiagnosticoPrincipal: texto(linea.tipoDiagnosticoPrincipal) || '1',
    codDiagnosticoPrincipal: cie10(linea.codDiagnosticoPrincipal),
    valorConsulta: numero(linea.valorConsulta ?? linea.valorProcedimiento ?? linea.vrServicio, 0),
    conceptoRecaudo: texto(linea.conceptoRecaudo) || '05',
    valorPagoModerador: numero(linea.valorPagoModerador, 0),
  }
  if (linea.numAutorizacion != null && texto(linea.numAutorizacion)) {
    procedimiento.numAutorizacion = texto(linea.numAutorizacion)
  }
  const tipoProfesional = texto(linea.tipoDocumentoIdentificacion).toUpperCase()
  const numProfesional = texto(linea.numDocumentoIdentificacion)
  if (tipoProfesional) procedimiento.tipoDocumentoIdentificacion = tipoProfesional
  if (numProfesional) procedimiento.numDocumentoIdentificacion = numProfesional
  return procedimiento
}

/**
 * Deja el documento con la estructura que se persiste en Dexie y en Node.
 * @param {object} input
 */
export function normalizarDocumentoRipsValidador(input = {}) {
  const fuente = input.documento && typeof input.documento === 'object' ? input.documento : input
  const usuarios = Array.isArray(fuente.usuarios) ? fuente.usuarios : []
  return {
    numDocumentoIdObligado: texto(fuente.numDocumentoIdObligado),
    numFactura: fuente.numFactura == null || texto(fuente.numFactura) === '' ? null : texto(fuente.numFactura),
    tipoNota: fuente.tipoNota ?? null,
    numNota: fuente.numNota ?? null,
    usuarios: usuarios.map((usuario) => ({
      tipoDocumentoIdentificacion: texto(usuario?.tipoDocumentoIdentificacion).toUpperCase() || 'CC',
      numDocumentoIdentificacion: texto(usuario?.numDocumentoIdentificacion),
      tipoUsuario: texto(usuario?.tipoUsuario) || '01',
      fechaNacimiento: texto(usuario?.fechaNacimiento),
      sexo: sexo(usuario),
      servicios: {
        consultas: (usuario?.servicios?.consultas ?? []).map(normalizarConsulta),
        procedimientos: (usuario?.servicios?.procedimientos ?? []).map(normalizarProcedimiento),
      },
    })),
  }
}

function profesionalDe(linea, contexto) {
  const tipo = texto(
    linea?.tipoDocumentoIdentificacion ??
      contexto?.profesional?.tipoDocumentoIdentificacion ??
      contexto?.tipoDocumentoIdentificacion,
  ).toUpperCase()
  const numero = texto(
    linea?.numDocumentoIdentificacion ??
      contexto?.profesional?.numDocumentoIdentificacion ??
      contexto?.numDocumentoIdentificacion,
  )
  if (!tipo || !numero) return {}
  return { tipoDocumentoIdentificacion: tipo, numDocumentoIdentificacion: numero }
}

function mapearConsulta(linea, consecutivo, contexto) {
  return {
    codPrestador: linea.codPrestador,
    fechaInicioAtencion: linea.fechaHoraInicioAtencion,
    numAutorizacion: linea.numAutorizacion ?? null,
    codConsulta: linea.codConsulta,
    modalidadGrupoServicioTecSal: linea.modalidadGrupoServicioTecnol,
    grupoServicios: linea.grupoServicios,
    codServicio: linea.codServicio,
    finalidadTecnologiaSalud: linea.finalidadTecnologiaSalud,
    causaMotivoAtencion: linea.causaExterna,
    codDiagnosticoPrincipal: linea.codDiagnosticoPrincipal,
    codDiagnosticoRelacionado1: null,
    codDiagnosticoRelacionado2: null,
    codDiagnosticoRelacionado3: null,
    tipoDiagnosticoPrincipal: codigoDos(linea.tipoDiagnosticoPrincipal, '01'),
    ...profesionalDe(linea, contexto),
    vrServicio: linea.valorConsulta,
    conceptoRecaudo: linea.conceptoRecaudo,
    valorPagoModerador: linea.valorPagoModerador,
    numFEVPagoModerador: null,
    consecutivo,
  }
}

function mapearProcedimiento(linea, consecutivo, contexto) {
  const mapeado = {
    codPrestador: linea.codPrestador,
    fechaInicioAtencion: linea.fechaHoraInicioAtencion,
    idMIPRES: null,
    numAutorizacion: linea.numAutorizacion ?? null,
    codProcedimiento: linea.codProcedimiento,
    viaIngresoServicioSalud: '01',
    modalidadGrupoServicioTecSal: linea.modalidadGrupoServicioTecnol,
    grupoServicios: linea.grupoServicios,
    codServicio: linea.codServicio,
    finalidadTecnologiaSalud: linea.finalidadTecnologiaSalud,
    ...profesionalDe(linea, contexto),
    codDiagnosticoPrincipal: linea.codDiagnosticoPrincipal,
    codDiagnosticoRelacionado: null,
    codComplicacion: null,
    vrServicio: linea.valorConsulta,
    conceptoRecaudo: linea.conceptoRecaudo,
    valorPagoModerador: linea.valorPagoModerador,
    numFEVPagoModerador: null,
    consecutivo,
  }
  return mapeado
}

/**
 * Traduce el documento local al JSON que consumen Zod, el validador local y el MUV.
 * @param {object} documento
 * @param {object} [contexto]
 */
export function mapearRipsParaValidador(documento, contexto = {}) {
  const normalizado = normalizarDocumentoRipsValidador(documento)
  const municipio = texto(contexto.codMunicipioResidencia) || '11001'
  return {
    numDocumentoIdObligado: normalizado.numDocumentoIdObligado,
    numFactura: numFacturaParaValidador(normalizado.numFactura),
    tipoNota: normalizado.tipoNota,
    numNota: normalizado.numNota,
    usuarios: normalizado.usuarios.map((usuario, index) => {
      const consultas = usuario.servicios.consultas.map((linea, lineaIndex) =>
        mapearConsulta(linea, lineaIndex + 1, contexto),
      )
      const procedimientos = usuario.servicios.procedimientos.map((linea, lineaIndex) =>
        mapearProcedimiento(linea, lineaIndex + 1, contexto),
      )
      return {
        tipoDocumentoIdentificacion: usuario.tipoDocumentoIdentificacion,
        numDocumentoIdentificacion: usuario.numDocumentoIdentificacion,
        tipoUsuario: usuario.tipoUsuario,
        fechaNacimiento: usuario.fechaNacimiento,
        codSexo: usuario.sexo,
        codPaisResidencia: '170',
        codMunicipioResidencia: municipio,
        codZonaTerritorialResidencia: '01',
        incapacidad: 'NO',
        consecutivo: index + 1,
        codPaisOrigen: '170',
        registroSIRAS: null,
        servicios: {
          consultas,
          procedimientos,
        },
      }
    }),
  }
}

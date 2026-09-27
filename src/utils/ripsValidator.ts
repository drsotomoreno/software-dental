/** Consulta odontológica en el JSON local que se envía al cliente-servidor. */
export interface ConsultaOdontologica {
  /** Código REPS de habilitación (diferente al NIT). */
  codPrestador: string
  /** Formato: AAAA-MM-DD HH:MM */
  fechaHoraInicioAtencion: string
  /** Ej: "890203" (Odontología general .03) */
  codConsulta: string
  /** Ej: "01" Intramural */
  modalidadGrupoServicioTecnol: string
  /** Ej: "01" Consulta externa */
  grupoServicios: string
  codServicio: number
  finalidadTecnologiaSalud: string
  causaExterna: string
  tipoDiagnosticoPrincipal: string
  codDiagnosticoPrincipal: string
  valorConsulta: number
  conceptoRecaudo: string
  valorPagoModerador: number
}

export interface UsuarioRIPS {
  tipoDocumentoIdentificacion: string
  numDocumentoIdentificacion: string
  tipoUsuario: string
  fechaNacimiento: string
  sexo: 'M' | 'F'
  servicios: {
    consultas: ConsultaOdontologica[]
    procedimientos: unknown[]
  }
}

export interface PaqueteRIPS {
  /** NIT de la clínica. */
  numDocumentoIdObligado: string
  numFactura: string
  /** "NA" para notas de ajuste, "RS" para RIPS sin factura. */
  tipoNota: string | null
  numNota: string | null
  usuarios: UsuarioRIPS[]
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const FECHA_HORA = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
const CIE10 = /^[A-Z]\d{2}[0-9A-Z]{0,2}$/
const REPS = /^\d{12}$/

function texto(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function fechaCalendarioValida(value: string): boolean {
  const [anio, mes, dia] = value.slice(0, 10).split('-').map(Number)
  const fecha = new Date(anio, mes - 1, dia)
  return fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia
}

function exigirTexto(value: unknown, etiqueta: string, errors: string[]): string {
  const limpio = texto(value)
  if (!limpio) errors.push(`${etiqueta} es obligatorio.`)
  return limpio
}

function exigirNumero(value: unknown, etiqueta: string, errors: string[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${etiqueta} debe ser un número.`)
    return
  }
  if (value < 0) errors.push(`${etiqueta} no puede ser negativo.`)
}

/**
 * Valida la estructura básica del JSON de RIPS antes de enviarlo al cliente-servidor.
 */
export function validarEstructuraRips(data: PaqueteRIPS): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['El paquete RIPS es obligatorio.'] }
  }

  const nit = exigirTexto(data.numDocumentoIdObligado, 'El NIT del obligado (numDocumentoIdObligado)', errors)
  if (!data.numFactura && data.tipoNota !== 'RS') {
    errors.push('El número de factura es obligatorio, excepto para RIPS sin factura (tipoNota: RS).')
  }
  if (data.tipoNota != null && data.tipoNota !== 'NA' && data.tipoNota !== 'RS') {
    errors.push('tipoNota debe ser null, "NA" (nota de ajuste) o "RS" (RIPS sin factura).')
  }
  if (data.tipoNota === 'NA' && !texto(data.numNota)) {
    errors.push('El número de nota (numNota) es obligatorio cuando tipoNota es NA.')
  }

  if (!Array.isArray(data.usuarios) || data.usuarios.length === 0) {
    errors.push('El paquete debe incluir al menos un usuario.')
    return { isValid: errors.length === 0, errors }
  }

  const nitDigitos = nit.replace(/\D/g, '')

  data.usuarios.forEach((usuario, uIndex) => {
    const prefijo = `Usuario [${uIndex}]`
    exigirTexto(usuario?.tipoDocumentoIdentificacion, `${prefijo}: tipoDocumentoIdentificacion`, errors)
    exigirTexto(usuario?.numDocumentoIdentificacion, `${prefijo}: numDocumentoIdentificacion`, errors)
    exigirTexto(usuario?.tipoUsuario, `${prefijo}: tipoUsuario`, errors)

    const nacimiento = exigirTexto(usuario?.fechaNacimiento, `${prefijo}: fechaNacimiento`, errors)
    if (nacimiento && (!FECHA.test(nacimiento) || !fechaCalendarioValida(nacimiento))) {
      errors.push(`${prefijo}: fechaNacimiento debe tener formato AAAA-MM-DD.`)
    }
    if (usuario?.sexo !== 'M' && usuario?.sexo !== 'F') {
      errors.push(`${prefijo}: sexo debe ser "M" o "F".`)
    }

    const servicios = usuario?.servicios
    if (!servicios || typeof servicios !== 'object') {
      errors.push(`${prefijo}: servicios es obligatorio.`)
      return
    }
    if (!Array.isArray(servicios.consultas)) {
      errors.push(`${prefijo}: servicios.consultas debe ser un arreglo.`)
    }
    if (!Array.isArray(servicios.procedimientos)) {
      errors.push(`${prefijo}: servicios.procedimientos debe ser un arreglo.`)
    }

    ;(servicios.consultas ?? []).forEach((consulta, cIndex) => {
      const campo = `${prefijo}, Consulta [${cIndex}]`
      const prestador = exigirTexto(consulta?.codPrestador, `${campo}: codPrestador`, errors)
      if (prestador && !REPS.test(prestador)) {
        errors.push(`${campo}: codPrestador debe ser el código REPS de 12 dígitos.`)
      }
      if (prestador && nitDigitos && prestador === nitDigitos) {
        errors.push(`${campo}: el código REPS de habilitación es diferente al NIT.`)
      }

      const fecha = exigirTexto(consulta?.fechaHoraInicioAtencion, `${campo}: fechaHoraInicioAtencion`, errors)
      if (fecha && (!FECHA_HORA.test(fecha) || !fechaCalendarioValida(fecha))) {
        errors.push(`${campo}: fechaHoraInicioAtencion debe tener formato AAAA-MM-DD HH:MM.`)
      }

      const codConsulta = exigirTexto(consulta?.codConsulta, `${campo}: codConsulta`, errors)
      if (codConsulta.startsWith('89') && !codConsulta.endsWith('03')) {
        errors.push(
          `${campo}: Las consultas de odontología general deben utilizar subcategorías terminadas en .03.`,
        )
      }

      exigirTexto(consulta?.modalidadGrupoServicioTecnol, `${campo}: modalidadGrupoServicioTecnol`, errors)
      exigirTexto(consulta?.grupoServicios, `${campo}: grupoServicios`, errors)
      exigirNumero(consulta?.codServicio, `${campo}: codServicio`, errors)
      exigirTexto(consulta?.finalidadTecnologiaSalud, `${campo}: finalidadTecnologiaSalud`, errors)
      exigirTexto(consulta?.causaExterna, `${campo}: causaExterna`, errors)
      exigirTexto(consulta?.tipoDiagnosticoPrincipal, `${campo}: tipoDiagnosticoPrincipal`, errors)

      const diagnostico = exigirTexto(consulta?.codDiagnosticoPrincipal, `${campo}: codDiagnosticoPrincipal`, errors)
      if (diagnostico && !CIE10.test(diagnostico.replace(/\./g, '').toUpperCase())) {
        errors.push(`${campo}: codDiagnosticoPrincipal debe ser un CIE-10 válido.`)
      }
      if (diagnostico.includes('.')) {
        errors.push(`${campo}: codDiagnosticoPrincipal no admite puntos.`)
      }

      exigirNumero(consulta?.valorConsulta, `${campo}: valorConsulta`, errors)
      exigirTexto(consulta?.conceptoRecaudo, `${campo}: conceptoRecaudo`, errors)
      exigirNumero(consulta?.valorPagoModerador, `${campo}: valorPagoModerador`, errors)
    })
  })

  return {
    isValid: errors.length === 0,
    errors,
  }
}

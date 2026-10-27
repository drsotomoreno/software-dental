import { isOdontologyConsultationCups } from '../constants/rips.ts'

/**
 * Un recibo de caja o una FEV puede llevar varias líneas.
 * El mismo número cubre todo el paquete, y el MUV solo entrega el CUV
 * si la suma neta de RIPS es exactamente el valor neto del documento.
 */
export type TipoDocumentoPaquete = 'RECIBO_CAJA' | 'FEV'

export type GrupoRipsPaquete = 'consultas' | 'procedimientos' | 'otrosServicios'

/** Consulta de primera vez, control o urgencias (89.0.2 / 89.0.3 / 89.0.7). */
const PREFIJOS_CONSULTA = ['8902', '8903', '8907']

export interface LineaDocumentoCobro {
  id: string
  descripcion: string
  cupsCode?: string | null
  cantidad: number
  valorNeto: number
  /** Estético, insumo o servicio sin CUPS de RIPS. */
  esPersonalizado?: boolean
}

export interface ServicioPaquete {
  id: string
  grupo: GrupoRipsPaquete
  cupsCode: string | null
  descripcion: string
  cantidad: number
  valorNeto: number
  consecutivo: number
  /** Mismo número de recibo o FEV para todas las líneas del paquete. */
  numeroDocumento: string
}

export interface PaqueteDocumentoCobro {
  tipo: TipoDocumentoPaquete
  numero: string
  valorNetoDocumento: number
  consultas: ServicioPaquete[]
  procedimientos: ServicioPaquete[]
  otrosServicios: ServicioPaquete[]
}

export interface ResultadoReglaOroMuv {
  ok: boolean
  valorNetoDocumento: number
  valorNetoRips: number
  diferencia: number
  message?: string
}

export function redondearPesos(value: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(parsed)
}

export function normalizarCupsPaquete(code: string | null | undefined): string {
  const digits = String(code ?? '').replace(/\D/g, '')
  if (digits.length < 6) return ''
  return digits.slice(-6)
}

/** True para consultas, incluida 890201 aunque no sea el CUPS odontológico por defecto. */
export function esCupsConsulta(code: string | null | undefined): boolean {
  const cups = normalizarCupsPaquete(code)
  if (!/^\d{6}$/.test(cups)) return false
  if (isOdontologyConsultationCups(cups)) return true
  return PREFIJOS_CONSULTA.some((prefix) => cups.startsWith(prefix))
}

export function clasificarGrupoRips(input: {
  cupsCode?: string | null
  esPersonalizado?: boolean
  requiereCups?: boolean
}): GrupoRipsPaquete {
  if (input.esPersonalizado === true || input.requiereCups === false) return 'otrosServicios'
  if (esCupsConsulta(input.cupsCode)) return 'consultas'
  const cups = normalizarCupsPaquete(input.cupsCode)
  if (/^\d{6}$/.test(cups)) return 'procedimientos'
  return 'otrosServicios'
}

export function sumaValorNeto(servicios: Array<{ valorNeto: number }>): number {
  return servicios.reduce((sum, item) => sum + redondearPesos(item.valorNeto), 0)
}

/**
 * Regla de oro del MUV: consultas + procedimientos + otros servicios
 * = valor neto del recibo o de la FEV. Sin tolerancia.
 * Un agrupador de costo cero es válido cuando la suma de los detalles también es 0.
 */
export function validarReglaOroMuv(input: {
  valorNetoDocumento: number
  servicios: Array<{ valorNeto: number }>
  tipo?: TipoDocumentoPaquete
  numero?: string
}): ResultadoReglaOroMuv {
  const valorNetoDocumento = redondearPesos(input.valorNetoDocumento)
  const valorNetoRips = sumaValorNeto(input.servicios)
  const diferencia = valorNetoDocumento - valorNetoRips
  if (diferencia === 0) {
    return { ok: true, valorNetoDocumento, valorNetoRips, diferencia: 0 }
  }
  const documento = input.tipo === 'RECIBO_CAJA' ? 'recibo de caja' : 'FEV'
  const numero = input.numero?.trim() ? ` ${input.numero.trim()}` : ''
  return {
    ok: false,
    valorNetoDocumento,
    valorNetoRips,
    diferencia,
    message:
      `Regla MUV: la suma neta de consultas, procedimientos y otros servicios ` +
      `(${valorNetoRips}) debe ser exactamente igual al valor neto del ${documento}${numero} ` +
      `(${valorNetoDocumento}).`,
  }
}

function servicioDeLinea(
  linea: LineaDocumentoCobro,
  grupo: GrupoRipsPaquete,
  consecutivo: number,
  numeroDocumento: string,
): ServicioPaquete {
  const cups = grupo === 'otrosServicios' ? null : normalizarCupsPaquete(linea.cupsCode) || null
  return {
    id: linea.id,
    grupo,
    cupsCode: cups,
    descripcion: linea.descripcion.trim() || 'Servicio',
    cantidad: Math.max(1, redondearPesos(linea.cantidad) || 1),
    valorNeto: redondearPesos(linea.valorNeto),
    consecutivo,
    numeroDocumento,
  }
}

/**
 * Arma un solo comprobante con varias líneas. El número no se repite por ítem:
 * consultas, procedimientos y otros servicios lo comparten.
 */
export function armarPaqueteDocumentoCobro(input: {
  tipo: TipoDocumentoPaquete
  numero: string
  lineas: LineaDocumentoCobro[]
  valorNetoDocumento?: number
}): { paquete: PaqueteDocumentoCobro; regla: ResultadoReglaOroMuv } {
  const numero = String(input.numero ?? '').trim()
  const consultas: ServicioPaquete[] = []
  const procedimientos: ServicioPaquete[] = []
  const otrosServicios: ServicioPaquete[] = []
  let consecutivoConsulta = 1
  let consecutivoProcedimiento = 1
  let consecutivoOtro = 1

  for (const linea of input.lineas) {
    const grupo = clasificarGrupoRips({
      cupsCode: linea.cupsCode,
      esPersonalizado: linea.esPersonalizado,
    })
    const destino =
      grupo === 'consultas' ? consultas : grupo === 'procedimientos' ? procedimientos : otrosServicios
    const consecutivo =
      grupo === 'consultas'
        ? consecutivoConsulta++
        : grupo === 'procedimientos'
          ? consecutivoProcedimiento++
          : consecutivoOtro++
    destino.push(servicioDeLinea(linea, grupo, consecutivo, numero))
  }

  const servicios = [...consultas, ...procedimientos, ...otrosServicios]
  const valorLineas = sumaValorNeto(servicios)
  const valorNetoDocumento =
    input.valorNetoDocumento == null ? valorLineas : redondearPesos(input.valorNetoDocumento)

  const paquete: PaqueteDocumentoCobro = {
    tipo: input.tipo,
    numero,
    valorNetoDocumento,
    consultas,
    procedimientos,
    otrosServicios,
  }

  if (!numero) {
    return {
      paquete,
      regla: {
        ok: false,
        valorNetoDocumento,
        valorNetoRips: valorLineas,
        diferencia: valorNetoDocumento - valorLineas,
        message: 'El número del recibo de caja o de la FEV es obligatorio y es el mismo para todo el paquete.',
      },
    }
  }

  if (servicios.length === 0) {
    return {
      paquete,
      regla: {
        ok: false,
        valorNetoDocumento,
        valorNetoRips: 0,
        diferencia: valorNetoDocumento,
        message: 'El comprobante debe incluir al menos un servicio.',
      },
    }
  }

  if (servicios.some((item) => item.valorNeto < 0)) {
    return {
      paquete,
      regla: {
        ok: false,
        valorNetoDocumento,
        valorNetoRips: valorLineas,
        diferencia: valorNetoDocumento - valorLineas,
        message: 'El valor neto de un servicio no puede ser negativo.',
      },
    }
  }

  return {
    paquete,
    regla: validarReglaOroMuv({
      valorNetoDocumento,
      servicios,
      tipo: input.tipo,
      numero,
    }),
  }
}

/**
 * Reparte el valor de la atención. Si cada CUPS trae su costo, ese costo viaja
 * al RIPS. Si no, el total queda en el primer servicio para no inventar tarifas.
 */
export function asignarValorNetoPorCodigo(
  cups: string[],
  valorPorCodigo: ReadonlyMap<string, number>,
  valorTotal: number,
  valorCero = false,
): number[] {
  if (valorCero) return cups.map(() => 0)
  const total = redondearPesos(valorTotal)
  if (cups.length <= 1) {
    const unico = cups[0]
    if (unico && valorPorCodigo.has(unico)) return [redondearPesos(valorPorCodigo.get(unico) ?? 0)]
    return [total]
  }
  return cups.map((code, index) => {
    if (valorPorCodigo.has(code)) return redondearPesos(valorPorCodigo.get(code) ?? 0)
    return index === 0 ? total : 0
  })
}

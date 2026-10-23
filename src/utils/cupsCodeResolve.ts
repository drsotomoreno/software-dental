import cupsCatalogo from '../data/cupsOdontology.json' with { type: 'json' }

interface EntradaCups {
  codigo: string
  descripcion: string
}

const CATALOGO = cupsCatalogo as EntradaCups[]

/** 39.1.4.02 — forma jerárquica MinSalud (2.1.1.2). */
const PUNTEADO_MINSALUD = /(\d{2})\.(\d)\.(\d)\.(\d{2})(?!\d)/g
/** 39.14.02 — tres pares, todavía presente en textos viejos. */
const PUNTEADO_PARES = /(\d{2})\.(\d{2})\.(\d{2})(?!\d)/g
const COMPACTO = /(?<!\d)(\d{6})(?!\d)/g

function clave(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const porCodigo = new Map<string, string>()
const porDescripcion = new Map<string, string | null>()

for (const entrada of CATALOGO) {
  const codigo = entrada.codigo.replace(/\D/g, '')
  if (!/^\d{6}$/.test(codigo)) continue
  if (!porCodigo.has(codigo)) porCodigo.set(codigo, entrada.descripcion.trim())
  const key = clave(entrada.descripcion)
  const previo = porDescripcion.get(key)
  if (previo === undefined) porDescripcion.set(key, codigo)
  else if (previo !== codigo) porDescripcion.set(key, null)
}

function agregar(destino: string[], codigo: string) {
  if (/^\d{6}$/.test(codigo) && !destino.includes(codigo)) destino.push(codigo)
}

function consumir(texto: string, pattern: RegExp, armar: (match: RegExpExecArray) => string, destino: string[]): string {
  pattern.lastIndex = 0
  const coincidencias = [...texto.matchAll(pattern)]
  for (const match of coincidencias) agregar(destino, armar(match))
  if (coincidencias.length === 0) return texto
  pattern.lastIndex = 0
  return texto.replace(pattern, ' ')
}

/** Códigos escritos en el texto. No inventa un CUPS con los últimos dígitos sueltos (p. ej. «cap. 39»). */
export function cupsExplicitosDeTexto(value: string | null | undefined): string[] {
  const destino: string[] = []
  let resto = String(value ?? '')
  resto = consumir(resto, PUNTEADO_MINSALUD, (match) => `${match[1]}${match[2]}${match[3]}${match[4]}`, destino)
  resto = consumir(resto, PUNTEADO_PARES, (match) => `${match[1]}${match[2]}${match[3]}`, destino)
  consumir(resto, COMPACTO, (match) => match[1] ?? '', destino)
  return destino
}

/**
 * CUPS de un texto de procedimiento.
 * Acepta el código explícito o el nombre oficial del catálogo, como
 * «Ortodoncia correctiva con aparatos fijos (legacy cap. 39)» → 391402.
 */
export function cupsDesdeTexto(value: string | null | undefined): string[] {
  const explicitos = cupsExplicitosDeTexto(value)
  if (explicitos.length > 0) return explicitos
  const key = clave(String(value ?? ''))
  if (!key) return []
  const codigo = porDescripcion.get(key)
  return codigo ? [codigo] : []
}

export interface CupsResuelto {
  cupsCode: string
  procedure: string
}

export function resolverProcedimientoCups(value: string | null | undefined): CupsResuelto | null {
  const cupsCode = cupsDesdeTexto(value)[0]
  if (!cupsCode) return null
  return {
    cupsCode,
    procedure: porCodigo.get(cupsCode) ?? String(value ?? '').trim(),
  }
}

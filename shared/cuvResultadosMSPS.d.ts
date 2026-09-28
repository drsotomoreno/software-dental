export const CUV_HEX: RegExp

export function esCuvOficial(value?: string | null): boolean
export function normalizarCuv(value?: string | null): string | null
export function facturaDesdeNombreResultados(nombreArchivo?: string | null): string | null
export function archivoIndicaAprobacion(nombreArchivo?: string | null): boolean
export function extraerCuvDeTexto(contenido?: string | null): string | null

export interface LecturaResultadosMSPS {
  aprobado: boolean
  cuv: string | null
  mensaje: string
  rechazado?: boolean
}

export function interpretarResultadosMSPS(
  contenido?: string | null,
  nombreArchivo?: string | null,
): LecturaResultadosMSPS

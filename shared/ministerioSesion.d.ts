export const TOKEN_VIGENCIA_MS: number
export const TOKEN_MARGEN_MS: number
export const TOKEN_VIDA_MAXIMA_MS: number
export const HOST_STAGE_FEVRIPS: string
export const HOST_MUV_PRODUCCION: string

export function normalizarAmbiente(raw?: string | null): 'pruebas' | 'produccion'
export function hostMuvPorAmbiente(raw?: string | null): string
export function tokenSigueVigente(expiresAt: number, ahora?: number): boolean
export function vigenciaConservadora(ahora?: number): number
export function esRechazoTot003(payload: unknown): boolean

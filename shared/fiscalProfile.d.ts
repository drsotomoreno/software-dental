export const PERFIL_FISCAL_OBLIGADO_FEV: 'Obligado_FEV'
export const PERFIL_FISCAL_NO_OBLIGADO: 'No_Obligado'
export type FiscalProfile = 'Obligado_FEV' | 'No_Obligado'
export const PERFIL_FISCAL_VALUES: FiscalProfile[]
export const DEFAULT_PERFIL_FISCAL: FiscalProfile
export const PERFIL_FISCAL_NO_OBLIGADO_NOTICE: string
export const UVT_2026_VALUE_COP: number
export const UVT_OBLIGADO_FEV_THRESHOLD: number
export const UVT_OBLIGADO_FEV_AMOUNT_COP: number
export const UVT_2026_EDUCATION_BANNER: string
export const PERFIL_FISCAL_OPTIONS: Array<{
  id: FiscalProfile
  label: string
  hint: string
  notice?: string
}>
export function normalizePerfilFiscal(value?: unknown): FiscalProfile
export function isNoObligadoFev(value?: unknown): boolean
export function isObligadoFev(value?: unknown): boolean
export function allowsNullNumFactura(
  perfilFiscal?: unknown,
  options?: { allowNullNumFactura?: boolean; esRipsTemporal?: boolean },
): boolean
export function normalizeRipsNumFactura(value?: unknown): string | null

export const PROVIDER_TYPE_INSTITUCION: 'institucion'
export const PROVIDER_TYPE_INDEPENDIENTE: 'profesional_independiente'
export const PROVIDER_TYPES: Array<{ id: string; label: string; hint: string }>
export function normalizeProviderType(
  value?: string | null,
): 'institucion' | 'profesional_independiente'
export function isInstitutionProvider(value?: string | null): boolean

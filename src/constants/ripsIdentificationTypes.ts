/**
 * Tabla maestra tipos de documento de identificación — Anexo Técnico RIPS (Res. 2275/2023).
 * Valores permitidos en `tipoDocumentoIdentificacion`.
 */
export const RIPS_IDENTIFICATION_TYPES = [
  'CC',
  'CE',
  'PA',
  'RC',
  'TI',
  'NV',
  'CD',
  'SC',
  'PE',
  'PT',
] as const

export type RipsIdentificationType = (typeof RIPS_IDENTIFICATION_TYPES)[number]

export interface RipsIdentificationTypeRule {
  code: RipsIdentificationType
  label: string
  minLength: number
  maxLength: number
  /** Si true, solo dígitos (0-9). Si false, alfanumérico sin espacios ni símbolos. */
  numericOnly: boolean
}

/**
 * Longitudes según validador MUV / catálogo SISPRO de tipos de documento.
 * `numDocumentoIdentificacion`: cadena sin espacios, guiones ni caracteres especiales.
 */
export const RIPS_IDENTIFICATION_TYPE_RULES: Record<
  RipsIdentificationType,
  RipsIdentificationTypeRule
> = {
  CC: {
    code: 'CC',
    label: 'Cédula de ciudadanía',
    minLength: 3,
    maxLength: 10,
    numericOnly: true,
  },
  CE: {
    code: 'CE',
    label: 'Cédula de extranjería',
    minLength: 3,
    maxLength: 7,
    numericOnly: true,
  },
  PA: {
    code: 'PA',
    label: 'Pasaporte',
    minLength: 1,
    maxLength: 16,
    numericOnly: false,
  },
  RC: {
    code: 'RC',
    label: 'Registro civil',
    minLength: 10,
    maxLength: 11,
    numericOnly: true,
  },
  TI: {
    code: 'TI',
    label: 'Tarjeta de identidad',
    minLength: 10,
    maxLength: 11,
    numericOnly: true,
  },
  NV: {
    code: 'NV',
    label: 'Certificado de nacido vivo',
    minLength: 6,
    maxLength: 16,
    numericOnly: false,
  },
  CD: {
    code: 'CD',
    label: 'Carné diplomático',
    minLength: 1,
    maxLength: 16,
    numericOnly: false,
  },
  SC: {
    code: 'SC',
    label: 'Salvoconducto',
    minLength: 1,
    maxLength: 16,
    numericOnly: false,
  },
  PE: {
    code: 'PE',
    label: 'Permiso especial de permanencia',
    minLength: 1,
    maxLength: 15,
    numericOnly: false,
  },
  PT: {
    code: 'PT',
    label: 'Permiso por protección temporal',
    minLength: 1,
    maxLength: 8,
    numericOnly: false,
  },
}

export function isRipsIdentificationType(value: string): value is RipsIdentificationType {
  return (RIPS_IDENTIFICATION_TYPES as readonly string[]).includes(value)
}

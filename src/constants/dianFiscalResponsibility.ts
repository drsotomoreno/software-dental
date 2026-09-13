/** Responsabilidad fiscal DIAN del adquirente (paciente). */
export const DIAN_CONSUMIDOR_FINAL = 'ZZ07'

export const DIAN_FISCAL_RESPONSIBILITY_OPTIONS = [
  {
    id: DIAN_CONSUMIDOR_FINAL,
    label: 'Consumidor Final / ZZ07',
    hint: 'La mayoría de pacientes particulares. No declara IVA ni es gran contribuyente.',
  },
  {
    id: 'O-13',
    label: 'Gran contribuyente / O-13',
    hint: 'Solo si el paciente o pagador está calificado como gran contribuyente ante la DIAN.',
  },
  {
    id: 'R-99-PN',
    label: 'No responsable de IVA / R-99-PN',
    hint: 'Persona natural no responsable de IVA distinta de consumidor final.',
  },
] as const

export type DianFiscalResponsibilityCode =
  (typeof DIAN_FISCAL_RESPONSIBILITY_OPTIONS)[number]['id']

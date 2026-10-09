/**
 * Finalidad de la tecnología en salud (Res. 2275, `finalidadTecnologiaSalud`).
 * Catálogo usado en la nota de evolución; el RIPS copia el código elegido.
 */
export interface PurposeOfCareOption {
  code: string
  label: string
}

export const PURPOSE_OF_CARE_OPTIONS: PurposeOfCareOption[] = [
  { code: '11', label: 'Valoración integral de promoción y mantenimiento' },
  { code: '12', label: 'Detección temprana de enfermedad general' },
  { code: '13', label: 'Detección temprana de enfermedad laboral' },
  { code: '14', label: 'Protección específica' },
  { code: '15', label: 'Diagnóstico' },
  { code: '16', label: 'Tratamiento' },
  { code: '17', label: 'Rehabilitación' },
  { code: '18', label: 'Paliación' },
  { code: '44', label: 'Otra' },
]

export function purposeOfCareLabel(code: string): string {
  return PURPOSE_OF_CARE_OPTIONS.find((option) => option.code === code)?.label ?? code
}

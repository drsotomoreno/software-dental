/**
 * Correcciones de nomenclatura CUPS odontología (errores graves en semillas previas).
 * Clave: código CUPS normalizado de 6 dígitos.
 */
export const CUPS_DESCRIPTION_CORRECTIONS: Record<string, string> = {
  '997501': 'Exodoncia de diente permanente multirradicular',
  '997502': 'Exodoncia de dientes permanentes',
  '997503':
    'Exodoncia de diente permanente unirradicular (extracción de diente de una sola raíz)',
}

/** Etiquetas erróneas conocidas por código — para reparar precios/tarifarios ya guardados. */
export const CUPS_WRONG_PROCEDURE_LABELS: Record<string, readonly string[]> = {
  '997503': ['Carilla estética', 'Carilla estetica', 'Carilla dental estética'],
  '997501': ['Corona metal porcelana', 'Corona metal-porcelana', 'Prótesis fija unidad'],
  '997502': ['Corona provisional acrílica', 'Corona acrílica', 'Puente fijo unidad'],
}

/** Código CUPS vigente MinSalud recomendado cuando existe homólogo en capítulo 23. */
export const CUPS_PREFERRED_HOMOLOG: Record<string, string> = {
  '997501': '230102',
  '997502': '230103',
  '997503': '230101',
  '997401': '237301',
  '997402': '237302',
  '997403': '237303',
}

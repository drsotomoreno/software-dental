/**
 * Cobertura y tipo de usuario vigentes (Documento Técnico 1 v003 / Res. 948 de 2026).
 * La cobertura 01 (UPC única) está inactiva: contributivo es 16 y subsidiado es 17.
 */

/** @type {Record<'contributivo' | 'subsidiado' | 'especial' | 'particular', string>} */
export const REGIME_TO_TIPO_USUARIO = {
  contributivo: '01',
  subsidiado: '04',
  especial: '06',
  particular: '12',
}

/**
 * Combinación que pasa la matriz de cruces para el régimen clínico del paciente.
 * Modalidad 04 = pago por evento, propia de la consulta odontológica.
 *
 * @param {string | null | undefined} regime
 */
export function suggestFevSector(regime) {
  switch (regime) {
    case 'subsidiado':
      return {
        coberturaPlanBeneficios: '17',
        tipoUsuario: '04',
        modalidadPago: '04',
        conceptoRecaudo: '05',
      }
    case 'especial':
      return {
        coberturaPlanBeneficios: '13',
        tipoUsuario: '06',
        modalidadPago: '04',
        conceptoRecaudo: '05',
      }
    case 'particular':
      return {
        coberturaPlanBeneficios: '15',
        tipoUsuario: '12',
        modalidadPago: '04',
        conceptoRecaudo: '05',
      }
    case 'contributivo':
    default:
      return {
        coberturaPlanBeneficios: '16',
        tipoUsuario: '01',
        modalidadPago: '04',
        conceptoRecaudo: '05',
      }
  }
}

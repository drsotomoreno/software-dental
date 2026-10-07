export const REGIME_TO_TIPO_USUARIO: {
  contributivo: '01'
  subsidiado: '04'
  especial: '06'
  particular: '12'
}

export function suggestFevSector(regime?: string | null): {
  coberturaPlanBeneficios: '13' | '15' | '16' | '17'
  tipoUsuario: '01' | '04' | '06' | '12'
  modalidadPago: '04'
  conceptoRecaudo: '05'
}

export const LEGAL_TOOLTIP_COPY = {
  dian: {
    label: 'DIAN',
    text: 'Dirección de Impuestos y Aduanas Nacionales. Autoriza y recibe la Factura Electrónica de Venta (FEV).',
  },
  rips: {
    label: 'RIPS',
    text: 'Registro Individual de Prestación de Servicios de Salud. JSON que el Ministerio valida (MUV). El total debe coincidir con la factura.',
  },
  cups: {
    label: 'CUPS',
    text: 'Código único del procedimiento en salud. Solo puede facturarse si su sede lo tiene habilitado en REPS.',
  },
  fev: {
    label: 'FEV',
    text: 'Factura Electrónica de Venta. Lleva CUFE y QR de la DIAN. Consume 1 folio de su saldo.',
  },
  uvt: {
    label: 'UVT',
    text: 'Unidad de Valor Tributario. En 2026, 3.500 UVT equivalen a $183.309.000 COP: tope para saber si está obligado a facturar electrónicamente.',
  },
  folio: {
    label: 'Folio',
    text: 'Cupo para emitir una FEV ante la DIAN. El Recibo de Caja interno no descuenta folios.',
  },
  reps: {
    label: 'REPS',
    text: 'Registro Especial de Prestadores de Servicios de Salud. Define qué especialidades puede cobrar su sede.',
  },
  cufe: {
    label: 'CUFE',
    text: 'Código único de la factura electrónica. Debe cruzarse con el JSON RIPS para que MinSalud no rechace el paquete.',
  },
} as const

export const DIAN_PORTAL_VS_PLATFORM_COPY =
  'El portal gratuito de la DIAN no cruza la factura con el RIPS del Ministerio. Esta plataforma automatiza el cruce exacto entre la Factura (CUFE) y el RIPS JSON, ahorrando horas de trabajo manual y rechazos del MUV.'

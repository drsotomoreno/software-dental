import type { DocumentType, RegimeType } from '@/types/patient'
import type { DiagnosisCertainty } from '@/types/clinicalRecord'

/** CUPS — Consulta de primera vez por odontología general (89.0.2.03) */
export const DEFAULT_ODONTOLOGY_CONSULTATION_CUPS = '890203'

/** CUPS — Consulta de control por odontología general (89.0.3.03) */
export const ODONTOLOGY_FOLLOWUP_CONSULTATION_CUPS = '890303'

/** CUPS — Consulta de primera vez por otras especialidades en odontología (89.0.2.04) */
export const ODONTOLOGY_SPECIALTY_FIRST_VISIT_CUPS = '890204'

/** CUPS — Consulta de control por otras especialidades en odontología (89.0.3.04) */
export const ODONTOLOGY_SPECIALTY_FOLLOWUP_CUPS = '890304'

/** CUPS — Consulta de urgencias por odontología general (89.0.7.03) */
export const ODONTOLOGY_EMERGENCY_CONSULTATION_CUPS = '890703'

export const ODONTOLOGY_CONSULTATION_CUPS = {
  primeraVezGeneral: DEFAULT_ODONTOLOGY_CONSULTATION_CUPS,
  controlGeneral: ODONTOLOGY_FOLLOWUP_CONSULTATION_CUPS,
  primeraVezEspecializada: ODONTOLOGY_SPECIALTY_FIRST_VISIT_CUPS,
  controlEspecializada: ODONTOLOGY_SPECIALTY_FOLLOWUP_CUPS,
  urgenciasGeneral: ODONTOLOGY_EMERGENCY_CONSULTATION_CUPS,
} as const

/** Consultas de primera vez por especialista (89.0.2.17–89.0.2.24) */
export const ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS = {
  cirugiaOral: '890217',
  endodoncia: '890218',
  estomatologiaCirugiaOral: '890219',
  odontopediatria: '890220',
  periodoncia: '890221',
  ortodoncia: '890222',
  radiologiaOralMaxilofacial: '890223',
  rehabilitacionOral: '890224',
} as const

/** Consultas de control o seguimiento por especialista (89.0.3.17–89.0.3.24, 89.0.3.36) */
export const ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS = {
  cirugiaOralMaxilofacial: '890317',
  endodoncia: '890318',
  odontologiaDelBebe: '890319',
  odontopediatria: '890320',
  periodoncia: '890321',
  ortodoncia: '890322',
  radiologiaOralMaxilofacial: '890323',
  rehabilitacionOral: '890324',
  patologiaOralMaxilofacial: '890336',
  otrasEspecialidadesGenerico: ODONTOLOGY_SPECIALTY_FOLLOWUP_CUPS,
} as const

/** CUPS — Control mecánico de ortodoncia (89.3.1.06) */
export const ORTHODONTICS_MECHANICAL_CONTROL_CUPS = '893106'

/** Operatoria — obturaciones capítulo 23.2 (Res. 2706/2025) */
export const OPERATIVE_RESTORATION_CUPS = {
  amalgama: '232101',
  resinaFotocurado: '232102',
  ionomeroVidrio: '232103',
  sod: '232104',
  temporal: '232201',
  pinMilimetrico: '232300',
  reconstruccionAnguloIncisal: '232401',
  reconstruccionTercioIncisal: '232402',
  reconstruccionSod: '232403',
  incrustacionMetalica: '233100',
  incrustacionNoMetalica: '233200',
} as const

/** Coronas y prótesis — capítulo 23.4 (Res. 2706/2025) */
export const PROSTHETIC_RESTORATION_CUPS = {
  coronaIndividualSod: '234000',
  coronaAcrilicaProvisional: '234001',
  protesisFijaUnidad: '234201',
  reconstruccionMunones: '234202',
  pernoPatronNucleo: '234203',
  reparacionProtesisFija: '234204',
  retenedorIntraradicular: '234205',
  protesisRemovibleMucosoportada: '234301',
  protesisRemovibleDentomucosoportada: '234302',
  reparacionProtesisRemovible: '234303',
  protesisTotalMedioCaso: '234401',
  protesisTotalCasoCompleto: '234402',
  protesisTotalImplantoasistidaMedioCaso: '234403',
  protesisTotalImplantoasistidaCasoCompleto: '234404',
} as const

/** Biopsias cavidad oral — subgrupo 23.4.1 (cirugía oral) */
export const ORAL_SURGERY_BIOPSY_CUPS = {
  biopsiaIncisionalEncia: '234101',
  biopsiaExcisionalEncia: '234102',
  biopsiaHuesosMaxilares: '761101',
} as const

/** Exodoncia — capítulo 23.1 */
export const DENTAL_EXTRACTION_CUPS = {
  permanenteUnirradicular: '230101',
  permanenteMultirradicular: '230102',
  permanenteGenerico: '230103',
  temporal: '230203',
  quirurgicaUnirradicular: '231101',
  quirurgicaRetenidoImpactado: '231102',
} as const

/** Exodoncia legacy capítulo 99 (99.7.5.xx) — homólogos históricos de cap. 23.0.1 */
export const LEGACY_DENTAL_EXTRACTION_CUPS = {
  permanenteMultirradicular: '997501',
  permanenteGenerico: '997502',
  permanenteUnirradicular: '997503',
} as const

/** Endodoncia vigente capítulo 23.7.3 — Res. 2336/2023 */
export const ENDODONTIC_THERAPY_CUPS = {
  unirradicular: '237301',
  birradicular: '237302',
  multirradicular: '237303',
  temporalUnirradicular: '237304',
} as const

/** Endodoncia legacy capítulo 99 */
export const LEGACY_ENDODONTIC_CUPS = {
  unirradicular: '997401',
  birradicular: '997402',
  multirradicular: '997403',
  retratamiento: '997404',
} as const

/**
 * Datos de prestador de demostración (misma clínica seed).
 * Se usan solo cuando el perfil de sesión no tiene NIT/REPS (p. ej. login API).
 */
export const DEMO_PRESTADOR_NIT = '900123456'
export const DEMO_PRESTADOR_NIT_WITH_DV = '900123456-1'
/** REPS de demostración — 6800103898-01 (Santander / Bucaramanga / sede 01). */
export const DEMO_PRESTADOR_REPS = '680010389801'
export const DEMO_PRESTADOR_REPS_DISPLAY = '6800103898-01'
export const DEMO_PROFESSIONAL_RETHUS = '438265'

export const RIPS_DEFAULTS = {
  codPaisResidencia: '170',
  codPaisOrigen: '170',
  codZonaTerritorialResidencia: '01',
  incapacidad: '02',
  modalidadConsulta: '09',
  grupoServiciosConsulta: '01',
  modalidadProcedimiento: '01',
  grupoServiciosProcedimiento: '04',
  viaIngresoProcedimiento: '01',
  finalidadConsulta: '11',
  finalidadProcedimiento: '44',
  causaMotivoAtencion: '21',
  conceptoRecaudoParticular: '05',
  codServicio: 1,
} as const

/** tipoUsuario según catálogo MinSalud / SISPRO */
export const REGIME_TO_TIPO_USUARIO: Record<RegimeType, string> = {
  contributivo: '01',
  subsidiado: '02',
  especial: '03',
  particular: '04',
}

export const DOCUMENT_TYPE_RIPS: Record<DocumentType, string> = {
  CC: 'CC',
  TI: 'TI',
  CE: 'CE',
  PA: 'PA',
  RC: 'RC',
  NIT: 'NI',
}

const RIPS_CONSULTATION_CUPS_SET = new Set<string>([
  ...Object.values(ODONTOLOGY_CONSULTATION_CUPS),
  ...Object.values(ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS),
  ...Object.values(ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS),
])

/** True si el CUPS (6 dígitos) es una consulta odontológica (89.0.2 / 89.0.3 / 89.0.7). */
export function isOdontologyConsultationCups(code: string | null | undefined): boolean {
  const digits = String(code ?? '').replace(/\D/g, '')
  return digits.length === 6 && RIPS_CONSULTATION_CUPS_SET.has(digits)
}

export const DIAGNOSIS_CERTAINTY_TO_RIPS: Record<DiagnosisCertainty, string> = {
  impresion: '01',
  confirmado: '02',
  repetido: '03',
}

export const TIPO_USUARIO_LABELS: Record<string, string> = {
  '01': 'Contributivo cotizante',
  '02': 'Subsidiado',
  '03': 'Vinculado',
  '04': 'Particular',
  '05': 'Tomador / Amparado ARL',
  '06': 'Tomador / Amparado SOAT',
  '07': 'Tomador / Amparado planes voluntarios',
  '08': 'Tomador / Amparado planes de salud',
  '09': 'Tomador / Amparado Fosyga',
  '10': 'Tomador / Amparado SOAT',
  '11': 'Tomador / Amparado otros',
  '12': 'Especial o Excepción cotizante',
  '13': 'Especial o Excepción beneficiario',
}

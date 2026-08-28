import type { ToothNumber, DeciduousToothNumber } from '@/types/odontogram'
import type { TreatmentPhase, DiagnosisCertainty, PaymentMethod } from '@/types/clinicalRecord'

/** Cuadrantes FDI permanentes — numeración ISO 3950 */
export const UPPER_RIGHT: ToothNumber[] = [18, 17, 16, 15, 14, 13, 12, 11]
export const UPPER_LEFT: ToothNumber[] = [21, 22, 23, 24, 25, 26, 27, 28]
export const LOWER_LEFT: ToothNumber[] = [38, 37, 36, 35, 34, 33, 32, 31]
export const LOWER_RIGHT: ToothNumber[] = [41, 42, 43, 44, 45, 46, 47, 48]

export const ALL_TEETH_NUMBERS: ToothNumber[] = [
  ...UPPER_RIGHT,
  ...UPPER_LEFT,
  ...LOWER_LEFT,
  ...LOWER_RIGHT,
]

/** Dentición temporal FDI */
export const DECIDUOUS_UPPER_RIGHT: DeciduousToothNumber[] = [55, 54, 53, 52, 51]
export const DECIDUOUS_UPPER_LEFT: DeciduousToothNumber[] = [61, 62, 63, 64, 65]
export const DECIDUOUS_LOWER_LEFT: DeciduousToothNumber[] = [75, 74, 73, 72, 71]
export const DECIDUOUS_LOWER_RIGHT: DeciduousToothNumber[] = [81, 82, 83, 84, 85]

export const ALL_DECIDUOUS_TEETH: DeciduousToothNumber[] = [
  ...DECIDUOUS_UPPER_RIGHT,
  ...DECIDUOUS_UPPER_LEFT,
  ...DECIDUOUS_LOWER_LEFT,
  ...DECIDUOUS_LOWER_RIGHT,
]

/** CIE-10 odontología — códigos frecuentes en Colombia */
export const COMMON_CIE10_CODES = [
  { code: 'K02.0', description: 'Caries limitada al esmalte' },
  { code: 'K02.1', description: 'Caries de la dentina' },
  { code: 'K02.2', description: 'Caries del cemento' },
  { code: 'K02.3', description: 'Caries detenida' },
  { code: 'K02.9', description: 'Caries dental, no especificada' },
  { code: 'K03.0', description: 'Atrición excesiva de los dientes' },
  { code: 'K03.1', description: 'Abrasión de los dientes' },
  { code: 'K03.6', description: 'Depósitos en los dientes' },
  { code: 'K04.0', description: 'Pulpitis' },
  { code: 'K04.1', description: 'Necrosis de la pulpa' },
  { code: 'K04.4', description: 'Periodontitis apical aguda de origen pulpar' },
  { code: 'K04.5', description: 'Periodontitis apical crónica' },
  { code: 'K04.7', description: 'Absceso periapical sin fístula' },
  { code: 'K05.0', description: 'Gingivitis aguda' },
  { code: 'K05.1', description: 'Gingivitis crónica' },
  { code: 'K05.2', description: 'Periodontitis aguda' },
  { code: 'K05.3', description: 'Enfermedad periodontal crónica' },
  { code: 'K05.4', description: 'Periodontosis' },
  { code: 'K05.5', description: 'Otras enfermedades periodontales' },
  { code: 'K06.0', description: 'Retracción gingival' },
  { code: 'K07.0', description: 'Anomalías mayores del tamaño de los maxilares' },
  { code: 'K07.1', description: 'Anomalías de la relación maxilomandibular' },
  { code: 'K07.2', description: 'Anomalías de la posición de los dientes' },
  { code: 'K07.3', description: 'Anomalías de la posición del diente' },
  { code: 'K07.4', description: 'Maloclusión, no especificada' },
  { code: 'K08.1', description: 'Pérdida de dientes debida a accidente' },
  { code: 'K08.3', description: 'Raíz dental retenida' },
  { code: 'K08.8', description: 'Otros trastornos especificados de los dientes' },
  { code: 'K09.0', description: 'Quistes odontogénicos de desarrollo' },
  { code: 'K10.2', description: 'Enfermedades inflamatorias de los maxilares' },
  { code: 'K12.0', description: 'Aftas bucales recurrentes' },
  { code: 'K12.1', description: 'Otras formas de estomatitis' },
  { code: 'K13.0', description: 'Enfermedades de los labios' },
  { code: 'K13.7', description: 'Otras lesiones y alteraciones de la mucosa bucal' },
  { code: 'S02.5', description: 'Fractura de diente' },
]

export const DIAGNOSIS_CERTAINTY_LABELS: Record<DiagnosisCertainty, string> = {
  impresion: 'Impresión diagnóstica',
  confirmado: 'Confirmado',
  repetido: 'Repetido',
}

export const TREATMENT_PHASE_LABELS: Record<TreatmentPhase, string> = {
  fase_i: 'Fase I — Urgencias / Preventiva',
  fase_ii: 'Fase II — Higiénica / Terapéutica',
  fase_iii: 'Fase III — Correctiva / Rehabilitadora',
  fase_iv: 'Fase IV — Mantenimiento',
}

export const TREATMENT_PHASE_DESCRIPTIONS: Record<TreatmentPhase, string> = {
  fase_i: 'Control de placa, profilaxis, exodoncias de urgencia',
  fase_ii: 'Periodoncia, operatoria (resinas, ionómeros)',
  fase_iii: 'Endodoncias, prótesis, coronas, ortodoncia',
  fase_iv: 'Controles periódicos',
}

/** Procedimientos frecuentes — el odontólogo puede usarlos o escribir los suyos */
export const COMMON_DENTAL_PROCEDURES: {
  procedure: string
  cupsCode: string
  defaultPhase: TreatmentPhase
}[] = [
  {
    procedure: 'Consulta de primera vez por odontología general',
    cupsCode: '890203',
    defaultPhase: 'fase_i',
  },
  {
    procedure: 'Consulta de control o de seguimiento por odontología general',
    cupsCode: '890303',
    defaultPhase: 'fase_iv',
  },
  {
    procedure: 'Consulta de primera vez por otras especialidades en odontología',
    cupsCode: '890204',
    defaultPhase: 'fase_i',
  },
  {
    procedure:
      'Consulta de control o de seguimiento por otras especialidades en odontología (genérico)',
    cupsCode: '890304',
    defaultPhase: 'fase_iv',
  },
  {
    procedure: 'Consulta de urgencias por odontología general',
    cupsCode: '890703',
    defaultPhase: 'fase_i',
  },
  {
    procedure: 'Consulta de primera vez por especialista en Cirugía Oral',
    cupsCode: '890217',
    defaultPhase: 'fase_i',
  },
  {
    procedure: 'Consulta de primera vez por especialista en Endodoncia',
    cupsCode: '890218',
    defaultPhase: 'fase_i',
  },
  {
    procedure: 'Consulta de primera vez por especialista en Estomatología y Cirugía Oral',
    cupsCode: '890219',
    defaultPhase: 'fase_i',
  },
  {
    procedure: 'Consulta de primera vez por especialista en Odontopediatría',
    cupsCode: '890220',
    defaultPhase: 'fase_i',
  },
  {
    procedure: 'Consulta de primera vez por especialista en Periodoncia',
    cupsCode: '890221',
    defaultPhase: 'fase_i',
  },
  {
    procedure: 'Consulta de primera vez por especialista en Ortodoncia',
    cupsCode: '890222',
    defaultPhase: 'fase_i',
  },
  {
    procedure: 'Consulta de primera vez por especialista en Radiología Oral y Maxilofacial',
    cupsCode: '890223',
    defaultPhase: 'fase_i',
  },
  {
    procedure: 'Consulta de primera vez por especialista en Rehabilitación Oral',
    cupsCode: '890224',
    defaultPhase: 'fase_i',
  },
  {
    procedure:
      'Consulta de control o de seguimiento por especialista en cirugía oral y maxilofacial',
    cupsCode: '890317',
    defaultPhase: 'fase_iv',
  },
  {
    procedure: 'Consulta de control o de seguimiento por especialista en endodoncia',
    cupsCode: '890318',
    defaultPhase: 'fase_iv',
  },
  {
    procedure: 'Consulta de control o de seguimiento por especialista en odontología del bebé',
    cupsCode: '890319',
    defaultPhase: 'fase_iv',
  },
  {
    procedure: 'Consulta de control o de seguimiento por especialista en odontopediatría',
    cupsCode: '890320',
    defaultPhase: 'fase_iv',
  },
  {
    procedure: 'Consulta de control o de seguimiento por especialista en periodoncia',
    cupsCode: '890321',
    defaultPhase: 'fase_iv',
  },
  {
    procedure:
      'Consulta de control por ortodoncia — evaluación clínica y revaloración del plan',
    cupsCode: '890322',
    defaultPhase: 'fase_iv',
  },
  {
    procedure:
      'Control de ortodoncia — cambio de arcos, ligaduras o activación de aparatología',
    cupsCode: '893106',
    defaultPhase: 'fase_iii',
  },
  {
    procedure:
      'Consulta de control o de seguimiento por especialista en radiología oral y maxilofacial',
    cupsCode: '890323',
    defaultPhase: 'fase_iv',
  },
  {
    procedure: 'Consulta de control o de seguimiento por especialista en rehabilitación oral',
    cupsCode: '890324',
    defaultPhase: 'fase_iv',
  },
  {
    procedure:
      'Consulta de control o de seguimiento por especialista en patología oral y maxilofacial',
    cupsCode: '890336',
    defaultPhase: 'fase_iv',
  },
  {
    procedure: 'Profilaxis dental o pulido coronal',
    cupsCode: '997001',
    defaultPhase: 'fase_i',
  },
  {
    procedure: 'Detartraje supragingival',
    cupsCode: '997301',
    defaultPhase: 'fase_ii',
  },
  {
    procedure: 'Detartraje subgingival',
    cupsCode: '240200',
    defaultPhase: 'fase_ii',
  },
  {
    procedure: 'Alisado radicular campo cerrado',
    cupsCode: '240300',
    defaultPhase: 'fase_ii',
  },
  {
    procedure: 'Control de placa dental',
    cupsCode: '997310',
    defaultPhase: 'fase_i',
  },
  {
    procedure: 'Topicación de flúor en gel',
    cupsCode: '997103',
    defaultPhase: 'fase_i',
  },
  {
    procedure: 'Aplicación de sellantes de autocurado',
    cupsCode: '997101',
    defaultPhase: 'fase_i',
  },
  {
    procedure: 'Educación individual en salud por odontología',
    cupsCode: '990203',
    defaultPhase: 'fase_i',
  },
  { procedure: 'Exodoncia de dientes permanentes', cupsCode: '230103', defaultPhase: 'fase_i' },
  {
    procedure: 'Exodoncia de diente permanente unirradicular',
    cupsCode: '230101',
    defaultPhase: 'fase_i',
  },
  {
    procedure:
      'Exodoncia de diente permanente unirradicular (extracción de diente de una sola raíz)',
    cupsCode: '997503',
    defaultPhase: 'fase_i',
  },
  {
    procedure: 'Obturación dental con resina de fotocurado',
    cupsCode: '232102',
    defaultPhase: 'fase_ii',
  },
  {
    procedure: 'Obturación dental con ionómero de vidrio',
    cupsCode: '232103',
    defaultPhase: 'fase_ii',
  },
  {
    procedure: 'Obturación dental con amalgama',
    cupsCode: '232101',
    defaultPhase: 'fase_ii',
  },
  {
    procedure: 'Obturación temporal por diente',
    cupsCode: '232201',
    defaultPhase: 'fase_ii',
  },
  {
    procedure: 'Incrustación no metálica (cerámica, disilicato, circonio)',
    cupsCode: '233200',
    defaultPhase: 'fase_iii',
  },
  {
    procedure: 'Corona individual / funda SOD',
    cupsCode: '234000',
    defaultPhase: 'fase_iii',
  },
  {
    procedure: 'Corona acrílica o provisional',
    cupsCode: '234001',
    defaultPhase: 'fase_iii',
  },
  {
    procedure: 'Prótesis fija — unidad (pilar o póntico)',
    cupsCode: '234201',
    defaultPhase: 'fase_iii',
  },
  {
    procedure: 'Prótesis removible parcial mucosoportada',
    cupsCode: '234301',
    defaultPhase: 'fase_iii',
  },
  {
    procedure: 'Prótesis removible parcial dentomucosoportada (PPR)',
    cupsCode: '234302',
    defaultPhase: 'fase_iii',
  },
  {
    procedure: 'Prótesis total (medio caso)',
    cupsCode: '234401',
    defaultPhase: 'fase_iii',
  },
  { procedure: 'Endodoncia unirradicular', cupsCode: '997401', defaultPhase: 'fase_iii' },
  { procedure: 'Endodoncia birradicular', cupsCode: '997402', defaultPhase: 'fase_iii' },
  { procedure: 'Endodoncia multirradicular', cupsCode: '997403', defaultPhase: 'fase_iii' },
  {
    procedure: 'Terapia de conducto en diente unirradicular',
    cupsCode: '237301',
    defaultPhase: 'fase_iii',
  },
  { procedure: 'Implante dental', cupsCode: '997701', defaultPhase: 'fase_iii' },
]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  contado: 'Contado',
  cuotas: 'Cuotas',
  abono_inicial: 'Abono inicial + saldo',
  eps: 'EPS / aseguradora',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta débito/crédito',
  mixto: 'Pago mixto',
  otro: 'Otro',
}

export const DOCUMENT_TYPES = [
  { value: 'CC', label: 'Cédula de Ciudadanía' },
  { value: 'TI', label: 'Tarjeta de Identidad' },
  { value: 'CE', label: 'Cédula de Extranjería' },
  { value: 'PA', label: 'Pasaporte' },
  { value: 'RC', label: 'Registro Civil' },
  { value: 'NIT', label: 'NIT' },
] as const

export const REGIME_TYPES = [
  { value: 'contributivo', label: 'Contributivo' },
  { value: 'subsidiado', label: 'Subsidiado' },
  { value: 'especial', label: 'Régimen Especial' },
  { value: 'particular', label: 'Particular' },
] as const

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  programada: 'Programada',
  confirmada: 'Confirmada',
  en_atencion: 'En atención',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
}

export const APPOINTMENT_STATUS_COLORS: Record<string, string> = {
  programada: 'bg-blue-100 text-blue-800',
  confirmada: 'bg-green-100 text-green-800',
  en_atencion: 'bg-yellow-100 text-yellow-800',
  completada: 'bg-gray-100 text-gray-800',
  cancelada: 'bg-red-100 text-red-800',
  no_asistio: 'bg-orange-100 text-orange-800',
}

/** Texto legal de consentimiento informado — procedimientos odontológicos Colombia */
export const INFORMED_CONSENT_TEXT = `CONSENTIMIENTO INFORMADO PARA PROCEDIMIENTOS ODONTOLÓGICOS

De conformidad con la Resolución 1995 de 1999 del Ministerio de Salud de Colombia, la Ley 23 de 1981 (Ética Médica), la Ley 527 de 1999 (Comercio Electrónico y Firma Digital) y los estándares de habilitación de la Resolución 3100 de 2019, declaro que:

1. He sido informado(a) de manera clara, suficiente y comprensible por el profesional odontólogo tratante sobre mi diagnóstico, el plan de tratamiento propuesto, los procedimientos a realizar, sus beneficios, riesgos potenciales, alternativas terapéuticas y consecuencias de no recibir tratamiento.

2. Comprendo que los procedimientos odontológicos pueden incluir, entre otros: exámenes clínicos y radiográficos, profilaxis, restauraciones, endodoncias, exodoncias, cirugías orales, tratamientos periodontales, prótesis e implantes dentales.

3. He proporcionado información veraz sobre mi estado de salud general, antecedentes médicos, alergias, medicamentos actuales y antecedentes odontológicos, entendiendo que la omisión de datos relevantes puede afectar el resultado del tratamiento.

4. Autorizo al profesional odontólogo y su equipo a realizar los procedimientos acordados en el plan de tratamiento, incluyendo la administración de anestesia local u otros medicamentos necesarios para la atención.

5. Entiendo que puedo revocar este consentimiento en cualquier momento antes de la realización de un procedimiento, sin que ello afecte mi derecho a recibir atención de urgencia.

6. Acepto que mi historia clínica será registrada de forma digital y que, una vez firmada y bloqueada, constituirá un documento inalterable conforme a la normativa colombiana vigente.

Con mi firma, manifiesto que he leído, comprendido y acepto voluntariamente las condiciones aquí expuestas.`

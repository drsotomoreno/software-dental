/**
 * Nombre de procedimiento del catálogo clínico → CUPS de 6 dígitos.
 * La nota de evolución guarda el nombre; el RIPS necesita el código.
 * Origen: src/constants/dental.ts (COMMON_DENTAL_PROCEDURES).
 */

const PROCEDURE_CUPS = {
  'Consulta de primera vez por odontología general': '890203',
  'Consulta de control o de seguimiento por odontología general': '890303',
  'Consulta de primera vez por otras especialidades en odontología': '890204',
  'Consulta de control o de seguimiento por otras especialidades en odontología (genérico)': '890304',
  'Consulta de urgencias por odontología general': '890703',
  'Consulta de primera vez por especialista en Cirugía Oral': '890217',
  'Consulta de primera vez por especialista en Endodoncia': '890218',
  'Consulta de primera vez por especialista en Estomatología y Cirugía Oral': '890219',
  'Consulta de primera vez por especialista en Odontopediatría': '890220',
  'Consulta de primera vez por especialista en Periodoncia': '890221',
  'Consulta de primera vez por especialista en Ortodoncia': '890222',
  'Consulta de primera vez por especialista en Radiología Oral y Maxilofacial': '890223',
  'Consulta de primera vez por especialista en Rehabilitación Oral': '890224',
  'Consulta de control o de seguimiento por especialista en cirugía oral y maxilofacial': '890317',
  'Consulta de control o de seguimiento por especialista en endodoncia': '890318',
  'Consulta de control o de seguimiento por especialista en odontología del bebé': '890319',
  'Consulta de control o de seguimiento por especialista en odontopediatría': '890320',
  'Consulta de control o de seguimiento por especialista en periodoncia': '890321',
  'Consulta de control por ortodoncia — evaluación clínica y revaloración del plan': '890322',
  'Control de ortodoncia — cambio de arcos, ligaduras o activación de aparatología': '893106',
  'Consulta de control o de seguimiento por especialista en radiología oral y maxilofacial': '890323',
  'Consulta de control o de seguimiento por especialista en rehabilitación oral': '890324',
  'Consulta de control o de seguimiento por especialista en patología oral y maxilofacial': '890336',
  'Profilaxis dental o pulido coronal': '997001',
  'Detartraje supragingival': '997301',
  'Detartraje subgingival': '240200',
  'Alisado radicular campo cerrado': '240300',
  'Control de placa dental': '997310',
  'Topicación de flúor en gel': '997103',
  'Aplicación de sellantes de autocurado': '997101',
  'Educación individual en salud por odontología': '990203',
  'Exodoncia de dientes permanentes': '230103',
  'Exodoncia de diente permanente unirradicular': '230101',
  'Exodoncia de diente permanente unirradicular (extracción de diente de una sola raíz)': '997503',
  'Obturación dental con resina de fotocurado': '232102',
  'Obturación dental con ionómero de vidrio': '232103',
  'Obturación dental con amalgama': '232101',
  'Obturación temporal por diente': '232201',
  'Incrustación no metálica (cerámica, disilicato, circonio)': '233200',
  'Corona individual / funda SOD': '234000',
  'Corona acrílica o provisional': '234001',
  'Prótesis fija — unidad (pilar o póntico)': '234201',
  'Prótesis removible parcial mucosoportada': '234301',
  'Prótesis removible parcial dentomucosoportada (PPR)': '234302',
  'Prótesis total (medio caso)': '234401',
  'Endodoncia unirradicular': '997401',
  'Endodoncia birradicular': '997402',
  'Endodoncia multirradicular': '997403',
  'Terapia de conducto en diente unirradicular': '237301',
  'Implante dental': '997701',
}

function foldProcedureName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const BY_FOLDED = new Map(
  Object.entries(PROCEDURE_CUPS).map(([name, code]) => [foldProcedureName(name), code]),
)

/** @param {unknown} name @returns {string} CUPS de 6 dígitos, o cadena vacía. */
export function cupsFromProcedureName(name) {
  const folded = foldProcedureName(name)
  if (!folded) return ''
  return BY_FOLDED.get(folded) || ''
}

export { PROCEDURE_CUPS }

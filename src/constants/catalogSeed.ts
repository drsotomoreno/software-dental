import type { CatalogImportPayload } from '@/types/catalog'
import {
  CUPS_ODONTOLOGIA_VERSION,
  cupsOdontologyToCatalogItems,
} from '@/constants/cupsOdontologyData'

/** CIE-10 odontología — base oficial Res. 1995 / RIPS Colombia */
export const CIE10_SEED_ITEMS: CatalogImportPayload['items'] = [
  { code: 'K00.0', description: 'Anodoncia', chapter: 'K00-K14' },
  { code: 'K00.1', description: 'Dientes supernumerarios', chapter: 'K00-K14' },
  { code: 'K00.2', description: 'Anomalías del tamaño y forma de los dientes', chapter: 'K00-K14' },
  { code: 'K00.3', description: 'Dientes moteados', chapter: 'K00-K14' },
  { code: 'K00.4', description: 'Alteraciones en la formación de los dientes', chapter: 'K00-K14' },
  { code: 'K00.5', description: 'Anomalías hereditarias de la estructura dental', chapter: 'K00-K14' },
  { code: 'K00.6', description: 'Alteraciones en la erupción de los dientes', chapter: 'K00-K14' },
  { code: 'K00.7', description: 'Síndrome de erupción dentaria', chapter: 'K00-K14' },
  { code: 'K00.8', description: 'Otros trastornos del desarrollo de los dientes', chapter: 'K00-K14' },
  { code: 'K00.9', description: 'Trastorno del desarrollo de los dientes, no especificado', chapter: 'K00-K14' },
  { code: 'K01.0', description: 'Dientes incluidos', chapter: 'K00-K14' },
  { code: 'K01.1', description: 'Dientes impactados', chapter: 'K00-K14' },
  { code: 'K02.0', description: 'Caries limitada al esmalte', chapter: 'K00-K14' },
  { code: 'K02.1', description: 'Caries de la dentina', chapter: 'K00-K14' },
  { code: 'K02.2', description: 'Caries del cemento', chapter: 'K00-K14' },
  { code: 'K02.3', description: 'Caries detenida', chapter: 'K00-K14' },
  { code: 'K02.4', description: 'Odontoclasia', chapter: 'K00-K14' },
  { code: 'K02.8', description: 'Otras caries dentales', chapter: 'K00-K14' },
  { code: 'K02.9', description: 'Caries dental, no especificada', chapter: 'K00-K14' },
  { code: 'K03.0', description: 'Atrición excesiva de los dientes', chapter: 'K00-K14' },
  { code: 'K03.1', description: 'Abrasión de los dientes', chapter: 'K00-K14' },
  { code: 'K03.2', description: 'Erosión de los dientes', chapter: 'K00-K14' },
  { code: 'K03.3', description: 'Reabsorción patológica de los dientes', chapter: 'K00-K14' },
  { code: 'K03.4', description: 'Hipercementosis', chapter: 'K00-K14' },
  { code: 'K03.5', description: 'Reabsorción anquilótica de la raíz', chapter: 'K00-K14' },
  { code: 'K03.6', description: 'Depósitos en los dientes', chapter: 'K00-K14' },
  { code: 'K03.7', description: 'Cambios posteruptivos del color de los tejidos duros de los dientes', chapter: 'K00-K14' },
  { code: 'K03.8', description: 'Otras enfermedades especificadas de los tejidos duros de los dientes', chapter: 'K00-K14' },
  { code: 'K03.9', description: 'Enfermedad de los tejidos duros de los dientes, no especificada', chapter: 'K00-K14' },
  { code: 'K04.0', description: 'Pulpitis', chapter: 'K00-K14' },
  { code: 'K04.1', description: 'Necrosis de la pulpa', chapter: 'K00-K14' },
  { code: 'K04.2', description: 'Degeneración de la pulpa', chapter: 'K00-K14' },
  { code: 'K04.3', description: 'Formación anormal de tejido duro en la pulpa', chapter: 'K00-K14' },
  { code: 'K04.4', description: 'Periodontitis apical aguda de origen pulpar', chapter: 'K00-K14' },
  { code: 'K04.5', description: 'Periodontitis apical crónica', chapter: 'K00-K14' },
  { code: 'K04.6', description: 'Absceso periapical con fístula', chapter: 'K00-K14' },
  { code: 'K04.7', description: 'Absceso periapical sin fístula', chapter: 'K00-K14' },
  { code: 'K04.8', description: 'Quiste radicular', chapter: 'K00-K14' },
  { code: 'K04.9', description: 'Otras enfermedades de la pulpa y de los tejidos periapicales', chapter: 'K00-K14' },
  { code: 'K05.0', description: 'Gingivitis aguda', chapter: 'K00-K14' },
  { code: 'K05.1', description: 'Gingivitis crónica', chapter: 'K00-K14' },
  { code: 'K05.2', description: 'Periodontitis aguda', chapter: 'K00-K14' },
  { code: 'K05.3', description: 'Enfermedad periodontal crónica', chapter: 'K00-K14' },
  { code: 'K05.4', description: 'Periodontosis', chapter: 'K00-K14' },
  { code: 'K05.5', description: 'Otras enfermedades periodontales', chapter: 'K00-K14' },
  { code: 'K05.6', description: 'Lesión periodontal asociada a la tracción', chapter: 'K00-K14' },
  { code: 'K06.0', description: 'Retracción gingival', chapter: 'K00-K14' },
  { code: 'K06.1', description: 'Hiperplasia gingival', chapter: 'K00-K14' },
  { code: 'K06.2', description: 'Lesiones de la encía y del reborde alveolar edéntulo', chapter: 'K00-K14' },
  { code: 'K06.8', description: 'Otros trastornos de la encía y del reborde alveolar edéntulo', chapter: 'K00-K14' },
  { code: 'K07.0', description: 'Anomalías mayores del tamaño de los maxilares', chapter: 'K00-K14' },
  { code: 'K07.1', description: 'Anomalías de la relación maxilomandibular', chapter: 'K00-K14' },
  { code: 'K07.2', description: 'Anomalías de la posición de los dientes', chapter: 'K00-K14' },
  { code: 'K07.3', description: 'Anomalías de la posición del diente', chapter: 'K00-K14' },
  { code: 'K07.4', description: 'Maloclusión, no especificada', chapter: 'K00-K14' },
  { code: 'K07.5', description: 'Anomalías dentofaciales funcionales', chapter: 'K00-K14' },
  { code: 'K07.6', description: 'Trastornos de la articulación temporomandibular', chapter: 'K00-K14' },
  { code: 'K08.0', description: 'Exfoliación de los dientes debida a causas sistémicas', chapter: 'K00-K14' },
  { code: 'K08.1', description: 'Pérdida de dientes debida a accidente', chapter: 'K00-K14' },
  { code: 'K08.2', description: 'Atrofia del reborde alveolar edéntulo', chapter: 'K00-K14' },
  { code: 'K08.3', description: 'Raíz dental retenida', chapter: 'K00-K14' },
  { code: 'K08.8', description: 'Otros trastornos especificados de los dientes', chapter: 'K00-K14' },
  { code: 'K08.9', description: 'Trastorno de los dientes y de sus estructuras de sostén, no especificado', chapter: 'K00-K14' },
  { code: 'K09.0', description: 'Quistes odontogénicos de desarrollo', chapter: 'K00-K14' },
  { code: 'K09.1', description: 'Quistes de las fisuras', chapter: 'K00-K14' },
  { code: 'K09.2', description: 'Otros quistes de los maxilares', chapter: 'K00-K14' },
  { code: 'K10.0', description: 'Trastornos del desarrollo de los maxilares', chapter: 'K00-K14' },
  { code: 'K10.1', description: 'Quiste anomal del desarrollo de los maxilares', chapter: 'K00-K14' },
  { code: 'K10.2', description: 'Enfermedades inflamatorias de los maxilares', chapter: 'K00-K14' },
  { code: 'K10.3', description: 'Alveolitis de los maxilares', chapter: 'K00-K14' },
  { code: 'K12.0', description: 'Aftas bucales recurrentes', chapter: 'K00-K14' },
  { code: 'K12.1', description: 'Otras formas de estomatitis', chapter: 'K00-K14' },
  { code: 'K12.2', description: 'Celulitis y absceso de boca', chapter: 'K00-K14' },
  { code: 'K13.0', description: 'Enfermedades de los labios', chapter: 'K00-K14' },
  { code: 'K13.7', description: 'Otras lesiones y alteraciones de la mucosa bucal', chapter: 'K00-K14' },
  { code: 'S02.5', description: 'Fractura de diente', chapter: 'S00-S09' },
]

/** CUPS odontología — base MinSalud Colombia (actualizable vía importación) */
export const ODONTOLOGY_CONSULTATION_CUPS_ITEMS: CatalogImportPayload['items'] = [
  {
    code: '890203',
    description: 'Consulta de primera vez por odontología general',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890303',
    description: 'Consulta de control o de seguimiento por odontología general',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890204',
    description: 'Consulta de primera vez por otras especialidades en odontología',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890304',
    description:
      'Consulta de control o de seguimiento por otras especialidades en odontología (genérico cuando la subespecialidad no tiene código específico asignado; ej.: implantología, disfunción temporomandibular/dolor orofacial)',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890703',
    description: 'Consulta de urgencias por odontología general',
    specialty: 'odontologia',
    chapter: '89',
  },
]

/** Códigos de consulta odontológica reemplazados por el catálogo vigente */
export const OBSOLETE_ODONTOLOGY_CONSULTATION_CUPS = [
  '890201',
  '890301',
  '890202',
  '890302',
  '890701',
  '890305',
] as const

/** Consultas de primera vez por especialista — catálogo MinSalud Colombia */
export const ODONTOLOGY_SPECIALIST_FIRST_VISIT_CUPS_ITEMS: CatalogImportPayload['items'] = [
  {
    code: '890217',
    description: 'Consulta de primera vez por especialista en Cirugía Oral',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890218',
    description: 'Consulta de primera vez por especialista en Endodoncia',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890219',
    description: 'Consulta de primera vez por especialista en Estomatología y Cirugía Oral',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890220',
    description: 'Consulta de primera vez por especialista en Odontopediatría',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890221',
    description: 'Consulta de primera vez por especialista en Periodoncia',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890222',
    description: 'Consulta de primera vez por especialista en Ortodoncia',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890223',
    description: 'Consulta de primera vez por especialista en Radiología Oral y Maxilofacial',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890224',
    description: 'Consulta de primera vez por especialista en Rehabilitación Oral',
    specialty: 'odontologia',
    chapter: '89',
  },
]

/** Consultas de control o seguimiento por especialista — catálogo MinSalud Colombia */
export const ODONTOLOGY_SPECIALIST_FOLLOWUP_CUPS_ITEMS: CatalogImportPayload['items'] = [
  {
    code: '890317',
    description:
      'Consulta de control o de seguimiento por especialista en cirugía oral y maxilofacial',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890318',
    description: 'Consulta de control o de seguimiento por especialista en endodoncia',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890319',
    description:
      'Consulta de control o de seguimiento por especialista en odontología del bebé',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890320',
    description: 'Consulta de control o de seguimiento por especialista en odontopediatría',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890321',
    description: 'Consulta de control o de seguimiento por especialista en periodoncia',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890322',
    description:
      'Consulta de control por ortodoncia — evaluación clínica formal, revaloración del plan de tratamiento o decisiones diagnósticas en la evolución del paciente',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890323',
    description:
      'Consulta de control o de seguimiento por especialista en radiología oral y maxilofacial',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890324',
    description: 'Consulta de control o de seguimiento por especialista en rehabilitación oral',
    specialty: 'odontologia',
    chapter: '89',
  },
  {
    code: '890336',
    description:
      'Consulta de control o de seguimiento por especialista en patología oral y maxilofacial',
    specialty: 'odontologia',
    chapter: '89',
  },
]

/** Procedimientos de ortodoncia — catálogo MinSalud Colombia */
export const ODONTOLOGY_ORTHODONTICS_PROCEDURE_CUPS_ITEMS: CatalogImportPayload['items'] = [
  {
    code: '893106',
    description:
      'Control de ortodoncia — controles mecánicos periódicos (cambio de arcos, ligaduras, activación de aparatología fija o removible)',
    specialty: 'odontologia',
    chapter: '89',
  },
]

/** Códigos de ortodoncia reemplazados por el catálogo vigente */
export const OBSOLETE_ORTHODONTICS_CUPS = ['391403'] as const

/** Operatoria dental — categoría 23.2 Restauración mediante obturaciones (Res. 2706/2025) */
export const ODONTOLOGY_OPERATIVE_RESTORATION_CUPS_ITEMS: CatalogImportPayload['items'] = [
  {
    code: '232101',
    description: 'Obturación dental con amalgama — restauraciones metálicas por diente',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '232102',
    description:
      'Obturación dental con resina de fotocurado — por pieza dental tratada (sin importar número de superficies)',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '232103',
    description: 'Obturación dental con ionómero de vidrio — restauración o base con ionómero de vidrio',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '232104',
    description: 'Obturación dental SOD — código genérico de obturación directa',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '232201',
    description: 'Obturación temporal por diente — curación o material provisional (eugenol, IRM, Fermín)',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '232300',
    description:
      'Colocación de pin milimétrico SOD — retención adicional intrarradicular o dentinaria para operatoria',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '232401',
    description:
      'Reconstrucción de ángulo incisal con resina de fotocurado — operatoria sector anterior (clase IV de Black / fractura incisal)',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '232402',
    description:
      'Reconstrucción de tercio incisal con resina de fotocurado — borde incisal o desgaste severo en sector anterior',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '232403',
    description:
      'Reconstrucción dental SOD — reconstrucción mayor pre-endodóntica o previa a tallado de corona',
    specialty: 'odontologia',
    chapter: '23',
  },
]

/** Incrustaciones y coronas unitarias no metálicas — categoría 23.3 (Res. 2706/2025) */
export const ODONTOLOGY_INLAY_RESTORATION_CUPS_ITEMS: CatalogImportPayload['items'] = [
  {
    code: '233100',
    description: 'Restauración de dientes mediante incrustación metálica SOD',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '233200',
    description:
      'Restauración de dientes mediante incrustación no metálica SOD — coronas unitarias e incrustaciones no metálicas (cerámica, disilicato, cerómero, circonio)',
    specialty: 'odontologia',
    chapter: '23',
  },
]

/** Coronas, prótesis fija/removible y totales — categoría 23.4 (Res. 2706/2025) */
export const ODONTOLOGY_PROSTHETIC_RESTORATION_CUPS_ITEMS: CatalogImportPayload['items'] = [
  {
    code: '234000',
    description: 'Colocación de corona individual / provisional SOD — código genérico para coronas o fundas',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '234001',
    description: 'Colocación o aplicación de corona acrílica o provisional — coronas temporales en acrílico o resina',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '234201',
    description:
      'Colocación o inserción de prótesis fija cada unidad (pilar y pónticos) — se reporta N veces según unidades del puente',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '234202',
    description: 'Reconstrucción de muñones — reconstrucción coronaria para muñón protésico',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '234203',
    description: 'Perno o patrón de núcleo — perno o retenedor colado',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '234204',
    description: 'Reparación de prótesis fija — recementación, reparación de frente estético o retiro de póntico/unidad',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '234205',
    description: 'Inserción de retenedor intrarradicular — poste de fibra de vidrio u otros postes prefabricados',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '234301',
    description:
      'Colocación o inserción de prótesis removible (superior o inferior) mucosoportada — prótesis parcial acrílica por arcada',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '234302',
    description:
      'Colocación o inserción de prótesis removible (superior o inferior) dentomucosoportada — prótesis parcial metálica / esquelética (PPR)',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '234303',
    description: 'Reparación de prótesis removible — rebasados, adición de dientes, ganchos o soldaduras',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '234401',
    description: 'Prótesis total mucosoportada (medio caso) — prótesis total acrílica superior o inferior',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '234402',
    description: 'Prótesis total mucosoportada (caso completo) — prótesis total acrílica superior e inferior',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '234403',
    description:
      'Prótesis total implantoasistida (medio caso) — sobredentadura o prótesis híbrida sobre implantes (superior o inferior)',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '234404',
    description:
      'Prótesis total implantoasistida (caso completo) — sobredentadura o prótesis híbrida sobre implantes (superior e inferior)',
    specialty: 'odontologia',
    chapter: '23',
  },
]

/** Biopsias en cavidad oral — subgrupo 23.4.1 (cirugía oral; no confundir con coronas 23.4.0) */
export const ODONTOLOGY_ORAL_SURGERY_BIOPSY_CUPS_ITEMS: CatalogImportPayload['items'] = [
  {
    code: '234101',
    description: 'Biopsia incisional de encía',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '234102',
    description: 'Biopsia excisional de encía',
    specialty: 'odontologia',
    chapter: '23',
  },
]

/** Exodoncia — categoría 23.1 (códigos corregidos; antes estaban mal en 232.1xx) */
export const ODONTOLOGY_EXTRACTION_CUPS_ITEMS: CatalogImportPayload['items'] = [
  {
    code: '230101',
    description: 'Exodoncia de diente permanente unirradicular',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '230102',
    description: 'Exodoncia de diente permanente multirradicular',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '230103',
    description: 'Exodoncia de dientes permanentes',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '230203',
    description: 'Exodoncia de diente temporal',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '231101',
    description: 'Exodoncia quirúrgica de diente unirradicular',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '231102',
    description: 'Exodoncia quirúrgica de diente retenido o impactado',
    specialty: 'odontologia',
    chapter: '23',
  },
]

/**
 * Exodoncia legacy capítulo 99 (99.7.5.xx) — nomenclatura histórica aún usada en tarifarios.
 * No confundir con prótesis (99.7.6.xx). Homólogos vigentes: capítulo 23.0.1.xx.
 */
export const ODONTOLOGY_LEGACY_EXTRACTION_CUPS_ITEMS: CatalogImportPayload['items'] = [
  {
    code: '997501',
    description: 'Exodoncia de diente permanente multirradicular',
    specialty: 'odontologia',
    chapter: '99',
  },
  {
    code: '997502',
    description: 'Exodoncia de dientes permanentes',
    specialty: 'odontologia',
    chapter: '99',
  },
  {
    code: '997503',
    description:
      'Exodoncia de diente permanente unirradicular (extracción de diente de una sola raíz)',
    specialty: 'odontologia',
    chapter: '99',
  },
]

/** Endodoncia vigente capítulo 23.7.3 — Res. 2336/2023 */
export const ODONTOLOGY_ENDODONTICS_CUPS_ITEMS: CatalogImportPayload['items'] = [
  {
    code: '237301',
    description: 'Terapia de conducto radicular en diente unirradicular',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '237302',
    description: 'Terapia de conducto radicular en diente birradicular',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '237303',
    description: 'Terapia de conducto radicular en diente multirradicular',
    specialty: 'odontologia',
    chapter: '23',
  },
  {
    code: '237304',
    description: 'Terapia de conducto radicular en diente temporal unirradicular',
    specialty: 'odontologia',
    chapter: '23',
  },
]

/** Operatoria en capítulo 99 reemplazada por categoría 23.2 */
export const OBSOLETE_OPERATORIA_CUPS = ['997201', '997202', '997203', '997204'] as const

/** Prótesis y coronas en capítulo 99 reemplazadas por categoría 23.3 / 23.4 */
export const OBSOLETE_PROSTHETIC_CUPS = ['997601', '997602', '997603'] as const

/** Preventivo, educación y periodoncia — catálogo MinSalud Colombia */
export const ODONTOLOGY_PREVENTIVE_PERIODONTAL_CUPS_ITEMS: CatalogImportPayload['items'] = [
  {
    code: '997001',
    description: 'Profilaxis dental o pulido coronal',
    specialty: 'odontologia',
    chapter: '99',
  },
  {
    code: '997101',
    description: 'Aplicación de sellantes de autocurado',
    specialty: 'odontologia',
    chapter: '99',
  },
  {
    code: '997102',
    description: 'Aplicación de sellantes de fotocurado',
    specialty: 'odontologia',
    chapter: '99',
  },
  {
    code: '997103',
    description: 'Topicación de flúor en gel',
    specialty: 'odontologia',
    chapter: '99',
  },
  {
    code: '997104',
    description: 'Topicación de flúor en solución',
    specialty: 'odontologia',
    chapter: '99',
  },
  {
    code: '997106',
    description: 'Topicación de flúor en barniz',
    specialty: 'odontologia',
    chapter: '99',
  },
  {
    code: '997301',
    description: 'Detartraje supragingival',
    specialty: 'odontologia',
    chapter: '99',
  },
  {
    code: '997310',
    description: 'Control de placa dental',
    specialty: 'odontologia',
    chapter: '99',
  },
  {
    code: '990212',
    description: 'Sesión educativa individual por higiene oral',
    specialty: 'odontologia',
    chapter: '99',
  },
  {
    code: '990203',
    description: 'Educación individual en salud por odontología',
    specialty: 'odontologia',
    chapter: '99',
  },
  {
    code: '240200',
    description: 'Detartraje subgingival',
    specialty: 'odontologia',
    chapter: '24',
  },
  {
    code: '240300',
    description: 'Alisado radicular campo cerrado',
    specialty: 'odontologia',
    chapter: '24',
  },
]

export const CUPS_SEED_ITEMS: CatalogImportPayload['items'] = cupsOdontologyToCatalogItems()

export const CATALOG_SEED_VERSION = CUPS_ODONTOLOGIA_VERSION

export const DEFAULT_CATALOG_SEEDS: CatalogImportPayload[] = [
  {
    catalogType: 'cie10',
    version: CATALOG_SEED_VERSION,
    source: 'OMS / MinSalud Colombia — Capítulo K odontológico',
    description: 'Diagnósticos CIE-10 para odontología',
    items: CIE10_SEED_ITEMS,
  },
  {
    catalogType: 'cups',
    version: CATALOG_SEED_VERSION,
    source: 'MinSalud Colombia — Procedimientos odontológicos',
    description: 'Códigos CUPS odontología y consultas',
    items: CUPS_SEED_ITEMS,
  },
]

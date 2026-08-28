/**
 * Genera src/data/cupsOdontology.json — catálogo CUPS odontología Colombia
 * Fuente: Res. 2706/2025 (MinSalud) + códigos legacy capítulo 99 aún usados en tarifarios.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {Array<[string, string, string]>} */
const RAW = [
  // —— Consultas (89.02 / 89.03 / 89.07) ——
  ['890103', 'Atención domiciliaria por odontología general', 'Consulta'],
  ['890203', 'Consulta de primera vez por odontología general', 'Consulta'],
  ['890204', 'Consulta de primera vez por odontología especializada', 'Consulta'],
  ['890217', 'Consulta de primera vez por especialista en Cirugía Oral', 'Consulta'],
  ['890218', 'Consulta de primera vez por especialista en Endodoncia', 'Consulta'],
  ['890219', 'Consulta de primera vez por especialista en Estomatología y Cirugía Oral', 'Consulta'],
  ['890220', 'Consulta de primera vez por especialista en Odontopediatría', 'Consulta'],
  ['890221', 'Consulta de primera vez por especialista en Periodoncia', 'Consulta'],
  ['890222', 'Consulta de primera vez por especialista en Ortodoncia', 'Consulta'],
  ['890223', 'Consulta de primera vez por especialista en Radiología Oral y Maxilofacial', 'Consulta'],
  ['890224', 'Consulta de primera vez por especialista en Rehabilitación Oral', 'Consulta'],
  ['890303', 'Consulta de control o de seguimiento por odontología general', 'Consulta'],
  ['890304', 'Consulta de control o de seguimiento por odontología especializada', 'Consulta'],
  ['890317', 'Consulta de control por especialista en cirugía oral y maxilofacial', 'Consulta'],
  ['890318', 'Consulta de control por especialista en endodoncia', 'Consulta'],
  ['890319', 'Consulta de control por especialista en odontología del bebé', 'Consulta'],
  ['890320', 'Consulta de control por especialista en odontopediatría', 'Consulta'],
  ['890321', 'Consulta de control por especialista en periodoncia', 'Consulta'],
  ['890322', 'Consulta de control por ortodoncia', 'Consulta'],
  ['890323', 'Consulta de control por especialista en radiología oral y maxilofacial', 'Consulta'],
  ['890324', 'Consulta de control por especialista en rehabilitación oral', 'Consulta'],
  ['890336', 'Consulta de control por especialista en patología oral y maxilofacial', 'Consulta'],
  ['890403', 'Interconsulta por odontología general', 'Consulta'],
  ['890404', 'Interconsulta por odontología especializada', 'Consulta'],
  ['890503', 'Participación en junta médica u odontológica', 'Consulta'],
  ['890603', 'Evaluación odontológica en donante potencial de órganos', 'Consulta'],
  ['890604', 'Atención intrahospitalaria por odontología especializada', 'Consulta'],
  ['890703', 'Consulta de urgencias por odontología general', 'Consulta'],
  ['890704', 'Consulta de urgencias por odontología especializada', 'Consulta'],

  // —— Diagnóstico odontológico (89.31) ——
  ['893101', 'Impresión de arco dentario con modelo de estudio', 'Diagnóstico'],
  ['893102', 'Fotografía clínica diagnóstica', 'Diagnóstico'],
  ['893103', 'Evaluación y medición ortodóntica', 'Diagnóstico'],
  ['893104', 'Estudio de oclusión y ATM', 'Diagnóstico'],
  ['893105', 'Máscara facial diagnóstica ortodóncica', 'Diagnóstico'],
  ['893106', 'Control de ortodoncia', 'Diagnóstico'],
  ['893107', 'Elaboración y adaptación de aparato ortopédico', 'Diagnóstico'],
  ['893108', 'Control de crecimiento y desarrollo dentomaxilofacial', 'Diagnóstico'],
  ['893109', 'Examen de mucosa oral y periodontal', 'Diagnóstico'],
  ['893110', 'Elaboración de aparato ortésico intraoral', 'Diagnóstico'],

  // —— Radiología oral (87.04) ——
  ['870440', 'Radiografía oclusal intraoral', 'Diagnóstico'],
  ['870450', 'Radiografía periapical milimetrada', 'Diagnóstico'],
  ['870451', 'Radiografía periapical de dientes anteriores superiores', 'Diagnóstico'],
  ['870452', 'Radiografía periapical de dientes anteriores inferiores', 'Diagnóstico'],
  ['870453', 'Radiografía periapical de zona de caninos', 'Diagnóstico'],
  ['870454', 'Radiografía periapical de premolares', 'Diagnóstico'],
  ['870455', 'Radiografía periapical de molares', 'Diagnóstico'],
  ['870456', 'Juego completo de radiografías periapicales', 'Diagnóstico'],
  ['870460', 'Radiografía coronal (aleta de mordida)', 'Diagnóstico'],
  ['870470', 'Radiografía panorámica', 'Diagnóstico'],
  ['870480', 'Tomografía dental (CBCT)', 'Diagnóstico'],
  ['870490', 'Cefalometría lateral', 'Diagnóstico'],
  ['871010', 'Radiografía periapical (legacy)', 'Diagnóstico'],
  ['871011', 'Serie radiográfica periapical completa (legacy)', 'Diagnóstico'],
  ['871020', 'Radiografía panorámica (legacy)', 'Diagnóstico'],
  ['871021', 'Cefalometría lateral (legacy)', 'Diagnóstico'],
  ['871030', 'Radiografía oclusal (legacy)', 'Diagnóstico'],
  ['871040', 'Tomografía dental CBCT (legacy)', 'Diagnóstico'],
  ['871050', 'Radiografía de articulación temporomandibular', 'Diagnóstico'],

  // —— Educación en salud (99.02) ——
  ['990103', 'Educación grupal en salud, por odontología', 'Educación en salud'],
  ['990112', 'Educación grupal en salud, por higiene oral', 'Educación en salud'],
  ['990203', 'Educación individual en salud, por odontología', 'Educación en salud'],
  ['990212', 'Educación individual en salud, por higiene oral', 'Educación en salud'],

  // —— Preventiva / higiene (99.70 / 99.71) ——
  ['997001', 'Profilaxis dental o pulido coronal', 'Preventiva'],
  ['997002', 'Control de placa dental', 'Preventiva'],
  ['997101', 'Aplicación de sellantes de autocurado', 'Preventiva'],
  ['997102', 'Aplicación de sellantes de fotocurado', 'Preventiva'],
  ['997103', 'Topicación de flúor en gel', 'Preventiva'],
  ['997104', 'Topicación de flúor en solución', 'Preventiva'],
  ['997105', 'Aplicación de resina preventiva', 'Preventiva'],
  ['997106', 'Topicación de flúor en barniz', 'Preventiva'],
  ['997107', 'Aplicación de sellantes', 'Preventiva'],
  ['997301', 'Detartraje supragingival', 'Preventiva'],

  // —— Operatoria dental cap. 23.2 (Res. 2706) ——
  ['232101', 'Obturación dental con amalgama', 'Operatoria dental'],
  ['232102', 'Obturación dental con resina de fotocurado', 'Operatoria dental'],
  ['232103', 'Obturación dental con ionómero de vidrio', 'Operatoria dental'],
  ['232104', 'Obturación dental (código genérico)', 'Operatoria dental'],
  ['232201', 'Obturación temporal por diente', 'Operatoria dental'],
  ['232301', 'Colocación de pin intradentinario', 'Operatoria dental'],
  ['232300', 'Colocación de pin milimétrico SOD', 'Operatoria dental'],
  ['232401', 'Reconstrucción de ángulo incisal', 'Operatoria dental'],
  ['232402', 'Reconstrucción de tercio incisal', 'Operatoria dental'],
  ['232403', 'Reconstrucción dental (código genérico)', 'Operatoria dental'],

  // —— Operatoria legacy cap. 99.72 ——
  ['997201', 'Obturación dental con amalgama (legacy 99.72)', 'Operatoria dental'],
  ['997202', 'Obturación dental con resina (legacy 99.72)', 'Operatoria dental'],
  ['997203', 'Obturación dental con ionómero (legacy 99.72)', 'Operatoria dental'],
  ['997204', 'Obturación dental genérica (legacy 99.72)', 'Operatoria dental'],
  ['997205', 'Blanqueamiento dental ambulatorio', 'Estética dental'],
  ['997206', 'Carilla estética directa en resina', 'Estética dental'],
  ['997207', 'Carilla estética indirecta', 'Estética dental'],

  // —— Incrustaciones 23.3 ——
  ['233100', 'Restauración mediante incrustación metálica SOD', 'Rehabilitación oral'],
  ['233101', 'Incrustación metálica', 'Rehabilitación oral'],
  ['233200', 'Restauración mediante incrustación no metálica SOD', 'Rehabilitación oral'],
  ['233201', 'Incrustación no metálica (cerámica, resina indirecta)', 'Rehabilitación oral'],

  // —— Prótesis y rehabilitación 23.4 ——
  ['234000', 'Colocación de corona individual / provisional SOD', 'Rehabilitación oral'],
  ['234001', 'Colocación de corona acrílica o provisional', 'Rehabilitación oral'],
  ['234101', 'Corona en acero inoxidable (dentición temporal)', 'Rehabilitación oral'],
  ['234102', 'Corona en policarboxilato (dentición temporal)', 'Rehabilitación oral'],
  ['234103', 'Corona en forma plástica', 'Rehabilitación oral'],
  ['234105', 'Inserción de corona (código genérico)', 'Rehabilitación oral'],
  ['234106', 'Corona provisional', 'Rehabilitación oral'],
  ['234201', 'Prótesis fija — cada unidad (pilar y pónticos)', 'Rehabilitación oral'],
  ['234202', 'Reconstrucción de muñones', 'Rehabilitación oral'],
  ['234203', 'Perno o patrón de núcleo', 'Rehabilitación oral'],
  ['234204', 'Reparación de prótesis fija', 'Rehabilitación oral'],
  ['234205', 'Inserción de retenedor intrarradicular', 'Rehabilitación oral'],
  ['234301', 'Prótesis removible parcial mucosoportada', 'Rehabilitación oral'],
  ['234302', 'Prótesis removible parcial dentomucosoportada', 'Rehabilitación oral'],
  ['234303', 'Reparación de prótesis removible parcial', 'Rehabilitación oral'],
  ['234401', 'Prótesis total mucosoportada (medio caso)', 'Rehabilitación oral'],
  ['234402', 'Prótesis total mucosoportada (caso completo)', 'Rehabilitación oral'],
  ['234403', 'Prótesis total implantoasistida (medio caso)', 'Rehabilitación oral'],
  ['234404', 'Prótesis total implantoasistida (caso completo)', 'Rehabilitación oral'],
  ['235101', 'Reimplante de diente', 'Rehabilitación oral'],
  ['235201', 'Autotrasplante dental intencional', 'Rehabilitación oral'],

  // —— Prótesis legacy 99.74 ——
  ['997601', 'Corona metal-porcelana (legacy 99.74)', 'Rehabilitación oral'],
  ['997602', 'Prótesis parcial removible (legacy 99.74)', 'Rehabilitación oral'],
  ['997603', 'Prótesis total (legacy 99.74)', 'Rehabilitación oral'],
  ['997604', 'Prótesis fija por unidad (legacy 99.74)', 'Rehabilitación oral'],
  ['997605', 'Corona provisional acrílica (legacy 99.74)', 'Rehabilitación oral'],

  // —— Implantes 23.6 / 99.77 ——
  ['236101', 'Implante cerámico', 'Implantología'],
  ['236201', 'Implante metálico (código genérico)', 'Implantología'],
  ['236301', 'Implante dental oseointegrado', 'Implantología'],
  ['997701', 'Implante dental osteointegrado (legacy 99.77)', 'Implantología'],
  ['997702', 'Colocación de pilar sobre implante (legacy 99.77)', 'Implantología'],
  ['997703', 'Corona sobre implante (legacy 99.77)', 'Implantología'],
  ['997704', 'Prótesis híbrida sobre implantes (legacy 99.77)', 'Implantología'],
  ['997705', 'Mantenimiento de implantes (legacy 99.77)', 'Implantología'],

  // —— Endodoncia 23.7 / legacy 99.74 ——
  ['237102', 'Pulpotomía', 'Endodoncia'],
  ['237103', 'Pulpectomía', 'Endodoncia'],
  ['237201', 'Apexificación (cierre apical)', 'Endodoncia'],
  ['237202', 'Revascularización pulpar', 'Endodoncia'],
  ['237203', 'Recubrimiento pulpar directo', 'Endodoncia'],
  ['237204', 'Recubrimiento pulpar indirecto', 'Endodoncia'],
  ['237301', 'Terapia de conducto en diente unirradicular', 'Endodoncia'],
  ['237302', 'Terapia de conducto en diente birradicular', 'Endodoncia'],
  ['237303', 'Terapia de conducto en diente multirradicular', 'Endodoncia'],
  ['237304', 'Terapia de conducto en diente temporal unirradicular', 'Endodoncia'],
  ['237305', 'Terapia de conducto en diente temporal multirradicular', 'Endodoncia'],
  ['237307', 'Desobturación de conducto radicular', 'Endodoncia'],
  ['237401', 'Apicectomía', 'Endodoncia'],
  ['237501', 'Tratamiento correctivo de reabsorción radicular', 'Endodoncia'],
  ['237502', 'Tratamiento correctivo de fracturas radiculares', 'Endodoncia'],
  ['237503', 'Sellado quirúrgico de perforación endodóntica', 'Endodoncia'],
  ['237504', 'Sellado no quirúrgico de perforación endodóntica', 'Endodoncia'],
  ['237505', 'Remoción de retenedor intrarradicular', 'Endodoncia'],
  ['237601', 'Fistulización endodóntica por trepanación', 'Endodoncia'],
  ['237602', 'Fistulización endodóntica por incisión', 'Endodoncia'],
  ['237603', 'Fistulización endodóntica (código genérico)', 'Endodoncia'],
  ['237604', 'Fistulización endodóntica por descompresión', 'Endodoncia'],
  ['237701', 'Radectomía — una raíz', 'Endodoncia'],
  ['237702', 'Radectomía — múltiples raíces', 'Endodoncia'],
  ['237703', 'Radectomía (código genérico)', 'Endodoncia'],
  ['237801', 'Hemisección del diente', 'Endodoncia'],
  ['237901', 'Blanqueamiento dental intrínseco', 'Endodoncia'],
  ['237902', 'Exploración del nervio dentario inferior', 'Endodoncia'],
  ['237903', 'Blanqueamiento dental extrínseco', 'Endodoncia'],
  ['997401', 'Endodoncia unirradicular (legacy 99.74)', 'Endodoncia'],
  ['997402', 'Endodoncia birradicular (legacy 99.74)', 'Endodoncia'],
  ['997403', 'Endodoncia multirradicular (legacy 99.74)', 'Endodoncia'],
  ['997404', 'Retratamiento endodóntico (legacy 99.74)', 'Endodoncia'],

  // —— Exodoncia y cirugía oral 23.0 / 23.1 ——
  ['230101', 'Exodoncia de diente permanente unirradicular', 'Cirugía oral'],
  ['230102', 'Exodoncia de diente permanente multirradicular', 'Cirugía oral'],
  ['230103', 'Exodoncia de dientes permanentes (código genérico)', 'Cirugía oral'],
  ['230201', 'Exodoncia de diente temporal unirradicular', 'Cirugía oral'],
  ['230202', 'Exodoncia de diente temporal multirradicular', 'Cirugía oral'],
  ['230203', 'Exodoncia de dientes temporales (código genérico)', 'Cirugía oral'],
  ['231101', 'Exodoncia quirúrgica unirradicular', 'Cirugía oral'],
  ['231102', 'Exodoncia quirúrgica de diente retenido o impactado', 'Cirugía oral'],
  ['231201', 'Exodoncia quirúrgica multirradicular', 'Cirugía oral'],
  ['231301', 'Exodoncia de diente incluido ectópico (abordaje intraoral)', 'Cirugía oral'],
  ['231302', 'Exodoncia de incluido ectópico (abordaje extraoral)', 'Cirugía oral'],
  ['231303', 'Exodoncia de diente incluido', 'Cirugía oral'],
  ['231401', 'Exodoncias múltiples con alveoloplastia, por cuadrante', 'Cirugía oral'],
  ['231501', 'Colgajo desplazado para abordaje quirúrgico', 'Cirugía oral'],
  ['249101', 'Control de hemorragia dental posquirúrgica', 'Cirugía oral'],

  // —— Exodoncia legacy 99.75 ——
  ['997501', 'Exodoncia multirradicular (legacy 99.75)', 'Cirugía oral'],
  ['997502', 'Exodoncia de dientes permanentes (legacy 99.75)', 'Cirugía oral'],
  ['997503', 'Exodoncia unirradicular (legacy 99.75)', 'Cirugía oral'],

  // —— Cirugía oral maxilofacial 23.8 / legacy 99.78 ——
  ['238101', 'Frenilectomía labial', 'Cirugía maxilofacial'],
  ['238102', 'Frenilectomía lingual', 'Cirugía maxilofacial'],
  ['238103', 'Exéresis de mucocele o quiste de retención', 'Cirugía maxilofacial'],
  ['238201', 'Reducción cerrada de fractura mandibular', 'Cirugía maxilofacial'],
  ['238202', 'Reducción abierta de fractura mandibular', 'Cirugía maxilofacial'],
  ['238301', 'Injerto óseo en maxilar o mandíbula', 'Cirugía maxilofacial'],
  ['238401', 'Elevación de seno maxilar', 'Cirugía maxilofacial'],
  ['238501', 'Colocación de implante en cirugía maxilofacial', 'Cirugía maxilofacial'],
  ['238601', 'Osteotomía segmentaria', 'Cirugía maxilofacial'],
  ['238701', 'Artrocentesis de ATM', 'Cirugía maxilofacial'],
  ['238702', 'Artroscopía de ATM', 'Cirugía maxilofacial'],
  ['761101', 'Biopsia de huesos maxilares', 'Cirugía maxilofacial'],
  ['997801', 'Apicectomía (legacy 99.78)', 'Cirugía maxilofacial'],
  ['997802', 'Frenilectomía (legacy 99.78)', 'Cirugía maxilofacial'],
  ['997803', 'Exéresis de quiste odontogénico (legacy 99.78)', 'Cirugía maxilofacial'],
  ['997804', 'Alveoloplastía (legacy 99.78)', 'Cirugía maxilofacial'],
  ['997805', 'Injerto óseo (legacy 99.78)', 'Cirugía maxilofacial'],
  ['997806', 'Elevación de seno maxilar (legacy 99.78)', 'Cirugía maxilofacial'],

  // —— Biopsias encía 23.4.1 / 24.11 ——
  ['234101', 'Biopsia incisional de encía', 'Cirugía oral'],
  ['234102', 'Biopsia excisional de encía', 'Cirugía oral'],
  ['241101', 'Biopsia incisional de encía (periodoncia)', 'Periodoncia'],
  ['241102', 'Biopsia escisional de encía con cierre primario', 'Periodoncia'],
  ['241103', 'Biopsia escisional con colgajo o injerto', 'Periodoncia'],
  ['241104', 'Biopsia de encía (código genérico)', 'Periodoncia'],
  ['241201', 'Biopsia de pared alveolar', 'Periodoncia'],

  // —— Periodoncia 24.0–24.5 / legacy 99.73 ——
  ['240200', 'Detartraje subgingival', 'Periodoncia'],
  ['240201', 'Detartraje subgingival', 'Periodoncia'],
  ['240300', 'Alisado radicular, campo cerrado', 'Periodoncia'],
  ['240301', 'Alisado radicular, campo cerrado', 'Periodoncia'],
  ['240401', 'Drenaje de colección periodontal', 'Periodoncia'],
  ['242101', 'Plastia mucogingival con injerto pediculado', 'Periodoncia'],
  ['242102', 'Plastia mucogingival con injerto libre', 'Periodoncia'],
  ['242103', 'Plastia mucogingival (código genérico)', 'Periodoncia'],
  ['242201', 'Curetaje a campo abierto', 'Periodoncia'],
  ['242202', 'Cirugía a colgajo con resección radicular', 'Periodoncia'],
  ['242204', 'Aumento de reborde edéntulo sin injerto', 'Periodoncia'],
  ['242205', 'Aumento de reborde edéntulo con injerto', 'Periodoncia'],
  ['242301', 'Plastias preprotésicas (aumento de corona clínica)', 'Periodoncia'],
  ['242401', 'Reparación periodontal regenerativa (RTG / RTR)', 'Periodoncia'],
  ['243101', 'Escisión de lesión benigna encapsulada ≤3 cm', 'Periodoncia'],
  ['243102', 'Escisión de lesión benigna encapsulada >3 cm', 'Periodoncia'],
  ['243103', 'Escisión de lesión benigna no encapsulada ≤3 cm', 'Periodoncia'],
  ['243104', 'Escisión de lesión benigna no encapsulada >3 cm', 'Periodoncia'],
  ['243105', 'Escisión de lesión maligna de encía sin vaciamiento', 'Periodoncia'],
  ['243106', 'Escisión de lesión maligna con vaciamiento ganglionar', 'Periodoncia'],
  ['243107', 'Vaciamiento ganglionar de piso de boca', 'Periodoncia'],
  ['243108', 'Escisión de lesión maligna con resección ósea', 'Periodoncia'],
  ['243109', 'Escisión de lesión maligna con reconstrucción', 'Periodoncia'],
  ['243110', 'Resección de lesión de encía (código genérico)', 'Periodoncia'],
  ['243201', 'Sutura de laceración de encía <3 cm', 'Periodoncia'],
  ['243202', 'Sutura de laceración de encía >3 cm', 'Periodoncia'],
  ['243203', 'Sutura de laceración de encía (código genérico)', 'Periodoncia'],
  ['243301', 'Enucleación de quiste epidermoide (abordaje intraoral)', 'Periodoncia'],
  ['243302', 'Enucleación de quiste epidermoide (abordaje extraoral)', 'Periodoncia'],
  ['243303', 'Enucleación de quiste epidermoide (código genérico)', 'Periodoncia'],
  ['243401', 'Gingivectomía', 'Periodoncia'],
  ['243501', 'Cuña distal', 'Periodoncia'],
  ['243502', 'Operculectomía', 'Periodoncia'],
  ['244101', 'Enucleación de quiste odontogénico hasta 3 cm', 'Periodoncia'],
  ['244102', 'Enucleación de quiste odontogénico >3 cm', 'Periodoncia'],
  ['244103', 'Resección de tumor odontogénico', 'Periodoncia'],
  ['244104', 'Resección de tumor con injerto óseo libre', 'Periodoncia'],
  ['244105', 'Resección de tumor con colgajo óseo pediculado', 'Periodoncia'],
  ['244106', 'Resección tumoral con colgajo óseo libre microvascular', 'Periodoncia'],
  ['244107', 'Resección de tumor con reconstrucción con placa', 'Periodoncia'],
  ['244108', 'Marsupialización de quiste', 'Periodoncia'],
  ['244109', 'Resección lesión odontogénica (código genérico)', 'Periodoncia'],
  ['245101', 'Regularización de rebordes', 'Periodoncia'],
  ['245201', 'Alveolectomía', 'Periodoncia'],
  ['997302', 'Mantenimiento periodontal (legacy 99.73)', 'Periodoncia'],
  ['997303', 'Gingivectomía (legacy 99.73)', 'Periodoncia'],
  ['997304', 'Alisado radicular a campo abierto (legacy 99.73)', 'Periodoncia'],
  ['997305', 'Cirugía periodontal a colgajo (legacy 99.73)', 'Periodoncia'],
  ['997306', 'Injerto gingival libre (legacy 99.73)', 'Periodoncia'],
  ['997307', 'Injerto óseo periodontal (legacy 99.73)', 'Periodoncia'],
  ['997308', 'Ferulización periodontal (legacy 99.73)', 'Periodoncia'],
  ['997310', 'Control de placa dental (legacy 99.73)', 'Periodoncia'],

  // —— Ortodoncia 24.71–24.73 / legacy 39.14 ——
  ['247001', 'Anclaje temporal esquelético (TADs / mini-implantes)', 'Ortodoncia'],
  ['247101', 'Aparatología fija de ortodoncia por arcada', 'Ortodoncia'],
  ['247201', 'Aparatología removible intraoral', 'Ortodoncia'],
  ['247202', 'Aparatología removible extraoral', 'Ortodoncia'],
  ['247301', 'Aparatos de retención post-ortodoncia', 'Ortodoncia'],
  ['247401', 'Ferulización rígida', 'Ortodoncia'],
  ['247402', 'Ferulización semirrígida', 'Ortodoncia'],
  ['247403', 'Ferulización (código genérico)', 'Ortodoncia'],
  ['248101', 'Cierre de diastema', 'Ortodoncia'],
  ['248201', 'Tallado selectivo o ajuste oclusal', 'Ortodoncia'],
  ['248401', 'Reparación de aparatología fija o removible', 'Ortodoncia'],
  ['248801', 'Máscara facial terapéutica', 'Ortodoncia'],
  ['391401', 'Ortodoncia interceptiva (legacy cap. 39)', 'Ortodoncia'],
  ['391402', 'Ortodoncia correctiva con aparatos fijos (legacy cap. 39)', 'Ortodoncia'],
  ['391404', 'Retenedor ortodóntico (legacy cap. 39)', 'Ortodoncia'],
  ['391405', 'Aparatología ortopédica funcional removible (legacy cap. 39)', 'Ortodoncia'],
]

function normalizeCodigo(code) {
  return code.replace(/\D/g, '').padStart(6, '0').slice(0, 6)
}

function chapterFromCodigo(code) {
  const c = normalizeCodigo(code)
  if (c.startsWith('89')) return '89'
  if (c.startsWith('99')) return '99'
  if (c.startsWith('87')) return '87'
  if (c.startsWith('39')) return '39'
  if (c.startsWith('76')) return '76'
  if (c.startsWith('24')) return '24'
  if (c.startsWith('23')) return '23'
  return c.slice(0, 2)
}

const seen = new Set()
const CUPS_ODONTOLOGIA = []

for (const [codigo, descripcion, categoria] of RAW) {
  const normalized = normalizeCodigo(codigo)
  if (seen.has(normalized)) continue
  seen.add(normalized)
  CUPS_ODONTOLOGIA.push({ codigo: normalized, descripcion, categoria })
}

CUPS_ODONTOLOGIA.sort((a, b) => a.codigo.localeCompare(b.codigo))

const outPath = join(__dirname, '..', 'src', 'data', 'cupsOdontology.json')
writeFileSync(outPath, JSON.stringify(CUPS_ODONTOLOGIA, null, 2), 'utf8')
console.log(`Wrote ${CUPS_ODONTOLOGIA.length} CUPS codes to ${outPath}`)

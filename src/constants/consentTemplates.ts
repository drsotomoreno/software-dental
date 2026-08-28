import { INFORMED_CONSENT_TEXT } from '@/constants/dental'

export type ConsentTemplateId =
  | 'cirugia_oral'
  | 'operatoria_dental'
  | 'periodoncia_limpieza'
  | 'ortodoncia_brackets'
  | 'ortodoncia_alineadores'
  | 'ortopedia_maxilar'
  | 'carillas_dentales'
  | 'rehabilitacion_oral'
  | 'implantes_dentales'
  | 'blanqueamiento_dental'
  | 'general_odonto'

export interface ConsentTemplate {
  id: ConsentTemplateId
  label: string
  text: string
}

export const CONSENT_TEMPLATES: ConsentTemplate[] = [
  {
    id: 'cirugia_oral',
    label: 'Cirugía oral',
    text: `CONSENTIMIENTO INFORMADO PARA PROCEDIMIENTOS DE CIRUGÍA ORAL

1. Descripción del Procedimiento
El propósito de la cirugía oral es tratar patologías, extraer piezas dentales retenidas o dañadas, o realizar intervenciones en los tejidos óseos y gingivales de la cavidad bucal bajo anestesia local o sedación.

2. Posibles Riesgos y Complicaciones
A pesar de que el procedimiento se realizará bajo estrictas normas técnicas y de bioseguridad, toda intervención quirúrgica conlleva riesgos. A continuación, se detallan las 10 principales complicaciones, ordenadas de mayor a menor frecuencia:
• Dolor e inflamación (edema): Respuesta inflamatoria natural del organismo tras la cirugía, controlable con la medicación prescrita.
• Sangrado leve o moderado: Escurrimiento de sangre normal durante las primeras horas posteriores al procedimiento.
• Trismus: Dificultad transitoria para abrir la boca debido a la inflamación de los músculos masticatorios.
• Equimosis (moretones): Cambio de coloración en la piel de la cara o cuello debido a la infiltración de sangre en los tejidos.
• Infección local o alveolitis: Infección de la herida quirúrgica o alteración en la cicatrización del hueso, tratable con medicamentos o curaciones.
• Parestesia transitoria: Sensación temporal de adormecimiento u hormigueo en el labio, lengua o mentón por proximidad a los nervios.
• Lesión a dientes vecinos o restauraciones: Daño accidental leve o fractura en piezas dentales contiguas, coronas o calzas existentes.
• Comunicación oroantral o desplazamiento de fragmentos: Paso accidental de raíces al seno maxilar (en molares superiores) o espacios anatómicos profundos.
• Reacciones adversas a medicamentos: Efectos secundarios o alergias leves a la anestesia local, analgésicos o antibióticos utilizados.
• Parestesia o lesión nerviosa permanente: Pérdida definitiva (de baja incidencia) de la sensibilidad en zonas de la boca o rostro.

3. Declaración y Consentimiento del Paciente
• He leído, comprendido y aceptado la información descrita en este documento.
• He tenido la oportunidad de resolver todas mis dudas con el profesional a cargo.
• Comprendo que la práctica odontológica no es una ciencia exacta y que no se pueden garantizar resultados infalibles.
• Doy mi consentimiento libre, voluntario y consciente para que se lleve a cabo el procedimiento quirúrgico.`,
  },
  {
    id: 'operatoria_dental',
    label: 'Operatoria dental',
    text: `CONSENTIMIENTO INFORMADO PARA PROCEDIMIENTOS DE OPERATORIA DENTAL

1. Descripción del Procedimiento
El propósito de la operatoria dental es la prevención, diagnóstico y tratamiento de lesiones cariosas, fracturas o desgastes dentales mediante la remoción del tejido dañado y la restauración de la anatomía, función y estética del diente utilizando materiales restauradores (resinas compuestas, ionómeros de vidrio, entre otros), bajo anestesia local de ser necesario.

2. Posibles Riesgos y Complicaciones
A pesar de la correcta ejecución clínica y el cumplimiento de los protocolos de bioseguridad, pueden presentarse complicaciones. A continuación, se detallan las 10 principales complicaciones, ordenadas de mayor a menor frecuencia:
• Sensibilidad dental transitoria: Molestia leve o moderada al frío, calor o presión durante los primeros días posteriores a la colocación.
• Irritación gingival leve: Inflamación o molestia temporal en la encía vecina debido al uso de bandas matrices, cuñas o aislamiento.
• Contacto oclusal alto (necesidad de ajuste): Sensación de que el diente "choca" primero al morder, requiriendo un ajuste rápido en consulta.
• Desgaste superficial o pérdida de brillo: Pérdida gradual del acabado o textura estética del material con el uso cotidiano.
• Infiltración marginal (caries secundaria): Filtración microscópica con el tiempo que puede propiciar la aparición de una nueva caries alrededor o debajo de la restauración.
• Fractura parcial de la restauración: Desprendimiento de un pequeño fragmento del material restaurador por fuerzas masticatorias intensas o hábitos parafuncionales (bruxismo).
• Desprendimiento total de la restauración: Caída o pérdida completa de la obturación debido a fatiga del material o fuerzas excesivas.
• Pulpitis o necesidad de tratamiento de conductos: Inflamación profunda del nervio dental (pulpa) debido a la profundidad de la caries original, requiriendo posteriormente una endodoncia.
• Fractura de cúspides o paredes dentales: Rompimiento de las estructuras remanentes del diente, especialmente en piezas con destrucciones previas muy extensas.
• Reacciones alérgicas a los materiales: Respuesta adversa poco frecuente a los componentes de las resinas, adhesivos o agentes anestésicos.

3. Declaración y Consentimiento del Paciente
• He leído, comprendido y aceptado la información descrita en este documento.
• He tenido la oportunidad de resolver todas mis dudas con el profesional a cargo.
• Comprendo que la durabilidad de una restauración depende tanto de la técnica clínica como de mis hábitos de higiene oral y controles periódicos.
• Doy mi consentimiento libre, voluntario y consciente para que se lleve a cabo el procedimiento de operatoria dental.`,
  },
  {
    id: 'periodoncia_limpieza',
    label: 'Periodoncia y limpieza dental',
    text: `CONSENTIMIENTO INFORMADO PARA PROCEDIMIENTOS DE PERIODONCIA Y LIMPIEZA DENTAL

1. Descripción del Procedimiento
El propósito de los tratamientos periodontales y de limpieza dental profesional (profilaxis, raspado y alisado radicular) es la prevención, diagnóstico y tratamiento de las enfermedades de las encías y del hueso de soporte, removiendo la placa bacteriana, el sarro y los tejidos afectados para restaurar la salud periodontal.

2. Posibles Riesgos y Complicaciones
A pesar de la correcta ejecución clínica y el cumplimiento de los protocolos de bioseguridad, pueden presentarse efectos secundarios o complicaciones. A continuación, se detallan las 10 principales complicaciones, ordenadas de mayor a menor frecuencia:
• Sensibilidad dental temporal: Molestia transitoria al frío, calor o alimentos dulces debido a la exposición de las raíces al retirar el sarro.
• Sangrado gingival leve: Escurrimiento de sangre escaso durante el procedimiento o en las primeras horas posteriores, especialmente si las encías están inflamadas (gingivitis o periodontitis).
• Inflamación o molestia leve en las encías: Dolor sordo o irritación temporal en los tejidos blandos tratados.
• Recesión gingival aparente: Visualización de una mayor porción de la raíz dental a medida que la encía se desinflama y se contrae a su posición sana.
• Movilidad dental transitoria: Ligera sensación de movilidad en los dientes tratados debido a la liberación de los depósitos de sarro que actuaban como "férula" temporal.
• Aumento de espacios interdentales ("triángulos negros"): Mayor separación visual entre los dientes por la retracción de la papila interdental tras la desinflamación.
• Bacteriemia transitoria: Paso temporal de bacterias bucales al torrente sanguíneo durante la manipulación de tejidos, de manejo seguro en pacientes sanos.
• Reacciones leves a la anestesia o colutorios: Pequeñas reacciones alérgicas o irritaciones locales por los anestésicos tópicos/locales o antisépticos utilizados.
• Lesión superficial de tejidos blandos: Pequeñas rozaduras o úlceras leves en encías, mucosa o labios causadas por el instrumental ultrasónico o manual.
• Persistencia de la enfermedad periodontal: Necesidad de tratamientos adicionales o cirugías periodontales avanzadas si la respuesta biológica del paciente o la severidad del caso lo requieren.

3. Declaración y Consentimiento del Paciente
• He leído, comprendido y aceptado la información descrita en este documento.
• He tenido la oportunidad de resolver todas mis dudas con el profesional a cargo.
• Comprendo que el éxito del tratamiento periodontal depende fundamentalmente de la continuidad de mi higiene oral en casa y de asistir a los controles periódicos.
• Doy mi consentimiento libre, voluntario y consciente para que se lleve a cabo el procedimiento periodontal.`,
  },
  {
    id: 'ortodoncia_brackets',
    label: 'Ortodoncia con brackets',
    text: `CONSENTIMIENTO INFORMADO PARA TRATAMIENTO DE ORTODONCIA CON BRACKETS

1. Descripción del Procedimiento
El propósito del tratamiento ortodóncico con aparatología fija (brackets) es la corrección de maloclusiones, la alineación de las piezas dentales y la mejora de la función masticatoria, la estética facial y la salud oral a través de fuerzas mecánicas controladas aplicadas de forma progresiva.

2. Posibles Riesgos y Complicaciones
A pesar de la correcta planificación y ejecución clínica, el movimiento dental y el uso de aparatología fija pueden generar diversas situaciones. A continuación, se detallan las 10 principales complicaciones, ordenadas de mayor a menor frecuencia:
• Dolor, molestia o sensibilidad temporal: Dolor sordo o sensibilidad en los dientes tras la colocación y cada cita de activación o ajuste (habitualmente cede en pocos días).
• Ulceraciones o rozaduras en la mucosa oral: Llagas o irritación en labios, mejillas o lengua debido al roce con los brackets o arcos.
• Desprendimiento o rotura de brackets: Caída o fractura de elementos de la aparatología por alimentos duros, pegajosos o malos hábitos.
• Inflamación gingival (gingivitis): Enrojecimiento o inflamación de las encías debido a la dificultad para remover la placa bacteriana alrededor de los brackets.
• Manchas blancas o desmineralización: Aparición de lesiones por desmineralización del esmalte (inicio de caries) alrededor de los brackets por deficiente higiene oral.
• Reabsorción radicular leve: Acortamiento microscópico o visible de las puntas de las raíces dentales, generalmente asintomático y sin repercusión clínica relevante.
• Pulpitis o pérdida de vitalidad pulpar: Daño o inflamación del nervio del diente, especialmente en piezas que sufrieron traumatismos previos o movimientos muy complejos.
• Recesión gingival: Retracción de la encía y exposición de la raíz en dientes sometidos a movimientos hacia zonas con hueso delgado.
• Reacciones alérgicas: Reacciones de hipersensibilidad poco frecuentes a los componentes metálicos (níquel), resinas o látex utilizados.
• Recidiva (movimiento no deseado o retorno a la posición inicial): Desplazamiento de los dientes hacia su posición original tras retirar el aparato, prevenido estrictamente con el uso correcto de los retenedores.

3. Declaración y Consentimiento del Paciente
• He leído, comprendido y aceptado la información descrita en este documento.
• He tenido la oportunidad de resolver todas mis dudas con el profesional a cargo.
• Comprendo que el éxito y duración del tratamiento dependen de mi colaboración activa, una excelente higiene oral y la asistencia puntual a los controles y uso de retenedores.
• Doy mi consentimiento libre, voluntario y consciente para que se lleve a cabo el tratamiento de ortodoncia.`,
  },
  {
    id: 'ortodoncia_alineadores',
    label: 'Ortodoncia con alineadores',
    text: `CONSENTIMIENTO INFORMADO PARA TRATAMIENTO DE ORTODONCIA CON ALINEADORES

1. Descripción del Procedimiento
El propósito del tratamiento ortodóncico con alineadores transparentes es la corrección de maloclusiones y la alineación dental mediante el uso secuencial de férulas poliméricas removibles hechas a medida, las cuales aplican fuerzas controladas y progresivas sobre las piezas dentales según una planificación digital computarizada.

2. Posibles Riesgos y Complicaciones
A pesar de la correcta planificación digital y ejecución clínica, el movimiento dental y el uso de aparatología removible pueden generar diversas situaciones. A continuación, se detallan las 10 principales complicaciones, ordenadas de mayor a menor frecuencia:
• Presión y sensibilidad temporal: Molestia o tensión leve en los dientes durante los primeros 2 o 3 días al cambiar a un nuevo juego de alineadores.
• Irritación de los tejidos blandos: Roce leve o molestias en la lengua, mejillas o encías debido a los bordes de los alineadores o a los aditamentos estéticos (attachments).
• Alteración transitoria en la fonética y salivación: Ligero cambio en la pronunciación de ciertas palabras o aumento temporal de saliva durante los primeros días de adaptación.
• Desprendimiento de attachments: Caída o rotura de los pequeños relieves de resina adheridos a los dientes que facilitan los movimientos específicos.
• Pérdida, daño o rotura de los alineadores: Extravío o fractura de las férulas por manipulación inadecuada, olvido al comer o almacenamiento incorrecto.
• Inflamación gingival leve: Enrojecimiento o sensibilidad temporal en las encías por acumulación de placa bacteriana si no se realiza una correcta higiene antes de recolocar los alineadores.
• Desmineralización superficial o manchas: Aparición de lesiones incipientes en el esmalte si se consumen bebidas azucaradas con los alineadores puestos o por deficiente higiene oral.
• Movimientos incompletos o falta de predictibilidad: Variaciones biológicas donde algún diente no responde de forma exacta al plan digital, requiriendo alineadores adicionales (refinamientos).
• Reabsorción radicular leve: Acortamiento microscópico de las puntas de las raíces dentales, generalmente asintomático y sin repercusión clínica relevante.
• Recidiva (retorno a la posición inicial): Desplazamiento de los dientes hacia su posición original tras finalizar el tratamiento, prevenido estrictamente con el uso constante de los retenedores.

3. Declaración y Consentimiento del Paciente
• He leído, comprendido y aceptado la información descrita en este documento.
• He tenido la oportunidad de resolver todas mis dudas con el profesional a cargo.
• Comprendo que el éxito del tratamiento depende estrictamente de mi disciplina para usar los alineadores las horas recomendadas (20-22 horas diarias), mantener una correcta higiene oral y cumplir con los controles y uso de retenedores.
• Doy mi consentimiento libre, voluntario y consciente para que se lleve a cabo el tratamiento de ortodoncia con alineadores.`,
  },
  {
    id: 'ortopedia_maxilar',
    label: 'Ortopedia maxilar',
    text: `CONSENTIMIENTO INFORMADO PARA TRATAMIENTO DE ORTOPEDIA MAXILAR

1. Descripción del Procedimiento
El propósito de la ortopedia maxilar es modificar el crecimiento y desarrollo óseo de los maxilares, corregir discrepancias esqueléticas y guiar la erupción dental. Se realiza mediante el uso de aparatos funcionales o mecánicos (fijos o removibles), orientados principalmente a pacientes en etapa de crecimiento.

2. Posibles Riesgos y Complicaciones
Debido a que este tratamiento busca influir en el crecimiento óseo y la adaptación muscular, pueden presentarse diversas situaciones. A continuación, se detallan las 10 principales complicaciones, ordenadas de mayor a menor frecuencia:
• Dolor muscular o fatiga: Sensación de tensión o dolor sordo en los músculos masticatorios durante la fase de adaptación inicial.
• Alteración temporal en el habla: Dificultad leve para pronunciar ciertas letras mientras la lengua se acostumbra al aparato.
• Aumento de la salivación: Producción excesiva de saliva durante los primeros días tras la instalación.
• Irritación de tejidos blandos: Rozaduras, llagas o úlceras en la lengua, mejillas o labios por el contacto con el aparato.
• Rotura o pérdida del aparato: Daño o extravío de los componentes, lo cual detiene el tratamiento y requiere reparaciones.
• Inflamación gingival: Enrojecimiento o inflamación de las encías debido a la dificultad de limpiar correctamente alrededor del aparato.
• Molestias al comer: Dificultad para masticar o deglutir alimentos mientras se porta el dispositivo.
• Disconfort en la articulación temporomandibular (ATM): Sensación de presión, chasquidos o dolor articular leve.
• Falta de resultados por falta de cooperación: Insuficiencia en el cambio óseo debido a que el paciente no usa el aparato el tiempo indicado (uso insuficiente).
• Resultados esqueléticos limitados: Insuficiencia en la respuesta biológica del paciente para lograr la corrección ósea deseada, lo cual podría requerir tratamientos complementarios.

3. Declaración y Consentimiento del Paciente
• He leído, comprendido y aceptado la información descrita en este documento.
• He tenido la oportunidad de resolver todas mis dudas con el profesional a cargo.
• Comprendo que el éxito de la ortopedia maxilar depende totalmente de mi disciplina y cooperación en el uso del aparato según las indicaciones.
• Doy mi consentimiento libre, voluntario y consciente para que se lleve a cabo el tratamiento de ortopedia maxilar.`,
  },
  {
    id: 'carillas_dentales',
    label: 'Carillas dentales (resina y porcelana)',
    text: `CONSENTIMIENTO INFORMADO PARA TRATAMIENTO CON CARILLAS DENTALES (RESINA Y PORCELANA)

1. Descripción del Procedimiento
El tratamiento consiste en la colocación de láminas delgadas de resina compuesta o cerámica (porcelana) sobre la superficie frontal de los dientes. Su propósito es mejorar la estética dental, corrigiendo forma, color, tamaño, o pequeñas malposiciones, requiriendo en ocasiones una preparación mínima de la estructura dental.

2. Posibles Riesgos y Complicaciones
A pesar de la correcta ejecución clínica y el uso de materiales de alta calidad, pueden presentarse complicaciones. A continuación, se detallan las 10 principales complicaciones, ordenadas de mayor a menor frecuencia:
• Sensibilidad dental temporal: Molestia al frío o calor tras el tallado o cementación, la cual suele remitir en pocos días.
• Irritación gingival: Inflamación de la encía por acumulación de placa o por la presencia de márgenes de la carilla si no hay una higiene meticulosa.
• Tinción marginal: Cambio de color en la unión entre el diente y la carilla, más común en resinas con el paso del tiempo.
• Fractura o desportillado del material: Rotura de un pequeño fragmento de la carilla debido a fuerzas masticatorias excesivas o hábitos parafuncionales (bruxismo).
• Desprendimiento (decementación): Caída de la carilla si el sellado adhesivo se ve comprometido por falta de mantenimiento o traumatismos.
• Caries secundaria: Formación de caries en el borde de la carilla debido a filtración bacteriana por deficiente higiene oral.
• Sobrecontorno: Sensación de que la carilla es demasiado gruesa, lo que puede dificultar la limpieza interdental o causar irritación.
• Línea blanca o gris en el margen: Visibilidad de la interfaz entre el cemento y el diente, dependiendo del tipo de adhesión y la translucidez de la carilla.
• Fractura de la pieza dental: Fractura del diente remanente, poco frecuente pero posible en casos de preparaciones extensas o trauma severo.
• Necesidad de tratamiento de conductos (endodoncia): Inflamación profunda del nervio dental (pulpa) debido a la profundidad de la preparación, aunque es un riesgo bajo.

3. Declaración y Consentimiento del Paciente
• He leído, comprendido y aceptado la información descrita en este documento.
• He tenido la oportunidad de resolver todas mis dudas con el profesional a cargo.
• Comprendo que las carillas requieren cuidados especiales, evitar el uso de los dientes como herramientas y asistir a revisiones periódicas para garantizar su durabilidad.
• Doy mi consentimiento libre, voluntario y consciente para que se lleve a cabo el procedimiento de carillas dentales.`,
  },
  {
    id: 'rehabilitacion_oral',
    label: 'Rehabilitación oral',
    text: `CONSENTIMIENTO INFORMADO PARA PROCEDIMIENTOS DE REHABILITACIÓN ORAL

1. Descripción del Procedimiento
El propósito de la rehabilitación oral es la restauración estética y funcional de la dentición mediante el uso de prótesis fijas (coronas, puentes), prótesis removibles o tratamientos integrales, con el fin de devolver la correcta oclusión, la capacidad masticatoria y la armonía facial.

2. Posibles Riesgos y Complicaciones
A pesar de la correcta planificación y ejecución clínica, pueden presentarse diversas situaciones tras la colocación de prótesis o restauraciones. A continuación, se detallan las 10 principales complicaciones, ordenadas de mayor a menor frecuencia:
• Sensibilidad dental temporal: Molestia leve al frío, calor o presión tras el tallado o cementación, la cual suele remitir progresivamente.
• Irritación gingival leve: Enrojecimiento o inflamación temporal en la encía que rodea los márgenes de la prótesis.
• Puntos altos u oclusión prematura: Sensación de que la mordida "choca" en un punto específico, requiriendo un ajuste rápido en consulta.
• Desgaste o fractura menor del material estético: Desportillado superficial de la cerámica o composite debido a fuerzas masticatorias o hábitos parafuncionales (bruxismo).
• Infiltración marginal (caries secundaria): Filtración microscópica con el tiempo que puede propiciar la aparición de una nueva caries bajo las coronas o puentes.
• Desprendimiento o decementación: Caída o aflojamiento de la corona o puente debido a fatiga del cemento o fuerzas excesivas.
• Pulpitis o necesidad de tratamiento de conductos: Inflamación profunda del nervio dental (pulpa) derivada del tallado o de cargas funcionales, requiriendo una endodoncia posterior.
• Fractura del diente pilar: Rompimiento de la estructura dental interna que sostiene la prótesis, especialmente en dientes debilitados o con destrucción previa extensa.
• Impacto de alimentos: Acumulación recurrente de comida entre los espacios interdentales o debajo de los puentes debido a cambios anatómicos o pérdida ósea.
• Reacciones alérgicas a los materiales: Respuesta de hipersensibilidad poco frecuente a las aleaciones metálicas, cerámicas, resinas o agentes cementantes utilizados.

3. Declaración y Consentimiento del Paciente
• He leído, comprendido y aceptado la información descrita en este documento.
• He tenido la oportunidad de resolver todas mis dudas con el profesional a cargo.
• Comprendo que la durabilidad de la rehabilitación oral depende de mi higiene oral rigurosa, evitar malos hábitos y asistir puntualmente a los controles periódicos.
• Doy mi consentimiento libre, voluntario y consciente para que se lleve a cabo el procedimiento de rehabilitación oral.`,
  },
  {
    id: 'implantes_dentales',
    label: 'Implantes dentales',
    text: `CONSENTIMIENTO INFORMADO PARA PROCEDIMIENTOS DE IMPLANTES DENTALES

1. Descripción del Procedimiento
El tratamiento consiste en la inserción quirúrgica de un tornillo de titanio (o material cerámico biocompatible) en el hueso maxilar o mandibular, con el fin de sustituir la raíz de un diente perdido y posteriormente soportar una corona, puente o prótesis. El éxito depende del proceso biológico de oseointegración (fusión del implante con el hueso).

2. Posibles Riesgos y Complicaciones
A pesar de la planificación mediante estudios radiográficos y el cumplimiento de protocolos quirúrgicos estrictos, toda cirugía de implantes conlleva riesgos inherentes. A continuación, se detallan las 10 principales complicaciones, ordenadas de mayor a menor frecuencia:
• Dolor e inflamación: Respuesta inflamatoria normal del organismo tras la intervención, controlable con medicación prescrita.
• Hematoma y equimosis (moretones): Infiltración de sangre en los tejidos blandos de la cara o cuello, que desaparece de forma natural.
• Sangrado postoperatorio: Escurrimiento de sangre normal durante las primeras horas tras la cirugía.
• Infección local (Peri-implantitis temprana): Infección de los tejidos que rodean al implante si no se siguen los cuidados de higiene o indicaciones postoperatorias.
• Parestesia transitoria: Sensación temporal de adormecimiento u hormigueo en el labio, lengua o mentón debido a la proximidad del implante con troncos nerviosos.
• Aflojamiento de componentes protésicos: Soltamiento del tornillo que sujeta la corona al implante debido a las fuerzas masticatorias, requiriendo reapriete.
• Fallo de oseointegración: Respuesta biológica negativa donde el hueso no se une al implante, requiriendo su remoción y posible sustitución futura.
• Comunicación oroantral: Paso accidental de fragmentos o del implante hacia el seno maxilar (exclusivo en molares superiores).
• Recesión gingival: Retracción de la encía alrededor del implante, que puede exponer el cuello metálico del mismo y afectar la estética.
• Lesión nerviosa permanente: Pérdida definitiva de la sensibilidad en una zona de la boca o rostro, complicación de baja incidencia pero técnicamente posible.

3. Declaración y Consentimiento del Paciente
• He leído, comprendido y aceptado la información descrita en este documento.
• He tenido la oportunidad de resolver todas mis dudas sobre la cirugía, los materiales y el tiempo de espera para la carga protésica.
• Comprendo que la oseointegración es un proceso biológico que puede verse afectado por factores como el tabaquismo, la diabetes o el bruxismo, y que no se pueden garantizar resultados infalibles.
• Doy mi consentimiento libre, voluntario y consciente para que se lleve a cabo el procedimiento de colocación de implante(s) dental(es).`,
  },
  {
    id: 'blanqueamiento_dental',
    label: 'Blanqueamiento dental',
    text: `CONSENTIMIENTO INFORMADO PARA PROCEDIMIENTOS DE BLANQUEAMIENTO DENTAL

Fecha: ____/____/20____
Nombre del Paciente: _____________________________________ C.I./DNI: _________________
Profesional Responsable: __________________________________

1. Descripción del Procedimiento
El propósito del blanqueamiento dental es aclarar el tono de los dientes mediante la aplicación de agentes blanqueadores (peróxido de hidrógeno o carbamida), los cuales actúan removiendo pigmentaciones y manchas internas y externas del esmalte y la dentina, ya sea de forma ambulatoria o en el consultorio (con o sin activación por luz).

2. Posibles Riesgos y Complicaciones
A pesar del uso de productos seguros y protocolos profesionales, pueden presentarse efectos secundarios. A continuación, se detallan las 10 principales complicaciones, ordenadas de mayor a menor frecuencia:
• Sensibilidad dental temporal: Molestia o dolor leve a moderado al frío, calor o aire, el cual suele desaparecer espontáneamente a los pocos días.
• Irritación gingival leve: Enrojecimiento o ardor temporal en las encías por contacto accidental con el gel blanqueador.
• Irritación en labios o mucosa oral: Pequeñas rozaduras o quemaduras superficiales en los tejidos blandos vecinos.
• Desigualdad cromática temporal: Apariencia parcheada o bandas de color desigual en los dientes durante el proceso, debido a diferencias en la porosidad del esmalte.
• Sensibilidad o irritación leve en la garganta: Molestia pasajera por la deglución involuntaria de una mínima cantidad de gel.
• Discrepancia en restauraciones existentes: Las calzas, resinas, coronas o carillas previas no cambian de color con el blanqueamiento, pudiendo requerir su reemplazo posterior por motivos estéticos.
• Porosidad temporal del esmalte: Ligero aumento en la permeabilidad dental que hace a los dientes más susceptibles a pigmentarse durante las primeras 48 horas.
• Recidiva o retorno gradual del tono: Pérdida progresiva del blanco alcanzado con el tiempo, influenciada por el consumo de alimentos cromógenos (café, té, vino, tabaco) y la higiene.
• Reacciones alérgicas leves: Respuesta de hipersensibilidad infrecuente a los componentes químicos del gel o agentes desensibilizantes.
• Pulpitis irreversible o daño pulpar severo: Inflamación profunda del nervio dental (extremadamente rara, asociada a dientes con fisuras o restauraciones muy profundas), que podría requerir tratamiento de conductos.

3. Declaración y Consentimiento del Paciente
• He leído, comprendido y aceptado la información descrita en este documento.
• He tenido la oportunidad de resolver todas mis dudas con el profesional a cargo.
• Comprendo que el resultado del blanqueamiento es variable según la respuesta biológica de mis dientes y que requiere evitar alimentos con colorantes y mantener una buena higiene para prolongar su efecto.
• Doy mi consentimiento libre, voluntario y consciente para que se lleve a cabo el procedimiento de blanqueamiento dental.`,
  },
  {
    id: 'general_odonto',
    label: 'Consentimiento general odontológico',
    text: INFORMED_CONSENT_TEXT,
  },
]

const templateMap = new Map(CONSENT_TEMPLATES.map((t) => [t.id, t]))

export function getConsentTemplate(id: ConsentTemplateId): ConsentTemplate | undefined {
  return templateMap.get(id)
}

export function getConsentLabel(id: ConsentTemplateId): string {
  return templateMap.get(id)?.label ?? id
}

export function getConsentTexts(ids: ConsentTemplateId[]): string {
  return ids
    .map((id) => templateMap.get(id)?.text)
    .filter(Boolean)
    .join('\n\n' + '─'.repeat(40) + '\n\n')
}

/** Opciones del menú (excluye consentimiento general legado en selector principal) */
export const CONSENT_MENU_OPTIONS = CONSENT_TEMPLATES.filter((t) => t.id !== 'general_odonto')

/** Anamnesis — Resolución 1995 de 1999 / Resolución 823 de 2017 */
export interface AllergiesData {
  medications: string
  anesthesia: string
  other: string
}

export interface Anamnesis {
  /** Motivo de Consulta — palabras del paciente */
  chiefComplaint: string
  /** Enfermedad Actual — evolución del cuadro */
  currentIllness: string
  allergies: AllergiesData
  /** Paciente no reporta alergias */
  allergiesNoReporta?: boolean
  /** Enfermedades sistémicas seleccionadas */
  systemicDiseases: string[]
  systemicDiseasesOther: string
  /** Paciente no reporta enfermedades sistémicas */
  systemicDiseasesNoReporta?: boolean
  /** Medicaciones críticas seleccionadas */
  criticalMedications: string[]
  currentMedications: string
  /** Paciente no reporta medicamentos actuales */
  currentMedicationsNoReporta?: boolean
  dentalHistory: string
  /** Paciente no reporta antecedentes odontológicos */
  dentalHistoryNoReporta?: boolean
  familyHistory: string
  /** Paciente no reporta antecedentes familiares */
  familyHistoryNoReporta?: boolean
}

export const SYSTEMIC_DISEASES_OPTIONS = [
  'Hipertensión arterial',
  'Diabetes mellitus',
  'Enfermedad cardíaca',
  'Trastornos de coagulación',
  'VIH/SIDA',
  'Hepatitis',
  'Asma / EPOC',
  'Enfermedad renal',
  'Embarazo',
  'Trastornos psiquiátricos',
  'Diabetes Mellitus no controlada',
  'Enfermedades autoinmunes graves / inmunosupresión',
  'Trastornos del metabolismo óseo',
  'Cardiopatías graves o no controladas',
  'Trastornos de la coagulación no controlados',
] as const

export const CRITICAL_MEDICATION_OPTIONS = [
  'Fármacos antirresortivos / antiangiogénicos (Bifosfonatos / Denosumab)',
  'Corticosteroides sistémicos crónicos',
  'Anticoagulantes o antiagregantes plaquetarios',
  'Inmunosupresores',
  'Antidepresivos (ISRS)',
] as const

export const NO_REPORTA_LABEL = 'No reporta'

export function createEmptyAnamnesis(): Anamnesis {
  return {
    chiefComplaint: '',
    currentIllness: '',
    allergies: { medications: '', anesthesia: '', other: '' },
    allergiesNoReporta: false,
    systemicDiseases: [],
    systemicDiseasesOther: '',
    systemicDiseasesNoReporta: false,
    criticalMedications: [],
    currentMedications: '',
    currentMedicationsNoReporta: false,
    dentalHistory: '',
    dentalHistoryNoReporta: false,
    familyHistory: '',
    familyHistoryNoReporta: false,
  }
}

function isNoReportaText(value: string): boolean {
  return value.trim().toLowerCase() === NO_REPORTA_LABEL.toLowerCase()
}

function normalizeAllergiesData(
  data: Partial<AllergiesData> & { latex?: string } | undefined,
): AllergiesData {
  const medications = data?.medications ?? ''
  const anesthesia = data?.anesthesia ?? ''
  let other = data?.other ?? ''
  const latex = data?.latex?.trim() ?? ''

  if (latex) {
    const latexNote = `Látex: ${latex}`
    other = other.trim() ? `${other.trim()}; ${latexNote}` : latexNote
  }

  return { medications, anesthesia, other }
}

/** Normaliza registros antiguos sin banderas de "no reporta". */
export function normalizeAnamnesis(data: Partial<Anamnesis> | undefined): Anamnesis {
  const base = createEmptyAnamnesis()
  if (!data) return base

  return {
    ...base,
    ...data,
    allergies: normalizeAllergiesData(data.allergies),
    systemicDiseases: data.systemicDiseases ?? [],
    criticalMedications: data.criticalMedications ?? [],
    allergiesNoReporta: data.allergiesNoReporta ?? false,
    systemicDiseasesNoReporta: data.systemicDiseasesNoReporta ?? false,
    currentMedicationsNoReporta:
      data.currentMedicationsNoReporta ?? isNoReportaText(data.currentMedications ?? ''),
    dentalHistoryNoReporta:
      data.dentalHistoryNoReporta ?? isNoReportaText(data.dentalHistory ?? ''),
    familyHistoryNoReporta:
      data.familyHistoryNoReporta ?? isNoReportaText(data.familyHistory ?? ''),
  }
}

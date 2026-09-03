/** Sistemas de codificación FHIR — Colombia / HL7 */

export const FHIR_SYSTEMS = {
  documentIdCo:
    'https://www.minsalud.gov.co/ihce/fhir/NamingSystem/document-identification',
  cie10: 'http://hl7.org/fhir/sid/icd-10',
  cups: 'https://www.minsalud.gov.co/fhir/CodeSystem/CUPS',
  loinc: 'http://loinc.org',
  snomed: 'http://snomed.info/sct',
  organizationNit: 'https://www.minsalud.gov.co/fhir/NamingSystem/NIT',
  reps: 'https://www.minsalud.gov.co/fhir/NamingSystem/REPS',
  rethus: 'https://www.minsalud.gov.co/fhir/NamingSystem/RETHUS',
  clinicalRecord: 'https://dental-emr.local/fhir/NamingSystem/clinical-record',
} as const

export const FHIR_PROFILES = {
  patientCo: 'https://vulcano.ihcecol.gov.co/fhir/StructureDefinition/PatientCo',
  compositionRda: 'https://vulcano.ihcecol.gov.co/fhir/StructureDefinition/CompositionRDA',
  encounterAmbulatory: 'http://hl7.org/fhir/StructureDefinition/Encounter',
} as const

export const DOCUMENT_TYPE_FHIR: Record<string, string> = {
  CC: 'CC',
  TI: 'TI',
  CE: 'CE',
  PA: 'PA',
  RC: 'RC',
  NIT: 'NIT',
}

export const GENDER_FHIR: Record<string, 'male' | 'female' | 'other' | 'unknown'> = {
  M: 'male',
  F: 'female',
  O: 'other',
}

export const COMPOSITION_TYPE_ODONTOLOGY: { system: string; code: string; display: string } = {
  system: FHIR_SYSTEMS.loinc,
  code: '34133-9',
  display: 'Summarization of episode note',
}

export const ENCOUNTER_CLASS_AMBULATORY = {
  system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  code: 'AMB',
  display: 'ambulatory',
}

export const ENCOUNTER_TYPE_ODONTOLOGY = {
  system: FHIR_SYSTEMS.cups,
  code: '890203',
  display: 'Consulta de primera vez por odontología general',
}

export const CONDITION_CATEGORY_ENCOUNTER = {
  system: 'http://terminology.hl7.org/CodeSystem/condition-category',
  code: 'encounter-diagnosis',
  display: 'Encounter Diagnosis',
}

export const CLINICAL_STATUS_ACTIVE = {
  system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  code: 'active',
  display: 'Active',
}

export const VERIFICATION_STATUS_MAP: Record<string, { code: string; display: string }> = {
  impresion: { code: 'provisional', display: 'Provisional' },
  confirmado: { code: 'confirmed', display: 'Confirmed' },
  repetido: { code: 'confirmed', display: 'Confirmed' },
}

export const COMPOSITION_SECTIONS = {
  anamnesis: { system: FHIR_SYSTEMS.loinc, code: '10164-2', display: 'History of Present illness' },
  exam: { system: FHIR_SYSTEMS.loinc, code: '29545-1', display: 'Physical findings' },
  diagnosis: { system: FHIR_SYSTEMS.loinc, code: '29548-5', display: 'Diagnosis' },
  plan: { system: FHIR_SYSTEMS.loinc, code: '18776-5', display: 'Plan of care' },
  consent: { system: FHIR_SYSTEMS.loinc, code: '59284-0', display: 'Consent Document' },
} as const

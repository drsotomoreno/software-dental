/** Tipos FHIR R4 simplificados para exportación local */

export type FhirBundleType = 'collection' | 'document'

export interface FhirCoding {
  system?: string
  code?: string
  display?: string
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[]
  text?: string
}

export interface FhirIdentifier {
  system?: string
  value?: string
  type?: FhirCodeableConcept
}

export interface FhirHumanName {
  use?: string
  family?: string
  given?: string[]
  text?: string
}

export interface FhirReference {
  reference?: string
  display?: string
}

export interface FhirPeriod {
  start?: string
  end?: string
}

export interface FhirMeta {
  profile?: string[]
  lastUpdated?: string
}

export interface FhirBundleEntry {
  fullUrl: string
  resource: FhirResource
}

export interface FhirBundle {
  resourceType: 'Bundle'
  type: FhirBundleType
  timestamp: string
  identifier?: FhirIdentifier
  entry: FhirBundleEntry[]
}

export interface FhirPatient {
  resourceType: 'Patient'
  id: string
  meta?: FhirMeta
  identifier: FhirIdentifier[]
  name: FhirHumanName[]
  gender: 'male' | 'female' | 'other' | 'unknown'
  birthDate: string
  telecom?: { system: string; value: string; use?: string }[]
  address?: {
    use?: string
    text?: string
    city?: string
    country?: string
  }[]
}

export interface FhirOrganization {
  resourceType: 'Organization'
  id: string
  identifier?: FhirIdentifier[]
  name: string
}

export interface FhirPractitioner {
  resourceType: 'Practitioner'
  id: string
  identifier: FhirIdentifier[]
  name: FhirHumanName[]
}

export interface FhirEncounter {
  resourceType: 'Encounter'
  id: string
  status: 'finished' | 'in-progress' | 'planned'
  class: FhirCoding
  type?: FhirCodeableConcept[]
  subject: FhirReference
  participant?: {
    type?: FhirCodeableConcept[]
    individual?: FhirReference
  }[]
  serviceProvider?: FhirReference
  period: FhirPeriod
}

export interface FhirCondition {
  resourceType: 'Condition'
  id: string
  clinicalStatus?: FhirCodeableConcept
  verificationStatus?: FhirCodeableConcept
  category?: FhirCodeableConcept[]
  code: FhirCodeableConcept
  subject: FhirReference
  encounter?: FhirReference
  recordedDate?: string
}

export interface FhirProcedure {
  resourceType: 'Procedure'
  id: string
  status: 'completed' | 'preparation' | 'in-progress'
  code: FhirCodeableConcept
  subject: FhirReference
  encounter?: FhirReference
  performedDateTime?: string
  performer?: { actor: FhirReference }[]
}

export interface FhirCompositionSection {
  title: string
  code: FhirCodeableConcept
  entry?: FhirReference[]
  text?: { status: string; div: string }
}

export interface FhirComposition {
  resourceType: 'Composition'
  id: string
  meta?: FhirMeta
  status: 'final' | 'preliminary'
  type: FhirCodeableConcept
  subject: FhirReference
  encounter?: FhirReference
  date: string
  author: FhirReference[]
  title: string
  confidentiality?: string
  section: FhirCompositionSection[]
}

export interface FhirDocumentReference {
  resourceType: 'DocumentReference'
  id: string
  status: 'current'
  type: FhirCodeableConcept
  subject: FhirReference
  date: string
  author?: FhirReference[]
  description?: string
  content: {
    attachment: {
      contentType: string
      title?: string
      hash?: string
    }
  }[]
}

export type FhirResource =
  | FhirPatient
  | FhirOrganization
  | FhirPractitioner
  | FhirEncounter
  | FhirCondition
  | FhirProcedure
  | FhirComposition
  | FhirDocumentReference

export interface FhirExportMetadata {
  bundleType: FhirBundleType
  organizationName?: string
  includeDocumentReference: boolean
}

export type FhirValidationLevel = 'error' | 'warning'

export interface FhirValidationIssue {
  level: FhirValidationLevel
  field?: string
  message: string
  recordId?: string
  patientDocument?: string
}

export interface FhirExportResult {
  bundle: FhirBundle
  issues: FhirValidationIssue[]
  recordCount: number
  patientCount: number
  resourceCount: number
}

import type { ClinicalRecord, Cie10Diagnosis } from '@/types/clinicalRecord'
import type { Patient } from '@/types/patient'
import type { UserProfile } from '@/types/user'
import type {
  FhirBundle,
  FhirBundleEntry,
  FhirBundleType,
  FhirComposition,
  FhirCondition,
  FhirDocumentReference,
  FhirEncounter,
  FhirExportMetadata,
  FhirExportResult,
  FhirOrganization,
  FhirPatient,
  FhirProcedure,
  FhirPractitioner,
  FhirResource,
} from '@/types/fhir'
import {
  CLINICAL_STATUS_ACTIVE,
  COMPOSITION_SECTIONS,
  COMPOSITION_TYPE_ODONTOLOGY,
  CONDITION_CATEGORY_ENCOUNTER,
  DOCUMENT_TYPE_FHIR,
  ENCOUNTER_CLASS_AMBULATORY,
  ENCOUNTER_TYPE_ODONTOLOGY,
  FHIR_PROFILES,
  FHIR_SYSTEMS,
  GENDER_FHIR,
  VERIFICATION_STATUS_MAP,
} from '@/constants/fhir'
import { validateFhirExport } from './fhirValidation'
import { formatRepsCodeDisplay, normalizeRepsCode } from './repsCode'
import type { RipsSourceRecord } from './rips'

export type FhirSourceRecord = RipsSourceRecord

const BASE_URL = 'https://dental-emr.local/fhir'

export function fhirRef(resourceType: string, id: string): string {
  return `${resourceType}/${id}`
}

export function fhirFullUrl(resourceType: string, id: string): string {
  return `${BASE_URL}/${resourceType}/${id}`
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
}

function patientId(patient: Patient): string {
  return `patient-${slug(patient.documentType)}-${slug(patient.documentNumber)}`
}

function organizationId(user: UserProfile): string {
  const nit = (user.providerNit ?? 'org').replace(/\D/g, '') || 'org'
  return `organization-${nit}`
}

function practitionerId(user: UserProfile): string {
  return `practitioner-${slug(user.documentNumber || user.id)}`
}

function encounterId(record: ClinicalRecord): string {
  return `encounter-${String(record.id ?? record.signedAt ?? 'draft')}`
}

function conditionId(record: ClinicalRecord, diagnosis: Cie10Diagnosis, index: number): string {
  return `condition-${String(record.id)}-${slug(diagnosis.code)}-${index}`
}

function procedureId(record: ClinicalRecord, index: number): string {
  return `procedure-${String(record.id)}-${index}`
}

function compositionId(record: ClinicalRecord): string {
  return `composition-${String(record.id)}`
}

function documentReferenceId(record: ClinicalRecord): string {
  return `document-${String(record.id)}`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildPatientResource(patient: Patient): FhirPatient {
  const id = patientId(patient)
  return {
    resourceType: 'Patient',
    id,
    meta: { profile: [FHIR_PROFILES.patientCo] },
    identifier: [
      {
        system: FHIR_SYSTEMS.documentIdCo,
        value: patient.documentNumber.trim(),
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
              code: DOCUMENT_TYPE_FHIR[patient.documentType] ?? patient.documentType,
            },
          ],
        },
      },
    ],
    name: [
      {
        use: 'official',
        family: patient.lastName,
        given: patient.firstName.split(/\s+/).filter(Boolean),
        text: `${patient.firstName} ${patient.lastName}`.trim(),
      },
    ],
    gender: GENDER_FHIR[patient.gender] ?? 'unknown',
    birthDate: patient.birthDate,
    telecom: [
      ...(patient.phone ? [{ system: 'phone', value: patient.phone, use: 'mobile' }] : []),
      ...(patient.email ? [{ system: 'email', value: patient.email }] : []),
    ],
    address: patient.city || patient.address
      ? [
          {
            use: 'home',
            text: [patient.address, patient.city].filter(Boolean).join(', '),
            city: patient.city,
            country: 'CO',
          },
        ]
      : undefined,
  }
}

function buildOrganizationResource(user: UserProfile, metadata: FhirExportMetadata): FhirOrganization {
  const id = organizationId(user)
  return {
    resourceType: 'Organization',
    id,
    identifier: [
      ...(user.providerNit
        ? [{ system: FHIR_SYSTEMS.organizationNit, value: user.providerNit.replace(/\D/g, '') }]
        : []),
      ...(user.repsCode
        ? [{ system: FHIR_SYSTEMS.reps, value: normalizeRepsCode(user.repsCode) || formatRepsCodeDisplay(user.repsCode) }]
        : []),
    ],
    name: metadata.organizationName?.trim() || user.legalName || user.clinicName || 'Prestador odontológico',
  }
}

function buildPractitionerResource(user: UserProfile): FhirPractitioner {
  const id = practitionerId(user)
  return {
    resourceType: 'Practitioner',
    id,
    identifier: [
      {
        system: FHIR_SYSTEMS.documentIdCo,
        value: user.documentNumber.trim(),
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
              code: DOCUMENT_TYPE_FHIR[user.documentType] ?? 'CC',
            },
          ],
        },
      },
      ...(user.rethusNumber
        ? [{ system: FHIR_SYSTEMS.rethus, value: user.rethusNumber }]
        : []),
    ],
    name: [
      {
        use: 'official',
        family: user.lastName,
        given: user.firstName.split(/\s+/).filter(Boolean),
        text: `${user.firstName} ${user.lastName}`.trim(),
      },
    ],
  }
}

function buildEncounterResource(
  record: ClinicalRecord,
  patient: Patient,
  user: UserProfile,
): FhirEncounter {
  const id = encounterId(record)
  const start = record.signedAt ?? record.createdAt
  return {
    resourceType: 'Encounter',
    id,
    status: 'finished',
    class: ENCOUNTER_CLASS_AMBULATORY,
    type: [{ coding: [ENCOUNTER_TYPE_ODONTOLOGY] }],
    subject: { reference: fhirRef('Patient', patientId(patient)) },
    participant: [
      {
        type: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                code: 'PPRF',
                display: 'primary performer',
              },
            ],
          },
        ],
        individual: { reference: fhirRef('Practitioner', practitionerId(user)) },
      },
    ],
    serviceProvider: { reference: fhirRef('Organization', organizationId(user)) },
    period: { start, end: start },
  }
}

function buildConditionResource(
  record: ClinicalRecord,
  patient: Patient,
  diagnosis: Cie10Diagnosis,
  index: number,
): FhirCondition {
  const id = conditionId(record, diagnosis, index)
  const verification = VERIFICATION_STATUS_MAP[diagnosis.certainty] ?? VERIFICATION_STATUS_MAP.confirmado
  return {
    resourceType: 'Condition',
    id,
    clinicalStatus: {
      coding: [CLINICAL_STATUS_ACTIVE],
    },
    verificationStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
          code: verification.code,
          display: verification.display,
        },
      ],
    },
    category: [{ coding: [CONDITION_CATEGORY_ENCOUNTER] }],
    code: {
      coding: [
        {
          system: FHIR_SYSTEMS.cie10,
          code: diagnosis.code,
          display: diagnosis.description,
        },
      ],
      text: diagnosis.description,
    },
    subject: { reference: fhirRef('Patient', patientId(patient)) },
    encounter: { reference: fhirRef('Encounter', encounterId(record)) },
    recordedDate: record.signedAt ?? record.createdAt,
  }
}

function buildProcedureResource(
  record: ClinicalRecord,
  patient: Patient,
  user: UserProfile,
  item: { procedure: string; cupsCode?: string; quantity: number },
  index: number,
): FhirProcedure {
  const id = procedureId(record, index)
  const cups = item.cupsCode?.replace(/\D/g, '').padStart(6, '0').slice(0, 6)
  return {
    resourceType: 'Procedure',
    id,
    status: 'completed',
    code: {
      coding: cups
        ? [{ system: FHIR_SYSTEMS.cups, code: cups, display: item.procedure }]
        : [],
      text: item.procedure,
    },
    subject: { reference: fhirRef('Patient', patientId(patient)) },
    encounter: { reference: fhirRef('Encounter', encounterId(record)) },
    performedDateTime: record.signedAt ?? record.createdAt,
    performer: [{ actor: { reference: fhirRef('Practitioner', practitionerId(user)) } }],
  }
}

function buildCompositionResource(
  record: ClinicalRecord,
  patient: Patient,
  user: UserProfile,
  conditionRefs: string[],
  procedureRefs: string[],
): FhirComposition {
  const id = compositionId(record)
  const chiefComplaint = record.anamnesis?.chiefComplaint?.trim() || 'Sin motivo de consulta registrado'
  const findings = record.findings?.trim() || 'Sin hallazgos adicionales'
  const planText =
    (record.treatmentPlan ?? [])
      .filter((t) => (t.procedure ?? '').trim())
      .map((t) => `${t.procedure}${t.cupsCode ? ` (CUPS ${t.cupsCode})` : ''}`)
      .join('; ') || 'Sin plan de tratamiento'

  return {
    resourceType: 'Composition',
    id,
    meta: { profile: [FHIR_PROFILES.compositionRda] },
    status: 'final',
    type: { coding: [COMPOSITION_TYPE_ODONTOLOGY] },
    subject: { reference: fhirRef('Patient', patientId(patient)) },
    encounter: { reference: fhirRef('Encounter', encounterId(record)) },
    date: record.signedAt ?? record.createdAt,
    author: [{ reference: fhirRef('Practitioner', practitionerId(user)) }],
    title: 'Historia Clínica Odontológica',
    confidentiality: 'N',
    section: [
      {
        title: 'Anamnesis',
        code: { coding: [COMPOSITION_SECTIONS.anamnesis] },
        text: {
          status: 'generated',
          div: `<div xmlns="http://www.w3.org/1999/xhtml">${escapeHtml(chiefComplaint)}</div>`,
        },
      },
      {
        title: 'Hallazgos',
        code: { coding: [COMPOSITION_SECTIONS.exam] },
        text: {
          status: 'generated',
          div: `<div xmlns="http://www.w3.org/1999/xhtml">${escapeHtml(findings)}</div>`,
        },
      },
      {
        title: 'Diagnósticos',
        code: { coding: [COMPOSITION_SECTIONS.diagnosis] },
        entry: conditionRefs.map((ref) => ({ reference: ref })),
      },
      {
        title: 'Plan de tratamiento',
        code: { coding: [COMPOSITION_SECTIONS.plan] },
        entry: procedureRefs.map((ref) => ({ reference: ref })),
        text: {
          status: 'generated',
          div: `<div xmlns="http://www.w3.org/1999/xhtml">${escapeHtml(planText)}</div>`,
        },
      },
      {
        title: 'Consentimiento informado',
        code: { coding: [COMPOSITION_SECTIONS.consent] },
        text: {
          status: 'generated',
          div: `<div xmlns="http://www.w3.org/1999/xhtml">Consentimiento firmado digitalmente conforme Ley 527.</div>`,
        },
      },
    ],
  }
}

function buildDocumentReferenceResource(
  record: ClinicalRecord,
  patient: Patient,
  user: UserProfile,
): FhirDocumentReference {
  return {
    resourceType: 'DocumentReference',
    id: documentReferenceId(record),
    status: 'current',
    type: { coding: [COMPOSITION_TYPE_ODONTOLOGY] },
    subject: { reference: fhirRef('Patient', patientId(patient)) },
    date: record.signedAt ?? record.createdAt,
    author: [{ reference: fhirRef('Practitioner', practitionerId(user)) }],
    description: 'Historia clínica odontológica firmada',
    content: [
      {
        attachment: {
          contentType: 'application/json',
          title: `Historia clínica ${record.signedAt?.slice(0, 10) ?? ''}`,
          hash: record.contentHash,
        },
      },
    ],
  }
}

function toEntry(resource: FhirResource): FhirBundleEntry {
  return {
    fullUrl: fhirFullUrl(resource.resourceType, resource.id),
    resource,
  }
}

function buildRecordResources(
  source: FhirSourceRecord,
  user: UserProfile,
  metadata: FhirExportMetadata,
): FhirResource[] {
  const { record, patient } = source
  const patientResource = buildPatientResource(patient)
  const organization = buildOrganizationResource(user, metadata)
  const practitioner = buildPractitionerResource(user)
  const encounter = buildEncounterResource(record, patient, user)

  const conditions = (record.diagnoses ?? []).map((d, i) =>
    buildConditionResource(record, patient, d, i),
  )
  const budgetItems = (record.budgetItems ?? []).filter((item) => (item.procedure ?? '').trim())
  const procedures = budgetItems.map((item, i) =>
    buildProcedureResource(record, patient, user, item, i),
  )

  const conditionRefs = conditions.map((c) => fhirRef('Condition', c.id))
  const procedureRefs = procedures.map((p) => fhirRef('Procedure', p.id))
  const composition = buildCompositionResource(
    record,
    patient,
    user,
    conditionRefs,
    procedureRefs,
  )

  const resources: FhirResource[] = [
    patientResource,
    organization,
    practitioner,
    encounter,
    ...conditions,
    ...procedures,
    composition,
  ]

  if (metadata.includeDocumentReference) {
    resources.push(buildDocumentReferenceResource(record, patient, user))
  }

  return resources
}

function dedupeResources(resources: FhirResource[]): FhirResource[] {
  const map = new Map<string, FhirResource>()
  for (const resource of resources) {
    const key = `${resource.resourceType}/${resource.id}`
    if (!map.has(key)) {
      map.set(key, resource)
    }
  }
  return [...map.values()]
}

function orderForDocumentBundle(resources: FhirResource[]): FhirResource[] {
  const composition = resources.find((r) => r.resourceType === 'Composition')
  const rest = resources.filter((r) => r.resourceType !== 'Composition')
  return composition ? [composition, ...rest] : resources
}

export function buildFhirBundle(
  sources: FhirSourceRecord[],
  professional: UserProfile,
  metadata: FhirExportMetadata,
): FhirExportResult {
  const allResources: FhirResource[] = []

  for (const source of sources) {
    allResources.push(...buildRecordResources(source, professional, metadata))
  }

  const uniqueResources = dedupeResources(allResources)
  const ordered =
    metadata.bundleType === 'document'
      ? orderForDocumentBundle(uniqueResources)
      : uniqueResources

  const patientKeys = new Set(sources.map((s) => patientId(s.patient)))

  const bundle: FhirBundle = {
    resourceType: 'Bundle',
    type: metadata.bundleType,
    timestamp: new Date().toISOString(),
    identifier: {
      system: FHIR_SYSTEMS.clinicalRecord,
      value: `export-${new Date().toISOString().slice(0, 10)}-${sources.length}`,
    },
    entry: ordered.map(toEntry),
  }

  const issues = validateFhirExport(bundle, sources, professional, metadata)

  return {
    bundle,
    issues,
    recordCount: sources.length,
    patientCount: patientKeys.size,
    resourceCount: ordered.length,
  }
}

export function buildDefaultFhirMetadata(user: UserProfile): FhirExportMetadata {
  return {
    bundleType: 'document',
    organizationName: user.clinicName,
    includeDocumentReference: true,
  }
}

export function downloadFhirJson(bundle: FhirBundle, filename: string): void {
  const json = JSON.stringify(bundle, null, 2)
  const blob = new Blob([json], { type: 'application/fhir+json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.json') ? filename : `${filename}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function suggestFhirFilename(bundleType: FhirBundleType, recordCount: number): string {
  const date = new Date().toISOString().slice(0, 10)
  return `FHIR_${bundleType}_${recordCount}atenciones_${date}.json`
}

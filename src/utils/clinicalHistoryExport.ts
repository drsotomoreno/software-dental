import { db } from '@/db/database'
import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { Patient } from '@/types/patient'
import type {
  ClinicalHistoryExportFormat,
  ClinicalHistoryExportPackage,
  CustodyChainEntry,
} from '@/types/portability'
import {
  LEGAL_FRAMEWORK,
  PORTABILITY_FORMAT,
  PORTABILITY_VERSION,
} from '@/types/portability'
import type { DigitalSignature } from '@/types/signature'
import type { UserProfile } from '@/types/user'
import { computeContentHash, serializeForHash } from './crypto'
import {
  buildDefaultFhirMetadata,
  buildFhirBundle,
  downloadFhirJson,
} from './fhir'
import { buildPortabilityHtml, openPortabilityHtmlForPrint } from './portabilityHtml'
import { buildPortabilityXml } from './portabilityXml'
import { getPatientByRouteId, getOdontogramByPatientRouteId, toDexiePrimaryKey } from './patientId'
import { sortEvolutionNotesChronologically, verifyPatientRecordsIntegrity } from './recordIntegrity'
import { ROLE_LABELS } from './permissions'

async function loadLockedRecords(patientRouteId: string): Promise<ClinicalRecord[]> {
  const numericKey = toDexiePrimaryKey(patientRouteId)
  const stringKey = String(patientRouteId)

  const byString = await db.clinicalRecords
    .where('patientId')
    .equals(stringKey)
    .filter((r) => r.isLocked)
    .toArray()

  let byNumeric: ClinicalRecord[] = []
  if (typeof numericKey === 'number') {
    byNumeric = await db.clinicalRecords
      .where('patientId')
      .equals(numericKey)
      .filter((r) => r.isLocked)
      .toArray()
  }

  const merged = new Map([...byString, ...byNumeric].map((r) => [r.id, r]))
  return [...merged.values()]
    .map((record) => ({
      ...record,
      evolutionNotes: sortEvolutionNotesChronologically(record.evolutionNotes ?? []),
    }))
    .sort((a, b) => new Date(a.signedAt ?? 0).getTime() - new Date(b.signedAt ?? 0).getTime())
}

async function loadSignaturesForRecords(records: ClinicalRecord[]): Promise<DigitalSignature[]> {
  const all: DigitalSignature[] = []
  for (const record of records) {
    const recordId = String(record.id ?? '')
    const sigs = await db.signatures.where('recordId').equals(recordId).toArray()
    all.push(...sigs)
  }
  return all
}

function buildCustodyChain(
  records: ClinicalRecord[],
  signatures: DigitalSignature[],
  exportedAt: string,
  exportedBy: UserProfile | null,
): CustodyChainEntry[] {
  const chain: CustodyChainEntry[] = []

  for (const record of records) {
    const recordId = String(record.id ?? '')
    const recordSigs = signatures.filter((s) => s.recordId === recordId)

    if (recordSigs.length > 0) {
      for (const sig of recordSigs) {
        chain.push({
          step: 'clinical_signature',
          recordId,
          timestamp: sig.signedAt,
          contentHash: sig.contentHash ?? record.contentHash,
          signedBy: sig.signedBy,
          description:
            sig.recordType === 'clinical_record'
              ? 'Firma electrónica del profesional (Ley 527)'
              : 'Firma electrónica del paciente — consentimiento informado',
        })
      }
    } else if (record.signedAt && record.contentHash) {
      chain.push({
        step: 'clinical_signature',
        recordId,
        timestamp: record.signedAt,
        contentHash: record.contentHash,
        description: 'Registro clínico bloqueado con hash SHA-256',
      })
    }
  }

  chain.push({
    step: 'export_generation',
    timestamp: exportedAt,
    signedBy: exportedBy ? `${exportedBy.firstName} ${exportedBy.lastName}` : undefined,
    description: 'Generación de exportación de historia clínica / RDA',
  })

  return chain.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

export async function buildClinicalHistoryExportPackage(
  patientRouteId: string,
  exportedBy: UserProfile | null,
  purpose: 'exportacion_historia_clinica' | 'resumen_digital_atencion' = 'exportacion_historia_clinica',
): Promise<ClinicalHistoryExportPackage | null> {
  const patient = await getPatientByRouteId(patientRouteId)
  if (!patient) return null

  const odontogram = await getOdontogramByPatientRouteId(patientRouteId)
  const clinicalRecords = await loadLockedRecords(patientRouteId)
  const signatures = await loadSignaturesForRecords(clinicalRecords)
  const integrityReport = await verifyPatientRecordsIntegrity(clinicalRecords)
  const exportedAt = new Date().toISOString()
  const exportId = crypto.randomUUID()

  const custodyChain = buildCustodyChain(clinicalRecords, signatures, exportedAt, exportedBy)

  const payloadWithoutHash = {
    format: PORTABILITY_FORMAT,
    version: PORTABILITY_VERSION,
    exportId,
    exportedAt,
    purpose,
    legalBasis: LEGAL_FRAMEWORK,
    exportedBy: exportedBy
      ? {
          id: exportedBy.id,
          name: `${exportedBy.firstName} ${exportedBy.lastName}`,
          email: exportedBy.email,
          role: ROLE_LABELS[exportedBy.role],
          professionalLicense: exportedBy.professionalLicense,
          clinicName: exportedBy.clinicName,
          providerNit: exportedBy.providerNit,
        }
      : null,
    patient,
    odontogram,
    clinicalRecords,
    signatures,
    integrityReport,
    custodyChain,
  }

  const packageHash = await computeContentHash(serializeForHash(payloadWithoutHash))

  const manifest = {
    exportId,
    exportedAt,
    purpose,
    legalBasis: LEGAL_FRAMEWORK,
    exportedBy: payloadWithoutHash.exportedBy,
    patient: {
      documentType: patient.documentType,
      documentNumber: patient.documentNumber,
      fullName: `${patient.firstName} ${patient.lastName}`,
    },
    recordCount: clinicalRecords.length,
    integrityVerified: integrityReport.every((r) => r.valid),
    packageHash,
    algorithm: 'SHA-256' as const,
  }

  return {
    format: PORTABILITY_FORMAT,
    version: PORTABILITY_VERSION,
    manifest,
    patient,
    odontogram,
    clinicalRecords,
    signatures,
    integrityReport,
    custodyChain,
  }
}

function downloadBlob(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function suggestFilename(patient: Patient, format: ClinicalHistoryExportFormat, date: string): string {
  const safeDoc = patient.documentNumber.replace(/\W/g, '_')
  const base = `HistoriaClinica_${safeDoc}_${date.slice(0, 10)}`
  switch (format) {
    case 'json':
      return `${base}.json`
    case 'fhir':
      return `${base}_FHIR_R4.json`
    case 'xml':
      return `${base}.xml`
    case 'html':
      return `${base}.html`
  }
}

export async function exportClinicalHistory(
  pkg: ClinicalHistoryExportPackage,
  format: ClinicalHistoryExportFormat,
  professional: UserProfile,
): Promise<void> {
  const { patient, clinicalRecords, manifest } = pkg
  const date = manifest.exportedAt

  switch (format) {
    case 'json': {
      downloadBlob(JSON.stringify(pkg, null, 2), suggestFilename(patient, 'json', date), 'application/json;charset=utf-8')
      break
    }
    case 'fhir': {
      const sources = clinicalRecords.map((record) => ({ record, patient }))
      const metadata = {
        ...buildDefaultFhirMetadata(professional),
        bundleType: 'document' as const,
        organizationName: professional.clinicName,
      }
      const result = buildFhirBundle(sources, professional, metadata)
      downloadFhirJson(
        result.bundle,
        suggestFilename(patient, 'fhir', date),
      )
      break
    }
    case 'xml': {
      const xml = buildPortabilityXml(pkg)
      downloadBlob(xml, suggestFilename(patient, 'xml', date), 'application/xml;charset=utf-8')
      break
    }
    case 'html': {
      const html = buildPortabilityHtml(pkg)
      downloadBlob(html, suggestFilename(patient, 'html', date), 'text/html;charset=utf-8')
      openPortabilityHtmlForPrint(html)
      break
    }
  }
}

// Compatibilidad con API anterior
export {
  buildClinicalHistoryExportPackage as buildPatientPortabilityPackage,
}

export function downloadPortabilityPackage(
  pkg: ClinicalHistoryExportPackage,
  patient: Patient,
  format: ClinicalHistoryExportFormat = 'json',
  professional?: UserProfile,
): void {
  if (format === 'json') {
    downloadBlob(
      JSON.stringify(pkg, null, 2),
      suggestFilename(patient, 'json', pkg.manifest.exportedAt),
      'application/json;charset=utf-8',
    )
    return
  }
  if (!professional) throw new Error('Se requiere perfil del profesional para este formato.')
  void exportClinicalHistory(pkg, format, professional)
}

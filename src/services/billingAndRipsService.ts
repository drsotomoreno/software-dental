import type {
  BillingValidationIssue,
  ClinicalSessionPipeline,
  ProcessClinicalSessionInput,
  ProcessClinicalSessionResult,
} from '@/types/billingAndRips'
import type { ElectronicInvoice } from '@/types/invoice'
import type { Patient } from '@/types/patient'
import type { UserProfile } from '@/types/user'
import { DOCUMENT_TYPE_RIPS, REGIME_TO_TIPO_USUARIO } from '@/constants/rips'
import { validateRipsWithMinistry } from '@/services/ripsApiService'
import {
  buildDianProviderPayload,
  buildInvoiceDraftFromClinicalRecord,
  buildRipsMetadataFromInvoice,
  saveElectronicInvoice,
} from '@/services/invoiceService'
import { isInvoiceItemRipsEligible } from '@/utils/buildRipsJson'
import { buildRipsJson } from '@/utils/buildRipsJson'
import {
  applyClinicalRulesToRips,
  buildRipsOnlyReference,
  hasBlockingBillingIssues,
  validateClinicalItems,
} from '@/utils/billingRipsRules'
import {
  computeDianTotal,
  computeRipsReportableTotal,
  extractClinicalItemsFromRecord,
  isClinicalItemBillable,
  requiresDianBilling,
} from '@/utils/clinicalSessionItems'
import { buildDefaultRipsMetadata, type RipsSourceRecord } from '@/utils/rips'
import { validateRipsExport } from '@/utils/ripsValidation'
import { generateId } from '@/utils/crypto'

function mapPatientBillingData(patient: Patient) {
  return {
    documentType: DOCUMENT_TYPE_RIPS[patient.documentType] ?? 'CC',
    documentNumber: patient.documentNumber.trim(),
    fullName: `${patient.firstName} ${patient.lastName}`.trim(),
    tipoUsuario:
      patient.regime != null
        ? REGIME_TO_TIPO_USUARIO[patient.regime]
        : REGIME_TO_TIPO_USUARIO.particular,
  }
}

function buildInvoiceFromBillableSession(
  input: ProcessClinicalSessionInput,
  clinicalItems: ReturnType<typeof extractClinicalItemsFromRecord>,
  invoiceNumber: string,
): ElectronicInvoice {
  const invoice = buildInvoiceDraftFromClinicalRecord({
    patientId: input.sessionId.includes('draft')
      ? String(input.patient.id)
      : input.sessionId,
    clinicalRecordId: input.record.id ?? input.sessionId,
    patient: input.patient,
    record: input.record,
    professional: input.professional,
    invoiceNumber,
    catalogLookup: input.catalogLookup,
    includeConsultation: false,
  })

  const billableIds = new Set(
    clinicalItems.filter((item) => isClinicalItemBillable(item) || item.isCustomProcedure).map((i) => i.sourceId),
  )

  const filteredItems = invoice.items
    .filter((item) => !item.sourceId || billableIds.has(item.sourceId))
    .filter((item) => item.isBillable !== false && item.totalAmount > 0)
    .map((item, index) => ({ ...item, lineNumber: index + 1 }))

  const dianTotal = filteredItems.reduce((sum, item) => sum + item.totalAmount, 0)
  const ripsItems = filteredItems.filter(isInvoiceItemRipsEligible)

  return {
    ...invoice,
    items: filteredItems,
    subtotal: dianTotal,
    netPayable: dianTotal,
    ripsReportableTotal: ripsItems.reduce((sum, item) => sum + item.totalAmount, 0),
    ripsExcludedLineCount: filteredItems.length - ripsItems.length,
    status: 'draft',
  }
}

/**
 * Orquesta la separación clínica / DIAN / RIPS para una sesión de atención.
 *
 * Reglas:
 * - Toda atención con CUPS genera RIPS (vrServicio puede ser 0).
 * - Solo atenciones facturables (isBillable && cost > 0) generan FEV DIAN.
 * - Procedimientos personalizados van a DIAN, no a RIPS.
 */
export async function processClinicalSession(
  input: ProcessClinicalSessionInput,
): Promise<ProcessClinicalSessionResult> {
  const {
    sessionId,
    patient,
    record,
    professional,
    evolutionNoteIds,
    catalogLookup,
    submitToMinistry = false,
  } = input

  const clinicalItems = extractClinicalItemsFromRecord(record, professional, {
    catalogLookup,
    evolutionNoteIds,
  })

  const validationIssues: BillingValidationIssue[] = validateClinicalItems(clinicalItems)
  const needsDian = requiresDianBilling(clinicalItems)
  const dianTotal = computeDianTotal(clinicalItems)
  const ripsReportableTotal = computeRipsReportableTotal(clinicalItems)
  const pipeline: ClinicalSessionPipeline = needsDian ? 'rips_and_dian' : 'rips_only'

  if (hasBlockingBillingIssues(validationIssues)) {
    return {
      sessionId,
      clinicalItems,
      pipeline,
      requiresDianBilling: needsDian,
      invoice: null,
      ripsPayload: { numDocumentoIdObligado: '', numFactura: '', tipoNota: null, numNota: null, usuarios: [] },
      ripsProcedureItems: [],
      dianTotal,
      ripsReportableTotal,
      validationIssues,
    }
  }

  const invoiceNumber =
    input.invoiceNumber?.trim() ||
    (needsDian ? `FV${Date.now().toString().slice(-8)}` : buildRipsOnlyReference(sessionId))

  const invoice = needsDian
    ? buildInvoiceFromBillableSession(input, clinicalItems, invoiceNumber)
    : null

  const sources: RipsSourceRecord[] = [{ record, patient }]
  const metadata = invoice
    ? buildRipsMetadataFromInvoice(invoice, professional)
    : {
        ...buildDefaultRipsMetadata(professional),
        numFactura: invoiceNumber,
      }

  const baseRips = buildRipsJson({
    invoice:
      invoice ??
      ({
        id: generateId(),
        invoiceNumber,
        issueDate: new Date().toISOString().slice(0, 10),
        status: 'draft',
        issuerNit: metadata.numDocumentoIdObligado,
        issuerBusinessName: professional.clinicName,
        buyerDocumentType: mapPatientBillingData(patient).documentType,
        buyerDocumentNumber: patient.documentNumber,
        buyerName: mapPatientBillingData(patient).fullName,
        healthSector: {
          codPrestadorReps: metadata.codPrestador,
          modalidadPago: '01',
          coberturaPlanBeneficios: '01',
          tipoUsuario: mapPatientBillingData(patient).tipoUsuario,
        },
        subtotal: 0,
        discountTotal: 0,
        copayTotal: 0,
        netPayable: 0,
        currency: 'COP',
        items: [],
        ripsReportableTotal: 0,
        ripsExcludedLineCount: 0,
        patientId: String(patient.id),
        professionalId: professional.id,
        clinicalRecordIds: [String(record.id ?? sessionId)],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies ElectronicInvoice),
    sources,
    professional,
    metadata,
    catalogLookup,
  })

  const { rips: ripsWithRules, procedureItems } = applyClinicalRulesToRips(
    baseRips.rips,
    clinicalItems,
  )

  validationIssues.push(
    ...baseRips.issues.map((issue) => ({
      level: issue.level,
      field: issue.field,
      message: issue.message,
    })),
    ...validateRipsExport(ripsWithRules, sources, professional, metadata).map((issue) => ({
      level: issue.level,
      field: issue.field,
      message: issue.message,
    })),
  )

  let ministryResponse: ProcessClinicalSessionResult['ministryResponse']
  let cuv: string | null = null
  let cufe: string | null = null

  if (submitToMinistry && !hasBlockingBillingIssues(validationIssues)) {
    ministryResponse = await validateRipsWithMinistry(ripsWithRules, {
      metadatos: {
        patientUuid: String(patient.id),
        clinicalRecordIds: [String(record.id ?? sessionId)],
        patientDocument: patient.documentNumber,
      },
      invoice: needsDian && invoice ? buildDianProviderPayload(invoice) : undefined,
    })

    if (ministryResponse.success && ministryResponse.approved) {
      cuv = ministryResponse.cuv
      if (invoice) {
        const saved: ElectronicInvoice = {
          ...invoice,
          ripsJson: ripsWithRules,
          cuv,
          cuvRecordId: ministryResponse.cuvRecordId,
          status: 'cuv_approved',
          updatedAt: new Date().toISOString(),
          submittedAt: new Date().toISOString(),
        }
        await saveElectronicInvoice(saved)
      }
    }
  } else if (invoice) {
    await saveElectronicInvoice({
      ...invoice,
      ripsJson: ripsWithRules,
      updatedAt: new Date().toISOString(),
    })
  }

  return {
    sessionId,
    clinicalItems,
    pipeline,
    requiresDianBilling: needsDian,
    invoice,
    ripsPayload: ripsWithRules,
    ripsProcedureItems: procedureItems,
    dianTotal,
    ripsReportableTotal: procedureItems.reduce((sum, item) => sum + item.vrServicio, 0),
    validationIssues,
    ministryResponse,
    cuv,
    cufe,
  }
}

export { validateClinicalItems, hasBlockingBillingIssues } from '@/utils/billingRipsRules'
export {
  extractClinicalItemsFromRecord,
  isClinicalItemBillable,
  isClinicalItemRipsReportable,
} from '@/utils/clinicalSessionItems'

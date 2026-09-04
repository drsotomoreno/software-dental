import { db } from '@/db/database'
import type { ClinicalRecord, BudgetLineItem } from '@/types/clinicalRecord'
import { expandEvolutionNoteServices } from '@/utils/evolutionCatalogServices'
import type { EvolutionNote } from '@/types/evolutionNote'
import type { Patient } from '@/types/patient'
import type {
  ElectronicInvoice,
  HealthSectorInvoiceFields,
  InvoiceDraftInput,
  InvoiceItem,
  InvoiceTotals,
  InvoiceValidationIssue,
} from '@/types/invoice'
import type { DianInvoicePayload } from '@/types/ripsCuv'
import type { RipsExportMetadata } from '@/types/rips'
import type { UserProfile } from '@/types/user'
import { DOCUMENT_TYPE_RIPS, REGIME_TO_TIPO_USUARIO, RIPS_DEFAULTS } from '@/constants/rips'
import { DEFAULT_ODONTOLOGY_CONSULTATION_CUPS } from '@/constants/rips'
import { normalizeCupsCode } from '@/services/catalogService'
import { validateRipsWithMinistry } from '@/services/ripsApiService'
import type { RipsValidateResponse } from '@/types/ripsCuv'
import { usesManualCashReceipt, usesProviderEmission, consumeElectronicFolio } from '@/services/billingModalityService'
import { emitInvoiceWithDianProvider } from '@/services/dianProviderClient'
import {
  buildRipsJson,
  isInvoiceItemRipsEligible,
} from '@/utils/buildRipsJson'
import {
  buildHealthElectronicInvoiceDocument,
} from '@/utils/buildHealthElectronicInvoiceDocument'
import {
  hasBlockingEmissionGateIssues,
  validateInvoiceEmissionGate,
} from '@/utils/invoiceEmissionGate'
import { enqueueElectronicInvoiceOutbox } from '@/services/invoiceOutboxService'
import {
  assertElectronicInvoiceMutableUpdate,
} from '@/services/invoiceImmutabilityService'
import {
  buildDefaultRipsMetadata,
  buildRipsFromRecords,
  normalizeCodPrestador,
  normalizeNit,
  type RipsSourceRecord,
} from '@/utils/rips'
import {
  extractCupsCodeFromText,
  resolveEvolutionNoteRipsCups,
  type EvolutionCatalogLookup,
} from '@/utils/ripsCompiler'
import { calcBillableLineTotal } from '@/utils/cupsBillingRules'
import { isNonRipsEvolutionNote } from '@/types/evolutionNote'
import {
  hasBlockingInvoiceIssues,
  validateInvoiceForSubmission,
} from '@/utils/invoiceValidation'
import { generateId } from '@/utils/crypto'

const CUPS_PATTERN = /^\d{6}$/

function normalizeCups(code: string | null | undefined): string | null {
  if (!code?.trim()) return null
  const normalized = normalizeCupsCode(code)
  return CUPS_PATTERN.test(normalized) ? normalized : null
}

function buildHealthSectorDefaults(
  patient: Patient,
  professional: UserProfile,
  overrides?: Partial<HealthSectorInvoiceFields>,
): HealthSectorInvoiceFields {
  const tipoUsuario =
    patient.regime != null
      ? REGIME_TO_TIPO_USUARIO[patient.regime]
      : REGIME_TO_TIPO_USUARIO.particular

  return {
    codPrestadorReps: normalizeCodPrestador(professional.repsCode ?? ''),
    modalidadPago: '01',
    coberturaPlanBeneficios: '01',
    tipoUsuario,
    numAutorizacion: null,
    conceptoRecaudo: RIPS_DEFAULTS.conceptoRecaudoParticular,
    valorPagoModerador: 0,
    numFEVPagoModerador: null,
    ...overrides,
  }
}

function getPrincipalDiagnosis(record: ClinicalRecord) {
  const diagnoses = record.diagnoses ?? []
  return diagnoses.find((d) => d.type === 'principal') ?? diagnoses[0]
}

function resolveEvolutionCost(
  note: EvolutionNote,
  catalog?: { defaultPrice?: number } | null,
): number {
  if (typeof note.cost === 'number') return Math.max(0, note.cost)
  return Math.max(0, catalog?.defaultPrice ?? 0)
}

function resolveEvolutionBillable(note: EvolutionNote, cost: number): boolean {
  if (note.isBillable === false) return false
  if (note.isBillable === true) return cost > 0
  return cost > 0
}

function buildItemFromBudget(
  item: BudgetLineItem,
  lineNumber: number,
  record: ClinicalRecord,
  professional: UserProfile,
): InvoiceItem {
  const cups = normalizeCups(item.cupsCode)
  const isCustom = !cups
  const principal = getPrincipalDiagnosis(record)
  const gross = calcBillableLineTotal(item.unitPrice, item.quantity, item.cupsCode ?? '')
  const discount = 0
  const copay = 0

  return {
    id: generateId(),
    lineNumber,
    description: item.procedure,
    cupsCode: cups,
    cie10Code: principal?.code ?? null,
    cie10Description: principal?.description ?? null,
    cie10Type: 'principal',
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountAmount: discount,
    copayAmount: copay,
    totalAmount: gross - discount - copay,
    isCustomProcedure: isCustom,
    attentionDate: record.signedAt ?? record.createdAt,
    professionalDocument: professional.documentNumber,
    professionalName: `${professional.firstName} ${professional.lastName}`,
    toothNumber: item.toothNumber,
    sourceType: 'budget',
    sourceId: item.id,
  }
}

function buildItemFromEvolution(
  note: EvolutionNote,
  lineNumber: number,
  record: ClinicalRecord,
  catalogLookup?: EvolutionCatalogLookup,
): InvoiceItem {
  const catalog = note.dentalServiceId ? catalogLookup?.(note.dentalServiceId) : null
  const cupsFromNote = resolveEvolutionNoteRipsCups(note, catalog ?? undefined)
  const cups = cupsFromNote ? normalizeCups(cupsFromNote) : null
  const isCustom = isNonRipsEvolutionNote(note) || !cups
  const cost = resolveEvolutionCost(note, catalog)
  const isBillable = resolveEvolutionBillable(note, cost)
  const principal = getPrincipalDiagnosis(record)
  const unitPrice = isBillable ? cost : 0
  const quantity = 1
  const gross = cups ? calcBillableLineTotal(unitPrice, quantity, cups) : unitPrice * quantity

  return {
    id: generateId(),
    lineNumber,
    description: note.serviceName || note.procedure || note.clinicalNote || 'Servicio clínico',
    cupsCode: cups,
    cie10Code: principal?.code ?? null,
    cie10Description: principal?.description ?? null,
    cie10Type: 'principal',
    quantity,
    unitPrice,
    discountAmount: 0,
    copayAmount: 0,
    totalAmount: gross,
    isCustomProcedure: isCustom,
    isBillable,
    attentionDate: note.date,
    professionalDocument: note.professionalLicense,
    professionalName: note.professionalName,
    sourceType: 'evolution',
    sourceId: note.id,
  }
}

/** Calcula totales DIAN (completo) y RIPS (solo CUPS). */
export function computeInvoiceTotals(items: InvoiceItem[]): InvoiceTotals {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const discountTotal = items.reduce((sum, item) => sum + (item.discountAmount || 0), 0)
  const copayTotal = items.reduce((sum, item) => sum + (item.copayAmount || 0), 0)
  const dianTotal = items.reduce((sum, item) => sum + item.totalAmount, 0)
  const ripsItems = items.filter(isInvoiceItemRipsEligible)
  const ripsReportableTotal = ripsItems.reduce((sum, item) => sum + item.totalAmount, 0)

  return {
    subtotal,
    discountTotal,
    copayTotal,
    taxTotal: 0,
    netPayable: dianTotal,
    ripsReportableTotal,
    dianTotal,
    ripsExcludedLineCount: items.length - ripsItems.length,
  }
}

/**
 * Extrae líneas facturables desde presupuesto y evoluciones de la historia clínica.
 */
export function extractInvoiceItemsFromClinicalRecord(
  record: ClinicalRecord,
  professional: UserProfile,
  options?: {
    catalogLookup?: EvolutionCatalogLookup
    includeConsultation?: boolean
    consultationUnitPrice?: number
  },
): InvoiceItem[] {
  const items: InvoiceItem[] = []
  let lineNumber = 1

  if (options?.includeConsultation && (options.consultationUnitPrice ?? 0) > 0) {
    const principal = getPrincipalDiagnosis(record)
    const consultCups = normalizeCups(DEFAULT_ODONTOLOGY_CONSULTATION_CUPS)
    items.push({
      id: generateId(),
      lineNumber: lineNumber++,
      description: 'Consulta odontológica',
      cupsCode: consultCups,
      cie10Code: principal?.code ?? null,
      cie10Description: principal?.description ?? null,
      cie10Type: 'principal',
      quantity: 1,
      unitPrice: options.consultationUnitPrice ?? 0,
      discountAmount: 0,
      copayAmount: 0,
      totalAmount: options.consultationUnitPrice ?? 0,
      isCustomProcedure: false,
      attentionDate: record.signedAt ?? record.createdAt,
      professionalDocument: professional.documentNumber,
      professionalName: `${professional.firstName} ${professional.lastName}`,
      sourceType: 'consultation',
    })
  }

  for (const budgetItem of record.budgetItems ?? []) {
    if (!budgetItem.procedure?.trim()) continue
    const cups = normalizeCups(budgetItem.cupsCode) ?? extractCupsCodeFromText(budgetItem.procedure)
    const item = buildItemFromBudget(
      { ...budgetItem, cupsCode: cups ?? budgetItem.cupsCode },
      lineNumber++,
      record,
      professional,
    )
    items.push(item)
  }

  for (const note of record.evolutionNotes ?? []) {
    for (const { note: scopedNote } of expandEvolutionNoteServices(note)) {
      if (
        !scopedNote.procedure?.trim() &&
        !scopedNote.clinicalNote?.trim() &&
        !scopedNote.serviceName?.trim()
      ) {
        continue
      }
      const item = buildItemFromEvolution(scopedNote, lineNumber++, record, options?.catalogLookup)
      if (item.isBillable === false || item.totalAmount <= 0) continue
      items.push(item)
    }
  }

  return items
}

/** Compila borrador de factura electrónica desde historia clínica. */
export function buildInvoiceDraftFromClinicalRecord(input: InvoiceDraftInput): ElectronicInvoice {
  const {
    patient,
    record,
    professional,
    patientId,
    invoiceNumber,
    issueDate = new Date().toISOString().slice(0, 10),
    catalogLookup,
    healthSector,
    consultationUnitPrice,
    includeConsultation = false,
  } = input

  const items = extractInvoiceItemsFromClinicalRecord(record, professional, {
    catalogLookup,
    includeConsultation,
    consultationUnitPrice,
  })

  const totals = computeInvoiceTotals(items)
  const now = new Date().toISOString()

  return {
    id: generateId(),
    invoiceNumber: invoiceNumber.trim(),
    issueDate,
    status: 'draft',
    issuerNit: normalizeNit(professional.providerNit ?? ''),
    issuerBusinessName:
      professional.legalName ||
      professional.clinicName ||
      `${professional.firstName} ${professional.lastName}`,
    buyerDocumentType: DOCUMENT_TYPE_RIPS[patient.documentType] ?? 'CC',
    buyerDocumentNumber: patient.documentNumber.trim(),
    buyerName: `${patient.firstName} ${patient.lastName}`.trim(),
    healthSector: buildHealthSectorDefaults(patient, professional, healthSector),
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    copayTotal: totals.copayTotal,
    netPayable: totals.netPayable,
    currency: 'COP',
    items,
    ripsReportableTotal: totals.ripsReportableTotal,
    ripsExcludedLineCount: totals.ripsExcludedLineCount,
    patientId,
    professionalId: professional.id,
    clinicalRecordIds: [String(record.id ?? '')],
    evolutionNoteIds: (record.evolutionNotes ?? []).map((note) => note.id),
    createdAt: now,
    updatedAt: now,
  }
}

export function buildRipsMetadataFromInvoice(
  invoice: ElectronicInvoice,
  professional: UserProfile,
): RipsExportMetadata {
  const base = buildDefaultRipsMetadata(professional)
  return {
    ...base,
    numDocumentoIdObligado: invoice.issuerNit || base.numDocumentoIdObligado,
    numFactura: invoice.invoiceNumber,
    codPrestador: invoice.healthSector.codPrestadorReps || base.codPrestador,
    conceptoRecaudo: invoice.healthSector.conceptoRecaudo ?? base.conceptoRecaudo,
    valorPagoModerador: invoice.healthSector.valorPagoModerador ?? base.valorPagoModerador,
    numFEVPagoModerador: invoice.healthSector.numFEVPagoModerador ?? base.numFEVPagoModerador,
    vrConsulta:
      invoice.items.find((item) => item.sourceType === 'consultation')?.totalAmount ?? base.vrConsulta,
  }
}

/** Genera RIPS JSON filtrado + validaciones para una factura. */
export function compileInvoiceRipsPackage(
  invoice: ElectronicInvoice,
  sources: RipsSourceRecord[],
  professional: UserProfile,
  catalogLookup?: EvolutionCatalogLookup,
) {
  const metadata = buildRipsMetadataFromInvoice(invoice, professional)
  return buildRipsJson({
    invoice,
    sources,
    professional,
    metadata,
    catalogLookup,
  })
}

/** Mapea la factura al payload DIAN / MUV del servicio de marca blanca. */
export function buildDianProviderPayload(invoice: ElectronicInvoice): DianInvoicePayload {
  return {
    nitEmisor: invoice.issuerNit,
    razonSocialEmisor: invoice.issuerBusinessName,
    nitAdquiriente: invoice.buyerDocumentNumber,
    razonSocialAdquiriente: invoice.buyerName,
    issueDate: invoice.issueDate,
    payableAmount: invoice.netPayable,
    codPrestadorReps: invoice.healthSector.codPrestadorReps,
    lines: invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      cupsCode: isInvoiceItemRipsEligible(item) ? item.cupsCode ?? undefined : undefined,
    })),
  }
}

export async function validateInvoiceDraft(
  invoice: ElectronicInvoice,
  professional: UserProfile,
): Promise<InvoiceValidationIssue[]> {
  return validateInvoiceForSubmission(invoice, professional)
}

export async function submitInvoiceToMinistry(
  invoice: ElectronicInvoice,
  sources: RipsSourceRecord[],
  professional: UserProfile,
  catalogLookup?: EvolutionCatalogLookup,
  options?: { forceCashReceipt?: boolean },
): Promise<{
  validationIssues: InvoiceValidationIssue[]
  ministryResponse: RipsValidateResponse
  invoice: ElectronicInvoice
  folioConsumed?: boolean
  depleted?: boolean
}> {
  const validationIssues = await validateInvoiceDraft(invoice, professional)
  const emissionIssues = validateInvoiceEmissionGate(invoice, sources, {
    requireCuv: false,
    requireSignedEvolutions: true,
    requireSignedClinicalRecord: true,
  })
  const allIssues = [...validationIssues, ...emissionIssues]

  if (hasBlockingInvoiceIssues(allIssues) || hasBlockingEmissionGateIssues(allIssues)) {
    return {
      validationIssues: allIssues,
      ministryResponse: {
        success: false,
        approved: false,
        error: 'La factura tiene errores de validación que impiden el envío.',
      },
      invoice: { ...invoice, status: 'rejected', rejectionReason: 'Validación local fallida' },
    }
  }

  const ripsPackage = compileInvoiceRipsPackage(invoice, sources, professional, catalogLookup)
  const now = new Date().toISOString()

  if (options?.forceCashReceipt || usesManualCashReceipt()) {
    const localInvoice: ElectronicInvoice = {
      ...invoice,
      ripsJson: ripsPackage.rips,
      ripsReportableTotal: ripsPackage.ripsReportableTotal,
      ripsExcludedLineCount: ripsPackage.excludedLineCount,
      updatedAt: now,
      status: 'validated',
      rejectionReason: null,
    }
    await saveElectronicInvoice(localInvoice)
    return {
      validationIssues: allIssues,
      ministryResponse: {
        success: false,
        approved: false,
      },
      invoice: localInvoice,
      folioConsumed: false,
      depleted: !usesProviderEmission(),
    }
  }

  const dianPayload = buildDianProviderPayload(invoice)

  const ministryResponse = await validateRipsWithMinistry(ripsPackage.rips, {
    metadatos: {
      patientUuid: invoice.patientId,
      clinicalRecordIds: invoice.clinicalRecordIds,
      patientDocument: invoice.buyerDocumentNumber,
    },
    invoice: dianPayload,
  })

  const cuv = ministryResponse.success ? ministryResponse.cuv ?? null : null
  if (!cuv) {
    const rejected: ElectronicInvoice = {
      ...invoice,
      ripsJson: ripsPackage.rips,
      ripsReportableTotal: ripsPackage.ripsReportableTotal,
      ripsExcludedLineCount: ripsPackage.excludedLineCount,
      updatedAt: now,
      submittedAt: now,
      status: 'rejected',
      cuv: null,
      cufe: null,
      rejectionReason:
        ministryResponse.error ??
        'MUV no devolvió CUV. No se emite FEV ni se entrega factura al paciente sin CUV.',
    }
    await saveElectronicInvoice(rejected)
    return {
      validationIssues: [
        ...allIssues,
        {
          level: 'error',
          field: 'cuv',
          message:
            'El CUV del Ministerio de Salud es obligatorio antes de generar la FEV y entregarla al paciente.',
        },
      ],
      ministryResponse: {
        success: false,
        approved: false,
        error: rejected.rejectionReason ?? undefined,
        ministryErrors: ministryResponse.success ? undefined : ministryResponse.ministryErrors,
        localIssues: ministryResponse.success ? ministryResponse.localWarnings : ministryResponse.localIssues,
      },
      invoice: rejected,
      folioConsumed: false,
      depleted: !usesProviderEmission(),
    }
  }

  let cufe = invoice.cufe ?? null
  let folioConsumed = false
  const providerResult = await emitInvoiceWithDianProvider({
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    amount: invoice.netPayable,
    buyerName: invoice.buyerName,
    buyerDocument: invoice.buyerDocumentNumber,
    cuv,
  })
  if (providerResult.ok && providerResult.cufe) {
    cufe = providerResult.cufe
    folioConsumed = consumeElectronicFolio()
  }

  const ripsJson = {
    ...ripsPackage.rips,
    cuv,
    ...(cufe ? { cufe } : {}),
  }

  const updatedInvoice: ElectronicInvoice = {
    ...invoice,
    ripsJson,
    ripsReportableTotal: ripsPackage.ripsReportableTotal,
    ripsExcludedLineCount: ripsPackage.excludedLineCount,
    updatedAt: now,
    submittedAt: now,
    status: 'cuv_approved',
    cuv,
    cuvRecordId: ministryResponse.success ? ministryResponse.cuvRecordId : null,
    cufe,
    rejectionReason: null,
  }

  await saveElectronicInvoice(updatedInvoice)

  const fevDocument = buildHealthElectronicInvoiceDocument({
    invoice: updatedInvoice,
    patient: sources[0]?.patient ?? null,
    professional,
  })
  await enqueueElectronicInvoiceOutbox(updatedInvoice.id, updatedInvoice.patientId, fevDocument)

  try {
    await fetch('/api/invoices/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: fevDocument }),
    })
  } catch {
    // Offline: queda en syncOutbox local
  }

  return {
    validationIssues: [
      ...allIssues,
      ...ripsPackage.issues.map((issue) => ({
        level: issue.level,
        field: issue.field,
        message: issue.message,
      })),
    ],
    ministryResponse,
    invoice: updatedInvoice,
    folioConsumed,
    depleted: !usesProviderEmission(),
  }
}

export async function saveElectronicInvoice(invoice: ElectronicInvoice): Promise<void> {
  const existing = await db.electronicInvoices.get(invoice.id)
  assertElectronicInvoiceMutableUpdate(existing, invoice)
  await db.electronicInvoices.put(invoice)
}

export async function getElectronicInvoice(id: string): Promise<ElectronicInvoice | undefined> {
  return db.electronicInvoices.get(id)
}

export async function listElectronicInvoices(): Promise<ElectronicInvoice[]> {
  return db.electronicInvoices.orderBy('issueDate').reverse().toArray()
}

export async function listPatientElectronicInvoices(patientId: string): Promise<ElectronicInvoice[]> {
  return db.electronicInvoices.where('patientId').equals(patientId).sortBy('issueDate')
}

/** Re-exporta buildRipsFromRecords para compatibilidad con flujos existentes. */
export { buildRipsFromRecords, buildRipsJson }

/**
 * Seed de desarrollo — módulo clínico y facturación.
 *
 * Inserta 3 pacientes ficticios y 3 atenciones firmadas para probar:
 * - Generación de FEV-Salud (Casos A y C)
 * - Exportación RIPS JSON (incl. vrServicio 0 en Caso B)
 * - Vista previa / impresión de factura
 *
 * Se ejecuta al arrancar la app (después de usuarios y catálogos).
 * Es idempotente: si los documentos ya existen, no duplica.
 * Reejecutar con reemplazo: `window.seedTestClinicalAndBillingData({ replace: true })`
 */
import { db } from '@/db/database'
import { createEmptyAnamnesis } from '@/types/anamnesis'
import { createEmptyStomatologicalExam } from '@/types/stomatologicalExam'
import { createEmptySpecializedAnnexes } from '@/types/specializedAnnexes'
import { createEmptyClinicalDiagnosticChart } from '@/types/clinicalDiagnosticChart'
import { createEmptyConsent } from '@/types/consent'
import { createDefaultOdontogram } from '@/types/odontogram'
import type { OdontogramData } from '@/types/odontogram'
import type { Patient } from '@/types/patient'
import type {
  ClinicalRecord,
  Cie10Diagnosis,
  PaymentRecord,
  TreatmentPlanItem,
} from '@/types/clinicalRecord'
import type { EvolutionCatalogService, EvolutionNote } from '@/types/evolutionNote'
import type { UserProfile } from '@/types/user'
import type { DentalService } from '@/types/dentalServiceCatalog'
import {
  DEFAULT_ODONTOLOGY_CONSULTATION_CUPS,
  ODONTOLOGY_FOLLOWUP_CONSULTATION_CUPS,
  OPERATIVE_RESTORATION_CUPS,
} from '@/constants/rips'
import { ALL_TEETH_NUMBERS } from '@/constants/dental'
import {
  createEmptyOrthodonticsBudget,
  createEmptyDentalImplantsBudget,
} from '@/utils/budget'
import { generateId, getPatientByRouteId, toPatientForeignKey } from '@/utils'
import { buildRecordHashPayload } from '@/utils/recordIntegrity'
import { computeContentHash, serializeForHash } from '@/utils/crypto'
import { finalizeEvolutionNotes } from '@/services/evolutionNoteService'
import { createAutoPaymentInvoice } from '@/services/paymentInvoiceService'
import {
  buildInvoiceDraftFromClinicalRecord,
  compileInvoiceRipsPackage,
} from '@/services/invoiceService'
import { createCatalogLookupFromServices } from '@/utils/ripsCompiler'
import { dentalServiceSpecialtyId } from '@/utils/organizationId'

const DEMO_PROFESSIONAL_ID = 'user-demo-001'
const CLINIC_NIT = '900123456'
const TATTOO_SERVICE_ID = `svc:${CLINIC_NIT}:TATUAJE_DENTAL`

const CIE10_K021: Cie10Diagnosis = {
  code: 'K02.1',
  description: 'Caries de la dentina',
  type: 'principal',
  certainty: 'confirmado',
  source: 'manual',
  affectedTeeth: [16],
}

const CUPS_PROFILAXIS = '997001'
const CUPS_RESINA = OPERATIVE_RESTORATION_CUPS.resinaFotocurado
const CUPS_CONTROL = ODONTOLOGY_FOLLOWUP_CONSULTATION_CUPS

const PRICE_PROFILAXIS = 80_000
const PRICE_RESINA = 180_000
const PRICE_TATTOO = 150_000

const SEED_SIGNATURE_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMTYwIj48cGF0aCBkPSJNMjAgODAgQzgwIDIwLCAxMjAgMTQwLCAyMDAgNzAgUzMyMCA0MCwgMzgwIDkwIiBmaWxsPSJub25lIiBzdHJva2U9IiMwZjE3MmEiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+'

export const TEST_SEED_MARKER = '[SEED-TEST]'

export type TestSeedCaseId = 'A' | 'B' | 'C'

export interface TestSeedPatientSpec {
  caseId: TestSeedCaseId
  documentType: Patient['documentType']
  documentNumber: string
  firstName: string
  lastName: string
  birthDate: string
  gender: Patient['gender']
  regime: NonNullable<Patient['regime']>
  insurer: string
  occupation: string
}

export const TEST_SEED_PATIENTS: TestSeedPatientSpec[] = [
  {
    caseId: 'A',
    documentType: 'CC',
    documentNumber: '52987654',
    firstName: 'Camila Andrea',
    lastName: 'Herrera Soto',
    birthDate: '1992-03-14',
    gender: 'F',
    regime: 'particular',
    insurer: 'Particular',
    occupation: `${TEST_SEED_MARKER} Caso A — Atención estándar CUPS`,
  },
  {
    caseId: 'B',
    documentType: 'TI',
    documentNumber: '1090123456',
    firstName: 'Juan Esteban',
    lastName: 'Morales Díaz',
    birthDate: '2013-07-22',
    gender: 'M',
    regime: 'contributivo',
    insurer: 'EPS Sura',
    occupation: `${TEST_SEED_MARKER} Caso B — Control $0 no facturable`,
  },
  {
    caseId: 'C',
    documentType: 'CC',
    documentNumber: '80123456',
    firstName: 'Ricardo José',
    lastName: 'Peña Vargas',
    birthDate: '1988-11-05',
    gender: 'M',
    regime: 'particular',
    insurer: 'Particular',
    occupation: `${TEST_SEED_MARKER} Caso C — Atención mixta CUPS + personalizado`,
  },
]

export interface SeedTestDataResult {
  skipped: boolean
  reason?: string
  patients: Array<{
    caseId: TestSeedCaseId
    patientId: string
    document: string
    recordId: string
    invoiceId?: string
    invoiceNumber?: string
  }>
  errors?: string[]
}

export interface SeedTestDataOptions {
  /** Borra historias/odontogramas de prueba y vuelve a insertarlos (no elimina FEV inmutables). */
  replace?: boolean
  /** Profesional autenticado (puede no existir en Dexie si la sesión es API/superadmin). */
  professional?: UserProfile | null
}

function signatureMeta(now: string) {
  return {
    signatureMethod: 'canvas_biometric' as const,
    strokeCount: 8,
    captureStartedAt: now,
    captureEndedAt: now,
    canvasWidth: 400,
    canvasHeight: 160,
  }
}

function serviceIdForCups(cupsCode: string): string {
  return `svc:${CLINIC_NIT}:${cupsCode}`
}

function withSeedBillingDefaults(user: UserProfile): UserProfile {
  return {
    ...user,
    clinicName: user.clinicName?.trim() || 'Clínica Dental Sonrisa',
    professionalLicense: user.professionalLicense?.trim() || 'OD-12345',
    providerNit: user.providerNit?.trim() || '900123456-1',
    repsCode: user.repsCode?.trim() || '500000000001',
    documentType: user.documentType || 'CC',
    documentNumber:
      user.documentNumber && user.documentNumber !== '0000000000'
        ? user.documentNumber
        : '1234567890',
  }
}

async function resolveSeedProfessional(
  preferred?: UserProfile | null,
): Promise<UserProfile | undefined> {
  if (preferred?.id) {
    try {
      const stored = await db.users.get(preferred.id)
      if (stored) return withSeedBillingDefaults(stored)
    } catch {
      // La sesión API/superadmin no vive en la tabla Dexie `users`.
    }
    return withSeedBillingDefaults(preferred)
  }

  const demo = await db.users.get(DEMO_PROFESSIONAL_ID)
  if (demo) return withSeedBillingDefaults(demo)

  const users = await db.users.toArray()
  const ranked =
    users.find((user) => user.role === 'odontologo') ??
    users.find((user) => user.role === 'admin' || user.role === 'superadmin') ??
    users[0]
  return ranked ? withSeedBillingDefaults(ranked) : undefined
}

async function findPatientByDocument(documentNumber: string): Promise<Patient | undefined> {
  return db.patients.where('documentNumber').equals(documentNumber).first()
}

function buildAnamnesis(chiefComplaint: string, currentIllness: string) {
  return {
    ...createEmptyAnamnesis(),
    chiefComplaint,
    currentIllness,
    allergiesNoReporta: true,
    systemicDiseasesNoReporta: true,
    currentMedicationsNoReporta: true,
    dentalHistoryNoReporta: false,
    dentalHistory: 'Atenciones odontológicas previas de operatoria.',
    familyHistoryNoReporta: true,
  }
}

function buildCatalogService(partial: Omit<EvolutionCatalogService, 'id'> & { id?: string }): EvolutionCatalogService {
  return {
    id: partial.id ?? generateId(),
    ...partial,
  }
}

function buildOdontogramWithCaries(patientId: string, now: string): OdontogramData {
  const odontogram = createDefaultOdontogram(patientId, ALL_TEETH_NUMBERS, 'permanente')
  return {
    ...odontogram,
    isInitialState: false,
    updatedAt: now,
    teeth: odontogram.teeth.map((tooth) =>
      tooth.number === 16
        ? { ...tooth, faces: { ...tooth.faces, oclusal: 'caries' } }
        : tooth,
    ),
  }
}

function buildTreatmentItems(
  items: Array<{
    phase: TreatmentPlanItem['phase']
    procedure: string
    cupsCode?: string
    toothNumber?: number
    quantity: number
    unitPrice: number
  }>,
  sessionDate: string,
): TreatmentPlanItem[] {
  return items.map((item) => ({
    id: generateId(),
    phase: item.phase,
    procedure: item.procedure,
    cupsCode: item.cupsCode,
    toothNumber: item.toothNumber,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    patientApproved: 'aprobado',
    executionStatus: 'completado',
    sessionDate,
    source: 'manual',
    diagnosisCode: CIE10_K021.code,
    diagnosisDescription: CIE10_K021.description,
  }))
}

function buildPayment(amount: number, reason: string, cupsCode: string, professional: UserProfile, now: string): PaymentRecord {
  const paymentDate = now.slice(0, 10)
  return {
    id: generateId(),
    paymentDate,
    amount,
    paymentMethod: 'contado',
    paymentReason: reason,
    cupsCode,
    treatingDentistUserId: professional.id,
    treatingDentistName: `${professional.firstName} ${professional.lastName}`,
    invoices: [
      createAutoPaymentInvoice({
        paymentDate,
        amount,
        paymentReason: reason,
        userId: professional.id,
      }),
    ],
    notes: `${TEST_SEED_MARKER} Pago de prueba para impresión de factura`,
  }
}

function buildUnsignedEvolution(params: {
  date: string
  createdAt: string
  professional: UserProfile
  procedure: string
  clinicalNote: string
  catalogServices: EvolutionCatalogService[]
  cupsCode?: string | null
  cost?: number
  isBillable?: boolean
  requiereCupsRips?: boolean
  dentalServiceId?: string
  serviceName?: string
}): EvolutionNote {
  const { professional, createdAt } = params
  return {
    id: generateId(),
    kind: 'evolution',
    date: params.date,
    procedure: params.procedure,
    anesthesia: { type: 'Lidocaína 2% con epinefrina', carpules: 1, vasoconstrictor: 'Epinefrina 1:80.000' },
    prescriptions: 'Ibuprofeno 400 mg cada 8 h por 3 días si hay dolor.',
    professionalName: `${professional.firstName} ${professional.lastName}`,
    professionalLicense: professional.professionalLicense ?? 'OD-12345',
    authorUserId: professional.id,
    authorEmail: professional.email,
    createdAt,
    catalogServices: params.catalogServices,
    dentalServiceId: params.dentalServiceId,
    serviceName: params.serviceName,
    requiereCupsRips: params.requiereCupsRips,
    clinicalNote: params.clinicalNote,
    cupsCode: params.cupsCode,
    cost: params.cost,
    isBillable: params.isBillable,
    professionalSignatureDataUrl: SEED_SIGNATURE_DATA_URL,
    professionalSignatureMeta: signatureMeta(createdAt),
  }
}

async function ensureTariffPrices(professionalId: string): Promise<void> {
  const existing = await db.prices.where('userId').equals(professionalId).toArray()
  const byCups = new Set(existing.map((item) => item.cupsCode))

  const tariffs: Array<{ cupsCode: string; procedure: string; price: number; category?: string }> = [
    {
      cupsCode: CUPS_PROFILAXIS,
      procedure: 'Profilaxis dental o pulido coronal',
      price: PRICE_PROFILAXIS,
    },
    {
      cupsCode: CUPS_RESINA,
      procedure: 'Obturación dental con resina de fotocurado',
      price: PRICE_RESINA,
    },
    {
      cupsCode: CUPS_CONTROL,
      procedure: 'Consulta de control o de seguimiento por odontología general',
      price: 0,
    },
    {
      cupsCode: DEFAULT_ODONTOLOGY_CONSULTATION_CUPS,
      procedure: 'Consulta de primera vez por odontología general',
      price: 90_000,
    },
  ]

  for (const tariff of tariffs) {
    if (byCups.has(tariff.cupsCode)) continue
    await db.prices.add({
      id: generateId(),
      userId: professionalId,
      procedure: tariff.procedure,
      cupsCode: tariff.cupsCode,
      price: tariff.price,
      currency: 'COP',
      category: tariff.category,
    })
  }
}

async function ensureCupsDentalService(params: {
  cupsCode: string
  name: string
  category: DentalService['category']
  defaultPrice: number
  requiereCupsRips: boolean
}): Promise<string> {
  const id = serviceIdForCups(params.cupsCode)
  const existing = await db.dentalServices.get(id)
  if (existing) return id

  const now = new Date().toISOString()
  await db.dentalServices.add({
    id,
    organizationId: CLINIC_NIT,
    internalCode: params.cupsCode,
    name: params.name,
    description: `${TEST_SEED_MARKER} ${params.name}`,
    category: params.category,
    cupsCode: params.cupsCode,
    requiereCupsRips: params.requiereCupsRips,
    cupsHomologo: null,
    defaultPrice: params.defaultPrice,
    currency: 'COP',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  })

  const specialtyId = dentalServiceSpecialtyId(id, 'odontologia_general')
  const specialty = await db.dentalServiceSpecialties.get(specialtyId)
  if (!specialty) {
    await db.dentalServiceSpecialties.add({
      id: specialtyId,
      serviceId: id,
      rehusSpecialtyId: 'odontologia_general',
      createdAt: now,
    })
  }

  return id
}

async function ensureCustomTattooService(): Promise<string> {
  const existing = await db.dentalServices.get(TATTOO_SERVICE_ID)
  if (existing) return TATTOO_SERVICE_ID

  const now = new Date().toISOString()
  await db.dentalServices.add({
    id: TATTOO_SERVICE_ID,
    organizationId: CLINIC_NIT,
    internalCode: 'TATUAJE_DENTAL',
    name: 'Tatuaje Dental',
    description: 'Procedimiento estético sin código CUPS obligatorio para RIPS.',
    category: 'otro',
    cupsCode: null,
    requiereCupsRips: false,
    cupsHomologo: null,
    defaultPrice: PRICE_TATTOO,
    currency: 'COP',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  })
  await db.dentalServiceSpecialties.add({
    id: dentalServiceSpecialtyId(TATTOO_SERVICE_ID, 'odontologia_general'),
    serviceId: TATTOO_SERVICE_ID,
    rehusSpecialtyId: 'odontologia_general',
    createdAt: now,
  })
  return TATTOO_SERVICE_ID
}

async function upsertPatient(spec: TestSeedPatientSpec, now: string): Promise<string> {
  const existing = await findPatientByDocument(spec.documentNumber)
  const payload: Patient = {
    documentType: spec.documentType,
    documentNumber: spec.documentNumber,
    firstName: spec.firstName,
    lastName: spec.lastName,
    birthDate: spec.birthDate,
    gender: spec.gender,
    phone: spec.caseId === 'B' ? '3105550102' : spec.caseId === 'C' ? '3205550103' : '3005550101',
    email: `seed.caso.${spec.caseId.toLowerCase()}@pruebas.local`,
    address: 'Calle 127 # 15-20 Consultorio 301',
    city: 'Bogotá D.C.',
    insurer: spec.insurer,
    regime: spec.regime,
    municipalityCode: '11001',
    occupation: spec.occupation,
    phase: 'TRATAMIENTO_ACEPTADO',
    valuationOnly: false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  if (existing?.id != null) {
    await db.patients.update(existing.id, payload)
    return toPatientForeignKey(existing.id)
  }

  const id = await db.patients.add(payload)
  if (id == null) {
    throw new Error(`No se pudo crear el paciente de prueba ${spec.documentType} ${spec.documentNumber}.`)
  }
  return toPatientForeignKey(id)
}

async function replacePatientClinicalData(patientId: string): Promise<void> {
  const records = await db.clinicalRecords.where('patientId').equals(patientId).toArray()
  for (const record of records) {
    if (record.id != null) await db.clinicalRecords.delete(record.id)
  }

  const odontograms = await db.odontograms.where('patientId').equals(patientId).toArray()
  for (const odontogram of odontograms) {
    if (odontogram.id != null) await db.odontograms.delete(odontogram.id)
  }

  await db.patientClinicalDrafts.delete(patientId)
}

function buildCaseAEvolution(professional: UserProfile, now: string, profilaxisServiceId: string, resinaServiceId: string): EvolutionNote {
  const services = [
    buildCatalogService({
      dentalServiceId: profilaxisServiceId,
      serviceName: 'Profilaxis dental o pulido coronal',
      procedure: 'Profilaxis dental o pulido coronal',
      cupsCode: CUPS_PROFILAXIS,
      requiereCupsRips: true,
      cost: PRICE_PROFILAXIS,
      isBillable: true,
    }),
    buildCatalogService({
      dentalServiceId: resinaServiceId,
      serviceName: 'Obturación dental con resina de fotocurado',
      procedure: 'Obturación dental con resina de fotocurado — pieza 16',
      cupsCode: CUPS_RESINA,
      requiereCupsRips: true,
      cost: PRICE_RESINA,
      isBillable: true,
    }),
  ]

  return buildUnsignedEvolution({
    date: `${now.slice(0, 10)}T09:30`,
    createdAt: now,
    professional,
    procedure: services.map((service) => service.serviceName || service.procedure).join(' · '),
    clinicalNote:
      'Se realiza profilaxis y obturación en resina de fotocurado en pieza 16 por caries de dentina (CIE-10 K02.1 / K021). Atención facturable con dos procedimientos CUPS.',
    catalogServices: services,
    cupsCode: CUPS_PROFILAXIS,
    cost: PRICE_PROFILAXIS + PRICE_RESINA,
    isBillable: true,
    requiereCupsRips: true,
    dentalServiceId: profilaxisServiceId,
    serviceName: services[0]?.serviceName,
  })
}

function buildCaseBEvolution(professional: UserProfile, now: string, controlServiceId: string): EvolutionNote {
  const services = [
    buildCatalogService({
      dentalServiceId: controlServiceId,
      serviceName: 'Consulta de control o de seguimiento por odontología general',
      procedure: 'Consulta de control o de seguimiento por odontología general',
      cupsCode: CUPS_CONTROL,
      requiereCupsRips: true,
      cost: 0,
      isBillable: false,
    }),
  ]

  return buildUnsignedEvolution({
    date: `${now.slice(0, 10)}T11:00`,
    createdAt: now,
    professional,
    procedure: services[0]!.procedure,
    clinicalNote:
      'Control postoperatorio sin cobro (garantía). Se reporta CUPS 890303 en RIPS con vrServicio 0. No genera FEV DIAN (isBillable: false).',
    catalogServices: services,
    cupsCode: CUPS_CONTROL,
    cost: 0,
    isBillable: false,
    requiereCupsRips: true,
    dentalServiceId: controlServiceId,
    serviceName: services[0]?.serviceName,
  })
}

function buildCaseCEvolution(
  professional: UserProfile,
  now: string,
  resinaServiceId: string,
  tattooServiceId: string,
): EvolutionNote {
  const services = [
    buildCatalogService({
      dentalServiceId: resinaServiceId,
      serviceName: 'Obturación dental con resina de fotocurado',
      procedure: 'Obturación dental con resina de fotocurado — pieza 16',
      cupsCode: CUPS_RESINA,
      requiereCupsRips: true,
      cost: PRICE_RESINA,
      isBillable: true,
    }),
    buildCatalogService({
      dentalServiceId: tattooServiceId,
      serviceName: 'Tatuaje Dental',
      procedure: 'Tatuaje Dental — procedimiento estético personalizado',
      cupsCode: null,
      requiereCupsRips: false,
      cost: PRICE_TATTOO,
      isBillable: true,
    }),
  ]

  return buildUnsignedEvolution({
    date: `${now.slice(0, 10)}T14:15`,
    createdAt: now,
    professional,
    procedure: services.map((service) => service.serviceName || service.procedure).join(' · '),
    clinicalNote:
      'Atención mixta: obturación CUPS 232102 (RIPS + DIAN) y Tatuaje Dental personalizado (isCustomProcedure: true, solo DIAN, excluido de RIPS).',
    catalogServices: services,
    cupsCode: CUPS_RESINA,
    cost: PRICE_RESINA + PRICE_TATTOO,
    isBillable: true,
    dentalServiceId: resinaServiceId,
    serviceName: services[0]?.serviceName,
  })
}

async function persistSignedRecord(params: {
  patientId: string
  professional: UserProfile
  now: string
  anamnesis: ReturnType<typeof buildAnamnesis>
  findings: string
  diagnosisNotes: string
  treatmentPlan: TreatmentPlanItem[]
  evolutionDraft: EvolutionNote
  paymentControl: PaymentRecord[]
  odontogram: OdontogramData
}): Promise<ClinicalRecord> {
  const signedNotes = await finalizeEvolutionNotes([params.evolutionDraft], params.now)
  const professionalLicense = params.professional.professionalLicense ?? 'OD-12345'

  const record: ClinicalRecord = {
    patientId: params.patientId,
    professionalId: params.professional.id,
    anamnesis: params.anamnesis,
    stomatologicalExam: createEmptyStomatologicalExam(),
    specializedAnnexes: createEmptySpecializedAnnexes(),
    diagnosticChart: {
      ...createEmptyClinicalDiagnosticChart(),
      entries: [
        {
          dienteId: '16',
          diagnosisCode: CIE10_K021.code,
          diagnosisDescription: CIE10_K021.description,
          color: '#EF4444',
        },
      ],
      notes: 'Caries de dentina en 16 — datos de prueba.',
    },
    odontogramSnapshot: params.odontogram,
    diagnoses: [{ ...CIE10_K021 }],
    diagnosisNotes: params.diagnosisNotes,
    findings: params.findings,
    treatmentPlan: params.treatmentPlan,
    treatmentPlanNotes: `${TEST_SEED_MARKER} Plan ejecutado en la atención de prueba.`,
    budgetItems: [],
    orthodonticsBudget: createEmptyOrthodonticsBudget(),
    dentalImplantsBudget: createEmptyDentalImplantsBudget(),
    budget: { subtotal: 0, discount: 0, total: 0, currency: 'COP' },
    paymentPlan: [],
    paymentControl: params.paymentControl,
    orthodonticsPaymentControl: [],
    evolutionNotes: signedNotes,
    informedConsent: {
      ...createEmptyConsent(professionalLicense, professionalLicense),
      selectedConsentIds: ['operatoria_dental', 'general_odonto'],
      textAccepted: true,
      professionalSignatureDataUrl: SEED_SIGNATURE_DATA_URL,
      professionalSignatureMeta: signatureMeta(params.now),
      patientSignatureDataUrl: SEED_SIGNATURE_DATA_URL,
      patientSignatureMeta: signatureMeta(params.now),
      signedAt: params.now,
    },
    isLocked: true,
    signedAt: params.now,
    createdAt: params.now,
    updatedAt: params.now,
  }

  record.contentHash = await computeContentHash(serializeForHash(buildRecordHashPayload(record)))
  const recordId = await db.clinicalRecords.add(record)
  return { ...record, id: recordId }
}

async function persistElectronicInvoice(params: {
  caseId: TestSeedCaseId
  patient: Patient
  record: ClinicalRecord
  professional: UserProfile
  dentalServices: DentalService[]
}): Promise<{ id: string; invoiceNumber: string } | undefined> {
  if (params.caseId === 'B') return undefined

  const invoiceNumber = params.caseId === 'A' ? 'FV0001' : 'FV0003'
  const invoiceId = `seed-test-invoice-caso-${params.caseId.toLowerCase()}`
  const existing = await db.electronicInvoices.get(invoiceId)
  if (existing && existing.status !== 'draft') {
    return { id: existing.id, invoiceNumber: existing.invoiceNumber }
  }

  const catalogLookup = createCatalogLookupFromServices(params.dentalServices)
  const draft = buildInvoiceDraftFromClinicalRecord({
    patientId: String(params.patient.id ?? ''),
    clinicalRecordId: params.record.id ?? '',
    patient: params.patient,
    record: params.record,
    professional: params.professional,
    invoiceNumber,
    catalogLookup,
    includeConsultation: false,
  })

  const compiled = compileInvoiceRipsPackage(
    draft,
    [{ record: params.record, patient: params.patient }],
    params.professional,
    catalogLookup,
  )

  const invoice = {
    ...draft,
    id: invoiceId,
    ripsJson: compiled.rips,
    ripsReportableTotal: compiled.ripsReportableTotal,
    ripsExcludedLineCount: compiled.excludedLineCount,
  }

  try {
    await db.electronicInvoices.put(invoice)
  } catch (error) {
    console.warn(`[seed-test-data] No se pudo guardar FEV ${invoiceNumber}:`, error)
    return existing ? { id: existing.id, invoiceNumber: existing.invoiceNumber } : undefined
  }

  return { id: invoice.id, invoiceNumber: invoice.invoiceNumber }
}

/**
 * Inserta los 3 pacientes de demo (casos A/B/C).
 * El arranque automático en `seedDemoData` no llama esta función si
 * `localStorage.has_cleared_test_data === 'true'`.
 */
export async function seedTestClinicalAndBillingData(
  options: SeedTestDataOptions = {},
): Promise<SeedTestDataResult> {
  const professional = await resolveSeedProfessional(options.professional)
  if (!professional) {
    return {
      skipped: true,
      reason: 'No hay un profesional en sesión ni en la base local para firmar las historias.',
      patients: [],
    }
  }

  const existingDocs = await Promise.all(
    TEST_SEED_PATIENTS.map((spec) => findPatientByDocument(spec.documentNumber)),
  )
  const allPresent = existingDocs.every(Boolean)

  if (allPresent && !options.replace) {
    return {
      skipped: true,
      reason: 'Los pacientes de prueba ya existen. Use { replace: true } para regenerarlos.',
      patients: existingDocs.map((patient, index) => ({
        caseId: TEST_SEED_PATIENTS[index]!.caseId,
        patientId: String(patient?.id ?? ''),
        document: `${TEST_SEED_PATIENTS[index]!.documentType} ${TEST_SEED_PATIENTS[index]!.documentNumber}`,
        recordId: '',
      })),
    }
  }

  await ensureTariffPrices(professional.id)
  const [profilaxisServiceId, resinaServiceId, controlServiceId, tattooServiceId] = await Promise.all([
    ensureCupsDentalService({
      cupsCode: CUPS_PROFILAXIS,
      name: 'Profilaxis dental o pulido coronal',
      category: 'preventivo',
      defaultPrice: PRICE_PROFILAXIS,
      requiereCupsRips: true,
    }),
    ensureCupsDentalService({
      cupsCode: CUPS_RESINA,
      name: 'Obturación dental con resina de fotocurado',
      category: 'operatoria',
      defaultPrice: PRICE_RESINA,
      requiereCupsRips: true,
    }),
    ensureCupsDentalService({
      cupsCode: CUPS_CONTROL,
      name: 'Consulta de control o de seguimiento por odontología general',
      category: 'consulta',
      defaultPrice: 0,
      requiereCupsRips: true,
    }),
    ensureCustomTattooService(),
  ])

  const now = new Date().toISOString()
  const results: SeedTestDataResult['patients'] = []
  const errors: string[] = []

  for (const spec of TEST_SEED_PATIENTS) {
    try {
    const patientId = await upsertPatient(spec, now)
    if (options.replace || allPresent === false) {
      await replacePatientClinicalData(patientId)
    }

    const odontogram = buildOdontogramWithCaries(patientId, now)
    await db.odontograms.add(odontogram)

    const sessionDate = now.slice(0, 10)
    let evolutionDraft: EvolutionNote
    let treatmentPlan: TreatmentPlanItem[]
    let paymentControl: PaymentRecord[]
    let findings: string
    let diagnosisNotes: string
    let anamnesis: ReturnType<typeof buildAnamnesis>

    if (spec.caseId === 'A') {
      evolutionDraft = buildCaseAEvolution(professional, now, profilaxisServiceId, resinaServiceId)
      treatmentPlan = buildTreatmentItems(
        [
          {
            phase: 'fase_i',
            procedure: 'Profilaxis dental o pulido coronal',
            cupsCode: CUPS_PROFILAXIS,
            quantity: 1,
            unitPrice: PRICE_PROFILAXIS,
          },
          {
            phase: 'fase_ii',
            procedure: 'Obturación dental con resina de fotocurado',
            cupsCode: CUPS_RESINA,
            toothNumber: 16,
            quantity: 1,
            unitPrice: PRICE_RESINA,
          },
        ],
        sessionDate,
      )
      paymentControl = [
        buildPayment(
          PRICE_PROFILAXIS + PRICE_RESINA,
          'Pago atención estándar — profilaxis + resina 16',
          CUPS_RESINA,
          professional,
          now,
        ),
      ]
      anamnesis = buildAnamnesis(
        'Dolor al frío en molar superior derecho',
        'Caries de dentina en pieza 16 con sensibilidad térmica. Se indica profilaxis y restauración en resina.',
      )
      findings = 'Caries oclusal de dentina en 16. Higiene regular.'
      diagnosisNotes = 'Diagnóstico principal CIE-10 K02.1 (K021) — Caries de la dentina.'
    } else if (spec.caseId === 'B') {
      evolutionDraft = buildCaseBEvolution(professional, now, controlServiceId)
      treatmentPlan = buildTreatmentItems(
        [
          {
            phase: 'fase_iv',
            procedure: 'Consulta de control o de seguimiento por odontología general',
            cupsCode: CUPS_CONTROL,
            quantity: 1,
            unitPrice: 0,
          },
        ],
        sessionDate,
      )
      paymentControl = []
      anamnesis = buildAnamnesis(
        'Control de tratamiento previo, sin molestias',
        'Paciente cotizante en control de garantía. No se cobra tarifa (isBillable: false, costo $0).',
      )
      findings = 'Tejidos en buen estado. Control clínico sin procedimientos operatorios.'
      diagnosisNotes = 'Control de caries de dentina tratada — CIE-10 K02.1 (K021).'
    } else {
      evolutionDraft = buildCaseCEvolution(professional, now, resinaServiceId, tattooServiceId)
      treatmentPlan = buildTreatmentItems(
        [
          {
            phase: 'fase_ii',
            procedure: 'Obturación dental con resina de fotocurado',
            cupsCode: CUPS_RESINA,
            toothNumber: 16,
            quantity: 1,
            unitPrice: PRICE_RESINA,
          },
          {
            phase: 'fase_iv',
            procedure: 'Tatuaje Dental',
            quantity: 1,
            unitPrice: PRICE_TATTOO,
          },
        ],
        sessionDate,
      )
      paymentControl = [
        buildPayment(
          PRICE_RESINA + PRICE_TATTOO,
          'Pago atención mixta — resina CUPS + tatuaje personalizado',
          CUPS_RESINA,
          professional,
          now,
        ),
      ]
      anamnesis = buildAnamnesis(
        'Caries en molar y solicitud de tatuaje dental estético',
        'Se combina procedimiento asistencial CUPS con servicio personalizado no RIPS (isCustomProcedure).',
      )
      findings = 'Caries de dentina en 16. Procedimiento estético adicional sin CUPS.'
      diagnosisNotes = 'CIE-10 K02.1 (K021) para el procedimiento CUPS. El tatuaje se factura solo en DIAN.'
    }

    const record = await persistSignedRecord({
      patientId,
      professional,
      now,
      anamnesis,
      findings,
      diagnosisNotes,
      treatmentPlan,
      evolutionDraft,
      paymentControl,
      odontogram,
    })

    const patient = await getPatientByRouteId(patientId)
    const dentalServices = await db.dentalServices.toArray()
    const invoice =
      patient != null
        ? await persistElectronicInvoice({
            caseId: spec.caseId,
            patient,
            record,
            professional,
            dentalServices,
          })
        : undefined

    results.push({
      caseId: spec.caseId,
      patientId,
      document: `${spec.documentType} ${spec.documentNumber}`,
      recordId: String(record.id ?? ''),
      invoiceId: invoice?.id,
      invoiceNumber: invoice?.invoiceNumber,
    })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`Caso ${spec.caseId}: ${message}`)
      console.error(`[seed-test-data] Caso ${spec.caseId}`, error)
    }
  }

  console.info('[seed-test-data] Pacientes y atenciones de prueba insertados:', results)
  return {
    skipped: false,
    patients: results,
    errors: errors.length ? errors : undefined,
    reason: errors.length && results.length === 0 ? errors.join(' ') : undefined,
  }
}

declare global {
  interface Window {
    seedTestClinicalAndBillingData?: (options?: SeedTestDataOptions) => Promise<SeedTestDataResult>
  }
}

if (typeof window !== 'undefined') {
  window.seedTestClinicalAndBillingData = seedTestClinicalAndBillingData
}

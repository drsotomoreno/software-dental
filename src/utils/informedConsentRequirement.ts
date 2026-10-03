import { isFirstVisitConsultationCups } from '@/constants/rips'
import type { InformedConsent } from '@/types/consent'
import type {
  BudgetLineItem,
  DentalImplantsBudget,
  OrthodonticsBudget,
  TreatmentPlanItem,
} from '@/types/clinicalRecord'
import { isEvolutionNoteAddendum, type EvolutionNote } from '@/types/evolutionNote'
import { MIN_SIGNATURE_STROKES, type SignatureCaptureMetadata } from '@/types/signature'
import {
  calcDentalImplantsBudgetTotal,
  calcOrthodonticsBudgetTotal,
} from '@/utils/budget'

/** Regla de atención: este procedimiento no exige consentimiento informado firmado. */
export const FIRST_VISIT_CONSULTATION_CONSENT_NOTICE =
  'Las consultas de primera vez no requieren firma de consentimiento informado. No se exige para este tipo de procedimiento.'

export interface ConsentProcedureRef {
  procedure?: string | null
  cupsCode?: string | null
}

export interface InformedConsentRequirementInput {
  treatmentPlan?: Array<Pick<TreatmentPlanItem, 'procedure' | 'cupsCode'>>
  budgetItems?: Array<Pick<BudgetLineItem, 'procedure' | 'cupsCode'>>
  evolutionNotes?: EvolutionNote[]
  orthodonticsBudget?: OrthodonticsBudget
  dentalImplantsBudget?: DentalImplantsBudget
  informedConsent: InformedConsent
}

function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

function resolveProcedureCups(input: ConsentProcedureRef): string | null {
  const direct = String(input.cupsCode ?? '').replace(/\D/g, '')
  if (direct.length === 6) return direct

  const text = String(input.procedure ?? '')
  const compact = text.match(/\b(\d{6})\b/)
  if (compact) return compact[1]

  const dotted = text.match(/\b(\d{2})\.(\d)\.(\d)\.(\d{2})\b/)
  if (dotted) return `${dotted[1]}${dotted[2]}${dotted[3]}${dotted[4]}`

  return null
}

/** Consulta de primera vez por CUPS 89.0.2 o por el nombre del procedimiento. */
export function isFirstVisitConsultationProcedure(input: ConsentProcedureRef): boolean {
  const cups = resolveProcedureCups(input)
  if (cups) return isFirstVisitConsultationCups(cups)

  const name = foldText(String(input.procedure ?? ''))
  return /\bconsultas?\s+de\s+primera\s+vez\b/.test(name)
}

function pushProcedure(list: ConsentProcedureRef[], input: ConsentProcedureRef) {
  const procedure = input.procedure?.trim() ?? ''
  const cupsCode = input.cupsCode?.trim() ?? ''
  if (!procedure && !cupsCode) return
  list.push({ procedure, cupsCode })
}

function collectConsentProcedures(data: InformedConsentRequirementInput): ConsentProcedureRef[] {
  const procedures: ConsentProcedureRef[] = []

  for (const item of data.treatmentPlan ?? []) {
    pushProcedure(procedures, item)
  }
  for (const item of data.budgetItems ?? []) {
    pushProcedure(procedures, item)
  }
  for (const note of data.evolutionNotes ?? []) {
    if (isEvolutionNoteAddendum(note)) continue
    pushProcedure(procedures, note)
    for (const service of note.catalogServices ?? []) {
      pushProcedure(procedures, service)
    }
  }

  if (calcOrthodonticsBudgetTotal(data.orthodonticsBudget) > 0) {
    procedures.push({ procedure: 'Tratamiento de ortodoncia' })
  }
  if (calcDentalImplantsBudgetTotal(data.dentalImplantsBudget) > 0) {
    procedures.push({ procedure: 'Implantes dentales' })
  }

  return procedures
}

/**
 * El consentimiento informado firmado se exige si la atención incluye algún
 * procedimiento distinto de una consulta de primera vez. Si solo hay consultas
 * de primera vez, no se exige.
 */
export function clinicalRecordRequiresInformedConsent(
  data: InformedConsentRequirementInput,
): boolean {
  const procedures = collectConsentProcedures(data)
  if (procedures.length === 0) return true
  return procedures.some((item) => !isFirstVisitConsultationProcedure(item))
}

export function informedConsentCaptureStarted(consent: InformedConsent): boolean {
  return Boolean(
    consent.selectedConsentIds?.length ||
      consent.textAccepted ||
      consent.patientSignatureDataUrl ||
      consent.professionalSignatureDataUrl,
  )
}

function signatureBlocker(
  dataUrl: string | undefined,
  meta: SignatureCaptureMetadata | undefined,
  missingMessage: string,
): string | null {
  if (!dataUrl) return missingMessage
  if (!meta || meta.signatureMethod !== 'canvas_biometric') {
    return 'Solo se aceptan firmas capturadas en el dispositivo.'
  }
  if (meta.strokeCount < MIN_SIGNATURE_STROKES) {
    return 'La firma debe realizarse trazando al menos 5 trazos en el canvas.'
  }
  return null
}

/**
 * Mensaje que impide cerrar la atención, o null si el consentimiento no aplica
 * o ya está completo. Si la atención es solo de primera vez y no se empezó un
 * consentimiento, no bloquea.
 */
export function getInformedConsentSignBlocker(
  data: InformedConsentRequirementInput,
): string | null {
  const consent = data.informedConsent
  const required = clinicalRecordRequiresInformedConsent(data)
  if (!required && !informedConsentCaptureStarted(consent)) return null

  if (!consent.selectedConsentIds?.length) {
    return 'Debe seleccionar al menos un consentimiento informado según el procedimiento.'
  }
  if (!consent.textAccepted) {
    return 'El paciente debe aceptar el consentimiento informado.'
  }

  const patientError = signatureBlocker(
    consent.patientSignatureDataUrl,
    consent.patientSignatureMeta,
    'La firma del paciente es obligatoria.',
  )
  if (patientError) return patientError

  return signatureBlocker(
    consent.professionalSignatureDataUrl,
    consent.professionalSignatureMeta,
    'La firma del profesional es obligatoria.',
  )
}

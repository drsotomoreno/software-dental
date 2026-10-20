import type { BillingValidationIssue } from '@/types/billingAndRips'
import type { ClinicalRecord, ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { EvolutionNote } from '@/types/evolutionNote'
import type { ElectronicInvoice } from '@/types/invoice'
import type { Patient } from '@/types/patient'
import type { DianInvoicePayload } from '@/types/ripsCuv'
import type { RipsTransaction } from '@/types/rips'
import type { UserProfile } from '@/types/user'
import { getBillingModalitySettings } from '@/services/billingModalityService'
import {
  persistEvolutionNoteRipsResult,
  type EvolutionNoteRipsStamp,
} from '@/services/evolutionNoteService'
import { atencionParaMuv } from '@/services/finalizarConsultaMuv'
import {
  buildDianProviderPayload,
  buildInvoiceDraftFromClinicalRecord,
  buildRipsMetadataFromInvoice,
  saveElectronicInvoice,
} from '@/services/invoiceService'
import {
  downloadDianXml,
  routeDictatedEvolutionByFiscalProfile,
  type DictatedEvolutionBillingResult,
} from '@/services/ripsApiService'
import { saveTemporaryRips } from '@/services/ripsTemporalService'
import { isInvoiceItemRipsEligible, buildRipsJson } from '@/utils/buildRipsJson'
import {
  applyClinicalRulesToRips,
  hasBlockingBillingIssues,
  validateClinicalItems,
} from '@/utils/billingRipsRules'
import {
  extractClinicalItemsFromRecord,
  isClinicalItemBillable,
} from '@/utils/clinicalSessionItems'
import { normalizePerfilFiscal, normalizeRipsNumFactura } from '@/utils/fiscalProfile'
import { type RipsSourceRecord } from '@/utils/rips'
import { validateRipsExport } from '@/utils/ripsValidation'

export type EvolutionRipsModo = 'sin_factura' | 'con_factura'

export interface GenerarRipsNotaInput {
  modo: EvolutionRipsModo
  note: EvolutionNote
  patient: Patient
  professional: UserProfile
  form: ClinicalRecordFormData
  clinicalRecordId?: number | string
}

export interface GenerarRipsNotaResult {
  ok: boolean
  message: string
  stamp?: EvolutionNoteRipsStamp
}

const MENSAJE_SIN_VALOR =
  'Esta nota no tiene valor facturable. Puede generar el RIPS sin factura.'

function registroClinico(input: GenerarRipsNotaInput, note: EvolutionNote): ClinicalRecord {
  return {
    ...input.form,
    id: input.clinicalRecordId,
    patientId: String(input.patient.id ?? ''),
    professionalId: input.professional.id,
    evolutionNotes: [note],
    isLocked: false,
    createdAt: note.createdAt,
    updatedAt: new Date().toISOString(),
  }
}

function notaTieneValorFacturable(record: ClinicalRecord, professional: UserProfile, noteId: string) {
  return extractClinicalItemsFromRecord(record, professional, { evolutionNoteIds: [noteId] }).some(
    isClinicalItemBillable,
  )
}

function facturaDeLaNota(
  input: GenerarRipsNotaInput,
  record: ClinicalRecord,
  invoiceNumber: string,
): ElectronicInvoice | null {
  const draft = buildInvoiceDraftFromClinicalRecord({
    patientId: String(input.patient.id ?? record.patientId),
    clinicalRecordId: record.id ?? input.note.id,
    patient: input.patient,
    record: { ...record, budgetItems: [] },
    professional: input.professional,
    invoiceNumber,
    includeConsultation: false,
  })
  const items = draft.items
    .filter((item) => item.sourceType === 'evolution' && item.isBillable !== false && item.totalAmount > 0)
    .map((item, index) => ({ ...item, lineNumber: index + 1 }))
  if (items.length === 0) return null
  const netPayable = items.reduce((sum, item) => sum + item.totalAmount, 0)
  const ripsItems = items.filter(isInvoiceItemRipsEligible)
  return {
    ...draft,
    items,
    subtotal: netPayable,
    netPayable,
    ripsReportableTotal: ripsItems.reduce((sum, item) => sum + item.totalAmount, 0),
    ripsExcludedLineCount: items.length - ripsItems.length,
    evolutionNoteIds: [input.note.id],
  }
}

function compilarConFactura(input: GenerarRipsNotaInput, record: ClinicalRecord) {
  const clinicalItems = extractClinicalItemsFromRecord(record, input.professional, {
    evolutionNoteIds: [input.note.id],
  })
  const issues: BillingValidationIssue[] = validateClinicalItems(clinicalItems)
  const invoiceNumber = `FV${Date.now().toString().slice(-8)}`
  const invoice = facturaDeLaNota(input, record, invoiceNumber)
  if (!invoice) {
    return { invoice: null, rips: null as RipsTransaction | null, dianInvoice: undefined, issues, message: MENSAJE_SIN_VALOR }
  }

  const perfilFiscal = normalizePerfilFiscal(
    input.professional.perfilFiscal ?? getBillingModalitySettings().perfilFiscal,
  )
  const sources: RipsSourceRecord[] = [{ record: { ...record, budgetItems: [], evolutionNotes: [input.note] }, patient: input.patient }]
  const metadata = { ...buildRipsMetadataFromInvoice(invoice, input.professional), perfilFiscal }
  const baseRips = buildRipsJson({
    invoice,
    sources,
    professional: input.professional,
    metadata,
  })
  const { rips } = applyClinicalRulesToRips(baseRips.rips, clinicalItems)
  const ripsPayload: RipsTransaction = {
    ...rips,
    numFactura: normalizeRipsNumFactura(rips.numFactura) ?? invoiceNumber,
  }
  const comoAlerta = (level: string): BillingValidationIssue['level'] =>
    level === 'error' ? 'error' : 'warning'
  issues.push(
    ...baseRips.issues.map((issue) => ({
      level: comoAlerta(issue.level),
      field: issue.field,
      message: issue.message,
    })),
    ...validateRipsExport(ripsPayload, sources, input.professional, metadata).map((issue) => ({
      level: comoAlerta(issue.level),
      field: issue.field,
      message: issue.message,
    })),
  )
  return {
    invoice,
    rips: ripsPayload,
    dianInvoice: buildDianProviderPayload(invoice) as DianInvoicePayload,
    issues,
    message: issues.find((issue) => issue.level === 'error')?.message ?? '',
  }
}

function codigosDe(record: ClinicalRecord, note: EvolutionNote, professional: UserProfile) {
  const items = extractClinicalItemsFromRecord(record, professional, {
    evolutionNoteIds: [note.id],
  })
  const cie10 = [
    ...(record.diagnoses ?? []).map((item) => item.code),
    ...items.map((item) => item.cie10Code),
  ]
  const cups = [
    note.cupsCode,
    ...(note.catalogServices ?? []).map((service) => service.cupsCode),
    ...items.map((item) => item.cupsCode),
  ]
  return { cie10, cups }
}

function interpretar(
  modo: EvolutionRipsModo,
  result: DictatedEvolutionBillingResult,
): GenerarRipsNotaResult {
  if (result.ok && result.route === 'guardarRIPS_Pendiente') {
    const message = result.message || 'Sus RIPS se enviarán mensualmente sin factura.'
    return {
      ok: true,
      message,
      stamp: {
        ripsModo: modo,
        estadoMuv: 'PENDIENTE',
        cuv: null,
        numFactura: null,
        ripsResultadoMensaje: message,
      },
    }
  }

  if (result.estadoMuv === 'APROBADO' || (result.ok && result.route === 'generarFEV_y_RIPS' && result.cuv)) {
    const message =
      result.message ||
      (modo === 'sin_factura' ? 'RIPS sin factura radicado en el MUV.' : 'RIPS con factura radicado.')
    return {
      ok: true,
      message,
      stamp: {
        ripsModo: modo,
        estadoMuv: 'APROBADO',
        cuv: result.cuv ?? null,
        numFactura: result.numFactura ?? null,
        ripsResultadoMensaje: message,
      },
    }
  }

  const message =
    result.error ||
    result.localIssues?.[0]?.message ||
    result.ministryErrors?.[0]?.message ||
    result.message ||
    'No se pudo generar el RIPS.'
  return {
    ok: false,
    message,
    stamp: {
      ripsModo: modo,
      estadoMuv: result.estadoMuv ?? 'RECHAZADO',
      cuv: result.cuv ?? null,
      numFactura: result.numFactura ?? null,
      ripsResultadoMensaje: message,
    },
  }
}

async function guardarResultadoLocal(
  input: GenerarRipsNotaInput,
  stamp: EvolutionNoteRipsStamp | undefined,
) {
  if (!stamp || input.clinicalRecordId == null) return
  try {
    await persistEvolutionNoteRipsResult(input.clinicalRecordId, input.note.id, stamp)
  } catch {
    // La nota en pantalla conserva el resultado aunque IndexedDB no esté disponible.
  }
}

/** Genera el RIPS de una nota firmada por la ruta que eligió el profesional. */
export async function generarRipsDeNota(input: GenerarRipsNotaInput): Promise<GenerarRipsNotaResult> {
  const record = registroClinico(input, input.note)
  const { cie10, cups } = codigosDe(record, input.note, input.professional)
  const metadatos = {
    patientUuid: String(input.patient.id ?? ''),
    clinicalRecordIds: [input.note.id],
    patientDocument: input.patient.documentNumber,
    perfilFiscal: normalizePerfilFiscal(
      input.professional.perfilFiscal ?? getBillingModalitySettings().perfilFiscal,
    ),
  }

  if (input.modo === 'sin_factura') {
    try {
      const result = await routeDictatedEvolutionByFiscalProfile({
        modo: 'sin_factura',
        atencion: atencionParaMuv({
          id: input.note.id,
          record: {
            patientId: record.patientId,
            professionalId: record.professionalId,
            diagnoses: record.diagnoses,
            evolutionNotes: [input.note],
            paymentControl: [],
            orthodonticsPaymentControl: [],
            budget: { subtotal: 0, discount: 0, total: 0, currency: 'COP' },
            signedAt: input.note.signedAt,
          },
          patient: input.patient,
          professional: input.professional,
          signedAt: input.note.signedAt,
        }),
        metadatos,
        cie10,
        cups,
      })
      const interpreted = interpretar('sin_factura', result)
      await guardarResultadoLocal(input, interpreted.stamp)
      return interpreted
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo radicar el RIPS sin factura.'
      return { ok: false, message }
    }
  }

  if (!notaTieneValorFacturable(record, input.professional, input.note.id)) {
    return { ok: false, message: MENSAJE_SIN_VALOR }
  }

  const compiled = compilarConFactura(input, record)
  if (!compiled.invoice || !compiled.rips || !compiled.dianInvoice) {
    return { ok: false, message: compiled.message || MENSAJE_SIN_VALOR }
  }
  if (hasBlockingBillingIssues(compiled.issues)) {
    return { ok: false, message: compiled.message || 'El RIPS de la nota no cumple las validaciones.' }
  }

  try {
    const result = await routeDictatedEvolutionByFiscalProfile({
      modo: 'con_factura',
      rips: compiled.rips,
      invoice: compiled.dianInvoice,
      metadatos: { ...metadatos, esRipsTemporal: false },
      cie10,
      cups,
      clinicalItems: extractClinicalItemsFromRecord(record, input.professional, {
        evolutionNoteIds: [input.note.id],
      }).map((item) => ({ cie10Code: item.cie10Code, cupsCode: item.cupsCode })),
    })
    try {
      if (result.route === 'generarFEV_y_RIPS') {
        await saveElectronicInvoice({
          ...compiled.invoice,
          ripsJson: compiled.rips,
          cuv: result.cuv ?? null,
          cuvRecordId: result.cuvRecordId ?? null,
          status: result.ok && result.cuv ? 'cuv_approved' : compiled.invoice.status,
          updatedAt: new Date().toISOString(),
          submittedAt: result.ok ? new Date().toISOString() : compiled.invoice.submittedAt,
        })
        if (result.dianXml) downloadDianXml(result.dianXml, result.numFactura ?? compiled.invoice.invoiceNumber)
      } else if (result.ok && result.route === 'guardarRIPS_Pendiente') {
        await saveTemporaryRips({
          clinicId: input.professional.clinicId || input.professional.id,
          patientId: String(input.patient.id ?? ''),
          professionalId: input.professional.id,
          clinicalRecordId: input.clinicalRecordId != null ? String(input.clinicalRecordId) : input.note.id,
          numDocumentoIdObligado: compiled.rips.numDocumentoIdObligado,
          numFactura: null,
          perfilFiscal: metadatos.perfilFiscal,
          status: 'pendiente',
          ripsJson: { ...compiled.rips, numFactura: null },
          submittedAt: null,
        })
      }
    } catch {
      // El resultado del ministerio se conserva en la nota aunque falle la copia local.
    }
    const interpreted = interpretar('con_factura', result)
    await guardarResultadoLocal(input, interpreted.stamp)
    return interpreted
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo generar el RIPS con factura.'
    return { ok: false, message }
  }
}

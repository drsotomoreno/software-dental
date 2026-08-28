import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { ElectronicInvoice, InvoiceValidationIssue } from '@/types/invoice'
import { isEvolutionNoteImmutable } from '@/types/evolutionNote'
import type { RipsSourceRecord } from '@/utils/rips'

export interface InvoiceEmissionGateOptions {
  /** Requiere CUV aprobado (emisión DIAN / XML). */
  requireCuv?: boolean
  /** Requiere evoluciones firmadas con SHA-256. */
  requireSignedEvolutions?: boolean
  /** Requiere historia clínica firmada. */
  requireSignedClinicalRecord?: boolean
}

const DEFAULT_GATE: Required<InvoiceEmissionGateOptions> = {
  requireCuv: false,
  requireSignedEvolutions: true,
  requireSignedClinicalRecord: true,
}

export function validateInvoiceEmissionGate(
  invoice: ElectronicInvoice,
  sources: RipsSourceRecord[],
  options: InvoiceEmissionGateOptions = {},
): InvoiceValidationIssue[] {
  const gate = { ...DEFAULT_GATE, ...options }
  const issues: InvoiceValidationIssue[] = []

  if (gate.requireCuv && !invoice.cuv?.trim()) {
    issues.push({
      level: 'error',
      field: 'cuv',
      message:
        'No puede emitir la FEV-Salud sin el CUV del Ministerio de Salud. Radique primero los RIPS en MUV/PISIS.',
    })
  }

  if (gate.requireSignedClinicalRecord) {
    for (const source of sources) {
      const record = source.record as ClinicalRecord
      const recordId = String(record.id ?? '')
      if (!invoice.clinicalRecordIds.includes(recordId)) continue
      if (!record.signedAt?.trim() || !record.isLocked) {
        issues.push({
          level: 'error',
          field: 'clinicalRecordIds',
          message: `La historia clínica ${recordId} debe estar firmada antes de facturar.`,
        })
      }
    }
  }

  if (gate.requireSignedEvolutions && invoice.evolutionNoteIds?.length) {
    const evolutionNotes = sources.flatMap((source) => source.record.evolutionNotes ?? [])
    for (const noteId of invoice.evolutionNoteIds) {
      const note = evolutionNotes.find((entry) => entry.id === noteId)
      if (!note) {
        issues.push({
          level: 'error',
          field: 'evolutionNoteIds',
          message: `No se encontró la nota de evolución vinculada (${noteId}).`,
        })
        continue
      }
      if (!isEvolutionNoteImmutable(note)) {
        issues.push({
          level: 'error',
          field: 'evolutionNoteIds',
          message: `La nota de evolución del ${note.date || note.createdAt} debe estar firmada (SHA-256) antes de emitir la factura.`,
        })
      }
    }
  }

  return issues
}

export function hasBlockingEmissionGateIssues(issues: InvoiceValidationIssue[]): boolean {
  return issues.some((issue) => issue.level === 'error')
}

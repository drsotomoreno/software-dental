/**
 * Relación estricta nota de evolución → RIPS (Res. 2275).
 *
 * La fila de `evolution_notes` es la fuente de verdad clínica.
 * `rips_consultations` y `rips_procedures` son derivados: no pueden
 * persistirse sin `evolution_note_id` apuntando a una nota existente.
 *
 * Cardinalidad por nota:
 * - 0..1 consulta (`rips_consultations`, índice único sobre `evolution_note_id`)
 * - 0..N procedimientos (`rips_procedures`, índice sobre `evolution_note_id`)
 *
 * El folio narrativo embebido en `clinicalRecords.evolutionNotes` (Res. 1995)
 * sigue siendo la nota de la historia. `clinical_evolution_note_id` enlaza
 * ese folio con esta fila relacional cuando ambos representan la misma atención.
 */

export class EvolutionNoteRipsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EvolutionNoteRipsError'
  }
}

export const RIPS_WITHOUT_EVOLUTION_NOTE_MESSAGE =
  'No puede existir un registro RIPS sin una nota de evolución que lo sustente.'

export const RIPS_EVOLUTION_NOTE_TRANSACTION_MESSAGE =
  'La escritura RIPS debe hacerse en una transacción que incluya evolution_notes.'

export const EVOLUTION_NOTE_RIPS_DELETE_TRANSACTION_MESSAGE =
  'Para eliminar una nota de evolución, la transacción debe incluir rips_consultations y rips_procedures.'

export const EVOLUTION_NOTE_RIPS_DELETE_BLOCKED_MESSAGE =
  'No se puede eliminar la nota de evolución mientras existan consultas o procedimientos RIPS que dependan de ella.'

export const EVOLUTION_NOTE_SINGLE_CONSULTATION_MESSAGE =
  'Una nota de evolución solo puede generar una consulta RIPS.'

export const EVOLUTION_NOTE_PROCEDURE_NOT_DECLARED_MESSAGE =
  'El procedimiento RIPS debe corresponder a un CUPS declarado en procedures_cups de la nota de evolución.'

export const EVOLUTION_NOTE_CONSULTATION_NOT_DECLARED_MESSAGE =
  'La nota de evolución no sustenta una consulta RIPS (consultation_cups vacío).'

/** Procedimiento CUPS declarado en la nota. Cada ítem puede originar una fila en `rips_procedures`. */
export interface EvolutionNoteCupsProcedure {
  /** CUPS de 6 dígitos. */
  cups_code: string
  quantity?: number
  tooth_number?: number | null
  fdi_quadrant?: string | null
  arch?: 'superior' | 'inferior' | null
  description?: string
}

/**
 * Colección Dexie `evolution_notes`.
 * Los campos clínicos obligatorios alimentan después el JSON RIPS.
 */
export interface EvolutionNoteRecord {
  id: string
  patient_id: string
  /** Registro clínico (HCE) al que pertenece la atención, si ya existe. */
  clinical_record_id?: string
  /** `EvolutionNote.id` del folio narrativo embebido en la historia. */
  clinical_evolution_note_id?: string
  professional_id?: string
  clinic_id?: string
  /** CIE-10 principal → `codDiagnosticoPrincipal`. */
  main_diagnosis_cie10: string
  /** CIE-10 relacionados → `codDiagnosticoRelacionado*`. Puede ser []. */
  related_diagnoses_cie10: string[]
  /** Finalidad de la atención → `finalidadTecnologiaSalud` (Res. 2275). */
  purpose_of_care: string
  /** Fecha y hora de la atención → `fechaInicioAtencion`. ISO-8601. */
  date_time: string
  /** Procedimientos realizados. Un ítem, una fila potencial en `rips_procedures`. */
  procedures_cups: EvolutionNoteCupsProcedure[]
  /**
   * CUPS de consulta (capítulo 89). Null cuando la nota no genera consulta RIPS.
   * Como máximo una consulta por nota.
   */
  consultation_cups: string | null
  created_at: string
  updated_at: string
}

/** Llave foránea obligatoria hacia `evolution_notes.id`. */
export interface RipsEvolutionNoteForeignKey {
  evolution_note_id: string
}

/** Colección Dexie `rips_consultations`. Como máximo una fila por nota. */
export interface RipsConsultationRecord extends RipsEvolutionNoteForeignKey {
  id: string
  patient_id: string
  /** Copia de `evolution_notes.date_time` al generar el RIPS. */
  fecha_inicio_atencion: string
  /** Copia de `purpose_of_care`. */
  finalidad_tecnologia_salud: string
  /** Copia de `main_diagnosis_cie10`. */
  cod_diagnostico_principal: string
  cod_diagnostico_relacionado_1: string | null
  cod_diagnostico_relacionado_2: string | null
  cod_diagnostico_relacionado_3: string | null
  /** Copia de `consultation_cups`. */
  cod_consulta: string
  vr_servicio: number
  consecutivo: number
  created_at: string
  updated_at: string
}

/** Colección Dexie `rips_procedures`. Varias filas pueden compartir la misma nota. */
export interface RipsProcedureRecord extends RipsEvolutionNoteForeignKey {
  id: string
  patient_id: string
  fecha_inicio_atencion: string
  finalidad_tecnologia_salud: string
  cod_diagnostico_principal: string
  /** Primer CIE-10 relacionado de la nota, si existe. Res. 2275 admite uno en procedimientos. */
  cod_diagnostico_relacionado: string | null
  /** CUPS copiado de un ítem de `procedures_cups`. */
  cod_procedimiento: string
  pieza_dental: number | null
  cuadrante_fdi: string | null
  arcada: 'superior' | 'inferior' | null
  vr_servicio: number
  consecutivo: number
  created_at: string
  updated_at: string
}

export interface EvolutionNoteRipsBundle {
  consultation: RipsConsultationRecord | undefined
  procedures: RipsProcedureRecord[]
}

const CIE10_PATTERN = /^[A-Z][0-9]{2}[0-9A-Z]{0,4}$/
const CUPS_PATTERN = /^\d{6}$/

export function normalizeCie10Code(code: string): string {
  return code.replace(/\./g, '').trim().toUpperCase()
}

export function normalizeCupsCode(code: string): string {
  return code.replace(/\D/g, '')
}

export function requireEvolutionNoteId(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new EvolutionNoteRipsError(RIPS_WITHOUT_EVOLUTION_NOTE_MESSAGE)
  }
  return value.trim()
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new EvolutionNoteRipsError(`La nota de evolución exige ${field}.`)
  }
  return value.trim()
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new EvolutionNoteRipsError(`La nota de evolución exige ${field} como arreglo.`)
  }
  return value
}

function assertCie10(code: string, field: string): string {
  if (!CIE10_PATTERN.test(code)) {
    throw new EvolutionNoteRipsError(`${field} no es un CIE-10 válido (${code}).`)
  }
  return code
}

function assertCups(code: string, field: string): string {
  if (!CUPS_PATTERN.test(code)) {
    throw new EvolutionNoteRipsError(`${field} debe ser un CUPS de 6 dígitos (${code || 'vacío'}).`)
  }
  return code
}

function requireDateTime(value: unknown): string {
  const text = requireText(value, 'date_time')
  if (Number.isNaN(Date.parse(text))) {
    throw new EvolutionNoteRipsError('date_time debe ser una fecha y hora válidas (ISO-8601).')
  }
  return text
}

function normalizeArch(value: unknown, field: string): 'superior' | 'inferior' | null {
  if (value == null || value === '') return null
  if (value === 'superior' || value === 'inferior') return value
  throw new EvolutionNoteRipsError(`${field} solo admite superior, inferior o vacío.`)
}

function normalizeTooth(value: unknown, field: string): number | null {
  if (value == null || value === '') return null
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new EvolutionNoteRipsError(`${field} debe ser un número de pieza FDI.`)
  }
  return value
}

function normalizeProcedure(item: unknown, index: number): EvolutionNoteCupsProcedure {
  if (!item || typeof item !== 'object') {
    throw new EvolutionNoteRipsError(`procedures_cups[${index}] debe describir un procedimiento CUPS.`)
  }
  const row = item as Partial<EvolutionNoteCupsProcedure>
  const field = `procedures_cups[${index}].cups_code`
  const cups = assertCups(normalizeCupsCode(requireText(row.cups_code, field)), field)
  let quantity: number | undefined
  if (row.quantity != null) {
    if (typeof row.quantity !== 'number' || !Number.isInteger(row.quantity) || row.quantity < 1) {
      throw new EvolutionNoteRipsError(`procedures_cups[${index}].quantity debe ser un entero mayor que cero.`)
    }
    quantity = row.quantity
  }
  return {
    cups_code: cups,
    quantity,
    tooth_number: normalizeTooth(row.tooth_number, `procedures_cups[${index}].tooth_number`),
    fdi_quadrant: optionalText(row.fdi_quadrant) ?? null,
    arch: normalizeArch(row.arch, `procedures_cups[${index}].arch`),
    description: optionalText(row.description),
  }
}

export function assertServiceValue(value: unknown): number {
  if (value == null) return 0
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new EvolutionNoteRipsError('vr_servicio debe ser un número mayor o igual que cero.')
  }
  return value
}

/**
 * Normaliza y exige los campos clínicos que después alimentan los RIPS.
 * Lanza `EvolutionNoteRipsError` si la nota no puede ser fuente de verdad.
 */
export function normalizeEvolutionNoteRecord(input: EvolutionNoteRecord): EvolutionNoteRecord {
  if (!input || typeof input !== 'object') {
    throw new EvolutionNoteRipsError('La nota de evolución es obligatoria.')
  }

  const relatedInput = requireArray(input.related_diagnoses_cie10, 'related_diagnoses_cie10')
  const related: string[] = []
  for (const code of relatedInput) {
    if (typeof code !== 'string') {
      throw new EvolutionNoteRipsError('related_diagnoses_cie10 solo admite códigos CIE-10.')
    }
    const normalized = assertCie10(
      normalizeCie10Code(requireText(code, 'related_diagnoses_cie10')),
      'related_diagnoses_cie10',
    )
    if (!related.includes(normalized)) related.push(normalized)
  }

  const procedures = requireArray(input.procedures_cups, 'procedures_cups').map((item, index) =>
    normalizeProcedure(item, index),
  )

  const consultationRaw = input.consultation_cups
  const consultation =
    consultationRaw == null || (typeof consultationRaw === 'string' && consultationRaw.trim() === '')
      ? null
      : assertCups(
          normalizeCupsCode(requireText(consultationRaw, 'consultation_cups')),
          'consultation_cups',
        )

  const now = new Date().toISOString()

  return {
    ...input,
    id: requireText(input.id, 'id'),
    patient_id: requireText(input.patient_id, 'patient_id'),
    clinical_record_id: optionalText(input.clinical_record_id),
    clinical_evolution_note_id: optionalText(input.clinical_evolution_note_id),
    professional_id: optionalText(input.professional_id),
    clinic_id: optionalText(input.clinic_id),
    main_diagnosis_cie10: assertCie10(
      normalizeCie10Code(requireText(input.main_diagnosis_cie10, 'main_diagnosis_cie10')),
      'main_diagnosis_cie10',
    ),
    related_diagnoses_cie10: related,
    purpose_of_care: requireText(input.purpose_of_care, 'purpose_of_care'),
    date_time: requireDateTime(input.date_time),
    procedures_cups: procedures,
    consultation_cups: consultation,
    created_at: optionalText(input.created_at) ?? now,
    updated_at: optionalText(input.updated_at) ?? now,
  }
}

export function assertEvolutionNoteCanSustainRips(note: EvolutionNoteRecord): EvolutionNoteRecord {
  return normalizeEvolutionNoteRecord(note)
}

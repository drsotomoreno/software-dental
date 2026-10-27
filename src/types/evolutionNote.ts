import type { SignatureCaptureMetadata } from '@/types/signature'
import type { CamposPagoAtencion } from '@/types/atencionPago'
import type { DiagnosisAnatomicalScope } from '@/types/clinicalRecord'
import {
  createDefaultEvolutionNoteRipsMetadata,
  type EvolutionNoteRipsMetadata,
} from '@/types/evolutionNoteRips'
import {
  fechaHoraSesionClinica,
  fechaSesionClinicaSiEraUtc,
} from '@/utils/clinicDateTime'

/** Parche de la nota. La metadata RIPS puede ir incompleta: se fusiona con la actual. */
export type EvolutionNotePatch = Omit<Partial<EvolutionNote>, 'ripsMetadata'> & {
  ripsMetadata?: Partial<EvolutionNoteRipsMetadata>
}

export type EvolutionNoteKind = 'evolution' | 'addendum'

export const EVOLUTION_NOTE_IMMUTABILITY_MESSAGE =
  'Por norma legal (Res. 1995/1999), las notas clínicas firmadas son inmutables. Debe realizar una nota aclaratoria (Addendum).'

/** Notas de evolución clínica por sesión */
export interface AnesthesiaRecord {
  type: string
  carpules: number
  vasoconstrictor: string
}

/** Servicio del catálogo vinculado a una nota de evolución (puede haber varios por sesión). */
export interface EvolutionCatalogService {
  id: string
  dentalServiceId?: string
  serviceName?: string
  procedure: string
  cupsCode?: string | null
  requiereCupsRips?: boolean
  cost?: number
  isBillable?: boolean
  /** Pieza FDI. Excluyente con `anatomicalScope`. */
  toothNumber?: number
  /** Maxilar superior, maxilar inferior o toda la dentición. */
  anatomicalScope?: DiagnosisAnatomicalScope
  /**
   * CIE-10 de este procedimiento. Comparte la zona o el diente del procedimiento:
   * no se vuelve a pedir una asociación aparte.
   */
  cie10Code?: string
  cie10Description?: string
}

/** Diagnóstico de la sesión. Cada uno se asocia a un diente, un maxilar o toda la dentición. */
export interface EvolutionNoteDiagnosis {
  id: string
  code: string
  description: string
  type: 'principal' | 'relacionado'
  toothNumber?: number
  anatomicalScope?: DiagnosisAnatomicalScope
}

export interface EvolutionNote {
  id: string
  /** evolution = nota de sesión; addendum = aclaratoria vinculada (append-only). */
  kind?: EvolutionNoteKind
  /** Evolución original cuando kind === 'addendum'. */
  parentEvolutionNoteId?: string
  /** Hash SHA-256 de la evolución padre al momento de la aclaratoria. */
  parentEvolutionNoteHash?: string
  /** Motivo de la nota aclaratoria. */
  addendumReason?: string
  date: string
  /** Texto libre o etiqueta CUPS — procedimiento realizado */
  procedure: string
  /**
   * Asociación del procedimiento cuando la nota no trae servicios del catálogo.
   * Pieza FDI, excluyente con `anatomicalScope`.
   */
  toothNumber?: number
  /** Maxilar superior, maxilar inferior o toda la dentición. */
  anatomicalScope?: DiagnosisAnatomicalScope
  /**
   * Diagnósticos de esta sesión. En la captura viven junto al procedimiento
   * y heredan su zona o diente.
   */
  diagnoses?: EvolutionNoteDiagnosis[]
  anesthesia: AnesthesiaRecord
  prescriptions: string
  professionalName: string
  /** Snapshot del documento de identidad (cédula / ReTHUS) al firmar la nota. */
  professionalLicense: string
  /** Usuario autenticado que creó la anotación */
  authorUserId?: string
  authorEmail?: string
  createdAt: string
  /** Servicios del catálogo realizados en la misma sesión (CUPS, CUSTOM o manual). */
  catalogServices?: EvolutionCatalogService[]
  /** Servicio del catálogo odontológico (Mis Precios) — snapshot del primero */
  dentalServiceId?: string
  serviceName?: string
  /** Snapshot: false = nota clínica sin CUPS RIPS (ej. Tatuaje Dental) */
  requiereCupsRips?: boolean
  /** Nota de evolución narrativa del profesional tratante (voz o teclado). */
  clinicalNote?: string
  cupsCode?: string | null
  professionalSignatureDataUrl?: string
  professionalSignatureMeta?: SignatureCaptureMetadata
  /** Firma del paciente en la misma nota de evolución. Entra al hash clínico. */
  patientSignatureDataUrl?: string
  patientSignatureMeta?: SignatureCaptureMetadata
  /**
   * Costo de la atención. Si es 0 y `isBillable` es false, genera RIPS (con CUPS) pero no FEV DIAN.
   */
  cost?: number
  /** false = control, garantía, retoque o valoración gratuita (sin factura DIAN) */
  isBillable?: boolean
  /**
   * Atención sin cobro. Vive fuera del hash clínico: marcarla no reescribe la nota firmada.
   * El agrupador RIPS sale en $0 con prefijo CTRL-, GAR- o CORT-.
   */
  esSinCosto?: boolean
  /** control → CTRL-, garantia → GAR-, cortesia → CORT-. */
  motivoSinCosto?: 'control' | 'garantia' | 'cortesia'
  /**
   * Bloqueo de este folio/sesión (Res. 1995/1999).
   * No congela la historia del paciente ni el odontograma general.
   */
  isLocked?: boolean
  /** Marca UTC de grabación/firma — activa inmutabilidad (Res. 1995/1999). */
  signedAt?: string
  /** SHA-256 del contenido de la nota (Ley 527 de 1999). */
  contentHash?: string
  /**
   * Pago de esta atención (Sección 11). Vive fuera del hash clínico:
   * asociar un recibo, o marcar sin costo / pendiente, no reescribe la nota firmada.
   */
  pagoId?: CamposPagoAtencion['pagoId']
  numeroSoportePago?: CamposPagoAtencion['numeroSoportePago']
  conceptoPago?: CamposPagoAtencion['conceptoPago']
  valorProcedimiento?: CamposPagoAtencion['valorProcedimiento']
  estadoRips?: CamposPagoAtencion['estadoRips']
  /**
   * Radicación RIPS (Res. 2275). Fuera del hash clínico: el CIE-10 de envío,
   * el recibo, la FEV, el CUV y los reintentos se actualizan sin romper la
   * firma de la nota (Res. 1995/1999).
   */
  ripsMetadata?: EvolutionNoteRipsMetadata
  /**
   * Cierre operativo del folio para encolar RIPS. Fuera del hash clínico:
   * no reescribe el cuerpo firmado (Res. 1995/1999).
   */
  workflowStatus?: EvolutionWorkflowStatus
}

export type EvolutionWorkflowStatus = 'DRAFT' | 'CLOSED'

export function evolutionWorkflowStatus(
  note: Pick<EvolutionNote, 'workflowStatus'> | null | undefined,
): EvolutionWorkflowStatus {
  return note?.workflowStatus === 'CLOSED' ? 'CLOSED' : 'DRAFT'
}

/** Folio / sesión clínica — unidad de bloqueo de la HCE (Res. 1995/1999). */
export type ClinicalSession = EvolutionNote
/** Entrada de evolución — alias de `EvolutionNote`. */
export type EvolutionEntry = EvolutionNote

export function isEvolutionNoteAddendum(
  note: Pick<EvolutionNote, 'kind'>,
): boolean {
  return note.kind === 'addendum'
}

export function isEvolutionFolioLocked(
  note: Pick<EvolutionNote, 'isLocked' | 'signedAt' | 'contentHash'>,
): boolean {
  return note.isLocked === true || Boolean(note.signedAt?.trim() && note.contentHash?.trim())
}

export function isEvolutionNoteImmutable(
  note: Pick<EvolutionNote, 'isLocked' | 'signedAt' | 'contentHash'>,
): boolean {
  return isEvolutionFolioLocked(note)
}

export function isEvolutionNoteMutable(
  note: Pick<EvolutionNote, 'isLocked' | 'signedAt' | 'contentHash'>,
): boolean {
  return !isEvolutionNoteImmutable(note)
}

/**
 * Conserva el cuerpo firmado y deja pasar la metadata RIPS más reciente.
 * Un borrador o una sincronización no pueden devolver el CUV, el recibo o el
 * estado de transmisión a la copia anterior.
 */
export function retainSignedEvolutionBody(
  signed: EvolutionNote,
  incoming: EvolutionNote,
): EvolutionNote {
  if (!isEvolutionNoteImmutable(signed)) return incoming
  const ripsMetadata = incoming.ripsMetadata !== undefined ? incoming.ripsMetadata : signed.ripsMetadata
  const workflowStatus = incoming.workflowStatus ?? signed.workflowStatus
  if (ripsMetadata === signed.ripsMetadata && workflowStatus === signed.workflowStatus) {
    return signed
  }
  return { ...signed, ripsMetadata, workflowStatus }
}

export function createEmptyEvolutionNote(
  professionalName = '',
  professionalLicense = '',
  authorUserId = '',
  authorEmail = '',
  now: Date = new Date(),
): EvolutionNote {
  return {
    id: crypto.randomUUID(),
    date: fechaHoraSesionClinica(now),
    procedure: '',
    anesthesia: { type: '', carpules: 0, vasoconstrictor: '' },
    prescriptions: '',
    professionalName,
    professionalLicense,
    authorUserId: authorUserId || undefined,
    authorEmail: authorEmail || undefined,
    createdAt: now.toISOString(),
    catalogServices: [],
    kind: 'evolution',
    isLocked: false,
    pagoId: null,
    numeroSoportePago: null,
    conceptoPago: 'No aplica',
    valorProcedimiento: 0,
    estadoRips: 'SIN_COSTO',
    cost: 0,
    isBillable: false,
    esSinCosto: true,
    motivoSinCosto: 'control',
    workflowStatus: 'DRAFT',
    ripsMetadata: createDefaultEvolutionNoteRipsMetadata(),
  }
}

/**
 * El sello automático anterior guardó el reloj UTC en `date`. En un borrador
 * que nadie ha corregido, se restituye la hora de Bogotá de `createdAt`.
 * Una nota firmada no se toca: esa hora ya entra en el SHA-256.
 */
export function corregirFechaSesionClinica<
  T extends Pick<EvolutionNote, 'date' | 'createdAt' | 'isLocked' | 'signedAt' | 'contentHash'>,
>(note: T): T {
  if (isEvolutionNoteImmutable(note)) return note
  const corrected = fechaSesionClinicaSiEraUtc(note.date, note.createdAt)
  if (!corrected) return note
  return { ...note, date: corrected }
}

export function corregirFechasSesionClinica<
  T extends Pick<EvolutionNote, 'date' | 'createdAt' | 'isLocked' | 'signedAt' | 'contentHash'>,
>(notes: readonly T[] | null | undefined): T[] {
  const list = notes ?? []
  let changed = false
  const next = list.map((note) => {
    const fixed = corregirFechaSesionClinica(note)
    if (fixed !== note) changed = true
    return fixed
  })
  if (!changed) return Array.isArray(notes) ? (notes as T[]) : []
  return next
}

export function createEmptyCatalogService(): EvolutionCatalogService {
  return {
    id: crypto.randomUUID(),
    procedure: '',
  }
}

export function isNonRipsEvolutionNote(note: Pick<EvolutionNote, 'requiereCupsRips'>): boolean {
  return note.requiereCupsRips === false
}

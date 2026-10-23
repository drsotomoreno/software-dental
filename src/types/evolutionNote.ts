import type { SignatureCaptureMetadata } from '@/types/signature'
import type { CamposPagoAtencion } from '@/types/atencionPago'
import {
  createDefaultEvolutionNoteRipsMetadata,
  type EvolutionNoteRipsMetadata,
} from '@/types/evolutionNoteRips'

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
  /**
   * Costo de la atención. Si es 0 y `isBillable` es false, genera RIPS (con CUPS) pero no FEV DIAN.
   */
  cost?: number
  /** false = control, garantía, retoque o valoración gratuita (sin factura DIAN) */
  isBillable?: boolean
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
  if (incoming.ripsMetadata === undefined) return signed
  return { ...signed, ripsMetadata: incoming.ripsMetadata }
}

export function createEmptyEvolutionNote(
  professionalName = '',
  professionalLicense = '',
  authorUserId = '',
  authorEmail = '',
): EvolutionNote {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 16),
    procedure: '',
    anesthesia: { type: '', carpules: 0, vasoconstrictor: '' },
    prescriptions: '',
    professionalName,
    professionalLicense,
    authorUserId: authorUserId || undefined,
    authorEmail: authorEmail || undefined,
    createdAt: new Date().toISOString(),
    catalogServices: [],
    kind: 'evolution',
    isLocked: false,
    pagoId: null,
    numeroSoportePago: null,
    conceptoPago: null,
    valorProcedimiento: 0,
    estadoRips: 'PENDIENTE_PAGO',
    ripsMetadata: createDefaultEvolutionNoteRipsMetadata(),
  }
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

import type { SignatureCaptureMetadata } from '@/types/signature'

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

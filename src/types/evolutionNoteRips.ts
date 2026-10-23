import { z } from 'zod'

/**
 * Metadata RIPS de una nota de evolución (Res. 2275 de 2023).
 * Vive fuera del cuerpo clínico firmado (Res. 1995/1999 y Ley 527):
 * se puede corregir el CIE-10 de radicación, vincular un recibo o una FEV,
 * reintentar el MUV y guardar el CUV sin volver a firmar la nota.
 */

export const TIPO_VINCULACION_FINANCIERA = ['recibo_interno', 'fev', 'valor_cero'] as const

export const RIPS_ESTADO_TRANSMISION = [
  'sin_preparar',
  'preparado',
  'enviado_ok',
  'error',
] as const

/** Enfermedad general — catálogo causaMotivoAtencion. */
export const RIPS_CAUSA_MOTIVO_ATENCION_DEFAULT = '38'
/** Terapéutico — catálogo finalidadTecnologiaSalud. */
export const RIPS_FINALIDAD_TECNOLOGIA_DEFAULT = '11'
/** No aplica (particular / valor cero). */
export const RIPS_CONCEPTO_RECAUDO_DEFAULT = '05'

export type TipoVinculacionFinanciera = (typeof TIPO_VINCULACION_FINANCIERA)[number]
export type RipsEstadoTransmision = (typeof RIPS_ESTADO_TRANSMISION)[number]

/** CIE-10 sin punto: letra + dos dígitos + hasta dos caracteres (K021, K0211). */
export const CIE10_RIPS_PATTERN = /^[A-Z]\d{2}[0-9A-Z]{0,2}$/

const nullableText = (max: number) =>
  z.preprocess(
    (value) => {
      if (value == null) return null
      const text = String(value).trim()
      return text.length > 0 ? text : null
    },
    z.string().min(1).max(max).nullable(),
  )

const codigoCatalogo = (fallback: string) =>
  z.preprocess(
    (value) => {
      const text = String(value ?? '').trim()
      return text.length > 0 ? text : fallback
    },
    z
      .string()
      .regex(/^\d{2}$/, 'Debe ser un código de dos dígitos del catálogo RIPS.'),
  )

export const evolutionNoteRipsMetadataSchema = z
  .object({
    /** CIE-10 del procedimiento. Obligatorio al preparar o aceptar el RIPS. */
    codDiagnosticoPrincipal: z.preprocess((value) => {
      if (value == null) return ''
      return String(value).replace(/[.\s]/g, '').toUpperCase()
    }, z.string().max(7)),
    tipoVinculacionFinanciera: z.preprocess(
      (value) => (value == null || value === '' ? 'valor_cero' : value),
      z.enum(TIPO_VINCULACION_FINANCIERA, {
        errorMap: () => ({
          message: 'tipoVinculacionFinanciera debe ser recibo_interno, fev o valor_cero.',
        }),
      }),
    ),
    /** Recibo de caja interno. Null si aún no hay soporte o el tipo no es recibo. */
    idReciboAsociado: nullableText(128),
    /** FEV DIAN. Null mientras la atención no tenga factura electrónica. */
    idFacturaElectronica: nullableText(128),
    causaMotivoAtencion: codigoCatalogo(RIPS_CAUSA_MOTIVO_ATENCION_DEFAULT),
    finalidadTecnologia: codigoCatalogo(RIPS_FINALIDAD_TECNOLOGIA_DEFAULT),
    conceptoRecaudo: codigoCatalogo(RIPS_CONCEPTO_RECAUDO_DEFAULT),
    ripsEstado: z.preprocess(
      (value) => (value == null || value === '' ? 'sin_preparar' : value),
      z.enum(RIPS_ESTADO_TRANSMISION, {
        errorMap: () => ({
          message: 'ripsEstado debe ser sin_preparar, preparado, enviado_ok o error.',
        }),
      }),
    ),
    /** Código Único de Validación devuelto por el MUV. */
    cuv: nullableText(128),
    ripsFechaTransmision: z.preprocess(
      (value) => (value == null || value === '' ? null : value),
      z
        .string()
        .datetime({
          offset: true,
          message: 'ripsFechaTransmision debe ser una fecha ISO-8601.',
        })
        .nullable(),
    ),
    ripsErrorLog: nullableText(4000),
  })
  .superRefine((value, ctx) => {
    const listoParaRadicar =
      value.ripsEstado === 'preparado' || value.ripsEstado === 'enviado_ok'
    if (listoParaRadicar && !value.codDiagnosticoPrincipal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['codDiagnosticoPrincipal'],
        message: 'El diagnóstico principal CIE-10 es obligatorio para RIPS.',
      })
    }
    if (value.codDiagnosticoPrincipal && !CIE10_RIPS_PATTERN.test(value.codDiagnosticoPrincipal)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['codDiagnosticoPrincipal'],
        message: 'codDiagnosticoPrincipal no tiene formato CIE-10.',
      })
    }
    if (listoParaRadicar && value.tipoVinculacionFinanciera === 'recibo_interno' && !value.idReciboAsociado) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['idReciboAsociado'],
        message: 'La vinculación por recibo interno exige idReciboAsociado.',
      })
    }
    if (listoParaRadicar && value.tipoVinculacionFinanciera === 'fev' && !value.idFacturaElectronica) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['idFacturaElectronica'],
        message: 'La vinculación por FEV exige idFacturaElectronica.',
      })
    }
    if (
      listoParaRadicar &&
      value.tipoVinculacionFinanciera === 'valor_cero' &&
      (value.idReciboAsociado || value.idFacturaElectronica)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tipoVinculacionFinanciera'],
        message: 'valor_cero no admite recibo ni factura electrónica asociados.',
      })
    }
    if (value.ripsEstado === 'enviado_ok' && !value.cuv) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cuv'],
        message: 'El CUV del MUV es obligatorio cuando el RIPS fue aceptado.',
      })
    }
    if (value.ripsEstado === 'enviado_ok' && !value.ripsFechaTransmision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ripsFechaTransmision'],
        message: 'La fecha de transmisión es obligatoria cuando el RIPS fue aceptado.',
      })
    }
  })

export type EvolutionNoteRipsMetadata = z.output<typeof evolutionNoteRipsMetadataSchema>

export class EvolutionNoteRipsMetadataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EvolutionNoteRipsMetadataError'
  }
}

export function parseEvolutionNoteRipsMetadata(input: unknown): EvolutionNoteRipsMetadata {
  const parsed = evolutionNoteRipsMetadataSchema.safeParse(input ?? {})
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : ''
    throw new EvolutionNoteRipsMetadataError(
      `${path}${issue?.message ?? 'La metadata RIPS no es válida.'}`,
    )
  }
  return parsed.data
}

/** Valores de una nota que todavía no se radica. */
export function createDefaultEvolutionNoteRipsMetadata(
  partial?: Partial<EvolutionNoteRipsMetadata> | null,
): EvolutionNoteRipsMetadata {
  return parseEvolutionNoteRipsMetadata({
    codDiagnosticoPrincipal: '',
    tipoVinculacionFinanciera: 'valor_cero',
    idReciboAsociado: null,
    idFacturaElectronica: null,
    causaMotivoAtencion: RIPS_CAUSA_MOTIVO_ATENCION_DEFAULT,
    finalidadTecnologia: RIPS_FINALIDAD_TECNOLOGIA_DEFAULT,
    conceptoRecaudo: RIPS_CONCEPTO_RECAUDO_DEFAULT,
    ripsEstado: 'sin_preparar',
    cuv: null,
    ripsFechaTransmision: null,
    ripsErrorLog: null,
    ...partial,
  })
}

type NotaConRipsMetadata = { ripsMetadata?: EvolutionNoteRipsMetadata | null }

/**
 * Fusiona un parche de metadata sobre la nota.
 * No copia procedure, clinicalNote, firma ni contentHash.
 */
export function applyEvolutionNoteRipsMetadata<T extends NotaConRipsMetadata>(
  note: T,
  patch: Partial<EvolutionNoteRipsMetadata>,
): T {
  return {
    ...note,
    ripsMetadata: parseEvolutionNoteRipsMetadata({
      ...createDefaultEvolutionNoteRipsMetadata(),
      ...(note.ripsMetadata ?? {}),
      ...patch,
    }),
  }
}

export function isRipsMetadataOnlyPatch(patch: object): boolean {
  const keys = Object.keys(patch).filter(
    (key) => (patch as Record<string, unknown>)[key] !== undefined,
  )
  return keys.length === 1 && keys[0] === 'ripsMetadata'
}

/**
 * Aplica un parche a la nota. Si ya está firmada, solo acepta `ripsMetadata`.
 * `rejectClinicalEdit` se invoca para conservar el mensaje de la Res. 1995/1999.
 */
export function applyEvolutionNotePatch<T extends NotaConRipsMetadata>(
  note: T,
  patch: Partial<T> & { ripsMetadata?: Partial<EvolutionNoteRipsMetadata> },
  options: { immutable: boolean; rejectClinicalEdit: () => void },
): T {
  if (options.immutable) {
    if (!isRipsMetadataOnlyPatch(patch) || !patch.ripsMetadata) {
      options.rejectClinicalEdit()
      return note
    }
    return applyEvolutionNoteRipsMetadata(note, patch.ripsMetadata)
  }
  if (patch.ripsMetadata) {
    const withMetadata = applyEvolutionNoteRipsMetadata(note, patch.ripsMetadata)
    const clinicalPatch = { ...patch }
    delete clinicalPatch.ripsMetadata
    return { ...withMetadata, ...clinicalPatch, ripsMetadata: withMetadata.ripsMetadata }
  }
  return { ...note, ...patch }
}

/** Quita la metadata RIPS antes de hashear el cuerpo clínico. */
export function omitEvolutionNoteRipsMetadata<T extends NotaConRipsMetadata>(
  note: T,
): Omit<T, 'ripsMetadata'> {
  if (!note || typeof note !== 'object' || !('ripsMetadata' in note)) return note
  const clinical = { ...note }
  delete clinical.ripsMetadata
  return clinical
}

export function backfillEvolutionNotesRipsMetadata<T extends NotaConRipsMetadata>(
  notes: T[] | null | undefined,
): T[] | null | undefined {
  if (!Array.isArray(notes)) return notes
  let changed = false
  const next = notes.map((note) => {
    if (!note || typeof note !== 'object' || note.ripsMetadata) return note
    changed = true
    return { ...note, ripsMetadata: createDefaultEvolutionNoteRipsMetadata() }
  })
  return changed ? next : notes
}

export function backfillDraftEvolutionNotes<
  T extends { evolutionNotes?: Array<NotaConRipsMetadata> | null },
>(draft: T | null | undefined): T | null | undefined {
  if (!draft || typeof draft !== 'object') return draft
  const evolutionNotes = backfillEvolutionNotesRipsMetadata(draft.evolutionNotes ?? undefined)
  if (evolutionNotes === draft.evolutionNotes) return draft
  return { ...draft, evolutionNotes }
}

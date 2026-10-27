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
      value.idFacturaElectronica
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['idFacturaElectronica'],
        message: 'Una atención sin costo no admite factura electrónica. El agrupador es un consecutivo interno de $0.',
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

type NotaConRipsMetadata = {
  ripsMetadata?: EvolutionNoteRipsMetadata | null
  cost?: number
  isBillable?: boolean
  estadoRips?: string | null
}

/** Una nota con tarifa no nace como control de $0 al guardar el primer CIE-10. */
function vinculoInicial(note: NotaConRipsMetadata): Partial<EvolutionNoteRipsMetadata> {
  if (note.ripsMetadata) return {}
  const sinCosto =
    (note.cost ?? 0) === 0 || note.isBillable === false || note.estadoRips === 'SIN_COSTO'
  if (sinCosto) return {}
  return { tipoVinculacionFinanciera: 'recibo_interno' }
}

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
      ...vinculoInicial(note),
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

/** Cobro y radicación: se pueden actualizar con la nota ya firmada. */
export const EVOLUTION_SIDECAR_KEYS = [
  'ripsMetadata',
  'workflowStatus',
  'pagoId',
  'numeroSoportePago',
  'conceptoPago',
  'valorProcedimiento',
  'estadoRips',
  'esSinCosto',
  'motivoSinCosto',
] as const

export function isEvolutionSidecarPatch(patch: object): boolean {
  const record = patch as Record<string, unknown>
  const keys = Object.keys(record).filter((key) => record[key] !== undefined)
  return keys.length > 0 && keys.every((key) => (EVOLUTION_SIDECAR_KEYS as readonly string[]).includes(key))
}

/**
 * Aplica un parche a la nota. Si ya está firmada, solo acepta el sidecar
 * (metadata RIPS y vínculo de pago). `rejectClinicalEdit` conserva el mensaje
 * de la Res. 1995/1999.
 */
export function applyEvolutionNotePatch<T extends NotaConRipsMetadata>(
  note: T,
  patch: Omit<Partial<T>, 'ripsMetadata'> & {
    ripsMetadata?: Partial<EvolutionNoteRipsMetadata>
  },
  options: { immutable: boolean; rejectClinicalEdit: () => void },
): T {
  if (options.immutable) {
    if (!isEvolutionSidecarPatch(patch)) {
      options.rejectClinicalEdit()
      return note
    }
    const withMetadata = patch.ripsMetadata
      ? applyEvolutionNoteRipsMetadata(note, patch.ripsMetadata)
      : note
    const sidecar = { ...patch }
    delete sidecar.ripsMetadata
    return {
      ...withMetadata,
      ...sidecar,
      ...(patch.ripsMetadata ? { ripsMetadata: withMetadata.ripsMetadata } : {}),
    }
  }
  if (patch.ripsMetadata) {
    const withMetadata = applyEvolutionNoteRipsMetadata(note, patch.ripsMetadata)
    const clinicalPatch = { ...patch }
    delete clinicalPatch.ripsMetadata
    return { ...withMetadata, ...clinicalPatch, ripsMetadata: withMetadata.ripsMetadata }
  }
  return { ...note, ...patch }
}

/**
 * Quita la metadata RIPS y el cierre operativo antes de hashear el cuerpo clínico.
 * Un CUV o un estado CLOSED posteriores no invalidan la firma.
 */
export function omitEvolutionNoteRipsMetadata<T extends NotaConRipsMetadata>(
  note: T,
): Omit<T, 'ripsMetadata'> {
  if (!note || typeof note !== 'object') return note
  if (!('ripsMetadata' in note) && !('workflowStatus' in note) && !('esSinCosto' in note) && !('motivoSinCosto' in note)) {
    return note
  }
  const clinical = { ...note }
  delete clinical.ripsMetadata
  delete (clinical as { workflowStatus?: unknown }).workflowStatus
  delete (clinical as { esSinCosto?: unknown }).esSinCosto
  delete (clinical as { motivoSinCosto?: unknown }).motivoSinCosto
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

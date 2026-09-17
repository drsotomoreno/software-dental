/**
 * Esquema Zod del Motor RIPS (DTO clínico simplificado).
 * Valida datos odontológicos antes de transmitir a MinSalud.
 * El paquete JSON oficial Res. 2275 sigue en ripsLocalValidator / minsaludRipsClient.
 */

import { z } from 'zod'
import { extractRepsDigits } from '../../shared/repsCode.js'

/** Finalidad de la consulta (catálogo SISPRO / Res. 2275). 11 = Diagnóstico (default del EMR). */
export const FINALIDAD_CONSULTA_CODES = Object.freeze([11, 12, 13, 14, 15, 16, 17])

const CIE10_PATTERN = /^[A-Z]\d{2}\.?\d{0,2}$/
const PATIENT_ID_PATTERN = /^[A-Za-z0-9]{3,16}$/

/**
 * CUPS de odontología general: 6 dígitos (890203) o jerárquico (89.0.2.03).
 * La subcategoría final debe ser 03.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isOdontologiaGeneralCups(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return false

  if (raw.includes('.')) {
    const segments = raw.split('.')
    const lastSegment = segments[segments.length - 1]
    const digits = raw.replace(/\D/g, '')
    return lastSegment === '03' && digits.length === 6
  }

  const digits = raw.replace(/\D/g, '')
  return digits.length === 6 && digits.endsWith('03')
}

function normalizeCupsDigits(value) {
  return String(value ?? '').replace(/\D/g, '').padStart(6, '0').slice(0, 6)
}

export const ripsPayloadSchema = z.object({
  codigoHabilitacionREPS: z
    .string({ error: 'codigoHabilitacionREPS debe ser un string (código REPS de sede, distinto del NIT).' })
    .trim()
    .min(1, 'codigoHabilitacionREPS es obligatorio (código REPS de sede, distinto del NIT).')
    .transform((value) => extractRepsDigits(value))
    .refine((digits) => digits.length === 12, {
      message:
        'codigoHabilitacionREPS debe tener exactamente 12 dígitos (REPS de sede, ej. 6800103898-01).',
    }),
  identificacionPaciente: z
    .string({ error: 'identificacionPaciente debe ser un string con el documento del paciente.' })
    .trim()
    .regex(PATIENT_ID_PATTERN, 'identificacionPaciente debe ser alfanumérico de 3 a 16 caracteres.'),
  codigoDiagnosticoPrincipal: z
    .string({ error: 'codigoDiagnosticoPrincipal debe ser un string CIE-10 (ej. K021).' })
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => CIE10_PATTERN.test(value), {
      message: 'codigoDiagnosticoPrincipal debe ser CIE-10 (ej. K021 o K02.1).',
    })
    .transform((value) => value.replace(/\./g, '')),
  codigoProcedimientoCUPS: z
    .string({ error: 'codigoProcedimientoCUPS debe ser un string CUPS.' })
    .trim()
    .min(1, 'codigoProcedimientoCUPS es obligatorio.')
    .refine((value) => isOdontologiaGeneralCups(value), {
      message:
        'codigoProcedimientoCUPS debe aplicar a odontología general (subcategoría .03, ej. 890203 o 89.0.2.03).',
    })
    .transform((value) => normalizeCupsDigits(value)),
  valorConsulta: z.coerce
    .number({ error: 'valorConsulta debe ser un número mayor o igual a cero.' })
    .finite('valorConsulta debe ser un número mayor o igual a cero.')
    .gte(0, 'valorConsulta debe ser mayor o igual a cero.'),
  finalidadConsulta: z.coerce
    .number({ error: 'finalidadConsulta debe ser un código numérico según la norma.' })
    .int('finalidadConsulta debe ser un código numérico entero según la norma.')
    .refine((code) => FINALIDAD_CONSULTA_CODES.includes(code), {
      message: `finalidadConsulta debe ser un código de la norma (${FINALIDAD_CONSULTA_CODES.join(', ')}).`,
    }),
})

/**
 * Valida el DTO clínico del Motor RIPS.
 * @param {unknown} payload
 * @returns {import('zod').SafeParseReturnType<unknown, z.infer<typeof ripsPayloadSchema>>}
 */
export function validateRipsPayload(payload) {
  return ripsPayloadSchema.safeParse(payload)
}

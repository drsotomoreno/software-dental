import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { Patient } from '@/types/patient'
import type { UserProfile } from '@/types/user'
import { db } from '@/db/database'
import {
  reintentarEnvioMuv,
  routeDictatedEvolutionByFiscalProfile,
  type EstadoMuv,
} from '@/services/ripsApiService'
import { isNoObligadoFev, normalizePerfilFiscal } from '@/utils/fiscalProfile'

type RecordKey = number | string

function notaParaRips(note: ClinicalRecord['evolutionNotes'][number]) {
  return {
    signedAt: note.signedAt,
    date: note.date,
    cupsCode: note.cupsCode,
    cost: note.cost,
    isBillable: note.isBillable,
    catalogServices: (note.catalogServices ?? []).map((service) => ({
      cupsCode: service.cupsCode,
      cost: service.cost,
      isBillable: service.isBillable,
    })),
  }
}

/** Atención mínima que el RipsMapper convierte en CargarRipsSinFactura. */
export function atencionParaMuv(input: {
  id: string
  record: Pick<
    ClinicalRecord,
    | 'patientId'
    | 'professionalId'
    | 'diagnoses'
    | 'evolutionNotes'
    | 'paymentControl'
    | 'orthodonticsPaymentControl'
    | 'budget'
    | 'signedAt'
  >
  patient: Patient
  professional: UserProfile
  signedAt?: string
}) {
  const { record, patient, professional } = input
  return {
    id: input.id,
    patientId: record.patientId,
    professionalId: record.professionalId,
    signedAt: input.signedAt ?? record.signedAt,
    diagnoses: record.diagnoses,
    evolutionNotes: (record.evolutionNotes ?? []).map(notaParaRips),
    paymentControl: record.paymentControl,
    orthodonticsPaymentControl: record.orthodonticsPaymentControl,
    budget: record.budget,
    patient: {
      id: patient.id,
      documentType: patient.documentType,
      documentNumber: patient.documentNumber,
      birthDate: patient.birthDate,
      gender: patient.gender,
      regime: patient.regime,
      municipalityCode: patient.municipalityCode,
    },
    professional: {
      id: professional.id,
      documentType: professional.documentType,
      documentNumber: professional.documentNumber,
      providerNit: professional.providerNit,
      repsCode: professional.repsCode,
      perfilFiscal: professional.perfilFiscal,
    },
  }
}

type AtencionMuvInput = {
  recordKey: RecordKey
  patient: Patient
  professional: UserProfile
  signedAt: string
  record: Parameters<typeof atencionParaMuv>[0]['record']
}

function payloadRadicacionMuv(input: AtencionMuvInput) {
  const id = String(input.recordKey)
  return {
    atencion: atencionParaMuv({
      id,
      record: input.record,
      patient: input.patient,
      professional: input.professional,
      signedAt: input.signedAt,
    }),
    metadatos: {
      patientUuid: String(input.patient.id ?? ''),
      clinicalRecordIds: [id],
      patientDocument: input.patient.documentNumber,
      perfilFiscal: normalizePerfilFiscal(input.professional.perfilFiscal),
    },
    cie10: (input.record.diagnoses ?? []).map((item) => item.code),
    cups: (input.record.evolutionNotes ?? []).map((note) => note.cupsCode),
  }
}

export interface ResultadoReintentoMuv {
  estadoMuv: EstadoMuv | null
  cuv: string | null
  resultadoValidacion: unknown
  mensaje: string
}

/**
 * Tras cerrar la atención de un prestador no obligado, radica el RIPS en el MUV
 * y copia CUV y estado en la historia local. Un fallo del ministerio no deshace la firma.
 */
export async function reportarAtencionCerradaAlMuv(input: AtencionMuvInput): Promise<string> {
  if (!isNoObligadoFev(normalizePerfilFiscal(input.professional.perfilFiscal))) return ''

  try {
    const result = await routeDictatedEvolutionByFiscalProfile(payloadRadicacionMuv(input))

    if (result.estadoMuv) {
      await db.clinicalRecords.update(input.recordKey, {
        cuv: result.cuv ?? null,
        estadoMuv: result.estadoMuv,
        resultadoValidacion: result.resultadoValidacion ?? null,
      })
    }

    if (result.estadoMuv === 'APROBADO' && result.cuv) {
      return `CUV ${result.cuv}.`
    }
    if (result.estadoMuv === 'RECHAZADO') {
      return result.error || result.message || 'El MUV rechazó el RIPS de la consulta.'
    }
    return ''
  } catch {
    return 'No se pudo radicar el RIPS en el MUV. La atención firmada se conservó.'
  }
}

/**
 * Reintento manual desde la evolución. Llama a POST /api/rips/reintentar-envio
 * y refresca CUV y estado en la historia local cuando el Ministerio responde.
 */
export async function reintentarRadicacionDesdeHistoria(
  input: AtencionMuvInput,
): Promise<ResultadoReintentoMuv> {
  try {
    const result = await reintentarEnvioMuv(payloadRadicacionMuv(input))
    const estadoMuv = result.estadoMuv ?? null

    if (estadoMuv) {
      await db.clinicalRecords.update(input.recordKey, {
        cuv: result.cuv ?? null,
        estadoMuv,
        resultadoValidacion: result.resultadoValidacion ?? null,
      })
    }

    if (estadoMuv === 'APROBADO') {
      return {
        estadoMuv,
        cuv: result.cuv ?? null,
        resultadoValidacion: result.resultadoValidacion ?? null,
        mensaje: result.cuv
          ? `RIPS enviado exitosamente. CUV: ${result.cuv}`
          : 'RIPS enviado exitosamente.',
      }
    }

    if (estadoMuv === 'RECHAZADO') {
      return {
        estadoMuv,
        cuv: null,
        resultadoValidacion: result.resultadoValidacion ?? null,
        mensaje: '',
      }
    }

    const crudo = result.message || result.error || ''
    const mensaje = /sesi[oó]n/i.test(crudo)
      ? 'Vuelva a iniciar sesión para reenviar el RIPS. La atención sigue guardada.'
      : crudo || 'El envío sigue pendiente. La atención sigue guardada; puede intentarlo de nuevo.'

    return {
      estadoMuv,
      cuv: result.cuv ?? null,
      resultadoValidacion: result.resultadoValidacion ?? null,
      mensaje,
    }
  } catch {
    return {
      estadoMuv: null,
      cuv: null,
      resultadoValidacion: null,
      mensaje:
        'No hubo conexión con el Ministerio. La atención sigue guardada; intente de nuevo en un momento.',
    }
  }
}

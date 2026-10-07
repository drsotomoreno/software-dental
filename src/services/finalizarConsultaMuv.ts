import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { Patient } from '@/types/patient'
import type { UserProfile } from '@/types/user'
import { db } from '@/db/database'
import { routeDictatedEvolutionByFiscalProfile } from '@/services/ripsApiService'
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

/**
 * Tras cerrar la atención de un prestador no obligado, radica el RIPS en el MUV
 * y copia CUV y estado en la historia local. Un fallo del ministerio no deshace la firma.
 */
export async function reportarAtencionCerradaAlMuv(input: {
  recordKey: RecordKey
  patient: Patient
  professional: UserProfile
  signedAt: string
  record: Parameters<typeof atencionParaMuv>[0]['record']
}): Promise<string> {
  if (!isNoObligadoFev(normalizePerfilFiscal(input.professional.perfilFiscal))) return ''

  const id = String(input.recordKey)
  try {
    const result = await routeDictatedEvolutionByFiscalProfile({
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
    })

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

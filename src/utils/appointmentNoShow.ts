import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { db } from '@/db/database'
import type { Appointment } from '@/types/appointment'
import type { EvolutionNote } from '@/types/evolutionNote'
import { PROCEDURE_TYPE_CONFIG } from '@/constants/procedures'
import { syncCitasToLocalStorage, renderCitas } from './agendaStorage'
import { appendPatientEvolutionNote } from './patientClinicalDraft'
import { resolveAppointmentPatientRouteId } from './resolveAppointmentPatient'

export interface MarkNoShowOptions {
  professionalName: string
  professionalLicense: string
  authorUserId: string
  authorEmail: string
  additionalNote?: string
}

export interface MarkNoShowResult {
  ok: boolean
  evolutionRecorded: boolean
  patientRouteId: string | null
  error?: string
}

function buildNoShowEvolutionNote(
  appointment: Appointment,
  options: MarkNoShowOptions,
): EvolutionNote {
  const procedureLabel = PROCEDURE_TYPE_CONFIG[appointment.procedureType].label
  const appointmentDate = format(parseISO(appointment.startTime), "EEEE d 'de' MMMM yyyy", {
    locale: es,
  })
  const appointmentTime = `${format(parseISO(appointment.startTime), 'HH:mm')} – ${format(parseISO(appointment.endTime), 'HH:mm')}`

  const baseText = `Paciente no asistió a la cita programada el ${appointmentDate} (${appointmentTime}) para ${procedureLabel}.`
  const detail = options.additionalNote?.trim()
  const prescriptions = detail ? `${baseText}\n\nObservación: ${detail}` : baseText

  return {
    id: crypto.randomUUID(),
    date: appointment.startTime.slice(0, 16),
    procedure: `Inasistencia — ${procedureLabel}`,
    anesthesia: { type: '', carpules: 0, vasoconstrictor: '' },
    prescriptions,
    professionalName: options.professionalName,
    professionalLicense: options.professionalLicense,
    authorUserId: options.authorUserId,
    authorEmail: options.authorEmail,
    createdAt: new Date().toISOString(),
  }
}

export async function markAppointmentNoShow(
  appointment: Appointment,
  options: MarkNoShowOptions,
): Promise<MarkNoShowResult> {
  if (appointment.id == null) {
    return { ok: false, evolutionRecorded: false, patientRouteId: null, error: 'Cita sin identificador.' }
  }

  if (appointment.status === 'no_asistio') {
    return {
      ok: false,
      evolutionRecorded: false,
      patientRouteId: null,
      error: 'La cita ya está marcada como inasistencia.',
    }
  }

  const patientRouteId = await resolveAppointmentPatientRouteId(appointment)
  let evolutionRecorded = false

  if (patientRouteId) {
    await appendPatientEvolutionNote(
      patientRouteId,
      buildNoShowEvolutionNote(appointment, options),
    )
    evolutionRecorded = true
  }

  await db.appointments.update(appointment.id, {
    status: 'no_asistio',
    updatedAt: new Date().toISOString(),
  })
  await syncCitasToLocalStorage()
  renderCitas()

  return {
    ok: true,
    evolutionRecorded,
    patientRouteId,
  }
}

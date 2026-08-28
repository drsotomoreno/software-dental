import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { differenceInYears, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAuth } from '@/contexts/AuthContext'
import type { Appointment, ScheduleColumn } from '@/types/appointment'
import type { Patient } from '@/types/patient'
import { APPOINTMENT_STATUS_LABELS } from '@/constants/dental'
import {
  getAppointmentDisplayClasses,
  getProcedureColorClasses,
  PROCEDURE_TYPE_CONFIG,
} from '@/constants/procedures'
import { resolveAppointmentPatient } from '@/utils/resolveAppointmentPatient'
import { ClinicalPrecautionAlertBanner } from '@/components/clinical/ClinicalPrecautionAlertBanner'
import { usePatientPrecautionAlert } from '@/hooks/usePatientPrecautionAlert'
import { WhatsAppReminderButton } from './WhatsAppReminderButton'

interface AppointmentDetailPanelProps {
  appointment: Appointment
  columns: ScheduleColumn[]
  onClose: () => void
  onConfirm?: () => void
  onSaveNotes?: (notes: string) => Promise<void>
  onSavePhone?: (phone: string) => Promise<{ patientUpdated: boolean }>
  onMarkNoShow?: (additionalNote?: string) => Promise<{
    evolutionRecorded: boolean
    patientRouteId: string | null
  }>
}

const GENDER_LABELS: Record<Patient['gender'], string> = {
  M: 'Masculino',
  F: 'Femenino',
  O: 'Otro',
}

function InfoRow({
  label,
  value,
  fullWidth = false,
}: {
  label: string
  value?: string | null
  fullWidth?: boolean
}) {
  if (!value?.trim()) return null

  return (
    <div className={`min-w-0 ${fullWidth ? 'sm:col-span-2' : ''}`}>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm leading-snug text-slate-800 [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  )
}

export function AppointmentDetailPanel({
  appointment,
  columns,
  onClose,
  onConfirm,
  onSaveNotes,
  onSavePhone,
  onMarkNoShow,
}: AppointmentDetailPanelProps) {
  const { can } = useAuth()
  const [notes, setNotes] = useState(appointment.notes ?? '')
  const [phone, setPhone] = useState(appointment.patientPhone ?? '')
  const [noShowNote, setNoShowNote] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [savingPhone, setSavingPhone] = useState(false)
  const [markingNoShow, setMarkingNoShow] = useState(false)
  const [noShowFeedback, setNoShowFeedback] = useState<string | null>(null)
  const [notesFeedback, setNotesFeedback] = useState<'idle' | 'saved' | 'error'>('idle')
  const [phoneFeedback, setPhoneFeedback] = useState<'idle' | 'saved' | 'history' | 'error'>('idle')
  const canEditNotes = can('agenda.write')
  const canEditPhone = can('agenda.write')
  const canMarkNoShow = can('agenda.write') && appointment.status !== 'no_asistio'

  const patient = useLiveQuery(
    () => resolveAppointmentPatient(appointment),
    [appointment.id, appointment.patientId, appointment.patientPhone],
  )

  const columnName =
    columns.find((column) => column.id === appointment.columnId)?.name ?? '—'
  const procedure = PROCEDURE_TYPE_CONFIG[appointment.procedureType]
  const procedureClasses =
    appointment.status === 'no_asistio'
      ? getAppointmentDisplayClasses(appointment)
      : getProcedureColorClasses(appointment.procedureType)
  const start = parseISO(appointment.startTime)
  const end = parseISO(appointment.endTime)
  const patientRouteId = patient?.id != null ? String(patient.id) : appointment.patientId
  const precautionAlert = usePatientPrecautionAlert(patientRouteId)
  const canViewClinicalHistory = can('clinical.read') || can('patients.read')
  const age =
    patient?.birthDate != null
      ? differenceInYears(new Date(), parseISO(patient.birthDate))
      : null

  useEffect(() => {
    setNotes(appointment.notes ?? '')
    setNotesFeedback('idle')
  }, [appointment.id, appointment.notes])

  useEffect(() => {
    setPhone(patient?.phone ?? appointment.patientPhone ?? '')
    setPhoneFeedback('idle')
  }, [appointment.id, appointment.patientPhone, patient?.phone])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const notesDirty =
    notes.trim() !== (appointment.notes?.trim() ?? '')

  const resolvedPhone = (patient?.phone ?? appointment.patientPhone ?? '').trim()
  const phoneDirty = phone.trim() !== resolvedPhone

  const handleSaveNotes = async () => {
    if (!onSaveNotes || appointment.id == null || !notesDirty) return

    setSavingNotes(true)
    setNotesFeedback('idle')
    try {
      await onSaveNotes(notes)
      setNotesFeedback('saved')
    } catch {
      setNotesFeedback('error')
    } finally {
      setSavingNotes(false)
    }
  }

  const handleSavePhone = async () => {
    if (!onSavePhone || appointment.id == null || !phoneDirty || !phone.trim()) return

    setSavingPhone(true)
    setPhoneFeedback('idle')
    try {
      const result = await onSavePhone(phone)
      setPhoneFeedback(result.patientUpdated ? 'history' : 'saved')
    } catch {
      setPhoneFeedback('error')
    } finally {
      setSavingPhone(false)
    }
  }

  const handleMarkNoShow = async () => {
    if (!onMarkNoShow || !canMarkNoShow) return

    const confirmed = window.confirm(
      '¿Marcar esta cita como inasistencia? Se registrará en la evolución del paciente si está vinculado.',
    )
    if (!confirmed) return

    setMarkingNoShow(true)
    setNoShowFeedback(null)
    try {
      const result = await onMarkNoShow(noShowNote)
      if (result.evolutionRecorded) {
        setNoShowFeedback('Inasistencia registrada en la evolución del paciente.')
      } else if (result.patientRouteId == null) {
        setNoShowFeedback(
          'Cita marcada como inasistencia. Vincule un paciente registrado para registrar la evolución.',
        )
      } else {
        setNoShowFeedback('Cita marcada como inasistencia.')
      }
    } catch {
      setNoShowFeedback('No se pudo marcar la inasistencia.')
    } finally {
      setMarkingNoShow(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`border-b border-slate-200 px-6 py-4 ${procedureClasses.bg100}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Cita programada
              </p>
              <h3
                id="appointment-detail-title"
                className="mt-1 text-xl font-semibold text-slate-900"
              >
                {appointment.patientName}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {format(start, "EEEE d 'de' MMMM yyyy", { locale: es })} ·{' '}
                {format(start, 'HH:mm')} – {format(end, 'HH:mm')}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-white/70 hover:text-slate-600"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        </div>

        {precautionAlert?.active && (
          <div className="border-b border-red-200 px-6 py-3">
            <ClinicalPrecautionAlertBanner alert={precautionAlert} />
          </div>
        )}

        <div className="grid gap-6 px-6 py-5 lg:grid-cols-2">
          <section className="min-w-0 space-y-3">
            <h4 className="text-sm font-semibold text-slate-900">Datos del paciente</h4>

            {patient === undefined ? (
              <p className="text-sm text-slate-500">Cargando información del paciente…</p>
            ) : patient ? (
              <dl className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-2">
                <div className="min-w-0 sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Teléfono
                  </dt>
                  {canEditPhone && onSavePhone && appointment.id != null ? (
                    <div className="mt-1 space-y-2">
                      <input
                        id="appointment-detail-phone"
                        type="tel"
                        value={phone}
                        onChange={(event) => {
                          setPhone(event.target.value)
                          setPhoneFeedback('idle')
                        }}
                        placeholder="Ej: 3001234567"
                        className="input-field"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-slate-500">
                          Se actualizará en la cita y en la historia clínica del paciente.
                        </p>
                        <div className="flex items-center gap-2">
                          {phoneFeedback === 'saved' && (
                            <span className="text-xs font-medium text-emerald-600">
                              Teléfono guardado
                            </span>
                          )}
                          {phoneFeedback === 'history' && (
                            <span className="text-xs font-medium text-emerald-600">
                              Guardado en cita e historia clínica
                            </span>
                          )}
                          {phoneFeedback === 'error' && (
                            <span className="text-xs font-medium text-red-600">
                              No se pudo guardar
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleSavePhone()}
                            disabled={!phoneDirty || savingPhone || !phone.trim()}
                            className="btn-primary text-xs"
                          >
                            {savingPhone ? 'Guardando…' : 'Guardar teléfono'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <dd className="mt-0.5 break-words text-sm leading-snug text-slate-800 [overflow-wrap:anywhere]">
                      {resolvedPhone || '—'}
                    </dd>
                  )}
                </div>
                <InfoRow
                  label="Documento"
                  value={`${patient.documentType} ${patient.documentNumber}`}
                />
                <InfoRow
                  label="Nombre"
                  value={`${patient.firstName} ${patient.lastName}`}
                  fullWidth
                />
                <InfoRow
                  label="Edad"
                  value={
                    age != null && age >= 0
                      ? `${age} años (${format(parseISO(patient.birthDate), 'dd/MM/yyyy')})`
                      : format(parseISO(patient.birthDate), 'dd/MM/yyyy')
                  }
                />
                <InfoRow label="Género" value={GENDER_LABELS[patient.gender]} />
                <InfoRow label="Correo" value={patient.email} fullWidth />
                <InfoRow label="EPS / Aseguradora" value={patient.insurer} />
                <InfoRow label="Ciudad" value={patient.city} />
                <InfoRow label="Dirección" value={patient.address} fullWidth />
              </dl>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-medium">Paciente no vinculado al registro</p>
                <p className="mt-1 text-amber-800">
                  Esta cita usa datos manuales. Registre al paciente para acceder a la historia
                  clínica completa.
                </p>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Teléfono
                    </dt>
                    {canEditPhone && onSavePhone && appointment.id != null ? (
                      <div className="mt-1 space-y-2">
                        <input
                          id="appointment-detail-phone-unlinked"
                          type="tel"
                          value={phone}
                          onChange={(event) => {
                            setPhone(event.target.value)
                            setPhoneFeedback('idle')
                          }}
                          placeholder="Ej: 3001234567"
                          className="input-field"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-amber-800">
                            Vincule un paciente registrado para reflejar el cambio en la historia
                            clínica.
                          </p>
                          <div className="flex items-center gap-2">
                            {phoneFeedback === 'saved' && (
                              <span className="text-xs font-medium text-emerald-600">
                                Teléfono guardado en la cita
                              </span>
                            )}
                            {phoneFeedback === 'error' && (
                              <span className="text-xs font-medium text-red-600">
                                No se pudo guardar
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleSavePhone()}
                              disabled={!phoneDirty || savingPhone || !phone.trim()}
                              className="btn-primary text-xs"
                            >
                              {savingPhone ? 'Guardando…' : 'Guardar teléfono'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <dd className="mt-0.5 break-words text-sm leading-snug text-amber-900 [overflow-wrap:anywhere]">
                        {resolvedPhone || '—'}
                      </dd>
                    )}
                  </div>
                  <InfoRow label="Nombre" value={appointment.patientName} fullWidth />
                </dl>
              </div>
            )}
          </section>

          <section className="min-w-0 space-y-3">
            <h4 className="text-sm font-semibold text-slate-900">Detalle de la cita</h4>
            <dl className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-2">
              <InfoRow label="Procedimiento" value={procedure.label} fullWidth />
              <InfoRow label="Estado" value={APPOINTMENT_STATUS_LABELS[appointment.status]} />
              <InfoRow label="Silla / Consultorio" value={columnName} />
              <InfoRow
                label="Fecha"
                value={format(start, "EEEE d 'de' MMMM yyyy", { locale: es })}
                fullWidth
              />
              <InfoRow
                label="Horario"
                value={`${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`}
              />
            </dl>

            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${procedureClasses.bg100} ${procedureClasses.text700}`}
            >
              <span className={`h-3 w-3 rounded-full ${procedureClasses.dot500}`} />
              Color en agenda: {procedure.label}
            </div>
          </section>
        </div>

        <section className="border-t border-slate-200 px-6 py-5">
          <label className="label-field" htmlFor="appointment-detail-notes">
            Notas de la cita
          </label>
          <textarea
            id="appointment-detail-notes"
            rows={4}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value)
              setNotesFeedback('idle')
            }}
            disabled={!canEditNotes || appointment.id == null}
            placeholder="Escriba observaciones, recordatorios, instrucciones o cualquier detalle relevante…"
            className="input-field mt-1 resize-y"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              {appointment.id == null
                ? 'Guarde la cita primero para poder añadir notas.'
                : 'Las notas quedan asociadas a esta cita en la agenda.'}
            </p>
            {canEditNotes && appointment.id != null && onSaveNotes && (
              <div className="flex items-center gap-2">
                {notesFeedback === 'saved' && (
                  <span className="text-xs font-medium text-emerald-600">Notas guardadas</span>
                )}
                {notesFeedback === 'error' && (
                  <span className="text-xs font-medium text-red-600">No se pudo guardar</span>
                )}
                <button
                  type="button"
                  onClick={() => void handleSaveNotes()}
                  disabled={!notesDirty || savingNotes}
                  className="btn-primary text-xs"
                >
                  {savingNotes ? 'Guardando…' : 'Guardar notas'}
                </button>
              </div>
            )}
          </div>
        </section>

        {canMarkNoShow && onMarkNoShow && (
          <section className="border-t border-red-100 bg-red-50/60 px-6 py-5">
            <h4 className="text-sm font-semibold text-red-900">Inasistencia</h4>
            <p className="mt-1 text-sm text-red-800">
              Marque si el paciente no asistió. La cita cambiará a color{' '}
              <span className="font-medium text-red-700">rojo intenso</span> en la agenda y se
              añadirá una nota en la evolución clínica del paciente registrado.
            </p>
            <label className="label-field mt-3" htmlFor="appointment-no-show-note">
              Detalle adicional (opcional)
            </label>
            <textarea
              id="appointment-no-show-note"
              rows={2}
              value={noShowNote}
              onChange={(event) => setNoShowNote(event.target.value)}
              placeholder="Ej: No respondió llamada, reprogramar en 15 días…"
              className="input-field mt-1 resize-y"
            />
            {noShowFeedback && (
              <p className="mt-2 text-sm font-medium text-red-900">{noShowFeedback}</p>
            )}
            <button
              type="button"
              onClick={() => void handleMarkNoShow()}
              disabled={markingNoShow}
              className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-800 transition hover:bg-red-100"
            >
              {markingNoShow ? 'Registrando…' : 'Marcar inasistencia'}
            </button>
          </section>
        )}

        {appointment.status === 'no_asistio' && (
          <section className="border-t border-red-200 bg-red-50 px-6 py-4">
            <p className="text-sm font-medium text-red-900">
              Esta cita está marcada como <span className="uppercase">inasistencia</span>.
            </p>
            <p className="mt-1 text-sm text-red-800">
              Se muestra en la agenda con color rojo y la anotación quedó pendiente en la evolución
              del paciente (si estaba registrado).
            </p>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex flex-wrap gap-2">
            {appointment.patientPhone && (
              <WhatsAppReminderButton appointment={appointment} size="md" />
            )}

            {canViewClinicalHistory && patientRouteId ? (
              <Link
                to={`/pacientes/${patientRouteId}`}
                className="btn-primary inline-flex items-center gap-2 text-xs"
                onClick={onClose}
              >
                <span aria-hidden>📋</span>
                Ver historia clínica
              </Link>
            ) : (
              canViewClinicalHistory && (
                <span
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-400"
                  title="Vincule la cita a un paciente registrado"
                >
                  <span aria-hidden>📋</span>
                  Historia clínica no disponible
                </span>
              )
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {appointment.status === 'programada' && onConfirm && (
              <button type="button" onClick={onConfirm} className="btn-primary text-xs">
                Confirmar cita
              </button>
            )}
            <button type="button" onClick={onClose} className="btn-secondary text-xs">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

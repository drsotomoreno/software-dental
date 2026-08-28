import { useState, useEffect, type FormEvent } from 'react'
import { format, parseISO } from 'date-fns'
import type { ProcedureType } from '@/constants/procedures'
import {
  PROCEDURE_TYPE_OPTIONS,
  PROCEDURE_TAILWIND_CLASSES,
  minutesToTime,
  timeToMinutes,
} from '@/constants/procedures'
import type { Appointment, CreateAppointmentInput, ScheduleColumn } from '@/types/appointment'
import {
  formatPatientFullName,
  getPatientRouteId,
  usePatientsList,
} from '@/hooks/usePatientsList'
import { PatientSearchInput } from './PatientSearchInput'

export interface SlotSelection {
  columnId: string
  date: string
  startTime: string
}

interface CreateAppointmentModalProps {
  isOpen: boolean
  selection: SlotSelection | null
  editingAppointment?: Appointment | null
  columns: ScheduleColumn[]
  onClose: () => void
  onSubmit: (data: CreateAppointmentInput) => Promise<void>
}

export function CreateAppointmentModal({
  isOpen,
  selection,
  editingAppointment = null,
  columns,
  onClose,
  onSubmit,
}: CreateAppointmentModalProps) {
  const { patients, isLoading: patientsLoading } = usePatientsList()
  const [patientQuery, setPatientQuery] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [patientId, setPatientId] = useState<string | undefined>()
  const [procedureType, setProcedureType] = useState<ProcedureType>('valoracion')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('09:30')
  const [columnId, setColumnId] = useState('')
  const [appointmentDate, setAppointmentDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return

    if (editingAppointment) {
      setPatientQuery(editingAppointment.patientName)
      setPatientPhone(editingAppointment.patientPhone ?? '')
      setPatientId(editingAppointment.patientId)
      setProcedureType(editingAppointment.procedureType)
      setAppointmentDate(editingAppointment.startTime.slice(0, 10))
      setStartTime(format(parseISO(editingAppointment.startTime), 'HH:mm'))
      setEndTime(format(parseISO(editingAppointment.endTime), 'HH:mm'))
      setColumnId(editingAppointment.columnId)
      setNotes(editingAppointment.notes ?? '')
      setError('')
      return
    }

    setPatientQuery('')
    setPatientPhone('')
    setPatientId(undefined)
    setProcedureType('valoracion')
    setAppointmentDate(selection?.date ?? new Date().toISOString().slice(0, 10))
    setStartTime(selection?.startTime ?? '09:00')
    const endMin = timeToMinutes(selection?.startTime ?? '09:00') + 30
    setEndTime(minutesToTime(endMin))
    setColumnId(selection?.columnId ?? columns[0]?.id ?? '')
    setNotes('')
    setError('')
  }, [isOpen, selection, editingAppointment, columns])

  const handleSelectPatient = (patient: (typeof patients)[number]) => {
    setPatientId(getPatientRouteId(patient))
    setPatientQuery(formatPatientFullName(patient))
    setPatientPhone(patient.phone)
  }

  const handleClearPatient = () => {
    setPatientId(undefined)
  }

  const handleQueryChange = (query: string) => {
    setPatientQuery(query)
    if (!patientId) return
    const selected = patients.find((patient) => getPatientRouteId(patient) === patientId)
    if (!selected || formatPatientFullName(selected) !== query.trim()) {
      setPatientId(undefined)
    }
  }

  if (!isOpen) return null

  const selectedColor =
    PROCEDURE_TAILWIND_CLASSES[
      PROCEDURE_TYPE_OPTIONS.find((o) => o.value === procedureType)!.color
    ]

  const resolvedPatientName = patientQuery.trim()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!resolvedPatientName) {
      setError('Escriba el apellido o nombre del paciente.')
      return
    }
    if (!patientPhone.trim()) {
      setError('El teléfono es obligatorio para recordatorios por WhatsApp.')
      return
    }
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      setError('La hora de fin debe ser posterior a la de inicio.')
      return
    }

    setSaving(true)
    try {
      await onSubmit({
        patientName: resolvedPatientName,
        patientPhone: patientPhone.trim(),
        patientId,
        procedureType,
        startTime: `${appointmentDate}T${startTime}:00`,
        endTime: `${appointmentDate}T${endTime}:00`,
        columnId,
        notes: notes.trim() || undefined,
      })
      onClose()
    } catch {
      setError('Error al guardar la cita.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">
          {editingAppointment ? 'Reasignar cita' : 'Nueva cita'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <PatientSearchInput
            patients={patients}
            isLoading={patientsLoading}
            query={patientQuery}
            selectedPatientId={patientId}
            onQueryChange={handleQueryChange}
            onSelectPatient={handleSelectPatient}
            onClearPatient={handleClearPatient}
          />

          <div>
            <label className="label-field" htmlFor="appointment-patient-phone">
              Teléfono / WhatsApp *
            </label>
            <input
              id="appointment-patient-phone"
              type="tel"
              value={patientPhone}
              onChange={(e) => setPatientPhone(e.target.value)}
              className="input-field"
              placeholder="Ej: 3001234567"
            />
            <p className="mt-1 text-xs text-slate-500">
              Se autocompleta al elegir un paciente registrado.
            </p>
          </div>

          <div>
            <label className="label-field">Tipo de procedimiento *</label>
            <select
              value={procedureType}
              onChange={(e) => setProcedureType(e.target.value as ProcedureType)}
              className={`input-field border-l-4 ${selectedColor.border500}`}
            >
              {PROCEDURE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div
              className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${selectedColor.bg100} ${selectedColor.text700}`}
            >
              <span className={`h-3 w-3 rounded-full ${selectedColor.dot500}`} />
              Vista previa del color en agenda
            </div>
          </div>

          <div>
            <label className="label-field">Silla / Consultorio *</label>
            <select
              value={columnId}
              onChange={(e) => setColumnId(e.target.value)}
              className="input-field"
            >
              {columns.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-field" htmlFor="appointment-date">
              Fecha *
            </label>
            <input
              id="appointment-date"
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              className="input-field"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-field">Hora inicio</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-field">Hora fin</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="label-field">Notas</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field resize-y"
              placeholder="Observaciones..."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Guardando...' : editingAppointment ? 'Guardar cita' : 'Programar cita'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

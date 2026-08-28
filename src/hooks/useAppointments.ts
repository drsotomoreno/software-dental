import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import type { Appointment, CreateAppointmentInput } from '@/types/appointment'
import { syncCitasToLocalStorage } from '@/utils/agendaStorage'
import { syncAppointmentPatientPhone } from '@/utils/syncAppointmentPatientPhone'

function filterByDateRange(appointments: Appointment[], startDate: string, endDate: string) {
  return appointments.filter((apt) => {
    const day = apt.startTime.slice(0, 10)
    return day >= startDate && day <= endDate
  })
}

function filterBySingleDate(appointments: Appointment[], date: string) {
  return appointments.filter((apt) => apt.startTime.startsWith(date))
}

async function mutateAppointment(id: number | string, patch: Partial<Appointment>) {
  await db.appointments.update(id, {
    ...patch,
    updatedAt: new Date().toISOString(),
  })
  await syncCitasToLocalStorage()
}

function createAppointmentOps() {
  const createAppointment = async (input: CreateAppointmentInput) => {
    const now = new Date().toISOString()
    await db.appointments.add({
      ...input,
      status: 'programada',
      createdAt: now,
      updatedAt: now,
    })
    await syncCitasToLocalStorage()
  }

  const updateAppointment = async (id: number | string, input: CreateAppointmentInput) => {
    const existing = await db.appointments.get(id)
    if (!existing) throw new Error('Cita no encontrada')

    await db.appointments.update(id, {
      ...input,
      status: existing.status,
      updatedAt: new Date().toISOString(),
    })
    await syncCitasToLocalStorage()
  }

  const updateAppointmentStatus = async (id: number | string, status: Appointment['status']) => {
    await mutateAppointment(id, { status })
  }

  const updateAppointmentNotes = async (id: number | string, notes: string) => {
    await mutateAppointment(id, { notes: notes.trim() || undefined })
  }

  const updateAppointmentPatientPhone = async (
    appointment: Appointment,
    phone: string,
  ) => syncAppointmentPatientPhone(appointment, phone)

  const deleteAppointment = async (id: number | string) => {
    await db.appointments.delete(id)
    await syncCitasToLocalStorage()
  }

  return {
    createAppointment,
    updateAppointment,
    updateAppointmentStatus,
    updateAppointmentNotes,
    updateAppointmentPatientPhone,
    deleteAppointment,
  }
}

export function useAppointments(date: string) {
  const appointments = useLiveQuery(async () => {
    const all = await db.appointments.orderBy('startTime').toArray()
    return filterBySingleDate(all, date)
  }, [date])

  const ops = createAppointmentOps()

  return {
    appointments: appointments ?? [],
    isLoading: appointments === undefined,
    ...ops,
  }
}

export function useAppointmentsRange(startDate: string, endDate: string) {
  const appointments = useLiveQuery(async () => {
    const all = await db.appointments.orderBy('startTime').toArray()
    return filterByDateRange(all, startDate, endDate)
  }, [startDate, endDate])

  const ops = createAppointmentOps()

  return {
    appointments: appointments ?? [],
    isLoading: appointments === undefined,
    ...ops,
  }
}

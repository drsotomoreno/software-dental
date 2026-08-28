import { db } from '@/db/database'
import type { Appointment, CreateAppointmentInput } from '@/types/appointment'
import { minutesToTime, timeToMinutes } from '@/constants/procedures'
import { renderCitas, syncCitasToLocalStorage } from './agendaStorage'

export const AGENDA_CLIPBOARD_EVENT = 'agenda:clipboard-change'

export type AgendaClipboardMode = 'cut' | 'copy'

export interface AgendaClipboardEntry {
  mode: AgendaClipboardMode
  appointment: Appointment
  storedAt: string
}

export interface PasteTarget {
  date: string
  startTime: string
  columnId: string
}

let sessionClipboard: AgendaClipboardEntry | null = null

function notifyClipboardChange(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(AGENDA_CLIPBOARD_EVENT))
}

export function getAgendaClipboard(): AgendaClipboardEntry | null {
  return sessionClipboard
}

export function hasAgendaClipboard(): boolean {
  return sessionClipboard !== null
}

export function clearAgendaClipboard(): void {
  sessionClipboard = null
  notifyClipboardChange()
}

function appointmentDurationMinutes(appointment: Appointment): number {
  const start = timeToMinutes(appointment.startTime.slice(11, 16))
  const end = timeToMinutes(appointment.endTime.slice(11, 16))
  return Math.max(30, end - start)
}

function buildPasteInput(target: PasteTarget, source: Appointment): CreateAppointmentInput {
  const duration = appointmentDurationMinutes(source)
  const startMinutes = timeToMinutes(target.startTime)
  const endTime = minutesToTime(startMinutes + duration)

  return {
    patientName: source.patientName,
    patientPhone: source.patientPhone,
    patientId: source.patientId,
    procedureType: source.procedureType,
    columnId: target.columnId,
    notes: source.notes,
    startTime: `${target.date}T${target.startTime}:00`,
    endTime: `${target.date}T${endTime}:00`,
  }
}

/** ✂️ Cortar: guarda en memoria y elimina de la ubicación actual. */
export async function cortarCita(appointment: Appointment): Promise<boolean> {
  if (appointment.id == null) return false

  sessionClipboard = {
    mode: 'cut',
    appointment: { ...appointment },
    storedAt: new Date().toISOString(),
  }

  await db.appointments.delete(appointment.id)
  await syncCitasToLocalStorage()
  notifyClipboardChange()
  renderCitas()
  return true
}

/** 📋 Copiar: guarda copia en memoria sin eliminar el original. */
export function copiarCita(appointment: Appointment): void {
  sessionClipboard = {
    mode: 'copy',
    appointment: { ...appointment },
    storedAt: new Date().toISOString(),
  }
  notifyClipboardChange()
}

/** 📌 Pegar en fecha/hora destino. */
export async function pegarCita(target: PasteTarget): Promise<boolean> {
  if (!sessionClipboard) return false

  const { appointment, mode } = sessionClipboard
  const modeLabel = mode === 'cut' ? 'cortada' : 'copiada'

  const confirmed = window.confirm(
    `¿Pegar cita ${modeLabel} de "${appointment.patientName}" el ${target.date} a las ${target.startTime}?`,
  )
  if (!confirmed) return false

  const input = buildPasteInput(target, appointment)
  const now = new Date().toISOString()

  await db.appointments.add({
    ...input,
    status: 'programada',
    createdAt: now,
    updatedAt: now,
  })

  if (mode === 'cut') {
    clearAgendaClipboard()
  }

  await syncCitasToLocalStorage()
  renderCitas()
  return true
}

export function setupAgendaClipboardGlobals(): void {
  if (typeof window === 'undefined') return

  const win = window as Window & {
    cortarCita?: typeof cortarCita
    copiarCita?: typeof copiarCita
    pegarCita?: typeof pegarCita
    getCitaPortapapeles?: typeof getAgendaClipboard
    limpiarCitaPortapapeles?: typeof clearAgendaClipboard
  }

  win.cortarCita = cortarCita
  win.copiarCita = copiarCita
  win.pegarCita = pegarCita
  win.getCitaPortapapeles = getAgendaClipboard
  win.limpiarCitaPortapapeles = clearAgendaClipboard
}

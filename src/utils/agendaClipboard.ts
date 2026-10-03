import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { db } from '@/db/database'
import type { Appointment, CreateAppointmentInput } from '@/types/appointment'
import { minutesToTime, timeToMinutes } from '@/constants/procedures'
import { renderCitas, syncCitasToLocalStorage, tombstoneAppointment } from './agendaStorage'

export const AGENDA_CLIPBOARD_EVENT = 'agenda:clipboard-change'

export type AgendaClipboardMode = 'cut' | 'copy'

export interface AgendaClipboardEntry {
  mode: AgendaClipboardMode
  appointment: Appointment
  appointments: Appointment[]
  anchor: PasteTarget
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

function rememberAppointments(
  mode: AgendaClipboardMode,
  appointments: Appointment[],
  anchor: PasteTarget,
): void {
  const [first] = appointments
  if (!first) return
  sessionClipboard = {
    mode,
    appointment: { ...first },
    appointments: appointments.map((appointment) => ({ ...appointment })),
    anchor,
    storedAt: new Date().toISOString(),
  }
  notifyClipboardChange()
}

function appointmentAnchor(appointment: Appointment): PasteTarget {
  return {
    date: appointment.startTime.slice(0, 10),
    startTime: appointment.startTime.slice(11, 16),
    columnId: appointment.columnId,
  }
}

/** ✂️ Cortar: guarda en memoria y elimina de la ubicación actual. */
export async function cortarCita(appointment: Appointment): Promise<boolean> {
  return cortarCitas([appointment], appointmentAnchor(appointment))
}

/** Corta todas las citas de las casillas elegidas. */
export async function cortarCitas(
  appointments: Appointment[],
  anchor: PasteTarget,
): Promise<boolean> {
  const stored = appointments.filter((appointment) => appointment.id != null)
  if (stored.length === 0) return false

  rememberAppointments('cut', stored, anchor)
  for (const appointment of stored) {
    await tombstoneAppointment(appointment.id!)
  }
  await syncCitasToLocalStorage()
  renderCitas()
  return true
}

/** 📋 Copiar: guarda copia en memoria sin eliminar el original. */
export function copiarCita(appointment: Appointment): void {
  copiarCitas([appointment], appointmentAnchor(appointment))
}

/** Copia las citas de las casillas elegidas. */
export function copiarCitas(appointments: Appointment[], anchor: PasteTarget): void {
  if (appointments.length === 0) return
  rememberAppointments('copy', appointments, anchor)
}

export function pasteInputsForTarget(
  entry: AgendaClipboardEntry,
  target: PasteTarget,
  columnIds: string[],
): CreateAppointmentInput[] {
  const appointments = entry.appointments?.length ? entry.appointments : [entry.appointment]
  const anchor = entry.anchor ?? appointmentAnchor(entry.appointment)
  const dayShift = differenceInCalendarDays(
    parseISO(`${target.date}T12:00:00`),
    parseISO(`${anchor.date}T12:00:00`),
  )
  const minuteShift = timeToMinutes(target.startTime) - timeToMinutes(anchor.startTime)
  const anchorColumn = columnIds.indexOf(anchor.columnId)
  const targetColumn = columnIds.indexOf(target.columnId)

  return appointments.map((appointment) => {
    const startMinutes = timeToMinutes(appointment.startTime.slice(11, 16))
    const duration = appointmentDurationMinutes(appointment)
    const nextStart = Math.max(0, startMinutes + minuteShift)
    const sourceDay = parseISO(`${appointment.startTime.slice(0, 10)}T12:00:00`)
    const nextDate = format(addDays(sourceDay, dayShift), 'yyyy-MM-dd')
    const sourceColumn = columnIds.indexOf(appointment.columnId)
    let columnId = target.columnId
    if (anchorColumn >= 0 && targetColumn >= 0 && sourceColumn >= 0) {
      columnId = columnIds[targetColumn + (sourceColumn - anchorColumn)] ?? target.columnId
    }
    return {
      patientName: appointment.patientName,
      patientPhone: appointment.patientPhone,
      patientId: appointment.patientId,
      procedureType: appointment.procedureType,
      columnId,
      notes: appointment.notes,
      startTime: `${nextDate}T${minutesToTime(nextStart)}:00`,
      endTime: `${nextDate}T${minutesToTime(nextStart + duration)}:00`,
    }
  })
}

async function writePastedAppointments(inputs: CreateAppointmentInput[]): Promise<void> {
  const now = new Date().toISOString()
  await db.appointments.bulkAdd(
    inputs.map((input) => ({
      ...input,
      status: 'programada' as const,
      createdAt: now,
      updatedAt: now,
    })),
  )
  await syncCitasToLocalStorage()
  renderCitas()
}

/** Pega las citas del portapapeles a partir de la casilla indicada. */
export async function pegarCitasEn(
  target: PasteTarget,
  columnIds: string[],
): Promise<boolean> {
  if (!sessionClipboard) return false
  const inputs = pasteInputsForTarget(sessionClipboard, target, columnIds)
  if (inputs.length === 0) return false
  await writePastedAppointments(inputs)
  if (sessionClipboard.mode === 'cut') clearAgendaClipboard()
  return true
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

  const columnIds = [target.columnId]
  if (sessionClipboard.anchor?.columnId && sessionClipboard.anchor.columnId !== target.columnId) {
    columnIds.unshift(sessionClipboard.anchor.columnId)
  }
  const inputs = pasteInputsForTarget(sessionClipboard, target, columnIds)
  await writePastedAppointments(inputs.length > 0 ? inputs : [buildPasteInput(target, appointment)])
  if (mode === 'cut') clearAgendaClipboard()
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
